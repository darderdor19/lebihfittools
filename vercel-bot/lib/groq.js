// ====================================================
// GROQ AI HELPER
// ====================================================

async function callGroq(messages, jsonMode = false, maxTokens = 800, email = 'telegram_user') {
  const key = process.env.API_KEY_TEXT || process.env.NVIDIA_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    console.error('[groq.js] API_KEY_TEXT not set');
    throw new Error('Layanan AI sedang tidak tersedia. Coba lagi nanti.');
  }

  const model = process.env.TEXT_MODEL || 'deepseek-v4-flash';
  const endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const body = {
    model: model,
    messages,
    max_tokens: maxTokens,
    temperature: 0
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    console.error('[groq.js] API error response:', data?.error?.message || 'empty choices');
    const rawMsg = data?.error?.message || '';
    if (rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('rate') || res.status === 429) {
      throw new Error('Sistem AI sedang banyak permintaan. Coba lagi sebentar.');
    }
    throw new Error('AI tidak memberikan respons. Silakan coba lagi.');
  }

  // Warn if response was cut off (truncated)
  const finishReason = data.choices[0]?.finish_reason;
  if (finishReason === 'length') {
    console.warn('[groq.js] TRUNCATED response! finish_reason=length, maxTokens was:', maxTokens);
  }

  // Log token usage
  try {
    const usage = data.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const { logTokenUsage } = require('./firebase');
    logTokenUsage(email, 'manual_food_ai', promptTokens, completionTokens, model).catch(console.error);
  } catch (logErr) {
    console.error('[groq.js] Token logging failed:', logErr);
  }

  return data.choices[0].message.content;
}

/**
 * Analyze food text → returns nutrition JSON object
 * Same prompt as GAS version
 */
async function analyzeFood(text, email = 'telegram_user') {
  let referenceContext = "";
  try {
    const { searchFoodDatabase } = require('./foodSearch');
    // Extract name before comma/porsi if format is "Nasi, porsi: 1"
    const cleanName = text.split(',')[0].trim();
    const dbMatches = await searchFoodDatabase(cleanName);
    if (dbMatches && dbMatches.length > 0) {
      referenceContext = "\n\n== DATABASE REFERENCE DITEMUKAN (Gunakan angka gizi per 100g ini secara ketat untuk kalkulasi gizi makanan user): ==\n";
      dbMatches.forEach(item => {
        referenceContext += `- ${item.name}: cal ${item.cal} kcal | protein ${item.protein}g | carbs ${item.carbs}g | fat ${item.fat}g | fiber ${item.fiber}g | sugar ${item.sugar}g | sodium ${item.sodium}mg | calcium ${item.calcium}mg | iron ${item.iron}mg | vitC ${item.vitC}mg | vitD ${item.vitD}mcg | zinc ${item.zinc}mg\n`;
      });
    }
  } catch (dbErr) {
    console.error('[groq.js] DB search error:', dbErr);
  }

  const prompt = `Kamu adalah kalkulator nutrisi makanan berstandar internasional (USDA FoodData Central & TKPI Indonesia).
Gunakan Atwater Factors untuk kalori: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
Referensi kecukupan vitamin/mineral menggunakan AKG Indonesia (RDA Indonesia).

== BAHAN UTAMA & PORSI ==
Nama Makanan / Deskripsi: "${text}"

== PRIORITAS DATABASE (Per 100g — cek urutan ini): ==${referenceContext}
Jika tidak ada di database di atas, gunakan data USDA FoodData Central atau TKPI Indonesia.

== ATURAN KALKULASI KETAT ==
1. Ekstrak berat tiap bahan dalam gram. Jika tidak disebutkan, gunakan estimasi porsi standar Indonesia.
2. Mentah vs Matang: kata "fillet/mentah/raw" = data mentah; selain itu asumsikan matang.
3. Air Fryer/Oven tanpa minyak = TANPA penambahan lemak/kalori minyak.
4. MULTI-BAHAN: hitung tiap bahan TERPISAH lalu JUMLAHKAN — JANGAN kalikan total berat dengan 1 gizi saja.
5. Perkalian: (Nilai per 100g) × (Berat / 100). Lakukan untuk SEMUA makro DAN mikro.
6. Minyak goreng/margarin nyata: tambahkan +88 kcal & +10g lemak per 10g/1 sdm.
7. JANGAN biarkan nilai mikro (sodium, calcium, iron, vitC, vitD, zinc) = 0 kecuali memang 0.
8. Jawab HANYA JSON valid tanpa teks/markdown:
{"name":"nama makanan","portion":"estimasi gram","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Bulatkan 1 desimal.`;
  const content = await callGroq([{ role: 'user', content: prompt }], true, 1200, email);
  try {
    return JSON.parse(content);
  } catch (e) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw e;
  }
}

/**
 * Generate daily AI analysis text for daily email
 */
async function generateDailyAnalysis(logs, profile, email = 'telegram_user') {
  const total = sumNutrients(logs);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);

  let prompt = `Analisis makanan hari ini untuk user:\nTarget Kalori: ${calTarget} kcal.\nMakanan hari ini (${logs.length} item):\n`;
  for (const log of logs) {
    prompt += `- ${log.name}: ${log.cal} kcal (P: ${log.protein || 0}g, K: ${log.carbs || 0}g, L: ${log.fat || 0}g)\n`;
  }
  prompt += `Total Gizi Makro: Kalori ${Math.round(total.cal)} kcal, Protein ${total.protein.toFixed(1)}g, Karbo ${total.carbs.toFixed(1)}g, Lemak ${total.fat.toFixed(1)}g.\n`;
  prompt += `Total Gizi Mikro: Serat ${total.fiber.toFixed(1)}g, Gula ${total.sugar.toFixed(1)}g, Sodium ${total.sodium.toFixed(1)}mg, Kalsium ${total.calcium.toFixed(1)}mg, Zat Besi ${total.iron.toFixed(1)}mg, Vit C ${total.vitC.toFixed(1)}mg, Vit D ${total.vitD.toFixed(1)}mcg, Zinc ${total.zinc.toFixed(1)}mg.\n\n`;
  prompt += `Berikan evaluasi mengenai konsumsi makro dan mikro nutrisi hari ini, serta berikan saran praktis/konkrit makro dan mikro nutrisi apa yang sebaiknya dilakukan besok untuk mencapai target kebugaran mereka. Jawab dalam bahasa Indonesia, maksimal 4 kalimat. Format jawaban langsung teks analisis saja, tanpa kata pengantar atau penutup.`;

  return await callGroq([{ role: 'user', content: prompt }], false, 800, email);
}

/**
 * Calculate fitness targets using AI
 * Same prompt as the web app's calcAI
 */
async function recalculateTargets(profile, email = 'telegram_user') {
  const { tb, bb, usia, gender, aktivitas, target, catatan } = profile;
  const prompt = `Kamu adalah ahli gizi dan fitness. Berdasarkan data berikut, hitung kebutuhan nutrisi harian:
- Tinggi: ${tb}cm, Berat: ${bb}kg, Usia: ${usia}th, Jenis Kelamin: ${gender}
- Aktivitas: ${aktivitas}, Target: ${target}
- Catatan: ${catatan || '-'}
- Target Berat Badan: ${profile.targetBb || profile.bb || '?'} kg
- Body Fat saat ini: ${profile.bodyFat || '?'} %

Jawab dalam JSON format:
{"cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"bmr":0,"tdee":0,"notes":"penjelasan singkat dalam bahasa Indonesia max 3 kalimat"}
Semua angka dalam satuan standar. Jawab HANYA dengan JSON valid.`;

  const raw = await callGroq([{ role: 'user', content: prompt }], true, 400, email);
  if (!raw) throw new Error("AI tidak mengembalikan data.");
  try {
    if (typeof raw === 'string') {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return JSON.parse(raw);
    }
    return raw;
  } catch (e) {
    console.error("Parse Error. Raw data:", raw);
    throw new Error("Gagal membaca hasil kalkulasi (Format JSON tidak valid).");
  }
}

function sumNutrients(items) {
  const acc = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, calcium: 0, iron: 0, vitC: 0, vitD: 0, zinc: 0 };
  const keys = Object.keys(acc);
  for (const item of items) {
    for (const k of keys) acc[k] += item[k] || 0;
  }
  return acc;
}

module.exports = { analyzeFood, generateDailyAnalysis, sumNutrients, recalculateTargets };

