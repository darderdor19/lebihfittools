const { getFirebase, toArray, safe, getLinkedEmail } = require('../lib/firebase');
const crypto = require('crypto');

function getDatesForRange(range, logsData) {
  const dates = [];
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const wib = new Date(utc + (3600000 * 7)); // Today in WIB
  const todayStr = wib.toISOString().slice(0, 10);

  if (range === 'all') {
    const keys = Object.keys(logsData).filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)).sort();
    if (keys.length === 0) {
      dates.push(todayStr);
    } else {
      // Range goes from the first log date (keys[0]) to today (todayStr)
      const start = new Date(keys[0]);
      const end = new Date(todayStr);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        dates.push(d.toISOString().slice(0, 10));
      }
    }
  } else {
    let startDate = new Date(wib);
    if (range === '7') {
      startDate.setDate(wib.getDate() - 6);
    } else if (range === '30') {
      startDate.setMonth(wib.getMonth() - 1);
      if (startDate.getDate() !== wib.getDate()) startDate.setDate(0);
    } else if (range === '90') {
      startDate.setMonth(wib.getMonth() - 3);
      if (startDate.getDate() !== wib.getDate()) startDate.setDate(0);
    } else if (range === '180') {
      startDate.setMonth(wib.getMonth() - 6);
      if (startDate.getDate() !== wib.getDate()) startDate.setDate(0);
    } else if (range === '365') {
      startDate.setFullYear(wib.getFullYear() - 1);
    }
    
    const diffTime = Math.abs(wib - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

module.exports = async function handler(req, res) {
  try {
    const { id, token, range = '7' } = req.query;
    if (!id || !token) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send('<h3>Error: Missing id or token</h3>');
    }

    // 1. Validate token
    const secret = process.env.TELEGRAM_BOT_TOKEN || 'lebihfit-secret';
    const expectedToken = crypto.createHmac('sha256', secret).update(id.toString()).digest('hex').slice(0, 16);
    if (token !== expectedToken) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(403).send('<h3>Error: Invalid token</h3>');
    }

    // 2. Resolve email from Telegram userId
    const email = await getLinkedEmail(id);
    if (!email) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(404).send('<h3>Error: Akun Telegram lu belum terhubung dengan LebihFit. Silakan hubungkan terlebih dahulu.</h3>');
    }

    // 3. Fetch user logs and profile from Firebase
    const safeEmail = safe(email);
    const profile = await getFirebase(`users/${safeEmail}/lf_profile`) || {};
    const logsData = await getFirebase(`users/${safeEmail}/lf_logs`) || {};

    const dates = getDatesForRange(range, logsData);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const formatPeriodDate = (dStr) => {
      const [y, m, d] = dStr.split('-');
      return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
    };

    let periodStr = '';
    if (range === 'all') {
      periodStr = `Semua Riwayat Data (${dates.length} Hari)`;
    } else {
      const rangeText = {
        '7': 'Mingguan',
        '30': 'Bulanan',
        '90': '3 Bulan',
        '180': '6 Bulan',
        '365': '1 Tahun'
      };
      periodStr = `Laporan ${rangeText[range] || range + ' Hari'} (${formatPeriodDate(dates[0])} – ${formatPeriodDate(dates[dates.length - 1])})`;
    }
    const generationDateStr = formatPeriodDate(dates[dates.length - 1]);

    // 4. Calculate stats and build table rows
    let totalCal = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let tableRowsHtml = '';

    dates.forEach(date => {
      const rawDayLogs = logsData[date] || [];
      const dayLogs = toArray(rawDayLogs);
      
      let dayCal = 0;
      let dayProtein = 0;
      let dayCarbs = 0;
      let dayFat = 0;
      const foodNames = [];

      dayLogs.forEach(item => {
        dayCal += item.cal || 0;
        dayProtein += item.protein || 0;
        dayCarbs += item.carbs || 0;
        dayFat += item.fat || 0;
        foodNames.push(item.name);
      });

      totalCal += dayCal;
      totalProtein += dayProtein;
      totalCarbs += dayCarbs;
      totalFat += dayFat;

      const d = new Date(date);
      const dayName = daysIndo[d.getDay()];

      tableRowsHtml += `
        <tr>
          <td><b>${dayName}</b></td>
          <td>${date.split('-')[2]}/${date.split('-')[1]}</td>
          <td>${dayCal > 0 ? Math.round(dayCal) + ' kcal' : '-'}</td>
          <td>${dayCal > 0 ? dayProtein.toFixed(1) + 'g' : '-'}</td>
          <td>${dayCal > 0 ? dayCarbs.toFixed(1) + 'g' : '-'}</td>
          <td>${dayCal > 0 ? dayFat.toFixed(1) + 'g' : '-'}</td>
          <td style="font-size:0.85rem;color:#8892b0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${foodNames.join(', ')}">
            ${foodNames.length > 0 ? foodNames.join(', ') : '_Tidak ada catatan_'}
          </td>
        </tr>
      `;
    });

    // Add total row
    tableRowsHtml += `
      <tr class="total-row">
        <td colspan="2">TOTAL</td>
        <td>${Math.round(totalCal)} kcal</td>
        <td>${totalProtein.toFixed(1)}g</td>
        <td>${totalCarbs.toFixed(1)}g</td>
        <td>${totalFat.toFixed(1)}g</td>
        <td>-</td>
      </tr>
    `;

    const targetCal = (profile.targets && profile.targets.cal) ? profile.targets.cal : 2000;
    const periodTarget = targetCal * dates.length;
    const avgCal = totalCal / dates.length;
    const remaining = periodTarget - totalCal;

    const remainingStr = `${Math.abs(Math.round(remaining)).toLocaleString()} kcal ${remaining >= 0 ? 'sisa' : 'surplus'}`;
    const statusText = remaining >= 0 ? '🟢 ON TRACK' : '🔴 SURPLUS';
    const statusColor = remaining >= 0 ? '#10b981' : '#b83b3b';

    let statusLabel = 'Status Mingguan';
    if (range === '30') statusLabel = 'Status Bulanan';
    else if (range === '90') statusLabel = 'Status 3 Bulan';
    else if (range === '180') statusLabel = 'Status 6 Bulan';
    else if (range === '365') statusLabel = 'Status 1 Tahun';
    else if (range === 'all') statusLabel = 'Status All Time';

    let chartTitle = 'Grafik Tren Kalori Mingguan';
    if (range === '30') chartTitle = 'Grafik Tren Kalori Bulanan';
    else if (range === '90') chartTitle = 'Grafik Tren Kalori 3 Bulan';
    else if (range === '180') chartTitle = 'Grafik Tren Kalori 6 Bulan';
    else if (range === '365') chartTitle = 'Grafik Tren Kalori 1 Tahun';
    else if (range === 'all') chartTitle = 'Grafik Tren Kalori All Time';

    // 5. SVG Chart calculation with grouping
    let chartPoints = [];
    if (dates.length <= 7) {
      // Daily
      dates.forEach((date) => {
        const rawDayLogs = logsData[date] || [];
        const dayLogs = toArray(rawDayLogs);
        const dayCal = dayLogs.reduce((sum, item) => sum + (item.cal || 0), 0);
        
        const d = new Date(date);
        const dayName = daysIndo[d.getDay()].slice(0, 3);
        chartPoints.push({
          label: dayName,
          val: dayCal
        });
      });
    } else if (dates.length <= 31) {
      // Group by 4 weeks
      const chunkSize = Math.ceil(dates.length / 4);
      for (let w = 0; w < 4; w++) {
        const chunk = dates.slice(w * chunkSize, (w + 1) * chunkSize);
        let sum = 0;
        let count = 0;
        chunk.forEach(date => {
          const rawDayLogs = logsData[date] || [];
          const dayLogs = toArray(rawDayLogs);
          const dayCal = dayLogs.reduce((sum, item) => sum + (item.cal || 0), 0);
          sum += dayCal;
          if (dayCal > 0) count++;
        });
        const avg = count > 0 ? sum / chunk.length : 0;
        chartPoints.push({
          label: `Mgg ${w + 1}`,
          val: avg
        });
      }
    } else {
      // Group by Month
      const monthsData = {};
      dates.forEach(date => {
        const monthKey = date.slice(0, 7); // 'YYYY-MM'
        const rawDayLogs = logsData[date] || [];
        const dayLogs = toArray(rawDayLogs);
        const dayCal = dayLogs.reduce((sum, item) => sum + (item.cal || 0), 0);
        if (!monthsData[monthKey]) {
          monthsData[monthKey] = { sum: 0, days: 0 };
        }
        monthsData[monthKey].sum += dayCal;
        monthsData[monthKey].days += 1;
      });
      
      const sortedMonths = Object.keys(monthsData).sort();
      const activeMonths = sortedMonths.slice(-12); // Limit to last 12 months for chart
      const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      
      activeMonths.forEach(mKey => {
        const [y, m] = mKey.split('-');
        const label = `${monthNamesShort[parseInt(m) - 1]} ${y.slice(2)}`;
        const avg = monthsData[mKey].days > 0 ? monthsData[mKey].sum / monthsData[mKey].days : 0;
        chartPoints.push({
          label: label,
          val: avg
        });
      });
    }

    const maxChartVal = Math.max(...chartPoints.map(p => p.val), 2500);
    const points = [];
    const svgWidth = 700;
    const svgHeight = 160;
    const paddingX = 50;
    const paddingY = 30;
    const widthRange = svgWidth - paddingX * 2;
    const heightRange = svgHeight - paddingY * 2;

    chartPoints.forEach((pt, index) => {
      const x = paddingX + (index * (widthRange / Math.max(chartPoints.length - 1, 1)));
      const y = paddingY + (heightRange - (pt.val / maxChartVal) * heightRange);
      points.push({ x, y, val: pt.val, label: pt.label });
    });

    let polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    let gradientPoints = `50,${svgHeight - paddingY} ` + points.map(p => `${p.x},${p.y}`).join(' ') + ` ${svgWidth - paddingX},${svgHeight - paddingY}`;

    let gridLinesHtml = '';
    const gridLevels = [0, 0.5, 1];
    gridLevels.forEach(lvl => {
      const y = paddingY + (heightRange - lvl * heightRange);
      const label = Math.round(lvl * maxChartVal);
      gridLinesHtml += `
        <line x1="50" y1="${y}" x2="${svgWidth - paddingX}" y2="${y}" stroke="#1e293b" stroke-dasharray="4" />
        <text x="45" y="${y + 4}" text-anchor="end" fill="#8892b0" font-size="9px">${label}</text>
      `;
    });

    let chartPointsHtml = '';
    points.forEach(p => {
      chartPointsHtml += `
        <circle cx="${p.x}" cy="${p.y}" r="5" fill="#b83b3b" stroke="#fff" stroke-width="2" />
        <text x="${p.x}" y="${p.y - 12}" text-anchor="middle" fill="#fff" font-size="10px" font-weight="600">${Math.round(p.val)}</text>
        <text x="${p.x}" y="${svgHeight - 10}" text-anchor="middle" fill="#8892b0" font-size="10px">${p.label}</text>
      `;
    });

    const chartSvgHtml = `
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%; height:auto;">
        <defs>
          <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#b83b3b" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#b83b3b" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        ${gridLinesHtml}
        <polygon points="${gradientPoints}" fill="url(#chart-grad)" />
        <polyline points="${polylinePoints}" fill="none" stroke="#b83b3b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${chartPointsHtml}
      </svg>
    `;

    // 6. Evaluation notes
    const loggedDays = dates.filter(d => {
      const rawDayLogs = logsData[d] || [];
      const dayLogs = toArray(rawDayLogs);
      return dayLogs.length > 0;
    }).length;
    
    let evalNotes = '';
    if (loggedDays === 0) {
      evalNotes = 'Belum ada makanan tercatat untuk periode ini. Catat makanan harian lu secara konsisten di LebihFit agar AI dapat memantau gizi harian lu!';
    } else if (loggedDays < Math.min(4, dates.length)) {
      evalNotes = 'Pencatatan masih kurang konsisten. Usahakan untuk mencatat makanan lebih sering agar analisis tren mingguan/bulanan lu menjadi lebih akurat.';
    } else {
      const ratio = avgCal / targetCal;
      if (ratio <= 0.9) {
        evalNotes = `Secara rata-rata, asupan kalori lu berada di bawah target (${Math.round(avgCal)} vs ${targetCal} kcal). Ini sangat efektif untuk program fat-loss atau cutting. Jaga asupan protein agar massa otot lu tetap terjaga.`;
      } else if (ratio <= 1.05) {
        evalNotes = `Luar biasa konsisten! Asupan harian rata-rata lu berada tepat di sekitar target kalori. Keseimbangan energi dan gizi makro dalam kondisi sangat stabil untuk jangka panjang.`;
      } else {
        evalNotes = `Rata-rata asupan kalori berada di atas target (Surplus). Cocok jika lu sedang dalam fase bulking. Jika ingin memotong lemak (cutting), coba kurangi porsi lemak dan karbohidrat sederhana untuk periode berikutnya.`;
      }
    }

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Laporan Kalori & Gizi LebihFit</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Caveat:wght@700&display=swap');
    
    :root {
      --bg: #0b0f17;
      --card-bg: #111723;
      --accent: #b83b3b;
      --text: #e2e8f0;
      --text-muted: #8892b0;
      --border: #1e293b;
      --success: #10b981;
    }
    
    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    
    .report-container {
      width: 100%;
      max-width: 800px;
      background-color: #0d131f;
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      box-sizing: border-box;
      position: relative;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid var(--accent);
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header-left h1 {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 2px;
      color: #fff;
      margin: 0;
      text-transform: uppercase;
    }
    
    .header-left .period {
      font-size: 0.95rem;
      color: var(--text-muted);
      margin-top: 6px;
    }
    
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .version {
      font-size: 0.8rem;
      background: var(--accent);
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 600;
      letter-spacing: 1px;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }
    
    .summary-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      text-align: center;
      transition: transform 0.2s;
    }
    
    .summary-card:hover {
      transform: translateY(-2px);
    }
    
    .summary-card .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 1.2px;
      font-weight: 600;
    }
    
    .summary-card .value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
    }
    
    .table-container {
      overflow-x: auto;
      margin-bottom: 30px;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
      min-width: 600px;
    }
    
    th {
      background-color: var(--accent);
      color: #fff;
      text-transform: uppercase;
      font-weight: 700;
      padding: 14px;
      text-align: left;
      font-size: 0.75rem;
      letter-spacing: 1.2px;
    }
    
    td {
      padding: 14px;
      border-bottom: 1px solid var(--border);
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:nth-child(even) td {
      background-color: #0f1522;
    }
    
    .total-row td {
      font-weight: 700;
      background-color: #161f30 !important;
      border-top: 2px solid var(--accent);
      color: #fff;
    }
    
    .chart-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 30px;
    }
    
    .chart-title {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 20px;
      letter-spacing: 1.2px;
      font-weight: 600;
      text-align: center;
    }
    
    .evaluation-card {
      background: #f8fafc;
      color: #0f172a;
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 30px;
      border-left: 6px solid var(--accent);
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    
    .evaluation-card h4 {
      margin: 0 0 8px 0;
      text-transform: uppercase;
      font-size: 0.8rem;
      color: #64748b;
      letter-spacing: 1.2px;
      font-weight: 700;
    }
    
    .evaluation-card p {
      margin: 0;
      font-family: 'Caveat', cursive;
      font-size: 1.6rem;
      line-height: 1.3;
      color: #1e293b;
    }
    
    .control-bar {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 12px 24px;
      border-radius: 10px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.95rem;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      transition: background 0.2s, transform 0.1s;
    }
    
    .btn:hover {
      background: #9d2f2f;
    }
    
    .btn:active {
      transform: scale(0.98);
    }
    
    .footer-text {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 40px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
    }
    
    @media print {
      body {
        background: #fff;
        color: #000;
        padding: 0;
      }
      .report-container {
        border: none;
        box-shadow: none;
        padding: 0;
        background: transparent;
        max-width: 100%;
      }
      .control-bar {
        display: none;
      }
      .summary-card {
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #000;
      }
      .summary-card .value {
        color: #000;
      }
      th {
        background-color: var(--accent) !important;
        color: #fff !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      td {
        border-bottom: 1px solid #e2e8f0;
        color: #000;
      }
      tr:nth-child(even) td {
        background-color: #f8fafc;
      }
      .chart-container {
        border: 1px solid #cbd5e1;
        background: #f8fafc;
      }
      .evaluation-card {
        border: 1px solid #cbd5e1;
        border-left: 6px solid var(--accent);
        background: #fff;
      }
      .footer-text {
        border-top: 1px solid #cbd5e1;
      }
    }
    
    @media (max-width: 600px) {
      body {
        padding: 10px;
      }
      .report-container {
        padding: 20px 15px;
        border-radius: 12px;
      }
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 20px;
        padding-bottom: 15px;
      }
      .header-left h1 {
        font-size: 1.5rem;
      }
      .header-right {
        align-self: flex-start;
      }
      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-bottom: 20px;
      }
      .summary-card {
        padding: 12px 8px;
        border-radius: 10px;
      }
      .summary-card .label {
        font-size: 0.65rem;
        margin-bottom: 4px;
        letter-spacing: 0.8px;
      }
      .summary-card .value {
        font-size: 1.15rem;
      }
      .control-bar {
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 16px;
        width: 100%;
      }
      .btn {
        flex: 1;
        justify-content: center;
        font-size: 0.8rem;
        padding: 10px 12px;
        border-radius: 8px;
      }
      .chart-container {
        padding: 15px;
        margin-bottom: 20px;
      }
      .evaluation-card {
        padding: 16px;
        margin-bottom: 20px;
      }
      .evaluation-card p {
        font-size: 1.35rem;
      }
    }
  </style>
</head>
<body>

  <div class="report-container" id="reportContent">
    <div class="control-bar" id="controls">
      <button onclick="window.print()" class="btn">🖨️ Cetak / Simpan PDF</button>
    </div>

    <div>
      <div class="header">
        <div class="header-left">
          <h1>Laporan Kalori LebihFit</h1>
          <div class="period">${periodStr}</div>
        </div>
        <div class="header-right">
          <span class="version">CALORIE_TRACKER v1.0</span>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Total Kalori Masuk</div>
          <div class="value">${Math.round(totalCal).toLocaleString()} kcal</div>
        </div>
        <div class="summary-card">
          <div class="label">Rata-Rata Harian</div>
          <div class="value">${Math.round(avgCal).toLocaleString()} kcal</div>
        </div>
        <div class="summary-card">
          <div class="label">Kekurangan/Sisa</div>
          <div class="value">${remainingStr}</div>
        </div>
        <div class="summary-card">
          <div class="label">\${statusLabel}</div>
          <div class="value" style="color: \${statusColor};">\${statusText}</div>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Hari</th>
              <th>Tanggal</th>
              <th>Kalori (kcal)</th>
              <th>Protein (g)</th>
              <th>Karbo (g)</th>
              <th>Lemak (g)</th>
              <th>Daftar Makanan</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>

      <div class="chart-container">
        <div class="chart-title">\${chartTitle}</div>
        <div>
          \${chartSvgHtml}
        </div>
      </div>

      <div class="evaluation-card">
        <h4>Catatan Evaluasi AI / Gizi</h4>
        <p>${evalNotes}</p>
      </div>

      <div class="footer-text">
        Laporan dibuat otomatis pada ${generationDateStr} | WWW.LEBIHFIT.CO
      </div>
    </div>
  </div>

</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (err) {
    console.error('API Report Error:', err);
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(`<h3>Internal Server Error: ${err.message}</h3>`);
  }
};
