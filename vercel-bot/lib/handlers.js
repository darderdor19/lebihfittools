// ====================================================
// BOT HANDLERS — All logic ported from GAS
// ====================================================
const { getFirebase, setFirebase, toArray, safe, getState, setState, getCache, setCache, deleteCache, getLinkedEmail } = require('./firebase');
const { sendMessage, sendChatAction, answerCallback } = require('./telegram');
const { analyzeFood, sumNutrients } = require('./groq');
const crypto = require('crypto');

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

function getReportToken(userId) {
  const secret = process.env.TELEGRAM_BOT_TOKEN || 'lebihfit-secret';
  return crypto.createHmac('sha256', secret).update(userId.toString()).digest('hex').slice(0, 16);
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
        { text: '🏃 Kegiatan Harian', callback_data: 'log_activity' },
        { text: '📈 History', callback_data: 'history' }
      ],
      [
        { text: '⚙️ Settings', callback_data: 'settings' },
        { text: '🌐 Buka Web App', url: 'https://darderdor19.github.io/lebihfittools/' }
      ]
    ]
  };
}

function activityMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🏋️ Workout', callback_data: 'act_workout' },
        { text: '💪 Gym', callback_data: 'act_gym' }
      ],
      [
        { text: '😴 Tidur', callback_data: 'act_sleep' }
      ],
      [
        { text: '🏠 Menu Utama', callback_data: 'menu' }
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
  if (state === 'AWAIT_EDIT_NAME') return onEditNameInput(chatId, userId, text);
  if (state === 'AWAIT_EDIT_PORTION') return onEditPortionInput(chatId, userId, text);
  if (state === 'AWAIT_EDIT_DESC') return onEditDescInput(chatId, userId, text);

  // Activity states
  if (state === 'AWAIT_SLEEP_HOURS') return onSleepHoursInput(chatId, userId, text);
  if (state === 'AWAIT_WO_EX_NAME') return onWorkoutExNameInput(chatId, userId, text);
  if (state === 'AWAIT_WO_SETS_REPS') return onWorkoutSetsRepsInput(chatId, userId, text);
  if (state === 'AWAIT_WO_DUR') return onWorkoutDurationInput(chatId, userId, text);
  if (state === 'AWAIT_GYM_EX_NAME') return onGymExNameInput(chatId, userId, text);
  if (state === 'AWAIT_GYM_SETS_REPS') return onGymSetsRepsInput(chatId, userId, text);
  if (state === 'AWAIT_GYM_DUR') return onGymDurationInput(chatId, userId, text);

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
  
  // Activities callbacks
  if (data === 'log_activity') return email ? showLogActivityOptions(chatId) : promptLogin(chatId, userId);
  if (data === 'act_sleep') return email ? startSleepWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'act_workout') return email ? startWorkoutWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'act_gym') return email ? startGymWizard(chatId, userId) : promptLogin(chatId, userId);
  
  // Sleep wizard callbacks
  if (data.startsWith('sl_type_')) return saveSleepType(chatId, userId, data.replace('sl_type_', ''));
  if (data.startsWith('sl_qual_')) return saveSleepQuality(chatId, userId, email, data.replace('sl_qual_', ''));

  // Workout wizard callbacks
  if (data === 'wo_add_more') return startWorkoutExName(chatId, userId);
  if (data === 'wo_edit_dur') return startWorkoutDuration(chatId, userId);
  if (data === 'wo_edit_int') return promptWorkoutIntensity(chatId);
  if (data.startsWith('wo_int_')) return saveWorkoutIntensity(chatId, userId, data.replace('wo_int_', ''));
  if (data === 'wo_save') return saveWorkoutSession(chatId, userId, email);

  // Gym wizard callbacks
  if (data === 'gym_add_more_var') return startGymExName(chatId, userId);
  if (data === 'gym_add_more_muscle') return showGymMuscleSelector(chatId, 'Pilih otot berikutnya:');
  if (data === 'gym_edit_dur') return startGymDuration(chatId, userId);
  if (data === 'gym_edit_int') return promptGymIntensity(chatId);
  if (data.startsWith('gym_int_')) return saveGymIntensity(chatId, userId, data.replace('gym_int_', ''));
  if (data === 'gym_save') return saveGymSession(chatId, userId, email);
  if (data.startsWith('gym_sel_')) return saveGymMuscleSelection(chatId, userId, data.replace('gym_sel_', ''));

  // History callbacks
  if (data === 'history') return email ? showHistory(chatId, email) : promptLogin(chatId, userId);
  if (data === 'hist_panel_food') return showHistoryPanelOptions(chatId, 'food');
  if (data === 'hist_panel_act') return showHistoryPanelOptions(chatId, 'activity');
  if (data === 'hist_panel_ai') return showHistoryPanelOptions(chatId, 'ai');
  
  if (data.startsWith('hist_food_')) return showFoodHistoryDays(chatId, email, parseInt(data.replace('hist_food_', '')));
  if (data.startsWith('hist_act_')) return showActivityHistoryDays(chatId, email, parseInt(data.replace('hist_act_', '')));
  if (data.startsWith('hist_ai_')) return showAIHistoryDays(chatId, email, parseInt(data.replace('hist_ai_', '')));

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
  if (data === 'manage_logs') return email ? showManageLogs(chatId, email) : promptLogin(chatId, userId);
  if (data.startsWith('show_details_')) return; // do nothing
  if (data.startsWith('del_log_')) {
    const logId = data.replace('del_log_', '');
    return confirmDeleteLog(chatId, userId, email, logId);
  }
  if (data.startsWith('confirm_del_')) {
    const logId = data.replace('confirm_del_', '');
    return deleteLogItem(chatId, userId, email, logId);
  }
  if (data.startsWith('edit_log_')) {
    const logId = data.replace('edit_log_', '');
    return startEditLogWizard(chatId, userId, email, logId);
  }
  if (data === 'skip_edit_desc') return onEditDescInput(chatId, userId, null);
  if (data === 'confirm_edit_yes') return saveEditedLog(chatId, userId, email);
  if (data === 'delete_account_confirm') {
    return sendMessage(chatId,
      '⚠️ *PERINGATAN SANGAT PENTING*\n\nApakah lu YAKIN ingin menghapus AKUN LebihFit lu secara permanen?\n\nSemua data profil, riwayat gizi, dan info bot Telegram lu akan dihapus secara permanen dari database. Tindakan ini *TIDAK BISA DIBATALKAN*.\n\nKlik "🗑️ Ya, Hapus Akun" di bawah untuk konfirmasi:',
      {
        inline_keyboard: [
          [
            { text: '🗑️ Ya, Hapus Akun', callback_data: 'confirm_delete_account_yes' },
            { text: '❌ Batal', callback_data: 'settings' }
          ]
        ]
      }
    );
  }
  if (data === 'confirm_delete_account_yes') return doDeleteAccount(chatId, userId);
  if (data === 'pdf_report') {
    return sendMessage(chatId,
      '📊 *Laporan Gizi Berkala LebihFit*\n\nPilih periode laporan yang ingin lu unduh sebagai PDF:',
      {
        inline_keyboard: [
          [
            { text: '📅 Mingguan', callback_data: 'pdf_range_7' },
            { text: '📅 Bulanan', callback_data: 'pdf_range_30' }
          ],
          [
            { text: '📅 3 Bulan', callback_data: 'pdf_range_90' },
            { text: '📅 6 Bulan', callback_data: 'pdf_range_180' }
          ],
          [
            { text: '📅 1 Tahun', callback_data: 'pdf_range_365' },
            { text: '📅 All Time', callback_data: 'pdf_range_all' }
          ],
          [{ text: '❌ Batal', callback_data: 'settings' }]
        ]
      }
    );
  }
  if (data.startsWith('pdf_range_')) {
    const range = data.replace('pdf_range_', '');
    if (!email) return promptLogin(chatId, userId);
    const reportUrl = `https://darderdor19.github.io/lebihfittools/report.html?email=${encodeURIComponent(email)}&range=${range}`;
    
    const rangeText = {
      '7': 'Mingguan (7 Hari)',
      '30': 'Bulanan (30 Hari)',
      '90': '3 Bulan (90 Hari)',
      '180': '6 Bulan (180 Hari)',
      '365': '1 Tahun (365 Hari)',
      'all': 'All Time (Semua Data)'
    }[range] || `${range} Hari`;

    return sendMessage(chatId,
      `📊 *Laporan Gizi ${rangeText} LebihFit*\n\nLaporan lu sudah siap! Klik tombol di bawah ini untuk membuka dan menyimpan laporan tersebut sebagai PDF:`,
      {
        inline_keyboard: [
          [{ text: `🌐 Buka Laporan ${range === 'all' ? 'All Time' : rangeText.split(' ')[0]}`, url: reportUrl }],
          [{ text: '⚙️ Settings', callback_data: 'settings' }]
        ]
      }
    );
  }
  if (data === 'hist_7') return showFoodHistoryDays(chatId, email, 7);
  if (data === 'hist_14') return showFoodHistoryDays(chatId, email, 14);
  if (data === 'hist_30') return showFoodHistoryDays(chatId, email, 30);
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
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);
  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const total = sumNutrients(logs);
  const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 0);
  
  // Get today's activities
  const rawActs = await getFirebase(`users/${safe(email)}/lf_activities/${today}`);
  const todayActs = toArray(rawActs);
  const totalBurned = todayActs.reduce((acc, act) => acc + ((act.burn && act.burn.kcal) ? parseFloat(act.burn.kcal) : 0), 0);
  
  const remaining = calTarget - Math.round(total.cal) + Math.round(totalBurned);
  const pct = calTarget > 0 ? Math.min(100, Math.round(total.cal / calTarget * 100)) : 0;
  const bar = progressBar(pct);

  let msg = `*Dashboard - ${formatDate(new Date())}*\n\n`;
  msg += `Kalori: *${Math.round(total.cal)} / ${calTarget} kcal*\n`;
  msg += `Terbakar: *${Math.round(totalBurned)} kcal*\n`;
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
    logs.forEach((item, i) => {
      msg += `${i + 1}. ${escapeMarkdown(item.name)} - ${Math.round(item.cal)} kcal\n`;
    });
  }

  if (todayActs.length > 0) {
    msg += '\n*Kegiatan Hari Ini:*\n';
    todayActs.forEach((act, idx) => {
      if (act.type === 'workout') {
        const detail = (act.exercises || []).map(e => `${e.name} (${(e.sets || []).length}s)`).join(', ');
        msg += `${idx + 1}. 🏋️ *Workout:* ${escapeMarkdown(detail)} (${act.burn ? act.burn.kcal : 0} kcal)\n`;
      } else if (act.type === 'gym') {
        const detail = (act.muscles || []).map(m => MUSCLE_LABELS[m.muscle] || m.muscle).join(', ');
        msg += `${idx + 1}. 💪 *Gym:* ${escapeMarkdown(detail)} (${act.burn ? act.burn.kcal : 0} kcal)\n`;
      } else if (act.type === 'sleep') {
        msg += `${idx + 1}. 😴 *Tidur:* ${Math.floor(act.hours || 0)}j ${Math.round(((act.hours || 0) % 1) * 60)}m (${act.quality || 'biasa'})\n`;
      }
    });
  }

  try {
    const safeEmail = safe(email);
    const signature = getDailyDataSignatureLocal(email, today, logs, todayActs, profile || {});
    const cachePath = `users/${safeEmail}/ai_daily_sig_${safeEmail}_${today}`;
    const cache = await getFirebase(cachePath);
    let html = '';
    
    if (cache && cache.signature === signature && cache.html) {
      html = cache.html;
    } else {
      // Generate daily AI analysis on the fly
      const foodList = logs.map(item => `- ${item.name}: ${item.cal} kcal (P: ${item.protein}g, K: ${item.carbs}g, L: ${item.fat}g)`).join('\n') || 'Tidak ada makanan tercatat.';
      
      let activityContext = 'Tidak ada kegiatan tercatat hari ini.';
      if (todayActs.length > 0) {
        const workouts = todayActs.filter(a => a.type === 'workout');
        const gyms = todayActs.filter(a => a.type === 'gym');
        const sleeps = todayActs.filter(a => a.type === 'sleep');
        const lines = [];
        if (workouts.length > 0) {
          workouts.forEach(w => {
            lines.push(`Workout: ${w.exercises.map(e => `${e.name} (${e.sets.length} set)`).join(', ')}`);
          });
        }
        if (gyms.length > 0) {
          gyms.forEach(g => {
            const muscleList = g.muscles.map(m => `${MUSCLE_LABELS[m.muscle]||m.muscle}: ${g.variations ? g.variations.map(v=>v.name).join(', ') : m.variations.map(v=>v.name).join(', ')}`).join(' | ');
            lines.push(`Gym: ${muscleList}`);
          });
        }
        if (sleeps.length > 0) {
          sleeps.forEach(s => {
            lines.push(`Tidur: ${Math.floor(s.hours)}j${Math.round((s.hours%1)*60)}m · ${s.sleepType} · ${s.quality}`);
          });
        }
        activityContext = lines.join('\n');
      }

      const calStatus = remaining >= 0 ? 'Surplus' : 'Defisit';
      
      const targetProtein = (profile && profile.targets && profile.targets.protein) ? profile.targets.protein : Math.round((calTarget * 0.25) / 4);
      const targetCarbs = (profile && profile.targets && profile.targets.carbs) ? profile.targets.carbs : Math.round((calTarget * 0.50) / 4);
      const targetFat = (profile && profile.targets && profile.targets.fat) ? profile.targets.fat : Math.round((calTarget * 0.25) / 9);

      const prompt = `Kamu adalah ahli gizi dan pelatih fitness profesional. Evaluasi asupan gizi + kegiatan HARI INI untuk user LebihFit berikut, dan berikan analisis yang mendalam, personal, serta actionable dalam bahasa Indonesia gaul yang ramah (pakai "lu/kamu"):\n\n== DATA HARI INI ==\nProfil: ${profile.gender || '?'}, ${profile.bb || '?'}kg/${profile.tb || '?'}cm, Usia: ${profile.usia || '?'}th, Aktivitas: ${profile.aktivitas || '?'}, Goal: ${profile.target || 'maintenance'}\n\nMakanan tercatat (${logs.length} item):\n${foodList}\n\nTotal aktual vs Target harian:\n- Kalori: ${Math.round(total.cal)} kcal vs ${calTarget} kcal → ${calStatus}\n- Protein: ${total.protein.toFixed(1)}g vs ${targetProtein}g (${Math.round((total.protein/targetProtein)*100)}%)\n- Karbohidrat: ${total.carbs.toFixed(1)}g vs ${targetCarbs}g (${Math.round((total.carbs/targetCarbs)*100)}%)\n- Lemak: ${total.fat.toFixed(1)}g vs ${targetFat}g (${Math.round((total.fat/targetFat)*100)}%)\n- Serat: ${total.fiber.toFixed(1)}g (ideal ≥25g)\n- Gula: ${total.sugar.toFixed(1)}g (batas <50g)\n- Sodium: ${Math.round(total.sodium)}mg (batas <2300mg)\n\n== KEGIATAN HARI INI ==\n${activityContext}\n\n== FORMAT RESPONS ==\nTulis evaluasi dalam HTML VALID (TANPA markdown, TANPA code block). Wajib ada bagian:\n\n1. Status Kalori → <div style="padding:12px 14px;border-left:4px solid [WARNA];border-radius:8px;margin-bottom:10px;background:[BG]"> — isi: status, dampak ke goal, saran konkret untuk sisa hari ini atau besok\n\n2. Analisis Makronutrisi → heading + 3 div (protein, karbo, lemak) masing2 dengan:\n   - Status (KURANG/OK/BERLEBIH)\n   - Dampak spesifik ke tubuh/performa latihan  \n   - Saran makanan konkret untuk melengkapi hari ini / besok\n\n3. Kaitkan nutrisi dengan kegiatan hari ini: apakah asupan mendukung latihan yang dilakukan? Recovery otot cukup? Tidur cukup?\n\n4. Mikronutrisi (jika serat<25 atau gula>50 atau sodium>2300) → ringkas dalam 1 div\n\n5. Saran Aktivitas → berdasarkan sisa kalori, goal, dan kegiatan yang sudah dilakukan hari ini\n\n6. Prioritas Besok → 2-3 hal terpenting yang harus diperbaiki besok (format <ul><li>)\n\nGunakan warna: hijau = OK/cukup, merah = kurang/berlebih bahaya, kuning = perlu perhatian, biru = cutting/defisit. Jangan gunakan emoji sama sekali. Gunakan desain layout HTML yang bersih, elegan, dan profesional. JAWAB HANYA HTML, tanpa teks di luar tag HTML.`;

      const rawHtml = await callGroqAPI([{ role: 'user', content: prompt }], 2500);
      if (rawHtml) {
        const cleanHtml = rawHtml.trim().replace(/```html\n?/gi, '').replace(/```\n?/gi, '').trim();
        html = `
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:12px;padding:6px 10px;background:rgba(94,92,230,0.1);border-radius:8px;font-size:0.78rem;color:#8b8ff0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <b>Dianalisis AI Groq</b> · llama-3.3-70b · ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB
          </div>
          ${cleanHtml}`;
        // Save cache to Firebase
        await setFirebase(cachePath, { signature, html, timestamp: Date.now() });
      }
    }

    if (html) {
      msg += '\n🤖 *Analisis AI:* \n';
      msg += cleanHtmlToMarkdown(html) + '\n';
    }
  } catch(e) {
    console.error('Dashboard AI Analysis error:', e);
  }

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
      [{ text: '🏃 Kegiatan Harian Baru', callback_data: 'log_activity' }],
      [{ text: '✏️ Kelola Log Hari Ini', callback_data: 'manage_logs' }],
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
  await deleteEditCache(userId);
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
  return sendMessage(chatId, '📈 *Riwayat & Analisis LebihFit*\n\nPilih kategori riwayat yang ingin lu lihat:', {
    inline_keyboard: [
      [
        { text: '🍽️ Riwayat Makanan', callback_data: 'hist_panel_food' }
      ],
      [
        { text: '🏃 Riwayat Kegiatan', callback_data: 'hist_panel_act' }
      ],
      [
        { text: '🤖 Analisis AI Komprehensif', callback_data: 'hist_panel_ai' }
      ],
      [
        { text: '🏠 Menu Utama', callback_data: 'menu' }
      ]
    ]
  });
}

async function showFoodHistoryDays(chatId, email, days) {
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
    console.error('showFoodHistoryDays error:', err);
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
        [
          { text: '🚪 Logout', callback_data: 'logout' },
          { text: '⚠️ Hapus Akun', callback_data: 'delete_account_confirm' }
        ],
        [{ text: '📊 Laporan Gizi (PDF)', callback_data: 'pdf_report' }],
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

async function doDeleteAccount(chatId, userId) {
  const email = await getLinkedEmail(userId);
  if (email) {
    // 1. Unlink Telegram mapping
    await setFirebase(`telegram_links/${userId}`, null);
    // 2. Clear state and cache
    await setState(userId, null);
    await deleteEditCache(userId);
    await deleteRecalcCache(userId);
    // 3. Clear database node for user
    await setFirebase(`users/${safe(email)}`, null);
  }
  return sendMessage(chatId, '✅ Akun LebihFit lu beserta seluruh data di dalamnya telah berhasil dihapus secara permanen. Bot Telegram lu sekarang sudah ter-unlink.', null);
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

// ====================================================
// FOOD LOGS MANAGEMENT (EDIT & DELETE)
// ====================================================
async function showManageLogs(chatId, email) {
  const today = todayKey();
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);

  if (logs.length === 0) {
    return sendMessage(chatId,
      '✏️ *Kelola Log Makanan*\n\nBelum ada makanan tercatat hari ini.',
      {
        inline_keyboard: [
          [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
          [{ text: '📊 Dashboard', callback_data: 'dashboard' }]
        ]
      }
    );
  }

  let msg = '✏️ *Kelola Log Makanan Hari Ini*\n\nPilih makanan di bawah yang ingin lu ubah atau hapus:\n';
  const inline_keyboard = [];

  logs.forEach((item, index) => {
    msg += `\n*${index + 1}. ${escapeMarkdown(item.name)}*\n`;
    msg += `Porsi: ${escapeMarkdown(item.portion || '1 porsi')} | Kalori: *${Math.round(item.cal)} kcal*\n`;

    inline_keyboard.push([
      { text: `${index + 1}. ${escapeMarkdown(item.name)} (${Math.round(item.cal)} kcal)`, callback_data: `show_details_${item.id}` }
    ]);
    inline_keyboard.push([
      { text: `✏️ Edit`, callback_data: `edit_log_${item.id}` },
      { text: `🗑️ Hapus`, callback_data: `del_log_${item.id}` }
    ]);
  });

  inline_keyboard.push([
    { text: '📊 Kembali ke Dashboard', callback_data: 'dashboard' }
  ]);

  return sendMessage(chatId, msg, { inline_keyboard });
}

async function confirmDeleteLog(chatId, userId, email, logId) {
  const today = todayKey();
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);
  const item = logs.find(l => l.id === logId);

  if (!item) {
    return sendMessage(chatId, 'Makanan tidak ditemukan atau sudah dihapus.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_logs' }]]
    });
  }

  return sendMessage(chatId,
    `Apakah lu yakin ingin menghapus makanan *${escapeMarkdown(item.name)}* (${escapeMarkdown(item.portion)})?`,
    {
      inline_keyboard: [
        [
          { text: '🗑️ Ya, Hapus', callback_data: `confirm_del_${logId}` },
          { text: '❌ Batal', callback_data: 'manage_logs' }
        ]
      ]
    }
  );
}

async function deleteLogItem(chatId, userId, email, logId) {
  const today = todayKey();
  const logsPath = `users/${safe(email)}/lf_logs/${today}`;
  const rawLogs = await getFirebase(logsPath);
  const logs = toArray(rawLogs);

  const updatedLogs = logs.filter(l => l.id !== logId);
  await setFirebase(logsPath, updatedLogs);

  await sendMessage(chatId, '✅ Makanan berhasil dihapus!');
  return showManageLogs(chatId, email);
}

async function startEditLogWizard(chatId, userId, email, logId) {
  const today = todayKey();
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);
  const item = logs.find(l => l.id === logId);

  if (!item) {
    return sendMessage(chatId, 'Makanan tidak ditemukan.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_logs' }]]
    });
  }

  await setCache(`${userId}_editing_log_id`, logId);
  await setCache(`${userId}_editing_orig_name`, item.name);
  await setCache(`${userId}_editing_orig_portion`, item.portion || '1 porsi');
  await setCache(`${userId}_editing_orig_mealtime`, item.mealTime || 'sarapan');
  await setCache(`${userId}_editing_orig_loggedat`, item.loggedAt);

  await setState(userId, 'AWAIT_EDIT_NAME');
  return sendMessage(chatId,
    `✏️ *Edit Makanan - Langkah 1 dari 3*\n\nMakanan saat ini: *${escapeMarkdown(item.name)}*\n\nMasukkan nama makanan yang baru:\n_(Atau ketik /skip jika tidak ingin mengubah nama)_`,
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'manage_logs' }]] }
  );
}

async function onEditNameInput(chatId, userId, text) {
  const input = text.trim();
  if (input !== '/skip') {
    if (input.length < 2) {
      return sendMessage(chatId, 'Nama makanan terlalu pendek. Coba lagi atau ketik /skip:');
    }
    await setCache(`${userId}_editing_name`, input);
  }

  const origPortion = await getCache(`${userId}_editing_orig_portion`) || '1 porsi';

  await setState(userId, 'AWAIT_EDIT_PORTION');
  return sendMessage(chatId,
    `✏️ *Edit Makanan - Langkah 2 dari 3*\n\nPorsi saat ini: *${escapeMarkdown(origPortion)}*\n\nMasukkan porsi makanan yang baru:\n_(Atau ketik /skip jika tidak ingin mengubah porsi)_`,
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'manage_logs' }]] }
  );
}

async function onEditPortionInput(chatId, userId, text) {
  const input = text.trim();
  if (input !== '/skip') {
    if (input.length < 1) {
      return sendMessage(chatId, 'Porsi makanan tidak valid. Coba lagi atau ketik /skip:');
    }
    await setCache(`${userId}_editing_portion`, input);
  }

  await setState(userId, 'AWAIT_EDIT_DESC');
  return sendMessage(chatId,
    `✏️ *Edit Makanan - Langkah 3 dari 3*\n\nMasukkan deskripsi tambahan yang baru jika ada (opsional):\n_(Atau klik Lewati / ketik /skip jika tidak ada)_`,
    {
      inline_keyboard: [
        [{ text: '⏭️ Lewati & Analisis Ulang', callback_data: 'skip_edit_desc' }],
        [{ text: '❌ Batal', callback_data: 'manage_logs' }]
      ]
    }
  );
}

async function onEditDescInput(chatId, userId, text) {
  const logId = await getCache(`${userId}_editing_log_id`);
  const origName = await getCache(`${userId}_editing_orig_name`);
  const origPortion = await getCache(`${userId}_editing_orig_portion`);

  if (!logId) {
    await setState(userId, null);
    await deleteEditCache(userId);
    return sendMessage(chatId, 'Sesi expired. Silakan coba lagi.', mainMenuKeyboard());
  }

  const newName = await getCache(`${userId}_editing_name`) || origName;
  const newPortion = await getCache(`${userId}_editing_portion`) || origPortion;
  const newDesc = (text && text.trim() !== '/skip') ? text.trim() : '';

  await setState(userId, null);

  await sendChatAction(chatId, 'typing');

  let descString = `porsi: ${newPortion}`;
  if (newDesc) {
    descString += `, deskripsi: ${newDesc}`;
  }
  const query = `${newName}, ${descString}`;
  await sendMessage(chatId, `Menganalisis ulang: _${escapeMarkdown(query)}_...`, null);

  try {
    const nutrition = await analyzeFood(query);
    await setCache(`${userId}_editing_result`, JSON.stringify({
      id: logId,
      name: nutrition.name || newName,
      portion: nutrition.portion || newPortion,
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
      zinc: nutrition.zinc || 0
    }));

    let msg = '🤖 *Hasil Analisis Ulang AI:*\n\n';
    msg += `*${escapeMarkdown(nutrition.name)}*\n`;
    msg += `Porsi: ${escapeMarkdown(nutrition.portion || newPortion)}\n\n`;
    msg += `• Kalori: *${Math.round(nutrition.cal || 0)} kcal*\n`;
    msg += `• Protein: *${Number(nutrition.protein || 0).toFixed(1)}g*\n`;
    msg += `• Karbo: *${Number(nutrition.carbs || 0).toFixed(1)}g*\n`;
    msg += `• Lemak: *${Number(nutrition.fat || 0).toFixed(1)}g*\n`;
    msg += `• Serat: *${Number(nutrition.fiber || 0).toFixed(1)}g*\n\n`;
    msg += 'Update log makanan dengan gizi baru ini?';

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [
          { text: '✅ Ya, Update', callback_data: 'confirm_edit_yes' },
          { text: '❌ Batal', callback_data: 'manage_logs' }
        ]
      ]
    });

  } catch (err) {
    console.error('onEditDescInput error:', err);
    await deleteEditCache(userId);
    return sendMessage(chatId, 'Gagal analisis AI: ' + err.message, {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_logs' }]]
    });
  }
}

async function saveEditedLog(chatId, userId, email) {
  const rawResult = await getCache(`${userId}_editing_result`);
  if (!rawResult) {
    await deleteEditCache(userId);
    return sendMessage(chatId, 'Data expired. Silakan edit ulang.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_logs' }]]
    });
  }

  const updatedItem = JSON.parse(rawResult);
  const origMealtime = await getCache(`${userId}_editing_orig_mealtime`) || 'sarapan';
  const origLoggedat = await getCache(`${userId}_editing_orig_loggedat`) || new Date().toISOString();

  await deleteEditCache(userId);

  const today = todayKey();
  const logsPath = `users/${safe(email)}/lf_logs/${today}`;
  const rawLogs = await getFirebase(logsPath);
  const logs = toArray(rawLogs);

  const updatedLogs = logs.map(item => {
    if (item.id === updatedItem.id) {
      return {
        ...updatedItem,
        mealTime: origMealtime,
        loggedAt: origLoggedat,
        source: 'telegram_edit'
      };
    }
    return item;
  });

  await setFirebase(logsPath, updatedLogs);
  await sendMessage(chatId, '✅ Log makanan berhasil diperbarui!');
  return showManageLogs(chatId, email);
}

async function deleteEditCache(userId) {
  await deleteCache(`${userId}_editing_log_id`);
  await deleteCache(`${userId}_editing_orig_name`);
  await deleteCache(`${userId}_editing_orig_portion`);
  await deleteCache(`${userId}_editing_orig_mealtime`);
  await deleteCache(`${userId}_editing_orig_loggedat`);
  await deleteCache(`${userId}_editing_name`);
  await deleteCache(`${userId}_editing_portion`);
  await deleteCache(`${userId}_editing_result`);
}

// ====================================================
// WIZARD PENCATATAN KEGIATAN HARIAN (OLAH RAGA & TIDUR)
// ====================================================
const MUSCLE_LABELS = {
  chest: 'Chest (Dada)', back: 'Back (Punggung)', shoulder: 'Shoulder (Bahu)',
  bicep: 'Bicep (Lengan)', tricep: 'Tricep (Lengan)', forearm: 'Forearm (Lengan Bawah)',
  abs: 'Abs (Perut)', traps: 'Traps (Pundak)', leg: 'Leg (Kaki)'
};

const MET_WORKOUT = { low: 3.5, medium: 5.5, high: 8.0 };
const MET_GYM     = { low: 3.0, medium: 5.0, high: 6.5 };
const BURN_RATIO  = { fat: 0.30, carb: 0.60, protein: 0.10 };

function calcBurnedCalories(met, durationMin, weight = 70) {
  const kcal = met * weight * (durationMin / 60);
  const fatG    = (kcal * BURN_RATIO.fat) / 9;
  const carbG   = (kcal * BURN_RATIO.carb) / 4;
  const proteinG= (kcal * BURN_RATIO.protein) / 4;
  return { 
    kcal: Math.round(kcal), 
    fatG: parseFloat(fatG.toFixed(1)), 
    carbG: parseFloat(carbG.toFixed(1)), 
    proteinG: parseFloat(proteinG.toFixed(1)) 
  };
}

function parseSetsReps(str) {
  const sets = [];
  const clean = str.trim().toLowerCase();
  const matchX = clean.match(/^(\d+)\s*(?:set|x)\s*(\d+)/i);
  if (matchX) {
    const numSets = parseInt(matchX[1]);
    const numReps = parseInt(matchX[2]);
    for (let i = 1; i <= numSets; i++) {
      sets.push({ set: i, reps: numReps });
    }
    return sets;
  }
  const parts = clean.split(/[\s,]+/);
  if (parts.length > 0 && parts.every(p => /^\d+$/.test(p))) {
    parts.forEach((p, idx) => {
      sets.push({ set: idx + 1, reps: parseInt(p) });
    });
    return sets;
  }
  return null;
}

const GROQ_KEY = process.env.GROQ_API_KEY;
async function callGroqAPI(messages, maxTokens = 2500) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY env variable is not set');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: maxTokens
    })
  });
  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error('Groq API error: ' + JSON.stringify(data));
  }
  return data.choices[0].message.content;
}

// Clean HTML to Telegram Markdown
function cleanHtmlToMarkdown(html) {
  if (!html) return '';
  let str = html;
  str = str.replace(/<div style="display:flex;[^>]*>[\s\S]*?<\/div>/gi, '');
  str = str.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n*$1*\n');
  str = str.replace(/<li>(.*?)<\/li>/gi, '• $1\n');
  str = str.replace(/<ul>/gi, '').replace(/<\/ul>/gi, '\n');
  str = str.replace(/<div style="padding:12px 14px;border-left:4px solid[^>]*>(.*?)<\/div>/gi, '\n$1\n');
  str = str.replace(/<div[^>]*>(.*?)<\/div>/gi, '\n$1\n');
  str = str.replace(/<b>(.*?)<\/b>/gi, '*$1*');
  str = str.replace(/<strong>(.*?)<\/strong>/gi, '*$1*');
  str = str.replace(/<i>(.*?)<\/i>/gi, '_$1_');
  str = str.replace(/<em>(.*?)<\/em>/gi, '_$1_');
  str = str.replace(/<br\s*\/?>/gi, '\n');
  str = str.replace(/<[^>]*>/g, '');
  str = str.replace(/\n\s*\n+/g, '\n\n');
  return str.trim();
}

// Signature builders
function getDailyDataSignatureLocal(email, dateStr, logs, acts, profile) {
  const foodSignature = (logs || []).map(l => `${l.id}-${l.cal}-${l.protein}-${l.carbs}-${l.fat}`).join('|');
  const actSignature = (acts || []).map(a => {
    if (a.type === 'sleep') return `${a.id}-${a.hours || 0}-${a.quality || 'biasa'}-${a.sleepType || 'malam'}`;
    if (a.type === 'workout') return `${a.id}-${(a.exercises || []).map(e => `${e.name}-${(e.sets || []).map(s=>s.reps).join('/')}`).join(',')}`;
    if (a.type === 'gym') return `${a.id}-${(a.muscles || []).map(m => `${m.muscle}-${(m.variations || []).map(v => `${v.name}-${(v.sets || []).map(s=>s.reps).join('/')}`).join(',')}`).join(',')}`;
    return a.id;
  }).join('|');
  const profileSig = `${(profile && profile.bb) || ''}-${(profile && profile.tb) || ''}-${(profile && profile.target) || ''}`;
  return `${email}_${dateStr}_[${foodSignature}]_[${actSignature}]_[${profileSig}]`;
}

function getRangeDataSignatureLocal(email, fromDate, toDate, logs, acts, profile) {
  const foodParts = [];
  logs.forEach(day => {
    if (day.logs && day.logs.length > 0) {
      const itemSigs = day.logs.map(item => `${item.id}-${item.cal}-${item.protein}-${item.carbs}-${item.fat}`).join(',');
      foodParts.push(`${day.date}:${itemSigs}`);
    }
  });

  const actParts = [];
  Object.keys(acts).sort().forEach(key => {
    const dayActs = acts[key] || [];
    if (dayActs.length > 0) {
      const daySigs = dayActs.map(a => {
        if (a.type === 'sleep') return `${a.id}-${a.hours || 0}-${a.quality || 'biasa'}-${a.sleepType || 'malam'}`;
        if (a.type === 'workout') return `${a.id}-${(a.exercises || []).map(e => `${e.name}-${(e.sets || []).map(s=>s.reps).join('/')}`).join(',')}`;
        if (a.type === 'gym') return `${a.id}-${(a.muscles || []).map(m => `${m.muscle}-${(m.variations || []).map(v => `${v.name}-${(v.sets || []).map(s=>s.reps).join('/')}`).join(',')}`).join(',')}`;
        return a.id;
      }).join(',');
      actParts.push(`${key}:${daySigs}`);
    }
  });

  const profileSig = `${profile.bb || ''}-${profile.tb || ''}-${profile.target || ''}`;
  return `${email}_${fromDate}_${toDate}_[${foodParts.join('|')}]_[${actParts.join('|')}]_[${profileSig}]`;
}

async function showLogActivityOptions(chatId) {
  return sendMessage(chatId, '🏃 *Pilih Kegiatan Harian yang Ingin Dicatat:*', activityMenuKeyboard());
}

// SLEEP WIZARD
async function startSleepWizard(chatId, userId) {
  await setState(userId, 'AWAIT_SLEEP_HOURS');
  await setCache(`${userId}_activity`, { type: 'sleep' });
  return sendMessage(chatId, '😴 *Mencatat Kegiatan Tidur*\n\nBerapa jam total tidur lu hari ini? (Masukkan angka, contoh: 7.5 atau 8):');
}

async function onSleepHoursInput(chatId, userId, text) {
  const hours = parseFloat(text.replace(',', '.'));
  if (isNaN(hours) || hours <= 0 || hours > 24) {
    return sendMessage(chatId, '⚠️ Jam tidur harus berupa angka desimal valid antara 0.1 s/d 24. Coba masukkan lagi:');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  draft.hours = hours;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_SLEEP_TYPE');
  return sendMessage(chatId, 'Pilih tipe tidur lu:', {
    inline_keyboard: [
      [
        { text: '🌙 Tidur Malam', callback_data: 'sl_type_malam' },
        { text: '☀️ Tidur Siang', callback_data: 'sl_type_siang' }
      ],
      [
        { text: '⚡ Tidur Sebentar (Nap)', callback_data: 'sl_type_sebentar' }
      ]
    ]
  });
}

async function saveSleepType(chatId, userId, val) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.sleepType = val;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_SLEEP_QUALITY');
  return sendMessage(chatId, 'Bagaimana kualitas tidur lu?', {
    inline_keyboard: [
      [
        { text: '😊 Lelap/Nyenyak', callback_data: 'sl_qual_lelap' },
        { text: '😐 Biasa Saja', callback_data: 'sl_qual_biasa' }
      ],
      [
        { text: '😞 Kurang Nyenyak', callback_data: 'sl_qual_kurang' }
      ]
    ]
  });
}

async function saveSleepQuality(chatId, userId, email, val) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.quality = val;

  await setState(userId, null);
  await deleteCache(`${userId}_activity`);

  const today = todayKey();
  const actId = generateId();
  const sleepActivity = {
    id: actId,
    type: 'sleep',
    hours: draft.hours,
    sleepType: draft.sleepType,
    quality: draft.quality,
    date: today,
    timestamp: Date.now()
  };

  await setFirebase(`users/${safe(email)}/lf_activities/${today}/${actId}`, sleepActivity);
  
  // Invalidate AI cache for today
  const safeEmail = safe(email);
  await setFirebase(`users/${safeEmail}/ai_daily_sig_${safeEmail}_${today}`, null);

  let msg = `✅ *Kegiatan Tidur Berhasil Disimpan!*\n\n`;
  msg += `• Durasi: *${draft.hours} jam*\n`;
  msg += `• Tipe: *Tidur ${draft.sleepType === 'malam' ? 'Malam' : draft.sleepType === 'siang' ? 'Siang' : 'Sebentar'}*\n`;
  msg += `• Kualitas: *${draft.quality === 'lelap' ? 'Lelap' : draft.quality === 'biasa' ? 'Biasa' : 'Kurang Nyenyak'}*`;

  return sendMessage(chatId, msg, mainMenuKeyboard());
}

// WORKOUT WIZARD
async function startWorkoutWizard(chatId, userId) {
  await setState(userId, 'AWAIT_WO_EX_NAME');
  await setCache(`${userId}_activity`, { type: 'workout', exercises: [], intensity: 'medium', durationMin: 30 });
  return sendMessage(chatId, '🏋️ *Mencatat Sesi Workout*\n\nMasukkan nama gerakan pertama (contoh: Push Up, Squat, Pull Up):');
}

async function startWorkoutExName(chatId, userId) {
  await setState(userId, 'AWAIT_WO_EX_NAME');
  return sendMessage(chatId, 'Masukkan nama gerakan berikutnya:');
}

async function onWorkoutExNameInput(chatId, userId, text) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.exercises.push({ name: text, sets: [] });
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_WO_SETS_REPS');
  return sendMessage(chatId, `Berapa set & repetisi untuk *${escapeMarkdown(text)}*?\n\n_Contoh:_ \n• *3x12* (atau *3 set 12 reps*)\n• *10,12,12* (jumlah repetisi per set dipisah koma)`);
}

async function onWorkoutSetsRepsInput(chatId, userId, text) {
  const sets = parseSetsReps(text);
  if (!sets) {
    return sendMessage(chatId, '⚠️ Format tidak dikenali. Coba masukkan lagi (contoh: 3x12 atau 10,12,12):');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  if (draft.exercises.length > 0) {
    draft.exercises[draft.exercises.length - 1].sets = sets;
  }
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_WO_MENU');
  return showWorkoutDraftMenu(chatId, draft);
}

async function showWorkoutDraftMenu(chatId, draft) {
  let msg = `🏋️ *Ringkasan Workout Harian*\n\n`;
  draft.exercises.forEach((ex, idx) => {
    const repsStr = ex.sets.map(s => s.reps).join('/');
    msg += `${idx + 1}. *${escapeMarkdown(ex.name)}* — ${ex.sets.length} set (${repsStr} reps)\n`;
  });
  msg += `\n• Estimasi Durasi: *${draft.durationMin} menit*\n`;
  const intLabel = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' }[draft.intensity];
  msg += `• Intensitas: *${intLabel}*\n`;

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: '➕ Tambah Gerakan', callback_data: 'wo_add_more' },
        { text: '⏱️ Ubah Durasi', callback_data: 'wo_edit_dur' }
      ],
      [
        { text: '⚙️ Ubah Intensitas', callback_data: 'wo_edit_int' },
        { text: '💾 Simpan Sesi', callback_data: 'wo_save' }
      ],
      [
        { text: '❌ Batal', callback_data: 'menu' }
      ]
    ]
  });
}

async function startWorkoutDuration(chatId, userId) {
  await setState(userId, 'AWAIT_WO_DUR');
  return sendMessage(chatId, 'Masukkan estimasi durasi latihan dalam menit (contoh: 45):');
}

async function onWorkoutDurationInput(chatId, userId, text) {
  const dur = parseInt(text);
  if (isNaN(dur) || dur <= 0) {
    return sendMessage(chatId, '⚠️ Durasi harus berupa angka bulat positif. Coba masukkan lagi:');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  draft.durationMin = dur;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_WO_MENU');
  return showWorkoutDraftMenu(chatId, draft);
}

async function promptWorkoutIntensity(chatId) {
  return sendMessage(chatId, 'Pilih intensitas latihan workout:', {
    inline_keyboard: [
      [
        { text: '🟢 Ringan (MET 3.5)', callback_data: 'wo_int_low' },
        { text: '🟡 Sedang (MET 5.5)', callback_data: 'wo_int_medium' }
      ],
      [
        { text: '🔴 Tinggi (MET 8.0)', callback_data: 'wo_int_high' }
      ]
    ]
  });
}

async function saveWorkoutIntensity(chatId, userId, val) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.intensity = val;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_WO_MENU');
  return showWorkoutDraftMenu(chatId, draft);
}

async function saveWorkoutSession(chatId, userId, email) {
  const draft = await getCache(`${userId}_activity`) || {};
  await setState(userId, null);
  await deleteCache(`${userId}_activity`);

  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const weight = (profile && profile.bb) ? parseFloat(profile.bb) : 70;
  const burn = calcBurnedCalories(MET_WORKOUT[draft.intensity], draft.durationMin, weight);

  const today = todayKey();
  const actId = generateId();
  const workoutActivity = {
    id: actId,
    type: 'workout',
    exercises: draft.exercises,
    durationMin: draft.durationMin,
    intensity: draft.intensity,
    burn: burn,
    date: today,
    timestamp: Date.now()
  };

  await setFirebase(`users/${safe(email)}/lf_activities/${today}/${actId}`, workoutActivity);

  // Invalidate AI cache for today
  const safeEmail = safe(email);
  await setFirebase(`users/${safeEmail}/ai_daily_sig_${safeEmail}_${today}`, null);

  let msg = `✅ *Sesi Workout Berhasil Disimpan!*\n\n`;
  msg += `• Total Gerakan: *${draft.exercises.length} gerakan*\n`;
  msg += `• Durasi: *${draft.durationMin} menit*\n`;
  msg += `• Estimasi Kalori Terbakar: *${burn.kcal} kcal*\n`;
  msg += `  _(Lemak: ${burn.fatG}g, Karbo: ${burn.carbG}g, Protein: ${burn.proteinG}g)_`;

  return sendMessage(chatId, msg, mainMenuKeyboard());
}

// GYM WIZARD
async function startGymWizard(chatId, userId) {
  await setState(userId, 'AWAIT_GYM_MUSCLE');
  await setCache(`${userId}_activity`, { type: 'gym', muscles: [], intensity: 'medium', durationMin: 45 });
  return showGymMuscleSelector(chatId);
}

async function showGymMuscleSelector(chatId, textMsg = '💪 *Mulai mencatat sesi Gym*\n\nPilih bagian otot yang ingin dilatih:') {
  return sendMessage(chatId, textMsg, {
    inline_keyboard: [
      [
        { text: 'Chest (Dada)', callback_data: 'gym_sel_chest' },
        { text: 'Back (Punggung)', callback_data: 'gym_sel_back' }
      ],
      [
        { text: 'Shoulder (Bahu)', callback_data: 'gym_sel_shoulder' },
        { text: 'Bicep (Lengan)', callback_data: 'gym_sel_bicep' }
      ],
      [
        { text: 'Tricep (Lengan)', callback_data: 'gym_sel_tricep' },
        { text: 'Forearm (Lengan Bawah)', callback_data: 'gym_sel_forearm' }
      ],
      [
        { text: 'Abs (Perut)', callback_data: 'gym_sel_abs' },
        { text: 'Traps (Pundak)', callback_data: 'gym_sel_traps' }
      ],
      [
        { text: 'Leg (Kaki)', callback_data: 'gym_sel_leg' }
      ],
      [
        { text: '❌ Batal', callback_data: 'menu' }
      ]
    ]
  });
}

async function saveGymMuscleSelection(chatId, userId, muscle) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.currentMuscle = muscle;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_GYM_EX_NAME');
  const label = MUSCLE_LABELS[muscle] || muscle;
  return sendMessage(chatId, `Masukkan nama gerakan untuk otot *${label}* (contoh: Bench Press, Lat Pulldown):`);
}

async function startGymExName(chatId, userId) {
  const draft = await getCache(`${userId}_activity`) || {};
  await setState(userId, 'AWAIT_GYM_EX_NAME');
  const label = MUSCLE_LABELS[draft.currentMuscle] || draft.currentMuscle;
  return sendMessage(chatId, `Masukkan nama gerakan berikutnya untuk otot *${label}*:`);
}

async function onGymExNameInput(chatId, userId, text) {
  const draft = await getCache(`${userId}_activity`) || {};
  let muscleEntry = draft.muscles.find(m => m.muscle === draft.currentMuscle);
  if (!muscleEntry) {
    muscleEntry = { muscle: draft.currentMuscle, variations: [] };
    draft.muscles.push(muscleEntry);
  }
  muscleEntry.variations.push({ name: text, sets: [] });
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_GYM_SETS_REPS');
  return sendMessage(chatId, `Berapa set & repetisi untuk *${escapeMarkdown(text)}*?\n\n_Contoh:_ 4x10 atau 10,10,8,8`);
}

async function onGymSetsRepsInput(chatId, userId, text) {
  const sets = parseSetsReps(text);
  if (!sets) {
    return sendMessage(chatId, '⚠️ Format tidak dikenali. Coba masukkan lagi (contoh: 4x10 atau 10,10,8,8):');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  const muscleEntry = draft.muscles.find(m => m.muscle === draft.currentMuscle);
  if (muscleEntry && muscleEntry.variations.length > 0) {
    muscleEntry.variations[muscleEntry.variations.length - 1].sets = sets;
  }
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_GYM_MENU');
  return showGymDraftMenu(chatId, draft);
}

async function showGymDraftMenu(chatId, draft) {
  let msg = `💪 *Ringkasan Sesi Gym*\n\n`;
  draft.muscles.forEach((m) => {
    msg += `• *${MUSCLE_LABELS[m.muscle] || m.muscle}:*\n`;
    m.variations.forEach((v, idx) => {
      const repsStr = v.sets.map(s => s.reps).join('/');
      msg += `  ${idx + 1}. *${escapeMarkdown(v.name)}* — ${v.sets.length} set (${repsStr} reps)\n`;
    });
  });
  msg += `\n• Estimasi Durasi: *${draft.durationMin} menit*\n`;
  const intLabel = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' }[draft.intensity];
  msg += `• Intensitas: *${intLabel}*\n`;

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: '➕ Tambah Gerakan di Otot Ini', callback_data: 'gym_add_more_var' },
        { text: '💪 Pilih Otot Lain', callback_data: 'gym_add_more_muscle' }
      ],
      [
        { text: '⏱️ Ubah Durasi', callback_data: 'gym_edit_dur' },
        { text: '⚙️ Ubah Intensitas', callback_data: 'gym_edit_int' }
      ],
      [
        { text: '💾 Simpan Sesi', callback_data: 'gym_save' },
        { text: '❌ Batal', callback_data: 'menu' }
      ]
    ]
  });
}

async function startGymDuration(chatId, userId) {
  await setState(userId, 'AWAIT_GYM_DUR');
  return sendMessage(chatId, 'Masukkan estimasi durasi sesi gym dalam menit (contoh: 60):');
}

async function onGymDurationInput(chatId, userId, text) {
  const dur = parseInt(text);
  if (isNaN(dur) || dur <= 0) {
    return sendMessage(chatId, '⚠️ Durasi harus berupa angka bulat positif. Coba masukkan lagi:');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  draft.durationMin = dur;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_GYM_MENU');
  return showGymDraftMenu(chatId, draft);
}

async function promptGymIntensity(chatId) {
  return sendMessage(chatId, 'Pilih intensitas latihan gym:', {
    inline_keyboard: [
      [
        { text: '🟢 Ringan (MET 3.0)', callback_data: 'gym_int_low' },
        { text: '🟡 Sedang (MET 5.0)', callback_data: 'gym_int_medium' }
      ],
      [
        { text: '🔴 Tinggi (MET 6.5)', callback_data: 'gym_int_high' }
      ]
    ]
  });
}

async function saveGymIntensity(chatId, userId, val) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.intensity = val;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_GYM_MENU');
  return showGymDraftMenu(chatId, draft);
}

async function saveGymSession(chatId, userId, email) {
  const draft = await getCache(`${userId}_activity`) || {};
  await setState(userId, null);
  await deleteCache(`${userId}_activity`);

  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const weight = (profile && profile.bb) ? parseFloat(profile.bb) : 70;
  const burn = calcBurnedCalories(MET_GYM[draft.intensity], draft.durationMin, weight);

  const today = todayKey();
  const actId = generateId();
  const gymActivity = {
    id: actId,
    type: 'gym',
    muscles: draft.muscles,
    durationMin: draft.durationMin,
    intensity: draft.intensity,
    burn: burn,
    date: today,
    timestamp: Date.now()
  };

  await setFirebase(`users/${safe(email)}/lf_activities/${today}/${actId}`, gymActivity);

  // Invalidate AI cache for today
  const safeEmail = safe(email);
  await setFirebase(`users/${safeEmail}/ai_daily_sig_${safeEmail}_${today}`, null);

  let msg = `✅ *Sesi Gym Berhasil Disimpan!*\n\n`;
  msg += `• Bagian Otot: *${draft.muscles.length} kelompok*\n`;
  msg += `• Durasi: *${draft.durationMin} menit*\n`;
  msg += `• Estimasi Kalori Terbakar: *${burn.kcal} kcal*\n`;
  msg += `  _(Lemak: ${burn.fatG}g, Karbo: ${burn.carbG}g, Protein: ${burn.proteinG}g)_`;

  return sendMessage(chatId, msg, mainMenuKeyboard());
}

// SPLIT HISTORY FUNCTIONS
async function showHistoryPanelOptions(chatId, type) {
  const label = { food: 'Riwayat Makanan', activity: 'Riwayat Kegiatan', ai: 'Analisis AI Komprehensif' }[type];
  return sendMessage(chatId, `📈 *${label} LebihFit*\n\nPilih rentang waktu:`, {
    inline_keyboard: [
      [
        { text: '7 Hari', callback_data: `hist_${type}_7` },
        { text: '14 Hari', callback_data: `hist_${type}_14` },
        { text: '30 Hari', callback_data: `hist_${type}_30` }
      ],
      [
        { text: '🔙 Kembali ke Pilihan Riwayat', callback_data: 'history' }
      ]
    ]
  });
}

async function showActivityHistoryDays(chatId, email, days) {
  await sendChatAction(chatId, 'typing');
  const dates = getPastWibDates(days);
  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);

  try {
    const promises = dates.map(async (key) => {
      const rawActs = await getFirebase(`users/${safe(email)}/lf_activities/${key}`);
      const acts = toArray(rawActs);
      return { key, acts };
    });

    const results = await Promise.all(promises);

    let totalWorkouts = 0;
    let totalGyms = 0;
    let totalSleeps = 0;
    let totalSleepHours = 0;
    let totalBurned = 0;
    let sleepQualities = { lelap: 0, biasa: 0, kurang: 0 };
    let muscles = {};

    results.forEach(({ acts }) => {
      acts.forEach(a => {
        if (a.type === 'workout') {
          totalWorkouts++;
          if (a.burn) totalBurned += a.burn.kcal || 0;
        } else if (a.type === 'gym') {
          totalGyms++;
          if (a.burn) totalBurned += a.burn.kcal || 0;
          if (a.muscles) {
            a.muscles.forEach(m => {
              muscles[m.muscle] = (muscles[m.muscle] || 0) + 1;
            });
          }
        } else if (a.type === 'sleep') {
          totalSleeps++;
          totalSleepHours += a.hours || 0;
          if (a.quality) sleepQualities[a.quality] = (sleepQualities[a.quality] || 0) + 1;
        }
      });
    });

    if (totalWorkouts === 0 && totalGyms === 0 && totalSleeps === 0) {
      return sendMessage(chatId, `Belum ada kegiatan olahraga atau tidur tercatat dalam ${days} hari terakhir.`, {
        inline_keyboard: [
          [{ text: '🏃 Catat Kegiatan Baru', callback_data: 'log_activity' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu' }]
        ]
      });
    }

    const avgSleep = totalSleeps > 0 ? (totalSleepHours / totalSleeps).toFixed(1) : 0;
    const avgBurn = totalWorkouts + totalGyms > 0 ? Math.round(totalBurned / (totalWorkouts + totalGyms)) : 0;

    let msg = `🏃 *Riwayat Kegiatan ${days} Hari Terakhir*\n\n`;
    msg += `📝 *Statistik Ringkas:*\n`;
    msg += `• Total Workout: *${totalWorkouts}x sesi*\n`;
    msg += `• Total Gym: *${totalGyms}x sesi*\n`;
    msg += `• Total Tidur: *${totalSleepHours.toFixed(1)} jam* (${totalSleeps} entri, Rerata: *${avgSleep}j/hari*)\n`;
    if (totalSleeps > 0) {
      msg += `  _(Lelap: ${sleepQualities.lelap}x, Biasa: ${sleepQualities.biasa}x, Kurang: ${sleepQualities.kurang}x)_\n`;
    }
    msg += `• Total Kalori Terbakar: *${totalBurned} kcal* (Rerata: *${avgBurn} kcal/sesi*)\n`;

    const sortedMuscles = Object.keys(muscles).sort((a,b) => muscles[b] - muscles[a]);
    if (sortedMuscles.length > 0) {
      msg += `• Otot Terlatih: *${sortedMuscles.map(m => `${MUSCLE_LABELS[m] || m} (${muscles[m]}x)`).join(', ')}*\n`;
    }

    msg += `\n📅 *Catatan Harian (Terbaru):*\n`;
    let itemsCount = 0;
    for (const { key, acts } of results) {
      if (acts.length === 0) continue;
      if (itemsCount >= 5) {
        msg += `• ... dan beberapa hari lainnya\n`;
        break;
      }
      const parts = key.split('-');
      msg += `*${parts[2]}/${parts[1]}:*\n`;
      acts.forEach(a => {
        if (a.type === 'workout') {
          const detail = (a.exercises || []).map(e => `${e.name} (${(e.sets || []).length}s)`).join(', ');
          msg += `  - 🏋️ Workout: ${escapeMarkdown(detail)} (${a.burn ? a.burn.kcal : 0} kcal)\n`;
        } else if (a.type === 'gym') {
          const detail = (a.muscles || []).map(m => MUSCLE_LABELS[m.muscle] || m.muscle).join(', ');
          msg += `  - 💪 Gym: ${escapeMarkdown(detail)} (${a.burn ? a.burn.kcal : 0} kcal)\n`;
        } else if (a.type === 'sleep') {
          msg += `  - 😴 Tidur: ${Math.floor(a.hours || 0)}j ${Math.round(((a.hours || 0) % 1) * 60)}m (${a.quality || 'biasa'})\n`;
        }
      });
      itemsCount++;
    }

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [
          { text: '🏃 Catat Kegiatan Baru', callback_data: 'log_activity' },
          { text: '🔙 Kembali', callback_data: 'hist_panel_act' }
        ],
        [
          { text: '🏠 Menu Utama', callback_data: 'menu' }
        ]
      ]
    });

  } catch(err) {
    console.error('showActivityHistoryDays error:', err);
    return sendMessage(chatId, 'Gagal memuat riwayat kegiatan: ' + err.message, {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'history' }]]
    });
  }
}

async function showAIHistoryDays(chatId, email, days) {
  await sendChatAction(chatId, 'typing');
  const dates = getPastWibDates(days);
  const toDate = dates[0];
  const fromDate = dates[dates.length - 1];
  const safeEmail = safe(email);
  const profile = await getFirebase(`users/${safeEmail}/lf_profile`);

  try {
    // Fetch logs and acts in parallel
    const promises = dates.map(async (key) => {
      const rawLogs = await getFirebase(`users/${safeEmail}/lf_logs/${key}`);
      const rawActs = await getFirebase(`users/${safeEmail}/lf_activities/${key}`);
      return {
        date: key,
        logs: toArray(rawLogs),
        acts: toArray(rawActs)
      };
    });

    const results = await Promise.all(promises);

    // Calculate signature
    const signature = getRangeDataSignatureLocal(email, fromDate, toDate, results, results.reduce((acc, d) => {
      acc[d.date] = d.acts;
      return acc;
    }, {}), profile || {});

    const cachePath = `users/${safeEmail}/ai_history_sig_${safeEmail}_${fromDate}_${toDate}`;
    const cache = await getFirebase(cachePath);
    let html = '';

    if (cache && cache.signature === signature && cache.html) {
      html = cache.html;
    } else {
      // Show intermediate loading message
      await sendMessage(chatId, `🤖 *Menghubungi Groq AI...*\nMemproses data riwayat ${days} hari untuk membuat analisis komprehensif. Harap tunggu sebentar...`, null);
      
      // Calculate averages
      const activeDays = results.filter(d => d.logs.length > 0).length || 1;
      const totalCal = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.cal || 0), 0), 0);
      const totalProtein = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.protein || 0), 0), 0);
      const totalCarbs = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.carbs || 0), 0), 0);
      const totalFat = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.fat || 0), 0), 0);
      const totalFiber = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.fiber || 0), 0), 0);
      const totalSugar = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.sugar || 0), 0), 0);
      const totalSodium = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.sodium || 0), 0), 0);

      const avgCal = totalCal / activeDays;
      const avgProtein = totalProtein / activeDays;
      const avgCarbs = totalCarbs / activeDays;
      const avgFat = totalFat / activeDays;
      const avgFiber = totalFiber / activeDays;
      const avgSugar = totalSugar / activeDays;
      const avgSodium = totalSodium / activeDays;

      const foodListPrompt = dates.map(d => {
        const day = results.find(r => r.date === d);
        const dayLogs = day ? day.logs : [];
        if (dayLogs.length === 0) return `- ${d}: Tidak ada catatan makanan.`;
        const dayCal = dayLogs.reduce((s,i) => s+(i.cal||0), 0);
        const dayProt = dayLogs.reduce((s,i) => s+(i.protein||0), 0);
        return `- ${d}: ${Math.round(dayCal)} kcal | P:${dayProt.toFixed(1)}g | ${dayLogs.map(i => i.name).join(', ')}`;
      }).join('\n');

      const activityPrompt = dates.map(d => {
        const day = results.find(r => r.date === d);
        const dayActs = day ? day.acts : [];
        if (dayActs.length === 0) return `- ${d}: Tidak ada aktivitas.`;
        return `- ${d}: ${dayActs.map(a => {
          if (a.type === 'sleep') return `Tidur ${a.hours.toFixed(1)}j (${a.quality})`;
          if (a.type === 'workout') return `Workout: ${(a.exercises || []).map(e => e.name).join(', ')}`;
          if (a.type === 'gym') return `Gym: ${(a.muscles || []).map(m => m.muscle).join(', ')}`;
          return a.type;
        }).join(' · ')}`;
      }).join('\n');

      const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);
      const targetProtein = (profile && profile.targets && profile.targets.protein) ? profile.targets.protein : Math.round((calTarget * 0.25) / 4);
      const targetCarbs = (profile && profile.targets && profile.targets.carbs) ? profile.targets.carbs : Math.round((calTarget * 0.50) / 4);
      const targetFat = (profile && profile.targets && profile.targets.fat) ? profile.targets.fat : Math.round((calTarget * 0.25) / 9);

      const prompt = `Kamu adalah ahli gizi dan pelatih fitness profesional. Berikan evaluasi komprehensif berkala untuk user LebihFit berikut berdasarkan data asupan makanan, pola tidur, dan aktivitas olahraga mereka. Hubungkan ketiga aspek ini (makanan, tidur, olahraga) secara mendalam, kritis, dan actionable untuk mendukung program fitness mereka. Tulis dalam bahasa Indonesia gaul yang ramah (lu/kamu).

== PROFIL USER ==
Gender: ${profile.gender || '?'}, Berat: ${profile.bb || '?'}kg, Tinggi: ${profile.tb || '?'}cm, Usia: ${profile.usia || '?'}th
Target Fitness: ${profile.target || 'maintenance'}, Level Aktivitas: ${profile.aktivitas || '?'}

== DATA MAKANAN & NUTRISI RATA-RATA (Jangka Waktu Laporan: ${days} hari) ==
- Kalori harian: ${Math.round(avgCal)} kcal vs Target: ${calTarget} kcal
- Protein harian: ${avgProtein.toFixed(1)}g vs Target: ${targetProtein}g
- Karbohidrat harian: ${avgCarbs.toFixed(1)}g vs Target: ${targetCarbs}g
- Lemak harian: ${avgFat.toFixed(1)}g vs Target: ${targetFat}g
- Serat harian: ${avgFiber.toFixed(1)}g
- Gula harian: ${avgSugar.toFixed(1)}g
- Sodium harian: ${Math.round(avgSodium)}mg

== LOG MAKANAN HARIAN: ==
${foodListPrompt}

== LOG AKTIVITAS (TIDUR & OLAHRAGA) HARIAN: ==
${activityPrompt}

== FORMAT RESPONS ==
Tulis evaluasi dalam HTML VALID (TANPA markdown, TANPA code block). Struktur wajib berisi:

1. Ringkasan Evaluasi Kalori & Makro → dalam div dengan border-left tebal. Kaitkan dengan target utama user.
2. Analisis Hubungan Nutrisi + Olahraga → Bagaimana asupan kalori dan protein mendukung pemulihan otot (recovery) dan progres latihan olahraga mereka?
3. Analisis Hubungan Tidur + Nutrisi + Recovery → Bagaimana durasi dan kualitas tidur mereka mempengaruhi metabolisme tubuh, pembakaran lemak, dan pemulihan stamina?
4. Mikronutrisi (Serat/Gula/Sodium) → Analisis singkat jika ada kelebihan/kekurangan berbahaya.
5. Rekomendasi Action Plan → Berikan 3 poin konkret yang harus dilakukan minggu depan untuk meningkatkan hasil program fitness mereka (format <ul><li>).

Jangan gunakan emoji sama sekali. Gunakan desain layout HTML yang bersih, elegan, dan profesional. Gunakan warna/gaya CSS yang cocok dengan format cetakan PDF putih/terang. HANYA respons HTML VALID tanpa teks pembuka/penutup.`;

      const rawHtml = await callGroqAPI([{ role: 'user', content: prompt }], 2500);
      if (rawHtml) {
        const cleanHtml = rawHtml.trim().replace(/```html\n?/gi, '').replace(/```\n?/gi, '').trim();
        html = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;padding:6px 10px;background:rgba(94,92,230,0.08);border:1px solid rgba(94,92,230,0.2);border-radius:8px;font-size:0.75rem;color:#5e5ce6;">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <b>Analisis AI Groq Komprehensif</b> · Hubungan Nutrisi + Tidur + Olahraga · ${new Date().toLocaleDateString('id-ID')}
          </div>
          ${cleanHtml}
        `;
        await setFirebase(cachePath, { signature, html, timestamp: Date.now() });
      }
    }

    let msg = `🤖 *Analisis AI Komprehensif (${days} Hari)*\n\n`;
    if (html) {
      msg += cleanHtmlToMarkdown(html);
    } else {
      msg += `Gagal membuat analisis AI. Coba beberapa saat lagi.`;
    }

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [
          { text: '🔙 Kembali', callback_data: 'hist_panel_ai' },
          { text: '🏠 Menu Utama', callback_data: 'menu' }
        ]
      ]
    });

  } catch(err) {
    console.error('showAIHistoryDays error:', err);
    return sendMessage(chatId, 'Gagal memuat analisis AI: ' + err.message, {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'history' }]]
    });
  }
}

module.exports = { handleMessage, handleCallback };
