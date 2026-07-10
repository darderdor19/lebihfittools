// ====================================================
// FIREBASE REST API HELPER (No Admin SDK needed!)
// Same approach as the GAS version — simple and reliable
// ====================================================

const FB_URL = (process.env.FIREBASE_DATABASE_URL && process.env.FIREBASE_DATABASE_URL.includes('lebihfittools-default-rtdb'))
  ? process.env.FIREBASE_DATABASE_URL.replace(/\/$/, '')
  : 'https://lebihfittools-default-rtdb.asia-southeast1.firebasedatabase.app';

/**
 * Get data from Firebase path
 */
async function getFirebase(path) {
  const res = await fetch(`${FB_URL}/${path}.json`);
  if (!res.ok) {
    throw new Error(`Firebase GET failed (Status ${res.status}): ${res.statusText}`);
  }
  const val = await res.json();
  if (val && typeof val === 'object' && val.error) {
    throw new Error(`Firebase GET Permission Denied: ${val.error}`);
  }
  return val;
}

/**
 * Set data at Firebase path (null = delete)
 */
async function setFirebase(path, value) {
  const method = value === null ? 'DELETE' : 'PUT';
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (value !== null) options.body = JSON.stringify(value);
  const res = await fetch(`${FB_URL}/${path}.json`, options);
  if (!res.ok) {
    throw new Error(`Firebase SET failed (Status ${res.status}): ${res.statusText}`);
  }
  const json = await res.json();
  if (json && json.error) {
    throw new Error(`Firebase SET Permission Denied: ${json.error}`);
  }
}

/**
 * Convert Firebase response to array
 * Firebase stores JS arrays as objects with numeric keys: { "0": {...}, "1": {...} }
 * This converts them back to proper arrays
 */
function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') return Object.values(data);
  return [];
}

/**
 * Convert email to Firebase-safe key (same logic as GAS)
 * user@gmail.com → user_at_gmail_com
 */
function safe(email) {
  return email.replace(/[.#$[\]]/g, '_');
}

// State helpers
async function getState(userId) {
  return await getFirebase(`telegram_states/${userId}`);
}
async function setState(userId, state) {
  return await setFirebase(`telegram_states/${userId}`, state);
}

// Cache helpers
async function getCache(key) {
  return await getFirebase(`telegram_cache/${key}`);
}
async function setCache(key, value) {
  return await setFirebase(`telegram_cache/${key}`, value);
}
async function deleteCache(key) {
  return await setFirebase(`telegram_cache/${key}`, null);
}

// Linked email helper
async function getLinkedEmail(userId) {
  const data = await getFirebase(`telegram_links/${userId}`);
  return (data && data.email) ? data.email : null;
}

/**
 * Log token usage for admin tracking
 */
async function logTokenUsage(email, feature, promptTokens, completionTokens, model) {
  try {
    const cleanEmail = email ? email.replace(/"/g, '').trim().toLowerCase() : 'anonymous';
    const safeEmail = safe(cleanEmail);
    const totalTokens = (promptTokens || 0) + (completionTokens || 0);
    const timestamp = new Date().toISOString();
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const logEntry = {
      id: logId,
      timestamp,
      email: cleanEmail,
      feature,
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens,
      model: model || 'unknown'
    };

    // Save transaction log
    await setFirebase(`admins/token_logs/${logId}`, logEntry);

    // Update aggregated stats for user
    const userStatsPath = `admins/user_token_stats/${safeEmail}`;
    let userStats = await getFirebase(userStatsPath) || { email: cleanEmail, totalTokens: 0, promptTokens: 0, completionTokens: 0, callCount: 0 };
    userStats.totalTokens = (userStats.totalTokens || 0) + totalTokens;
    userStats.promptTokens = (userStats.promptTokens || 0) + (promptTokens || 0);
    userStats.completionTokens = (userStats.completionTokens || 0) + (completionTokens || 0);
    userStats.callCount = (userStats.callCount || 0) + 1;
    userStats.lastActive = timestamp;
    await setFirebase(userStatsPath, userStats);

    // Update aggregated stats for feature
    const featureStatsPath = `admins/feature_token_stats/${feature}`;
    let featureStats = await getFirebase(featureStatsPath) || { feature, totalTokens: 0, callCount: 0 };
    featureStats.totalTokens = (featureStats.totalTokens || 0) + totalTokens;
    featureStats.callCount = (featureStats.callCount || 0) + 1;
    await setFirebase(featureStatsPath, featureStats);

    // Update aggregated stats for user + feature combined
    const userFeaturePath = `admins/user_feature_token_stats/${safeEmail}_${feature}`;
    let userFeatureStats = await getFirebase(userFeaturePath) || { email: cleanEmail, feature, totalTokens: 0, callCount: 0 };
    userFeatureStats.totalTokens = (userFeatureStats.totalTokens || 0) + totalTokens;
    userFeatureStats.callCount = (userFeatureStats.callCount || 0) + 1;
    userFeatureStats.lastActive = timestamp;
    await setFirebase(userFeaturePath, userFeatureStats);

  } catch (err) {
    console.error('[firebase] Failed to log token usage:', err);
  }
}

module.exports = {
  getFirebase,
  setFirebase,
  toArray,
  safe,
  getState,
  setState,
  getCache,
  setCache,
  deleteCache,
  getLinkedEmail,
  logTokenUsage
};
