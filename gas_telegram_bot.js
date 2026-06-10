// ====================================================
// LEBIHFIT - Google Apps Script (OTP + Email Only)
// ====================================================
// Bot Telegram sekarang di Vercel. Script ini hanya:
//   1. Handle requestOTP & verifyOTP dari web app
//   2. Kirim daily AI analysis email jam 12 malam
//   3. Sync data users dari Firebase → Google Spreadsheet
// ====================================================
// SCRIPT PROPERTIES yang harus diisi:
//   GROQ_API_KEY = API key Groq lu
// ====================================================

const PROPS = PropertiesService.getScriptProperties();
const GROQ_KEY = PROPS.getProperty('GROQ_API_KEY');
const FB_URL = 'https://lebihfit-tools-final-default-rtdb.asia-southeast1.firebasedatabase.app';

// ID Spreadsheet LebihFit Database (ambil dari URL spreadsheet lu)
// Contoh: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = PROPS.getProperty('SPREADSHEET_ID');

// ====================================================
// ENTRY POINTS
// ====================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'requestOTP') {
      return handleRequestOTPCombined(body);
    }
    if (body.action === 'verifyOTP') {
      return handleVerifyOTPCombined(body);
    }
  } catch (err) {
    Logger.log('doPost ERR: ' + err);
  }
  return respondSuccessCombined({ message: 'OK' });
}

function doGet() {
  return ContentService.createTextOutput('LebihFit OTP Service is running!');
}

// ====================================================
// OTP UNTUK WEB APP
// ====================================================
function handleRequestOTPCombined(body) {
  var email = body.email;
  var name = body.name || 'Bro';
  if (!email || !email.includes('@')) {
    return respondErrorCombined('Email tidak valid');
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
    return respondSuccessCombined({ message: 'OTP terkirim ke email' });
  } catch (e) {
    return respondErrorCombined('Gagal mengirim email: ' + e.message);
  }
}

function handleVerifyOTPCombined(body) {
  var email = body.email;
  var otp = body.otp;
  if (!email || !otp) {
    return respondErrorCombined('Data tidak lengkap');
  }

  var cache = CacheService.getScriptCache();
  var stored = cache.get('otp_' + email);
  if (!stored) {
    return respondErrorCombined('Kode OTP sudah kedaluwarsa, silakan request ulang');
  }

  var data = JSON.parse(stored);
  if (data.otp !== otp.toString()) {
    return respondErrorCombined('Kode OTP salah');
  }

  cache.remove('otp_' + email);

  // Simpan nama user ke Firebase jika belum ada
  try {
    setFirebase('users/' + safe(email) + '/lf_profile/lf_user_name', data.name);
    // Sync users ke spreadsheet setelah login baru
    syncUsersToSpreadsheet();
  } catch (err) {
    Logger.log('Error saving user: ' + err);
  }

  return respondSuccessCombined({
    message: 'Login berhasil',
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

// ====================================================
// SPREADSHEET SYNC
// ====================================================
// Fungsi ini sync data users dari Firebase → Google Spreadsheet
// Dijalankan otomatis setiap hari dan setelah ada login baru
// ====================================================
function syncUsersToSpreadsheet() {
  if (!SPREADSHEET_ID) {
    Logger.log('SPREADSHEET_ID belum diset di Script Properties');
    return;
  }

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Users');
    if (!sheet) {
      // Buat sheet Users jika belum ada
      sheet = ss.insertSheet('Users');
    }

    // Header — sama persis dengan yang sudah ada
    var headers = ['Email', 'CurrentOTP', 'OTPExpiredAt', 'CreatedAt', 'LastLogin', 'Name'];

    // Baca semua users dari Firebase
    var users = getFirebase('users') || {};

    // Build rows
    var rows = [headers];
    for (var safeEmail in users) {
      var user = users[safeEmail];
      var profile = user.lf_profile || {};

      var email = user.lf_user_email || '';
      var name = user.lf_user_name || profile.lf_user_name || profile.name || '';
      var createdAt = profile.createdAt || '';
      var lastLogin = profile.lastLogin || '';

      // OTP kolom dikosongkan (tidak tersimpan di Firebase, hanya di CacheService sementara)
      rows.push([
        email,
        '',          // CurrentOTP - tidak disimpan permanen (keamanan)
        '',          // OTPExpiredAt - tidak disimpan permanen
        createdAt,
        lastLogin,
        name
      ]);
    }

    // Clear dan tulis ulang
    sheet.clearContents();
    if (rows.length > 1) {
      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
    } else {
      // Hanya header jika tidak ada user
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Format header
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#060b11');
    headerRange.setFontColor('#00f0ff');

    // Auto resize kolom
    for (var col = 1; col <= headers.length; col++) {
      sheet.autoResizeColumn(col);
    }

    Logger.log('Spreadsheet synced: ' + (rows.length - 1) + ' users');
  } catch (err) {
    Logger.log('syncUsersToSpreadsheet ERROR: ' + err);
  }
}

// ====================================================
// SETUP TRIGGER — Jalankan sekali untuk setup auto-sync
// ====================================================
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  
  // Hapus trigger yang sudah ada untuk fungsi ini
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'sendDailyAIAnalysisEmail' || fn === 'syncUsersToSpreadsheet') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Daily email jam 12 malam
  ScriptApp.newTrigger('sendDailyAIAnalysisEmail')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();

  // Sync spreadsheet setiap 6 jam
  ScriptApp.newTrigger('syncUsersToSpreadsheet')
    .timeBased()
    .everyHours(6)
    .create();

  Logger.log('Triggers setup complete!');
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
      if (logs.length === 0) continue;

      var analysisKey = 'lf_analysis_' + today;
      var analysisData = user[analysisKey];
      var analysisText = '';

      if (analysisData && analysisData.text && analysisData.logCount === logs.length) {
        analysisText = analysisData.text;
      } else {
        analysisText = generateAIAnalysisForGAS(logs, user.lf_profile);
        setFirebase('users/' + safeEmail + '/' + analysisKey, {
          text: analysisText,
          logCount: logs.length,
          timestamp: new Date().toISOString()
        });
      }

      sendDailyEmail(email, user.lf_user_name || 'Bro', logs, analysisText, sumNutrients(logs), user.lf_profile);
      Logger.log('Sent daily report email to: ' + email);
    } catch (err) {
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
  var subject = 'Analisis Nutrisi Harian LebihFit Kamu';
  var calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);
  var proteinTarget = Math.round((profile && profile.targets) ? profile.targets.protein : 0);
  var carbsTarget = Math.round((profile && profile.targets) ? profile.targets.carbs : 0);
  var fatTarget = Math.round((profile && profile.targets) ? profile.targets.fat : 0);

  function getProgressLine(val, target, unit, labelName) {
    var pct = target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
    var filled = Math.round(pct / 10);
    var bar = '';
    for (var i = 0; i < 10; i++) bar += (i < filled) ? '■' : '□';
    return '<div style="margin:8px 0;font-size:0.85rem;font-family:monospace;color:#e0f7fa">' +
           labelName + ': <strong>' + Math.round(val) + '</strong>/' + Math.round(target) + unit + ' (' + pct + '%)<br>' +
           '<span style="color:#00f0ff">' + bar + '</span></div>';
  }

  var progressHtml = getProgressLine(total.cal, calTarget, ' kcal', 'KALORI') +
                     getProgressLine(total.protein, proteinTarget, 'g', 'PROTEIN') +
                     getProgressLine(total.carbs, carbsTarget, 'g', 'KARBOHIDRAT') +
                     getProgressLine(total.fat, fatTarget, 'g', 'LEMAK');

  var logsHtml = '';
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
        '<tbody>' + logsHtml + '</tbody>' +
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

// ====================================================
// UTILITIES
// ====================================================
function todayKey() { return new Date().toISOString().slice(0, 10); }

function sumNutrients(items) {
  var keys = ['cal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium', 'calcium', 'iron', 'vitC', 'vitD', 'zinc'];
  var acc = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, calcium: 0, iron: 0, vitC: 0, vitD: 0, zinc: 0 };
  for (var i = 0; i < items.length; i++) {
    for (var j = 0; j < keys.length; j++) acc[keys[j]] += items[i][keys[j]] || 0;
  }
  return acc;
}

// ====================================================
// TEST FUNCTIONS
// ====================================================
function testEmail() {
  var userEmail = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: userEmail,
    subject: 'LebihFit Test Email',
    body: 'Jika lu menerima email ini, berarti otorisasi pengiriman email LebihFit sudah sukses!'
  });
  Logger.log('Test email sent to ' + userEmail);
}

function testSpreadsheetSync() {
  syncUsersToSpreadsheet();
  Logger.log('Spreadsheet sync complete!');
}
