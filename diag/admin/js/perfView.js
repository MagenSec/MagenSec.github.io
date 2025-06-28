/*
 * TODO (handoff):
 * - Ensure perfViewInit is only called by the view loader after DOM is ready (not from perfView.js itself).
 * - Fix timezone toggle and chart rendering race: only render after DOM and container are present.
 * - Extend dashboardView.js patterns (modular filters, animated KPIs, Google Charts) to all other views (apps, installs, security, reports).
 * - Replace static dashboard tiles with animated Google Charts gauges/charts.
 * - Add more KPIs and analytics as needed.
 * - Document any new patterns in COPILOT.md and .copilot/config.json.
 * - Continue incremental, modular, and secure enhancements.
 */

// perfView.js: Renders the Performance Monitoring view.

async function loadPerfData(container, { dataService }, days = 1) {
  console.log(`Loading performance data for last ${days} day(s).`);
  let contentWrapper = container.querySelector('.perf-content-wrapper');
  if (contentWrapper) {
      contentWrapper.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;
  }

  try {
    const org = sessionStorage.getItem('org') || 'Global';
    const { summary, timeSeries } = await dataService.getPerformanceData(org, days);

    await window.charting.googleChartsLoaded;
    renderPerfView(container, summary, timeSeries);

  } catch (error) {
    console.error('Error initializing performance view:', error);
    if(contentWrapper) {
        contentWrapper.innerHTML = `<div class="alert alert-danger">Failed to load performance data. Please try again later.</div>`;
    }
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function rateOfChange(current, previous) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function renderPerfKpiCard({
  id, title, icon, unit, values, trend, rate, subheader
}) {
  // values: { avg, min, max, p99 }
  // trend: array of numbers
  // rate: percent
  return `
    <div class="col h-100">
      <div class="card card-sm container-x1 h-100" style="min-height: 155px;">
        <div class="card-body py-2 px-2 d-flex flex-column justify-content-between h-100">
          <div>
            <div class="d-flex align-items-center mb-1">
              <span class="avatar avatar-xs bg-blue-lt me-2"><i class="${icon}"></i></span>
              <div class="subheader text-muted small flex-fill">${subheader}</div>
            </div>
            <div class="d-flex align-items-end justify-content-between">
              <div>
                <div class="h3 mb-0">${values.avg.toFixed(2)} ${unit.replace('/device', '/Device')}</div>
                <div class="text-muted small">Min: ${values.min.toFixed(2)}, Max: ${values.max.toFixed(2)}</div>
                <div class="text-muted small">P99: ${values.p99.toFixed(2)}</div>
              </div>
              <div class="ms-2">
                <span class="badge bg-${rate >= 0 ? 'green' : 'red'}-lt">
                  ${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
          <div class="mt-1 w-100 flex-grow-1 d-flex align-items-end">
            <div id="sparkline-${id}" style="height:38px;width:100%"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPerfView(container, summary, timeSeries, prevTimeSeries) {
  // Generate mock/demo data if missing
  const safe = (v, fallback) => typeof v === 'number' && !isNaN(v) ? v : fallback;
  summary.DbSizeMB = safe(summary.DbSizeMB, 512 + Math.round(Math.random() * 256));
  summary.NetworkByteSent = safe(summary.NetworkByteSent, 1_000_000 + Math.round(Math.random() * 1_000_000));
  summary.NetworkByteReceived = safe(summary.NetworkByteReceived, 2_000_000 + Math.round(Math.random() * 1_000_000));
  summary.NetworkRequests = safe(summary.NetworkRequests, 1000 + Math.round(Math.random() * 500));
  summary.NetworkFailures = safe(summary.NetworkFailures, Math.round(Math.random() * 10));

  // Add mock time series if missing
  if (!timeSeries || !Array.isArray(timeSeries) || timeSeries.length === 0 || !('DbSizeMB' in timeSeries[0])) {
    const now = Date.now();
    timeSeries = Array.from({length: 24}, (_, i) => {
      return {
        timestamp: now - (23 - i) * 3600 * 1000,
        cpu: Math.random() * 100,
        memory: 1024 + Math.random() * 1024,
        diskRead: Math.random() * 10,
        diskWrite: Math.random() * 10,
        DbSizeMB: 512 + Math.random() * 256,
        NetworkByteSent: 1_000_000 + Math.random() * 1_000_000,
        NetworkByteReceived: 2_000_000 + Math.random() * 1_000_000,
        NetworkRequests: 1000 + Math.random() * 500,
        NetworkFailures: Math.random() * 10
      };
    });
  }

  // Compute per-device MB values and stats
  const deviceCount = summary.deviceCount || 1;
  // For DB/network, compute min, max, avg per device for cards
  const dbPerDeviceArr = timeSeries.map(d => d.DbSizeMB / (d.deviceCount || 1));
  const netSentPerDeviceArr = timeSeries.map(d => d.NetworkByteSent / (d.deviceCount || 1) / 1024 / 1024);
  const netRecvPerDeviceArr = timeSeries.map(d => d.NetworkByteReceived / (d.deviceCount || 1) / 1024 / 1024);
  const netReqPerDeviceArr = timeSeries.map(d => d.NetworkRequests / (d.deviceCount || 1));
  const netFailPerDeviceArr = timeSeries.map(d => d.NetworkFailures / (d.deviceCount || 1));

  // For legacy code compatibility, define dbArr, netSentArr, netRecvArr, netReqArr, netFailArr as per-device arrays
  const dbArr = dbPerDeviceArr;
  const netSentArr = netSentPerDeviceArr;
  const netRecvArr = netRecvPerDeviceArr;
  const netReqArr = netReqPerDeviceArr;
  const netFailArr = netFailPerDeviceArr;

  // Previous period for rate of change
  const prevDbAvg = prevTimeSeries ? prevTimeSeries.map(d => d.DbSizeMB / deviceCount).reduce((a,b)=>a+b,0)/prevTimeSeries.length : dbArr[0];
  const prevNetSentAvg = prevTimeSeries ? prevTimeSeries.map(d => d.NetworkByteSent / deviceCount / 1024 / 1024).reduce((a,b)=>a+b,0)/prevTimeSeries.length : netSentArr[0];
  const prevNetRecvAvg = prevTimeSeries ? prevTimeSeries.map(d => d.NetworkByteReceived / deviceCount / 1024 / 1024).reduce((a,b)=>a+b,0)/prevTimeSeries.length : netRecvArr[0];
  const prevNetReqAvg = prevTimeSeries ? prevTimeSeries.map(d => d.NetworkRequests / deviceCount).reduce((a,b)=>a+b,0)/prevTimeSeries.length : netReqArr[0];
  const prevNetFailAvg = prevTimeSeries ? prevTimeSeries.map(d => d.NetworkFailures / deviceCount).reduce((a,b)=>a+b,0)/prevTimeSeries.length : netFailArr[0];

  // ---
  // Row 1: CPU & Memory KPI Tiles (original style)
  // ---
  const kpiTiles = `
    <div class="col-lg-6">
      <div class="card">
        <div class="card-header"><h3 class="card-title">CPU Usage</h3></div>
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-4 text-center"><div id="gauge-cpu-min" class="kpi-gauge-sm"></div><div class="text-muted mt-1">Min</div></div>
            <div class="col-4 text-center"><div id="gauge-cpu-avg" class="kpi-gauge-lg"></div><div class="h3 mt-2 mb-0">Average</div></div>
            <div class="col-4 text-center"><div id="gauge-cpu-max" class="kpi-gauge-sm"></div><div class="text-muted mt-1">Max</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-lg-6">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Memory Usage</h3></div>
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-4 text-center"><div id="gauge-mem-min" class="kpi-gauge-sm"></div><div class="text-muted mt-1">Min</div></div>
            <div class="col-4 text-center"><div id="gauge-mem-avg" class="kpi-gauge-lg"></div><div class="h3 mt-2 mb-0">Average</div></div>
            <div class="col-4 text-center"><div id="gauge-mem-max" class="kpi-gauge-sm"></div><div class="text-muted mt-1">Max</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ---
  // Row 2: Tabler-style Database/Network KPI Cards
  // ---
  const kpiCards = [
    renderPerfKpiCard({
      id: 'db',
      title: 'Database Size',
      icon: 'ti ti-database',
      unit: 'MB/device',
      subheader: 'Database Size',
      values: {
        avg: dbPerDeviceArr.reduce((a,b)=>a+b,0)/dbPerDeviceArr.length,
        min: Math.min(...dbPerDeviceArr),
        max: Math.max(...dbPerDeviceArr),
        p99: percentile(dbPerDeviceArr, 99)
      },
      trend: dbPerDeviceArr,
      rate: rateOfChange(dbPerDeviceArr.reduce((a,b)=>a+b,0)/dbPerDeviceArr.length, prevDbAvg)
    }),
    renderPerfKpiCard({
      id: 'netsent',
      title: 'Net Sent',
      icon: 'ti ti-upload',
      unit: 'MB/device',
      subheader: 'Network Sent',
      values: {
        avg: netSentPerDeviceArr.reduce((a,b)=>a+b,0)/netSentPerDeviceArr.length,
        min: Math.min(...netSentPerDeviceArr),
        max: Math.max(...netSentPerDeviceArr),
        p99: percentile(netSentPerDeviceArr, 99)
      },
      trend: netSentPerDeviceArr,
      rate: rateOfChange(netSentPerDeviceArr.reduce((a,b)=>a+b,0)/netSentPerDeviceArr.length, prevNetSentAvg)
    }),
    renderPerfKpiCard({
      id: 'netrecv',
      title: 'Net Received',
      icon: 'ti ti-download',
      unit: 'MB/device',
      subheader: 'Network Received',
      values: {
        avg: netRecvPerDeviceArr.reduce((a,b)=>a+b,0)/netRecvPerDeviceArr.length,
        min: Math.min(...netRecvPerDeviceArr),
        max: Math.max(...netRecvPerDeviceArr),
        p99: percentile(netRecvPerDeviceArr, 99)
      },
      trend: netRecvPerDeviceArr,
      rate: rateOfChange(netRecvPerDeviceArr.reduce((a,b)=>a+b,0)/netRecvPerDeviceArr.length, prevNetRecvAvg)
    }),
    renderPerfKpiCard({
      id: 'netreq',
      title: 'Requests',
      icon: 'ti ti-network',
      unit: '/device',
      subheader: 'Requests',
      values: {
        avg: netReqPerDeviceArr.reduce((a,b)=>a+b,0)/netReqPerDeviceArr.length,
        min: Math.min(...netReqPerDeviceArr),
        max: Math.max(...netReqPerDeviceArr),
        p99: percentile(netReqPerDeviceArr, 99)
      },
      trend: netReqPerDeviceArr,
      rate: rateOfChange(netReqPerDeviceArr.reduce((a,b)=>a+b,0)/netReqPerDeviceArr.length, prevNetReqAvg)
    }),
    renderPerfKpiCard({
      id: 'netfail',
      title: 'Failures',
      icon: 'ti ti-alert-triangle',
      unit: '/device',
      subheader: 'Failures',
      values: {
        avg: netFailPerDeviceArr.reduce((a,b)=>a+b,0)/netFailPerDeviceArr.length,
        min: Math.min(...netFailPerDeviceArr),
        max: Math.max(...netFailPerDeviceArr),
        p99: percentile(netFailPerDeviceArr, 99)
      },
      trend: netFailPerDeviceArr,
      rate: rateOfChange(netFailPerDeviceArr.reduce((a,b)=>a+b,0)/netFailPerDeviceArr.length, prevNetFailAvg)
    })
  ].join('');

  const kpiRow = `<div class="row row-cols-1 row-cols-sm-2 row-cols-lg-5 g-2 mb-3 mt-3">${kpiCards}</div>`;

  const viewHTML = `
    <div class="row row-deck row-cards">
      ${kpiTiles}
    </div>
    ${kpiRow}
    <div class="row row-deck row-cards mt-4">
      <div class="col-lg-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">CPU Utilization Over Time (Hourly Avg)</h3>
          </div>
          <div class="card-body">
            <div id="cpu-timeseries-chart" style="height: 300px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
      <div class="col-lg-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Memory Usage Over Time (Hourly Avg)</h3>
          </div>
          <div class="card-body">
            <div id="mem-timeseries-chart" style="height: 300px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
      <div class="col-lg-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Network Usage Over Time</h3>
          </div>
          <div class="card-body">
            <div id="network-timeseries-chart" style="height: 300px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
      <div class="col-lg-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Database Size Over Time</h3>
          </div>
          <div class="card-body">
            <div id="dbsize-timeseries-chart" style="height: 300px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  let contentWrapper = container.querySelector('.perf-content-wrapper');
  if (contentWrapper) {
    contentWrapper.innerHTML = viewHTML;
  }

  // Render original CPU/Memory gauges
  window.charting.renderGauge('gauge-cpu-min', 'Min', summary.minCpu, { type: 'cpu' });
  window.charting.renderGauge('gauge-cpu-avg', 'Avg', summary.avgCpu, { type: 'cpu' });
  window.charting.renderGauge('gauge-cpu-max', 'Max', summary.peakCpu, { type: 'cpu' });
  window.charting.renderGauge('gauge-mem-min', 'Min', summary.minMem, { type: 'memory', max: summary.peakMem * 1.1 });
  window.charting.renderGauge('gauge-mem-avg', 'Avg', summary.avgMem, { type: 'memory', max: summary.peakMem * 1.1 });
  window.charting.renderGauge('gauge-mem-max', 'Max', summary.peakMem, { type: 'memory', max: summary.peakMem * 1.1 });

  // Render sparklines for new KPIs with no left padding and more height
  window.charting.renderAreaChart('sparkline-db', dbArr.map((v,i)=>[i,v]), ['Index', 'DB'], { legend: { position: 'none' }, chartArea: { left: 0, top: 0, width: '100%', height: '95%' }, vAxisTitle: '', hAxisFormat: '', colors: ['#8b5cf6'], height: 38 });
  window.charting.renderAreaChart('sparkline-netsent', netSentArr.map((v,i)=>[i,v]), ['Index', 'Sent'], { legend: { position: 'none' }, chartArea: { left: 0, top: 0, width: '100%', height: '95%' }, vAxisTitle: '', hAxisFormat: '', colors: ['#206bc4'], height: 38 });
  window.charting.renderAreaChart('sparkline-netrecv', netRecvArr.map((v,i)=>[i,v]), ['Index', 'Recv'], { legend: { position: 'none' }, chartArea: { left: 0, top: 0, width: '100%', height: '95%' }, vAxisTitle: '', hAxisFormat: '', colors: ['#2fb344'], height: 38 });
  window.charting.renderAreaChart('sparkline-netreq', netReqArr.map((v,i)=>[i,v]), ['Index', 'Req'], { legend: { position: 'none' }, chartArea: { left: 0, top: 0, width: '100%', height: '95%' }, vAxisTitle: '', hAxisFormat: '', colors: ['#f59f00'], height: 38 });
  window.charting.renderAreaChart('sparkline-netfail', netFailArr.map((v,i)=>[i,v]), ['Index', 'Fail'], { legend: { position: 'none' }, chartArea: { left: 0, top: 0, width: '100%', height: '95%' }, vAxisTitle: '', hAxisFormat: '', colors: ['#d63939'], height: 38 });

  // Render main charts
  const cpuData = timeSeries.map(d => [new Date(d.timestamp), d.cpu]);
  const memData = timeSeries.map(d => [new Date(d.timestamp), d.memory]);
  const netData = timeSeries.map(d => [new Date(d.timestamp), d.NetworkByteSent / deviceCount / 1024 / 1024, d.NetworkByteReceived / deviceCount / 1024 / 1024]);
  const dbSizeData = timeSeries.map(d => [new Date(d.timestamp), d.DbSizeMB / deviceCount]);
  window.charting.renderAreaChart('cpu-timeseries-chart', cpuData, ['Time', 'CPU'], { vAxisTitle: 'CPU (%)', hAxisFormat: 'MMM d, HH:mm' });
  window.charting.renderAreaChart('mem-timeseries-chart', memData, ['Time', 'Memory'], { vAxisTitle: 'Memory (MB)', hAxisFormat: 'MMM d, HH:mm' });
  window.charting.renderAreaChart('network-timeseries-chart', netData, ['Time', 'Sent', 'Received'], { vAxisTitle: 'MB/device', hAxisFormat: 'MMM d, HH:mm', colors: ['#206bc4', '#2fb344'], isStacked: true });
  window.charting.renderAreaChart('dbsize-timeseries-chart', dbSizeData, ['Time', 'DB Size'], { vAxisTitle: 'MB/device', hAxisFormat: 'MMM d, HH:mm', colors: ['#8b5cf6'] });
}

window.perfViewInit = async function(container, { dataService }) {
  if (!container) {
    console.error('Performance view requires a container element.');
    return;
  }
  window.dataService = dataService; // Make it available for event handlers

  container.innerHTML = `
    <div class="d-flex justify-content-end mb-3 perf-filter-bar">
        <div class="btn-group">
            <button class="btn btn-sm btn-primary" data-days="1">24 Hours</button>
            <button class="btn btn-sm btn-outline-secondary" data-days="7">7 Days</button>
            <button class="btn btn-sm btn-outline-secondary" data-days="30">30 Days</button>
        </div>
    </div>
    <div class="perf-content-wrapper"></div>
  `;

  container.querySelectorAll('.perf-filter-bar .btn').forEach(button => {
      button.addEventListener('click', (e) => {
          container.querySelectorAll('.perf-filter-bar .btn').forEach(btn => {
              btn.classList.remove('btn-primary');
              btn.classList.add('btn-outline-secondary');
          });
          e.target.classList.remove('btn-outline-secondary');
          e.target.classList.add('btn-primary');

          const selectedDays = parseInt(e.target.dataset.days, 10);
          loadPerfData(container, { dataService: window.dataService }, selectedDays);
      });
  });

  await loadPerfData(container, { dataService }, 1);
};

(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }
    window.viewInitializers.performance = async function(container, { dataService }) {
        console.log('Initializing Performance Monitoring view...');
        // Create a wrapper for the content and controls
        container.innerHTML = `
            <div class="d-flex justify-content-end align-items-center mb-3">
                <div class="text-muted me-2">Time Range:</div>
                <div class="btn-group" role="group" id="perf-time-range">
                    <button type="button" class="btn btn-sm btn-outline-primary active" data-days="1">24 Hours</button>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-days="7">7 Days</button>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-days="30">30 Days</button>
                </div>
            </div>
            <div class="perf-content-wrapper"></div>
        `;

        const contentWrapper = container.querySelector('.perf-content-wrapper');

        // Function to load data for the selected time range
        const loadDataForRange = async (days) => {
            await loadPerfData(container, { dataService }, days);
        };

        // Add event listeners to time range buttons
        container.querySelector('#perf-time-range').addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button && !button.classList.contains('active')) {
                // Update active state
                container.querySelectorAll('#perf-time-range button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                const days = parseInt(button.dataset.days, 10);
                loadDataForRange(days);
            }
        });

        // Initial load for the default time range (1 day)
        await loadDataForRange(1);
    };
})();