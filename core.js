// ===== FIREBASE CONFIG (TUGAS USER) =====
// Paste firebaseConfig Anda di dalam kurung kurawal di bawah ini:
const firebaseConfig = {
  apiKey: "AIzaSyAL69COk7XKUnKalpBY9QmLSMddHv0lEe4",
  authDomain: "lebihfit-tools-final.firebaseapp.com",
  databaseURL: "https://lebihfit-tools-final-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lebihfit-tools-final",
  storageBucket: "lebihfit-tools-final.firebasestorage.app",
  messagingSenderId: "806088947698",
  appId: "1:806088947698:web:1c4af66a443d96b9071d6b"
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
async function callAI(messages, json = false, model = 'llama-3.3-70b-versatile', isVision = false, isGroqVision = false) {
  // isGroqVision: vision call tapi pakai Groq (cepat) bukan OpenRouter
  const key = (isVision && !isGroqVision) ? getVisionKey() : getApiKey();
  if (!key) throw new Error((isVision && !isGroqVision) ? 'Vision API Key belum diset. Buka Settings.' : 'API Key belum diset. Buka Settings.');
  
  let endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  if (isVision && !isGroqVision) {
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  }

  const body = { model: model, messages, max_tokens: 2500, temperature: 0.1 };
  if (json && !isVision) body.response_format = { type: 'json_object' };
  
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function analyzePhotoAI(base64, mime) {
  const prompt = `Kamu adalah ahli gizi dan sistem analisis visual makanan yang sangat akurat dan konsisten.
Tugas kamu adalah menganalisis foto makanan yang diunggah, mengenali jenis makanannya, memperkirakan porsi/beratnya secara logis, dan menghitung estimasi kandungan nutrisinya berdasarkan database gizi ilmiah standar (seperti USDA).

Instruksi:
1. Identifikasi nama makanan dan estimasi berat/porsi makanan secara logis dari gambar.
2. Lakukan perhitungan nutrisi secara proporsional. Gunakan standar gizi dasar, misalnya:
   - Nasi putih: ~130 kcal/100g.
   - Dada ayam: ~120-150 kcal/100g.
   - Minyak goreng/lemak: ~900 kcal/100g (jika makanan terlihat berminyak atau digoreng, tambahkan lemak secara logis).
3. Berikan jawaban dalam JSON dengan format berikut:
{"name":"nama makanan","portion":"estimasi porsi/berat","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"ulasan singkat analisis gizi maks 2 kalimat"}
Kembalikan HANYA JSON valid tanpa teks tambahan atau markdown.`;

  // Use getVisionKey() which will fall back to process.env.GEMINI_API_KEY on the server
  let key = getVisionKey();
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
      key = process.env.GEMINI_API_KEY;
  }
  if (!key) throw new Error("Gemini API Key belum diset. Buka Settings.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`;
  
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: base64 } }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status} dari Gemini API`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) throw new Error("AI tidak mengembalikan data. Mungkin foto tidak jelas atau diblokir filter.");
  
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Parse Error. Raw data:", raw);
    let preview = typeof raw === 'string' ? raw.substring(0, 150) : JSON.stringify(raw).substring(0, 150);
    throw new Error("Gagal membaca hasil analisis. Respons: " + preview);
  }
}

async function analyzePhysicalPhotoAI(base64, mime, promptText) {
  let key = getVisionKey();
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
      key = process.env.GEMINI_API_KEY;
  }
  if (!key) throw new Error("Gemini API Key belum diset. Buka Settings.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`;
  
  const body = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: mime, data: base64 } }
      ]
    }]
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status} dari Gemini API`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("AI tidak mengembalikan data. Mungkin foto tidak jelas atau diblokir filter.");
  return raw;
}

async function analyzeTextAI(name, portion, desc) {
  let prompt = `Kamu adalah database gizi dan sistem kalkulasi nutrisi makanan yang sangat akurat, konsisten, dan ilmiah.
Tugas kamu adalah memberikan estimasi nutrisi secara presisi berdasarkan basis data terpercaya (seperti USDA, Kemenkes, atau FatSecret).

Nama Makanan: ${name}
Porsi/Berat: ${portion || '1 porsi standar'}`;

  if (desc) {
    prompt += `\nDeskripsi/Metode Masak: ${desc}`;
  }

  prompt += `

Instruksi Perhitungan (WAJIB DIIKUTI SECARA KETAT):
1. Gunakan nilai gizi dasar per 100g untuk makanan umum berikut sebagai patokan perhitungan:
   - Singkong rebus/mentah: ~160 kalori, ~38g karbohidrat, ~1.3g protein, ~0.3g lemak, ~1.8g serat per 100g. (Jadi jika porsi adalah 500 gram singkong rebus tanpa bumbu/minyak, total kalorinya adalah 5 * 160 = 800 kcal, karbohidrat = 5 * 38 = 190g, lemak = 5 * 0.3 = 1.5g).
   - Nasi putih matang: ~130 kalori, ~28g karbohidrat, ~2.7g protein, ~0.3g lemak per 100g.
   - Dada ayam mentah: ~120 kalori, ~23g protein, ~2.5g lemak per 100g.
   - Telur ayam utuh sedang: ~75 kalori, ~6g protein, ~5g lemak, ~0.6g karbohidrat per butir (~50g).
2. Jika pengguna menyebutkan berat spesifik (misal: "500gram", "200g", "1.5 kg"), lakukan perkalian matematika secara ketat berdasarkan berat tersebut dibagi 100.
3. Selalu perhitungkan deskripsi metode masak (seperti digoreng pakai minyak, direbus tanpa bumbu/minyak sama sekali, mentah, matang) untuk menyesuaikan nilai kalori dan lemak secara logis.
4. Jawab HANYA dengan JSON valid dengan format berikut, tanpa penjelasan teks di luar JSON, tanpa markdown:
{"cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Semua nilai numerik dalam satuan standar (gram/mg/mcg).`;
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

== FORMULA PERHITUNGAN KALORI (WAJIB DIIKUTI) ==
Gunakan rumus ilmiah standar: Kcal = MET * Berat Badan (kg) * (Durasi (menit) / 60)
Di mana nilai MET ditentukan secara logis berdasarkan jenis dan intensitas latihan:
1. GYM / WORKOUT (Latihan beban / kalistenik):
   - Intensitas Ringan (beban ringan, rest time lama): MET = 3.5
   - Intensitas Sedang (latihan beban standar, rest time 60-90s): MET = 5.0
   - Intensitas Tinggi (circuit training, superset, rest time pendek <60s): MET = 6.0
2. CARDIO (Lari, bersepeda, berenang, dll):
   - Intensitas Ringan (jalan santai, sepedahan santai): MET = 4.0
   - Intensitas Sedang (jogging, kardio sedang): MET = 7.0
   - Intensitas Tinggi (lari cepat, HIIT, kardio berat): MET = 10.0
3. OTHER (Aktivitas lain):
   - Gunakan MET berkisar 3.0 - 6.0 sesuai jenis aktivitas dan intensitasnya.

== FORMULA PEMBAGIAN MAKRO YANG TERBAKAR (WAJIB DIIKUTI) ==
Bagi energi kalori (kcal) yang terbakar menjadi gram makronutrisi sebagai berikut:
- Protein terbakar: 5% dari total kalori -> gram protein = (Kcal * 0.05) / 4
- Lemak terbakar (tergantung intensitas):
  - Intensitas Ringan: 40% dari total kalori -> gram lemak = (Kcal * 0.40) / 9
  - Intensitas Sedang: 30% dari total kalori -> gram lemak = (Kcal * 0.30) / 9
  - Intensitas Tinggi: 20% dari total kalori -> gram lemak = (Kcal * 0.20) / 9
- Karbohidrat terbakar: sisa persentase kalori -> gram karbohidrat = (Kcal * (100% - 5% - %Persentase Lemak)) / 4

== TUGAS ==
1. Tentukan tingkat intensitas latihan secara logis dari beban, repetisi, set, atau deskripsi latihan.
2. Hitung total kalori (kcal), gram lemak (fatG), gram karbo (carbG), dan gram protein (proteinG) menggunakan rumus di atas. Bulatkan angka ke desimal 1 angka di belakang koma (misal: 12.4).
3. Berikan feedback analisis singkat maksimal 3 kalimat dalam bahasa Indonesia gaul/santai yang bersahabat (gunakan 'lu/kamu'). Ulas efektivitas latihan lu, keselarasan dengan target lu, serta saran istirahat/recovery.

Jawab HANYA dengan JSON valid format berikut tanpa markdown/teks lain:
{"kcal":0,"fatG":0,"carbG":0,"proteinG":0,"analysis":"isi feedback di sini"}`;

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
    throw new Error("Gagal membaca hasil analisis AI (Format JSON tidak valid).");
  }
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
