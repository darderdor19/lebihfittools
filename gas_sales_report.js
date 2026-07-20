// ====================================================
// LEBIHFIT — Google Apps Script (Unified)
// v2.0 — Users Sync + Sales Report
// ====================================================
// CARA SETUP:
// 1. Extensions → Apps Script → paste script ini
// 2. Klik ikon ⚙️ Project Settings → Script Properties
//    Tambah property:
//      FB_SECRET    = (database secret dari Firebase Console)
//      SPREADSHEET_ID = (ID spreadsheet ini, ambil dari URL)
// 3. Klik Deploy → New Deployment → Web App
//    Execute as: Me | Who has access: Anyone
// 4. Copy URL deployment → paste di Admin Dashboard LebihFit
// 5. Jalankan setupTriggers() sekali untuk aktifkan auto-sync users
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
  } catch (e) {
    Logger.log('getFirebase ERROR [' + path + ']: ' + e);
    return null;
  }
}

// ====================================================
// SPREADSHEET HELPER — buka SS (aktif atau by ID)
// ====================================================
function getSpreadsheet() {
  try {
    return SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log('getSpreadsheet ERROR: ' + e);
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

// ====================================================
// WEBHOOK — Terima data Sales Report dari Admin Dashboard
// ====================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Route: sales report
    if (data.date) {
      return handleSalesReport(data);
    }

    return jsonResponse(false, 'Unrecognized payload');
  } catch (err) {
    Logger.log('doPost ERROR: ' + err);
    return jsonResponse(false, err.message);
  }
}

// Health check / tes koneksi
function doGet(e) {
  return jsonResponse(true, 'LebihFit GAS v2.0 aktif! Users Sync + Sales Report ready.');
}

// ====================================================
// SALES REPORT — Tulis data laporan harian ke spreadsheet
// ====================================================
function handleSalesReport(data) {
  var ss = getSpreadsheet();
  var SHEET_NAME = 'Laporan Harian';
  var sheet = ss.getSheetByName(SHEET_NAME);

  // Buat sheet jika belum ada
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Buat header jika sheet masih kosong
  if (sheet.getLastRow() === 0) {
    var headers = [
      'Tanggal', 'Platform', 'Ad Spend (Rp)', 'CPR (Rp)',
      'New Users', 'Revenue (Rp)', 'ROAS', 'Konversi (%)', 'Catatan', 'Updated At'
    ];
    sheet.appendRow(headers);

    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#060b11');
    headerRange.setFontColor('#00f0ff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  var date = String(data.date || '').trim();
  if (!date) return jsonResponse(false, 'date is required');

  // Cari baris dengan tanggal yang sama (untuk update)
  var allData = sheet.getDataRange().getValues();
  var existingRowIndex = -1;
  for (var i = 1; i < allData.length; i++) {
    var rowDate = allData[i][0];
    var rowDateStr = (rowDate instanceof Date)
      ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(rowDate).substring(0, 10);
    if (rowDateStr === date) {
      existingRowIndex = i + 1; // 1-indexed
      break;
    }
  }

  var adSpend = Number(data.ad_spend) || 0;
  var revenue = Number(data.revenue) || 0;
  var roas = adSpend > 0 ? (revenue / adSpend).toFixed(2) : 0;

  var rowData = [
    date,
    data.platform || 'Meta',
    adSpend,
    Number(data.cpr) || 0,
    Number(data.new_users) || 0,
    revenue,
    roas,
    Number(data.conversion_rate) || 0,
    data.notes || '',
    new Date().toISOString()
  ];

  if (existingRowIndex > 0) {
    // Update baris yang sudah ada
    sheet.getRange(existingRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Append baris baru
    sheet.appendRow(rowData);

    // Sort by date descending
    var lastRow = sheet.getLastRow();
    if (lastRow > 2) {
      sheet.getRange(2, 1, lastRow - 1, rowData.length).sort({ column: 1, ascending: false });
    }
  }

  // Format angka
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 3, lastRow - 1, 1).setNumberFormat('#,##0');      // Ad Spend
    sheet.getRange(2, 4, lastRow - 1, 1).setNumberFormat('#,##0');      // CPR
    sheet.getRange(2, 6, lastRow - 1, 1).setNumberFormat('#,##0');      // Revenue
    sheet.getRange(2, 7, lastRow - 1, 1).setNumberFormat('0.00');       // ROAS
    sheet.getRange(2, 8, lastRow - 1, 1).setNumberFormat('0.00"%"');    // Konversi
  }

  Logger.log('Sales report saved: ' + date);
  return jsonResponse(true, 'Data laporan berhasil disimpan ke spreadsheet');
}

// ====================================================
// USERS SYNC — Tarik data users dari Firebase ke sheet "Users"
// ====================================================
function syncUsersToSpreadsheet() {
  var ss = getSpreadsheet();
  if (!ss) {
    Logger.log('ERROR: Spreadsheet tidak ditemukan. Set SPREADSHEET_ID di Script Properties.');
    return;
  }

  try {
    var sheet = ss.getSheetByName('Users');
    if (!sheet) {
      sheet = ss.insertSheet('Users');
    }

    var headers = ['Email', 'Name', 'Phone', 'CreatedAt', 'LastLogin'];
    var users = getFirebase('users') || {};
    var rows = [headers];

    for (var safeEmail in users) {
      var user = users[safeEmail];
      var profile = user.lf_profile || {};

      rows.push([
        user.lf_user_email || '',
        user.lf_user_name || profile.lf_user_name || profile.name || '',
        user.lf_user_phone || profile.lf_user_phone || profile.phone || '',
        profile.createdAt || '',
        profile.lastLogin || ''
      ]);
    }

    // Tulis ke sheet (overwrite semua)
    sheet.clearContents();
    if (rows.length > 0) {
      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
    }

    // Styling header
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#060b11');
    headerRange.setFontColor('#00f0ff');

    for (var col = 1; col <= headers.length; col++) {
      sheet.autoResizeColumn(col);
    }

    Logger.log('Users synced: ' + (rows.length - 1) + ' users');
  } catch (err) {
    Logger.log('syncUsersToSpreadsheet ERROR: ' + err);
  }
}

// ====================================================
// SETUP TRIGGER — Jalankan sekali dari Apps Script Editor
// ====================================================
function setupTriggers() {
  // Hapus semua trigger lama
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // Auto-sync users setiap 1 menit
  ScriptApp.newTrigger('syncUsersToSpreadsheet')
    .timeBased()
    .everyMinutes(1)
    .create();

  // Buat sheet Laporan Harian langsung
  initSheets();

  Logger.log('Triggers setup complete! syncUsersToSpreadsheet → setiap 1 menit');
}

// ====================================================
// INIT SHEETS — Buat sheet Laporan Harian jika belum ada
// Jalankan ini sekali, atau otomatis saat setupTriggers()
// ====================================================
function initSheets() {
  var ss = getSpreadsheet();
  if (!ss) { Logger.log('initSheets: Spreadsheet tidak ditemukan'); return; }

  // Buat sheet "Laporan Harian" jika belum ada
  var sheetReport = ss.getSheetByName('Laporan Harian');
  if (!sheetReport) {
    sheetReport = ss.insertSheet('Laporan Harian');
    Logger.log('Sheet "Laporan Harian" dibuat');
  }

  // Buat header jika sheet masih kosong
  if (sheetReport.getLastRow() === 0) {
    var headers = [
      'Tanggal', 'Platform', 'Ad Spend (Rp)', 'CPR (Rp)',
      'New Users', 'Revenue (Rp)', 'ROAS', 'Konversi (%)', 'Catatan', 'Updated At'
    ];
    sheetReport.appendRow(headers);

    var hr = sheetReport.getRange(1, 1, 1, headers.length);
    hr.setBackground('#060b11');
    hr.setFontColor('#00f0ff');
    hr.setFontWeight('bold');
    hr.setHorizontalAlignment('center');
    sheetReport.setFrozenRows(1);

    // Set lebar kolom
    sheetReport.setColumnWidth(1, 110);  // Tanggal
    sheetReport.setColumnWidth(2, 90);   // Platform
    sheetReport.setColumnWidth(3, 120);  // Ad Spend
    sheetReport.setColumnWidth(4, 100);  // CPR
    sheetReport.setColumnWidth(5, 90);   // New Users
    sheetReport.setColumnWidth(6, 120);  // Revenue
    sheetReport.setColumnWidth(7, 70);   // ROAS
    sheetReport.setColumnWidth(8, 90);   // Konversi
    sheetReport.setColumnWidth(9, 200);  // Catatan
    sheetReport.setColumnWidth(10, 160); // Updated At

    Logger.log('Header sheet "Laporan Harian" berhasil dibuat');
  }

  Logger.log('initSheets selesai');
}

// ====================================================
// TEST FUNCTIONS — Jalankan manual dari editor untuk tes
// ====================================================
function testSpreadsheetSync() {
  syncUsersToSpreadsheet();
  Logger.log('Users sync test complete!');
}

function testSalesReport() {
  var fakeData = {
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    platform: 'Meta',
    ad_spend: 150000,
    cpr: 7500,
    new_users: 20,
    revenue: 1200000,
    conversion_rate: 15,
    notes: 'Test dari GAS editor'
  };
  var result = handleSalesReport(fakeData);
  Logger.log('Sales report test: ' + result.getContent());
}

// ====================================================
// UTILITY
// ====================================================
function jsonResponse(success, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
