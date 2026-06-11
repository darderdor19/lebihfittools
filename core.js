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

const getProfile = () => DB.get('lf_profile');
const setProfile = p => DB.set('lf_profile', p);
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
  DB.del('lf_user_email');
  DB.del('lf_user_name');
};

function getLogs() { return DB.get('lf_logs') || {}; }
function setLogs(logs) { DB.set('lf_logs', logs); }

// ===== ACTIVITIES (Olahraga & Tidur) =====
function getActivities() { return DB.get('lf_activities') || {}; }
function setActivities(acts) { DB.set('lf_activities', acts); }

function getTodayActivities() {
  const acts = getActivities();
  return acts[todayKey()] || [];
}

function saveActivity(item) {
  const acts = getActivities();
  const key = item.date || todayKey();
  if (!acts[key]) acts[key] = [];
  acts[key].push(item);
  setActivities(acts);
}

function deleteActivity(id) {
  const acts = getActivities();
  for (const key in acts) {
    const idx = acts[key].findIndex(i => i.id === id);
    if (idx !== -1) { acts[key].splice(idx, 1); break; }
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
    result[k] = acts[k] || [];
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

  const body = { model: model, messages, max_tokens: 2500 };
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
  const prompt = `Analisis foto makanan ini. Berikan estimasi nutrisi dalam JSON dengan format:
{"name":"nama makanan","portion":"estimasi porsi","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"catatan singkat"}
Semua nilai numerik dalam satuan standar (gram/mg/mcg). Jawab HANYA dengan JSON valid tanpa teks apapun di luar kurung kurawal.`;

  const msgs = [{ role:'user', content:[
    { type:'text', text: prompt },
    { type:'image_url', image_url:{ url:`data:${mime};base64,${base64}`, detail: 'low' } }
  ]}];

  // Gunakan Groq llama-4 vision - gratis dan super cepat
  const raw = await callAI(msgs, false, 'meta-llama/llama-4-scout-17b-16e-instruct', false, true);
  
  if (!raw) throw new Error("AI tidak mengembalikan data. Mungkin foto tidak jelas atau diblokir filter.");
  
  try {
    if (typeof raw === 'string') {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        let cleanStr = match[0];
        // Hapus trailing commas yang sering bikin JSON.parse error
        cleanStr = cleanStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        return JSON.parse(cleanStr);
      }
      return JSON.parse(raw);
    }
    return raw;
  } catch (e) {
    console.error("Parse Error. Raw data:", raw);
    let preview = typeof raw === 'string' ? raw.substring(0, 150) : JSON.stringify(raw).substring(0, 150);
    throw new Error("Gagal membaca hasil analisis. Respons: " + preview);
  }
}

async function analyzeTextAI(name, portion, desc) {
  let prompt = `Berikan estimasi nutrisi untuk makanan berikut:
Nama: ${name}
Porsi: ${portion || '1 porsi standar'}`;

  if (desc) {
    prompt += `\nDeskripsi Tambahan: ${desc} (Mohon perhitungkan deskripsi ini ke kalkulasi kalori & makronutrisi)`;
  }

  prompt += `

Jawab HANYA dengan JSON valid dengan format:
{"cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Semua nilai numerik dalam satuan standar (gram/mg/mcg). Jawab murni JSON tanpa markup/teks lain.`;
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

  const prompt = `Kamu adalah ahli gizi, olahraga, dan pelatih fitness profesional. Berdasarkan profil pengguna dan rincian latihan berikut, lakukan analisis mendalam tentang pembakaran kalori, pembagian energi (karbohidrat, lemak, protein), intensitas latihan, dan berikan feedback pemulihan (recovery):

== PROFIL PENGGUNA ==
- Jenis Kelamin: ${gender || 'Laki-laki'}
- Tinggi Badan: ${tb || 170} cm
- Berat Badan: ${bb || 70} kg
- Usia: ${usia || 25} tahun
- Aktivitas Harian: ${aktivitas || 'sedang'}
- Target: ${target || 'fat loss'}

== DATA LATIHAN (${activity.type.toUpperCase()}) ==
${workoutDetails}

== TUGAS ==
Hitung estimasi:
1. Total kalori yang terbakar (kcal) secara logis berdasarkan beban, reps, set, dan durasi istirahat.
2. Gram lemak yang terbakar (g).
3. Gram karbohidrat yang terbakar (g).
4. Gram protein yang terbakar (g).
5. Berikan feedback analisis singkat (maksimal 3 kalimat dalam bahasa Indonesia gaul/santai yang bersahabat, gunakan 'lu/kamu'). Jelaskan efektivitas latihan ini terhadap target pengguna, kualitas istirahat/rest time yang digunakan, dan saran pemulihan otot.

Jawab HANYA dengan JSON valid format berikut tanpa markdown/teks lain:
{"kcal":0,"fatG":0,"carbG":0,"proteinG":0,"analysis":"isi feedback di sini"}`;

  const raw = await callAI([{ role:'user', content: prompt }], true, 'meta-llama/llama-3.3-70b-versatile');
  
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
  const acts = (getActivities() || {})[dateStr] || [];
  
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
