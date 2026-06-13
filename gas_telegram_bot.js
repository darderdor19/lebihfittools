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
const FB_URL = 'https://lebihfittools-default-rtdb.asia-southeast1.firebasedatabase.app';

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

  // Simpan email dan nama user ke Firebase jika belum ada
  try {
    setFirebase('users/' + safe(email) + '/lf_user_email', email);
    setFirebase('users/' + safe(email) + '/lf_user_name', data.name);
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

  // Sync spreadsheet setiap 6 jam
  ScriptApp.newTrigger('syncUsersToSpreadsheet')
    .timeBased()
    .everyHours(6)
    .create();

  Logger.log('Triggers setup complete!');
}

// ====================================================
// TEST FUNCTIONS
// ====================================================
function testSpreadsheetSync() {
  syncUsersToSpreadsheet();
  Logger.log('Spreadsheet sync complete!');
}
