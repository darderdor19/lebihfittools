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
- Singkong (mentah/rebus/air-fryer tanpa minyak): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
- Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
- Dada Ayam Fillet MENTAH (raw): 120 kcal | Karbo: 0g | Protein: 23g | Lemak: 2.5g | Serat: 0g | Gula: 0g | Sodium: 65mg | Kalsium: 10mg | Besi: 0.7mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.8mg
- Dada Ayam MATANG (rebus/panggang/air-fryer tanpa minyak): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
- Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
- Minyak Goreng / Margarin (per 10g / 1 sdm): 88 kcal | Karbo: 0g | Protein: 0g | Lemak: 10g | Serat: 0g | Gula: 0g | Sodium: 0mg | Kalsium: 0mg | Besi: 0mg | VitC: 0mg | VitD: 0mcg | Zinc: 0mg

== INSTRUKSI KALKULASI SECARA KETAT ==
1. Ekstrak berat makanan dalam gram (misal: "545 gram" -> 545g, "500gram" -> 500g). Jika tidak disebutkan beratnya, gunakan estimasi porsi standar.
2. Bedakan Berat Mentah vs Matang secara logis:
   - Jika deskripsi mengandung kata "fillet", "mentah", "raw", gunakan data "MENTAH".
   - Jika matang atau tidak disebutkan secara spesifik, asumsikan berat yang diinput adalah berat mentah sebelum dimasak kecuali konteksnya jelas-jelas matang.
3. Metode masak "Air Fryer" atau "Air Fry" wajib dihitung sebagai TANPA MINYAK (sama seperti rebus/panggang kering). JANGAN menambahkan kalori/lemak minyak goreng ke dalamnya.
4. ATURAN MULTI-BAHAN (SANGAT PENTING):
   - Jika terdapat lebih dari 1 bahan makanan (misal: "dada ayam fillet 545g dan singkong 500g"):
     - Hitung kandungan nutrisi masing-masing bahan secara terpisah terlebih dahulu.
     - JANGAN PERNAH menjumlahkan total berat (545g + 500g = 1045g) lalu mengalikan seluruh berat tersebut dengan gizi dada ayam. Ini salah!
     - Jumlahkan hasil akhir nutrisi dari masing-masing bahan di akhir.
5. Lakukan perkalian matematis secara eksak: (Berat Gizi per 100g) * (Total Berat / 100).
   - CONTOH 1: "dada ayam fillet 545 gram dimasak air-fryer tanpa minyak" (Fillet = Mentah, Air-fryer = Tanpa minyak):
     - Faktor pengali = 5.45
     - Kalori = 120 * 5.45 = 654 kcal
     - Protein = 23 * 5.45 = 125.4g
     - Lemak = 2.5 * 5.45 = 13.6g
     - Karbo = 0 * 5.45 = 0g
   - CONTOH 2: "singkong 500gram dimasak air-fryer tanpa minyak":
     - Faktor pengali = 5.0
     - Kalori = 160 * 5.0 = 800 kcal
     - Karbohidrat = 38 * 5.0 = 190g
     - Protein = 1.3 * 5.0 = 6.5g
     - Lemak = 0.3 * 5.0 = 1.5g
   - CONTOH 3 (MULTI-BAHAN): "dada ayam fillet 545g dan singkong 500g dimasak air-fryer tanpa bumbu/minyak"
     - Dada ayam fillet mentah 545g: Kalori = 120 * 5.45 = 654 kcal, Protein = 23 * 5.45 = 125.4g, Lemak = 2.5 * 5.45 = 13.6g
     - Singkong 500g: Kalori = 160 * 5.0 = 800 kcal, Karbo = 38 * 5.0 = 190g, Protein = 1.3 * 5.0 = 6.5g, Lemak = 0.3 * 5.0 = 1.5g
     - Hasil akhir penjumlahan: Kalori = 1454 kcal, Protein = 131.9g, Karbo = 190g, Lemak = 15.1g
6. Jika terdapat minyak goreng atau margarin sungguhan dalam deskripsi cara masak, tambahkan kalori dan lemak secara proporsional (+88 kcal dan +10g lemak per 1 sdm/10g minyak).
7. Untuk makanan lain, gunakan nilai gizi resmi per 100g dari USDA secara logis dan lakukan perkalian berat yang sama secara ketat.
8. Jawab HANYA dengan JSON valid dengan format berikut, tanpa penjelasan teks di luar JSON, tanpa markdown:
{"name":"nama makanan","portion":"estimasi porsi/berat","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Semua nilai numerik dibulatkan ke 1 angka di belakang koma.`;
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

