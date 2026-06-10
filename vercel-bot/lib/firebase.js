// ====================================================
// FIREBASE ADMIN SDK HELPER
// ====================================================
const admin = require('firebase-admin');

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      // Gunakan individual env vars (lebih reliable di Vercel)
      // daripada satu JSON blob yang sering bermasalah dengan newline
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    db = admin.database();
  }
  return db;
}

/**
 * Get data from Firebase path
 */
async function getFirebase(path) {
  try {
    const snap = await getDb().ref(path).once('value');
    return snap.val();
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
    if (value === null) {
      await getDb().ref(path).remove();
    } else {
      await getDb().ref(path).set(value);
    }
  } catch (e) {
    console.error('Firebase SET error:', path, e.message);
  }
}

/**
 * Push to Firebase array
 */
async function pushFirebase(path, value) {
  try {
    await getDb().ref(path).push(value);
  } catch (e) {
    console.error('Firebase PUSH error:', path, e.message);
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
  pushFirebase,
  safe,
  getState,
  setState,
  getCache,
  setCache,
  deleteCache,
  getLinkedEmail
};
