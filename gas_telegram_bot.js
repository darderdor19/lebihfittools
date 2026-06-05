// ====================================================
// LEBIHFIT - Google Apps Script
// Fitur: OTP Email + Telegram Bot Webhook
// ====================================================
// SETUP INSTRUCTIONS:
// 1. Buka script.google.com → buat project baru
// 2. Paste seluruh kode ini
// 3. Isi Script Properties (Project Settings → Script Properties):
//    - TELEGRAM_BOT_TOKEN = (token bot Telegram lu)
//    - GROQ_API_KEY = (API key Groq lu)
//    - FIREBASE_URL = https://lebihfit-tools-final-default-rtdb.asia-southeast1.firebasedatabase.app
//    - FIREBASE_API_KEY = AIzaSyAL69COk7XKUnKalpBY9QmLSMddHv0lEe4
// 4. Deploy → New Deployment → Web App → Execute as Me → Anyone
// 5. Copy URL deploy, set webhook: jalankan fungsi setWebhook() sekali
// ====================================================

const PROPS = PropertiesService.getScriptProperties();

function getConfig() {
  return {
    TELEGRAM_TOKEN: PROPS.getProperty('TELEGRAM_BOT_TOKEN'),
    GROQ_KEY: PROPS.getProperty('GROQ_API_KEY'),
    FIREBASE_URL: PROPS.getProperty('FIREBASE_URL') || 'https://lebihfit-tools-final-default-rtdb.asia-southeast1.firebasedatabase.app',
    FIREBASE_API_KEY: PROPS.getProperty('FIREBASE_API_KEY') || 'AIzaSyAL69COk7XKUnKalpBY9QmLSMddHv0lEe4',
  };
}

// ====================================================
// HTTP HANDLER
// ====================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Telegram webhook
    if (body.message || body.callback_query) {
      handleTelegramUpdate(body);
      return ContentService.createTextOutput('OK');
    }

    // OTP request (dari web app)
    if (body.action === 'sendOTP') {
      return handleSendOTP(body);
    }
    if (body.action === 'verifyOTP') {
      return handleVerifyOTP(body);
    }

    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return ContentService.createTextOutput('ERROR');
  }
}

function doGet(e) {
  // Health check
  return ContentService.createTextOutput(JSON.stringify({ status: 'LebihFit GAS OK', time: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====================================================
// OTP FUNCTIONS (original)
// ====================================================
const otpStore = {}; // In-memory, gunakan CacheService untuk production

function handleSendOTP(body) {
  const { email, name } = body;
  if (!email) return jsonResponse({ ok: false, error: 'Email required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const cache = CacheService.getScriptCache();
  cache.put('otp_' + email, JSON.stringify({ otp, name, expires: Date.now() + 10 * 60 * 1000 }), 600);

  try {
    MailApp.sendEmail({
      to: email,
      subject: '🔐 Kode OTP LebihFit - ' + otp,
      htmlBody: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#060b11;color:#e0f7fa;padding:32px;border-radius:12px;">
          <h2 style="color:#00f0ff;text-align:center;">LebihFit</h2>
          <p>Halo <b>${name || 'Bro'}</b>!</p>
          <p>Kode OTP lu:</p>
          <div style="background:#0b121c;border:2px solid #00f0ff;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
            <span style="font-size:2.5rem;font-weight:900;letter-spacing:8px;color:#00f0ff;">${otp}</span>
          </div>
          <p style="color:#8caebf;font-size:0.85rem;">Berlaku 10 menit. Jangan share ke siapapun.</p>
        </div>
      `
    });
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function handleVerifyOTP(body) {
  const { email, otp } = body;
  if (!email || !otp) return jsonResponse({ ok: false, error: 'Email and OTP required' });

  const cache = CacheService.getScriptCache();
  const stored = cache.get('otp_' + email);
  if (!stored) return jsonResponse({ ok: false, error: 'OTP expired atau tidak ditemukan' });

  const data = JSON.parse(stored);
  if (data.otp !== otp.toString()) return jsonResponse({ ok: false, error: 'OTP salah' });
  if (Date.now() > data.expires) return jsonResponse({ ok: false, error: 'OTP sudah expired' });

  cache.remove('otp_' + email);
  return jsonResponse({ ok: true, name: data.name });
}

// ====================================================
// TELEGRAM BOT
// ====================================================
function handleTelegramUpdate(update) {
  const cfg = getConfig();
  if (!cfg.TELEGRAM_TOKEN) return;

  let msg, chatId, text, userId;

  if (update.message) {
    msg = update.message;
    chatId = msg.chat.id;
    text = msg.text || '';
    userId = msg.from.id;
  } else if (update.callback_query) {
    const cb = update.callback_query;
    chatId = cb.message.chat.id;
    text = cb.data;
    userId = cb.from.id;
    answerCallback(cfg.TELEGRAM_TOKEN, cb.id);
  }

  if (!chatId) return;

  // --- COMMANDS ---
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    if (parts[1]) {
      // Deep link dengan email token
      handleLinkAccount(cfg, chatId, userId, decodeURIComponent(parts[1]));
    } else {
      sendMessage(cfg.TELEGRAM_TOKEN, chatId, 
        `🤖 *LebihFit Bot*\n\nHalo! Gua bisa bantu lu log makanan langsung dari Telegram.\n\n*Cara pakai:*\n1. Buka LebihFit di web\n2. Pergi ke Settings → Connect Telegram\n3. Klik link yang muncul untuk menghubungkan akun\n\nSetelah terhubung, cukup kirim nama makanan ke sini dan gua akan analisis nutrisinya! 🍽️`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  if (text === '/help') {
    sendMessage(cfg.TELEGRAM_TOKEN, chatId,
      `📖 *Cara Pakai LebihFit Bot:*\n\n*Log Makanan:*\nCukup kirim nama makanan, contoh:\n• _nasi goreng 1 piring_\n• _ayam bakar 200g + nasi_\n• _kopi susu gula 1 gelas_\n\n*Commands:*\n/status - Cek kalori hari ini\n/help - Bantuan\n\nGua akan langsung analisis dan simpan ke dashboard lu! 🚀`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (text === '/status') {
    handleStatusCommand(cfg, chatId, userId);
    return;
  }

  // --- LOG FOOD ---
  const linked = getLinkedEmail(userId);
  if (!linked) {
    sendMessage(cfg.TELEGRAM_TOKEN, chatId,
      `⚠️ Akun belum terhubung!\n\nBuka LebihFit web → Settings → Connect Telegram untuk menghubungkan akun lu dulu ya.`
    );
    return;
  }

  // Process food log
  processFoodLog(cfg, chatId, userId, linked, text);
}

function handleLinkAccount(cfg, chatId, userId, emailToken) {
  // emailToken adalah email yang di-encode
  const email = emailToken.replace(/_at_/g, '@').replace(/_dot_/g, '.');
  
  // Verify email exists in Firebase
  const userData = firebaseGet(cfg, `users/${safeEmail(email)}/lf_user_email`);
  
  if (!userData) {
    sendMessage(cfg.TELEGRAM_TOKEN, chatId,
      `❌ Email tidak ditemukan. Pastikan lu sudah login di LebihFit web terlebih dahulu.`
    );
    return;
  }

  // Save Telegram link: chatId → email
  firebaseSet(cfg, `telegram_links/${userId}`, { email, chatId, linkedAt: new Date().toISOString() });
  // Also save reverse: email → telegramId
  firebaseSet(cfg, `users/${safeEmail(email)}/telegram_chat_id`, chatId);
  
  sendMessage(cfg.TELEGRAM_TOKEN, chatId,
    `✅ *Akun berhasil terhubung!*\n\n📧 Email: ${email}\n\nSekarang lu bisa langsung kirim nama makanan ke sini dan gua akan otomatis analisis dan simpan ke dashboard LebihFit lu!\n\nContoh:\n_nasi goreng telur 1 piring_\n_ayam geprek sambel 1 porsi_`,
    { parse_mode: 'Markdown' }
  );
}

function handleStatusCommand(cfg, chatId, userId) {
  const linked = getLinkedEmail(userId);
  if (!linked) {
    sendMessage(cfg.TELEGRAM_TOKEN, chatId, `Akun belum terhubung. Buka Settings di web app.`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const logsKey = `lf_logs_${today}`;
  const logs = firebaseGet(cfg, `users/${safeEmail(linked)}/lf_logs_${today}`);
  const profile = firebaseGet(cfg, `users/${safeEmail(linked)}/lf_profile`);

  if (!logs || logs.length === 0) {
    sendMessage(cfg.TELEGRAM_TOKEN, chatId, `📊 *Status Hari Ini*\n\nBelum ada makanan yang di-log hari ini.`, { parse_mode: 'Markdown' });
    return;
  }

  const total = logs.reduce((acc, item) => {
    acc.cal += item.cal || 0;
    acc.protein += item.protein || 0;
    acc.carbs += item.carbs || 0;
    acc.fat += item.fat || 0;
    return acc;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const target = profile ? profile.targets : null;
  const calTarget = target ? Math.round(target.cal) : '?';

  let statusMsg = `📊 *Status Nutrisi Hari Ini*\n\n`;
  statusMsg += `🔥 Kalori: *${Math.round(total.cal)}* / ${calTarget} kcal\n`;
  statusMsg += `💪 Protein: *${total.protein.toFixed(1)}g*\n`;
  statusMsg += `🌾 Karbo: *${total.carbs.toFixed(1)}g*\n`;
  statusMsg += `🥑 Lemak: *${total.fat.toFixed(1)}g*\n\n`;
  statusMsg += `📝 Total ${logs.length} item makanan`;

  sendMessage(cfg.TELEGRAM_TOKEN, chatId, statusMsg, { parse_mode: 'Markdown' });
}

function processFoodLog(cfg, chatId, userId, email, text) {
  // Send typing indicator
  sendChatAction(cfg.TELEGRAM_TOKEN, chatId, 'typing');

  sendMessage(cfg.TELEGRAM_TOKEN, chatId, `🔍 Menganalisis: _${text}_...`, { parse_mode: 'Markdown' });

  try {
    const nutrition = analyzeTextWithGroq(cfg, text);
    if (!nutrition) {
      sendMessage(cfg.TELEGRAM_TOKEN, chatId, `❌ Gagal menganalisis makanan. Coba lagi dengan deskripsi yang lebih jelas.`);
      return;
    }

    // Save to Firebase
    const today = new Date().toISOString().slice(0, 10);
    const logsKey = `lf_logs_${today}`;
    const existingLogs = firebaseGet(cfg, `users/${safeEmail(email)}/${logsKey}`) || [];
    
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      name: nutrition.name || text,
      portion: nutrition.portion || '1 porsi',
      cal: nutrition.cal || 0,
      protein: nutrition.protein || 0,
      carbs: nutrition.carbs || 0,
      fat: nutrition.fat || 0,
      fiber: nutrition.fiber || 0,
      sugar: nutrition.sugar || 0,
      sodium: nutrition.sodium || 0,
      calcium: nutrition.calcium || 0,
      iron: nutrition.iron || 0,
      vitC: nutrition.vitC || 0,
      vitD: nutrition.vitD || 0,
      zinc: nutrition.zinc || 0,
      mealTime: guessMealTime(),
      loggedAt: new Date().toISOString(),
      source: 'telegram'
    };

    existingLogs.push(newItem);
    firebaseSet(cfg, `users/${safeEmail(email)}/${logsKey}`, existingLogs);

    // Build response message
    let reply = `✅ *${newItem.name}* berhasil disimpan!\n\n`;
    reply += `🔥 Kalori: *${Math.round(newItem.cal)} kcal*\n`;
    reply += `💪 Protein: *${newItem.protein.toFixed(1)}g*\n`;
    reply += `🌾 Karbo: *${newItem.carbs.toFixed(1)}g*\n`;
    reply += `🥑 Lemak: *${newItem.fat.toFixed(1)}g*\n\n`;
    reply += `_Data sudah masuk ke dashboard LebihFit lu!_ 📊`;

    sendMessage(cfg.TELEGRAM_TOKEN, chatId, reply, { parse_mode: 'Markdown' });
  } catch (err) {
    Logger.log('processFoodLog error: ' + err);
    sendMessage(cfg.TELEGRAM_TOKEN, chatId, `❌ Error: ${err.message}`);
  }
}

// ====================================================
// GROQ AI
// ====================================================
function analyzeTextWithGroq(cfg, foodText) {
  if (!cfg.GROQ_KEY) throw new Error('GROQ_API_KEY belum diset di Script Properties');

  const prompt = `Berikan estimasi nutrisi untuk makanan berikut:
"${foodText}"

Jawab HANYA dengan JSON valid format:
{"name":"nama makanan","portion":"estimasi porsi","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}
Semua nilai numerik dalam satuan standar (g/mg/mcg). Jawab murni JSON tanpa teks lain.`;

  const response = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + cfg.GROQ_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      response_format: { type: 'json_object' }
    }),
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());
  if (!data.choices || !data.choices[0]) throw new Error('Groq tidak mengembalikan data');
  
  const raw = data.choices[0].message.content;
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return JSON.parse(raw);
}

// ====================================================
// FIREBASE HELPERS
// ====================================================
function safeEmail(email) {
  return email.replace(/[.#$\[\]]/g, '_');
}

function firebaseGet(cfg, path) {
  try {
    const url = `${cfg.FIREBASE_URL}/${path}.json?auth=${cfg.FIREBASE_API_KEY}`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log('firebaseGet error: ' + e);
    return null;
  }
}

function firebaseSet(cfg, path, value) {
  try {
    const url = `${cfg.FIREBASE_URL}/${path}.json?auth=${cfg.FIREBASE_API_KEY}`;
    UrlFetchApp.fetch(url, {
      method: 'PUT',
      contentType: 'application/json',
      payload: JSON.stringify(value),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('firebaseSet error: ' + e);
  }
}

// ====================================================
// TELEGRAM LINK HELPER
// ====================================================
function getLinkedEmail(telegramUserId) {
  const cfg = getConfig();
  const data = firebaseGet(cfg, `telegram_links/${telegramUserId}`);
  return data ? data.email : null;
}

function guessMealTime() {
  const hour = new Date().getHours() + 7; // UTC+7 WIB
  const h = hour % 24;
  if (h >= 5 && h < 10) return 'sarapan';
  if (h >= 10 && h < 14) return 'makan_siang';
  if (h >= 14 && h < 17) return 'snack_siang';
  if (h >= 17 && h < 21) return 'makan_malam';
  return 'snack_malam';
}

// ====================================================
// TELEGRAM API HELPERS
// ====================================================
function sendMessage(token, chatId, text, options = {}) {
  const payload = { chat_id: chatId, text: text, ...options };
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function sendChatAction(token, chatId, action) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, action: action }),
    muteHttpExceptions: true
  });
}

function answerCallback(token, callbackId) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId }),
    muteHttpExceptions: true
  });
}

// ====================================================
// SETUP WEBHOOK (jalankan sekali setelah deploy)
// ====================================================
function setWebhook() {
  const cfg = getConfig();
  const token = cfg.TELEGRAM_TOKEN;
  
  // Ganti URL ini dengan URL deploy GAS lu
  const WEBHOOK_URL = ScriptApp.getService().getUrl();
  
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify({ url: WEBHOOK_URL })
  });
  
  Logger.log('setWebhook result: ' + res.getContentText());
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
