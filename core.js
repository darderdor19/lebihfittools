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
    try {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('lf_')) {
                localStorage.removeItem(key);
            }
        });
    } catch (e) {}
    try {
        if (typeof fbAuth !== 'undefined' && fbAuth && fbAuth.currentUser) {
            fbAuth.signOut().catch(() => {});
        }
    } catch (e) {}
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

  const nutritionSystemMsg = {
    role: 'system',
    content: `Kamu adalah mesin kalkulator gizi presisi tinggi berstandar internasional (USDA FoodData Central & TKPI Indonesia Kemenkes 2019).
Tugasmu HANYA menghitung nutrisi dari data visual yang diberikan.
Gunakan Atwater: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
SEMUA NILAI MIKRO WAJIB DIHITUNG — DILARANG default 0 tanpa kalkulasi.
WAJIB: Jawab HANYA JSON valid. DILARANG teks/markdown di luar JSON.`
  };

  const nutritionPrompt = `Kamu adalah kalkulator nutrisi makanan presisi tinggi berstandar internasional (USDA FoodData Central & TKPI Indonesia Kemenkes).
Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.

== MAKANAN YANG DIIDENTIFIKASI DARI FOTO ==
${detailQuery}

== DATABASE REFERENCE CEPAT (Per 100g MATANG) ==
- Nasi Putih: 130 kcal|K:28g|P:2.7g|L:0.3g|Serat:0.4g|Na:1mg|Ca:10mg|Fe:1.2mg|VitC:0|VitD:0|Zn:0.5mg
- Mie Telur Matang: 138 kcal|K:25g|P:4.5g|L:2g|Serat:1g|Na:6mg|Ca:10mg|Fe:1.4mg|VitC:0|VitD:0|Zn:0.5mg
- Dada Ayam Matang: 165 kcal|K:0g|P:31g|L:3.6g|Na:74mg|Ca:15mg|Fe:1mg|VitD:0|Zn:1mg
- Paha Ayam Matang: 209 kcal|K:0g|P:26g|L:10.9g|Na:84mg|Ca:11mg|Fe:1.3mg|VitD:0.1mcg|Zn:2.7mg
- Telur Rebus (per 100g): 155 kcal|K:1.1g|P:13g|L:11g|Na:124mg|Ca:50mg|Fe:1.8mg|VitD:2.2mcg|Zn:1.3mg
- Daging Sapi Matang: 250 kcal|K:0g|P:26g|L:15g|Na:72mg|Ca:18mg|Fe:2.6mg|VitD:0.1mcg|Zn:6.3mg
- Tempe: 193 kcal|K:8.7g|P:20.7g|L:11g|Serat:1.4g|Na:9mg|Ca:111mg|Fe:2.7mg|VitD:0|Zn:1.8mg
- Tahu Putih: 76 kcal|K:1.9g|P:8g|L:4.2g|Na:7mg|Ca:350mg|Fe:5.4mg|VitC:0.2mg|Zn:0.8mg
- Ikan Nila/Mujair Matang: 128 kcal|K:0g|P:26g|L:2.7g|Na:56mg|Ca:14mg|Fe:0.7mg|VitD:3.1mcg|Zn:0.4mg
- Ikan Lele Goreng: 230 kcal|K:0g|P:18g|L:17g|Na:60mg|Ca:15mg|Fe:0.6mg|Zn:0.7mg
- Udang Matang: 99 kcal|K:0.2g|P:24g|L:0.3g|Na:111mg|Ca:52mg|Fe:0.3mg|Zn:1.6mg
- Kangkung Tumis: 30 kcal|K:3g|P:2.6g|L:0.5g|Serat:2.1g|Na:50mg|Ca:77mg|Fe:2.5mg|VitC:30mg|Zn:0.2mg
- Bayam Rebus: 23 kcal|K:3.6g|P:2.9g|L:0.3g|Serat:2.2g|Na:70mg|Ca:136mg|Fe:3.6mg|VitC:10mg|Zn:0.8mg
- Sambal Terasi (15g/1sdm): 15 kcal|K:2g|P:0.5g|L:0.5g|Na:350mg|VitC:5mg
- Santan Kental (100ml): 230 kcal|K:6g|P:2.3g|L:24g|Na:15mg|Ca:16mg|Fe:1.6mg|Zn:0.7mg
- Minyak Goreng (10g/1sdm): 88 kcal|L:10g

== ATURAN KALKULASI PRESISI TINGGI (>97% AKURASI) ==
1. SINKRONISASI PORSI: User makan ${portionMultiplier} PORSI (Total: ${totalGrams}g). SEMUA NILAI NUTRISI WAJIB DIKALIKAN ${portionMultiplier} PORSI.
2. Cari nilai per 100g MATANG di database di atas atau TKPI/USDA untuk setiap komponen.
3. Hitung tiap komponen TERPISAH: (nilai per 100g) × (gram total / 100). Lakukan untuk SEMUA 12 field nutrisi.
4. MULTI-BAHAN: Jumlahkan semua komponen setelah dihitung terpisah.
5. ATWATER INTEGRITY: Makanan berbasis mie/nasi/tepung/roti WAJIB Karbo > 0 (BUKAN 0g).
6. SODIUM RULES:
   - Mie pedas/Resto: 1 porsi = 1200–1600mg. Sup/Soto: 900–1400mg. Bumbu/sambal: 500–900mg.
   - Makanan polos/rebusan tanpa garam: 10–80mg per 100g.
7. MINYAK & PENGOLAHAN:
   - Deep Fried/Goreng Tepung: +10g lemak (+90 kcal) per 100g porsi.
   - Tumis/Goreng Biasa: +5g lemak (+45 kcal) per porsi.
   - Santan/Gulai: +8g lemak (+72 kcal) per 100g.
   - Air Fryer/Rebus/Kukus/Panggang: TANPA tambahan lemak.
8. Level pedas Resto (Level 8 dll): Tambah +6g lemak/porsi (minyak cabai) + +1200mg sodium/porsi.
9. MICRONUTRIENT WAJIB DIHITUNG (DILARANG ASAL 0):
   - fiber: Sayuran 2–4g/100g, buah 1–3g/100g, nasi 0.3–0.5g/100g.
   - sugar: Minuman manis 15–25g/gelas, buah 8–15g/100g.
   - calcium: Tahu 350mg/100g, susu 113mg/100ml, tempe 111mg/100g, ikan 10–50mg/100g.
   - iron: Daging merah 2–3mg/100g, bayam 3.6mg/100g, tempe 2.7mg/100g.
   - vitC: Jeruk/pepaya 40–60mg/100g, sayur hijau 10–65mg/100g, daging/telur ~0.
   - vitD: Ikan berlemak 3–11mcg/100g, telur 2.2mcg/100g, susu 1.3mcg/100ml.
   - zinc: Daging sapi 6mg/100g, keju 3mg/100g, tempe 1.8mg/100g.
10. COMMON MISTAKES (HINDARI):
   - Goreng tapi lemak < 5g → SALAH. Sayuran/buah tapi fiber = 0 → SALAH.
   - Susu/keju tapi calcium = 0 → SALAH. Ikan/telur tapi vitD = 0 → SALAH.
   - Mie/nasi tapi karbo = 0 → SALAH. Resto tapi sodium < 100mg → SALAH.
11. VERIFIKASI: cal HARUS ≈ (protein×4)+(carbs×4)+(fat×9) ±5%. Koreksi jika tidak sesuai.
12. Bulatkan ke 1 angka desimal.
13. Jawab HANYA JSON valid (tanpa teks/markdown di luar JSON):
{"name":"${foodName}","portion":"${portionMultiplier > 1 ? portionMultiplier + ' porsi (' + totalGrams + 'g)' : totalGrams + 'g'}","calculation":"WAJIB ISI: rincian perkalian per komponen untuk semua 12 field nutrisi","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"rincian detail bahan & gram untuk ${portionMultiplier} porsi"}`;

  try {
    const rawNutrition = await callAI([nutritionSystemMsg, { role: 'user', content: nutritionPrompt }], true, 'gpt-4o-mini', false);
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
  const systemMsg = {
    role: 'system',
    content: `Kamu adalah mesin kalkulator gizi presisi tinggi berstandar internasional (USDA FoodData Central & TKPI Indonesia Kemenkes 2019).
Tugasmu HANYA menghitung nilai gizi berdasarkan data yang diberikan.
Gunakan Atwater Factors: Protein=4 kcal/g, Karbo=4 kcal/g, Lemak=9 kcal/g.
WAJIB: Jawab HANYA dengan JSON valid. DILARANG menambahkan teks, penjelasan, atau markdown di luar JSON.
SEMUA NILAI MIKRO WAJIB DIHITUNG — DILARANG default 0 tanpa kalkulasi.`
  };

  const prompt = `== INPUT MAKANAN ==
Nama Makanan: ${name}
Porsi/Berat: ${portion || '1 porsi standar Indonesia'}
Deskripsi/Cara Masak: ${desc || 'standar'}

== STANDAR PORSI KULINER INDONESIA (ACUAN PRESISI) ==
- Nasi Putih/Merah Matang: 1 centong = ~100g (~130 kcal). 1 piring warteg/padang = ~150–200g (~200–260 kcal).
- Nasi Goreng Spesial: 1 piring = ~250g (~450–600 kcal | K:65–85g | P:12–18g | L:15–22g).
- Mie Gacoan/Mie Pedas/Mie Ayam: 1 porsi = ~170g matang (~380–450 kcal | K:60g | P:12g | L:15g | Na:1200–1600mg).
- Tempe/Tahu Goreng: 1 potong = ~45g (~90 kcal, 6g protein, 5g lemak).
- Ayam Goreng/Bakar (Paha/Dada): 1 potong = ~110g (~200 kcal, 28g protein).
- Telur Ayam Ceplok/Dadar: 1 butir = ~55g (~100 kcal, 6.3g protein, 7g lemak).
- Telur Rebus: 1 butir = ~50g (~78 kcal, 6.3g protein, 5.3g lemak).
- Daging Sapi/Rendang: 1 potong = ~65g (~185 kcal, 20g protein).
- Gorengan (Bakwan, Mendoan, Tahu Isi): 1 biji = ~50g (~160 kcal, 12g lemak).
- Minuman Manis (Es Teh/Kopi Susu): 1 gelas = ~250ml (~80–120 kcal, gula 15–25g).
- Ikan Goreng: 1 potong = ~100g (~200 kcal, P:20g, L:12g).
- Udang Goreng Tepung: 1 porsi = ~100g (~230 kcal, P:18g, L:14g).
- Soto Ayam + Nasi: 1 mangkuk = ~400ml kuah + lauk (~350 kcal, Na:900–1300mg).
- Bakso + Mie: 1 mangkuk = ~400ml (~350–450 kcal, Na:1000–1500mg).
- Gado-gado/Pecel: 1 porsi = ~250g (~350 kcal, Serat:6–8g).
- Nasi Padang (Nasi+Rendang+Sayur+Sambal): ~500–700 kcal total.
- Bubur Ayam: 1 mangkuk = ~350g (~250 kcal, K:35g, P:12g).
- Indomie Goreng: 1 bungkus = 85g kering (~380 kcal | K:52g | P:8g | L:16g | Na:1050mg).
- Indomie Kuah Soto: 1 bungkus = 75g kering (~310 kcal | K:44g | P:7g | L:12g | Na:1120mg).

== DATABASE REFERENCE (Per 100g MATANG) ==
[KARBOHIDRAT POKOK]
- Nasi Putih: 130 kcal|K:28g|P:2.7g|L:0.3g|Serat:0.4g|Gula:0.1g|Na:1mg|Ca:10mg|Fe:1.2mg|VitC:0|VitD:0|Zn:0.5mg
- Nasi Merah: 111 kcal|K:23g|P:2.6g|L:0.9g|Serat:1.8g|Gula:0g|Na:5mg|Ca:10mg|Fe:0.5mg|VitC:0|VitD:0|Zn:0.6mg
- Mie Telur Matang: 138 kcal|K:25g|P:4.5g|L:2g|Serat:1g|Gula:0.4g|Na:6mg|Ca:10mg|Fe:1.4mg|VitC:0|VitD:0|Zn:0.5mg
- Roti Tawar Putih: 265 kcal|K:49g|P:9g|L:3.2g|Serat:2.7g|Gula:5g|Na:491mg|Ca:260mg|Fe:3.6mg|VitC:0|VitD:0|Zn:0.7mg
- Kentang Rebus: 87 kcal|K:20g|P:1.9g|L:0.1g|Serat:1.8g|Gula:0.8g|Na:6mg|Ca:5mg|Fe:0.3mg|VitC:13mg|VitD:0|Zn:0.3mg
- Singkong Rebus: 160 kcal|K:38g|P:1.4g|L:0.3g|Serat:1.8g|Gula:1.7g|Na:14mg|Ca:16mg|Fe:0.3mg|VitC:20mg|VitD:0|Zn:0.3mg
- Oatmeal Matang: 68 kcal|K:12g|P:2.4g|L:1.4g|Serat:1.7g|Gula:0.3g|Na:5mg|Ca:9mg|Fe:1.4mg|VitC:0|VitD:0|Zn:0.6mg

[PROTEIN HEWANI]
- Dada Ayam Matang: 165 kcal|K:0g|P:31g|L:3.6g|Serat:0g|Gula:0g|Na:74mg|Ca:15mg|Fe:1mg|VitC:0|VitD:0|Zn:1mg
- Paha Ayam Matang: 209 kcal|K:0g|P:26g|L:10.9g|Serat:0g|Gula:0g|Na:84mg|Ca:11mg|Fe:1.3mg|VitC:0|VitD:0.1mcg|Zn:2.7mg
- Telur Ayam Rebus (per 100g): 155 kcal|K:1.1g|P:13g|L:11g|Serat:0g|Gula:1.1g|Na:124mg|Ca:50mg|Fe:1.8mg|VitC:0|VitD:2.2mcg|Zn:1.3mg
- Daging Sapi Matang (lean): 250 kcal|K:0g|P:26g|L:15g|Serat:0g|Gula:0g|Na:72mg|Ca:18mg|Fe:2.6mg|VitC:0|VitD:0.1mcg|Zn:6.3mg
- Ikan Nila/Mujair Matang: 128 kcal|K:0g|P:26g|L:2.7g|Serat:0g|Gula:0g|Na:56mg|Ca:14mg|Fe:0.7mg|VitC:0|VitD:3.1mcg|Zn:0.4mg
- Ikan Tongkol/Tuna: 132 kcal|K:0g|P:28g|L:1.3g|Serat:0g|Gula:0g|Na:47mg|Ca:4mg|Fe:1.3mg|VitC:0|VitD:4.9mcg|Zn:0.8mg
- Ikan Lele Goreng: 230 kcal|K:0g|P:18g|L:17g|Serat:0g|Gula:0g|Na:60mg|Ca:15mg|Fe:0.6mg|VitC:0|VitD:0|Zn:0.7mg
- Udang Matang: 99 kcal|K:0.2g|P:24g|L:0.3g|Serat:0g|Gula:0g|Na:111mg|Ca:52mg|Fe:0.3mg|VitC:0|VitD:0|Zn:1.6mg
- Cumi Matang: 175 kcal|K:3.1g|P:18g|L:7.5g|Serat:0g|Gula:0g|Na:744mg|Ca:32mg|Fe:1.1mg|VitC:5mg|VitD:0|Zn:1.8mg
- Ikan Salmon Matang: 208 kcal|K:0g|P:20g|L:13g|Serat:0g|Gula:0g|Na:59mg|Ca:9mg|Fe:0.3mg|VitC:0|VitD:11mcg|Zn:0.6mg
- Susu Sapi Full Cream (per 100ml): 61 kcal|K:4.8g|P:3.2g|L:3.3g|Serat:0g|Gula:5g|Na:43mg|Ca:113mg|Fe:0mg|VitC:0|VitD:1.3mcg|Zn:0.4mg
- Keju Cheddar: 403 kcal|K:1.3g|P:25g|L:33g|Serat:0g|Gula:0.5g|Na:621mg|Ca:721mg|Fe:0.7mg|VitC:0|VitD:0.6mcg|Zn:3.1mg

[PROTEIN NABATI]
- Tempe: 193 kcal|K:8.7g|P:20.7g|L:11g|Serat:1.4g|Gula:0g|Na:9mg|Ca:111mg|Fe:2.7mg|VitC:0|VitD:0|Zn:1.8mg
- Tahu Putih: 76 kcal|K:1.9g|P:8g|L:4.2g|Serat:0.3g|Gula:0g|Na:7mg|Ca:350mg|Fe:5.4mg|VitC:0.2mg|VitD:0|Zn:0.8mg
- Kacang Tanah Goreng: 567 kcal|K:16g|P:26g|L:49g|Serat:8.5g|Gula:4g|Na:18mg|Ca:92mg|Fe:4.6mg|VitC:0|VitD:0|Zn:3.3mg
- Kacang Merah Rebus: 127 kcal|K:22g|P:8.7g|L:0.5g|Serat:6.4g|Gula:0.3g|Na:2mg|Ca:28mg|Fe:2.9mg|VitC:1.2mg|VitD:0|Zn:1mg

[SAYURAN]
- Kangkung Tumis: 30 kcal|K:3g|P:2.6g|L:0.5g|Serat:2.1g|Gula:0g|Na:50mg|Ca:77mg|Fe:2.5mg|VitC:30mg|VitD:0|Zn:0.2mg
- Bayam Rebus: 23 kcal|K:3.6g|P:2.9g|L:0.3g|Serat:2.2g|Gula:0.4g|Na:70mg|Ca:136mg|Fe:3.6mg|VitC:10mg|VitD:0|Zn:0.8mg
- Brokoli Rebus: 35 kcal|K:7.2g|P:2.4g|L:0.4g|Serat:3.3g|Gula:1.4g|Na:41mg|Ca:40mg|Fe:0.7mg|VitC:65mg|VitD:0|Zn:0.4mg
- Wortel Rebus: 35 kcal|K:8.2g|P:0.8g|L:0.2g|Serat:3g|Gula:3.5g|Na:58mg|Ca:30mg|Fe:0.3mg|VitC:3.6mg|VitD:0|Zn:0.2mg
- Timun Segar: 15 kcal|K:3.6g|P:0.7g|L:0.1g|Serat:0.5g|Gula:1.7g|Na:2mg|Ca:16mg|Fe:0.3mg|VitC:2.8mg|VitD:0|Zn:0.2mg
- Tomat Segar: 18 kcal|K:3.9g|P:0.9g|L:0.2g|Serat:1.2g|Gula:2.6g|Na:5mg|Ca:10mg|Fe:0.3mg|VitC:14mg|VitD:0|Zn:0.2mg
- Labu Siam Rebus: 19 kcal|K:4.5g|P:0.8g|L:0.1g|Serat:1.7g|Gula:1.9g|Na:2mg|Ca:12mg|Fe:0.3mg|VitC:6mg|VitD:0|Zn:0.7mg
- Tauge/Kecambah: 31 kcal|K:6g|P:3g|L:0.2g|Serat:1.8g|Gula:4.3g|Na:6mg|Ca:13mg|Fe:0.9mg|VitC:13mg|VitD:0|Zn:0.4mg

[BUAH-BUAHAN]
- Pisang (Ambon): 89 kcal|K:23g|P:1.1g|L:0.3g|Serat:2.6g|Gula:12g|Na:1mg|Ca:5mg|Fe:0.3mg|VitC:9mg|VitD:0|Zn:0.2mg
- Apel Merah: 52 kcal|K:14g|P:0.3g|L:0.2g|Serat:2.4g|Gula:10g|Na:1mg|Ca:6mg|Fe:0.1mg|VitC:5mg|VitD:0|Zn:0mg
- Jeruk Manis: 47 kcal|K:12g|P:0.9g|L:0.1g|Serat:2.4g|Gula:9g|Na:0mg|Ca:40mg|Fe:0.1mg|VitC:53mg|VitD:0|Zn:0.1mg
- Mangga Matang: 60 kcal|K:15g|P:0.8g|L:0.4g|Serat:1.6g|Gula:14g|Na:1mg|Ca:11mg|Fe:0.2mg|VitC:36mg|VitD:0|Zn:0.1mg
- Pepaya: 43 kcal|K:11g|P:0.5g|L:0.3g|Serat:1.7g|Gula:8g|Na:8mg|Ca:20mg|Fe:0.3mg|VitC:61mg|VitD:0|Zn:0.1mg
- Semangka: 30 kcal|K:7.6g|P:0.6g|L:0.2g|Serat:0.4g|Gula:6.2g|Na:1mg|Ca:7mg|Fe:0.2mg|VitC:8mg|VitD:0|Zn:0.1mg
- Alpukat: 160 kcal|K:8.5g|P:2g|L:15g|Serat:6.7g|Gula:0.7g|Na:7mg|Ca:12mg|Fe:0.6mg|VitC:10mg|VitD:0|Zn:0.6mg

[MINUMAN]
- Es Teh Manis (250ml): gula ~25g (~100 kcal), Ca:0, Fe:0, Na:5mg
- Kopi Susu Gula Aren (1 cup 350ml): ~180 kcal|K:25g|P:4g|L:6g|Gula:22g|Na:60mg|Ca:80mg
- Jus Jeruk Segar (250ml): ~112 kcal|K:26g|P:1.7g|L:0.5g|Gula:21g|Na:2mg|Ca:27mg|VitC:124mg
- Susu Coklat Kotak (250ml): ~190 kcal|K:27g|P:7g|L:6g|Gula:24g|Na:150mg|Ca:280mg|Fe:0.6mg|VitD:1mcg
- Air Kelapa Muda (250ml): ~46 kcal|K:9g|P:1.7g|L:0.5g|Gula:6g|Na:105mg|Ca:58mg|Fe:0.3mg|VitC:2.4mg|Zn:0.1mg

[LEMAK & BUMBU]
- Minyak Goreng (per 10g/1sdm): 88 kcal|K:0g|P:0g|L:10g|Na:0mg
- Santan Kental (per 100ml): 230 kcal|K:6g|P:2.3g|L:24g|Serat:0g|Na:15mg|Ca:16mg|Fe:1.6mg|VitC:1mg|Zn:0.7mg
- Kecap Manis (per 15ml/1sdm): 40 kcal|K:9g|P:1g|L:0g|Gula:8g|Na:600mg
- Sambal Terasi (per 15g/1sdm): 15 kcal|K:2g|P:0.5g|L:0.5g|Na:350mg|VitC:5mg

== INSTRUKSI KALKULASI KETAT (>97% AKURASI) ==
1. Konversi porsi ke gram MATANG terlebih dahulu. Gunakan acuan standar Indonesia di atas.
2. Cari data per 100g di DATABASE REFERENCE di atas atau USDA/TKPI jika tidak ada.
3. Hitung: Nilai = (data per 100g) × (gram porsi / 100). Lakukan untuk SETIAP field (cal, protein, carbs, fat, fiber, sugar, sodium, calcium, iron, vitC, vitD, zinc).
4. MULTI-BAHAN: Hitung MASING-MASING bahan TERPISAH sesuai beratnya, lalu JUMLAHKAN semua field.
5. MULTI-PORSI: Kalikan semua nilai dengan jumlah porsi yang disebutkan.
6. ATWATER INTEGRITY: Makanan berbasis mie/nasi/tepung/roti/singkong WAJIB memiliki Karbo dominan (BUKAN 0g).
7. SODIUM RULES:
   - Mie Instan/Mie Pedas Resto: 1 porsi = 1200–1600mg sodium.
   - Sup/Soto/Bakso/Ramen berkuah: 1 porsi = 900–1400mg sodium.
   - Makanan berbumbu/sambal/kecap: 500–900mg sodium.
   - Rebusan polos/tanpa garam: 10–80mg per 100g.
8. PENGOLAHAN MINYAK:
   - Deep Fried/Goreng Tepung: Tambah +10g lemak (+90 kcal) per 100g item.
   - Tumis/Goreng Biasa: Tambah +5g lemak (+45 kcal) per porsi.
   - Santan/Gulai: Tambah +8g lemak (+72 kcal) per 100g.
   - Air Fryer/Rebus/Kukus/Panggang tanpa minyak: TANPA tambahan lemak.
9. MICRONUTRIENT WAJIB DIHITUNG (DILARANG ASAL 0):
   - fiber: Sayuran 2–4g/100g, buah 1–3g/100g, nasi 0.3–0.5g/100g, mie 1g/100g.
   - sugar: Minuman manis 15–25g/gelas, buah 8–15g/100g, nasi/lauk ~0g.
   - calcium: Susu/keju 100–700mg/100g, tahu 350mg/100g, ikan 10–50mg/100g, tempe 111mg/100g.
   - iron: Daging merah 2–3mg/100g, bayam 3.6mg/100g, tempe 2.7mg/100g, telur 1.8mg/100g.
   - vitC: Jeruk/pepaya/mangga 30–60mg/100g, sayur hijau 10–65mg/100g, daging/telur ~0mg.
   - vitD: Salmon/ikan berlemak 5–11mcg/100g, telur 2.2mcg/100g, susu 1.3mcg/100ml.
   - zinc: Daging sapi 6mg/100g, keju 3mg/100g, tempe 1.8mg/100g, ayam 1–2.7mg/100g.
10. Mentah vs Matang: "fillet/mentah/raw" = gunakan data mentah. Selain itu = matang.
11. VERIFIKASI WAJIB: Total Kalori HARUS = (Protein×4) + (Karbo×4) + (Lemak×9) ± 5%. Jika tidak, koreksi angka lemak atau karbo.
12. COMMON MISTAKES (HINDARI):
   - JANGAN: Goreng tapi lemak < 5g (SALAH, goreng minimal 8–15g lemak).
   - JANGAN: Mie/nasi/roti tapi karbo = 0g (SALAH, pasti ada karbo).
   - JANGAN: Makanan berbumbu/resto tapi sodium < 100mg (SALAH, minimal 300–500mg).
   - JANGAN: Sayuran/buah tapi fiber = 0g (SALAH, pasti ada fiber).
   - JANGAN: Susu/keju tapi calcium = 0mg (SALAH, susu 113mg/100ml, keju 721mg/100g).
   - JANGAN: Ikan/telur tapi vitD = 0mcg (SALAH, telur 2.2mcg, ikan 3–11mcg).
13. Jawab HANYA JSON valid ini (tanpa teks/markdown apapun di luar JSON):
{"calculation":"WAJIB ISI: rincian perkalian detail per bahan, misal: Nasi 150g → cal=130×1.5=195, K=28×1.5=42g, P=2.7×1.5=4.1g, L=0.3×1.5=0.5g, serat=0.4×1.5=0.6g, Na=1×1.5=1.5mg, Ca=10×1.5=15mg, Fe=1.2×1.5=1.8mg...","cal":0.0,"protein":0.0,"carbs":0.0,"fat":0.0,"fiber":0.0,"sugar":0.0,"sodium":0.0,"calcium":0.0,"iron":0.0,"vitC":0.0,"vitD":0.0,"zinc":0.0}
Bulatkan 1 angka desimal.`;

  const raw = await callAI([systemMsg, { role:'user', content: prompt }], true, 'gpt-4o-mini');
  
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
