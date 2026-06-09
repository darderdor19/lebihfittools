// ====================================================
// LEBIHFIT TELEGRAM BOT - Full Featured
// ====================================================
// SCRIPT PROPERTIES yang harus diisi:
//   TELEGRAM_BOT_TOKEN = token dari BotFather
//   GROQ_API_KEY       = API key Groq lu
// ====================================================

const PROPS    = PropertiesService.getScriptProperties();
const BOT_TOKEN = PROPS.getProperty('TELEGRAM_BOT_TOKEN');
const GROQ_KEY  = PROPS.getProperty('GROQ_API_KEY');
const FB_URL    = 'https://lebihfit-tools-final-default-rtdb.asia-southeast1.firebasedatabase.app';
const TG_API    = 'https://api.telegram.org/bot' + BOT_TOKEN;

// ====================================================
// ENTRY POINTS
// ====================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // OTP handler untuk web app (tetap ada)
    if (body.action === 'sendOTP')   return handleSendOTP(body);
    if (body.action === 'verifyOTP') return handleVerifyOTP(body);

    // Telegram update
    if (body.message)        handleMessage(body.message);
    if (body.callback_query) handleCallback(body.callback_query);

  } catch(err) {
    Logger.log('doPost ERR: ' + err);
  }
  return ContentService.createTextOutput('OK');
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'LebihFit Bot' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====================================================
// MESSAGE HANDLER
// ====================================================
function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text   = (msg.text || '').trim();
  const state  = getState(userId);

  if (text === '/start') return onStart(chatId, userId);
  if (text === '/menu')  return showMainMenu(chatId, userId);
  if (text === '/help')  return sendHelp(chatId);

  if (state === 'AWAIT_EMAIL') return onEmailInput(chatId, userId, text);
  if (state === 'AWAIT_OTP')   return onOtpInput(chatId, userId, text);
  if (state === 'AWAIT_FOOD')  return onFoodInput(chatId, userId, text);

  // Default: jika sudah login, langsung proses sebagai makanan
  const email = getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  setState(userId, 'AWAIT_FOOD');
  return onFoodInput(chatId, userId, text);
}

// ====================================================
// CALLBACK QUERY HANDLER
// ====================================================
function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  const data   = cb.data;
  answerCallback(cb.id);

  const email = getLinkedEmail(userId);

  if (data === 'menu')        return showMainMenu(chatId, userId);
  if (data === 'dashboard')   return email ? showDashboard(chatId, email)     : promptLogin(chatId, userId);
  if (data === 'log_food')    return email ? promptFoodInput(chatId, userId)   : promptLogin(chatId, userId);
  if (data === 'history')     return email ? showHistory(chatId, email)        : promptLogin(chatId, userId);
  if (data === 'settings')    return showSettings(chatId, userId, email);
  if (data === 'logout')      return doLogout(chatId, userId);
  if (data === 'confirm_yes') return confirmSaveFood(chatId, userId);
  if (data === 'confirm_no')  return cancelFood(chatId, userId);
  if (data === 'hist_7')      return showHistoryDays(chatId, email, 7);
  if (data === 'hist_14')     return showHistoryDays(chatId, email, 14);
  if (data === 'hist_30')     return showHistoryDays(chatId, email, 30);
}

// ====================================================
// START & LOGIN FLOW
// ====================================================
function onStart(chatId, userId) {
  const email = getLinkedEmail(userId);
  if (email) {
    const profile  = getFirebase('users/' + safe(email) + '/lf_profile');
    const userName = profile ? (profile.name || 'Bro') : 'Bro';
    sendMessage(chatId,
      '*Selamat datang kembali, ' + userName + '!*\n\nPilih menu di bawah:',
      mainMenuKeyboard()
    );
  } else {
    promptLogin(chatId, userId);
  }
}

function promptLogin(chatId, userId) {
  setState(userId, 'AWAIT_EMAIL');
  sendMessage(chatId,
    '*LebihFit Tracker Bot*\n\n' +
    'Halo! Untuk mulai, login dulu ya.\n\n' +
    'Kirim *email* yang lu pakai di LebihFit web app:',
    null
  );
}

function onEmailInput(chatId, userId, email) {
  if (!email.includes('@') || !email.includes('.')) {
    return sendMessage(chatId, 'Format email tidak valid. Coba lagi!');
  }
  setState(userId, 'AWAIT_OTP');
  setCache(userId + '_email', email);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  setCache(userId + '_otp', otp);

  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Kode OTP LebihFit Bot - ' + otp,
      htmlBody:
        '<div style="font-family:Arial;background:#060b11;color:#e0f7fa;padding:32px;border-radius:12px;max-width:480px">' +
        '<h2 style="color:#00f0ff;text-align:center">LebihFit Bot</h2>' +
        '<p>Kode OTP untuk login Telegram Bot:</p>' +
        '<div style="background:#0b121c;border:2px solid #00f0ff;border-radius:8px;padding:20px;text-align:center;margin:20px 0">' +
        '<span style="font-size:2.5rem;font-weight:900;letter-spacing:8px;color:#00f0ff">' + otp + '</span>' +
        '</div><p style="color:#8caebf;font-size:.85rem">Berlaku 10 menit.</p></div>'
    });
    sendMessage(chatId,
      'OTP dikirim ke *' + email + '*\n\nCek email lu dan kirim kode 6 digit di sini:',
      null
    );
  } catch(err) {
    setState(userId, null);
    sendMessage(chatId, 'Gagal kirim OTP: ' + err.message + '\n\nPastikan email benar ya.');
  }
}

function onOtpInput(chatId, userId, otpInput) {
  const storedOtp   = getCache(userId + '_otp');
  const storedEmail = getCache(userId + '_email');

  if (!storedOtp || !storedEmail) {
    setState(userId, null);
    return sendMessage(chatId, 'OTP expired. Ketik /start untuk coba lagi.');
  }
  if (otpInput.trim() !== storedOtp) {
    return sendMessage(chatId, 'Kode OTP salah. Coba lagi!');
  }

  // Link account
  setFirebase('telegram_links/' + userId, {
    email: storedEmail,
    chatId: chatId,
    linkedAt: new Date().toISOString()
  });
  setFirebase('users/' + safe(storedEmail) + '/telegram_chat_id', chatId.toString());

  setState(userId, null);
  deleteCache(userId + '_otp');
  deleteCache(userId + '_email');

  const profile  = getFirebase('users/' + safe(storedEmail) + '/lf_profile');
  const userName = profile ? (profile.name || 'Bro') : 'Bro';

  sendMessage(chatId,
    'Login berhasil, *' + userName + '*!\n\nAkun LebihFit lu sudah terhubung. Pilih menu:',
    mainMenuKeyboard()
  );
}

// ====================================================
// MAIN MENU
// ====================================================
function showMainMenu(chatId, userId) {
  const email = getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  const profile  = getFirebase('users/' + safe(email) + '/lf_profile');
  const userName = profile ? (profile.name || 'Bro') : 'Bro';

  sendMessage(chatId,
    'Halo, *' + userName + '*! Mau ngapain hari ini?',
    mainMenuKeyboard()
  );
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Dashboard',   callback_data: 'dashboard' },
        { text: '🍽️ Log Makanan', callback_data: 'log_food'  }
      ],
      [
        { text: '📈 History',   callback_data: 'history'  },
        { text: '⚙️ Settings', callback_data: 'settings' }
      ]
    ]
  };
}

// ====================================================
// DASHBOARD
// ====================================================
function showDashboard(chatId, email) {
  const today   = todayKey();
  const logs    = getFirebase('users/' + safe(email) + '/lf_logs_' + today) || [];
  const profile = getFirebase('users/' + safe(email) + '/lf_profile');
  const total   = sumNutrients(logs);
  const calTarget  = Math.round((profile && profile.targets) ? profile.targets.cal : 0);
  const remaining  = calTarget - Math.round(total.cal);
  const pct        = calTarget > 0 ? Math.min(100, Math.round(total.cal / calTarget * 100)) : 0;
  const bar        = progressBar(pct);

  var msg = '*Dashboard - ' + formatDate(new Date()) + '*\n\n';
  msg += 'Kalori: *' + Math.round(total.cal) + ' / ' + calTarget + ' kcal*\n';
  msg += bar + ' ' + pct + '%\n';
  msg += remaining > 0
    ? 'Sisa: *' + remaining + ' kcal*\n'
    : 'Melebihi target: *' + Math.abs(remaining) + ' kcal*\n';
  msg += '\n';
  msg += 'Protein: *' + total.protein.toFixed(1) + 'g*\n';
  msg += 'Karbo:   *' + total.carbs.toFixed(1) + 'g*\n';
  msg += 'Lemak:   *' + total.fat.toFixed(1) + 'g*\n';
  msg += 'Serat:   *' + total.fiber.toFixed(1) + 'g*\n';
  msg += '\n*' + logs.length + ' makanan* tercatat hari ini\n';

  if (logs.length > 0) {
    msg += '\n*Log Makanan:*\n';
    var shown = logs.slice(-5);
    for (var i = 0; i < shown.length; i++) {
      msg += (i+1) + '. ' + shown[i].name + ' - ' + Math.round(shown[i].cal) + ' kcal\n';
    }
    if (logs.length > 5) msg += '_...dan ' + (logs.length - 5) + ' lainnya_\n';
  }

  sendMessage(chatId, msg, {
    inline_keyboard: [
      [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }]
    ]
  });
}

// ====================================================
// LOG MAKANAN
// ====================================================
function promptFoodInput(chatId, userId) {
  setState(userId, 'AWAIT_FOOD');
  sendMessage(chatId,
    '*Log Makanan*\n\nKetik nama makanan yang lu makan:\n\n_Contoh:_\nnasi goreng ayam 1 piring\nayam geprek sambel 200g\nkopi susu gula 1 gelas',
    { inline_keyboard: [[{ text: 'Batal', callback_data: 'menu' }]] }
  );
}

function onFoodInput(chatId, userId, text) {
  if (!text || text.length < 2) {
    return sendMessage(chatId, 'Deskripsi makanan terlalu pendek. Coba lagi!');
  }
  const email = getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  setState(userId, null);
  sendChatAction(chatId, 'typing');
  sendMessage(chatId, 'Menganalisis: _' + text + '_...', null);

  try {
    var nutrition = analyzeWithGroq(text);
    setCache(userId + '_pending', JSON.stringify(nutrition));

    var msg = 'Hasil Analisis AI:\n\n';
    msg += '*' + nutrition.name + '*\n';
    msg += 'Porsi: ' + (nutrition.portion || '1 porsi') + '\n\n';
    msg += 'Kalori: *' + Math.round(nutrition.cal || 0) + ' kcal*\n';
    msg += 'Protein: *' + Number(nutrition.protein || 0).toFixed(1) + 'g*\n';
    msg += 'Karbo: *' + Number(nutrition.carbs || 0).toFixed(1) + 'g*\n';
    msg += 'Lemak: *' + Number(nutrition.fat || 0).toFixed(1) + 'g*\n';
    msg += 'Serat: *' + Number(nutrition.fiber || 0).toFixed(1) + 'g*\n\n';
    msg += '_Simpan ke dashboard?_';

    sendMessage(chatId, msg, {
      inline_keyboard: [[
        { text: 'Simpan', callback_data: 'confirm_yes' },
        { text: 'Batal',  callback_data: 'confirm_no'  }
      ]]
    });
  } catch(err) {
    Logger.log('onFoodInput ERR: ' + err);
    sendMessage(chatId, 'Gagal analisis: ' + err.message, {
      inline_keyboard: [[
        { text: 'Coba Lagi', callback_data: 'log_food' },
        { text: 'Menu',      callback_data: 'menu'     }
      ]]
    });
  }
}

function confirmSaveFood(chatId, userId) {
  var email = getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  var raw = getCache(userId + '_pending');
  if (!raw) return sendMessage(chatId, 'Data expired. Silakan log ulang.', mainMenuKeyboard());

  var nutrition = JSON.parse(raw);
  deleteCache(userId + '_pending');

  var today   = todayKey();
  var logsKey = 'lf_logs_' + today;
  var existing = getFirebase('users/' + safe(email) + '/' + logsKey) || [];

  var newItem = {
    id:        Utilities.getUuid(),
    name:      nutrition.name || 'Makanan',
    portion:   nutrition.portion || '1 porsi',
    cal:       nutrition.cal     || 0,
    protein:   nutrition.protein || 0,
    carbs:     nutrition.carbs   || 0,
    fat:       nutrition.fat     || 0,
    fiber:     nutrition.fiber   || 0,
    sugar:     nutrition.sugar   || 0,
    sodium:    nutrition.sodium  || 0,
    calcium:   nutrition.calcium || 0,
    iron:      nutrition.iron    || 0,
    vitC:      nutrition.vitC    || 0,
    vitD:      nutrition.vitD    || 0,
    zinc:      nutrition.zinc    || 0,
    mealTime:  guessMealTime(),
    loggedAt:  new Date().toISOString(),
    source:    'telegram'
  };

  existing.push(newItem);
  setFirebase('users/' + safe(email) + '/' + logsKey, existing);

  var total     = sumNutrients(existing);
  var profile   = getFirebase('users/' + safe(email) + '/lf_profile');
  var calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 0);

  var msg = '*' + newItem.name + '* tersimpan!\n\n';
  msg += 'Total hari ini: *' + Math.round(total.cal) + ' / ' + calTarget + ' kcal*\n\n';
  msg += 'Log lagi atau lihat dashboard?';

  sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: 'Log Lagi',   callback_data: 'log_food'  },
        { text: 'Dashboard',  callback_data: 'dashboard' }
      ],
      [{ text: 'Menu Utama', callback_data: 'menu' }]
    ]
  });
}

function cancelFood(chatId, userId) {
  deleteCache(userId + '_pending');
  sendMessage(chatId, 'Dibatalkan.', mainMenuKeyboard());
}

// ====================================================
// HISTORY
// ====================================================
function showHistory(chatId, email) {
  sendMessage(chatId, '*History*\n\nPilih rentang waktu:', {
    inline_keyboard: [
      [
        { text: '7 Hari',  callback_data: 'hist_7'  },
        { text: '14 Hari', callback_data: 'hist_14' },
        { text: '30 Hari', callback_data: 'hist_30' }
      ],
      [{ text: 'Menu Utama', callback_data: 'menu' }]
    ]
  });
}

function showHistoryDays(chatId, email, days) {
  var results = [];
  for (var i = 0; i < days; i++) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var key  = d.toISOString().slice(0, 10);
    var logs = getFirebase('users/' + safe(email) + '/lf_logs_' + key) || [];
    if (logs.length > 0) {
      var t = sumNutrients(logs);
      results.push({ date: key, cal: Math.round(t.cal), count: logs.length });
    }
  }

  if (results.length === 0) {
    return sendMessage(chatId, 'Belum ada data untuk ' + days + ' hari terakhir.', {
      inline_keyboard: [[{ text: 'Menu Utama', callback_data: 'menu' }]]
    });
  }

  var totalCal = 0;
  for (var j = 0; j < results.length; j++) totalCal += results[j].cal;
  var avgCal = Math.round(totalCal / results.length);

  var msg = '*History ' + days + ' Hari Terakhir*\n\n';
  msg += 'Rata-rata: *' + avgCal + ' kcal/hari*\n';
  msg += 'Hari aktif: *' + results.length + ' hari*\n\n';
  msg += '*Detail:*\n';

  var shown = results.slice(0, 10);
  for (var k = 0; k < shown.length; k++) {
    var r = shown[k];
    var dt = new Date(r.date);
    var label = (dt.getDate()) + '/' + (dt.getMonth() + 1);
    msg += label + ': *' + r.cal + ' kcal* (' + r.count + ' makanan)\n';
  }
  if (results.length > 10) msg += '_...dan ' + (results.length - 10) + ' hari lainnya_\n';

  sendMessage(chatId, msg, {
    inline_keyboard: [
      [{ text: 'Dashboard Hari Ini', callback_data: 'dashboard' }],
      [{ text: 'Menu Utama',         callback_data: 'menu'      }]
    ]
  });
}

// ====================================================
// SETTINGS
// ====================================================
function showSettings(chatId, userId, email) {
  var msg = '*Settings*\n\n';
  if (email) {
    var profile = getFirebase('users/' + safe(email) + '/lf_profile');
    msg += 'Akun: *' + email + '*\n';
    if (profile) {
      msg += 'Target: *' + Math.round((profile.targets && profile.targets.cal) ? profile.targets.cal : 0) + ' kcal/hari*\n';
      msg += 'Tujuan: *' + (profile.target || '-').replace(/_/g, ' ').toUpperCase() + '*\n';
      msg += 'BB/TB: *' + profile.bb + 'kg / ' + profile.tb + 'cm*\n';
    }
    msg += '\n_Untuk ubah profil, gunakan web app._';
    sendMessage(chatId, msg, {
      inline_keyboard: [
        [{ text: 'Logout', callback_data: 'logout' }],
        [{ text: 'Menu Utama', callback_data: 'menu' }]
      ]
    });
  } else {
    msg += 'Belum login.';
    sendMessage(chatId, msg, {
      inline_keyboard: [[{ text: 'Login', callback_data: 'menu' }]]
    });
  }
}

function doLogout(chatId, userId) {
  var email = getLinkedEmail(userId);
  if (email) {
    setFirebase('telegram_links/' + userId, null);
    setFirebase('users/' + safe(email) + '/telegram_chat_id', null);
  }
  setState(userId, null);
  sendMessage(chatId, 'Logout berhasil! Ketik /start untuk login lagi.', null);
}

// ====================================================
// HELP
// ====================================================
function sendHelp(chatId) {
  sendMessage(chatId,
    '*LebihFit Bot - Bantuan*\n\n' +
    '/start - Mulai atau Menu Utama\n' +
    '/menu  - Tampilkan menu\n' +
    '/help  - Bantuan\n\n' +
    '*Log Makanan Cepat:*\n' +
    'Langsung ketik nama makanan:\n' +
    'nasi goreng ayam 1 piring\n' +
    'mie ayam bakso 1 porsi\n\n' +
    'Bot otomatis analisis dan minta konfirmasi sebelum disimpan!',
    { inline_keyboard: [[{ text: 'Menu Utama', callback_data: 'menu' }]] }
  );
}

// ====================================================
// OTP UNTUK WEB APP
// ====================================================
function handleSendOTP(body) {
  var email = body.email;
  var name  = body.name;
  if (!email) return jsonResp({ ok: false, error: 'Email required' });
  var otp = Math.floor(100000 + Math.random() * 900000).toString();
  var cache = CacheService.getScriptCache();
  cache.put('otp_' + email, JSON.stringify({ otp: otp, name: name, expires: Date.now() + 600000 }), 600);
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Kode OTP LebihFit - ' + otp,
      htmlBody: '<div style="font-family:Arial;background:#060b11;color:#e0f7fa;padding:32px;border-radius:12px;max-width:480px"><h2 style="color:#00f0ff;text-align:center">LebihFit</h2><p>Halo <b>' + (name||'Bro') + '</b>! Kode OTP:<br><br><div style="background:#0b121c;border:2px solid #00f0ff;border-radius:8px;padding:20px;text-align:center"><span style="font-size:2.5rem;font-weight:900;letter-spacing:8px;color:#00f0ff">' + otp + '</span></div><br><p style="color:#8caebf;font-size:.85rem">Berlaku 10 menit.</p></div>'
    });
    return jsonResp({ ok: true });
  } catch(e) {
    return jsonResp({ ok: false, error: e.message });
  }
}

function handleVerifyOTP(body) {
  var email = body.email;
  var otp   = body.otp;
  if (!email || !otp) return jsonResp({ ok: false, error: 'Email and OTP required' });
  var cache  = CacheService.getScriptCache();
  var stored = cache.get('otp_' + email);
  if (!stored) return jsonResp({ ok: false, error: 'OTP expired' });
  var data = JSON.parse(stored);
  if (data.otp !== otp.toString()) return jsonResp({ ok: false, error: 'OTP salah' });
  cache.remove('otp_' + email);
  return jsonResp({ ok: true, name: data.name });
}

// ====================================================
// GROQ AI
// ====================================================
function analyzeWithGroq(text) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY belum diset di Script Properties');
  var prompt = 'Berikan estimasi nutrisi untuk: "' + text + '"\nJawab HANYA JSON:\n{"name":"nama makanan","portion":"porsi","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0}';
  var res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      response_format: { type: 'json_object' }
    }),
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.choices || !data.choices[0]) throw new Error('Groq error');
  return JSON.parse(data.choices[0].message.content);
}

// ====================================================
// FIREBASE HELPERS
// ====================================================
function safe(email) { return email.replace(/[.#$\[\]]/g, '_'); }

function getFirebase(path) {
  try {
    var res = UrlFetchApp.fetch(FB_URL + '/' + path + '.json', { muteHttpExceptions: true });
    var val = JSON.parse(res.getContentText());
    return val === null ? null : val;
  } catch(e) { return null; }
}

function setFirebase(path, value) {
  try {
    UrlFetchApp.fetch(FB_URL + '/' + path + '.json', {
      method:      value === null ? 'DELETE' : 'PUT',
      contentType: 'application/json',
      payload:     value !== null ? JSON.stringify(value) : '',
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('FB SET err: ' + e); }
}

function getLinkedEmail(userId) {
  var data = getFirebase('telegram_links/' + userId);
  return (data && data.email) ? data.email : null;
}

// ====================================================
// STATE & CACHE
// ====================================================
function setState(userId, state) {
  var c = CacheService.getScriptCache();
  if (state) c.put('state_' + userId, state, 3600);
  else        c.remove('state_' + userId);
}
function getState(userId) {
  return CacheService.getScriptCache().get('state_' + userId) || null;
}
function setCache(key, value) {
  CacheService.getScriptCache().put('lf_' + key, value, 600);
}
function getCache(key) {
  return CacheService.getScriptCache().get('lf_' + key);
}
function deleteCache(key) {
  CacheService.getScriptCache().remove('lf_' + key);
}

// ====================================================
// TELEGRAM HELPERS
// ====================================================
function sendMessage(chatId, text, keyboard) {
  var payload = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
  if (keyboard) payload.reply_markup = keyboard;
  UrlFetchApp.fetch(TG_API + '/sendMessage', {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}
function sendChatAction(chatId, action) {
  UrlFetchApp.fetch(TG_API + '/sendChatAction', {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, action: action }), muteHttpExceptions: true
  });
}
function answerCallback(cbId) {
  UrlFetchApp.fetch(TG_API + '/answerCallbackQuery', {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: cbId }), muteHttpExceptions: true
  });
}

// ====================================================
// UTILITIES
// ====================================================
function todayKey() { return new Date().toISOString().slice(0, 10); }

function formatDate(d) {
  var days   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function progressBar(pct) {
  var filled = Math.round(pct / 10);
  var bar = '';
  for (var i = 0; i < 10; i++) bar += (i < filled) ? '\u2588' : '\u2591';
  return bar;
}

function guessMealTime() {
  var h = (new Date().getHours() + 7) % 24;
  if (h >= 5  && h < 10) return 'sarapan';
  if (h >= 10 && h < 14) return 'makan_siang';
  if (h >= 14 && h < 17) return 'snack_siang';
  if (h >= 17 && h < 21) return 'makan_malam';
  return 'snack_malam';
}

function sumNutrients(items) {
  var keys = ['cal','protein','carbs','fat','fiber','sugar','sodium','calcium','iron','vitC','vitD','zinc'];
  var acc  = { cal:0, protein:0, carbs:0, fat:0, fiber:0, sugar:0, sodium:0, calcium:0, iron:0, vitC:0, vitD:0, zinc:0 };
  for (var i = 0; i < items.length; i++) {
    for (var j = 0; j < keys.length; j++) acc[keys[j]] += items[i][keys[j]] || 0;
  }
  return acc;
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====================================================
// SETUP — Jalankan setWebhook() SEKALI setelah deploy
// ====================================================
function setWebhook() {
  var webhookUrl = ScriptApp.getService().getUrl();
  var res = UrlFetchApp.fetch(TG_API + '/setWebhook', {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify({ url: webhookUrl, allowed_updates: ['message','callback_query'] })
  });
  Logger.log('Webhook: ' + res.getContentText());
}
