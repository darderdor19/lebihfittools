// ====================================================
// BOT HANDLERS — All logic ported from GAS
// ====================================================
const { getFirebase, setFirebase, safe, getState, setState, getCache, setCache, deleteCache, getLinkedEmail } = require('./firebase');
const { sendMessage, sendChatAction, answerCallback } = require('./telegram');
const { analyzeFood, sumNutrients } = require('./groq');

// ====================================================
// UTILITIES
// ====================================================
function todayKey() {
  // Use WIB (UTC+7)
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function formatDate(d) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function progressBar(pct) {
  const filled = Math.round(pct / 10);
  let bar = '';
  for (let i = 0; i < 10; i++) bar += (i < filled) ? '█' : '░';
  return bar;
}

function guessMealTime() {
  const h = (new Date().getUTCHours() + 7) % 24;
  if (h >= 5 && h < 10) return 'sarapan';
  if (h >= 10 && h < 14) return 'makan_siang';
  if (h >= 14 && h < 17) return 'snack_siang';
  if (h >= 17 && h < 21) return 'makan_malam';
  return 'snack_malam';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ====================================================
// KEYBOARD DEFINITIONS
// ====================================================
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Dashboard', callback_data: 'dashboard' },
        { text: '🍽️ Log Makanan', callback_data: 'log_food' }
      ],
      [
        { text: '📈 History', callback_data: 'history' },
        { text: '⚙️ Settings', callback_data: 'settings' }
      ],
      [
        { text: '🌐 Buka Web App', url: 'https://darderdor19.github.io/lebihfittools/' }
      ]
    ]
  };
}

// ====================================================
// MESSAGE HANDLER (entry point from webhook)
// ====================================================
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.text || '').trim();
  const state = await getState(userId);

  console.log(`handleMessage: userId=${userId} text="${text}" state=${state}`);

  // Handle /start with or without payload
  if (text.indexOf('/start') === 0) {
    const parts = text.split(' ');
    if (parts.length > 1) {
      const payload = parts[1];
      const startEmail = payload.replace(/_at_/g, '@').replace(/_dot_/g, '.');
      return onEmailInput(chatId, userId, startEmail);
    }
    return onStart(chatId, userId);
  }

  if (text === '/menu') return showMainMenu(chatId, userId);
  if (text === '/help') return sendHelp(chatId);

  if (state === 'AWAIT_EMAIL') return onEmailInput(chatId, userId, text);
  if (state === 'AWAIT_OTP') return onOtpInput(chatId, userId, text);
  if (state === 'AWAIT_FOOD') return onFoodInput(chatId, userId, text);

  // Default: if logged in, treat as food input
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  await setState(userId, 'AWAIT_FOOD');
  return onFoodInput(chatId, userId, text);
}

// ====================================================
// CALLBACK HANDLER
// ====================================================
async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  const data = cb.data;
  await answerCallback(cb.id);

  const email = await getLinkedEmail(userId);
  console.log(`handleCallback: userId=${userId} data=${data} email=${email}`);

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
async function onStart(chatId, userId) {
  const email = await getLinkedEmail(userId);
  if (email) {
    const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
    const userName = profile ? (profile.name || 'Bro') : 'Bro';
    return sendMessage(chatId,
      `*Selamat datang kembali, ${userName}!*\n\nPilih menu di bawah:`,
      mainMenuKeyboard()
    );
  }
  return promptLogin(chatId, userId);
}

async function promptLogin(chatId, userId) {
  await setState(userId, 'AWAIT_EMAIL');
  return sendMessage(chatId,
    '*LebihFit Tracker Bot*\n\n' +
    'Halo! Untuk mulai, login dulu ya.\n\n' +
    'Kirim *email* yang lu pakai di LebihFit web app:',
    null
  );
}

async function onEmailInput(chatId, userId, email) {
  if (!email.includes('@') || !email.includes('.')) {
    return sendMessage(chatId, 'Format email tidak valid. Coba lagi!');
  }

  try {
    await setFirebase(`telegram_links/${userId}`, {
      email: email,
      chatId: chatId,
      linkedAt: new Date().toISOString()
    });
    await setFirebase(`users/${safe(email)}/telegram_chat_id`, chatId.toString());
    await setState(userId, null);

    const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
    const userName = profile ? (profile.name || 'Bro') : 'Bro';

    return sendMessage(chatId,
      `Login berhasil, *${userName}*!\n\nAkun LebihFit lu sudah terhubung secara instan. Pilih menu:`,
      mainMenuKeyboard()
    );
  } catch (err) {
    console.error('onEmailInput error:', err);
    await setState(userId, null);
    return sendMessage(chatId, 'Gagal menghubungkan akun: ' + err.message, null, '');
  }
}

async function onOtpInput(chatId, userId, otpInput) {
  try {
    const storedOtp = await getCache(userId + '_otp');
    const storedEmail = await getCache(userId + '_email');
    if (!storedOtp || !storedEmail) {
      await setState(userId, null);
      return sendMessage(chatId, 'OTP expired. Ketik /start untuk coba lagi.');
    }
    if (otpInput.trim() !== storedOtp) {
      return sendMessage(chatId, 'Kode OTP salah. Coba lagi!');
    }
    await setFirebase(`telegram_links/${userId}`, {
      email: storedEmail,
      chatId: chatId,
      linkedAt: new Date().toISOString()
    });
    await setFirebase(`users/${safe(storedEmail)}/telegram_chat_id`, chatId.toString());
    await setState(userId, null);
    await deleteCache(userId + '_otp');
    await deleteCache(userId + '_email');

    const profile = await getFirebase(`users/${safe(storedEmail)}/lf_profile`);
    const userName = profile ? (profile.name || 'Bro') : 'Bro';
    return sendMessage(chatId,
      `Login berhasil, *${userName}*!\n\nAkun LebihFit lu sudah terhubung. Pilih menu:`,
      mainMenuKeyboard()
    );
  } catch (err) {
    console.error('onOtpInput error:', err);
    return sendMessage(chatId, 'Error verifikasi OTP: ' + err.message, null, '');
  }
}

// ====================================================
// MAIN MENU
// ====================================================
async function showMainMenu(chatId, userId) {
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const userName = profile ? (profile.name || 'Bro') : 'Bro';

  return sendMessage(chatId,
    `Halo, *${userName}*! Mau ngapain hari ini?`,
    mainMenuKeyboard()
  );
}

// ====================================================
// DASHBOARD
// ====================================================
async function showDashboard(chatId, email) {
  const today = todayKey();
  // Read from web app's unified path: lf_logs/{date}
  const logs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`) || [];
  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const total = sumNutrients(logs);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 0);
  const remaining = calTarget - Math.round(total.cal);
  const pct = calTarget > 0 ? Math.min(100, Math.round(total.cal / calTarget * 100)) : 0;
  const bar = progressBar(pct);

  let msg = `*Dashboard - ${formatDate(new Date())}*\n\n`;
  msg += `Kalori: *${Math.round(total.cal)} / ${calTarget} kcal*\n`;
  msg += `${bar} ${pct}%\n`;
  msg += remaining > 0
    ? `Sisa: *${remaining} kcal*\n`
    : `Melebihi target: *${Math.abs(remaining)} kcal*\n`;
  msg += '\n';
  msg += `Protein: *${total.protein.toFixed(1)}g*\n`;
  msg += `Karbo:   *${total.carbs.toFixed(1)}g*\n`;
  msg += `Lemak:   *${total.fat.toFixed(1)}g*\n`;
  msg += `Serat:   *${total.fiber.toFixed(1)}g*\n`;
  msg += `\n*${logs.length} makanan* tercatat hari ini\n`;

  if (logs.length > 0) {
    msg += '\n*Log Makanan:*\n';
    const shown = logs.slice(-5);
    shown.forEach((item, i) => {
      msg += `${i + 1}. ${item.name} - ${Math.round(item.cal)} kcal\n`;
    });
    if (logs.length > 5) msg += `_...dan ${logs.length - 5} lainnya_\n`;

    try {
      const aiAnalysis = await getFirebase(`users/${safe(email)}/lf_analysis_${today}`);
      if (aiAnalysis && aiAnalysis.text) {
        msg += '\n🤖 *Analisis AI & Saran Esok Hari:*\n';
        msg += `_${aiAnalysis.text}_\n`;
      }
    } catch (e) { /* skip */ }
  }

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
    ]
  });
}

// ====================================================
// LOG MAKANAN
// ====================================================
async function promptFoodInput(chatId, userId) {
  await setState(userId, 'AWAIT_FOOD');
  return sendMessage(chatId,
    '*Log Makanan*\n\nKetik nama makanan yang lu makan:\n\n_Contoh:_\nnasi goreng ayam 1 piring\nayam geprek sambel 200g\nkopi susu gula 1 gelas',
    { inline_keyboard: [[{ text: 'Batal', callback_data: 'menu' }]] }
  );
}

async function onFoodInput(chatId, userId, text) {
  if (!text || text.length < 2) {
    return sendMessage(chatId, 'Deskripsi makanan terlalu pendek. Coba lagi!');
  }
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  await setState(userId, null);
  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, `Menganalisis: _${text}_...`, null);

  try {
    const nutrition = await analyzeFood(text);
    await setCache(userId + '_pending', JSON.stringify(nutrition));

    let msg = 'Hasil Analisis AI:\n\n';
    msg += `*${nutrition.name}*\n`;
    msg += `Porsi: ${nutrition.portion || '1 porsi'}\n\n`;
    msg += `Kalori: *${Math.round(nutrition.cal || 0)} kcal*\n`;
    msg += `Protein: *${Number(nutrition.protein || 0).toFixed(1)}g*\n`;
    msg += `Karbo: *${Number(nutrition.carbs || 0).toFixed(1)}g*\n`;
    msg += `Lemak: *${Number(nutrition.fat || 0).toFixed(1)}g*\n`;
    msg += `Serat: *${Number(nutrition.fiber || 0).toFixed(1)}g*\n\n`;
    msg += '_Simpan ke dashboard?_';

    return sendMessage(chatId, msg, {
      inline_keyboard: [[
        { text: '✅ Simpan', callback_data: 'confirm_yes' },
        { text: '❌ Batal', callback_data: 'confirm_no' }
      ]]
    });
  } catch (err) {
    console.error('onFoodInput error:', err);
    return sendMessage(chatId, 'Gagal analisis: ' + err.message, {
      inline_keyboard: [[
        { text: 'Coba Lagi', callback_data: 'log_food' },
        { text: 'Menu', callback_data: 'menu' }
      ]]
    });
  }
}

async function confirmSaveFood(chatId, userId) {
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  const raw = await getCache(userId + '_pending');
  if (!raw) return sendMessage(chatId, 'Data expired. Silakan log ulang.', mainMenuKeyboard());

  const nutrition = JSON.parse(raw);
  await deleteCache(userId + '_pending');

  const today = todayKey();
  // Use web app's unified path: lf_logs/{date}
  const logsPath = `users/${safe(email)}/lf_logs/${today}`;
  const existing = await getFirebase(logsPath) || [];

  const newItem = {
    id: generateId(),
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
  await setFirebase(logsPath, existing);

  const total = sumNutrients(existing);
  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 0);

  let msg = `*${newItem.name}* tersimpan!\n\n`;
  msg += `Total hari ini: *${Math.round(total.cal)} / ${calTarget} kcal*\n\n`;
  msg += 'Log lagi atau lihat dashboard?';

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: '🍽️ Log Lagi', callback_data: 'log_food' },
        { text: '📊 Dashboard', callback_data: 'dashboard' }
      ],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
    ]
  });
}

async function cancelFood(chatId, userId) {
  await deleteCache(userId + '_pending');
  return sendMessage(chatId, 'Dibatalkan.', mainMenuKeyboard());
}

// ====================================================
// HISTORY
// ====================================================
async function showHistory(chatId, email) {
  return sendMessage(chatId, '*History*\n\nPilih rentang waktu:', {
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

async function showHistoryDays(chatId, email, days) {
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    // Read from web app's unified path: lf_logs/{date}
    const logs = await getFirebase(`users/${safe(email)}/lf_logs/${key}`) || [];
    if (logs.length > 0) {
      const t = sumNutrients(logs);
      results.push({ date: key, cal: Math.round(t.cal), count: logs.length });
    }
  }

  if (results.length === 0) {
    return sendMessage(chatId, `Belum ada data untuk ${days} hari terakhir.`, {
      inline_keyboard: [[{ text: 'Menu Utama', callback_data: 'menu' }]]
    });
  }

  const totalCal = results.reduce((sum, r) => sum + r.cal, 0);
  const avgCal = Math.round(totalCal / results.length);

  let msg = `*History ${days} Hari Terakhir*\n\n`;
  msg += `Rata-rata: *${avgCal} kcal/hari*\n`;
  msg += `Hari aktif: *${results.length} hari*\n\n`;
  msg += '*Detail:*\n';

  const shown = results.slice(0, 10);
  shown.forEach(r => {
    const dt = new Date(r.date);
    const label = `${dt.getDate()}/${dt.getMonth() + 1}`;
    msg += `${label}: *${r.cal} kcal* (${r.count} makanan)\n`;
  });
  if (results.length > 10) msg += `_...dan ${results.length - 10} hari lainnya_\n`;

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [{ text: '📊 Dashboard Hari Ini', callback_data: 'dashboard' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
    ]
  });
}

// ====================================================
// SETTINGS
// ====================================================
async function showSettings(chatId, userId, email) {
  let msg = '*Settings*\n\n';
  if (email) {
    const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
    msg += `Akun: *${email}*\n`;
    if (profile) {
      msg += `Target: *${Math.round((profile.targets && profile.targets.cal) ? profile.targets.cal : 0)} kcal/hari*\n`;
      msg += `Tujuan: *${(profile.target || '-').replace(/_/g, ' ').toUpperCase()}*\n`;
      msg += `BB/TB: *${profile.bb}kg / ${profile.tb}cm*\n`;
    }
    msg += '\n_Untuk ubah profil, gunakan web app._';
    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [{ text: '🚪 Logout', callback_data: 'logout' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu' }, { text: '🌐 Web App', url: 'https://darderdor19.github.io/lebihfittools/' }]
      ]
    });
  } else {
    msg += 'Belum login.';
    return sendMessage(chatId, msg, {
      inline_keyboard: [[{ text: 'Login', callback_data: 'menu' }]]
    });
  }
}

async function doLogout(chatId, userId) {
  const email = await getLinkedEmail(userId);
  if (email) {
    await setFirebase(`telegram_links/${userId}`, null);
    await setFirebase(`users/${safe(email)}/telegram_chat_id`, null);
  }
  await setState(userId, null);
  return sendMessage(chatId, 'Logout berhasil! Ketik /start untuk login lagi.', null);
}

// ====================================================
// HELP
// ====================================================
async function sendHelp(chatId) {
  return sendMessage(chatId,
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

module.exports = { handleMessage, handleCallback };
