// ====================================================
// GROQ AI HELPER
// ====================================================

async function callGroq(messages, jsonMode = false, maxTokens = 800, email = 'telegram_user') {
  const key = process.env.API_KEY_TEXT || process.env.NVIDIA_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    console.error('[groq.js] API_KEY_TEXT not set');
    throw new Error('Layanan AI sedang tidak tersedia. Coba lagi nanti.');
  }

  const model = process.env.TEXT_MODEL || 'gpt-4o-mini';
  const endpoint = process.env.TEXT_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';

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
    const cleanName = text.split(',')[0].trim();
    const dbMatches = await searchFoodDatabase(cleanName);
    if (dbMatches && dbMatches.length > 0) {
      referenceContext = "\n\n== DATA TKPI DITEMUKAN (Gunakan nilai per 100g MATANG ini sebagai prioritas utama): ==\n";
      dbMatches.forEach(item => {
        referenceContext += `- ${item.name}: ${item.cal} kcal | P:${item.protein}g | K:${item.carbs}g | L:${item.fat}g | Serat:${item.fiber}g | Gula:${item.sugar}g | Sodium:${item.sodium}mg | Kalsium:${item.calcium}mg | Besi:${item.iron}mg | VitC:${item.vitC}mg | VitD:${item.vitD}mcg | Zinc:${item.zinc}mg\n`;
      });
    }
  } catch (dbErr) {
    console.error('[groq.js] DB search error:', dbErr);
  }

  const systemMsg = {
    role: 'system',
    content: `Kamu adalah mesin kalkulator gizi presisi berstandar internasional (USDA FoodData Central & TKPI Indonesia Kemenkes 2019).
Tugasmu HANYA menghitung nilai gizi. Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
WAJIB: Jawab HANYA dengan JSON valid. DILARANG teks/markdown di luar JSON.`
  };

  const prompt = `== INPUT MAKANAN ==
${text}

== STANDAR PORSI KULINER INDONESIA ==
- Nasi Putih/Merah: 1 centong=~100g (130 kcal). 1 piring warteg/padang=~175g (230 kcal).
- Mie Goreng/Ayam/Pedas: 1 porsi=~170g (~400 kcal | Karbo:60g | Protein:12g | Lemak:15g | Sodium:1200–1600mg).
- Tempe/Tahu Goreng: 1 potong=~45g (~90 kcal, 6g protein).
- Ayam Goreng/Bakar: 1 potong=~110g (~200 kcal, 28g protein).
- Telur Ceplok/Dadar: 1 butir=~55g (~100 kcal). Rebus: ~50g (~78 kcal).
- Daging Sapi/Rendang: 1 potong=~65g (~185 kcal, 20g protein).
- Gorengan (Bakwan dll): 1 biji=~50g (~160 kcal, 12g lemak).

== DATABASE REFERENSI WAJIB (Per 100g MATANG): ==${referenceContext}
- Nasi Putih: 130 kcal|K:28g|P:2.7g|L:0.3g|Serat:0.4g|Gula:0.1g|Na:1mg|Ca:10mg|Fe:1.2mg|VitC:0|VitD:0|Zn:0.5mg
- Dada Ayam Matang: 165 kcal|K:0g|P:31g|L:3.6g|Serat:0g|Gula:0g|Na:74mg|Ca:15mg|Fe:1mg|VitC:0|VitD:0|Zn:1mg
- Paha Ayam Matang: 209 kcal|K:0g|P:26g|L:10.9g|Serat:0g|Gula:0g|Na:84mg|Ca:11mg|Fe:1.3mg|VitC:0|VitD:0.1|Zn:2.7mg
- Telur Rebus (per butir 50g): 78 kcal|K:0.6g|P:6.3g|L:5.3g|Serat:0g|Gula:0.6g|Na:62mg|Ca:25mg|Fe:0.9mg|VitC:0|VitD:1.1|Zn:0.6mg
- Tempe: 193 kcal|K:8.7g|P:20.7g|L:11g|Serat:1.4g|Gula:0g|Na:9mg|Ca:111mg|Fe:2.7mg|VitC:0|VitD:0|Zn:1.8mg
- Tahu Putih: 76 kcal|K:1.9g|P:8g|L:4.2g|Serat:0.3g|Gula:0g|Na:7mg|Ca:350mg|Fe:5.4mg|VitC:0.2|VitD:0|Zn:0.8mg
- Minyak Goreng (10g/1sdm): 88 kcal|K:0g|P:0g|L:10g|Na:0mg

== INSTRUKSI KALKULASI KETAT ==
1. Konversi porsi ke gram MATANG. Gunakan standar Indonesia di atas.
2. Hitung setiap bahan: (nilai per 100g) × (gram / 100) untuk SEMUA makro DAN MIKRO.
3. MULTI-BAHAN: Hitung TERPISAH lalu JUMLAHKAN.
4. MULTI-PORSI: Kalikan semua nilai dengan jumlah porsi.
5. Makanan berbasis mie/nasi/tepung WAJIB punya Karbo > 0.
6. SODIUM: Mie pedas/resto = 1200–1600mg/porsi. Sup/Soto = 900–1400mg. Bumbu/sambal = 500–900mg.
7. MINYAK: Deep Fried → +10g lemak(+90kcal)/100g. Tumis → +5g lemak(+45kcal)/porsi. Santan → +8g lemak(+72kcal)/100g. Air Fryer/Rebus/Kukus → 0 tambahan lemak.
8. VERIFIKASI: cal HARUS ≈ (protein×4)+(carbs×4)+(fat×9) ±5%.
9. Jawab HANYA JSON (tanpa teks/markdown):
{"name":"nama makanan","portion":"berat gram total","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"rincian bahan & gram masing-masing"}
Bulatkan 1 desimal.`;

  const content = await callGroq([systemMsg, { role: 'user', content: prompt }], true, 1800, email);
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

