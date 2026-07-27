// ====================================================
// FIREBASE REST API HELPER (No Admin SDK needed!)
// Same approach as the GAS version — simple and reliable
// ====================================================

const crypto = require('crypto');

const FB_URL = (process.env.FIREBASE_DATABASE_URL && process.env.FIREBASE_DATABASE_URL.includes('lebihfittools-default-rtdb'))
  ? process.env.FIREBASE_DATABASE_URL.replace(/\/$/, '')
  : 'https://lebihfittools-default-rtdb.asia-southeast1.firebasedatabase.app';

let cachedAccessToken = null;
let accessTokenExpiry = 0;

let tokenError = null;

/**
 * Get Google OAuth2 access token using Firebase Service Account from env
 */
async function getAccessToken() {
  const saVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saVar) {
    tokenError = "FIREBASE_SERVICE_ACCOUNT environment variable is missing in Vercel.";
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < accessTokenExpiry - 60) {
    return cachedAccessToken;
  }

  try {
    let sa;
    try {
      sa = JSON.parse(saVar);
    } catch (parseErr) {
      try {
        // Fallback: try to sanitize raw newlines in pasted JSON string
        const sanitized = saVar.replace(/\n/g, '\\n');
        sa = JSON.parse(sanitized);
      } catch (e2) {
        tokenError = `Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${parseErr.message}`;
        return null;
      }
    }
    
    if (!sa.client_email || !sa.private_key) {
      tokenError = "Service account JSON is missing client_email or private_key.";
      return null;
    }

    const jwtHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    
    const jwtClaim = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${jwtHeader}.${jwtClaim}`);
    
    // Replace escaped newlines with actual newlines for PEM formatting
    let privateKey = sa.private_key;
    if (typeof privateKey === 'string' && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    const signature = sign.sign(privateKey, 'base64url');
    const signedJwt = `${jwtHeader}.${jwtClaim}.${signature}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      tokenError = `Firebase OAuth token fetch failed (Status ${resp.status}): ${errText}`;
      return null;
    }

    const data = await resp.json();
    cachedAccessToken = data.access_token;
    accessTokenExpiry = now + (data.expires_in || 3600);
    tokenError = null;
    return cachedAccessToken;
  } catch (e) {
    tokenError = `Failed to generate access token: ${e.message}`;
    return null;
  }
}

/**
 * Get data from Firebase path
 */
async function getFirebase(path) {
  const secret = process.env.FIREBASE_DATABASE_SECRET || process.env.DATABASE_SECRET || process.env.FIREBASE_SECRET;
  let url;
  
  if (secret) {
    url = `${FB_URL}/${path}.json?auth=${secret}`;
  } else {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(tokenError || "Firebase authentication token is missing. Please ensure FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_SECRET is correctly configured in Vercel.");
    }
    url = `${FB_URL}/${path}.json?access_token=${token}`;
  }

  const res = await fetch(url);
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
  const secret = process.env.FIREBASE_DATABASE_SECRET || process.env.DATABASE_SECRET || process.env.FIREBASE_SECRET;
  let url;
  
  if (secret) {
    url = `${FB_URL}/${path}.json?auth=${secret}`;
  } else {
    const token = await getAccessToken();
    if (!token) {
      throw new Error(tokenError || "Firebase authentication token is missing. Please ensure FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_SECRET is correctly configured in Vercel.");
    }
    url = `${FB_URL}/${path}.json?access_token=${token}`;
  }

  const method = value === null ? 'DELETE' : 'PUT';
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (value !== null) options.body = JSON.stringify(value);
  const res = await fetch(url, options);
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
    let userFeatureStats = await getFirebase(userFeaturePath) || { email: cleanEmail, feature, totalTokens: 0, callCount: 0, promptTokens: 0, completionTokens: 0 };
    userFeatureStats.totalTokens = (userFeatureStats.totalTokens || 0) + totalTokens;
    userFeatureStats.promptTokens = (userFeatureStats.promptTokens || 0) + (promptTokens || 0);
    userFeatureStats.completionTokens = (userFeatureStats.completionTokens || 0) + (completionTokens || 0);
    userFeatureStats.callCount = (userFeatureStats.callCount || 0) + 1;
    userFeatureStats.lastActive = timestamp;
    userFeatureStats.model = model || userFeatureStats.model || 'unknown'; // track most recent model
    await setFirebase(userFeaturePath, userFeatureStats);

    // Deduct cost from real-time API Key prepaid balances
    try {
      const isVision = feature === 'food_scan' || feature === 'body_analysis';
      const balancePath = isVision ? 'admins/api_balances/vision' : 'admins/api_balances/text';
      let balanceObj = await getFirebase(balancePath);
      
      if (balanceObj && typeof balanceObj.balance === 'number') {
        let cost = 0;
        const modelLower = (model || '').toLowerCase();
        
        if (modelLower.includes('gpt-4o-mini')) {
          cost = (promptTokens * 0.00000015) + (completionTokens * 0.00000060); // USD
        } else if (modelLower.includes('gemini-2.5-flash')) {
          if (balanceObj.currency === 'IDR') {
            cost = (promptTokens * 0.001225) + (completionTokens * 0.0049); // IDR from Google Cloud prepay
          } else {
            cost = (promptTokens * 0.000000075) + (completionTokens * 0.00000030); // USD
          }
        } else {
          // Fallback generic pricing
          cost = (totalTokens * 0.00000015);
          if (balanceObj.currency === 'IDR') {
            cost = cost * 16300; // USD to IDR conversion fallback
          }
        }
        
        balanceObj.balance = Math.max(0, balanceObj.balance - cost);
        balanceObj.lastUpdated = timestamp;
        await setFirebase(balancePath, balanceObj);
      }
    } catch (deductErr) {
      console.error('[firebase] Failed to deduct API balance:', deductErr);
    }

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
