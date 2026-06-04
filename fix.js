const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacements = [
  ['<div class="logo-glow">💪</div>', '<div class="logo-glow"><i data-lucide="flame" style="width: 48px; height: 48px;"></i></div>'],
  ['<span class="logo-icon">💪</span>', '<span class="logo-icon"><i data-lucide="flame"></i></span>'],
  ['<span class="nav-icon">🏠</span>', '<span class="nav-icon"><i data-lucide="layout-dashboard"></i></span>'],
  ['<span class="nav-icon">➕</span>', '<span class="nav-icon"><i data-lucide="plus-circle"></i></span>'],
  ['<span class="nav-icon">📈</span>', '<span class="nav-icon"><i data-lucide="line-chart"></i></span>'],
  ['<span class="nav-icon">🧮</span>', '<span class="nav-icon"><i data-lucide="calculator"></i></span>'],
  ['<span class="nav-icon">⚙️</span>', '<span class="nav-icon"><i data-lucide="settings"></i></span>'],
  ['🔥 Cutting Agresif', '<i data-lucide="flame" style="width:16px;height:16px;"></i> Cutting Agresif'],
  ['✂️ Cutting Perlahan', '<i data-lucide="scissors" style="width:16px;height:16px;"></i> Cutting Perlahan'],
  ['⚖️ Pertahankan BB', '<i data-lucide="scale" style="width:16px;height:16px;"></i> Pertahankan BB'],
  ['💪 Bulking Perlahan', '<i data-lucide="activity" style="width:16px;height:16px;"></i> Bulking Perlahan'],
  ['🚀 Bulking Agresif', '<i data-lucide="rocket" style="width:16px;height:16px;"></i> Bulking Agresif'],
  ['<div class="macro-icon">🥩</div>', '<div class="macro-icon"><i data-lucide="drumstick"></i></div>'],
  ['<div class="macro-icon">🍚</div>', '<div class="macro-icon"><i data-lucide="wheat"></i></div>'],
  ['<div class="macro-icon">🥑</div>', '<div class="macro-icon"><i data-lucide="apple"></i></div>'],
  ['<div class="macro-icon">🥦</div>', '<div class="macro-icon"><i data-lucide="leaf"></i></div>'],
  ['⚗️ Mikronutrisi Hari Ini', '<i data-lucide="flask-conical" style="display:inline-block;vertical-align:text-bottom;"></i> Mikronutrisi Hari Ini'],
  ['🍽️ Log Makanan Hari Ini', '<i data-lucide="utensils" style="display:inline-block;vertical-align:text-bottom;"></i> Log Makanan Hari Ini'],
  ['✏️ Manual', '<i data-lucide="edit-3" style="width:16px;height:16px;display:inline-block;vertical-align:text-bottom;"></i> Manual'],
  ['📷 Foto AI', '<i data-lucide="camera" style="width:16px;height:16px;display:inline-block;vertical-align:text-bottom;"></i> Foto AI'],
  ['<div class="upload-icon">📸</div>', '<div class="upload-icon"><i data-lucide="camera" style="width:48px;height:48px;"></i></div>'],
  ['🤖 Analisis dengan AI', '<i data-lucide="bot" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Analisis dengan AI'],
  ['💾 Simpan Makanan', '<i data-lucide="save" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Simpan Makanan'],
  ['🗑️ Hapus Foto', '<i data-lucide="trash-2" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Hapus Foto'],
  ['🤖 Analisis AI', '<i data-lucide="bot" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Analisis AI'],
  ['📊 Tren Kalori', '<i data-lucide="bar-chart-2" style="display:inline-block;vertical-align:text-bottom;"></i> Tren Kalori'],
  ['📋 Rata-rata Harian', '<i data-lucide="clipboard-list" style="display:inline-block;vertical-align:text-bottom;"></i> Rata-rata Harian'],
  ['📅 Riwayat Per Hari', '<i data-lucide="calendar" style="display:inline-block;vertical-align:text-bottom;"></i> Riwayat Per Hari'],
  ['🧮 Kalkulator Fitness', '<i data-lucide="calculator" style="display:inline-block;vertical-align:text-bottom;"></i> Kalkulator Fitness'],
  ['🤖 Update Target dengan AI', '<i data-lucide="bot" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Update Target dengan AI'],
  ['👤 Profil Saat Ini', '<i data-lucide="user" style="display:inline-block;vertical-align:text-bottom;"></i> Profil Saat Ini'],
  ['⚙️ Settings', '<i data-lucide="settings" style="display:inline-block;vertical-align:text-bottom;"></i> Settings'],
  ['🔑 API Key', '<i data-lucide="key" style="display:inline-block;vertical-align:text-bottom;"></i> API Key'],
  ['👁️', '<i data-lucide="eye"></i>'],
  ['💾 Simpan API Key', '<i data-lucide="save" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Simpan API Key'],
  ['🗃️ Manajemen Data', '<i data-lucide="database" style="display:inline-block;vertical-align:text-bottom;"></i> Manajemen Data'],
  ['📤 Export', '<i data-lucide="download" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Export'],
  ['🗑️ Hapus Semua', '<i data-lucide="trash-2" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Hapus Semua'],
  ['ℹ️ Tentang App', '<i data-lucide="info" style="display:inline-block;vertical-align:text-bottom;"></i> Tentang App'],
  ['✏️ Edit Makanan', '<i data-lucide="edit" style="display:inline-block;vertical-align:text-bottom;"></i> Edit Makanan'],
  ['💾 Simpan Perubahan', '<i data-lucide="save" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Simpan Perubahan'],
  ['💪 LebihFit', '<i data-lucide="flame" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> LebihFit'],
  ['✏️', '<i data-lucide="edit-2" style="width:14px;height:14px;"></i>'],
  ['🗑️', '<i data-lucide="trash-2" style="width:14px;height:14px;"></i>']
];

for (const [from, to] of replacements) {
  html = html.split(from).join(to);
}

if (!html.includes('lucide@latest')) {
  html = html.replace('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>', '<script src="https://unpkg.com/lucide@latest"></script>\n  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>');
}

fs.writeFileSync('index.html', html);
console.log("Emojis replaced!");
