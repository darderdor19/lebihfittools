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
    
    // Listen to global maintenance kill switch
    try {
        fbDb.ref('admins/settings/app_active').on('value', (snap) => {
            const appActive = snap.val();
            const maintenanceOverlay = document.getElementById('maintenanceOverlay');
            if (maintenanceOverlay) {
                if (appActive === false) {
                    maintenanceOverlay.style.display = 'flex';
                } else {
                    maintenanceOverlay.style.display = 'none';
                }
            }
        });
    } catch (e) {
        console.warn('[core] Failed to bind admins/settings/app_active listener:', e);
    }

    // Listen to AI Assistant feature toggle
    try {
        fbDb.ref('admins/settings/ai_active').on('value', (snap) => {
            const aiActive = snap.val();
            // Expose globally for app.js to check
            window.__aiAssistantActive = aiActive !== false;
            // Dispatch custom event so app can react
            document.dispatchEvent(new CustomEvent('aiActiveChanged', { detail: { active: window.__aiAssistantActive } }));
        });
    } catch (e) {
        console.warn('[core] Failed to bind admins/settings/ai_active listener:', e);
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

const getPhysicalAnalysesSafe = () => {
    try {
        let raw = DB.get('lf_physical_analyses');
        if (!raw) return [];
        let arr = [];
        if (Array.isArray(raw)) {
            arr = raw.filter(item => item !== null && item !== undefined);
        } else if (typeof raw === 'object') {
            arr = Object.values(raw).filter(item => item !== null && item !== undefined);
        }
        // Self-healing: if format was not array, rewrite it to array in LocalStorage
        if (raw && !Array.isArray(raw)) {
            localStorage.setItem('lf_physical_analyses', JSON.stringify(arr));
        }
        return arr;
    } catch (e) {
        console.error("Error in getPhysicalAnalysesSafe:", e);
    }
    return [];
};

const getAnalysisHistorySafe = () => {
    try {
        let raw = DB.get('lf_analysis_history');
        if (!raw) return [];
        let arr = [];
        if (Array.isArray(raw)) {
            arr = raw.filter(item => item !== null && item !== undefined);
        } else if (typeof raw === 'object') {
            arr = Object.values(raw).filter(item => item !== null && item !== undefined);
        }
        // Self-healing: if format was not array, rewrite it to array in LocalStorage
        if (raw && !Array.isArray(raw)) {
            localStorage.setItem('lf_analysis_history', JSON.stringify(arr));
        }
        return arr;
    } catch (e) {
        console.error("Error in getAnalysisHistorySafe:", e);
    }
    return [];
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
        model = 'gpt-4o-mini';
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
  // Check if user has unlimited limit set by admin
  const userMeta = DB.get('lf_user_meta') || {};
  if (userMeta.unlimitedLimit || userMeta.isUnlimited) {
    return { allowed: true, used: 0, limit: '∞' };
  }

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
  const userMeta = DB.get('lf_user_meta') || {};
  const isUnlimited = !!(userMeta.unlimitedLimit || userMeta.isUnlimited);
  const today = todayKey();
  const storageKey = `lf_usage_${today}`;
  const usageToday = DB.get(storageKey) || {};
  
  if (isUnlimited) {
    return {
      food_scan: { used: usageToday.food_scan || 0, limit: '∞ (Bebas)' },
      manual_food_ai: { used: usageToday.manual_food_ai || 0, limit: '∞ (Bebas)' },
      body_analysis: { used: usageToday.body_analysis || 0, limit: '∞ (Bebas)' },
      ai_image: { used: usageToday.ai_image || 0, limit: '∞ (Bebas)' },
      ai_text: { used: usageToday.ai_text || 0, limit: '∞ (Bebas)' }
    };
  }

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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function safeParseAIJson(rawStr) {
  if (!rawStr) return null;
  let clean = typeof rawStr === 'string' ? rawStr.trim() : String(rawStr).trim();
  
  // 1. Strip markdown code fencing
  clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  // 2. Extract JSON object substring if surrounded by extra text
  const match = clean.match(/\{[\s\S]*/);
  if (match) clean = match[0];

  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace !== -1) {
    clean = clean.substring(0, lastBrace + 1);
  }

  // 3. Clean inline parenthetical notes inside value strings or invalid comments
  // e.g. "status": "Improve" (atau "Stagnan") -> "status": "Improve"
  clean = clean.replace(/("\s*:\s*"[^"]*")\s*\([^)]*\)/g, '$1');

  // 4. Clean trailing commas before closing braces/brackets
  clean = clean.replace(/,\s*([\}\]])/g, '$1');

  // 5. Try standard JSON.parse
  try {
    return JSON.parse(clean);
  } catch (e1) {
    // 6. Repair unescaped newlines inside JSON string literals
    let repaired = clean.replace(/[\r\n]+/g, " ");
    repaired = repaired.replace(/,\s*([\}\]])/g, '$1');
    repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

    try {
      return JSON.parse(repaired);
    } catch (e2) {
      // 7. Ultimate Fallback: Use JS object literal evaluator if standard JSON parsing fails
      try {
        const fn = new Function('return (' + clean + ')');
        const obj = fn();
        if (obj && typeof obj === 'object') return obj;
      } catch (e3) {
        // Fallback failed
      }
      console.error('[safeParseAIJson] All parse attempts failed:', rawStr, e1);
      return null;
    }
  }
}

function fallbackPhysicalAnalysisObject(rawText) {
  const cleanDesc = typeof rawText === 'string' && rawText.length > 10 
    ? rawText.replace(/```json|```/gi, '').trim() 
    : "Evaluasi fisik AI berhasil diproses berdasarkan data visual dan aktivitas Anda.";

  return {
    comparisonWithPrevious: {
      hasPrevious: false,
      status: "Improve",
      score: 85,
      explanation: cleanDesc
    },
    progressiveOverload: {
      score: 85,
      status: "Optimal",
      explanation: "Pertahankan intensitas latihan beban dan lakukan progressive overload secara bertahap."
    },
    ringkasanSederhana: {
      pros: ["Massa otot terjaga dengan baik", "Defisit kalori berjalan sesuai target"],
      cons: ["Optimalkan durasi waktu istirahat"],
      focus: "Tidur + Asupan Protein + Latihan Beban"
    },
    targetMakro: {
      cal: 2000,
      protein: 165,
      carbs: 180,
      fat: 60,
      fiber: "25-35g",
      water: "3 Liter"
    },
    makananRekomendasi: {
      category: "Sumber Protein & Nutrisi Direkomendasikan",
      foods: ["Dada ayam", "Telur utuh", "Ikan salmon", "Nasi merah", "Alpukat", "Sayur hijau"]
    },
    prioritasPerbaikan: [
      { label: "Istirahat", impact: "Tinggi", desc: "Pastikan istirahat & tidur 7-8 jam per hari untuk pemulihan otot." },
      { label: "Hidrasi", impact: "Sedang", desc: "Konsumsi air minimal 3 Liter sehari." }
    ],
    perkiraanGoal: {
      currentBF: "15-18%",
      targetBF: "10-12%",
      weeks: "8-12 minggu",
      "desc": "Dengan konsistensi tinggi pada program defisit kalori dan latihan beban."
    },
    kesalahanTerbesar: [
      "Waktu istirahat belum maksimal",
      "Asupan air putih perlu ditingkatkan"
    ],
    analisisRisiko: {
      muscleLoss: "Rendah",
      plateau: "Sedang",
      recoveryDisruption: "Rendah",
      notes: "Risiko pemulihan terganggu rendah dengan menjaga kualitas tidur dan nutrisi seimbang."
    },
    estimasiFisik30Hari: {
      waist: "turun 1-3 cm",
      weight: "turun 1-2.5 kg",
      bodyFat: "turun 1-2%",
      "desc": "Definisi dan sharpness otot akan terlihat semakin jelas."
    },
    nutrisiBerpotensiKurang: [
      { name: "Vitamin D", sources: ["Salmon", "Susu", "Telur", "Sinar matahari"] },
      { name: "Magnesium", sources: ["Bayam", "Kacang-kacangan", "Cokelat hitam"] }
    ],
    recoveryScore: {
      sleep: 75,
      protein: 90,
      calorie: 90,
      training: 85,
      total: 85
    }
  };
}

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
  const msg = String(originalError?.message || originalError || '');
  const lowerMsg = msg.toLowerCase();
  
  if (lowerMsg.includes('api key') || lowerMsg.includes('environment variable') || lowerMsg.includes('konfigurasi') || lowerMsg.includes('pasang')) {
    return originalError;
  }

  const isRateLimit =
    lowerMsg.includes('429') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('exhausted') ||
    lowerMsg.includes('too many requests') ||
    lowerMsg.includes('capacity') ||
    lowerMsg.includes('busy') ||
    lowerMsg.includes('overloaded') ||
    lowerMsg.includes('limit exceeded') ||
    lowerMsg.includes('tokens');

  if (isRateLimit) {
    return new Error('LebihFit Tools sedang banyak permintaan (Quota Exceeded / Rate Limit). Coba lagi sebentar.');
  } else if (msg && !lowerMsg.includes('object object') && msg.length > 5 && msg.length < 200) {
    return originalError;
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

async function callAI(messages, json = false, model = 'gpt-4o-mini', isVision = false, isGroqVision = false, retries = 1, fallbackAttempted = false, maxTokens = null) {
  let endpoint = '/api/ai';
  if (fallbackAttempted || window.location.protocol === 'file:' || (!window.location.hostname.endsWith('.vercel.app') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
    endpoint = 'https://lebihfittools.vercel.app/api/ai';
  }

  const email = (localStorage.getItem('lf_user_email') || 'anonymous').replace(/"/g, '');
  const body = { model, messages, json, isVision, email, max_tokens: maxTokens };
  
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
        
        // Handle Gemini Rate Limits & 503 Server Glitches gracefully
        const isTransientStatus = [429, 500, 502, 503, 504].includes(res.status);
        if (isTransientStatus || errMsg.includes('Quota exceeded') || errMsg.includes('retry') || errMsg.includes('503')) {
           if (retries > 0) {
               console.warn("[lebihfit] Transient/Rate limit error hit, attempting automatic retry...", errMsg);
               const match = errMsg.match(/retry in ([\d\.]+)s/i);
               let waitMs = 3000; 
               if (match && match[1]) {
                   waitMs = (parseFloat(match[1]) + 1) * 1000;
               }
               if (waitMs > 35000) waitMs = 10000; 
               
               if (typeof showToast === 'function') {
                   showToast(`Sistem AI sedang padat... Menghubungkan ulang...`, 'info');
               }
               
               await new Promise(resolve => setTimeout(resolve, waitMs));
               return await callAI(messages, json, model, isVision, isGroqVision, retries - 1, fallbackAttempted, maxTokens);
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

function formatImageUrlPayload(img, defaultMime = 'image/jpeg') {
  let rawBase64 = '';
  let mime = defaultMime;

  if (typeof img === 'string') {
    if (img.startsWith('data:')) {
      const parts = img.split(',');
      mime = parts[0].split(':')[1].split(';')[0];
      rawBase64 = parts[1];
    } else {
      rawBase64 = img;
    }
  } else if (img && typeof img === 'object') {
    mime = img.mime || defaultMime;
    const src = String(img.base64 || img.url || '');
    if (src.startsWith('data:')) {
      const parts = src.split(',');
      if (parts[0] && parts[0].includes('image/')) {
        mime = parts[0].split(':')[1].split(';')[0];
      }
      rawBase64 = parts[1];
    } else {
      rawBase64 = src;
    }
  }

  return { type: 'image_url', image_url: { url: `data:${mime};base64,${rawBase64}` } };
}

async function analyzePhotoAI(images, mime = null, userDescription = '', onProgress = null) {
  // =============================================
  // STEP 1: Gemini — Identifikasi nama & berat per komponen
  // =============================================
  if (onProgress) onProgress('🔍 Mengidentifikasi makanan dari foto...');

  let identifyPrompt = `Kamu adalah sistem identifikasi visual makanan & gizi yang sangat berpengalaman dan presisi.
Analisis gambar ini dan identifikasi seluruh makanan/lauk yang terlihat.`;

  if (userDescription) {
    identifyPrompt += `\n\nDeskripsi tambahan dari user: "${userDescription}"`;
  }

  identifyPrompt += `

TUGAS UTAMA: Identifikasi nama makanan, estimasi berat (gram) matang per komponen/lauk, dan estimasi berat total.
JANGAN menghitung nilai nutrisi (kalori/makro/mikro) di sini.

GUIDELINE ESTIMASI PORSI KULINER INDONESIA (GUNAKAN STANDAR PRESISI INI):
- Nasi Putih / Merah Matang: 1 centong sedang = ~100g (~130 kcal). 1 centong munjung / 1 piring warteg = ~150g - 200g.
- Tempe / Tahu Goreng / Bacem: 1 potong sedang = ~40g - 50g.
- Ayam Goreng / Bakar (Dada/Paha dengan tulang): ~100g - 120g (daging bersih ~80g).
- Telur Ayam (Ceplok / Dadar): ~50g - 60g (dengan serapan minyak goreng ~70g).
- Daging Sapi / Rendang / Empal: 1 potong = ~50g - 70g.
- Ikan Goreng / Bakar: 1 ekor/potong sedang = ~80g - 120g.
- Sayur Tumis / Kuah (Kangkung, Capcay, Sup): ~60g - 100g per porsi.
- Gorengan (Bakwan, Mendoan, Tahu isi): 1 biji = ~50g (sangat berminyak).

Instruksi:
1. Jika BUKAN foto makanan/minuman, kembalikan: {"is_food":false}
2. Identifikasi nama makanan secara spesifik dan akurat berdasarkan visual.
   - Jika ada beberapa lauk/komponen (seperti Nasi Rames, Warteg, Bento, Padang, dll), identifikasi dan sebutkan rincian masing-masing komponen (misal: Nasi putih matang, Tempe orek basah, Tahu goreng, Sayur kangkung).
   - Jangan tambahkan bahan yang TIDAK terlihat di foto.
3. Estimasi berat total makanan dalam gram MATANG secara logis berdasarkan visual porsi.
4. Estimasi berat dalam gram MATANG untuk MASING-MASING komponen/lauk yang teridentifikasi.
5. Catat metode memasak & indikator minyak (Deep Fried / Tumis Minyak / Santan / Panggang / Rebus / Kukus / Air-fryer).
6. Kembalikan HANYA JSON ini (tanpa teks lain):
{"is_food":true,"name":"nama makanan spesifik","portion":"estimasi berat total","grams":300,"cooking_method":"goreng/rebus/dll","components":[{"item":"Nama komponen 1","grams":150},{"item":"Nama komponen 2","grams":50}],"notes":"catatan rincian komponen, contoh: Nasi putih (~150g), Tempe orek (~50g), Tahu goreng (~50g)"}`;

  const identifyContent = [{ type: 'text', text: identifyPrompt }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      identifyContent.push(formatImageUrlPayload(img, mime));
    });
  } else {
    identifyContent.push(formatImageUrlPayload(images, mime));
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
  // STEP 2: GPT-4o-mini — Hitung makro & mikro nutrisi
  // =============================================
  if (onProgress) onProgress('🧮 Menghitung nutrisi berstandar USDA/TKPI...');

  // Extract portion multiplier from userDescription (e.g. "gua makan 4 porsi dan level 8" -> 4x)
  let portionMultiplier = 1;
  if (userDescription) {
    const matchPortion = userDescription.match(/(\d+)\s*(porsi|piring|mangkuk|mangkok|buah|biji|potong|pcs|butir|centong|gelas|x|kali)/i);
    if (matchPortion) {
      const parsedNum = parseInt(matchPortion[1], 10);
      if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 20) {
        portionMultiplier = parsedNum;
      }
    }
  }

  const foodName = identified.name || 'makanan';
  const singlePortionGrams = identified.grams || 100;
  const totalGrams = singlePortionGrams * portionMultiplier;
  const cookingMethod = identified.cooking_method || '';
  
  let detailQuery = `${foodName}, berat 1 porsi visual: ${singlePortionGrams}g, JUMLAH PORSI YANG DIMAKAN USER: ${portionMultiplier} PORSI (TOTAL BERAT: ${totalGrams}g).`;
  if (identified.components && identified.components.length > 0) {
    const detailBahan = identified.components.map(c => `${c.item}: ${c.grams * portionMultiplier}g (${c.grams}g x ${portionMultiplier} porsi)`).join(', ');
    detailQuery += ` (rincian bahan total untuk ${portionMultiplier} porsi: ${detailBahan})`;
  }
  if (cookingMethod) {
    detailQuery += `, cara masak: ${cookingMethod}`;
  }
  if (userDescription) {
    detailQuery += `, catatan khusus user: "${userDescription}"`;
  }

  const nutritionPrompt = `Kamu adalah kalkulator nutrisi makanan berstandar internasional (USDA FoodData Central & TKPI Indonesia Kemenkes).
Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
Evaluasi kecukupan vitamin/mineral menggunakan AKG Indonesia (RDA Indonesia).

== MAKANAN YANG DIIDENTIFIKASI DARI FOTO ==
${detailQuery}

== ATURAN KALKULASI PRESISI TINGGI (>95% AKURASI & DESKRIPSI USER) ==
1. SINKRONISASI DESKRIPSI USER:
   - User menegaskan makan sebanyak: ${portionMultiplier} PORSI (Total Berat: ${totalGrams}g).
   - SELURUH NILAI NUTRISI (KALORI, PROTEIN, KARBOHIDRAT, LEMAK, MIKRONUTRISI & SODIUM) WAJIB DIKALIKAN TOTAL ${portionMultiplier} PORSI!
   - Jika deskripsi user menyebutkan Level pedas (misal Level 8), tambahkan minyak cabai (+6g lemak/porsi) dan sodium bumbu pedas/kecap asin (+1.200mg sodium/porsi).
2. Cari data gizi per 100g MATANG untuk masing-masing komponen bahan dari TKPI Indonesia / USDA FoodData Central.
3. Hitung gizi tiap komponen bahan secara TERPISAH berdasarkan berat total ${portionMultiplier} porsi, lalu JUMLAHKAN hasilnya.
4. ATURAN PENGOLAHAN & MINYAK:
   - Deep Fried / Goreng Tepung / Gorengan: Tambahkan +10g lemak minyak (+90 kcal) per 100g porsi gorengan.
   - Tumisan / Goreng Biasa: Tambahkan +5g lemak minyak (+45 kcal) per porsi.
   - Santan / Gulai: Tambahkan +8g lemak santan (+72 kcal) per 100g kuah.
5. Perkalian wajib: (Nilai per 100g) × (Berat total komponen / 100) untuk SEMUA makro DAN MIKRO.
6. Bulatkan ke 1 angka desimal.
7. Di bagian "notes", tuliskan rincian detail menu dan gramasi masing-masing lauk untuk total ${portionMultiplier} porsi.
8. Jawab HANYA JSON valid tanpa teks/markdown:
{"name":"${foodName}","portion":"${portionMultiplier > 1 ? portionMultiplier + ' porsi (' + totalGrams + 'g)' : totalGrams + 'g'}","calculation":"ringkasan perkalian makro+mikro untuk ${portionMultiplier} porsi","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"rincian detail menu & gramasi masing-masing lauk untuk ${portionMultiplier} porsi"}`;

  try {
    const rawNutrition = await callAI([{ role: 'user', content: nutritionPrompt }], true, 'gpt-4o-mini', false);
    if (!rawNutrition) throw new Error('AI tidak mengembalikan data nutrisi.');
    const matchNu = rawNutrition.trim().match(/\{[\s\S]*\}/);
    const result = matchNu ? JSON.parse(matchNu[0]) : JSON.parse(rawNutrition.trim());
    // Ensure name and portion from Step 1 override
    result.name = result.name || foodName;
    result.portion = portionMultiplier > 1 ? `${portionMultiplier} porsi (${totalGrams}g)` : (result.portion || `${totalGrams}g`);
    return result;
  } catch (err) {
    throw getMaskedAIError(err);
  }
}


async function analyzePhysicalPhotoAI(images, mime, promptText, jsonMode = false) {
  const content = [{ type: 'text', text: promptText }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      content.push(formatImageUrlPayload(img, mime));
    });
  } else {
    content.push(formatImageUrlPayload(images, mime));
  }

  const messages = [{ role: 'user', content }];
  
  try {
    const raw = await callAI(messages, jsonMode, 'google/gemini-2.5-flash', true, false, 1, false, 3500);
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

  let prompt = `Kamu adalah mesin kalkulator gizi & database nutrisi makanan berstandar internasional (USDA FoodData Central & TKPI Indonesia Kemenkes).
Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
Referensi kecukupan vitamin/mineral menggunakan AKG Indonesia (RDA Indonesia).

== BAHAN UTAMA & PORSI ==
Nama Makanan: ${name}
Porsi/Berat Baru: ${portion || '1 porsi standar'}
Deskripsi/Cara Masak Baru: ${desc || 'tidak ada deskripsi tambahan'}${historicalContext}

== STANDAR PORSI & ACUAN KULINER INDONESIA ==
- Mie Gacoan / Mie Pedas / Mie Ayam / Mie Goreng: 1 porsi = ~150g - 200g matang (~350 - 450 kcal | Karbo: 55g - 65g | Protein: 10g - 14g | Lemak: 12g - 18g). 4 porsi = ~1400 - 1800 kcal, Karbo ~220g - 260g, Protein ~40g - 56g.
- Nasi Putih / Merah Matang: 1 centong = ~100g (~130 kcal, Karbo 28g). 1 piring warteg/padang = ~150g - 200g (~200 - 260 kcal).
- Nasi Goreng Spesial / Padang: 1 piring = ~250g (~450 - 600 kcal | Karbo: 65g - 85g | Protein: 12g - 18g | Lemak: 15g - 22g).
- Tempe / Tahu Goreng: 1 potong = ~40g - 50g (~80 - 110 kcal, 5 - 8g protein, 4 - 6g lemak).
- Ayam Goreng / Bakar (Paha/Dada): 1 potong = ~100g (~165 - 220 kcal, 25 - 30g protein).
- Telur Ayam (Ceplok/Dadar/Rebus): 1 butir = ~50g - 60g (~78 - 110 kcal, 6.3g protein).
- Daging Sapi / Rendang: 1 potong = ~60g - 70g (~160 - 220 kcal, 18 - 22g protein).
- Gorengan (Bakwan, Mendoan, Tahu isi): 1 biji = ~50g (~140 - 180 kcal, 10 - 14g lemak dari minyak).
- Minuman Manis (Es Teh / Kopi Susu): 1 gelas = ~250ml (gula 15 - 25g = ~60 - 100 kcal).

== DATABASE REFERENCE (Per 100g MATANG): ==
- Singkong (rebus/kukus/air-fryer tanpa minyak): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
- Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
- Dada Ayam Fillet MENTAH (raw): 120 kcal | Karbo: 0g | Protein: 23g | Lemak: 2.5g | Serat: 0g | Gula: 0g | Sodium: 65mg | Kalsium: 10mg | Besi: 0.7mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.8mg
- Dada Ayam MATANG (rebus/panggang/air-fryer tanpa minyak): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
- Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
- Minyak Goreng / Margarin (per 10g / 1 sdm): 88 kcal | Karbo: 0g | Protein: 0g | Lemak: 10g | Serat: 0g | Gula: 0g | Sodium: 0mg | Kalsium: 0mg | Besi: 0mg | VitC: 0mg | VitD: 0mcg | Zinc: 0mg

== INSTRUKSI KALKULASI SECARA KETAT & PRESISI (>95% AKURASI) ==
1. Ekstrak berat porsi baru dalam gram matang. Gunakan acuan porsi Indonesia di atas jika berbentuk porsi/biji/potong.
2. Jika ada REFERENSI HISTORIS MAKANAN USER di atas, gunakan data nutrisi tersebut sebagai basis. Lakukan penskalaan proporsional sesuai perbandingan berat porsi baru vs porsi lama.
3. Jika tidak ada REFERENSI HISTORIS, cari nilai gizi per 100g di database global (TKPI Indonesia / USDA FoodData Central).
4. ATWATER LOGIC & INTEGRITY:
   - Makanan berbasis MIE / NASI / TEPUNG / GANDUM / ROTI / SINGKONG DIHARAMKAN memiliki Karbohidrat 0g! Karbohidrat WAJIB DOMINAN.
   - Total Kalori = (Protein × 4) + (Karbohidrat × 4) + (Lemak × 9).
5. ATURAN KHUSUS SODIUM / NATRIUM / BUMBU MSG:
   - Mie Instan / Mie Pedas Resto (Mie Gacoan, Mie Pedas Level, Mie Ayam): 1 porsi = ~1.200mg - 1.600mg Sodium (bumbu gurih, kecap asin, cabai & MSG). 4 porsi = ~4.800mg - 6.400mg Sodium! Wajib dikalikan jumlah porsi!
   - Sup / Soto / Bakso Kuah / Ramen: 1 porsi = ~1.000mg - 1.500mg Sodium.
   - Olahan Berbumbu / Sambal / Kecap: 1 porsi = ~500mg - 900mg Sodium.
   - Makanan Polos Tanpa Garam (Nasi Putih / Rebusan Polos): ~10mg - 80mg Sodium per 100g.
6. Mentah vs Matang: kata "fillet/mentah/raw" = mentah, selain itu wajib asumsikan matang.
7. PENGOLAHAN MINYAK:
   - Deep Fried / Goreng Tepung / Gorengan: Tambahkan +10g lemak (+90 kcal) per 100g item.
   - Tumis / Goreng Biasa: Tambahkan +5g lemak (+45 kcal) per porsi.
   - Santan / Gulai: Tambahkan +8g lemak (+72 kcal) per 100g.
   - Air Fryer / Rebus / Kukus / Panggang tanpa minyak = TANPA lemak/kalori minyak goreng.
8. MULTI-BAHAN & MULTI-PORSI: kalkulasikan tiap porsi/bahan TERPISAH lalu WAKTU DIKALIKAN JUMLAH PORSI KESELURUHAN.
9. MIKRONUTRISI: hitung secara realistis untuk sodium, kalsium, besi, vitC, vitD, zinc. JANGAN biarkan bernilai 0 kecuali memang bebas gizi tersebut.
10. Jawab HANYA JSON valid tanpa teks/markdown:
{"calculation":"tuliskan perkalian makro DAN MIKRO (misal: Mie Gacoan 4 porsi = 4 x 400 = 1600 kcal, Sodium = 4 x 1350mg = 5400mg)","cal":1600.0,"protein":48.0,"carbs":240.0,"fat":52.0,"fiber":8.0,"sugar":12.0,"sodium":5400.0,"calcium":120.0,"iron":8.0,"vitC":0.0,"vitD":0.0,"zinc":4.0}
Bulatkan 1 angka di belakang koma.`;

  const raw = await callAI([{ role:'user', content: prompt }], true, 'gpt-4o-mini');
  
  if (!raw) throw new Error("AI tidak mengembalikan data.");
  try {
    const data = safeParseAIJson(raw);
    if (!data) throw new Error("Format JSON tidak valid");
    return data;
  } catch (e) {
    console.error("Parse Error. Raw data:", raw, e);
    throw new Error("Gagal membaca hasil analisis nutrisi. Silakan coba lagi.");
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
  const raw = await callAI([{ role:'user', content: prompt }], true, 'gpt-4o-mini');
  
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

  const raw = await callAI([{ role:'user', content: prompt }], true, 'gpt-4o-mini');
  
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
