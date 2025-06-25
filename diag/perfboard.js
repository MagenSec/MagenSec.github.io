// perfboard.js
// Main logic for the performance dashboard

let rawData = [], chart, refreshTimer = null;
let materialAccess = null;

async function fetchPerfData() {
  if (!materialAccess) {
    materialAccess = await loadPerfKeyMaterial('temp.a', 'debugOutput');
  }
  const res = await fetch(materialAccess, { headers: { Accept: "application/json" } });
  const data = await res.json();
  return data.value.map(item => ({
    org: item.Context1,
    device: item.Context2,
    version: item.AppVersion,
    process: item.ProcessName,
    cpuAvg: item.CpuAvg,
    cpuMin: item.CpuMin,
    cpuMax: item.CpuMax,
    memAvg: item.MemAvgMB,
    memMin: item.MemMinMB,
    memMax: item.MemMaxMB,
    time: new Date(item.WindowEnd)
  }));
}

function populateFilterOptions(data) {
  ["org", "device", "process", "version"].forEach(key => {
    const select = document.getElementById(key + "Filter");
    [...new Set(data.map(d => d[key]))].sort().forEach(val => {
      select.innerHTML += `<option value="${val}">${val}</option>`;
    });
  });
}

function filterData(data) {
  const [org, device, process, version] = ["org", "device", "process", "version"].map(k => document.getElementById(k + "Filter").value);
  const [start, end] = [document.getElementById("startDate").valueAsDate, document.getElementById("endDate").valueAsDate];
  return data.filter(d =>
    (org === "all" || d.org === org) &&
    (device === "all" || d.device === device) &&
    (process === "all" || d.process === process) &&
    (version === "all" || d.version === version) &&
    (!start || d.time >= new Date(start.setHours(0,0,0))) &&
    (!end || d.time <= new Date(end.setHours(23,59,59)))
  );
}

function roundTime(date, g) {
  const d = new Date(date);
  if (g === 'hour') d.setMinutes(0,0,0);
  else if (g === '6h') d.setHours(Math.floor(d.getHours()/6)*6,0,0,0);
  else if (g === '12h') d.setHours(Math.floor(d.getHours()/12)*12,0,0,0);
  else if (g === 'day') d.setHours(0,0,0,0);
  else if (g === 'week') { const diff = d.getDate() - d.getDay(); d.setDate(diff); d.setHours(0,0,0,0); }
  return d;
}

function aggregateData(data) {
  const g = document.getElementById("aggregationFilter").value;
  if (g === "none") return data;
  const grouped = {};
  for (const row of data) {
    const time = roundTime(row.time, g);
    const key = row.process + time;
    if (!grouped[key]) grouped[key] = { ...row, time, count: 0 };
    const r = grouped[key];
    r.cpuAvg += row.cpuAvg; r.cpuMin = Math.min(r.cpuMin, row.cpuMin); r.cpuMax = Math.max(r.cpuMax, row.cpuMax);
    r.memAvg += row.memAvg; r.memMin = Math.min(r.memMin, row.memMin); r.memMax = Math.max(r.memMax, row.memMax);
    r.count++;
  }
  return Object.values(grouped).map(r => ({ ...r, cpuAvg: r.cpuAvg/r.count, memAvg: r.memAvg/r.count }));
}

function renderMainChart(data) {
  const ctx = document.getElementById("mainChart");
  if (chart) chart.destroy();

  const selectedMetrics = Array.from(document.getElementById("metricFilter").selectedOptions).map(o => o.value);
  const labels = [...new Set(data.map(d => d.time.toLocaleString()))];
  const processes = [...new Set(data.map(d => d.process))];
  const datasets = [];
  const colors = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0'];

  processes.forEach((p, i) => {
    const pd = data.filter(d => d.process === p);
    selectedMetrics.forEach(metric => {
      datasets.push({
        label: `${p} (${metric})`,
        data: pd.map(d => d[metric]),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        fill: false
      });
    });
  });

  const annotations = selectedMetrics.flatMap(metric => {
    if (metric.includes('cpu')) return [{ type: 'line', yMin: 10, yMax: 10, borderColor: 'orange', borderWidth: 1, label: { content: '10%', enabled: true } },
                                        { type: 'line', yMin: 20, yMax: 20, borderColor: 'red', borderWidth: 1, label: { content: '20%', enabled: true } }];
    if (metric.includes('mem')) return [{ type: 'line', yMin: 50, yMax: 50, borderColor: 'orange', borderWidth: 1, label: { content: '50MB', enabled: true } },
                                        { type: 'line', yMin: 100, yMax: 100, borderColor: 'red', borderWidth: 1, label: { content: '100MB', enabled: true } }];
    return [];
  });

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: selectedMetrics.join(', ') + " by Process" },
        legend: { labels: { font: { size: 14 }, padding: 20 } },
        annotation: { annotations }
      },
      scales: {
        x: { title: { display: true, text: "Time" } },
        y: { beginAtZero: true }
      }
    }
  });
}

function updateDashboard() {
  const filtered = filterData(rawData);
  const data = aggregateData(filtered);
  renderMainChart(data);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById("exportBtn").addEventListener("click", () => {
    const rows = ["Process,Time,CpuAvg,CpuMin,CpuMax,MemAvg,MemMin,MemMax"];
    const data = aggregateData(filterData(rawData));
    data.forEach(d => rows.push(`${d.process},${d.time.toISOString()},${d.cpuAvg},${d.cpuMin},${d.cpuMax},${d.memAvg},${d.memMin},${d.memMax}`));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "telemetry.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("themeToggle").addEventListener("click", () => {
    const body = document.body;
    const dark = body.style.backgroundColor !== "white";
    body.style.backgroundColor = dark ? "white" : "#1e1e1e";
    body.style.color = dark ? "#000" : "#eee";
    document.querySelectorAll("#filters select, #filters input, #filters button").forEach(el => {
      el.style.backgroundColor = dark ? "#fff" : "#333";
      el.style.color = dark ? "#000" : "#eee";
    });
  });

  document.querySelectorAll("#filters select, #filters input").forEach(e => e.addEventListener("change", () => {
    const interval = parseInt(document.getElementById("refreshRate").value);
    clearInterval(refreshTimer);
    if (interval > 0) refreshTimer = setInterval(updateDashboard, interval);
    updateDashboard();
  }));

  fetchPerfData().then(data => {
    rawData = data;
    populateFilterOptions(rawData);
    updateDashboard();
  });
});
