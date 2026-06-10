// ====================================================
// FIREBASE REST API HELPER (No Admin SDK needed!)
// Same approach as the GAS version — simple and reliable
// ====================================================

const FB_URL = process.env.FIREBASE_DATABASE_URL;

/**
 * Get data from Firebase path
 */
async function getFirebase(path) {
  try {
    const res = await fetch(`${FB_URL}/${path}.json`);
    const val = await res.json();
    return val === null ? null : val;
  } catch (e) {
    console.error('Firebase GET error:', path, e.message);
    return null;
  }
}

/**
 * Set data at Firebase path (null = delete)
 */
async function setFirebase(path, value) {
  try {
    const method = value === null ? 'DELETE' : 'PUT';
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (value !== null) options.body = JSON.stringify(value);
    await fetch(`${FB_URL}/${path}.json`, options);
  } catch (e) {
    console.error('Firebase SET error:', path, e.message);
  }
}

/**
 * Convert email to Firebase-safe key (same logic as GAS)
 * user@gmail.com → user@gmail_com
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

module.exports = {
  getFirebase,
  setFirebase,
  safe,
  getState,
  setState,
  getCache,
  setCache,
  deleteCache,
  getLinkedEmail
};
