const SHEET_NAME = 'Users';
const OTP_EXPIRY_MINUTES = 5;

// Fungsi untuk menangani request GET (bisa untuk testing)
function doGet(e) {
  return ContentService.createTextOutput("LebihFit Auth API is running!");
}

// Fungsi utama untuk menangani request POST dari web LebihFit
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'requestOTP') {
      return handleRequestOTP(data.email, data.name);
    } else if (action === 'verifyOTP') {
      return handleVerifyOTP(data.email, data.otp);
    } else {
      return respondError("Invalid action");
    }
  } catch (error) {
    return respondError(error.toString());
  }
}

function handleRequestOTP(email, name) {
  if (!email || !email.includes('@')) return respondError("Email tidak valid");
  if (!name) name = "Bro"; // Default kalau nama kosong
  
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);
  
  let userRowIndex = -1;
  // Cek apakah email sudah ada
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      userRowIndex = i + 1; // +1 karena index array mulai dari 0, row google sheet mulai dari 1
      break;
    }
  }
  
  if (userRowIndex > -1) {
    // Update OTP untuk user lama
    sheet.getRange(userRowIndex, 2).setValue(otp);
    sheet.getRange(userRowIndex, 3).setValue(expiresAt.getTime());
    sheet.getRange(userRowIndex, 6).setValue(name); // Simpan nama terbaru
  } else {
    // Buat row baru untuk user baru
    sheet.appendRow([email, otp, expiresAt.getTime(), new Date(), "", name]);
  }
  
  // Kirim Email
  const subject = "Kode Login LebihFit Kamu";
  const body = `Halo ${name}!\n\nKode OTP kamu untuk masuk ke LebihFit adalah: ${otp}\n\nKode ini akan kedaluwarsa dalam ${OTP_EXPIRY_MINUTES} menit.\nJangan berikan kode ini kepada siapapun.\n\nSalam,\nTim LebihFit`;
  
  MailApp.sendEmail(email, subject, body);
  
  return respondSuccess({ message: "OTP terkirim ke email" });
}

function handleVerifyOTP(email, otpInput) {
  if (!email || !otpInput) return respondError("Data tidak lengkap");
  
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      const storedOtp = data[i][1].toString();
      const expiresAt = parseInt(data[i][2]);
      
      if (storedOtp !== otpInput.toString()) {
        return respondError("Kode OTP salah");
      }
      
      if (new Date().getTime() > expiresAt) {
        return respondError("Kode OTP sudah kedaluwarsa, silakan request ulang");
      }
      
      // Berhasil login, kosongkan OTP agar tidak bisa dipakai 2x
      sheet.getRange(i + 1, 2).clearContent();
      sheet.getRange(i + 1, 3).clearContent();
      // Update last login
      sheet.getRange(i + 1, 5).setValue(new Date());
      
      const storedName = data[i][5] || "Bro";
      return respondSuccess({ message: "Login berhasil", email: email, name: storedName });
    }
  }
  
  return respondError("Email tidak ditemukan");
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Email", "CurrentOTP", "OTPExpiresAt", "CreatedAt", "LastLogin", "Name"]);
    sheet.getRange("A1:F1").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // Pastikan header Name ada (kalau script diupdate)
    if (sheet.getRange("F1").getValue() !== "Name") {
      sheet.getRange("F1").setValue("Name").setFontWeight("bold");
    }
  }
  
  return sheet;
}

function respondSuccess(data) {
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function respondError(message) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
