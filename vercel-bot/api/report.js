const { getFirebase, toArray, safe, getLinkedEmail } = require('../lib/firebase');
const crypto = require('crypto');

function getPast7DaysWib() {
  const dates = [];
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const wib = new Date(utc + (3600000 * 7));
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(wib);
    d.setDate(wib.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

module.exports = async function handler(req, res) {
  try {
    const { id, token } = req.query;
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

    const dates = getPast7DaysWib();
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const formatPeriodDate = (dStr) => {
      const [y, m, d] = dStr.split('-');
      return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
    };

    const periodStr = `Periode: ${formatPeriodDate(dates[0])} – ${formatPeriodDate(dates[6])}`;
    const generationDateStr = formatPeriodDate(dates[6]);

    // 4. Calculate stats and build table rows
    let totalCal = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    const calHistory = [];
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
      calHistory.push(dayCal);

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
    const weeklyTarget = targetCal * 7;
    const avgCal = totalCal / 7;
    const remaining = weeklyTarget - totalCal;

    const remainingStr = `${Math.abs(Math.round(remaining)).toLocaleString()} kcal ${remaining >= 0 ? 'sisa' : 'surplus'}`;
    const statusText = remaining >= 0 ? '🟢 ON TRACK' : '🔴 SURPLUS';
    const statusColor = remaining >= 0 ? '#10b981' : '#b83b3b';

    // 5. SVG Chart calculation
    const maxCal = Math.max(...calHistory, 2500);
    const points = [];
    const svgWidth = 700;
    const svgHeight = 160;
    const paddingX = 50;
    const paddingY = 30;
    const widthRange = svgWidth - paddingX * 2;
    const heightRange = svgHeight - paddingY * 2;

    calHistory.forEach((val, index) => {
      const x = paddingX + (index * (widthRange / 6));
      const y = paddingY + (heightRange - (val / maxCal) * heightRange);
      
      const d = new Date(dates[index]);
      const dayName = daysIndo[d.getDay()].slice(0,3);
      points.push({ x, y, val, day: dayName });
    });

    let polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    let gradientPoints = `50,${svgHeight - paddingY} ` + points.map(p => `${p.x},${p.y}`).join(' ') + ` ${svgWidth - paddingX},${svgHeight - paddingY}`;

    let gridLinesHtml = '';
    const gridLevels = [0, 0.5, 1];
    gridLevels.forEach(lvl => {
      const y = paddingY + (heightRange - lvl * heightRange);
      const label = Math.round(lvl * maxCal);
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
        <text x="${p.x}" y="${svgHeight - 10}" text-anchor="middle" fill="#8892b0" font-size="10px">${p.day}</text>
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
    const loggedDays = calHistory.filter(c => c > 0).length;
    let evalNotes = '';
    if (loggedDays === 0) {
      evalNotes = 'Belum ada makanan tercatat untuk minggu ini. Catat makanan harian lu secara konsisten di LebihFit agar AI dapat memantau gizi harian lu!';
    } else if (loggedDays < 4) {
      evalNotes = 'Pencatatan masih bolong-bolong minggu ini. Usahakan catat minimal 5-6 hari seminggu agar lu dapet gambaran performa target kalori harian yang akurat.';
    } else {
      const ratio = avgCal / targetCal;
      if (ratio <= 0.9) {
        evalNotes = 'Asupan kalori rata-rata harian berada di bawah target (Defisit). Sangat bagus untuk program fat-loss atau cutting. Pertahankan asupan protein harian agar massa otot tetap terjaga!';
      } else if (ratio <= 1.05) {
        evalNotes = 'Luar biasa! Kalori rata-rata mingguan lu hampir persis di target harian. Kepatuhan nutrisi lu sangat stabil dan terkontrol dengan baik minggu ini.';
      } else {
        evalNotes = 'Asupan kalori mingguan lu melebihi target (Surplus). Jika program lu bulking, pastikan surplus bersih dan didukung latihan beban. Jika program cutting, coba batasi porsi karbo/lemak minggu depan.';
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
          <div class="label">Status Mingguan</div>
          <div class="value" style="color: ${statusColor};">${statusText}</div>
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
        <div class="chart-title">Grafik Tren Kalori Mingguan</div>
        <div>
          ${chartSvgHtml}
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
