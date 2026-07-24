// ===== FIREBASE CONFIG (TUGAS USER) =====
// Paste firebaseConfig Anda di dalam kurung kurawal di bawah ini:
const firebaseConfig = {
  apiKey: "AIzaSyAF6xiX9am_Gmv4xf0f1hRZKlV-w7NzIcM",
  authDomain: "lebihfittools.firebaseapp.com",
  databaseURL: "https://lebihfittools-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lebihfittools",
  storageBucket: "lebihfittools.firebasestorage.app",
  messagingSenderId: "842679721902",
  appId: "1:842679721902:web:99f81ad767dc372739323f"
};

let fbDb = null;
let fbAuth = null;
if (firebaseConfig && firebaseConfig.apiKey && typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    fbDb = firebase.database();
    if (firebase.auth) {
        fbAuth = firebase.auth();
    }
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
const getApiKey = () => 'vercel-keys';
const setApiKey = k => {};
const getVisionKey = () => 'vercel-keys';
const setVisionKey = k => {};
const getAssistantKey = () => 'vercel-keys';
const setAssistantKey = k => {};
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
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'openrouter/free'
    ];
    if (!model || oldModels.includes(model)) {
        model = 'llama-3.1-8b-instant';
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

// ===== DAILY AI USAGE LIMIT =====
const AI_DAILY_LIMITS = {
  food_scan: 5,        // 📷 Food Scan (gambar)
  manual_food_ai: 10,  // ✍️ Manual Food AI (teks)
  body_analysis: 2,    // 🧍 Body Analysis
  ai_image: 5,         // 🖼️ AI Assistant + gambar
  ai_text: 10          // 💬 AI Assistant teks
};

async function checkAndIncrementUsage(featureKey) {
  const limit = AI_DAILY_LIMITS[featureKey];
  if (!limit) return { allowed: true, used: 0, limit: 999 };

  const today = todayKey();
  const storageKey = `lf_usage_${today}`;

  // Read current usage from local storage (synced with Firebase)
  let usageToday = DB.get(storageKey) || {};
  const used = usageToday[featureKey] || 0;

  if (used >= limit) {
    return { allowed: false, used, limit };
  }

  // Increment and save
  usageToday[featureKey] = used + 1;
  DB.set(storageKey, usageToday);

  return { allowed: true, used: used + 1, limit };
}

function getUsageSummary() {
  const today = todayKey();
  const storageKey = `lf_usage_${today}`;
  const usageToday = DB.get(storageKey) || {};
  return {
    food_scan: { used: usageToday.food_scan || 0, limit: AI_DAILY_LIMITS.food_scan },
    manual_food_ai: { used: usageToday.manual_food_ai || 0, limit: AI_DAILY_LIMITS.manual_food_ai },
    body_analysis: { used: usageToday.body_analysis || 0, limit: AI_DAILY_LIMITS.body_analysis },
    ai_image: { used: usageToday.ai_image || 0, limit: AI_DAILY_LIMITS.ai_image },
    ai_text: { used: usageToday.ai_text || 0, limit: AI_DAILY_LIMITS.ai_text }
  };
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

// Cache admin list so we don't hit Firebase on every error
let _adminEmailsCache = null;
let _adminEmailsFetchedAt = 0;
const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isCurrentUserAdmin() {
  try {
    const rawEmail = localStorage.getItem('lf_user_email');
    if (!rawEmail) return false;
    const cleanEmail = rawEmail.replace(/"/g, '').trim().toLowerCase();
    if (!cleanEmail) return false;

    // Refresh cache if stale
    const now = Date.now();
    if (!_adminEmailsCache || (now - _adminEmailsFetchedAt) > ADMIN_CACHE_TTL) {
      if (fbDb) {
        const snap = await fbDb.ref('admins').once('value');
        const val = snap.val() || {};
        _adminEmailsCache = Object.keys(val).map(k =>
          k.replace(/_dot_/g, '.').replace(/_at_/g, '@').toLowerCase()
        );
        _adminEmailsFetchedAt = now;
      } else {
        // fbDb not available, fallback: treat nobody as admin
        _adminEmailsCache = [];
      }
    }

    return _adminEmailsCache.includes(cleanEmail);
  } catch (e) {
    console.warn('[getMaskedAIError] Admin check failed:', e);
    return false;
  }
}

function getMaskedAIError(originalError) {
  // Check synchronously from cache first (fast path)
  try {
    const rawEmail = localStorage.getItem('lf_user_email');
    const cleanEmail = rawEmail ? rawEmail.replace(/"/g, '').trim().toLowerCase() : '';
    if (_adminEmailsCache && cleanEmail && _adminEmailsCache.includes(cleanEmail)) {
      return originalError;
    }
  } catch (e) { /* silent */ }

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
    return new Error('LebihFit Tools sedang banyak permintaan. Coba lagi sebentar.');
  } else {
    return new Error('Fitur AI sedang tidak tersedia. Silakan coba beberapa saat lagi.');
  }
}

// Pre-warm admin cache on page load (non-blocking)
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    isCurrentUserAdmin().catch(() => {});
  });
}

async function callAI(messages, json = false, model = 'llama-3.1-8b-instant', isVision = false, isGroqVision = false, retries = 1, fallbackAttempted = false) {
  let endpoint = '/api/ai';
  if (fallbackAttempted || window.location.protocol === 'file:' || (!window.location.hostname.endsWith('.vercel.app') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
    endpoint = 'https://lebihfittools.vercel.app/api/ai';
  }

  const email = (localStorage.getItem('lf_user_email') || 'anonymous').replace(/"/g, '');
  const body = { model, messages, json, isVision, email };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout
  
  let res;
  try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // If local API is not found (404), fallback to production Vercel
      if (res.status === 404 && endpoint === '/api/ai') {
        console.warn("[lebihfit] Local API endpoint not found (404), falling back to production Vercel API...");
        return await callAI(messages, json, model, isVision, isGroqVision, retries, true);
      }
  } catch (err) {
      clearTimeout(timeoutId);
      // If local API connection fails, fallback to production Vercel
      if (endpoint === '/api/ai' && window.location.hostname !== 'lebihfittools.vercel.app') {
        console.warn("[lebihfit] Local API fetch failed, falling back to production Vercel API...", err);
        return await callAI(messages, json, model, isVision, isGroqVision, retries, true);
      }
      if (err.name === 'AbortError') {
          throw getMaskedAIError(new Error('Koneksi ke AI timeout. Cek jaringan/VPN lu bro.'));
      }
      throw getMaskedAIError(err);
  }

  try {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error?.message || `HTTP ${res.status}`;
        
        // Handle Gemini Rate Limits gracefully
        if (res.status === 429 || errMsg.includes('Quota exceeded') || errMsg.includes('retry')) {
           if (retries > 0) {
               console.warn("[lebihfit] Rate limit hit, attempting automatic retry...", errMsg);
               const match = errMsg.match(/retry in ([\d\.]+)s/i);
               let waitMs = 5000; 
               if (match && match[1]) {
                   waitMs = (parseFloat(match[1]) + 1) * 1000;
               }
               if (waitMs > 35000) waitMs = 10000; 
               
               if (typeof showToast === 'function') {
                   showToast(`Sistem AI sedang antre... (Delay ${Math.round(waitMs/1000)}s)`, 'info');
               }
               
               await new Promise(resolve => setTimeout(resolve, waitMs));
               return await callAI(messages, json, model, isVision, isGroqVision, retries - 1);
           }
        }
        throw new Error(errMsg);
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

async function analyzePhotoAI(images, mime = null, userDescription = '', onProgress = null) {
  // =============================================
  // STEP 1: Gemini — Identifikasi nama & berat per komponen
  // =============================================
  if (onProgress) onProgress('🔍 Mengidentifikasi makanan dari foto...');

  let identifyPrompt = `Kamu adalah sistem identifikasi visual makanan yang sangat akurat.
Analisis gambar ini dan identifikasi makanan yang ada di foto.`;

  if (userDescription) {
    identifyPrompt += `\n\nDeskripsi tambahan dari user: "${userDescription}"`;
  }

  identifyPrompt += `

TUGAS UTAMA: Identifikasi nama makanan, estimasi berat (gram) per komponen makanan, dan berat total.
JANGAN menghitung nilai nutrisi di sini.

Instruksi:
1. Jika BUKAN foto makanan/minuman, kembalikan: {"is_food":false}
2. Identifikasi nama makanan secara spesifik dan akurat berdasarkan visual.
   - Jika ada beberapa lauk/komponen (seperti Nasi Rames, Warteg, Bento, dll), identifikasi dan sebutkan rincian masing-masing komponen (misal: Nasi putih, Tempe orek, Tahu goreng, Sayur lodeh).
   - Jangan tambahkan bahan yang TIDAK terlihat di foto (misal: jangan tambahkan "dada ayam" jika tidak terlihat).
3. Estimasi berat total makanan dalam gram secara logis berdasarkan visual porsi.
4. Estimasi berat dalam gram untuk MASING-MASING komponen/lauk yang teridentifikasi secara logis.
5. Catat metode memasak jika terlihat (goreng/rebus/bakar/air-fryer).
6. Kembalikan HANYA JSON ini (tanpa teks lain):
{"is_food":true,"name":"nama makanan spesifik","portion":"estimasi berat total","grams":300,"cooking_method":"goreng/rebus/dll","components":[{"item":"Nama komponen 1","grams":150},{"item":"Nama komponen 2","grams":50}],"notes":"catatan rincian komponen, contoh: Nasi putih (~150g), Tempe orek (~50g), Tahu goreng (~50g)"}`;

  const identifyContent = [{ type: 'text', text: identifyPrompt }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      identifyContent.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } });
    });
  } else {
    identifyContent.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${images}` } });
  }

  let identified;
  try {
    const rawIdentify = await callAI([{ role: 'user', content: identifyContent }], true, 'google/gemini-2.5-flash', true);
    if (!rawIdentify) throw new Error('Gemini tidak mengembalikan data identifikasi.');
    const matchId = rawIdentify.trim().match(/\{[\s\S]*\}/);
    identified = matchId ? JSON.parse(matchId[0]) : JSON.parse(rawIdentify.trim());
  } catch (err) {
    throw getMaskedAIError(new Error('Gagal mengidentifikasi makanan dari foto: ' + err.message));
  }

  if (!identified.is_food) {
    return {
      name: 'Tidak valid', portion: '0g', calculation: 'Bukan foto makanan',
      cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0,
      sodium: 0, calcium: 0, iron: 0, vitC: 0, vitD: 0, zinc: 0,
      notes: 'Foto yang Anda unggah tidak terdeteksi sebagai makanan/minuman. Silakan unggah foto makanan yang jelas.'
    };
  }

  // =============================================
  // STEP 2: Qwen — Hitung makro & mikro nutrisi
  // =============================================
  if (onProgress) onProgress('🧮 Menghitung nutrisi berstandar USDA/TKPI...');

  const foodName = identified.name || 'makanan';
  const grams = identified.grams || 100;
  const cookingMethod = identified.cooking_method || '';
  
  let detailQuery = `${foodName}, total porsi: ${grams}g`;
  if (identified.components && identified.components.length > 0) {
    const detailBahan = identified.components.map(c => `${c.item}: ${c.grams}g`).join(', ');
    detailQuery += ` (rincian bahan: ${detailBahan})`;
  }
  if (cookingMethod) {
    detailQuery += `, cara masak: ${cookingMethod}`;
  }
  if (userDescription) {
    detailQuery += `, catatan: ${userDescription}`;
  }

  const nutritionPrompt = `Kamu adalah kalkulator nutrisi makanan berstandar internasional (USDA FoodData Central & TKPI Indonesia).
Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
Evaluasi kecukupan vitamin/mineral menggunakan AKG Indonesia (RDA Indonesia).

== MAKANAN YANG DIIDENTIFIKASI DARI FOTO ==
${detailQuery}

== INSTRUKSI KALKULASI KETAT ==
1. Cari data gizi per 100g untuk masing-masing komponen bahan di atas dari USDA FoodData Central atau TKPI Indonesia.
2. Hitung gizi tiap komponen bahan secara TERPISAH berdasarkan berat gram masing-masing, lalu JUMLAHKAN hasilnya untuk gizi total.
3. Air Fryer / Oven tanpa minyak = TANPA penambahan lemak/kalori minyak.
4. Goreng = TAMBAHKAN estimasi minyak yang diserap (+6-10g lemak per porsi rata-rata).
5. Perkalian wajib: (Nilai per 100g) × (Berat komponen / 100) untuk SEMUA makro DAN mikro.
6. JANGAN biarkan nilai mikro (sodium, calcium, iron, vitC, vitD, zinc) = 0 kecuali memang benar 0.
7. Bulatkan ke 1 angka desimal.
8. Di bagian "notes", tuliskan kembali rincian detail menu dan gramasi masing-masing lauk yang diidentifikasi dari foto (misal: "Rincian: Nasi putih (150g), Tempe orek (50g), Tahu goreng (50g)").
9. Jawab HANYA JSON valid tanpa teks/markdown:
{"name":"${foodName}","portion":"${grams}g","calculation":"ringkasan perkalian makro+mikro","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"rincian detail menu & gramasi masing-masing lauk"}`;

  try {
    const rawNutrition = await callAI([{ role: 'user', content: nutritionPrompt }], true, 'llama-3.1-8b-instant', false);
    if (!rawNutrition) throw new Error('AI tidak mengembalikan data nutrisi.');
    const matchNu = rawNutrition.trim().match(/\{[\s\S]*\}/);
    const result = matchNu ? JSON.parse(matchNu[0]) : JSON.parse(rawNutrition.trim());
    // Ensure name and portion from Step 1 override
    result.name = result.name || foodName;
    result.portion = result.portion || identified.portion || `${grams}g`;
    return result;
  } catch (err) {
    throw getMaskedAIError(err);
  }
}


async function analyzePhysicalPhotoAI(images, mime, promptText, jsonMode = false) {
  const content = [{ type: 'text', text: promptText }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } });
    });
  } else {
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${images}` } });
  }

  const messages = [{ role: 'user', content }];
  
  try {
    const raw = await callAI(messages, jsonMode, 'google/gemini-2.5-flash', true);
    return raw;
  } catch (err) {
    throw getMaskedAIError(err);
  }
}

function findHistoricalFoodMatch(name) {
  if (!name) return null;
  const cleanName = name.toLowerCase().trim();
  const logs = getLogs();
  
  // Collect unique food items from logs
  const foodMap = new Map();
  for (const date in logs) {
    if (Array.isArray(logs[date])) {
      logs[date].forEach(item => {
        if (item && item.name) {
          const itemKey = item.name.toLowerCase().trim();
          if (!foodMap.has(itemKey)) {
            foodMap.set(itemKey, item);
          }
        }
      });
    }
  }
  
  // Try exact match
  if (foodMap.has(cleanName)) {
    return foodMap.get(cleanName);
  }
  
  // Try partial word match
  const words = cleanName.split(/\s+/).filter(w => w.length > 1);
  if (words.length > 0) {
    for (const [key, item] of foodMap.entries()) {
      const keyWords = key.split(/\s+/);
      const isMatch = words.every(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
      if (isMatch) {
        return item;
      }
    }
  }
  return null;
}

async function analyzeTextAI(name, portion, desc) {
  let historicalContext = '';
  const histMatch = findHistoricalFoodMatch(name);
  if (histMatch) {
    historicalContext = `\n\n== REFERENSI HISTORIS MAKANAN USER (Gunakan data gizi ini sebagai basis dan sesuaikan dengan gram/deskripsi baru): ==
- Nama Makanan: ${histMatch.name} (Porsi lama: ${histMatch.portion || 'tidak ada'})
- Kandungan Gizi Lama: cal: ${histMatch.cal} kcal | protein: ${histMatch.protein}g | carbs: ${histMatch.carbs}g | fat: ${histMatch.fat}g | fiber: ${histMatch.fiber}g | sugar: ${histMatch.sugar}g | sodium: ${histMatch.sodium}mg | calcium: ${histMatch.calcium}mg | iron: ${histMatch.iron}mg | vitC: ${histMatch.vitC}mg | vitD: ${histMatch.vitD}mcg | zinc: ${histMatch.zinc}mg\n`;
  }

  let prompt = `Kamu adalah mesin kalkulator gizi dan database nutrisi makanan berstandar internasional (USDA FoodData Central & TKPI Indonesia).
Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
Referensi kecukupan vitamin/mineral menggunakan AKG Indonesia (RDA Indonesia).

== BAHAN UTAMA & PORSI ==
Nama Makanan: ${name}
Porsi/Berat Baru: ${portion || '1 porsi standar'}
Deskripsi/Cara Masak Baru: ${desc || 'tidak ada deskripsi tambahan'}${historicalContext}

== DATABASE REFERENCE (Per 100g): ==
- Singkong (mentah/rebus/air-fryer tanpa minyak): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
- Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
- Dada Ayam Fillet MENTAH (raw): 120 kcal | Karbo: 0g | Protein: 23g | Lemak: 2.5g | Serat: 0g | Gula: 0g | Sodium: 65mg | Kalsium: 10mg | Besi: 0.7mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.8mg
- Dada Ayam MATANG (rebus/panggang/air-fryer tanpa minyak): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
- Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
- Minyak Goreng / Margarin (per 10g / 1 sdm): 88 kcal | Karbo: 0g | Protein: 0g | Lemak: 10g | Serat: 0g | Gula: 0g | Sodium: 0mg | Kalsium: 0mg | Besi: 0mg | VitC: 0mg | VitD: 0mcg | Zinc: 0mg

== INSTRUKSI KALKULASI SECARA KETAT ==
1. Ekstrak berat porsi baru dalam gram. Jika tidak disebutkan, gunakan estimasi porsi standar.
2. Jika ada REFERENSI HISTORIS MAKANAN USER di atas, gunakan data nutrisi tersebut sebagai basis. Lakukan penskalaan proporsional sesuai perbandingan berat porsi baru vs porsi lama, dan sesuaikan jika ada bumbu atau bahan tambahan/kurangan baru.
3. Jika tidak ada REFERENSI HISTORIS, cari nilai gizi per 100g di database global (USDA FoodData Central / TKPI Indonesia).
4. Mentah vs Matang: kata "fillet/mentah/raw" = mentah, selain itu asumsikan matang.
5. Air Fryer / Oven tanpa minyak = TANPA lemak/kalori minyak goreng.
6. Goreng = TAMBAHKAN minyak (+88 kcal & +10g lemak per 10g minyak yang terserap).
7. MULTI-BAHAN: kalkulasikan tiap bahan TERPISAH lalu JUMLAHKAN. Jangan kalikan berat total dengan gizi satu bahan saja.
8. MIKRONUTRISI: hitung secara realistis untuk sodium, kalsium, besi, vitC, vitD, zinc. JANGAN biarkan bernilai 0 kecuali memang bebas gizi tersebut.
9. Jawab HANYA JSON valid tanpa teks/markdown:
{"calculation":"tuliskan langkah perkalian makro DAN MIKRO (misal: kalori 165*6=990, sodium 74*6=444)","cal":123.4,"protein":12.3,"carbs":45.6,"fat":7.8,"fiber":1.2,"sugar":0.5,"sodium":120.0,"calcium":15.0,"iron":1.1,"vitC":10.0,"vitD":0.0,"zinc":0.8}
Bulatkan 1 angka di belakang koma.`;

  const raw = await callAI([{ role:'user', content: prompt }], true, 'llama-3.1-8b-instant');
  
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
  const raw = await callAI([{ role:'user', content: prompt }], true, 'llama-3.1-8b-instant');
  
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

  const raw = await callAI([{ role:'user', content: prompt }], true, 'llama-3.1-8b-instant');
  
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
