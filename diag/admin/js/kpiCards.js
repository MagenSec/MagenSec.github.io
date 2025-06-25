// Modular KPI Cards rendering as tiles in 2 rows, 4 columns
function renderKpiCards(kpis) {
  const row = document.getElementById('kpiCardsRow');
  if (!row) return;
  row.innerHTML = '';
  // Group KPIs: row 1: Devices, CPU Avg, CPU Max, CPU Min; row 2: Processes, Mem Avg, Mem Max, Mem Min
  const row1 = document.createElement('div');
  row1.className = 'kpi-tile-row';
  const row2 = document.createElement('div');
  row2.className = 'kpi-tile-row';
  // Find KPIs by title
  const get = t => kpis.find(k => k.title === t) || { title: t, value: '-', desc: '' };
  const tiles1 = [get('Devices'), get('CPU Avg'), get('CPU Max'), get('CPU Min')];
  const tiles2 = [get('Processes'), get('Mem Avg (MB)'), get('Mem Max (MB)'), get('Mem Min (MB)')];
  tiles1.forEach(kpi => {
    const card = document.createElement('div');
    card.className = 'kpi-card kpi-tile';
    card.innerHTML = `
      <div class="kpi-title">${kpi.title}</div>
      <div class="kpi-value">${kpi.value}</div>
      <div class="kpi-desc">${kpi.desc || ''}</div>
    `;
    row1.appendChild(card);
  });
  tiles2.forEach(kpi => {
    const card = document.createElement('div');
    card.className = 'kpi-card kpi-tile';
    card.innerHTML = `
      <div class="kpi-title">${kpi.title}</div>
      <div class="kpi-value">${kpi.value}</div>
      <div class="kpi-desc">${kpi.desc || ''}</div>
    `;
    row2.appendChild(card);
  });
  row.appendChild(row1);
  row.appendChild(row2);
}
window.renderKpiCards = renderKpiCards;
