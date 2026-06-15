// ====================================================
// BOT HANDLERS — All logic ported from GAS
// ====================================================
const { getFirebase, setFirebase, toArray, safe, getState, setState, getCache, setCache, deleteCache, getLinkedEmail } = require('./firebase');
const { sendMessage, sendChatAction, answerCallback, editMessageText } = require('./telegram');
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
        { text: '✨ Analisis Progress', callback_data: 'progress_menu' },
        { text: '⚙️ Settings', callback_data: 'settings' }
      ],
      [
        { text: '🌐 Buka Web App', url: 'https://darderdor19.github.io/lebihfittools/' },
        { text: '💬 AI Consultant', url: 'https://darderdor19.github.io/lebihfittools/consultant.html' }
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
        { text: '❤️ Kardio', callback_data: 'act_cardio' },
        { text: '🏃 Lainnya', callback_data: 'act_other' }
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
  if (text === '/progress') {
    const email = await getLinkedEmail(userId);
    return email ? showProgressMenu(chatId, userId, email) : promptLogin(chatId, userId);
  }

  if (state === 'AWAIT_EMAIL') return onEmailInput(chatId, userId, text);
  if (state === 'AWAIT_OTP') return onOtpInput(chatId, userId, text);

  // If waiting for a photo
  if (state === 'AWAIT_FOOD_PHOTO') {
    if (msg.photo && msg.photo.length > 0) {
      return handlePhotoInput(chatId, userId, msg.photo, msg.caption);
    }
    // If user sent text instead of photo
    if (text && text.length > 0 && text !== '/start' && text !== '/menu') {
       return sendMessage(chatId, 'Tolong kirimkan gambar/foto makanannya ya, bukan teks. Atau klik batal jika ingin kembali.', {
         inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]]
       });
    }
  }

  // Physical evaluation states
  if (state === 'AWAIT_PHYSICAL_PHOTO') {
    if (msg.photo && msg.photo.length > 0) {
      return handlePhysicalPhotoInput(chatId, userId, msg.photo);
    }
    if (text && text.length > 0 && text !== '/start' && text !== '/menu') {
       return sendMessage(chatId, 'Tolong kirimkan foto tubuh/badan lu ya, bukan teks. Atau klik Batal jika ingin kembali.', {
         inline_keyboard: [[{ text: '❌ Batal', callback_data: 'progress_menu' }]]
       });
    }
  }
  if (state === 'AWAIT_PHYSICAL_DAYS') {
    if (text && text.length > 0 && text !== '/start' && text !== '/menu') {
       return sendMessage(chatId, 'Tolong pilih rentang hari riwayat data di tombol bawah ya, atau klik Batal untuk kembali.', {
         inline_keyboard: [
           [
             { text: '📅 7 Hari', callback_data: 'phys_days_7' },
             { text: '📅 14 Hari', callback_data: 'phys_days_14' },
             { text: '📅 30 Hari', callback_data: 'phys_days_30' }
           ],
           [{ text: '❌ Batal', callback_data: 'progress_menu' }]
         ]
       });
    }
  }
  if (state === 'AWAIT_PHYSICAL_DESC') {
    if (text && text.length > 0) {
      return onPhysicalDescInput(chatId, userId, text);
    }
  }

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
  
  if (state === 'AWAIT_CARDIO_NAME') return onCardioNameInput(chatId, userId, text);
  if (state === 'AWAIT_CARDIO_DUR') return onCardioDurInput(chatId, userId, text);
  if (state === 'AWAIT_CARDIO_DUR_EDIT') return onCardioDurEditInput(chatId, userId, text);
  if (state === 'AWAIT_CARDIO_DIST') return onCardioDistInput(chatId, userId, text);
  if (state === 'AWAIT_CARDIO_DIST_EDIT') return onCardioDistEditInput(chatId, userId, text);
  
  if (state === 'AWAIT_OTHER_NAME') return onOtherNameInput(chatId, userId, text);
  if (state === 'AWAIT_OTHER_DUR') return onOtherDurInput(chatId, userId, text);
  if (state === 'AWAIT_OTHER_DUR_EDIT') return onOtherDurEditInput(chatId, userId, text);

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
  if (data === 'log_food_manual') return email ? startFoodManual(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'log_food_photo') return email ? startFoodPhoto(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'food_ai_save') return saveFoodAI(chatId, userId, email);
  if (data === 'process_food_photos') return processFoodPhotos(chatId, userId);
  
  // Activities callbacks
  if (data === 'log_activity') return email ? showLogActivityOptions(chatId) : promptLogin(chatId, userId);
  if (data === 'act_sleep') return email ? startSleepWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'act_workout') return email ? startWorkoutWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'act_gym') return email ? startGymWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'act_cardio') return email ? startCardioWizard(chatId, userId) : promptLogin(chatId, userId);
  if (data === 'act_other') return email ? startOtherWizard(chatId, userId) : promptLogin(chatId, userId);
  
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

  // Cardio wizard callbacks
  if (data === 'cardio_edit_dur') return startCardioDuration(chatId, userId);
  if (data === 'cardio_edit_dist') return startCardioDistance(chatId, userId);
  if (data === 'cardio_edit_int') return promptCardioIntensity(chatId);
  if (data.startsWith('cardio_int_')) return saveCardioIntensity(chatId, userId, data.replace('cardio_int_', ''));
  if (data === 'cardio_save') return saveCardioSession(chatId, userId, email);

  // Other wizard callbacks
  if (data === 'other_edit_dur') return startOtherDuration(chatId, userId);
  if (data === 'other_edit_int') return promptOtherIntensity(chatId);
  if (data.startsWith('other_int_')) return saveOtherIntensity(chatId, userId, data.replace('other_int_', ''));
  if (data === 'other_save') return saveOtherSession(chatId, userId, email);

  // History callbacks
  if (data === 'history') return email ? showHistory(chatId, email) : promptLogin(chatId, userId);
  if (data === 'hist_panel_food') return showHistoryPanelOptions(chatId, 'food');
  if (data === 'hist_panel_act') return showHistoryPanelOptions(chatId, 'activity');
  if (data === 'hist_panel_ai') return showHistoryPanelOptions(chatId, 'ai');
  
  if (data.startsWith('hist_food_')) return showFoodHistoryDays(chatId, email, parseInt(data.replace('hist_food_', '')));
  if (data.startsWith('hist_activity_')) return showActivityHistoryDays(chatId, email, parseInt(data.replace('hist_activity_', '')));
  if (data.startsWith('hist_ai_')) return showAIHistoryDays(chatId, email, parseInt(data.replace('hist_ai_', '')));

  // Progress Analysis callbacks
  if (data === 'progress_menu') return email ? showProgressMenu(chatId, userId, email, cb.message.message_id) : promptLogin(chatId, userId);
  if (data === 'prog_toggle_food') return email ? toggleProgressConfig(chatId, userId, email, 'food', cb.message.message_id) : promptLogin(chatId, userId);
  if (data === 'prog_toggle_act') return email ? toggleProgressConfig(chatId, userId, email, 'activity', cb.message.message_id) : promptLogin(chatId, userId);
  if (data === 'prog_toggle_sleep') return email ? toggleProgressConfig(chatId, userId, email, 'sleep', cb.message.message_id) : promptLogin(chatId, userId);
  if (data === 'prog_cycle_period') return email ? toggleProgressConfig(chatId, userId, email, 'period', cb.message.message_id) : promptLogin(chatId, userId);
  if (data === 'prog_run_analysis') return email ? runProgressAnalysis(chatId, userId, email) : promptLogin(chatId, userId);
  if (data === 'prog_physical_eval') return email ? startPhysicalEvaluationBot(chatId, userId) : promptLogin(chatId, userId);
  if (data.startsWith('phys_days_')) return email ? onPhysicalDaysSelected(chatId, userId, parseInt(data.replace('phys_days_', ''))) : promptLogin(chatId, userId);
  if (data === 'phys_skip_desc') return email ? onPhysicalDescInput(chatId, userId, 'skip') : promptLogin(chatId, userId);

  if (data === 'phys_photos_done') return physPhotosDone(chatId, userId);
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
  if (data === 'manage_food_logs') return email ? showManageFoodLogs(chatId, email) : promptLogin(chatId, userId);
  if (data === 'manage_act_logs') return email ? showManageActLogs(chatId, email) : promptLogin(chatId, userId);
  if (data.startsWith('del_act_')) {
    const actId = data.replace('del_act_', '');
    return confirmDeleteAct(chatId, userId, email, actId);
  }
  if (data.startsWith('confirm_del_act_')) {
    const actId = data.replace('confirm_del_act_', '');
    return deleteActItem(chatId, userId, email, actId);
  }
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
  
  const remaining = calTarget - Math.round(total.cal);
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
  return sendMessage(chatId,
    '*Pilih Cara Log Makanan* 🍽️\n\nLu mau log makanan secara manual (ketik nama, porsi) atau pakai analisis foto AI (otomatis deteksi nutrisi)?',
    { 
      inline_keyboard: [
        [{ text: '✏️ Manual', callback_data: 'log_food_manual' }, { text: '📸 Upload Foto', callback_data: 'log_food_photo' }],
        [{ text: '❌ Batal', callback_data: 'confirm_no' }]
      ] 
    }
  );
}

async function startFoodManual(chatId, userId) {
  await setState(userId, 'AWAIT_FOOD_NAME');
  return sendMessage(chatId,
    '*Log Makanan Manual - Langkah 1 dari 3* 🍽️\n\nMakanan apa yang lu makan hari ini?\n_Contoh: nasi goreng ayam, sate kambing, pisang goreng_',
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'confirm_no' }]] }
  );
}

async function startFoodPhoto(chatId, userId) {
  await setState(userId, 'AWAIT_FOOD_PHOTO');
  return sendMessage(chatId,
    '*Log Makanan AI* 📸\n\nSilakan kirim atau *forward* foto makanan lu ke sini. AI bakal otomatis ngeanalisis nama makanan, porsi, dan estimasi gizinya.\n\n_(Pastikan fotonya jelas dan terang ya!)_',
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

// ===== GEMINI VISION API CALL =====
async function callGeminiVisionAPI(images, mimeType, prompt, jsonMode = false) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in Vercel environment variables.');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  
  const parts = [{ text: prompt }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
    });
  } else {
    parts.push({ inline_data: { mime_type: mimeType, data: images } });
  }

  const body = {
    contents: [{
      parts: parts
    }]
  };

  body.generationConfig = {
    temperature: 0.0
  };
  if (jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini API Error');
  return data.candidates[0].content.parts[0].text;
}

// ===== HANDLE PHOTO INPUT =====
async function handlePhotoInput(chatId, userId, photos, caption) {
  try {
    const largestPhoto = photos[photos.length - 1];
    const fileId = largestPhoto.file_id;
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error('Gagal mendapatkan file dari Telegram');
    
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    
    const imgRes = await fetch(fileUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    let mime = 'image/jpeg';
    if (filePath.endsWith('.png')) mime = 'image/png';
    if (filePath.endsWith('.webp')) mime = 'image/webp';

    const cacheKey = `${userId}_food_photos_arr`;
    let cachedData = await getCache(cacheKey) || {};
    cachedData[fileId] = { mime, base64 };
    await setCache(cacheKey, cachedData);

    const count = Object.keys(cachedData).length;

    let msg = `✅ Foto ke-${count} berhasil ditambahkan.\n\n`;
    if (count < 10) {
      msg += `Kirim foto lagi jika ada (maksimal 10), atau klik "Selesai & Analisis" kalau sudah semua.`;
    } else {
      msg += `Udah maksimal 10 foto nih! Klik "Selesai & Analisis" ya.`;
    }

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [{ text: '✅ Selesai & Analisis', callback_data: 'process_food_photos' }],
        [{ text: '❌ Batal', callback_data: 'log_food' }]
      ]
    });
  } catch (err) {
    console.error('Photo handler error:', err);
    return sendMessage(chatId, 'Gagal menerima foto: ' + err.message, {
      inline_keyboard: [[{ text: '🔄 Coba Lagi', callback_data: 'log_food' }]]
    });
  }
}

async function processFoodPhotos(chatId, userId) {
  try {
    await sendMessage(chatId, '⏳ Menganalisis semua foto makanan lu dengan LebihFit Tools AI. Tunggu bentar ya...');
    const cacheKey = `${userId}_food_photos_arr`;
    const cachedData = await getCache(cacheKey);
    if (!cachedData || Object.keys(cachedData).length === 0) {
      return sendMessage(chatId, 'Belum ada foto yang diunggah.', { inline_keyboard: [[{ text: 'Ulangi', callback_data: 'log_food_photo' }]] });
    }
    const images = Object.values(cachedData);
    
    const prompt = `Kamu adalah ahli gizi dan sistem analisis visual makanan yang sangat akurat dan konsisten.
Tugas kamu adalah menganalisis foto makanan yang diunggah, mengenali jenis makanannya, memperkirakan porsi/beratnya secara logis, dan menghitung estimasi kandungan nutrisinya berdasarkan database gizi ilmiah standar (seperti USDA).

Instruksi:
1. Identifikasi nama makanan dan estimasi berat/porsi makanan secara logis dari gambar.
2. Gunakan database referensi gizi standar per 100g berikut untuk menghitung secara proporsional:
   - Singkong (mentah/rebus/air-fryer tanpa minyak): 160 kcal | Karbo: 38g | Protein: 1.3g | Lemak: 0.3g | Serat: 1.8g | Gula: 1.7g | Sodium: 14mg | Kalsium: 16mg | Besi: 0.3mg | VitC: 20mg | VitD: 0mcg | Zinc: 0.3mg
   - Nasi Putih (matang): 130 kcal | Karbo: 28g | Protein: 2.7g | Lemak: 0.3g | Serat: 0.4g | Gula: 0.1g | Sodium: 1mg | Kalsium: 10mg | Besi: 1.2mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.5mg
   - Dada Ayam Fillet MENTAH (raw): 120 kcal | Karbo: 0g | Protein: 23g | Lemak: 2.5g | Serat: 0g | Gula: 0g | Sodium: 65mg | Kalsium: 10mg | Besi: 0.7mg | VitC: 0mg | VitD: 0mcg | Zinc: 0.8mg
   - Dada Ayam MATANG (rebus/panggang/air-fryer tanpa minyak): 165 kcal | Karbo: 0g | Protein: 31g | Lemak: 3.6g | Serat: 0g | Gula: 0g | Sodium: 74mg | Kalsium: 15mg | Besi: 1mg | VitC: 0mg | VitD: 0mcg | Zinc: 1mg
   - Telur Ayam (rebus, 1 butir = 50g): 78 kcal | Karbo: 0.6g | Protein: 6.3g | Lemak: 5.3g | Serat: 0g | Gula: 0.6g | Sodium: 62mg | Kalsium: 25mg | Besi: 0.9mg | VitC: 0mg | VitD: 1.1mcg | Zinc: 0.6mg
   - Minyak Goreng / Lemak (per 10g): 88 kcal, Lemak 10g (jika makanan terlihat berminyak/digoreng, wajib tambahkan estimasi minyak).
3. Metode masak "Air Fryer" atau "Air Fry" wajib dihitung sebagai TANPA MINYAK tambahan. JANGAN menambahkan kalori/lemak minyak goreng ke dalamnya.
4. ATURAN MULTI-BAHAN: Jika di piring terdapat lebih dari 1 jenis makanan (misal: dada ayam dan singkong), kalkulasikan berat dan kandungan gizi masing-masing bahan secara terpisah terlebih dahulu sebelum menjumlahkan total akhirnya. JANGAN menjumlahkan seluruh berat lalu mengalikan dengan satu jenis gizi saja.
5. Lakukan kalkulasi: (Nilai gizi per 100g) * (Estimasi Berat / 100).
6. Berikan jawaban dalam JSON dengan format berikut:
{"name":"nama makanan","portion":"estimasi porsi/berat","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0,"calcium":0,"iron":0,"vitC":0,"vitD":0,"zinc":0,"notes":"ulasan singkat analisis gizi maks 2 kalimat"}
Kembalikan HANYA JSON valid tanpa teks tambahan atau markdown.`;

    const raw = await callGeminiVisionAPI(images, null, prompt, true);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch(e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Format JSON tidak sesuai.');
    }

    await setCache(`${userId}_food_ai`, JSON.stringify(parsed));
    await setState(userId, 'AWAIT_FOOD_CONFIRM_AI');
    await deleteCache(cacheKey);

    let msg = `📸 *Hasil Analisis AI*\n\n`;
    msg += `🍽️ Makanan: *${parsed.name}*\n`;
    msg += `⚖️ Porsi: *${parsed.portion}*\n`;
    msg += `🔥 Kalori: *${parsed.cal} kcal*\n`;
    msg += `• Protein: *${parsed.protein}g*\n`;
    msg += `• Karbo: *${parsed.carbs}g*\n`;
    msg += `• Lemak: *${parsed.fat}g*\n\n`;
    msg += `📝 Catatan AI: _${parsed.notes || '-' }_\n\n`;
    msg += `Apakah lu mau nyimpen data ini?`;

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [{ text: '✅ Ya, Simpan', callback_data: 'food_ai_save' }],
        [{ text: '❌ Batal / Ulangi', callback_data: 'log_food' }]
      ]
    });
  } catch(err) {
    console.error(err);
    return sendMessage(chatId, 'Gagal memproses foto: ' + err.message, {
      inline_keyboard: [[{ text: '🔄 Ulangi', callback_data: 'log_food_photo' }]]
    });
  }
}

async function saveFoodAI(chatId, userId, email) {
  await sendMessage(chatId, '⏳ Menyimpan log makanan dari AI...');
  try {
    const rawData = await getCache(`${userId}_food_ai`);
    if (!rawData) throw new Error('Session expired.');
    const parsed = JSON.parse(rawData);

    // Save to Firebase
    const tzOffset = 7 * 60; // WIB (UTC+7)
    const localNow = new Date(Date.now() + tzOffset * 60000);
    const dateKey = localNow.toISOString().split('T')[0];

    const todayLogRef = `users/${safe(email)}/lf_logs/${dateKey}`;
    const todayLog = await getFirebase(todayLogRef) || { date: dateKey, items: [], totals: { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, calcium: 0, iron: 0, vitC: 0, vitD: 0, zinc: 0 } };

    const newItem = {
      id: uid(),
      name: parsed.name,
      portion: parsed.portion,
      desc: parsed.notes || '',
      time: 'makan_siang', // default
      cal: parsed.cal,
      protein: parsed.protein,
      carbs: parsed.carbs,
      fat: parsed.fat,
      fiber: parsed.fiber || 0,
      sugar: parsed.sugar || 0,
      sodium: parsed.sodium || 0,
      calcium: parsed.calcium || 0,
      iron: parsed.iron || 0,
      vitC: parsed.vitC || 0,
      vitD: parsed.vitD || 0,
      zinc: parsed.zinc || 0,
      aiGenerated: true
    };

    todayLog.items.push(newItem);
    todayLog.totals.cal += newItem.cal;
    todayLog.totals.protein += newItem.protein;
    todayLog.totals.carbs += newItem.carbs;
    todayLog.totals.fat += newItem.fat;
    todayLog.totals.fiber += newItem.fiber;

    await setFirebase(todayLogRef, todayLog);

    await clearState(userId);
    await deleteCache(`${userId}_food_ai`);

    return sendMessage(chatId, `✅ *Makanan Berhasil Dicatat (via AI)!*\n\n+ ${newItem.cal} kcal (${newItem.name})`, {
      inline_keyboard: [
        [{ text: '📊 Dashboard Hari Ini', callback_data: 'dashboard' }],
        [{ text: '🍽️ Log Lagi', callback_data: 'log_food' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu' }]
      ]
    });
  } catch (err) {
    console.error('saveFoodAI error:', err);
    return sendMessage(chatId, 'Gagal menyimpan data makanan: ' + err.message);
  }
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

    msg += `📝 *Ringkasan Statistik (Hari Aktif):*\n`;
    msg += `• Total Kalori: *${totalCal} kcal*\n`;
    msg += `• Rata-rata Kalori: *${avgCal} kcal/hari*\n`;
    msg += `• Kepatuhan Target: *${compliantDays}/${activeDays} hari aktif* (≤ target)\n`;
    msg += `• Hari Aktif Mencatat: *${activeDays}/${days} hari*\n`;
    msg += `• Kalori Tertinggi: *${maxCal} kcal* (${formatDateKey(maxCalDate)})\n`;
    msg += `• Kalori Terendah: *${minCal} kcal* (${formatDateKey(minCalDate)})\n\n`;

    msg += `🍎 *Total & Rata-rata Gizi:*\n`;
    msg += `• Protein: *${totalProtein.toFixed(1)}g* (Avg: *${avgProtein.toFixed(1)}g/hari*)\n`;
    msg += `• Karbohidrat: *${totalCarbs.toFixed(1)}g* (Avg: *${avgCarbs.toFixed(1)}g/hari*)\n`;
    msg += `• Lemak: *${totalFat.toFixed(1)}g* (Avg: *${avgFat.toFixed(1)}g/hari*)\n`;
    msg += `• Serat: *${totalFiber.toFixed(1)}g* (Avg: *${avgFiber.toFixed(1)}g/hari*)\n`;

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
  return sendMessage(chatId,
    '✏️ *Kelola Log Hari Ini*\n\nPilih tipe log yang ingin lu kelola di bawah ini:',
    {
      inline_keyboard: [
        [{ text: '🍽️ Kelola Log Makanan', callback_data: 'manage_food_logs' }],
        [{ text: '💪 Kelola Log Aktivitas', callback_data: 'manage_act_logs' }],
        [{ text: '📊 Dashboard', callback_data: 'dashboard' }]
      ]
    }
  );
}

async function showManageFoodLogs(chatId, email) {
  const today = todayKey();
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);

  if (logs.length === 0) {
    return sendMessage(chatId,
      '✏️ *Kelola Log Makanan*\n\nBelum ada makanan tercatat hari ini.',
      {
        inline_keyboard: [
          [{ text: '🍽️ Log Makanan Baru', callback_data: 'log_food' }],
          [{ text: '⬅️ Kembali', callback_data: 'manage_logs' }]
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
    { text: '⬅️ Kembali', callback_data: 'manage_logs' }
  ]);

  return sendMessage(chatId, msg, { inline_keyboard });
}

async function showManageActLogs(chatId, email) {
  const today = todayKey();
  const rawActs = await getFirebase(`users/${safe(email)}/lf_activities/${today}`);
  const acts = toArray(rawActs);

  if (acts.length === 0) {
    return sendMessage(chatId,
      '✏️ *Kelola Log Aktivitas*\n\nBelum ada aktivitas tercatat hari ini.',
      {
        inline_keyboard: [
          [{ text: '🏃 Catat Kegiatan Baru', callback_data: 'log_activity' }],
          [{ text: '⬅️ Kembali', callback_data: 'manage_logs' }]
        ]
      }
    );
  }

  let msg = '✏️ *Kelola Log Aktivitas Hari Ini*\n\nPilih aktivitas di bawah yang ingin lu hapus:\n';
  const inline_keyboard = [];

  acts.forEach((act, index) => {
    let typeLabel = act.type;
    let detail = '';
    
    if (act.type === 'workout') {
      typeLabel = '💪 Workout';
      detail = (act.exercises || []).map(e => `${e.name} (${(e.sets || []).length}s)`).join(', ');
    } else if (act.type === 'gym') {
      typeLabel = '🏋️ Gym';
      detail = (act.muscles || []).map(m => m.muscle).join(', ');
    } else if (act.type === 'cardio') {
      typeLabel = '❤️ Kardio';
      detail = `${act.name} · ${act.durationMin}m`;
    } else if (act.type === 'other') {
      typeLabel = '🏃 Lainnya';
      detail = `${act.name} · ${act.durationMin}m`;
    } else if (act.type === 'sleep') {
      typeLabel = '😴 Tidur';
      detail = `${act.hours} jam · ${act.quality}`;
    }

    msg += `\n*${index + 1}. ${typeLabel}*\n${escapeMarkdown(detail)}\n`;
    if (act.burn) {
      msg += `Kalori terbakar: *${Math.round(act.burn.kcal)} kcal*\n`;
    }

    inline_keyboard.push([
      { text: `🗑️ Hapus ${typeLabel}`, callback_data: `del_act_${act.id}` }
    ]);
  });

  inline_keyboard.push([
    { text: '⬅️ Kembali', callback_data: 'manage_logs' }
  ]);

  return sendMessage(chatId, msg, { inline_keyboard });
}

async function confirmDeleteAct(chatId, userId, email, actId) {
  const today = todayKey();
  const rawActs = await getFirebase(`users/${safe(email)}/lf_activities/${today}`);
  const acts = toArray(rawActs);
  const act = acts.find(a => a.id === actId);

  if (!act) {
    return sendMessage(chatId, 'Aktivitas tidak ditemukan atau sudah dihapus.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_act_logs' }]]
    });
  }

  let typeLabel = act.type === 'workout' ? 'Workout' : act.type === 'gym' ? 'Gym' : act.type === 'cardio' ? 'Kardio' : act.type === 'other' ? 'Lainnya' : 'Tidur';

  return sendMessage(chatId,
    `Apakah lu yakin ingin menghapus log aktivitas *${typeLabel}*?`,
    {
      inline_keyboard: [
        [
          { text: '🗑️ Ya, Hapus', callback_data: `confirm_del_act_${actId}` },
          { text: '❌ Batal', callback_data: 'manage_act_logs' }
        ]
      ]
    }
  );
}

async function deleteActItem(chatId, userId, email, actId) {
  const today = todayKey();
  const actsPath = `users/${safe(email)}/lf_activities/${today}`;
  const rawActs = await getFirebase(actsPath);
  
  if (rawActs && typeof rawActs === 'object') {
    if (rawActs[actId]) {
      delete rawActs[actId];
      await setFirebase(actsPath, rawActs);
    } else {
      let found = false;
      for (const k in rawActs) {
        if (rawActs[k] && (rawActs[k].id === actId || rawActs[k].id === actId)) {
          delete rawActs[k];
          found = true;
        }
      }
      if (found) {
        await setFirebase(actsPath, rawActs);
      }
    }
  }

  await sendMessage(chatId, '✅ Aktivitas berhasil dihapus!');
  return showManageActLogs(chatId, email);
}

async function confirmDeleteLog(chatId, userId, email, logId) {
  const today = todayKey();
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);
  const item = logs.find(l => l.id === logId);

  if (!item) {
    return sendMessage(chatId, 'Makanan tidak ditemukan atau sudah dihapus.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_food_logs' }]]
    });
  }

  return sendMessage(chatId,
    `Apakah lu yakin ingin menghapus makanan *${escapeMarkdown(item.name)}* (${escapeMarkdown(item.portion)})?`,
    {
      inline_keyboard: [
        [
          { text: '🗑️ Ya, Hapus', callback_data: `confirm_del_${logId}` },
          { text: '❌ Batal', callback_data: 'manage_food_logs' }
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
  return showManageFoodLogs(chatId, email);
}

async function startEditLogWizard(chatId, userId, email, logId) {
  const today = todayKey();
  const rawLogs = await getFirebase(`users/${safe(email)}/lf_logs/${today}`);
  const logs = toArray(rawLogs);
  const item = logs.find(l => l.id === logId);

  if (!item) {
    return sendMessage(chatId, 'Makanan tidak ditemukan.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_food_logs' }]]
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
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'manage_food_logs' }]] }
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
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'manage_food_logs' }]] }
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
        [{ text: '❌ Batal', callback_data: 'manage_food_logs' }]
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
          { text: '❌ Batal', callback_data: 'manage_food_logs' }
        ]
      ]
    });

  } catch (err) {
    console.error('onEditDescInput error:', err);
    await deleteEditCache(userId);
    return sendMessage(chatId, 'Gagal analisis AI: ' + err.message, {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_food_logs' }]]
    });
  }
}

async function saveEditedLog(chatId, userId, email) {
  const rawResult = await getCache(`${userId}_editing_result`);
  if (!rawResult) {
    await deleteEditCache(userId);
    return sendMessage(chatId, 'Data expired. Silakan edit ulang.', {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'manage_food_logs' }]]
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
  return showManageFoodLogs(chatId, email);
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

const MET_WORKOUT = { low: 3.5, medium: 5.0, high: 6.0 };
const MET_GYM     = { low: 3.5, medium: 5.0, high: 6.0 };
const MET_CARDIO  = { low: 3.0, medium: 5.0, high: 8.3 };
const MET_OTHER   = { low: 3.0, medium: 5.0, high: 6.0 };

function calcBurnedCalories(met, durationMin, weight = 70, intensity = 'medium') {
  const kcal = met * weight * (durationMin / 60);
  
  // Dynamic ratio based on intensity
  let fatRatio = 0.30;
  let carbRatio = 0.65;
  let proteinRatio = 0.05;
  
  if (intensity === 'low') {
    fatRatio = 0.40;
    carbRatio = 0.55;
  } else if (intensity === 'high') {
    fatRatio = 0.20;
    carbRatio = 0.75;
  }

  const fatG    = (kcal * fatRatio) / 9;
  const carbG   = (kcal * carbRatio) / 4;
  const proteinG= (kcal * proteinRatio) / 4;
  
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
async function callGroqAPI(messages, maxTokens = 2500, jsonMode = false) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY env variable is not set');
  const body = {
    model: 'llama3-70b-8192',
    messages,
    max_tokens: maxTokens,
    temperature: 0
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
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
  str = str.replace(/[*_`\[]/g, '\\$&');
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
  const burn = calcBurnedCalories(MET_WORKOUT[draft.intensity], draft.durationMin, weight, draft.intensity);

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
  const burn = calcBurnedCalories(MET_GYM[draft.intensity], draft.durationMin, weight, draft.intensity);

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
    let totalCardio = 0;
    let totalOther = 0;
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
        } else if (a.type === 'cardio') {
          totalCardio++;
          if (a.burn) totalBurned += a.burn.kcal || 0;
        } else if (a.type === 'other') {
          totalOther++;
          if (a.burn) totalBurned += a.burn.kcal || 0;
        } else if (a.type === 'sleep') {
          totalSleeps++;
          totalSleepHours += a.hours || 0;
          if (a.quality) sleepQualities[a.quality] = (sleepQualities[a.quality] || 0) + 1;
        }
      });
    });

    if (totalWorkouts === 0 && totalGyms === 0 && totalCardio === 0 && totalOther === 0 && totalSleeps === 0) {
      return sendMessage(chatId, `Belum ada kegiatan olahraga atau tidur tercatat dalam ${days} hari terakhir.`, {
        inline_keyboard: [
          [{ text: '🏃 Catat Kegiatan Baru', callback_data: 'log_activity' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu' }]
        ]
      });
    }

    const avgSleep = totalSleeps > 0 ? (totalSleepHours / totalSleeps).toFixed(1) : 0;
    const totalSessions = totalWorkouts + totalGyms + totalCardio + totalOther;
    const avgBurn = totalSessions > 0 ? Math.round(totalBurned / totalSessions) : 0;

    const avgBurnPerDay = Math.round(totalBurned / days);

    let msg = `🏃 *Riwayat Kegiatan ${days} Hari Terakhir*\n\n`;
    msg += `📝 *Statistik Ringkas:*\n`;
    msg += `• Total Workout: *${totalWorkouts}x sesi*\n`;
    msg += `• Total Gym: *${totalGyms}x sesi*\n`;
    msg += `• Total Kardio: *${totalCardio}x sesi*\n`;
    msg += `• Sesi Lainnya: *${totalOther}x sesi*\n`;
    msg += `• Total Tidur: *${totalSleepHours.toFixed(1)} jam* (${totalSleeps} entri, Rerata: *${avgSleep}j/hari*)\n`;
    if (totalSleeps > 0) {
      msg += `  _(Lelap: ${sleepQualities.lelap}x, Biasa: ${sleepQualities.biasa}x, Kurang: ${sleepQualities.kurang}x)_\n`;
    }
    msg += `• Total Kalori Terbakar: *${totalBurned} kcal* (Rerata: *${avgBurnPerDay} kcal/hari*)\n`;

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
        } else if (a.type === 'cardio') {
          msg += `  - ❤️ Kardio: ${escapeMarkdown(a.name)} · ${a.durationMin}m${a.distanceKm ? ` · ${a.distanceKm}km` : ''} (${a.burn ? a.burn.kcal : 0} kcal)\n`;
        } else if (a.type === 'other') {
          msg += `  - 🏃 Lainnya: ${escapeMarkdown(a.name)} · ${a.durationMin}m (${a.burn ? a.burn.kcal : 0} kcal)\n`;
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
      await sendMessage(chatId, `🤖 *Menghubungi LebihFit Tools AI...*\nMemproses data riwayat ${days} hari untuk membuat analisis komprehensif. Harap tunggu sebentar...`, null);
      
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
          if (a.type === 'cardio') return `Kardio: ${a.name} (${a.durationMin}m)`;
          if (a.type === 'other') return `Aktivitas Lainnya: ${a.name} (${a.durationMin}m)`;
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
            <b>Analisis LebihFit Tools AI Komprehensif</b> · Hubungan Nutrisi + Tidur + Olahraga · ${new Date().toLocaleDateString('id-ID')}
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

// CARDIO WIZARD
async function startCardioWizard(chatId, userId) {
  await setState(userId, 'AWAIT_CARDIO_NAME');
  await setCache(`${userId}_activity`, { type: 'cardio', name: '', durationMin: 30, distanceKm: 0, intensity: 'medium' });
  return sendMessage(chatId, '❤️ *Mencatat Sesi Kardio*\n\nMasukkan nama aktivitas kardio (contoh: Lari Pagi, Sepeda Santai, Renang):');
}

async function onCardioNameInput(chatId, userId, text) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.name = text;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_CARDIO_DUR');
  return sendMessage(chatId, `Berapa menit durasi *${escapeMarkdown(text)}*?\n\nMasukkan angka durasi dalam menit (contoh: 30):`);
}

async function onCardioDurInput(chatId, userId, text) {
  const dur = parseInt(text);
  if (isNaN(dur) || dur <= 0) {
    return sendMessage(chatId, '⚠️ Durasi harus berupa angka bulat positif. Coba masukkan lagi:');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  draft.durationMin = dur;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_CARDIO_DIST');
  return sendMessage(chatId, 'Masukkan jarak tempuh (dalam km, masukkan 0 jika tidak ada / tidak diukur, contoh: 5.2 atau 0):');
}

async function onCardioDistInput(chatId, userId, text) {
  const dist = parseFloat(text.replace(',', '.'));
  if (isNaN(dist) || dist < 0) {
    return sendMessage(chatId, '⚠️ Jarak harus berupa angka desimal positif or 0. Coba masukkan lagi:');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  draft.distanceKm = dist;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_CARDIO_MENU');
  return showCardioDraftMenu(chatId, userId, draft);
}

async function showCardioDraftMenu(chatId, userId, draft) {
  const intLabel = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' }[draft.intensity];
  let msg = `❤️ *Ringkasan Kardio Harian*\n\n`;
  msg += `• Nama Aktivitas: *${escapeMarkdown(draft.name)}*\n`;
  msg += `• Durasi: *${draft.durationMin} menit*\n`;
  msg += `• Jarak: *${draft.distanceKm ? `${draft.distanceKm} km` : 'Tidak dicatat'}*\n`;

  const nameLower = (draft.name || '').toLowerCase();
  const isStepsCardio = nameLower.includes('lari') || 
                        nameLower.includes('jalan') || 
                        nameLower.includes('treadmill') || 
                        nameLower.includes('walk') || 
                        nameLower.includes('run');

  if (isStepsCardio && draft.distanceKm > 0) {
    const email = await getLinkedEmail(userId);
    let strideM = 0.7;
    if (email) {
      const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
      if (profile && profile.strideLengthM) {
        strideM = parseFloat(profile.strideLengthM);
      }
    }
    const steps = Math.round((draft.distanceKm * 1000) / strideM);
    msg += `• Estimasi Langkah: *🚶 ${steps.toLocaleString('id-ID')} langkah*\n`;
  }

  msg += `• Intensitas: *${intLabel}*\n`;

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: '⏱️ Ubah Durasi', callback_data: 'cardio_edit_dur' },
        { text: '🏃 Ubah Jarak', callback_data: 'cardio_edit_dist' }
      ],
      [
        { text: '⚙️ Ubah Intensitas', callback_data: 'cardio_edit_int' },
        { text: '💾 Simpan Sesi', callback_data: 'cardio_save' }
      ],
      [
        { text: '❌ Batal', callback_data: 'menu' }
      ]
    ]
  });
}

async function startCardioDuration(chatId, userId) {
  await setState(userId, 'AWAIT_CARDIO_DUR_EDIT');
  return sendMessage(chatId, 'Masukkan estimasi durasi kardio dalam menit (contoh: 45):');
}

async function onCardioDurEditInput(chatId, userId, text) {
  const dur = parseInt(text);
  if (isNaN(dur) || dur <= 0) {
    return sendMessage(chatId, '⚠️ Durasi harus berupa angka bulat positif. Coba masukkan lagi:');
  }
  const draft = await getCache(`${userId}_activity`) || {};
  draft.durationMin = dur;
  await setCache(`${userId}_activity`, draft);
  await setState(userId, 'AWAIT_CARDIO_MENU');
  return showCardioDraftMenu(chatId, userId, draft);
}

async function startCardioDistance(chatId, userId) {
  await setState(userId, 'AWAIT_CARDIO_DIST_EDIT');
  return sendMessage(chatId, 'Masukkan jarak tempuh (dalam km, contoh: 5.5):');
}

async function onCardioDistEditInput(chatId, userId, text) {
  const dist = parseFloat(text.replace(',', '.'));
  if (isNaN(dist) || dist < 0) {
    return sendMessage(chatId, '⚠️ Jarak harus berupa angka desimal positif or 0. Coba masukkan lagi:');
  }
  const draft = await getCache(`${userId}_activity`) || {};
  draft.distanceKm = dist;
  await setCache(`${userId}_activity`, draft);
  await setState(userId, 'AWAIT_CARDIO_MENU');
  return showCardioDraftMenu(chatId, userId, draft);
}

async function promptCardioIntensity(chatId) {
  return sendMessage(chatId, 'Pilih intensitas latihan kardio:', {
    inline_keyboard: [
      [
        { text: '🟢 Ringan (MET 4.5)', callback_data: 'cardio_int_low' },
        { text: '🟡 Sedang (MET 7.0)', callback_data: 'cardio_int_medium' }
      ],
      [
        { text: '🔴 Tinggi (MET 9.5)', callback_data: 'cardio_int_high' }
      ]
    ]
  });
}

async function saveCardioIntensity(chatId, userId, val) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.intensity = val;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_CARDIO_MENU');
  return showCardioDraftMenu(chatId, userId, draft);
}

async function saveCardioSession(chatId, userId, email) {
  const draft = await getCache(`${userId}_activity`) || {};
  await setState(userId, null);
  await deleteCache(`${userId}_activity`);

  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const weight = (profile && profile.bb) ? parseFloat(profile.bb) : 70;
  const burn = calcBurnedCalories(MET_CARDIO[draft.intensity], draft.durationMin, weight, draft.intensity);

  const today = todayKey();
  const actId = generateId();
  const cardioActivity = {
    id: actId,
    type: 'cardio',
    name: draft.name,
    durationMin: draft.durationMin,
    distanceKm: draft.distanceKm || 0,
    intensity: draft.intensity,
    burn: burn,
    date: today,
    timestamp: Date.now()
  };

  await setFirebase(`users/${safe(email)}/lf_activities/${today}/${actId}`, cardioActivity);

  // Invalidate AI cache for today
  const safeEmail = safe(email);
  await setFirebase(`users/${safeEmail}/ai_daily_sig_${safeEmail}_${today}`, null);

  const nameLower = (draft.name || '').toLowerCase();
  const isStepsCardio = nameLower.includes('lari') || 
                        nameLower.includes('jalan') || 
                        nameLower.includes('treadmill') || 
                        nameLower.includes('walk') || 
                        nameLower.includes('run');

  let msg = `✅ *Sesi Kardio Berhasil Disimpan!*\n\n`;
  msg += `• Aktivitas: *${escapeMarkdown(draft.name)}*\n`;
  msg += `• Durasi: *${draft.durationMin} menit*\n`;
  if (draft.distanceKm) {
    msg += `• Jarak: *${draft.distanceKm} km*\n`;
    if (isStepsCardio) {
      const strideM = (profile && profile.strideLengthM) ? parseFloat(profile.strideLengthM) : 0.7;
      const steps = Math.round((draft.distanceKm * 1000) / strideM);
      msg += `• Estimasi Langkah: *🚶 ${steps.toLocaleString('id-ID')} langkah*\n`;
    }
  }
  msg += `• Estimasi Kalori Terbakar: *${burn.kcal} kcal*\n`;
  msg += `  _(Lemak: ${burn.fatG}g, Karbo: ${burn.carbG}g, Protein: ${burn.proteinG}g)_`;

  return sendMessage(chatId, msg, mainMenuKeyboard());
}

// OTHER ACTIVITY WIZARD
async function startOtherWizard(chatId, userId) {
  await setState(userId, 'AWAIT_OTHER_NAME');
  await setCache(`${userId}_activity`, { type: 'other', name: '', durationMin: 30, intensity: 'medium' });
  return sendMessage(chatId, '🏃 *Mencatat Aktivitas Lainnya*\n\nMasukkan nama aktivitas (contoh: Badminton, Futsal, Yoga, Basket):');
}

async function onOtherNameInput(chatId, userId, text) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.name = text;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_OTHER_DUR');
  return sendMessage(chatId, `Berapa menit durasi *${escapeMarkdown(text)}*?\n\nMasukkan angka durasi dalam menit (contoh: 45):`);
}

async function onOtherDurInput(chatId, userId, text) {
  const dur = parseInt(text);
  if (isNaN(dur) || dur <= 0) {
    return sendMessage(chatId, '⚠️ Durasi harus berupa angka bulat positif. Coba masukkan lagi:');
  }

  const draft = await getCache(`${userId}_activity`) || {};
  draft.durationMin = dur;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_OTHER_MENU');
  return showOtherDraftMenu(chatId, draft);
}

async function showOtherDraftMenu(chatId, draft) {
  const intLabel = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' }[draft.intensity];
  let msg = `🏃 *Ringkasan Aktivitas Harian*\n\n`;
  msg += `• Nama Aktivitas: *${escapeMarkdown(draft.name)}*\n`;
  msg += `• Durasi: *${draft.durationMin} menit*\n`;
  msg += `• Intensitas: *${intLabel}*\n`;

  return sendMessage(chatId, msg, {
    inline_keyboard: [
      [
        { text: '⏱️ Ubah Durasi', callback_data: 'other_edit_dur' },
        { text: '⚙️ Ubah Intensitas', callback_data: 'other_edit_int' }
      ],
      [
        { text: '💾 Simpan Sesi', callback_data: 'other_save' }
      ],
      [
        { text: '❌ Batal', callback_data: 'menu' }
      ]
    ]
  });
}

async function startOtherDuration(chatId, userId) {
  await setState(userId, 'AWAIT_OTHER_DUR_EDIT');
  return sendMessage(chatId, 'Masukkan estimasi durasi aktivitas dalam menit (contoh: 45):');
}

async function onOtherDurEditInput(chatId, userId, text) {
  const dur = parseInt(text);
  if (isNaN(dur) || dur <= 0) {
    return sendMessage(chatId, '⚠️ Durasi harus berupa angka bulat positif. Coba masukkan lagi:');
  }
  const draft = await getCache(`${userId}_activity`) || {};
  draft.durationMin = dur;
  await setCache(`${userId}_activity`, draft);
  await setState(userId, 'AWAIT_OTHER_MENU');
  return showOtherDraftMenu(chatId, draft);
}

async function promptOtherIntensity(chatId) {
  return sendMessage(chatId, 'Pilih intensitas latihan:', {
    inline_keyboard: [
      [
        { text: '🟢 Ringan (MET 3.5)', callback_data: 'other_int_low' },
        { text: '🟡 Sedang (MET 5.5)', callback_data: 'other_int_medium' }
      ],
      [
        { text: '🔴 Tinggi (MET 7.5)', callback_data: 'other_int_high' }
      ]
    ]
  });
}

async function saveOtherIntensity(chatId, userId, val) {
  const draft = await getCache(`${userId}_activity`) || {};
  draft.intensity = val;
  await setCache(`${userId}_activity`, draft);

  await setState(userId, 'AWAIT_OTHER_MENU');
  return showOtherDraftMenu(chatId, draft);
}

async function saveOtherSession(chatId, userId, email) {
  const draft = await getCache(`${userId}_activity`) || {};
  await setState(userId, null);
  await deleteCache(`${userId}_activity`);

  const profile = await getFirebase(`users/${safe(email)}/lf_profile`);
  const weight = (profile && profile.bb) ? parseFloat(profile.bb) : 70;
  const burn = calcBurnedCalories(MET_OTHER[draft.intensity], draft.durationMin, weight, draft.intensity);

  const today = todayKey();
  const actId = generateId();
  const otherActivity = {
    id: actId,
    type: 'other',
    name: draft.name,
    durationMin: draft.durationMin,
    intensity: draft.intensity,
    burn: burn,
    date: today,
    timestamp: Date.now()
  };

  await setFirebase(`users/${safe(email)}/lf_activities/${today}/${actId}`, otherActivity);

  // Invalidate AI cache for today
  const safeEmail = safe(email);
  await setFirebase(`users/${safeEmail}/ai_daily_sig_${safeEmail}_${today}`, null);

  let msg = `✅ *Sesi Aktivitas Berhasil Disimpan!*\n\n`;
  msg += `• Aktivitas: *${escapeMarkdown(draft.name)}*\n`;
  msg += `• Durasi: *${draft.durationMin} menit*\n`;
  msg += `• Estimasi Kalori Terbakar: *${burn.kcal} kcal*\n`;
  msg += `  _(Lemak: ${burn.fatG}g, Karbo: ${burn.carbG}g, Protein: ${burn.proteinG}g)_`;

  return sendMessage(chatId, msg, mainMenuKeyboard());
}

// ====================================================
// PROGRESS ANALYSIS AI FUNCTIONS
// ====================================================
async function getProgressConfig(userId) {
  let cfg = await getFirebase(`telegram_progress_config/${userId}`);
  if (!cfg) {
    cfg = { food: true, activity: true, sleep: true, period: 7 };
    await setFirebase(`telegram_progress_config/${userId}`, cfg);
  }
  if (cfg.food === undefined) cfg.food = true;
  if (cfg.activity === undefined) cfg.activity = true;
  if (cfg.sleep === undefined) cfg.sleep = true;
  if (cfg.period === undefined) cfg.period = 7;
  return cfg;
}

async function setProgressConfig(userId, config) {
  await setFirebase(`telegram_progress_config/${userId}`, config);
}

async function showProgressMenu(chatId, userId, email, editMessageId = null) {
  const config = await getProgressConfig(userId);
  
  let msg = `✨ *Analisis Progress AI LebihFit*\n\n` +
            `Pilih tipe data yang ingin lu analisis (lu bisa pilih satu-satu, kombinasi, atau sekaligus semua):\n\n` +
            `🍽️ Makanan & Gizi: ${config.food ? '✅ *Aktif*' : '❌ *Nonaktif*'}\n` +
            `🏃 Kegiatan & Olahraga: ${config.activity ? '✅ *Aktif*' : '❌ *Nonaktif*'}\n` +
            `😴 Istirahat & Tidur: ${config.sleep ? '✅ *Aktif*' : '❌ *Nonaktif*'}\n\n` +
            `📅 Periode Analisis: *${config.period === 1 ? 'Hari Ini' : config.period + ' Hari Terakhir'}*\n\n` +
            `Tekan tombol di bawah untuk toggle pilihan atau langsung mulai analisis AI.`;
            
  const keyboard = {
    inline_keyboard: [
      [
        { text: `${config.food ? '✅' : '❌'} Makanan & Gizi`, callback_data: 'prog_toggle_food' }
      ],
      [
        { text: `${config.activity ? '✅' : '❌'} Kegiatan & Olahraga`, callback_data: 'prog_toggle_act' }
      ],
      [
        { text: `${config.sleep ? '✅' : '❌'} Istirahat & Tidur`, callback_data: 'prog_toggle_sleep' }
      ],
      [
        { text: `📅 Periode: ${config.period === 1 ? 'Hari Ini' : config.period + ' Hari'}`, callback_data: 'prog_cycle_period' }
      ],
      [
        { text: '✨ Mulai Analisis Progress AI', callback_data: 'prog_run_analysis' }
      ],
      [
        { text: '📸 Evaluasi Fisik via Foto', callback_data: 'prog_physical_eval' }
      ],
      [
        { text: '🏠 Menu Utama', callback_data: 'menu' }
      ]
    ]
  };

  if (editMessageId) {
    return editMessageText(chatId, editMessageId, msg, keyboard);
  } else {
    return sendMessage(chatId, msg, keyboard);
  }
}

async function toggleProgressConfig(chatId, userId, email, field, messageId) {
  const config = await getProgressConfig(userId);
  if (field === 'period') {
    if (config.period === 1) config.period = 7;
    else if (config.period === 7) config.period = 14;
    else if (config.period === 14) config.period = 30;
    else config.period = 1;
  } else {
    config[field] = !config[field];
  }
  await setProgressConfig(userId, config);
  return showProgressMenu(chatId, userId, email, messageId);
}

async function runProgressAnalysis(chatId, userId, email) {
  const config = await getProgressConfig(userId);
  
  if (!config.food && !config.activity && !config.sleep) {
    return sendMessage(chatId, '⚠️ *Perhatian:* Silakan pilih minimal satu tipe analisis (Makanan, Kegiatan, atau Tidur) sebelum memulai analisis.');
  }

  await sendChatAction(chatId, 'typing');
  
  const days = config.period;
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

    // Validate if data exists for the selected configurations
    let hasData = false;
    if (config.food) {
      const foodCount = results.reduce((acc, r) => acc + r.logs.length, 0);
      if (foodCount > 0) hasData = true;
    }
    if (config.activity) {
      const actCount = results.reduce((acc, r) => acc + r.acts.filter(a => a.type !== 'sleep').length, 0);
      if (actCount > 0) hasData = true;
    }
    if (config.sleep) {
      const sleepCount = results.reduce((acc, r) => acc + r.acts.filter(a => a.type === 'sleep').length, 0);
      if (sleepCount > 0) hasData = true;
    }

    if (!hasData) {
      return sendMessage(chatId, `⚠️ *Tidak ada data* pada periode *${days} hari terakhir* untuk tipe analisis yang lu pilih.\n\nCoba catat makanan/kegiatan lu dulu atau ubah rentang periodenya.`);
    }

    // Show loading message
    const loadingMsg = await sendMessage(chatId, `🤖 *Menghubungi LebihFit Tools AI...*\nMemproses data progress lu selama ${days} hari terakhir untuk membuat analisis progress AI. Harap tunggu sebentar...`);
    const loadingMsgId = loadingMsg && loadingMsg.result ? loadingMsg.result.message_id : null;

    // Build the AI Prompt based on selected types
    const activeDays = results.filter(d => d.logs.length > 0).length || 1;
    
    let avgCal = 0, avgProtein = 0, avgCarbs = 0, avgFat = 0, avgFiber = 0, avgSugar = 0, avgSodium = 0;
    let avgCalcium = 0, avgIron = 0, avgVitC = 0, avgVitD = 0, avgZinc = 0;
    
    if (config.food) {
      const totalCal = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.cal || 0), 0), 0);
      const totalProtein = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.protein || 0), 0), 0);
      const totalCarbs = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.carbs || 0), 0), 0);
      const totalFat = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.fat || 0), 0), 0);
      const totalFiber = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.fiber || 0), 0), 0);
      const totalSugar = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.sugar || 0), 0), 0);
      const totalSodium = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.sodium || 0), 0), 0);
      const totalCalcium = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.calcium || 0), 0), 0);
      const totalIron = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.iron || 0), 0), 0);
      const totalVitC = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.vitC || 0), 0), 0);
      const totalVitD = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.vitD || 0), 0), 0);
      const totalZinc = results.reduce((s, d) => s + d.logs.reduce((sum, i) => sum + (i.zinc || 0), 0), 0);

      avgCal = totalCal / activeDays;
      avgProtein = totalProtein / activeDays;
      avgCarbs = totalCarbs / activeDays;
      avgFat = totalFat / activeDays;
      avgFiber = totalFiber / activeDays;
      avgSugar = totalSugar / activeDays;
      avgSodium = totalSodium / activeDays;
      avgCalcium = totalCalcium / activeDays;
      avgIron = totalIron / activeDays;
      avgVitC = totalVitC / activeDays;
      avgVitD = totalVitD / activeDays;
      avgZinc = totalZinc / activeDays;
    }

    let activitiesSummary = '';
    results.forEach(d => {
        const dayActs = d.acts || [];
        if (dayActs.length > 0) {
            activitiesSummary += `Tanggal ${d.date}:\n`;
            dayActs.forEach(a => {
                if (a.type === 'gym') {
                    activitiesSummary += `- Gym: Otot ${(a.muscles || []).map(m => m.muscle).join(', ')}\n`;
                    (a.muscles || []).forEach(m => {
                        (m.variations || []).forEach(v => {
                            const setsStr = (v.sets || []).map(s => `${s.reps} reps @ ${s.weight}kg`).join(', ');
                            activitiesSummary += `  * ${v.name || 'Gerakan'}: ${setsStr}\n`;
                        });
                    });
                } else if (a.type === 'workout') {
                    activitiesSummary += `- Workout:\n`;
                    (a.exercises || []).forEach(ex => {
                        const setsStr = (ex.sets || []).map(s => `${s.reps} reps @ ${s.weight}kg`).join(', ');
                        activitiesSummary += `  * ${ex.name}: ${setsStr}\n`;
                    });
                } else if (a.type === 'cardio') {
                    activitiesSummary += `- Kardio: ${a.name}, ${a.durationMin} m, ${a.distanceKm || '--'} km, Intensitas ${a.intensity}, Burn ${a.burn?.kcal || 0} kcal\n`;
                } else if (a.type === 'sleep') {
                    activitiesSummary += `- Tidur: ${a.hours} jam, Kualitas ${a.quality}\n`;
                } else if (a.type === 'other') {
                    activitiesSummary += `- Aktivitas Lain: ${a.name}, ${a.durationMin} m, Intensitas ${a.intensity}, Burn ${a.burn?.kcal || 0} kcal\n`;
                }
            });
        }
    });

    const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);
    const targetProtein = (profile && profile.targets && profile.targets.protein) ? profile.targets.protein : Math.round((calTarget * 0.25) / 4);

    let prompt = `Kamu adalah AI Personal Coach, ahli gizi, dan pelatih fitness profesional yang asik, cerdas, dan bersahabat.
Analisis data LebihFit berikut selama ${days} hari terakhir dan kembalikan respons dalam format JSON valid (dan HANYA JSON valid).

== PROFIL USER ==
- Gender: ${(profile && profile.gender) || '?'}, BB: ${(profile && profile.bb) || '?'} kg, TB: ${(profile && profile.tb) || '?'} cm, Usia: ${(profile && profile.usia) || '?'} tahun
- Goal Target: ${(profile && profile.target) || 'maintenance'}, Level Aktivitas: ${(profile && profile.aktivitas) || '?'}
- Target Kalori Harian: ${calTarget} kcal
- Target Protein Harian: ${targetProtein} g
- Target Berat Badan: ${(profile && profile.targetBb) || (profile && profile.bb) || '?'} kg
- Body Fat saat ini: ${(profile && profile.bodyFat) || '?'} %
- Catatan Tambahan Profil: ${(profile && profile.catatan) || '-'}

== DATA ASUPAN MAKANAN HARIANS (RATA-RATA) ==
- Kalori: ${Math.round(avgCal)} kcal/hari
- Protein: ${avgProtein.toFixed(1)} g/hari
- Karbohidrat: ${avgCarbs.toFixed(1)} g/hari
- Lemak: ${avgFat.toFixed(1)} g/hari
- Serat: ${avgFiber.toFixed(1)} g/hari
- Gula: ${avgSugar.toFixed(1)} g/hari
- Sodium: ${avgSodium.toFixed(1)} mg/hari
- Kalsium: ${avgCalcium.toFixed(1)} mg/hari
- Besi: ${avgIron.toFixed(1)} mg/hari
- Vitamin C: ${avgVitC.toFixed(1)} mg/hari
- Vitamin D: ${avgVitD.toFixed(1)} mcg/hari
- Zinc: ${avgZinc.toFixed(1)} mg/hari

== DATA KEGIATAN & ISTIRAHAT ==
${activitiesSummary}

== INSTRUKSI KALKULASI & ATURAN ANALISIS ==
1. Hitung skorHarian (0-100) untuk nutrisi, protein, recovery (tidur vs intensitas latihan), aktivitas, dan konsistensi. Berikan status: "Sangat Baik" (85-100), "Perlu Perbaikan" (70-84), "Bermasalah" (<70).
2. Tentukan statusGoal sesuai goal target (misal: "Cutting Agresif"). Tandai checklist yang sudah atau belum tercapai (defisit kalori, protein, aktivitas, tidur). Estimasi probabilitas keberhasilan besok.
3. Hitung prediksiBerat: hitung rata-rata surplus/defisit harian (TDEE - Kalori makan + Kalori bakar olahraga). Estimasi penurunan/kenaikan lemak per minggu (Defisit/Surplus * 7 / 7700). Berikan prediksi perubahan berat badan dalam 30 hari dan 60 hari.
4. Tentukan bodyFatEstimation: jika user tidak memasukkan Body Fat %, estimasikan secara ilmiah. Hitung Lean Mass dan Fat Mass (kg). Estimasi berapa minggu lagi untuk mencapai body fat target tertentu (misal: target 15%, 12%, 10% untuk pria; 24%, 20%, 18% untuk wanita).
5. Lakukan analisisMakro secara pintar. Berikan peringatan jika lemak < 0.6g/kg BB, karbohidrat terlalu rendah untuk latihan beban, protein optimal, atau protein berlebih.
6. Lakukan analisisMikro secara presisi. Bandingkan asupan harian dengan kebutuhan standar (Vit C: 90mg, Kalium: 4700mg, Magnesium: 350mg, Kalsium: 1000mg). Berikan gap (kekurangan) dan sebutkan rekomendasi makanan Indonesia yang kaya zat gizi tersebut.
7. Hitung recovery score (0-100) berdasarkan durasi tidur (idealnya 7-9 jam), frekuensi latihan, intensitas, dan defisit kalori. Tuliskan penyebab pemulihan kurang maksimal.
8. Lakukan analisisLatihan secara mendalam: hitung total volume latihan beban minggu ini (set * reps * weight) dan bandingkan dengan data sesi sebelumnya jika ada, hitung perubahan persen (progressive overload), dan hitung distribusi set per kelompok otot (misal: Back 12 set, Biceps 8 set).
9. Buat actionPlan harian yang konkret dan mudah dilakukan (3-5 poin).
10. Berikan progressAlert jika berat badan stag (plateau) atau turun terlalu cepat (risiko otot susut), beserta solusi kalorinya (misal: "Turunkan 150 kcal" atau "Naikkan 200 kcal").
11. Hitung progressMeter: persentase progres menuju target berat badan, sisa kg, dan estimasi tanggal selesai secara logis.

Kembalikan respons dalam JSON dengan format persis seperti ini:
{
  "skorHarian": {
    "nutrisi": 92,
    "protein": 100,
    "recovery": 75,
    "aktivitas": 88,
    "konsistensi": 95,
    "overallScore": 90,
    "status": "Sangat Baik",
    "statusColor": "green"
  },
  "statusGoal": {
    "targetName": "Cutting Aggressive",
    "checklist": [
      { "label": "Defisit kalori tercapai", "achieved": true },
      { "label": "Protein tercapai", "achieved": true },
      { "label": "Aktivitas tercapai", "achieved": true },
      { "label": "Tidur kurang 1 jam", "achieved": false }
    ],
    "tomorrowProbability": 90
  },
  "prediksiBerat": {
    "weeklyDeficit": 4200,
    "estFatLossPerWeek": 0.55,
    "forecast30Days": -2.2,
    "forecast60Days": -4.4
  },
  "bodyFatEstimation": {
    "currentWeight": 82,
    "currentBF": 18.0,
    "leanMass": 67.2,
    "fatMass": 14.8,
    "targets": [
      { "bf": 15, "estWeeks": 4 },
      { "bf": 12, "estWeeks": 9 }
    ]
  },
  "analisisMakro": [
    { "label": "Protein Optimal", "status": "success", "desc": "Asupan protein lu cukup untuk mempertahankan massa otot." }
  ],
  "analisisMikro": [
    { "name": "Vitamin C", "current": 78, "target": 90, "unit": "mg", "gap": 12, "foods": ["Jeruk", "Brokoli"] }
  ],
  "recovery": {
    "score": 68,
    "status": "Cukup Pemulihan",
    "causes": ["Defisit kalori terlalu besar", "Tidur harian kurang dari 7 jam"]
  },
  "analisisLatihan": {
    "summary": "Volume latihan meningkat, progres overload berjalan.",
    "muscles": [
      { "muscle": "Back", "sets": 12 }
    ],
    "volumeThisWeek": 4200,
    "volumeLastWeek": 3800,
    "volumeChangePercent": 10.5
  },
  "actionPlan": [
    { "label": "Target protein minimal 170g", "done": false }
  ],
  "alerts": [
    { "title": "Berat Badan Plateau", "type": "warning", "cause": "Kalori under-reporting atau retensi air", "recommendation": "Turunkan asupan kalori 150 kcal untuk minggu depan." }
  ],
  "progressMeter": {
    "targetWeight": 75,
    "currentWeight": 82,
    "percent": 54,
    "remaining": 7.0,
    "estCompletion": "12 September 2026"
  }
}`;

    const rawJson = await callGroqAPI([{ role: 'user', content: prompt }], 2500, true);
    let data = null;
    try {
      let cleanJson = rawJson.trim();
      const match = cleanJson.match(/\{[\s\S]*\}/);
      data = match ? JSON.parse(match[0]) : JSON.parse(cleanJson);
    } catch (e) {
      console.error("Failed to parse progress JSON in bot:", rawJson, e);
    }

    let msg = `✨ *Hasil Analisis Progress AI (${days} Hari)* ✨\n\n`;
    
    if (data) {
      // 1. Skor Fitness Harian
      const sh = data.skorHarian || {};
      const overall = sh.overallScore || 0;
      let scoreEmoji = '🟢';
      if (sh.statusColor === 'yellow') scoreEmoji = '🟡';
      else if (sh.statusColor === 'red') scoreEmoji = '🔴';
      
      msg += `📊 *SKOR FITNESS HARIAN: ${overall}/100* ${scoreEmoji}\n`;
      msg += `• Status: *${escapeMarkdown(sh.status || 'Sedang')}*\n`;
      msg += `• Nutrisi: ${sh.nutrisi || 0}/100\n`;
      msg += `• Protein: ${sh.protein || 0}/100\n`;
      msg += `• Recovery: ${sh.recovery || 0}/100\n`;
      msg += `• Aktivitas: ${sh.aktivitas || 0}/100\n`;
      msg += `• Konsistensi: ${sh.konsistensi || 0}/100\n\n`;
      
      // 2. Goal Status
      const sg = data.statusGoal || {};
      msg += `🎯 *STATUS GOAL: ${escapeMarkdown(sg.targetName || 'Maintenance')}*\n`;
      (sg.checklist || []).forEach(item => {
        msg += `${item.achieved ? '✅' : '❌'} ${escapeMarkdown(item.label)}\n`;
      });
      msg += `🔮 Probabilitas progress besok: *${sg.tomorrowProbability || 0}%*\n\n`;
      
      // 3. Goal Progress Meter
      const pm = data.progressMeter || {};
      const pmPercent = pm.percent !== undefined ? pm.percent : 0;
      const filledBlocks = Math.min(10, Math.round(pmPercent / 10));
      const emptyBlocks = 10 - filledBlocks;
      const progressBarStr = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
      
      msg += `⚖️ *PROGRESS METER GOAL*\n`;
      msg += `Target: ${pm.targetWeight || '--'} kg | Saat ini: ${pm.currentWeight || '--'} kg\n`;
      msg += `[${progressBarStr}] *${pmPercent}%*\n`;
      msg += `Sisa: *${pm.remaining !== undefined ? Math.abs(pm.remaining).toFixed(1) : '--'} kg lagi*\n`;
      msg += `📅 Selesai target: *${escapeMarkdown(pm.estCompletion || '--')}*\n\n`;
      
      // 4. Weight Prediction & Body Comp
      const pb = data.prediksiBerat || {};
      const bf = data.bodyFatEstimation || {};
      msg += `📈 *PREDIKSI & KOMPOSISI TUBUH*\n`;
      msg += `• Defisit mingguan: *${pb.weeklyDeficit || 0} kcal*\n`;
      msg += `• Lemak ${pb.estFatLossPerWeek >= 0 ? 'turun' : 'naik'}: *${Math.abs(pb.estFatLossPerWeek || 0).toFixed(2)} kg/minggu*\n`;
      msg += `• Prediksi 30 hari: *${pb.forecast30Days > 0 ? '+' : ''}${pb.forecast30Days} kg*\n`;
      msg += `• Prediksi 60 hari: *${pb.forecast60Days > 0 ? '+' : ''}${pb.forecast60Days} kg*\n`;
      msg += `• Body Fat saat ini: *${bf.currentBF || '--'}%* (Lean: *${bf.leanMass || '--'} kg* | Fat: *${bf.fatMass || '--'} kg*)\n`;
      (bf.targets || []).forEach(t => {
        msg += `  - Target BF ${t.bf}%: *${t.estWeeks} minggu lagi*\n`;
      });
      msg += `\n`;
      
      // 5. Smart Macro Analysis
      msg += `🔥 *ANALISIS MAKRO PINTAR*\n`;
      (data.analisisMakro || []).forEach(item => {
        const mIcon = item.status === 'success' ? '🟢' : item.status === 'warning' ? '⚠️' : '🚨';
        msg += `${mIcon} *${escapeMarkdown(item.label)}*: ${escapeMarkdown(item.desc)}\n`;
      });
      msg += `\n`;
      
      // 6. Micro Nutrient Breakdown
      msg += `🥛 *ANALISIS GIZI MIKRO GAPS*\n`;
      (data.analisisMikro || []).forEach(m => {
        msg += `• *${escapeMarkdown(m.name)}*: ${m.current}/${m.target} ${m.unit} ${m.gap > 0 ? `(Kurang ${m.gap} ${m.unit})` : '(Cukup)'}\n`;
        msg += `  _Sumber makanan: ${escapeMarkdown((m.foods || []).join(', '))}_\n`;
      });
      msg += `\n`;
      
      // 7. Recovery Score
      const rec = data.recovery || {};
      msg += `😴 *RECOVERY & PEMULIHAN: ${rec.score || 0}/100* (${escapeMarkdown(rec.status || 'Cukup')})\n`;
      (rec.causes || []).forEach(c => {
        msg += `  - ${escapeMarkdown(c)}\n`;
      });
      msg += `\n`;
      
      // 8. Deep Training Analysis
      const ex = data.analisisLatihan || {};
      const vDiff = (ex.volumeThisWeek || 0) - (ex.volumeLastWeek || 0);
      msg += `🏋️ *DEEP TRAINING ANALYSIS*\n`;
      msg += `• Summary: ${escapeMarkdown(ex.summary || 'Latihan tercatat.')}\n`;
      msg += `• Volume: *${ex.volumeThisWeek || 0} kg* vs *${ex.volumeLastWeek || 0} kg* (${vDiff >= 0 ? '+' : ''}${ex.volumeChangePercent || 0}%)\n`;
      msg += `• Pembagian set:\n`;
      (ex.muscles || []).forEach(m => {
        msg += `  - ${escapeMarkdown(m.muscle)}: *${m.sets} set*\n`;
      });
      msg += `\n`;
      
      // 9. Daily Action Plan
      msg += `📝 *DAILY ACTION PLAN*\n`;
      (data.actionPlan || []).forEach(item => {
        msg += `• [ ] ${escapeMarkdown(item.label)}\n`;
      });
      msg += `\n`;
      
      // 10. Alerts
      if (data.alerts && data.alerts.length > 0) {
        msg += `🚨 *PROGRESS ALERT*\n`;
        data.alerts.forEach(a => {
          msg += `• *${escapeMarkdown(a.title)}*\n`;
          msg += `  _Penyebab: ${escapeMarkdown(a.cause)}_\n`;
          msg += `  _Saran Coach: ${escapeMarkdown(a.recommendation)}_\n`;
        });
      }
    } else {
      msg += `Gagal membuat analisis AI. Coba beberapa saat lagi atau periksa log data lu.`;
    }

    if (loadingMsgId) {
      return editMessageText(chatId, loadingMsgId, msg, {
        inline_keyboard: [
          [
            { text: '🔙 Kembali', callback_data: 'progress_menu' },
            { text: '🏠 Menu Utama', callback_data: 'menu' }
          ]
        ]
      });
    } else {
      return sendMessage(chatId, msg, {
        inline_keyboard: [
          [
            { text: '🔙 Kembali', callback_data: 'progress_menu' },
            { text: '🏠 Menu Utama', callback_data: 'menu' }
          ]
        ]
      });
    }

  } catch (err) {
    console.error('runProgressAnalysis error:', err);
    return sendMessage(chatId, 'Gagal memuat analisis AI: ' + err.message, {
      inline_keyboard: [[{ text: 'Kembali', callback_data: 'progress_menu' }]]
    });
  }
}

// ===== PHYSICAL PROGRESS EVALUATION VIA BOT (GEMINI 3.5 FLASH) =====
async function startPhysicalEvaluationBot(chatId, userId) {
  await setState(userId, 'AWAIT_PHYSICAL_PHOTO');
  return sendMessage(chatId,
    '📸 *Evaluasi Fisik via Foto AI*\n\nSilakan kirim or *forward* foto kondisi badan lu saat ini (tampak depan/samping) ke sini.\n\nLebihFit Tools AI akan menganalisis bentuk fisik visual lu secara objektif dan mengaitkannya dengan data profil, asupan nutrisi, olahraga, dan istirahat lu.',
    { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'progress_menu' }]] }
  );
}

async function handlePhysicalPhotoInput(chatId, userId, photos) {
  try {
    const largestPhoto = photos[photos.length - 1];
    const fileId = largestPhoto.file_id;
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error('Gagal mendapatkan file dari Telegram');
    
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    
    const imgRes = await fetch(fileUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    let mime = 'image/jpeg';
    if (filePath.endsWith('.png')) mime = 'image/png';
    if (filePath.endsWith('.webp')) mime = 'image/webp';

    let smallBase64 = '';
    try {
      const smallPhotoObj = photos[Math.min(1, photos.length - 1)];
      const smallFileId = smallPhotoObj.file_id;
      const smallFileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${smallFileId}`);
      const smallFileData = await smallFileRes.json();
      if (smallFileData.ok) {
        const smallFilePath = smallFileData.result.file_path;
        const smallFileUrl = `https://api.telegram.org/file/bot${token}/${smallFilePath}`;
        const smallImgRes = await fetch(smallFileUrl);
        const smallArrayBuffer = await smallImgRes.arrayBuffer();
        smallBase64 = `data:${mime};base64,` + Buffer.from(smallArrayBuffer).toString('base64');
      }
    } catch (err) {}

    const cacheKey = `${userId}_phys_photos_arr`;
    let cachedData = await getCache(cacheKey) || {};
    cachedData[fileId] = { mime, base64, smallBase64 };
    await setCache(cacheKey, cachedData);

    const count = Object.keys(cachedData).length;

    let msg = `✅ Foto tubuh ke-${count} berhasil ditambahkan.\n\n`;
    if (count < 10) {
      msg += `Kirim foto pose lain (depan, samping, belakang - maksimal 10), atau klik "Lanjut" jika sudah semua.`;
    } else {
      msg += `Maksimal 10 foto tercapai. Klik "Lanjut".`;
    }

    return sendMessage(chatId, msg, {
      inline_keyboard: [
        [{ text: '➡️ Lanjut', callback_data: 'phys_photos_done' }],
        [{ text: '❌ Batal', callback_data: 'progress_menu' }]
      ]
    });
  } catch (err) {
    console.error('handlePhysicalPhotoInput error:', err);
    return sendMessage(chatId, 'Gagal mengunduh foto: ' + err.message);
  }
}

async function physPhotosDone(chatId, userId) {
  await setState(userId, 'AWAIT_PHYSICAL_DAYS');
  return sendMessage(chatId,
    '📸 *Foto tubuh disimpan!*\n\nPilih rentang hari riwayat data kebugaran lu (nutrisi, latihan, tidur) yang mau diikutkan dalam analisis:',
    {
      inline_keyboard: [
        [
          { text: '📅 7 Hari', callback_data: 'phys_days_7' },
          { text: '📅 14 Hari', callback_data: 'phys_days_14' },
          { text: '📅 30 Hari', callback_data: 'phys_days_30' }
        ],
        [{ text: '❌ Batal', callback_data: 'progress_menu' }]
      ]
    }
  );
}

async function onPhysicalDaysSelected(chatId, userId, days) {
  try {
    await setCache(`${userId}_physical_days`, String(days));
    await setState(userId, 'AWAIT_PHYSICAL_DESC');
    
    return sendMessage(chatId,
      `📅 *Rentang ${days} hari dipilih.*\n\nAda deskripsi tambahan atau catatan kondisi fisik lu saat ini? (Opsional)\n_Contoh: Merasa lingkar perut agak menyusut, tapi lengan berasa lebih padat. Akhir-akhir ini sering lemas_\n\nKetik pesan di bawah untuk mengirim catatan, atau klik tombol di bawah untuk lewati.`,
      {
        inline_keyboard: [
          [{ text: '➡️ Lewati / Skip', callback_data: 'phys_skip_desc' }],
          [{ text: '❌ Batal', callback_data: 'progress_menu' }]
        ]
      }
    );
  } catch (err) {
    console.error('onPhysicalDaysSelected error:', err);
    await setState(userId, null);
    return sendMessage(chatId, 'Gagal memproses pilihan hari: ' + err.message, {
      inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'progress_menu' }]]
    });
  }
}

function parseDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const mime = parts[0].split(':')[1].split(';')[0];
  const base64 = parts[1];
  return { mime, base64 };
}

async function onPhysicalDescInput(chatId, userId, text) {
  try {
    const email = await getLinkedEmail(userId);
    if (!email) return promptLogin(chatId, userId);

    const cachedArr = await getCache(`${userId}_phys_photos_arr`);
  if (!cachedArr) return sendMessage(chatId, 'Sesi kadaluarsa, silahkan ulangi.', { inline_keyboard: [[{ text: 'Batal', callback_data: 'progress_menu' }]] });
  const base64 = null; // compatibility
  const photoArr = Object.values(cachedArr);
  const images = photoArr.map(p => ({ mime: p.mime, base64: p.base64 }));
  
    const smallPhotoDataUrl = await getCache(`${userId}_physical_photo_small`);
    const mime = photoArr[0].mime;
    const daysStr = await getCache(`${userId}_physical_days`);
    const days = parseInt(daysStr) || 7;
    
    if (!base64 || !mime) {
      await setState(userId, null);
      return sendMessage(chatId, 'Sesi kedaluwarsa. Silakan ulangi evaluasi fisik.', {
        inline_keyboard: [[{ text: '📸 Mulai Ulang', callback_data: 'prog_physical_eval' }]]
      });
    }

    // Clean up temporary state
    await setState(userId, null);
    await deleteCache(`${userId}_physical_photo`);
    await deleteCache(`${userId}_physical_photo_small`);
    await deleteCache(`${userId}_physical_mime`);
    await deleteCache(`${userId}_physical_days`);

    const customDesc = (text && text.toLowerCase() !== 'skip' && text !== '-') ? text.trim() : '';

    await sendMessage(chatId, `⏳ Menganalisis kondisi fisik lu dengan LebihFit Tools AI dan menarik data riwayat kebugaran lu selama ${days} hari terakhir. Harap tunggu sebentar...`);
    await sendChatAction(chatId, 'typing');

    // Fetch context data from Firebase
    const profile = await getFirebase(`users/${safe(email)}/lf_profile`) || {};
    const dates = getPastWibDates(days);
    
    const logPromises = dates.map(key => getFirebase(`users/${safe(email)}/lf_logs/${key}`));
    const rawLogs = await Promise.all(logPromises);
    
    const actPromises = dates.map(key => getFirebase(`users/${safe(email)}/lf_activities/${key}`));
    const rawActs = await Promise.all(actPromises);

    // Sum logs and acts
    let totalDaysWithLogs = 0;
    let sumCal = 0, sumProtein = 0, sumCarbs = 0, sumFat = 0, sumFiber = 0;
    
    rawLogs.forEach(dayLogObj => {
      const items = toArray(dayLogObj);
      if (items.length > 0) {
        totalDaysWithLogs++;
        const t = sumNutrients(items);
        sumCal += t.cal;
        sumProtein += t.protein;
        sumCarbs += t.carbs;
        sumFat += t.fat;
        sumFiber += t.fiber;
      }
    });

    const activeDays = totalDaysWithLogs || 1;
    const avgCal = sumCal / activeDays;
    const avgProtein = sumProtein / activeDays;
    const avgCarbs = sumCarbs / activeDays;
    const avgFat = sumFat / activeDays;
    const avgFiber = sumFiber / activeDays;

    let workoutCount = 0, gymCount = 0, cardioCount = 0, sleepData = [], totalBurnedKcal = 0;
    rawActs.forEach(dayActsObj => {
      const dayActs = toArray(dayActsObj);
      dayActs.forEach(a => {
        if (a.type === 'workout') workoutCount++;
        else if (a.type === 'gym') gymCount++;
        else if (a.type === 'cardio') cardioCount++;
        else if (a.type === 'sleep') sleepData.push(a.hours);
        if (a.burn && a.burn.kcal) totalBurnedKcal += parseFloat(a.burn.kcal);
      });
    });

    const avgSleep = sleepData.length > 0 ? (sleepData.reduce((s, x) => s + x, 0) / sleepData.length).toFixed(1) : 'tidak tercatat';
    const avgBurn = (totalBurnedKcal / days).toFixed(0);
    const calTarget = Math.round((profile && profile.targets) ? profile.targets.cal : 2000);
    const targetProtein = Math.round((profile && profile.targets) ? profile.targets.protein : 120);

    // Serialize workout details
    let workoutDetails = [];
    dates.forEach((date, index) => {
      const dayActs = toArray(rawActs[index]);
      dayActs.forEach(a => {
        if (a.type === 'workout' && a.exercises) {
          const exStr = a.exercises.map(ex => {
            const setsStr = (ex.sets || []).map(s => `${s.reps || 0} reps @ ${s.weight || 0}kg`).join(', ');
            return `${ex.name}: [${setsStr}]`;
          }).join('; ');
          workoutDetails.push(`- ${date} (Workout): ${exStr}`);
        } else if (a.type === 'gym' && a.muscles) {
          const musStr = a.muscles.map(m => {
            const varStr = (m.variations || []).map(v => {
              const setsStr = (v.sets || []).map(s => `${s.reps || 0} reps @ ${s.weight || 0}kg`).join(', ');
              return `${v.name}: [${setsStr}]`;
            }).join('; ');
            return `${m.muscle} (${varStr})`;
          }).join('; ');
          workoutDetails.push(`- ${date} (Gym): ${musStr}`);
        } else if (a.type === 'cardio') {
          workoutDetails.push(`- ${date} (Cardio): ${a.name || 'Kardio'} - ${a.durationMin || 0} min, ${a.distanceKm || 0} km (${a.intensity || 'medium'})`);
        }
      });
    });
    const workoutDetailsText = workoutDetails.length > 0 ? workoutDetails.join('\n') : 'Tidak ada sesi latihan beban atau kardio yang tercatat.';

    // Cache system to save Gemini tokens
    function hashString(str) {
      let hash = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16);
    }

    const inputString = [
      base64,
      days.toString(),
      customDesc || '',
      JSON.stringify(profile),
      avgCal.toFixed(0),
      avgProtein.toFixed(1),
      avgCarbs.toFixed(1),
      avgFat.toFixed(1),
      avgFiber.toFixed(1),
      workoutCount.toString(),
      gymCount.toString(),
      cardioCount.toString(),
      avgSleep.toString(),
      avgBurn.toString(),
      workoutDetailsText
    ].join('|');
    const currentHash = hashString(inputString);

    const cached = await getFirebase(`users/${safe(email)}/lf_physical_analysis_cache`);
    if (cached && cached.hash === currentHash) {
      console.log("[lebihfit bot] Loading physical analysis from cache");
      const formattedMessage = formatPhysicalAnalysisBot(cached.data);
      return sendMessage(chatId, formattedMessage, mainMenuKeyboard());
    }

    // Load physical analysis history for comparison
    const historyData = await getFirebase(`users/${safe(email)}/lf_physical_analyses`);
    let physicalHistory = [];
    if (historyData) {
      physicalHistory = Object.values(historyData).sort((a,b) => a.timestamp.localeCompare(b.timestamp));
    }
    
    const previousAnalysis = physicalHistory.length > 0 ? physicalHistory[physicalHistory.length - 1] : null;
    let previousContextText = '';
    if (previousAnalysis) {
      previousContextText = `
== DATA EVALUASI FISIK SEBELUMNYA (${previousAnalysis.date || 'Tanggal tidak diketahui'}) ==
Bandingkan kondisi fisik visual pada foto saat ini dengan catatan evaluasi fisik sebelumnya ini:
- Body Fat Sebelumnya: ${previousAnalysis.data?.perkiraanGoal?.currentBF || '?'}
- Kelebihan Sebelumnya: ${(previousAnalysis.data?.ringkasanSederhana?.pros || []).join(', ')}
- Kekurangan Sebelumnya: ${(previousAnalysis.data?.ringkasanSederhana?.cons || []).join(', ')}
- Fokus Perbaikan Sebelumnya: ${previousAnalysis.data?.ringkasanSederhana?.focus || '?'}
- Ulasan Risiko Sebelumnya: ${previousAnalysis.data?.analisisRisiko?.notes || '?'}
`;
    }

    const imagesInput = [];
    imagesInput.push({ base64, mime });

    let visualComparisonPromptNote = '';
    if (previousAnalysis && previousAnalysis.photo) {
      const parsed = parseDataUrl(previousAnalysis.photo);
      if (parsed) {
        imagesInput.push(parsed);
        visualComparisonPromptNote = `
* PENTING: Kami menyertakan 2 FOTO untuk kamu bandingkan secara visual.
- Foto Pertama (Urutan ke-1) adalah FOTO TERBARU saat ini.
- Foto Kedua (Urutan ke-2) adalah FOTO DARI ANALISIS SEBELUMNYA (${previousAnalysis.date || 'kemarin'}).
Silakan analisis perubahan bentuk tubuh, definisi otot, dan kadar lemak tubuh secara visual di antara kedua foto tersebut secara langsung.`;
      }
    }

    // Build Gemini prompt requesting JSON
    let promptText = `Kamu adalah AI Personal Coach, pelatih fitness personal, dan ahli gizi klinis profesional.
Tugas kamu adalah menganalisis foto kondisi fisik tubuh user ini secara visual (otot, lemak, proporsi tubuh) dan mengaitkannya dengan data profil serta riwayat asupan/olahraga selama ${days} hari terakhir.
Bandingkan kondisi visual saat ini dengan data kondisi fisik sebelumnya jika dilampirkan, untuk menganalisis apakah tubuhnya membaik (improve), stagnan, atau memburuk.
Kembalikan respons HANYA dalam format JSON valid sesuai dengan skema yang diberikan di bawah ini.

== PROFIL PENGGUNA ==
- Tinggi Badan (TB): ${profile.tb || '?'} cm
- Berat Badan (BB): ${profile.bb || '?'} kg
- Usia: ${profile.usia || '?'} tahun
- Jenis Kelamin: ${profile.gender || 'pria'}
- Level Aktivitas Harian: ${profile.aktivitas || 'sedentary'}
- Target / Goal Kebugaran: ${profile.target || 'maintenance'} (${profile.catatan || 'tanpa catatan khusus'})
- Target Berat Badan: ${profile.targetBb || profile.bb || '?'} kg
- Body Fat saat ini: ${profile.bodyFat || '?'} %

== RIWAYAT ${days} HARI TERAKHIR ==
- Rata-rata Kalori Asupan: ${Math.round(avgCal)} kcal/hari (target: ${calTarget} kcal)
- Rata-rata Protein: ${avgProtein.toFixed(1)} g/hari (target: ${targetProtein} g)
- Rata-rata Karbohidrat: ${avgCarbs.toFixed(1)} g/hari
- Rata-rata Lemak: ${avgFat.toFixed(1)} g/hari
- Rata-rata Serat: ${avgFiber.toFixed(1)} g/hari
- Total Latihan: ${workoutCount + gymCount} sesi latihan beban (Gym: ${gymCount}, Workout: ${workoutCount}), serta ${cardioCount} sesi kardio
- Estimasi Kalori Terbakar Olahraga: ${avgBurn} kcal/hari
- Rata-rata Tidur/Istirahat: ${avgSleep} jam/hari

== CATATAN DETAIL GERAKAN/EXERCISE OLAHRAGA ==
${workoutDetailsText}

Catatan Tambahan User: "${customDesc || '-'}"
${previousContextText}
${visualComparisonPromptNote}

== SKEMA JSON RESPONS (WAJIB PERSIS SEPERTI INI) ==
{
  "comparisonWithPrevious": {
    "hasPrevious": ${previousAnalysis ? 'true' : 'false'},
    "status": "Improve" (atau "Stagnan" / "Memburuk"),
    "score": 15 (nilai -100 sampai 100, positif = membaik/improve, negatif = memburuk/regress, 0 jika stagnan atau tidak ada data pembanding),
    "explanation": "Kondisi otot perut terlihat lebih tajam dibanding analisis sebelumnya. Defisit kalori yang lu pertahankan berhasil mengurangi lemak."
  },
  "progressiveOverload": {
    "score": 85,
    "status": "Optimal" (atau "Butuh Peningkatan" / "Kurang Beban"),
    "explanation": "Berdasarkan detail latihan lu, ada peningkatan beban yang bagus pada Bench Press dari 60kg ke 62.5kg. Namun untuk gerakan aksesoris seperti lateral raise dan tricep pushdown masih menggunakan volume yang sama. Pertahankan intensitas dan coba tambah reps/beban secara bertahap!"
  },
  "ringkasanSederhana": {
    "pros": ["Asupan protein optimal", "Defisit kalori sudah tepat"],
    "cons": ["Tidur terlalu rendah", "Lemak terlalu rendah", "Serat terlalu rendah"],
    "focus": "Tidur + Lemak + Serat"
  },
  "targetMakro": {
    "cal": 2000,
    "protein": 170,
    "carbs": 180,
    "fat": 60,
    "fiber": "25-35g",
    "water": "3 Liter"
  },
  "makananRekomendasi": {
    "category": "Sumber Lemak yang Direkomendasikan",
    "foods": ["Telur utuh", "Alpukat", "Kacang tanah", "Kacang almond", "Ikan salmon", "Minyak zaitun"]
  },
  "prioritasPerbaikan": [
    { "label": "Tidur", "impact": "Sangat Tinggi", "desc": "Tidur rata-rata hanya 5.7 jam. Sangat mengganggu recovery otot." },
    { "label": "Serat", "impact": "Tinggi", "desc": "Tambahkan brokoli, bayam, wortel, apel, atau pisang." },
    { "label": "Lemak", "impact": "Tinggi", "desc": "Asupan lemak terlalu rendah untuk produksi hormon sehat." }
  ],
  "perkiraanGoal": {
    "currentBF": "16-18%",
    "targetBF": "10-12%",
    "weeks": "8-12 minggu",
    "desc": "Dengan konsistensi tinggi pada defisit kalori dan latihan beban."
  },
  "kesalahanTerbesar": [
    "Tidur hanya 5.7 jam",
    "Lemak terlalu rendah",
    "Serat terlalu rendah"
  ],
  "analisisRisiko": {
    "muscleLoss": "Rendah",
    "plateau": "Sedang",
    "recoveryDisruption": "Tinggi",
    "notes": "Risiko pemulihan terganggu tinggi karena kurang tidur."
  },
  "estimasiFisik30Hari": {
    "waist": "turun 2-4 cm",
    "weight": "turun 1.5-3 kg",
    "bodyFat": "turun 1-2%",
    "desc": "Otot perut bagian atas akan terlihat lebih jelas."
  },
  "nutrisiBerpotensiKurang": [
    { "name": "Vitamin D", "sources": ["Salmon", "Susu", "Telur"] },
    { "name": "Magnesium", "sources": ["Bayam", "Cokelat hitam", "Kacang-kacangan"] }
  ],
  "recoveryScore": {
    "sleep": 45,
    "protein": 95,
    "calorie": 90,
    "training": 85,
    "total": 79
  }
}`;

    const rawJson = await callGeminiVisionAPI(imagesInput, mime, promptText, true);
    let data = null;
    try {
      let cleanJson = rawJson.trim();
      const match = cleanJson.match(/\{[\s\S]*\}/);
      data = match ? JSON.parse(match[0]) : JSON.parse(cleanJson);
    } catch (e) {
      console.error("Failed to parse bot physical analysis JSON:", rawJson, e);
      return sendMessage(chatId, '⚠️ Gagal membaca format data evaluasi dari AI. Silakan coba lagi.', mainMenuKeyboard());
    }

    if (data) {
      await setFirebase(`users/${safe(email)}/lf_physical_analysis_cache`, { hash: currentHash, data: data });
      
      // Save to Firebase history
      const historyId = 'pa_' + Date.now();
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        data: data,
        photo: smallPhotoDataUrl || ''
      };
      await setFirebase(`users/${safe(email)}/lf_physical_analyses/${historyId}`, historyEntry);

      const formattedMessage = formatPhysicalAnalysisBot(data);
      return sendMessage(chatId, formattedMessage, mainMenuKeyboard());
    } else {
      return sendMessage(chatId, 'Gagal mendapatkan analisis dari AI. Silakan coba lagi nanti.', mainMenuKeyboard());
    }

  } catch (err) {
    console.error('onPhysicalDescInput error:', err);
    await setState(userId, null);
    return sendMessage(chatId, 'Gagal menjalankan evaluasi fisik: ' + err.message, mainMenuKeyboard());
  }
}

function formatPhysicalAnalysisBot(data) {
  // 0a. Perbandingan dengan Fisik Sebelumnya
  const comp = data.comparisonWithPrevious || {};
  let comparisonStr = '';
  if (comp && comp.hasPrevious) {
    const statusEmoji = comp.status === 'Improve' ? '📈' : comp.status === 'Memburuk' ? '📉' : '⚖️';
    const scoreSign = comp.score >= 0 ? '+' : '';
    comparisonStr = `📊 *PERBANDINGAN FISIK SEBELUMNYA*\n`;
    comparisonStr += `• Status: *${statusEmoji} ${escapeMarkdown(comp.status === 'Improve' ? 'MEMBAIK / IMPROVE' : comp.status === 'Memburuk' ? 'MEMBURUK / REGRESS' : 'STAGNAN')}*\n`;
    comparisonStr += `• Skor Peningkatan: *${scoreSign}${comp.score}%*\n`;
    if (comp.explanation) comparisonStr += `_${escapeMarkdown(comp.explanation)}_\n`;
    comparisonStr += `────────────────────────\n`;
  }

  // 0b. Progressive Overload Score
  const po = data.progressiveOverload || { score: 0, status: 'Kurang Beban', explanation: 'Belum ada data progres latihan beban.' };
  const poScore = po.score || 0;
  const poStatusEmoji = po.status === 'Optimal' ? '🔥' : po.status === 'Butuh Peningkatan' ? '⚡' : '⚠️';
  let poStr = `🏋️ *PROGRESSIVE OVERLOAD SCORE*\n`;
  poStr += `• Status Latihan: *${poStatusEmoji} ${escapeMarkdown(po.status || 'KURANG BEBAN')}*\n`;
  poStr += `• Skor Overload: *${poScore}/100*\n`;
  if (po.explanation) poStr += `_${escapeMarkdown(po.explanation)}_\n`;
  poStr += `────────────────────────\n`;

  // 1. Ringkasan Super Singkat
  const rs = data.ringkasanSederhana || {};
  const pros = Array.isArray(rs.pros) ? rs.pros.map(p => `🟢 ${escapeMarkdown(p)}`).join('\n') : '';
  const cons = Array.isArray(rs.cons) ? rs.cons.map(c => `⚠️ ${escapeMarkdown(c)}`).join('\n') : '';
  const focus = escapeMarkdown(rs.focus || '--');

  // 2. Recovery Score
  const rec = data.recoveryScore || {};
  const recTotal = rec.total || 0;
  const bar = progressBar(recTotal);
  const recSplit = `😴 Tidur: \`${rec.sleep || 0}\` | 🥩 Protein: \`${rec.protein || 0}\` | 🥗 Kalori: \`${rec.calorie || 0}\` | 🏋️ Latihan: \`${rec.training || 0}\``;

  // 3. Target Makro Ideal
  const tm = data.targetMakro || {};

  // 4. Prioritas Perbaikan
  let prioritasStr = '';
  if (Array.isArray(data.prioritasPerbaikan)) {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    data.prioritasPerbaikan.forEach((p, idx) => {
      const numEmoji = emojis[idx] || '🔹';
      prioritasStr += `${numEmoji} *${escapeMarkdown(p.label)}* (Impact: *${escapeMarkdown(p.impact)}*)\n_${escapeMarkdown(p.desc)}_\n`;
    });
  }

  // 5. Makanan yang Direkomendasikan
  const mr = data.makananRekomendasi || {};
  const category = escapeMarkdown(mr.category || 'Rekomendasi');
  const foods = Array.isArray(mr.foods) ? mr.foods.map(f => escapeMarkdown(f)).join(', ') : '--';

  // 6. Perkiraan Goal & Proyeksi
  const pg = data.perkiraanGoal || {};
  const ef = data.estimasiFisik30Hari || {};

  // 7. Kesalahan & Analisis Risiko
  const kesalahan = Array.isArray(data.kesalahanTerbesar) 
    ? data.kesalahanTerbesar.map(k => `❌ ${escapeMarkdown(k)}`).join('\n') 
    : '';

  const ar = data.analisisRisiko || {};

  // 8. Nutrisi Potensial Kurang
  let nutrisiStr = '';
  if (Array.isArray(data.nutrisiBerpotensiKurang)) {
    data.nutrisiBerpotensiKurang.forEach(n => {
      const sources = Array.isArray(n.sources) ? n.sources.join(', ') : '';
      nutrisiStr += `⚠️ *${escapeMarkdown(n.name)}* ➔ Sumber: ${escapeMarkdown(sources)}\n`;
    });
  }

  // Constructing the final message
  let msg = '';
  if (comparisonStr) msg += comparisonStr;
  msg += poStr;

  msg += `⚡ *RINGKASAN AI (3 DETIK BACA)*\n`;
  if (pros) msg += `${pros}\n`;
  if (cons) msg += `${cons}\n`;
  msg += `🎯 Fokus Minggu Ini: \`${focus}\`\n\n`;

  msg += `🏆 *Recovery Score: ${recTotal}/100*\n\`[${bar}]\`\n${recSplit}\n`;
  msg += `────────────────────────\n`;
  msg += `⚖️ *TARGET MAKRO IDEAL HARIAN*\n`;
  msg += `🔥 Kalori: *${tm.cal || 0} kcal*\n`;
  msg += `🥩 Protein: *${tm.protein || 0}g*\n`;
  msg += `🍚 Karbo: *${tm.carbs || 0}g*\n`;
  msg += `🥑 Lemak: *${tm.fat || 0}g*\n`;
  msg += `🌾 Serat: *${escapeMarkdown(tm.fiber || '--')}* | 💧 Air: *${escapeMarkdown(tm.water || '--')}*\n`;
  msg += `────────────────────────\n`;

  if (prioritasStr) {
    msg += `🛠️ *PRIORITAS PERBAIKAN*\n${prioritasStr}`;
    msg += `────────────────────────\n`;
  }

  msg += `🥑 *MAKANAN REKOMENDASI*\n`;
  msg += `*Kategori:* ${category}\n• ${foods}\n`;
  msg += `────────────────────────\n`;

  msg += `🔮 *PERKIRAAN GOAL & PROYEKSI*\n`;
  msg += `• Body Fat Saat Ini: *${escapeMarkdown(pg.currentBF || '--')}*\n`;
  msg += `• Target Body Fat: *${escapeMarkdown(pg.targetBF || '--')}*\n`;
  msg += `• Estimasi Waktu: *${escapeMarkdown(pg.weeks || '--')}*\n`;
  if (pg.desc) msg += `_${escapeMarkdown(pg.desc)}_\n`;
  msg += `\n📅 *Jika Konsisten 30 Hari:*\n`;
  msg += `• Lingkar Pinggang: *${escapeMarkdown(ef.waist || '--')}*\n`;
  msg += `• Berat Badan: *${escapeMarkdown(ef.weight || '--')}*\n`;
  msg += `• Body Fat: *${escapeMarkdown(ef.bodyFat || '--')}*\n`;
  if (ef.desc) msg += `_${escapeMarkdown(ef.desc)}_\n`;
  msg += `────────────────────────\n`;

  msg += `⚠️ *KESALAHAN & ANALISIS RISIKO*\n`;
  if (kesalahan) msg += `${kesalahan}\n\n`;
  msg += `• Risiko Susut Otot: *${escapeMarkdown(ar.muscleLoss || 'Rendah')}*\n`;
  msg += `• Risiko Plateau: *${escapeMarkdown(ar.plateau || 'Rendah')}*\n`;
  msg += `• Gangguan Recovery: *${escapeMarkdown(ar.recoveryDisruption || 'Rendah')}*\n`;
  if (ar.notes) msg += `💡 _${escapeMarkdown(ar.notes)}_\n`;
  msg += `────────────────────────\n`;

  if (nutrisiStr) {
    msg += `🥛 *NUTRISI POTENSIAL KURANG*\n${nutrisiStr}`;
  }

  return msg;
}

module.exports = { handleMessage, handleCallback };
