// ===== FIREBASE CONFIG (TUGAS USER) =====
// Paste firebaseConfig Anda di dalam kurung kurawal di bawah ini:
const firebaseConfig = {
  apiKey: "AIzaSyAf6sIX9am_Gmv4xf0FiHRZX1V-w7NzIcM",
  authDomain: "lebihfittools.firebaseapp.com",
  databaseURL: "https://lebihfittools-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lebihfittools",
  storageBucket: "lebihfittools.firebasestorage.app",
  messagingSenderId: "842679721902",
  appId: "1:842679721902:web:99f81ad767dc372739323f"
};

let fbDb = null;
if (firebaseConfig && firebaseConfig.apiKey && typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    fbDb = firebase.database();
}

function syncToFirebase(key, value) {
    if (!fbDb) return;
    const email = localStorage.getItem('lf_user_email');
    if (!email) return;
    const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
    
    fbDb.ref(`users/${safeEmail}/${key}`).set(value).catch(console.error);
}

function deleteFromFirebase(key) {
    if (!fbDb) return;
    const email = localStorage.getItem('lf_user_email');
    if (!email) return;
    const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
    fbDb.ref(`users/${safeEmail}/${key}`).remove().catch(console.error);
}

async function syncFirebaseToLocal() {
    if (!fbDb) return;
    const email = localStorage.getItem('lf_user_email');
    if (!email) return;
    const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
    
    try {
        const snapshot = await fbDb.ref(`users/${safeEmail}`).once('value');
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(k => {
                localStorage.setItem(k, JSON.stringify(data[k]));
            });
            console.log("Firebase sync: OK");
        }
    } catch (e) {
        console.error("Firebase sync error:", e);
    }
}

// ===== STORAGE =====
const DB = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
  set: (k, v) => {
      localStorage.setItem(k, JSON.stringify(v));
      syncToFirebase(k, v);
  },
  del: k => {
      localStorage.removeItem(k);
      deleteFromFirebase(k);
  }
};

const getProfile = () => {
    try {
        const p = DB.get('lf_profile');
        if (p && p.targets && p.tb && p.bb && p.usia && p.gender) {
            return p;
        }
    } catch (e) {
        console.error("Error in getProfile:", e);
    }
    return null;
};
const setProfile = p => { DB.set('lf_profile', p); invalidateAnalysisCache(); };
const getApiKey = () => DB.get('lf_apikey');
const setApiKey = k => DB.set('lf_apikey', k);
const getVisionKey = () => DB.get('lf_visionkey');
const setVisionKey = k => DB.set('lf_visionkey', k);
const getOpenRouterModel = () => {
    let model = DB.get('lf_openroutermodel');
    const oldModels = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'anthropic/claude-3.5-sonnet',
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro',
        'deepseek/deepseek-chat',
        'meta-llama/llama-3.3-70b-instruct',
        'meta-llama/llama-3.2-3b-instruct:free',
        'nousresearch/hermes-3-llama-3.1-405b:free'
    ];
    if (!model || oldModels.includes(model)) {
        model = 'openrouter/free';
        DB.set('lf_openroutermodel', model);
    }
    return model;
};
const setOpenRouterModel = m => DB.set('lf_openroutermodel', m);
const getAuthUser = () => {
  const email = DB.get('lf_user_email');
  const name = DB.get('lf_user_name');
  return email ? { email, name } : null;
};
const setAuthUser = (email, name) => {
  DB.set('lf_user_email', email);
  if(name) DB.set('lf_user_name', name);
};
const clearAuthUser = () => {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('lf_')) {
            localStorage.removeItem(key);
        }
    });
};

function getLogs() { return DB.get('lf_logs') || {}; }
function setLogs(logs) { DB.set('lf_logs', logs); invalidateAnalysisCache(); }

// ===== ACTIVITIES (Olahraga & Tidur) =====
function getActivities() { return DB.get('lf_activities') || {}; }
function setActivities(acts) { DB.set('lf_activities', acts); invalidateAnalysisCache(); }

function invalidateAnalysisCache() {
    DB.del('lf_analysis_cache');
}

function getDayActivitiesArray(actsObj, dateStr) {
  const dayData = actsObj[dateStr];
  if (!dayData) return [];
  if (Array.isArray(dayData)) return dayData;
  if (typeof dayData === 'object') return Object.values(dayData);
  return [];
}

function getTodayActivities() {
  return getDayActivitiesArray(getActivities(), todayKey());
}

function saveActivity(item) {
  const acts = getActivities();
  const key = item.date || todayKey();
  let dayData = acts[key];
  if (!dayData) {
      acts[key] = [];
      dayData = acts[key];
  } else if (!Array.isArray(dayData)) {
      acts[key] = Object.values(dayData);
      dayData = acts[key];
  }
  dayData.push(item);
  setActivities(acts);
}

function deleteActivity(id) {
  const acts = getActivities();
  for (const key in acts) {
    let dayData = acts[key];
    if (dayData && !Array.isArray(dayData)) {
        dayData = Object.values(dayData);
        acts[key] = dayData;
    }
    if (Array.isArray(dayData)) {
      const idx = dayData.findIndex(i => i.id === id);
      if (idx !== -1) {
        dayData.splice(idx, 1);
        break;
      }
    }
  }
  setActivities(acts);
}

function getActivitiesRange(from, to) {
  const acts = getActivities();
  const result = {};
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const k = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    result[k] = getDayActivitiesArray(acts, k);
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}


function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getTodayLogs() {
  const logs = getLogs();
  return logs[todayKey()] || [];
}

function saveFoodItem(item) {
  const logs = getLogs();
  const key = item.date || todayKey();
  if (!logs[key]) logs[key] = [];
  logs[key].push(item);
  setLogs(logs);
}

function updateFoodItem(id, updated) {
  const logs = getLogs();
  for (const key in logs) {
    const idx = logs[key].findIndex(i => i.id === id);
    if (idx !== -1) { logs[key][idx] = { ...logs[key][idx], ...updated }; break; }
  }
  setLogs(logs);
}

function deleteFoodItem(id) {
  const logs = getLogs();
  for (const key in logs) {
    logs[key] = logs[key].filter(i => i.id !== id);
    if (!logs[key].length) delete logs[key];
  }
  setLogs(logs);
}

function getLogsRange(from, to) {
  const logs = getLogs();
  const result = [];
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    if (logs[key] && logs[key].length) {
      const items = logs[key];
      const totals = sumNutrients(items);
      result.push({ date: key, items, totals });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function sumNutrients(items) {
  return items.reduce((acc, item) => {
    acc.cal += item.cal || 0;
    acc.protein += item.protein || 0;
    acc.carbs += item.carbs || 0;
    acc.fat += item.fat || 0;
    acc.fiber += item.fiber || 0;
    acc.sugar += item.sugar || 0;
    acc.sodium += item.sodium || 0;
    acc.calcium += item.calcium || 0;
    acc.iron += item.iron || 0;
    acc.vitC += item.vitC || 0;
    acc.vitD += item.vitD || 0;
    acc.zinc += item.zinc || 0;
    return acc;
  }, { cal:0, protein:0, carbs:0, fat:0, fiber:0, sugar:0, sodium:0, calcium:0, iron:0, vitC:0, vitD:0, zinc:0 });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ===== AI API =====
function getMaskedAIError(originalError) {
  try {
    const email = localStorage.getItem('lf_user_email');
    const cleanEmail = email ? email.replace(/\"/g, '').trim().toLowerCase() : '';
    if (cleanEmail.includes('jokonurhadi.works')) {
      return originalError;
    }
  } catch (e) {
    console.error("Error checking user email for error masking:", e);
  }

  const errMsg = String(originalError?.message || originalError || '').toLowerCase();
  const isRateLimit = 
    errMsg.includes('429') ||
    errMsg.includes('rate limit') ||
    errMsg.includes('quota') ||
    errMsg.includes('exhausted') ||
    errMsg.includes('too many requests') ||
    errMsg.includes('capacity') ||
    errMsg.includes('busy') ||
    errMsg.includes('overloaded') ||
    errMsg.includes('limit exceeded') ||
    errMsg.includes('tokens');

  if (isRateLimit) {
    return new Error('LebihFit Tools sedang banyak permintaan');
  } else {
    return new Error('LebihFit Tools AI sedang maintenance');
  }
}

async function callAI(messages, json = false, model = 'llama-3.3-70b-versatile', isVision = false, isGroqVision = false) {
  // isGroqVision: vision call tapi pakai Groq (cepat) bukan OpenRouter
  const key = (isVision && !isGroqVision) ? getVisionKey() : getApiKey();
  if (!key) throw new Error((isVision && !isGroqVision) ? 'Vision API Key belum diset. Buka Settings.' : 'API Key belum diset. Buka Settings.');
  
  let endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  if (isVision && !isGroqVision) {
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  }

  const body = { model: model, messages, max_tokens: 2500, temperature: 0 };
  if (json && !isVision) body.response_format = { type: 'json_object' };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
  
  let res;
  try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
  } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
          throw getMaskedAIError(new Error('Koneksi ke AI timeout. Cek jaringan/VPN lu bro.'));
      }
      throw getMaskedAIError(err);
  }

  try {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error("Format respons AI tidak valid.");
      }
      return data.choices[0].message.content;
  } catch (err) {
      throw getMaskedAIError(err);
  }
}

async function analyzePhotoAI(images, mime = null) {
  const prompt = `Kamu adalah ahli gizi dan sistem analisis visual makanan yang sangat akurat dan konsisten.
Tugas kamu adalah menganalisis foto makanan yang diunggah (bisa berupa satu foto atau beberapa foto yang menampilkan makanan yang sama atau komponen makanan yang berbeda dari hidangan tersebut), mengenali jenis makanannya, memperkirakan porsi/beratnya secara logis, dan menghitung estimasi kandungan nutrisinya berdasarkan database gizi ilmiah standar (seperti USDA).

Instruksi:
1. Identifikasi nama makanan dan estimasi berat/porsi makanan secara logis dari gambar.
2. Gunakan database referensi gizi standar per 100g berikut untuk menghitung secara proporsional:
   - Singkong (mentah/rebus/air-fryer tanpa minyak): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
   - Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
   - Dada Ayam Fillet MENTAH (raw): 120 kcal | Karbo: 0g | Protein: 23g | Lemak: 2.5g | Serat: 0g | Gula: 0g | Sodium: 65mg | Kalsium: 10mg | Besi: 0.7mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.8mg
   - Dada Ayam MATANG (rebus/panggang/air-fryer tanpa minyak): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
   - Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
   - Minyak Goreng / Lemak (per 10g): 88 kcal, Lemak 10g (jika makanan terlihat berminyak/digoreng, wajib tambahkan estimasi minyak).
3. Metode masak "Air Fryer" atau "Air Fry" wajib dihitung sebagai TANPA MINYAK tambahan. JANGAN menambahkan kalori/lemak minyak goreng ke dalamnya.
4. ATURAN MULTI-BAHAN: Jika di piring terdapat lebih dari 1 jenis makanan (misal: dada ayam dan singkong), kalkulasikan berat dan kandungan gizi masing-masing bahan secara terpisah terlebih dahulu sebelum menjumlahkan total akhirnya. JANGAN menjumlahkan seluruh berat lalu mengalikan dengan satu jenis gizi saja.
5. Lakukan kalkulasi: (Nilai gizi per 100g) * (Estimasi Berat / 100).
6. Berikan jawaban dalam JSON dengan format berikut:
{"name":"nama makanan","portion":"estimasi porsi/berat","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"ulasan singkat analisis gizi maks 2 kalimat"}
Kembalikan HANYA JSON valid tanpa teks tambahan atau markdown.`;

  // Use getVisionKey() which will fall back to process.env.GEMINI_API_KEY on the server
  let key = getVisionKey();
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
      key = process.env.GEMINI_API_KEY;
  }
  if (!key) throw new Error("Gemini API Key belum diset. Buka Settings.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  
  const parts = [{ text: prompt }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
    });
  } else {
    parts.push({ inline_data: { mime_type: mime, data: images } });
  }

  const body = {
    contents: [{
      parts: parts
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.0
    }
  };

  let res;
  try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
  } catch (err) {
      throw getMaskedAIError(err);
  }

  try {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status} dari Gemini API`);
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!raw) throw new Error("AI tidak mengembalikan data. Mungkin foto tidak jelas atau diblokir filter.");
      
      return JSON.parse(raw);
  } catch (err) {
      throw getMaskedAIError(err);
  }
}

async function analyzePhysicalPhotoAI(images, mime, promptText, jsonMode = false) {
  let key = getVisionKey();
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
      key = process.env.GEMINI_API_KEY;
  }
  if (!key) throw new Error("Gemini API Key belum diset. Buka Settings.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  
  const parts = [{ text: promptText }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
    });
  } else {
    parts.push({ inline_data: { mime_type: mime, data: images } });
  }

  const body = {
    contents: [{
      parts: parts
    }]
  };

  if (jsonMode) {
    body.generationConfig = {
      responseMimeType: "application/json",
      temperature: 0.0
    };
  }

  let res;
  try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
  } catch (err) {
      throw getMaskedAIError(err);
  }

  try {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status} dari Gemini API`);
      }

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error("AI tidak mengembalikan data. Mungkin foto tidak jelas atau diblokir filter.");
      return raw;
  } catch (err) {
      throw getMaskedAIError(err);
  }
}

async function analyzeTextAI(name, portion, desc) {
  let prompt = `Kamu adalah mesin kalkulator gizi dan database nutrisi makanan yang sangat akurat, konsisten, dan ilmiah.
Tugas kamu adalah menghitung kandungan nutrisi makro dan mikro secara presisi berdasarkan data standar per 100g.

== BAHAN UTAMA & PORSI ==
Nama Makanan: ${name}
Porsi/Berat: ${portion || '1 porsi standar'}
Deskripsi/Cara Masak: ${desc || 'tidak ada deskripsi tambahan'}

== DATABASE REFERENCE (Per 100g): ==
- Singkong (mentah/rebus/air-fryer tanpa minyak): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
- Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
- Dada Ayam Fillet MENTAH (raw): 120 kcal | Karbo: 0g | Protein: 23g | Lemak: 2.5g | Serat: 0g | Gula: 0g | Sodium: 65mg | Kalsium: 10mg | Besi: 0.7mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.8mg
- Dada Ayam MATANG (rebus/panggang/air-fryer tanpa minyak): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
- Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
- Minyak Goreng / Margarin (per 10g / 1 sdm): 88 kcal | Karbo: 0g | Protein: 0g | Lemak: 10g | Serat: 0g | Gula: 0g | Sodium: 0mg | Kalsium: 0mg | Besi: 0mg | VitC: 0mg | VitD: 0mcg | Zinc: 0mg

== INSTRUKSI KALKULASI SECARA KETAT ==
1. Ekstrak berat masing-masing bahan dalam gram (misal: dada ayam 545g, singkong 500g).
2. Bedakan Berat Mentah vs Matang secara logis:
   - Jika deskripsi mengandung kata "fillet", "mentah", "raw", gunakan data "MENTAH".
   - Jika tidak disebutkan secara spesifik, asumsikan berat yang diinput adalah berat mentah sebelum dimasak kecuali konteksnya jelas-jelas matang.
3. Metode masak "Air Fryer" atau "Air Fry" wajib dihitung sebagai TANPA MINYAK (0g lemak tambahan). Jangan menambah kalori/lemak minyak goreng ke dalamnya.
4. ATURAN MULTI-BAHAN (SANGAT PENTING):
   - Jika terdapat lebih dari 1 bahan makanan (misal: "dada ayam fillet 545g dan singkong 500g"):
     - Hitung kandungan nutrisi masing-masing bahan secara terpisah terlebih dahulu.
     - JANGAN PERNAH menjumlahkan total berat (545g + 500g = 1045g) lalu mengalikan seluruh berat tersebut dengan gizi dada ayam. Ini salah!
     - Jumlahkan hasil akhir nutrisi dari masing-masing bahan di akhir.
5. CONTOH DETAIL PERHITUNGAN MULTI-BAHAN:
   - Input: "dada ayam fillet 545g dan singkong 500g dimasak air-fryer tanpa bumbu/minyak"
     - Langkah 1: Hitung dada ayam fillet mentah 545g -> Faktor pengali = 5.45.
       - Kalori = 120 * 5.45 = 654 kcal, Protein = 23 * 5.45 = 125.4g, Lemak = 2.5 * 5.45 = 13.6g
     - Langkah 2: Hitung singkong 500g -> Faktor pengali = 5.0.
       - Kalori = 160 * 5.0 = 800 kcal, Karbo = 38 * 5.0 = 190g, Protein = 1.3 * 5.0 = 6.5g, Lemak = 0.3 * 5.0 = 1.5g, Serat = 1.8 * 5.0 = 9g
     - Langkah 3: Jumlahkan total gizi akhir:
       - Kalori = 654 + 800 = 1454 kcal
       - Protein = 125.4 + 6.5 = 131.9g
       - Karbohidrat = 0 + 190 = 190g
       - Lemak = 13.6 + 1.5 = 15.1g
       - Serat = 0 + 9 = 9g
6. Jika terdapat minyak goreng atau margarin sungguhan dalam deskripsi cara masak, tambahkan kalori dan lemak secara proporsional (+88 kcal dan +10g lemak per 1 sdm/10g minyak).
7. Untuk makanan lain, gunakan nilai gizi resmi per 100g dari USDA secara logis dan lakukan perkalian berat yang sama secara ketat.
8. Jawab HANYA dengan JSON valid dengan format berikut, tanpa penjelasan teks di luar JSON, tanpa markdown:
{"cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Semua nilai numerik dibulatkan ke 1 angka di belakang koma.`;
  const raw = await callAI([{ role:'user', content: prompt }], true, 'llama-3.3-70b-versatile');
  
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
    throw new Error("Gagal membaca hasil analisis (Format JSON tidak valid).");
  }
}

async function calcAI(profile) {
  const { tb, bb, usia, gender, aktivitas, target, catatan } = profile;
  const prompt = `Kamu adalah ahli gizi dan fitness. Berdasarkan data berikut, hitung kebutuhan nutrisi harian:
- Tinggi: ${tb}cm, Berat: ${bb}kg, Usia: ${usia}th, Jenis Kelamin: ${gender}
- Aktivitas: ${aktivitas}, Target: ${target}
- Catatan: ${catatan || '-'}

Jawab dalam JSON format:
{"cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"bmr":0,"tdee":0,"notes":"penjelasan singkat dalam bahasa Indonesia max 3 kalimat"}
Semua angka dalam satuan standar. Jawab HANYA dengan JSON valid.`;
  const raw = await callAI([{ role:'user', content: prompt }], true, 'llama-3.3-70b-versatile');
  
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

async function analyzeWorkoutAI(activity, profile) {
  const { tb, bb, usia, gender, aktivitas, target } = profile;
  
  let workoutDetails = '';
  if (activity.type === 'gym') {
    workoutDetails = (activity.muscles || []).map(m => {
      const varDetails = (m.variations || []).map(v => {
        const setsDetails = (v.sets || []).map(s => `Set ${s.set}: ${s.reps} reps @ ${s.weight || 0} kg`).join(', ');
        return `- ${v.name}: ${setsDetails}`;
      }).join('\n');
      return `Otot: ${m.muscle} (Waktu istirahat per set: ${m.restTime || 60} detik)\n${varDetails}`;
    }).join('\n\n');
  } else if (activity.type === 'workout') {
    workoutDetails = (activity.exercises || []).map(ex => {
      const setsDetails = (ex.sets || []).map(s => `Set ${s.set}: ${s.reps} reps @ ${s.weight || 0} kg`).join(', ');
      return `- ${ex.name} (Waktu istirahat per set: ${ex.restTime || 60} detik): ${setsDetails}`;
    }).join('\n');
  } else if (activity.type === 'cardio') {
    workoutDetails = `- Nama Kardio: ${activity.name}\n- Durasi: ${activity.durationMin} menit\n- Jarak: ${activity.distanceKm || '--'} km\n- Intensitas: ${activity.intensity}`;
  } else if (activity.type === 'other') {
    workoutDetails = `- Nama Aktivitas: ${activity.name}\n- Durasi: ${activity.durationMin} menit\n- Intensitas: ${activity.intensity}`;
  }

  const prompt = `Kamu adalah pelatih fitness, ahli fisiologi olahraga, dan sistem analisis olahraga yang sangat akurat.
Tugas kamu adalah menganalisis rincian latihan pengguna dan menghitung pembakaran kalori serta makronutrisi secara konsisten dan ilmiah menggunakan metode MET (Metabolic Equivalent of Task).

== PROFIL PENGGUNA ==
- Laki-laki/Perempuan: ${gender || 'Laki-laki'}
- Tinggi: ${tb || 170} cm
- Berat: ${bb || 70} kg
- Usia: ${usia || 25} tahun
- Target: ${target || 'kebugaran'}

== DATA LATIHAN (${activity.type.toUpperCase()}) ==
${workoutDetails}
- Durasi Latihan: ${activity.durationMin || 30} menit
- Tingkat Intensitas yang Dipilih: ${activity.intensity || 'medium'}

== FORMULA PERHITUNGAN KALORI (WAJIB DIIKUTI) ==
Gunakan rumus ilmiah standar: Kcal = MET * Berat Badan (kg) * (Durasi (menit) / 60)
Di mana nilai MET ditentukan secara logis berdasarkan jenis dan intensitas latihan:
1. GYM / WORKOUT (Latihan beban / kalistenik):
   - Intensitas Ringan (beban ringan, rest time lama): MET = 3.5
   - Intensitas Sedang (latihan beban standar, rest time 60-90s): MET = 5.0
   - Intensitas Tinggi (circuit training, superset, rest time pendek <60s): MET = 6.0
2. CARDIO (Lari, bersepeda, berenang, dll):
   - Intensitas Ringan (jalan santai, sepedahan santai): MET = 3.0
   - Intensitas Sedang (jogging, kardio sedang): MET = 5.0
   - Intensitas Tinggi (lari cepat, HIIT, kardio berat): MET = 8.3
3. OTHER (Aktivitas lain):
   - Gunakan MET berkisar 3.0 - 6.0 sesuai jenis aktivitas dan intensitasnya.

== FORMULA PEMBAGIAN MAKRO YANG TERBAKAR (WAJIB DIIKUTI) ==
Beni/kalori (kcal) yang terbakar dibagi menjadi gram makronutrisi sebagai berikut:
- Protein terbakar: 5% dari total kalori -> gram protein = (Kcal * 0.05) / 4
- Lemak terbakar (tergantung intensitas):
  - Intensitas Ringan: 40% dari total kalori -> gram lemak = (Kcal * 0.40) / 9
  - Intensitas Sedang: 30% dari total kalori -> gram lemak = (Kcal * 0.30) / 9
  - Intensitas Tinggi: 20% dari total kalori -> gram lemak = (Kcal * 0.20) / 9
- Karbohidrat terbakar: sisa persentase kalori -> gram karbohidrat = (Kcal * (100% - 5% - %Persentase Lemak)) / 4

SANGAT PENTING: Untuk gram makronutrisi, Anda WAJIB membagi persentase kalori dengan nilai kalorinya (Lemak dibagi 9, Karbohidrat dan Protein dibagi 4). JANGAN langsung mengembalikan nilai kalori sebagai gram!

== TUGAS ==
1. Tentukan tingkat intensitas latihan secara logis dari beban, repetisi, set, atau deskripsi latihan.
2. Hitung total kalori (kcal), gram lemak (fatG), gram karbo (carbG), dan gram protein (proteinG) menggunakan rumus di atas. Bulatkan angka ke desimal 1 angka di belakang koma (misal: 12.4).
3. Berikan feedback analisis singkat maksimal 3 kalimat dalam bahasa Indonesia gaul/santai yang bersahabat (gunakan 'lu/kamu'). Ulas efektivitas latihan lu, keselarasan dengan target lu, serta saran istirahat/recovery.

Jawab HANYA dengan JSON valid format berikut tanpa markdown/teks lain:
{"kcal":0,"fatG":0,"carbG":0,"proteinG":0,"analysis":"isi feedback di sini"}`;

  const raw = await callAI([{ role:'user', content: prompt }], true, 'llama-3.3-70b-versatile');
  
  if (!raw) throw new Error("AI tidak mengembalikan data.");
  
  let parsed = null;
  try {
    if (typeof raw === 'string') {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    } else {
      parsed = raw;
    }
  } catch (e) {
    console.error("Parse Error. Raw data:", raw);
    throw new Error("Gagal membaca hasil analisis AI (Format JSON tidak valid).");
  }

  // Programmatic macro recalculation to guarantee 100% mathematical consistency and correct density division!
  if (parsed && typeof parsed.kcal === 'number') {
    const kcal = parsed.kcal;
    const intensity = activity.intensity || 'medium';
    
    let fatRatio = 0.30;
    let carbRatio = 0.65;
    let proteinRatio = 0.05;
    
    if (intensity === 'low') {
        fatRatio = 0.40;
        carbRatio = 0.55;
    } else if (intensity === 'high') {
        fatRatio = 0.20;
        carbRatio = 0.75;
    }
    
    parsed.fatG = parseFloat(((kcal * fatRatio) / 9).toFixed(1));
    parsed.carbG = parseFloat(((kcal * carbRatio) / 4).toFixed(1));
    parsed.proteinG = parseFloat(((kcal * proteinRatio) / 4).toFixed(1));
  }
  
  return parsed;
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

async function deleteUserAccount() {
  if (!fbDb) return;
  const email = localStorage.getItem('lf_user_email');
  if (!email) return;
  const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
  
  try {
    const snapshot = await fbDb.ref(`users/${safeEmail}/telegram_chat_id`).once('value');
    const telegramChatId = snapshot.val();
    if (telegramChatId) {
      await fbDb.ref(`telegram_links/${telegramChatId}`).remove();
      await fbDb.ref(`telegram_states/${telegramChatId}`).remove();
    }
    await fbDb.ref(`users/${safeEmail}`).remove();
  } catch (e) {
    console.error("Error deleting user account from Firebase:", e);
    throw e;
  }
}

// ===== DATA SIGNATURES FOR AI CACHING =====
function getDailyDataSignature(email, dateStr) {
  const logs = (getLogs() || {})[dateStr] || [];
  const acts = getDayActivitiesArray(getActivities() || {}, dateStr);
  
  const foodSignature = logs.map(l => `${l.id}-${l.cal}-${l.protein}-${l.carbs}-${l.fat}`).join('|');
  const actSignature = acts.map(a => {
    if (a.type === 'sleep') return `${a.id}-${a.hours}-${a.quality}-${a.sleepType}`;
    if (a.type === 'workout') return `${a.id}-${a.exercises.map(e => `${e.name}-${(e.sets || []).map(s=>s.reps).join('/')}`).join(',')}`;
    if (a.type === 'gym') return `${a.id}-${(a.muscles || []).map(m => `${m.muscle}-${(m.variations || []).map(v => `${v.name}-${(v.sets || []).map(s=>s.reps).join('/')}`).join(',')}`).join(',')}`;
    return a.id;
  }).join('|');
  
  const profile = getProfile() || {};
  const profileSig = `${profile.bb || ''}-${profile.tb || ''}-${profile.target || ''}`;
  
  return `${email}_${dateStr}_[${foodSignature}]_[${actSignature}]_[${profileSig}]`;
}

function getRangeDataSignature(email, fromDate, toDate) {
  const logs = getLogsRange(fromDate, toDate); // returns array of { date, items, totals }
  const acts = getActivitiesRange(new Date(fromDate), new Date(toDate)); // returns object { date: items[] }
  
  const foodParts = logs.map(l => {
    const itemSigs = (l.items || []).map(item => `${item.id}-${item.cal}-${item.protein}-${item.carbs}-${item.fat}`).join(',');
    return `${l.date}:${itemSigs}`;
  }).join('|');
  
  const actParts = [];
  Object.keys(acts).sort().forEach(dateKey => {
    const dayActs = acts[dateKey] || [];
    if (dayActs.length > 0) {
      const daySigs = dayActs.map(a => {
        if (a.type === 'sleep') return `${a.id}-${a.hours}-${a.quality}-${a.sleepType}`;
        if (a.type === 'workout') return `${a.id}-${(a.exercises || []).map(e => `${e.name}-${(e.sets || []).map(s=>s.reps).join('/')}`).join(',')}`;
        if (a.type === 'gym') return `${a.id}-${(a.muscles || []).map(m => `${m.muscle}-${(m.variations || []).map(v => `${v.name}-${(v.sets || []).map(s=>s.reps).join('/')}`).join(',')}`).join(',')}`;
        return a.id;
      }).join(',');
      actParts.push(`${dateKey}:${daySigs}`);
    }
  });
  
  const profile = getProfile() || {};
  const profileSig = `${profile.bb || ''}-${profile.tb || ''}-${profile.target || ''}`;
  
  return `${email}_${fromDate}_${toDate}_[${foodParts}]_[${actParts.join('|')}]_[${profileSig}]`;
}
