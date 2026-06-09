// ====================================================
// LEBIHFIT TELEGRAM BOT - Full Featured
// ====================================================
// SCRIPT PROPERTIES yang harus diisi:
//   TELEGRAM_BOT_TOKEN = token dari BotFather
//   GROQ_API_KEY       = API key Groq lu
// ====================================================

const PROPS = PropertiesService.getScriptProperties();
const BOT_TOKEN = PROPS.getProperty('TELEGRAM_BOT_TOKEN');
const GROQ_KEY = PROPS.getProperty('GROQ_API_KEY');
const FB_URL = 'https://lebihfit-tools-final-default-rtdb.asia-southeast1.firebasedatabase.app';
const TG_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

// ====================================================
// ENTRY POINTS
// ====================================================
function logToFirebase(tag, data) {
  try {
    var timestamp = new Date().toISOString();
    var logKey = timestamp.replace(/[.#$\[\]]/g, '_') + '_' + Math.floor(Math.random() * 1000);
    setFirebase('bot_logs/' + logKey, {
      timestamp: timestamp,
      tag: tag,
      data: data
    });
  } catch (e) {
    // ignore
  }
}

function doPost(e) {
  var chatIdForErr = null;
  try {
    const contents = e.postData.contents;
    logToFirebase('doPost_received', contents);
    const body = JSON.parse(contents);
    if (body.message) {
      chatIdForErr = body.message.chat.id;
    } else if (body.callback_query && body.callback_query.message) {
      chatIdForErr = body.callback_query.message.chat.id;
    }

    // Debug webhook info to see Telegram delivery errors
    try {
      var infoRes = UrlFetchApp.fetch(TG_API + '/getWebhookInfo');
      logToFirebase('webhook_info_debug', JSON.parse(infoRes.getContentText()));
    } catch (webhookErr) {
      logToFirebase('webhook_info_error', webhookErr.toString());
    }

    // OTP handler untuk web app (menangani format requestOTP & verifyOTP dari app.js)
    if (body.action === 'requestOTP') {
      var res = handleRequestOTPCombined(body);
      logToFirebase('requestOTP_response', res.getContent());
      return res;
    }
    if (body.action === 'verifyOTP') {
      var res = handleVerifyOTPCombined(body);
      logToFirebase('verifyOTP_response', res.getContent());
      return res;
    }

    // Telegram update
    if (body.message) handleMessage(body.message);
    if (body.callback_query) handleCallback(body.callback_query);

  } catch (err) {
    Logger.log('doPost ERR: ' + err);
    logToFirebase('doPost_error', err.toString() + ' | Stack: ' + err.stack);
    if (chatIdForErr) {
      try {
        sendMessage(chatIdForErr, "⚠️ *Error Bot:* " + err.toString() + "\n\nHubungi developer atau coba lagi.", null, '');
      } catch (sendErr) {
        Logger.log('Failed to send error message: ' + sendErr);
      }
    }
  }
  return ContentService.createTextOutput('OK');
}

function doGet() {
  return ContentService.createTextOutput("LebihFit Combined API & Bot is running!");
}

// ====================================================
// MESSAGE HANDLER
// ====================================================
function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || '').trim();
  const state = getState(userId);
  
  logToFirebase('handleMessage', { userId: userId, chatId: chatId, text: text, state: state });

  // Handle /start commands (both plain and with payload)
  if (text.indexOf('/start') === 0) {
    var parts = text.split(' ');
    if (parts.length > 1) {
      // Decode email dari parameter start
      var payload = parts[1];
      var startEmail = payload.replace(/_at_/g, '@').replace(/_dot_/g, '.');
      logToFirebase('handleMessage_start_payload', { email: startEmail });
      return onEmailInput(chatId, userId, startEmail);
    }
    return onStart(chatId, userId);
  }

  if (text === '/menu') return showMainMenu(chatId, userId);
  if (text === '/help') return sendHelp(chatId);

  if (state === 'AWAIT_EMAIL') return onEmailInput(chatId, userId, text);
  if (state === 'AWAIT_OTP') return onOtpInput(chatId, userId, text);
  if (state === 'AWAIT_FOOD') return onFoodInput(chatId, userId, text);

  // Default: jika sudah login, langsung proses sebagai makanan
  const email = getLinkedEmail(userId);
  logToFirebase('handleMessage_default', { email: email });
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
  const data = cb.data;
  answerCallback(cb.id);

  const email = getLinkedEmail(userId);

  if (data === 'menu') return showMainMenu(chatId, userId);
  if (data === 'dashboard') return email ? showDashboard(chatId, email) : promptLogin(chatId, userId);
  if (data === 'log_food') return email ? promptFoodInput(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'history') return email ? showHistory(chatId, email) : promptLogin(chatId, userId);
  if (data === 'settings') return showSettings(chatId, userId, email);
  if (data === 'logout') return doLogout(chatId, userId);
  if (data === 'confirm_yes') return confirmSaveFood(chatId, userId);
  if (data === 'confirm_no') return cancelFood(chatId, userId);
  if (data === 'hist_7') return showHistoryDays(chatId, email, 7);
  if (data === 'hist_14') return showHistoryDays(chatId, email, 14);
  if (data === 'hist_30') return showHistoryDays(chatId, email, 30);
}

// ====================================================
// START & LOGIN FLOW
// ====================================================
function onStart(chatId, userId) {
  const email = getLinkedEmail(userId);
  if (email) {
    const profile = getFirebase('users/' + safe(email) + '/lf_profile');
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
  logToFirebase('onEmailInput_start', { chatId: chatId, userId: userId, email: email });
  if (!email.includes('@') || !email.includes('.')) {
    return sendMessage(chatId, 'Format email tidak valid. Coba lagi!');
  }
  
  try {
    // Hubungkan akun secara langsung tanpa OTP
    setFirebase('telegram_links/' + userId, {
      email: email,
      chatId: chatId,
      linkedAt: new Date().toISOString()
    });
    setFirebase('users/' + safe(email) + '/telegram_chat_id', chatId.toString());

    setState(userId, null);

    const profile = getFirebase('users/' + safe(email) + '/lf_profile');
    const userName = profile ? (profile.name || 'Bro') : 'Bro';

    sendMessage(chatId,
      'Login berhasil, *' + userName + '*!\n\nAkun LebihFit lu sudah terhubung secara instan. Pilih menu:',
      mainMenuKeyboard()
    );
  } catch (err) {
    logToFirebase('onEmailInput_error', err.toString() + ' | Stack: ' + err.stack);
    setState(userId, null);
    sendMessage(chatId, 'Gagal menghubungkan akun: ' + err.message, null, '');
  }
}

function onOtpInput(chatId, userId, otpInput) {
  logToFirebase('onOtpInput_start', { chatId: chatId, userId: userId, otpInput: otpInput });
  try {
    const storedOtp = getCache(userId + '_otp');
    const storedEmail = getCache(userId + '_email');
    logToFirebase('onOtpInput_stored', { storedOtp: storedOtp, storedEmail: storedEmail });

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

    const profile = getFirebase('users/' + safe(storedEmail) + '/lf_profile');
    const userName = profile ? (profile.name || 'Bro') : 'Bro';

    sendMessage(chatId,
      'Login berhasil, *' + userName + '*!\n\nAkun LebihFit lu sudah terhubung. Pilih menu:',
      mainMenuKeyboard()
    );
  } catch (err) {
    logToFirebase('onOtpInput_error', err.toString() + ' | Stack: ' + err.stack);
    sendMessage(chatId, 'Error verifikasi OTP: ' + err.message, null, '');
  }
}

// ====================================================
// MAIN MENU
// ====================================================
function showMainMenu(chatId, userId) {
  const email = getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  const profile = getFirebase('users/' + safe(email) + '/lf_profile');
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
      ],
      [
        { text: '🌐 Buka Web App', url: 'https://darderdor19.github.io/lebihfittools/' }
      ]
    ]
  };
}

// ====================================================
// DASHBOARD
// ====================================================
function showDashboard(chatId, email) {
  const today = todayKey();
  const logs = getFirebase('users/' + safe(email) + '/lf_logs_' + today) || [];
  const profile = getFirebase('users/' + safe(email) + '/lf_profile');
  const total = sumNutrients(logs);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 0);
  const remaining = calTarget - Math.round(total.cal);
  const pct = calTarget > 0 ? Math.min(100, Math.round(total.cal / calTarget * 100)) : 0;
  const bar = progressBar(pct);

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
      msg += (i + 1) + '. ' + shown[i].name + ' - ' + Math.round(shown[i].cal) + ' kcal\n';
    }
    if (logs.length > 5) msg += '_...dan ' + (logs.length - 5) + ' lainnya_\n';
    
    // Fetch cached AI analysis from Firebase
    try {
      var aiAnalysis = getFirebase('users/' + safe(email) + '/lf_analysis_' + today);
      if (aiAnalysis && aiAnalysis.text) {
        msg += '\n🤖 *Analisis AI & Saran Esok Hari:*\n';
        msg += '_' + aiAnalysis.text + '_\n';
      }
    } catch(e) {}
  }

  sendMessage(chatId, msg, {
    inline_keyboard: [
      [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
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
        { text: 'Batal', callback_data: 'confirm_no' }
      ]]
    });
  } catch (err) {
    Logger.log('onFoodInput ERR: ' + err);
    sendMessage(chatId, 'Gagal analisis: ' + err.message, {
      inline_keyboard: [[
        { text: 'Coba Lagi', callback_data: 'log_food' },
        { text: 'Menu', callback_data: 'menu' }
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

  var today = todayKey();
  var logsKey = 'lf_logs_' + today;
  var existing = getFirebase('users/' + safe(email) + '/' + logsKey) || [];

  var newItem = {
    id: Utilities.getUuid(),
    name: nutrition.name || 'Makanan',
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

  existing.push(newItem);
  setFirebase('users/' + safe(email) + '/' + logsKey, existing);

  var total = sumNutrients(existing);
  var profile = getFirebase('users/' + safe(email) + '/lf_profile');
  var calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 0);

  var msg = '*' + newItem.name + '* tersimpan!\n\n';
  msg += 'Total hari ini: *' + Math.round(total.cal) + ' / ' + calTarget + ' kcal*\n\n';
  msg += 'Log lagi atau lihat dashboard?';

  sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: '🍽️ Log Lagi',  callback_data: 'log_food'  },
        { text: '📊 Dashboard', callback_data: 'dashboard' }
      ],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
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
        { text: '7 Hari', callback_data: 'hist_7' },
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
    var key = d.toISOString().slice(0, 10);
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
      [{ text: '📊 Dashboard Hari Ini', callback_data: 'dashboard' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
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
        [{ text: '🚪 Logout', callback_data: 'logout' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
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
function handleRequestOTPCombined(body) {
  var email = body.email;
  var name = body.name || 'Bro';
  if (!email || !email.includes('@')) {
    return respondErrorCombined("Email tidak valid");
  }
  
  var otp = Math.floor(100000 + Math.random() * 900000).toString();
  var cache = CacheService.getScriptCache();
  cache.put('otp_' + email, JSON.stringify({ otp: otp, name: name }), 600); // 10 menit
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'Kode Login LebihFit Kamu',
      htmlBody: '<div style="font-family:Arial;background:#060b11;color:#e0f7fa;padding:32px;border-radius:12px;max-width:480px">' +
                '<h2 style="color:#00f0ff;text-align:center">LebihFit</h2>' +
                '<p>Halo <b>' + name + '</b>!</p>' +
                '<p>Kode OTP kamu untuk masuk ke LebihFit adalah:</p>' +
                '<div style="background:#0b121c;border:2px solid #00f0ff;border-radius:8px;padding:20px;text-align:center">' +
                '<span style="font-size:2.5rem;font-weight:900;letter-spacing:8px;color:#00f0ff">' + otp + '</span>' +
                '</div><br>' +
                '<p style="color:#8caebf;font-size:.85rem">Berlaku selama 10 menit. Jangan berikan kode ini kepada siapapun.</p>' +
                '</div>'
    });
    return respondSuccessCombined({ message: "OTP terkirim ke email" });
  } catch (e) {
    return respondErrorCombined("Gagal mengirim email: " + e.message);
  }
}

function handleVerifyOTPCombined(body) {
  var email = body.email;
  var otp = body.otp;
  if (!email || !otp) {
    return respondErrorCombined("Data tidak lengkap");
  }
  
  var cache = CacheService.getScriptCache();
  var stored = cache.get('otp_' + email);
  if (!stored) {
    return respondErrorCombined("Kode OTP sudah kedaluwarsa, silakan request ulang");
  }
  
  var data = JSON.parse(stored);
  if (data.otp !== otp.toString()) {
    return respondErrorCombined("Kode OTP salah");
  }
  
  cache.remove('otp_' + email);
  
  // Daftarkan/simpan profile user ke database Firebase jika belum ada namanya
  try {
    setFirebase('users/' + safe(email) + '/lf_profile/lf_user_name', data.name);
  } catch(err) {
    Logger.log('Error saving user name to Firebase: ' + err);
  }
  
  return respondSuccessCombined({ 
    message: "Login berhasil", 
    email: email, 
    name: data.name 
  });
}

function respondSuccessCombined(data) {
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function respondErrorCombined(message) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
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
  } catch (e) { return null; }
}

function setFirebase(path, value) {
  try {
    UrlFetchApp.fetch(FB_URL + '/' + path + '.json', {
      method: value === null ? 'DELETE' : 'PUT',
      contentType: 'application/json',
      payload: value !== null ? JSON.stringify(value) : '',
      muteHttpExceptions: true
    });
  } catch (e) { Logger.log('FB SET err: ' + e); }
}

function getLinkedEmail(userId) {
  var data = getFirebase('telegram_links/' + userId);
  return (data && data.email) ? data.email : null;
}

// ====================================================
// STATE & CACHE
// ====================================================
function setState(userId, state) {
  setFirebase('telegram_states/' + userId, state);
}
function getState(userId) {
  return getFirebase('telegram_states/' + userId) || null;
}
function setCache(key, value) {
  setFirebase('telegram_cache/' + key, value);
}
function getCache(key) {
  return getFirebase('telegram_cache/' + key) || null;
}
function deleteCache(key) {
  setFirebase('telegram_cache/' + key, null);
}

// ====================================================
// TELEGRAM HELPERS
// ====================================================
function sendMessage(chatId, text, keyboard, parseMode) {
  var payload = { chat_id: chatId, text: text };
  if (parseMode !== null && parseMode !== undefined) {
    if (parseMode) payload.parse_mode = parseMode;
  } else {
    payload.parse_mode = 'Markdown';
  }
  if (keyboard) payload.reply_markup = keyboard;
  try {
    var res = UrlFetchApp.fetch(TG_API + '/sendMessage', {
      method: 'POST', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var respText = res.getContentText();
    logToFirebase('sendMessage_response', { status: code, body: respText, chatId: chatId });
  } catch (e) {
    logToFirebase('sendMessage_exception', e.toString());
  }
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
  var days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
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
  if (h >= 5 && h < 10) return 'sarapan';
  if (h >= 10 && h < 14) return 'makan_siang';
  if (h >= 14 && h < 17) return 'snack_siang';
  if (h >= 17 && h < 21) return 'makan_malam';
  return 'snack_malam';
}

function sumNutrients(items) {
  var keys = ['cal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium', 'calcium', 'iron', 'vitC', 'vitD', 'zinc'];
  var acc = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, calcium: 0, iron: 0, vitC: 0, vitD: 0, zinc: 0 };
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
  // Gunakan URL web app yang dipublish secara manual agar 100% akurat
  var webhookUrl = 'https://script.google.com/macros/s/AKfycbwJKz3DwDQ7RC--c3yah7OviAW5ej41q2hrc9Rwwef_ccBbFWf-LL0lyEswej-mJkO2Rw/exec';
  var res = UrlFetchApp.fetch(TG_API + '/setWebhook', {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify({ 
      url: webhookUrl, 
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true 
    })
  });
  Logger.log('Webhook: ' + res.getContentText());
  
  // Setup midnight email trigger automatically
  createMidnightTrigger();
  Logger.log('Midnight email trigger set up successfully.');
}

function testEmail() {
  var userEmail = Session.getActiveUser().getEmail();
  try {
    MailApp.sendEmail({
      to: userEmail,
      subject: 'LebihFit Test Email',
      body: 'Jika lu menerima email ini, berarti otorisasi pengiriman email LebihFit sudah sukses!'
    });
    Logger.log('Test email sent successfully to ' + userEmail);
  } catch (err) {
    Logger.log('Test email failed: ' + err);
  }
}

// ====================================================
// SETUP DAILY MIDNIGHT EMAIL TRIGGER
// ====================================================
function createMidnightTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyAIAnalysisEmail') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Buat trigger harian jam 12 malam
  ScriptApp.newTrigger('sendDailyAIAnalysisEmail')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();
}

// ====================================================
// DAILY MIDNIGHT EMAIL SENDER
// ====================================================
function sendDailyAIAnalysisEmail() {
  var users = getFirebase('users') || {};
  var today = todayKey();
  
  for (var safeEmail in users) {
    try {
      var user = users[safeEmail];
      var email = user.lf_user_email;
      if (!email) continue;
      
      var logsKey = 'lf_logs_' + today;
      var logs = user[logsKey] || [];
      if (logs.length === 0) continue; // Skip if no logs today
      
      var analysisKey = 'lf_analysis_' + today;
      var analysisData = user[analysisKey];
      var analysisText = "";
      
      if (analysisData && analysisData.text && analysisData.logCount === logs.length) {
        analysisText = analysisData.text;
      } else {
        // Generate daily analysis using Groq in GAS
        analysisText = generateAIAnalysisForGAS(logs, user.lf_profile);
        // Cache it back to Firebase
        setFirebase('users/' + safeEmail + '/' + analysisKey, {
          text: analysisText,
          logCount: logs.length,
          timestamp: new Date().toISOString()
        });
      }
      
      // Send styled daily report email
      sendDailyEmail(email, user.lf_user_name || 'Bro', logs, analysisText, sumNutrients(logs), user.lf_profile);
      Logger.log('Sent daily report email to: ' + email);
    } catch(err) {
      Logger.log('Error sendDailyAIAnalysisEmail for ' + safeEmail + ': ' + err);
    }
  }
}

function generateAIAnalysisForGAS(logs, profile) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY belum diset');
  
  var total = sumNutrients(logs);
  var calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);
  
  var prompt = 'Analisis makanan hari ini untuk user:\n';
  prompt += 'Target Kalori: ' + calTarget + ' kcal.\n';
  prompt += 'Makanan hari ini (' + logs.length + ' item):\n';
  for (var i = 0; i < logs.length; i++) {
    prompt += '- ' + logs[i].name + ': ' + logs[i].cal + ' kcal (P: ' + (logs[i].protein || 0) + 'g, K: ' + (logs[i].carbs || 0) + 'g, L: ' + (logs[i].fat || 0) + 'g)\n';
  }
  prompt += 'Total Gizi Makro: Kalori ' + Math.round(total.cal) + ' kcal, Protein ' + total.protein.toFixed(1) + 'g, Karbo ' + total.carbs.toFixed(1) + 'g, Lemak ' + total.fat.toFixed(1) + 'g.\n';
  prompt += 'Total Gizi Mikro: Serat ' + total.fiber.toFixed(1) + 'g, Gula ' + total.sugar.toFixed(1) + 'g, Sodium ' + total.sodium.toFixed(1) + 'mg, Kalsium ' + total.calcium.toFixed(1) + 'mg, Zat Besi ' + total.iron.toFixed(1) + 'mg, Vit C ' + total.vitC.toFixed(1) + 'mg, Vit D ' + total.vitD.toFixed(1) + 'mcg, Zinc ' + total.zinc.toFixed(1) + 'mg.\n\n';
  prompt += 'Berikan evaluasi mengenai konsumsi makro dan mikro nutrisi hari ini, serta berikan saran praktis/konkrit makro dan mikro nutrisi apa yang sebaiknya dilakukan besok untuk mencapai target kebugaran mereka. Jawab dalam bahasa Indonesia, maksimal 4 kalimat. Format jawaban langsung teks analisis saja, tanpa kata pengantar atau penutup.';

  var res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300
    }),
    muteHttpExceptions: true
  });
  
  var data = JSON.parse(res.getContentText());
  if (!data.choices || !data.choices[0]) throw new Error('Groq error');
  return data.choices[0].message.content.trim();
}

function sendDailyEmail(email, name, logs, analysisText, total, profile) {
  var subject = "Analisis Nutrisi Harian LebihFit Kamu";
  
  var calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);
  var proteinTarget = Math.round((profile && profile.targets) ? profile.targets.protein : 0);
  var carbsTarget = Math.round((profile && profile.targets) ? profile.targets.carbs : 0);
  var fatTarget = Math.round((profile && profile.targets) ? profile.targets.fat : 0);
  
  // Create progress bar helper for email
  function getProgressLine(val, target, unit, name) {
    var pct = target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
    var filled = Math.round(pct / 10);
    var bar = '';
    for (var i = 0; i < 10; i++) bar += (i < filled) ? '■' : '□';
    return '<div style="margin:8px 0;font-size:0.85rem;font-family:monospace;color:#e0f7fa">' + 
           name + ': <strong>' + Math.round(val) + '</strong>/' + Math.round(target) + unit + ' (' + pct + '%)<br>' +
           '<span style="color:#00f0ff">' + bar + '</span></div>';
  }
  
  var progressHtml = getProgressLine(total.cal, calTarget, ' kcal', 'KALORI') +
                     getProgressLine(total.protein, proteinTarget, 'g', 'PROTEIN') +
                     getProgressLine(total.carbs, carbsTarget, 'g', 'KARBOHIDRAT') +
                     getProgressLine(total.fat, fatTarget, 'g', 'LEMAK');
  
  var logsHtml = "";
  for (var i = 0; i < logs.length; i++) {
    logsHtml += '<tr style="border-bottom:1px solid #1a2d42">' +
                '<td style="padding:10px;color:#e0f7fa;font-size:0.9rem">' + logs[i].name + '</td>' +
                '<td style="padding:10px;color:#8caebf;text-align:center;font-size:0.85rem">' + (logs[i].portion || '1 porsi') + '</td>' +
                '<td style="padding:10px;color:#00f0ff;text-align:right;font-weight:bold;font-size:0.9rem">' + Math.round(logs[i].cal) + ' kcal</td>' +
                '</tr>';
  }
  
  var htmlBody = 
    '<div style="font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;background:#060b11;color:#e0f7fa;padding:32px;border-radius:12px;max-width:550px;margin:0 auto;border:1px solid #00f0ff;box-shadow:0 0 20px rgba(0,240,255,0.15)">' +
      '<div style="text-align:center;margin-bottom:24px">' +
        '<h2 style="color:#00f0ff;margin:0;letter-spacing:2px;text-transform:uppercase">LebihFit</h2>' +
        '<span style="color:#8caebf;font-size:0.85rem">Laporan & Analisis Nutrisi Harian</span>' +
      '</div>' +
      
      '<p>Halo <strong>' + name + '</strong>,</p>' +
      '<p>Berikut adalah laporan lengkap konsumsi hari ini dan rekomendasi AI untuk besok:</p>' +
      
      '<div style="background:#0b121c;border-left:4px solid #00f0ff;padding:16px;border-radius:4px;margin:20px 0;font-style:italic;color:#e0f7fa">' +
        '<strong style="color:#00f0ff;display:block;margin-bottom:6px;font-style:normal">🤖 Analisis AI & Saran Esok Hari:</strong>' +
        '"' + analysisText + '"' +
      '</div>' +
      
      '<div style="background:#0b121c;padding:16px;border-radius:4px;margin:20px 0;border:1px solid #1a2d42">' +
        '<strong style="color:#00f0ff;display:block;margin-bottom:10px">📊 Ringkasan Nutrisi Hari Ini:</strong>' +
        progressHtml +
      '</div>' +
      
      '<h3 style="color:#00f0ff;border-bottom:1px solid #1a2d42;padding-bottom:6px;margin-top:24px">🍽️ Log Makanan Hari Ini</h3>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:10px">' +
        '<thead>' +
          '<tr style="background:#0b121c;color:#8caebf;font-size:0.85rem">' +
            '<th style="padding:10px;text-align:left">Makanan</th>' +
            '<th style="padding:10px;text-align:center">Porsi</th>' +
            '<th style="padding:10px;text-align:right">Kalori</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          logsHtml +
        '</tbody>' +
      '</table>' +
      
      '<div style="margin-top:30px;padding-top:20px;border-top:1px solid #1a2d42;text-align:center">' +
        '<a href="https://darderdor19.github.io/lebihfittools/" style="background:linear-gradient(135deg,#005c66,#00a6b8);color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:bold;letter-spacing:1px;font-size:0.85rem;display:inline-block;box-shadow:0 4px 10px rgba(0,240,255,0.2);margin: 6px">Buka Web App</a>' +
        '<a href="https://t.me/jadilebihfit_bot" style="background:linear-gradient(135deg,#1c74a3,#229ED9);color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:bold;letter-spacing:1px;font-size:0.85rem;display:inline-block;box-shadow:0 4px 10px rgba(34,158,217,0.2);margin: 6px">Akses Telegram Bot</a>' +
      '</div>' +
      
      '<p style="color:#4a6b7c;font-size:0.75rem;text-align:center;margin-top:30px">Email ini dikirimkan otomatis oleh sistem tracker LebihFit setiap jam 12 malam.</p>' +
    '</div>';
    
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}
