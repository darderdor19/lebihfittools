// ====================================================
// LEBIHFIT - Google Apps Script (Spreadsheet Sync Only)
// ====================================================
// Script ini murni hanya untuk menarik data users (Email, Nama, No HP)
// dari Firebase dan mencatatnya ke Google Spreadsheet.
// ====================================================

const PROPS = PropertiesService.getScriptProperties();
const FB_URL = 'https://lebihfittools-default-rtdb.asia-southeast1.firebasedatabase.app';
const FB_SECRET = PROPS.getProperty('FB_SECRET') || '';
const SPREADSHEET_ID = PROPS.getProperty('SPREADSHEET_ID');

// ====================================================
// FIREBASE HELPERS
// ====================================================
function getFirebase(path) {
  try {
    var url = FB_URL + '/' + path + '.json';
    if (FB_SECRET) url += '?auth=' + FB_SECRET;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var val = JSON.parse(res.getContentText());
    return val === null ? null : val;
  } catch (e) { return null; }
}

// ====================================================
// SPREADSHEET SYNC
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
      sheet = ss.insertSheet('Users');
    }

    // Header yang difokuskan untuk follow-up leads
    var headers = ['Email', 'Name', 'Phone', 'CreatedAt', 'LastLogin'];

    // Baca semua users dari Firebase
    var users = getFirebase('users') || {};

    var rows = [headers];
    for (var safeEmail in users) {
      var user = users[safeEmail];
      var profile = user.lf_profile || {};

      var email = user.lf_user_email || '';
      var name = user.lf_user_name || profile.lf_user_name || profile.name || '';
      var phone = user.lf_user_phone || profile.lf_user_phone || profile.phone || '';
      var createdAt = profile.createdAt || '';
      var lastLogin = profile.lastLogin || '';

      rows.push([
        email,
        name,
        phone,
        createdAt,
        lastLogin
      ]);
    }

    // Tulis ke sheet
    sheet.clearContents();
    if (rows.length > 1) {
      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Styling Header
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#060b11');
    headerRange.setFontColor('#00f0ff');

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
  
  // Hapus trigger lama yang nyangkut
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // Bikin trigger baru: Sync spreadsheet setiap 6 jam
  ScriptApp.newTrigger('syncUsersToSpreadsheet')
    .timeBased()
    .everyHours(6)
    .create();

  Logger.log('Triggers setup complete!');
}

function testSpreadsheetSync() {
  syncUsersToSpreadsheet();
  Logger.log('Spreadsheet sync complete!');
}
