// ====================================================
// BOT HANDLERS — All logic ported from GAS
// ====================================================
const { getFirebase, setFirebase, toArray, safe, getState, setState, getCache, setCache, deleteCache, getLinkedEmail } = require('./firebase');
const { sendMessage, sendChatAction, answerCallback } = require('./telegram');
const { analyzeFood, sumNutrients } = require('./groq');

// ====================================================
// UTILITIES
// ====================================================
function escapeMarkdown(text) {
  if (!text) return '';
  let str = text.toString();
  // Replace underscores with spaces for readability, except in emails/links
  if (!str.includes('@') && !str.includes('http')) {
    str = str.replace(/_/g, ' ');
  }
  return str.replace(/[*_`\[]/g, '\\$&');
}

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
  if (state === 'AWAIT_FOOD_NAME' || state === 'AWAIT_FOOD') return onFoodNameInput(chatId, userId, text);
  if (state === 'AWAIT_FOOD_PORTION') return onFoodPortionInput(chatId, userId, text);
  if (state === 'AWAIT_FOOD_DESC') return onFoodDescInput(chatId, userId, text);
  if (state === 'AWAIT_RECALC_TB') return onRecalcTb(chatId, userId, text);
  if (state === 'AWAIT_RECALC_BB') return onRecalcBb(chatId, userId, text);
  if (state === 'AWAIT_RECALC_USIA') return onRecalcUsia(chatId, userId, text);
  if (state === 'AWAIT_RECALC_CATATAN') return onRecalcCatatanInput(chatId, userId, text);

  // Default: if logged in, treat as food name input (shortcut)
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  return onFoodNameInput(chatId, userId, text);
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
  if (data === 'retry_login') return promptLogin(chatId, userId);
  if (data === 'confirm_yes') return confirmSaveFood(chatId, userId);
  if (data === 'confirm_no') return cancelFood(chatId, userId);
  if (data === 'skip_food_desc') return onFoodDescInput(chatId, userId, null);
  if (data === 'recalc_profile') return email ? startRecalcWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data.startsWith('recalc_gen_')) {
    const gender = data.replace('recalc_gen_', '') === 'pria' ? 'Pria' : 'Wanita';
    return onRecalcGenderSelect(chatId, userId, gender);
  }
  if (data.startsWith('recalc_act_')) {
    const activity = data.replace('recalc_act_', '');
    return onRecalcActivitySelect(chatId, userId, activity);
  }
  if (data.startsWith('recalc_tgt_')) {
    const targetVal = data.replace('recalc_tgt_', '');
    return onRecalcTargetSelect(chatId, userId, targetVal);
  }
  if (data === 'skip_recalc_catatan') return onRecalcCatatanInput(chatId, userId, null);
  if (data === 'save_profile_yes') return saveProfile(chatId, userId);
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
      `*Selamat datang kembali, ${escapeMarkdown(userName)}!*\n\nPilih menu di bawah:`,
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
  email = email.trim().toLowerCase();
  if (!email.includes('@') || !email.includes('.')) {
    return sendMessage(chatId, 'Format email tidak valid. Coba lagi!');
  }

  // Simpan email sementara, minta OTP via GAS
  await setCache(`${userId}_pending_email`, email);
  await setState(userId, 'AWAIT_OTP');

  try {
    const GAS_URL = process.env.GAS_WEBAPP_URL;
    if (GAS_URL) {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'requestOTP', email, name: 'Bro' })
      });
      const json = await res.json();
      if (!json.success) {
        await setState(userId, null);
        return sendMessage(chatId, `Gagal kirim OTP: ${json.error || 'Unknown error'}`);
      }
    } else {
      console.warn('GAS_WEBAPP_URL not set, skipping OTP send');
      await setState(userId, null);
      await deleteCache(`${userId}_pending_email`);
      return sendMessage(chatId,
        `⚠️ *Konfigurasi Vercel Belum Lengkap*\n\n` +
        `Bot tidak dapat mengirimkan OTP karena environment variable *GAS_WEBAPP_URL* belum diatur di Vercel.\n\n` +
        `*Cara Mengatasi:*\n` +
        `1. Masuk ke dashboard Vercel.\n` +
        `2. Buka Settings -> Environment Variables untuk project bot ini.\n` +
        `3. Tambahkan variable:\n` +
        `   • Key: \`GAS_WEBAPP_URL\`\n` +
        `   • Value: \`URL Web App Google Apps Script lu\`\n` +
        `4. Klik *Save*, lalu lakukan **Redeploy** (Deploy ulang).\n\n` +
        `Ketik /start lagi jika sudah selesai diatur!`,
        { inline_keyboard: [[{ text: 'Kembali', callback_data: 'menu' }]] }
      );
    }

    return sendMessage(chatId,
      `📧 Kode OTP sudah dikirim ke *${email}*\n\n` +
      'Masukkan kode 6 digit yang ada di email:',
      { inline_keyboard: [[{ text: 'Batal', callback_data: 'menu' }]] }
    );
  } catch (err) {
    console.error('onEmailInput error:', err);
    await setState(userId, null);
    return sendMessage(chatId, 'Gagal kirim OTP: ' + err.message);
  }
}

async function onOtpInput(chatId, userId, otpInput) {
  try {
    const email = await getCache(`${userId}_pending_email`);
    if (!email) {
      await setState(userId, null);
      return sendMessage(chatId, 'Sesi expired. Ketik /start untuk coba lagi.');
    }

    const GAS_URL = process.env.GAS_WEBAPP_URL;
    if (GAS_URL) {
      // Verify OTP via GAS
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verifyOTP', email, otp: otpInput.trim() })
      });
      const json = await res.json();
      if (!json.success) {
        return sendMessage(chatId,
          '❌ Kode OTP salah atau expired.\n\nCoba lagi atau /start untuk request OTP baru.',
          { inline_keyboard: [[{ text: 'Request OTP Baru', callback_data: 'retry_login' }, { text: 'Batal', callback_data: 'menu' }]] }
        );
      }
    } else {
      return sendMessage(chatId, 'Konfigurasi GAS_WEBAPP_URL tidak ditemukan. Verifikasi dibatalkan.');
    }

    // OTP valid — link account
    await setFirebase(`telegram_links/${userId}`, {
      email: email,
      chatId: chatId,
      linkedAt: new Date().toISOString()
    });
    await setFirebase(`users/${safe(email)}/telegram_chat_id`, chatId.toString());
    await setState(userId, null);
    await deleteCache(`${userId}_pending_email`);

    const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
    const userName = (profile && (profile.name || profile.lf_user_name)) || 'Bro';
    return sendMessage(chatId,
      `✅ Login berhasil, *${userName}*!\n\nAkun LebihFit lu sudah terhubung. Pilih menu:`,
      mainMenuKeyboard()
    );
  } catch (err) {
    console.error('onOtpInput error:', err);
    return sendMessage(chatId, 'Error verifikasi OTP: ' + err.message);
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
    `Halo, *${escapeMarkdown(userName)}*! Mau ngapain hari ini?`,
    mainMenuKeyboard()
  );
}

// ====================================================
// DASHBOARD
// ====================================================
async function showDashboard(chatId, email) {
  const today = todayKey();
  // Read from web app's unified path: lf_logs/{date}
  // Use toArray() because Firebase stores arrays as {0:..., 1:...} objects
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);
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
      msg += `${i + 1}. ${escapeMarkdown(item.name)} - ${Math.round(item.cal)} kcal\n`;
    });
    if (logs.length > 5) msg += `_...dan ${logs.length - 5} lainnya_\n`;

    try {
      const aiAnalysis = await getFirebase(`users/${safe(email)}/lf_analysis_${today}`);
      if (aiAnalysis && aiAnalysis.text) {
        msg += '\n🤖 *Analisis AI & Saran Esok Hari:*\n';
        msg += `${escapeMarkdown(aiAnalysis.text)}\n`;
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
  await setState(userId, 'AWAIT_FOOD_NAME');
  return sendMessage(chatId,
    '*Log Makanan - Langkah 1 dari 3* 🍽️\n\nMakanan apa yang lu makan hari ini?\n_Contoh: nasi goreng ayam, sate kambing, pisang goreng_',
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]] }
  );
}

async function onFoodNameInput(chatId, userId, text) {
  if (!text || text.length < 2) {
    return sendMessage(chatId, 'Nama makanan terlalu pendek. Coba lagi!');
  }
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  await setCache(`${userId}_food_name`, text);
  await setState(userId, 'AWAIT_FOOD_PORTION');
  return sendMessage(chatId,
    `*Log Makanan - Langkah 2 dari 3* ⚖️\n\nBerapa banyak *${escapeMarkdown(text)}* yang lu makan?\n_Contoh: 1 piring, 200g, 2 butir, secukupnya_`,
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]] }
  );
}

async function onFoodPortionInput(chatId, userId, text) {
  if (!text || text.length < 1) {
    return sendMessage(chatId, 'Porsi makanan tidak valid. Coba lagi!');
  }
  const foodName = await getCache(`${userId}_food_name`) || 'Makanan';
  await setCache(`${userId}_food_portion`, text);
  await setState(userId, 'AWAIT_FOOD_DESC');
  return sendMessage(chatId,
    `*Log Makanan - Langkah 3 dari 3* 📝\n\nAda deskripsi lainnya untuk *${escapeMarkdown(foodName)}* (porsi: ${escapeMarkdown(text)})? (Opsional)\n_Contoh: digoreng pake minyak dikit, pake bumbu kacang, kecap manis_`,
    {
      inline_keyboard: [
        [{ text: '⏭️ Lewati & Analisis AI', callback_data: 'skip_food_desc' }],
        [{ text: '❌ Batal', callback_data: 'confirm_no' }]
      ]
    }
  );
}

async function onFoodDescInput(chatId, userId, text) {
  const foodName = await getCache(`${userId}_food_name`);
  const foodPortion = await getCache(`${userId}_food_portion`);

  if (!foodName || !foodPortion) {
    await setState(userId, null);
    await deleteCache(`${userId}_food_name`);
    await deleteCache(`${userId}_food_portion`);
    return sendMessage(chatId, 'Sesi expired. Silakan log ulang.', mainMenuKeyboard());
  }

  const foodDesc = text ? text.trim() : '';

  await setState(userId, null);
  await deleteCache(`${userId}_food_name`);
  await deleteCache(`${userId}_food_portion`);

  await sendChatAction(chatId, 'typing');

  let descString = `porsi: ${foodPortion}`;
  if (foodDesc) {
    descString += `, deskripsi: ${foodDesc}`;
  }
  const query = `${foodName}, ${descString}`;
  await sendMessage(chatId, `Menganalisis: _${escapeMarkdown(query)}_...`, null);

  try {
    const nutrition = await analyzeFood(query);
    await setCache(userId + '_pending', JSON.stringify(nutrition));

    let msg = '🤖 *Hasil Analisis AI:*\n\n';
    msg += `*${escapeMarkdown(nutrition.name)}*\n`;
    msg += `Porsi: ${escapeMarkdown(nutrition.portion || foodPortion)}\n\n`;
    msg += `• Kalori: *${Math.round(nutrition.cal || 0)} kcal*\n`;
    msg += `• Protein: *${Number(nutrition.protein || 0).toFixed(1)}g*\n`;
    msg += `• Karbo: *${Number(nutrition.carbs || 0).toFixed(1)}g*\n`;
    msg += `• Lemak: *${Number(nutrition.fat || 0).toFixed(1)}g*\n`;
    msg += `• Serat: *${Number(nutrition.fiber || 0).toFixed(1)}g*\n\n`;
    msg += '_Simpan ke dashboard?_';

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [
          { text: '✅ Simpan', callback_data: 'confirm_yes' },
          { text: '🔄 Reset / Log Lagi', callback_data: 'log_food' }
        ],
        [
          { text: '🏠 Menu Utama', callback_data: 'menu' }
        ]
      ]
    });
  } catch (err) {
    console.error('onFoodDescInput error:', err);
    return sendMessage(chatId, 'Gagal analisis AI: ' + err.message, {
      inline_keyboard: [
        [
          { text: '🔄 Reset / Log Lagi', callback_data: 'log_food' },
          { text: '🏠 Menu Utama', callback_data: 'menu' }
        ]
      ]
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

  let msg = `*${escapeMarkdown(newItem.name)}* tersimpan!\n\n`;
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
  await setState(userId, null);
  await deleteCache(userId + '_food_name');
  await deleteCache(userId + '_food_portion');
  await deleteCache(userId + '_pending');
  await deleteRecalcCache(userId);
  return sendMessage(chatId, 'Dibatalkan.', mainMenuKeyboard());
}

// ====================================================
// HISTORY
// ====================================================
// Helper to get past dates in WIB (UTC+7) timezone
function getPastWibDates(days) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + (7 * 60 * 60 * 1000) - (i * 24 * 60 * 60 * 1000));
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Helper to draw ASCII bar chart
function renderAsciiBar(cal, target) {
  if (!target || target <= 0) target = 2000;
  const pct = cal / target;
  const filledCount = Math.min(10, Math.round(pct * 10));
  let bar = '';
  for (let i = 0; i < 10; i++) {
    bar += (i < filledCount) ? '█' : '░';
  }
  return bar;
}

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
  await sendChatAction(chatId, 'typing');

  const dates = getPastWibDates(days);
  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);

  try {
    // Fetch all days in parallel
    const promises = dates.map(async (key) => {
      const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${key}`);
      const logs = toArray(rawLogs);
      return { key, logs };
    });

    const rawResults = await Promise.all(promises);

    let totalCal = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    let activeDays = 0;
    let compliantDays = 0;
    let maxCal = 0;
    let maxCalDate = '-';
    let minCal = Infinity;
    let minCalDate = '-';

    const dailyData = [];

    for (const { key, logs } of rawResults) {
      const t = sumNutrients(logs);
      const dayCal = Math.round(t.cal);

      if (logs.length > 0) {
        activeDays++;
        totalCal += dayCal;
        totalProtein += t.protein;
        totalCarbs += t.carbs;
        totalFat += t.fat;
        totalFiber += t.fiber;

        if (dayCal <= calTarget) {
          compliantDays++;
        }

        if (dayCal > maxCal) {
          maxCal = dayCal;
          maxCalDate = key;
        }
        if (dayCal < minCal) {
          minCal = dayCal;
          minCalDate = key;
        }
      }

      dailyData.push({
        dateKey: key,
        cal: dayCal,
        count: logs.length
      });
    }

    if (minCal === Infinity) {
      minCal = 0;
    }

    if (activeDays === 0) {
      return sendMessage(chatId, `Belum ada data makan tercatat dalam ${days} hari terakhir.`, {
        inline_keyboard: [
          [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu' }]
        ]
      });
    }

    const avgCal = Math.round(totalCal / activeDays);
    const avgProtein = totalProtein / activeDays;
    const avgCarbs = totalCarbs / activeDays;
    const avgFat = totalFat / activeDays;
    const avgFiber = totalFiber / activeDays;

    const formatDateKey = (key) => {
      if (key === '-') return '-';
      const parts = key.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const dayName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()];
      return `${dayName}, ${parts[2]}/${parts[1]}`;
    };

    // Render ASCII chart (oldest first)
    let chartText = '```\n';
    const sortedDailyData = [...dailyData].reverse();
    for (const day of sortedDailyData) {
      const label = formatDateKey(day.dateKey);
      const bar = renderAsciiBar(day.cal, calTarget);
      const calStr = day.cal.toString().padStart(4, ' ');
      const pct = calTarget > 0 ? Math.round((day.cal / calTarget) * 100) : 0;
      const overIndicator = pct > 100 ? '🔥' : '  ';
      chartText += `${label}: [${bar}]${overIndicator} ${calStr} kcal\n`;
    }
    chartText += '```';

    let msg = `📈 *History ${days} Hari Terakhir*\n\n`;
    msg += `📊 *Grafik Kalori:*\n${chartText}\n`;
    msg += `_(Target: ${calTarget} kcal/hari)_\n\n`;

    msg += `📝 *Ringkasan Statistik:*\n`;
    msg += `• Rata-rata Kalori: *${avgCal} kcal/hari*\n`;
    msg += `• Kepatuhan Target: *${compliantDays}/${activeDays} hari aktif* (≤ target)\n`;
    msg += `• Hari Aktif Mencatat: *${activeDays}/${days} hari*\n`;
    msg += `• Kalori Tertinggi: *${maxCal} kcal* (${formatDateKey(maxCalDate)})\n`;
    msg += `• Kalori Terendah: *${minCal} kcal* (${formatDateKey(minCalDate)})\n\n`;

    msg += `🍎 *Rata-rata Gizi Harian (Hari Aktif):*\n`;
    msg += `• Protein: *${avgProtein.toFixed(1)}g*\n`;
    msg += `• Karbohidrat: *${avgCarbs.toFixed(1)}g*\n`;
    msg += `• Lemak: *${avgFat.toFixed(1)}g*\n`;
    msg += `• Serat: *${avgFiber.toFixed(1)}g*\n`;

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [
          { text: '📊 Dashboard Hari Ini', callback_data: 'dashboard' },
          { text: '📈 Rentang Lain', callback_data: 'history' }
        ],
        [
          { text: '🏠 Menu Utama', callback_data: 'menu' },
          { text: '🌐 Buka Web App', url: 'https://darderdor19.github.io/lebihfittools/' }
        ]
      ]
    });
  } catch (err) {
    console.error('showHistoryDays error:', err);
    return sendMessage(chatId, 'Gagal memuat history: ' + err.message, {
      inline_keyboard: [[{ text: 'Menu Utama', callback_data: 'menu' }]]
    });
  }
}

// ====================================================
// SETTINGS & WIZARD
// ====================================================
async function showSettings(chatId, userId, email) {
  let msg = '*Settings*\n\n';
  if (email) {
    const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
    msg += `Akun: *${escapeMarkdown(email)}*\n`;
    if (profile) {
      msg += `Target: *${Math.round((profile.targets && profile.targets.cal) ? profile.targets.cal : 0)} kcal/hari*\n`;
      msg += `Tujuan: *${(profile.target || '-').replace(/_/g, ' ').toUpperCase()}*\n`;
      msg += `BB/TB: *${profile.bb}kg / ${profile.tb}cm*\n`;
      msg += `Usia/Gender: *${profile.usia}th / ${profile.gender || '-'}*\n`;
      msg += `BMR Est: *${(profile.targets && profile.targets.bmr) ? profile.targets.bmr : '-'} kcal*\n`;
      msg += `TDEE Est: *${(profile.targets && profile.targets.tdee) ? profile.targets.tdee : '-'} kcal*\n`;
    }
    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [{ text: '⚙️ Kalkulator Fitness', callback_data: 'recalc_profile' }],
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

async function startRecalcWizard(chatId, userId) {
  await setState(userId, 'AWAIT_RECALC_TB');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 1 dari 7* 📏\n\nMasukkan tinggi badan lu (dalam cm):\n_Contoh: 173_',
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]] }
  );
}

async function onRecalcTb(chatId, userId, text) {
  const tb = parseInt(text);
  if (isNaN(tb) || tb < 50 || tb > 300) {
    return sendMessage(chatId, 'Tinggi badan tidak valid. Masukkan angka cm yang benar (50 - 300):');
  }
  await setCache(`${userId}_recalc_tb`, tb.toString());
  await setState(userId, 'AWAIT_RECALC_BB');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 2 dari 7* ⚖️\n\nMasukkan berat badan lu (dalam kg):\n_Contoh: 71_',
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]] }
  );
}

async function onRecalcBb(chatId, userId, text) {
  const bb = parseFloat(text);
  if (isNaN(bb) || bb < 20 || bb > 500) {
    return sendMessage(chatId, 'Berat badan tidak valid. Masukkan angka kg yang benar (20 - 500):');
  }
  await setCache(`${userId}_recalc_bb`, bb.toString());
  await setState(userId, 'AWAIT_RECALC_USIA');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 3 dari 7* 🎂\n\nMasukkan usia lu (dalam tahun):\n_Contoh: 21_',
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]] }
  );
}

async function onRecalcUsia(chatId, userId, text) {
  const usia = parseInt(text);
  if (isNaN(usia) || usia < 1 || usia > 120) {
    return sendMessage(chatId, 'Usia tidak valid. Masukkan angka tahun yang benar (1 - 120):');
  }
  await setCache(`${userId}_recalc_usia`, usia.toString());
  await setState(userId, 'AWAIT_RECALC_GENDER');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 4 dari 7* 🚻\n\nPilih jenis kelamin lu:',
    {
      inline_keyboard: [
        [{ text: '👨 Pria', callback_data: 'recalc_gen_pria' }, { text: '👩 Wanita', callback_data: 'recalc_gen_wanita' }],
        [{ text: '❌ Batal', callback_data: 'confirm_no' }]
      ]
    }
  );
}

async function onRecalcGenderSelect(chatId, userId, gender) {
  await setCache(`${userId}_recalc_gender`, gender);
  await setState(userId, 'AWAIT_RECALC_AKTIVITAS');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 5 dari 7* ⚡\n\nPilih level aktivitas fisik harian lu:',
    {
      inline_keyboard: [
        [{ text: 'Sedentary (Jarang olahraga)', callback_data: 'recalc_act_sedentary' }],
        [{ text: 'Light (Olahraga 1-3x/minggu)', callback_data: 'recalc_act_light' }],
        [{ text: 'Moderate (Olahraga 3-5x/minggu)', callback_data: 'recalc_act_moderate' }],
        [{ text: 'Heavy (Olahraga 6-7x/minggu)', callback_data: 'recalc_act_heavy' }],
        [{ text: 'Athlete (Olahraga berat/atlet)', callback_data: 'recalc_act_athlete' }],
        [{ text: '❌ Batal', callback_data: 'confirm_no' }]
      ]
    }
  );
}

async function onRecalcActivitySelect(chatId, userId, activity) {
  await setCache(`${userId}_recalc_aktivitas`, activity);
  await setState(userId, 'AWAIT_RECALC_TARGET');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 6 dari 7* 🎯\n\nPilih target/tujuan fitness lu:',
    {
      inline_keyboard: [
        [{ text: 'Cutting Agresif (-1kg/minggu)', callback_data: 'recalc_tgt_cutting_agresif' }],
        [{ text: 'Cutting Perlahan (-0.5kg/minggu)', callback_data: 'recalc_tgt_cutting_perlahan' }],
        [{ text: 'Pertahankan BB', callback_data: 'recalc_tgt_maintain' }],
        [{ text: 'Bulking Perlahan (+0.5kg/minggu)', callback_data: 'recalc_tgt_bulking_perlahan' }],
        [{ text: 'Bulking Agresif (+1kg/minggu)', callback_data: 'recalc_tgt_bulking_agresif' }],
        [{ text: '❌ Batal', callback_data: 'confirm_no' }]
      ]
    }
  );
}

async function onRecalcTargetSelect(chatId, userId, targetVal) {
  await setCache(`${userId}_recalc_target`, targetVal);
  await setState(userId, 'AWAIT_RECALC_CATATAN');
  return sendMessage(chatId,
    '*Kalkulator Fitness - Langkah 7 dari 7* 📝\n\nMasukkan catatan tambahan (opsional):\n_Contoh: Cutting sambil bangun masa otot, sensitif laktosa, dll._',
    {
      inline_keyboard: [
        [{ text: '⏭️ Lewati & Hitung Target', callback_data: 'skip_recalc_catatan' }],
        [{ text: '❌ Batal', callback_data: 'confirm_no' }]
      ]
    }
  );
}

async function onRecalcCatatanInput(chatId, userId, text) {
  const tb = await getCache(`${userId}_recalc_tb`);
  const bb = await getCache(`${userId}_recalc_bb`);
  const usia = await getCache(`${userId}_recalc_usia`);
  const gender = await getCache(`${userId}_recalc_gender`);
  const aktivitas = await getCache(`${userId}_recalc_aktivitas`);
  const target = await getCache(`${userId}_recalc_target`);
  const catatan = text ? text.trim() : '';

  if (!tb || !bb || !usia || !gender || !aktivitas || !target) {
    await setState(userId, null);
    await deleteRecalcCache(userId);
    return sendMessage(chatId, 'Sesi expired. Silakan ulangi kalkulasi.', mainMenuKeyboard());
  }

  await setState(userId, null);

  await sendChatAction(chatId, 'typing');
  await sendMessage(chatId, '⏳ Menghitung ulang target gizi dengan AI...', null);

  try {
    const profile = { tb, bb, usia, gender, aktivitas, target, catatan };
    const { recalculateTargets } = require('./groq');
    const aiResult = await recalculateTargets(profile);

    const finalProfile = { ...profile, targets: aiResult };
    await setCache(`${userId}_recalc_result`, JSON.stringify(finalProfile));

    let msg = '📊 *Hasil Kalkulasi Target Baru:*\n\n';
    msg += `• BMR Est: *${aiResult.bmr || '-'} kcal*\n`;
    msg += `• TDEE Est: *${aiResult.tdee || '-'} kcal*\n\n`;
    msg += `🔥 *Rekomendasi Gizi Harian:*\n`;
    msg += `• Kalori: *${aiResult.cal} kcal*\n`;
    msg += `• Protein: *${aiResult.protein}g*\n`;
    msg += `• Karbo: *${aiResult.carbs}g*\n`;
    msg += `• Lemak: *${aiResult.fat}g*\n`;
    msg += `• Serat: *${aiResult.fiber || 0}g*\n\n`;
    msg += `🤖 *Catatan AI:*\n${escapeMarkdown(aiResult.notes || '-')}\n\n`;
    msg += 'Simpan perubahan profil ini?';

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [
          { text: '✅ Simpan Profil', callback_data: 'save_profile_yes' },
          { text: '❌ Batal', callback_data: 'confirm_no' }
        ]
      ]
    });

  } catch (err) {
    console.error('onRecalcCatatanInput error:', err);
    await deleteRecalcCache(userId);
    return sendMessage(chatId, 'Gagal kalkulasi target: ' + err.message, {
      inline_keyboard: [[{ text: 'Menu Utama', callback_data: 'menu' }]]
    });
  }
}

async function saveProfile(chatId, userId) {
  const email = await getLinkedEmail(userId);
  if (!email) return promptLogin(chatId, userId);

  const raw = await getCache(`${userId}_recalc_result`);
  if (!raw) return sendMessage(chatId, 'Data expired. Silakan kalkulasi ulang.', mainMenuKeyboard());

  const finalProfile = JSON.parse(raw);
  await deleteRecalcCache(userId);

  await setFirebase(`users/${safe(email)}/lf_profile`, finalProfile);

  return sendMessage(chatId, '✅ *Profil & Target Gizi berhasil diperbarui!*', mainMenuKeyboard());
}

async function deleteRecalcCache(userId) {
  await deleteCache(`${userId}_recalc_tb`);
  await deleteCache(`${userId}_recalc_bb`);
  await deleteCache(`${userId}_recalc_usia`);
  await deleteCache(`${userId}_recalc_gender`);
  await deleteCache(`${userId}_recalc_aktivitas`);
  await deleteCache(`${userId}_recalc_target`);
  await deleteCache(`${userId}_recalc_catatan`);
  await deleteCache(`${userId}_recalc_result`);
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
