// Modular Charts rendering using global Chart.js
function renderCharts(charts) {
  const section = document.getElementById('chartsSection');
  if (!section) return;
  section.innerHTML = '';
  charts.forEach(chart => {
    const chartDiv = document.createElement('div');
    chartDiv.className = 'chart-container';
    chartDiv.innerHTML = `<canvas id="${chart.id}"></canvas><div class="chart-title">${chart.title}</div>`;
    section.appendChild(chartDiv);
    // Render chart using global Chart.js
    if (window.Chart) {
      new Chart(document.getElementById(chart.id), {
        type: chart.type,
        data: chart.data,
        options: chart.options || { responsive: true, plugins: { legend: { display: true } } }
      });
    }
  });
}
window.renderCharts = renderCharts;
