// ====================================================
// GROQ AI HELPER
// ====================================================

async function callGroq(messages, jsonMode = false, maxTokens = 400) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not set');

  const body = {
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: maxTokens,
    temperature: 0
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error('Groq API error: ' + JSON.stringify(data));
  }
  return data.choices[0].message.content;
}

/**
 * Analyze food text → returns nutrition JSON object
 * Same prompt as GAS version
 */
async function analyzeFood(text) {
  const prompt = `Kamu adalah mesin kalkulator gizi dan database nutrisi makanan yang sangat akurat, konsisten, dan ilmiah.
Tugas kamu adalah menghitung kandungan nutrisi makro dan mikro secara presisi berdasarkan data standar per 100g.

== BAHAN UTAMA & PORSI / DESKRIPSI ==
Nama Makanan / Deskripsi: "${text}"

== DATABASE REFERENCE (Per 100g): ==
- Singkong (mentah/rebus): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
- Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
- Dada Ayam (rebus/panggang, matang): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
- Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
- Minyak Goreng / Margarin (per 10g / 1 sdm): 88 kcal | Karbo: 0g | Protein: 0g | Lemak: 10g | Serat: 0g | Gula: 0g | Sodium: 0mg | Kalsium: 0mg | Besi: 0mg | VitC: 0mg | VitD: 0mcg | Zinc: 0mg

== INSTRUKSI KALKULASI SECARA KETAT ==
1. Ekstrak berat makanan dalam gram (misal: "500gram" -> 500g, "1 kg" -> 1000g). Jika tidak disebutkan beratnya, estimasikan berat standar (misal: 1 piring nasi = 200g, 1 potong ayam = 100g).
2. Lakukan perkalian matematis secara eksak: (Berat Gizi per 100g) * (Total Berat / 100).
   - CONTOH: Jika pengguna memasukkan "Singkong 500 gram rebus tanpa minyak", maka faktor pengalinya adalah 5.0.
     - Kalori = 160 * 5.0 = 800 kcal
     - Karbohidrat = 38 * 5.0 = 190g
     - Protein = 1.3 * 5.0 = 6.5g
     - Lemak = 0.3 * 5.0 = 1.5g
     - Serat = 1.8 * 5.0 = 9.0g
     - Gula = 1.7 * 5.0 = 8.5g
     - Sodium = 14 * 5.0 = 70mg
     - Kalsium = 16 * 5.0 = 80mg
     - Besi = 0.3 * 5.0 = 1.5mg
     - Vit C = 20 * 5.0 = 100mg
     - Vit D = 0 * 5.0 = 0mcg
     - Zinc = 0.3 * 5.0 = 1.5mg
3. Jika terdapat minyak goreng atau bumbu berminyak dalam deskripsi cara masak, tambahkan kalori and lemak secara proporsional (contoh: digoreng -> tambahkan 1 sdm / 10g minyak = +88 kcal dan +10g lemak).
4. Untuk makanan lain yang tidak ada di daftar di atas, gunakan nilai gizi resmi per 100g dari USDA secara logis dan lakukan perkalian berat yang sama secara ketat.
5. Jawab HANYA dengan JSON valid dengan format berikut, tanpa penjelasan teks di luar JSON, tanpa markdown:
{"name":"nama makanan","portion":"estimasi porsi/berat","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Semua nilai numerik dibulatkan ke 1 angka di belakang koma (misal: 6.5).`;
  const content = await callGroq([{ role: 'user', content: prompt }], true, 600);
  return JSON.parse(content);
}

/**
 * Generate daily AI analysis text for daily email
 */
async function generateDailyAnalysis(logs, profile) {
  const total = sumNutrients(logs);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);

  let prompt = `Analisis makanan hari ini untuk user:\nTarget Kalori: ${calTarget} kcal.\nMakanan hari ini (${logs.length} item):\n`;
  for (const log of logs) {
    prompt += `- ${log.name}: ${log.cal} kcal (P: ${log.protein || 0}g, K: ${log.carbs || 0}g, L: ${log.fat || 0}g)\n`;
  }
  prompt += `Total Gizi Makro: Kalori ${Math.round(total.cal)} kcal, Protein ${total.protein.toFixed(1)}g, Karbo ${total.carbs.toFixed(1)}g, Lemak ${total.fat.toFixed(1)}g.\n`;
  prompt += `Total Gizi Mikro: Serat ${total.fiber.toFixed(1)}g, Gula ${total.sugar.toFixed(1)}g, Sodium ${total.sodium.toFixed(1)}mg, Kalsium ${total.calcium.toFixed(1)}mg, Zat Besi ${total.iron.toFixed(1)}mg, Vit C ${total.vitC.toFixed(1)}mg, Vit D ${total.vitD.toFixed(1)}mcg, Zinc ${total.zinc.toFixed(1)}mg.\n\n`;
  prompt += `Berikan evaluasi mengenai konsumsi makro dan mikro nutrisi hari ini, serta berikan saran praktis/konkrit makro dan mikro nutrisi apa yang sebaiknya dilakukan besok untuk mencapai target kebugaran mereka. Jawab dalam bahasa Indonesia, maksimal 4 kalimat. Format jawaban langsung teks analisis saja, tanpa kata pengantar atau penutup.`;

  return await callGroq([{ role: 'user', content: prompt }], false, 300);
}

/**
 * Calculate fitness targets using AI
 * Same prompt as the web app's calcAI
 */
async function recalculateTargets(profile) {
  const { tb, bb, usia, gender, aktivitas, target, catatan } = profile;
  const prompt = `Kamu adalah ahli gizi dan fitness. Berdasarkan data berikut, hitung kebutuhan nutrisi harian:
- Tinggi: ${tb}cm, Berat: ${bb}kg, Usia: ${usia}th, Jenis Kelamin: ${gender}
- Aktivitas: ${aktivitas}, Target: ${target}
- Catatan: ${catatan || '-'}

Jawab dalam JSON format:
{"cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"bmr":0,"tdee":0,"notes":"penjelasan singkat dalam bahasa Indonesia max 3 kalimat"}
Semua angka dalam satuan standar. Jawab HANYA dengan JSON valid.`;

  const raw = await callGroq([{ role: 'user', content: prompt }], true, 400);
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

