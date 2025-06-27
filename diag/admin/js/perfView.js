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
window.perfViewInit = async function(container) {
  if (!container) {
    console.error('Performance view requires a container element.');
    return;
  }

  console.log('Initializing Performance Monitoring view...');
  container.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;

  // Load Google Charts
  const googleChartsLoaded = new Promise(resolve => {
    google.charts.load('current', { 'packages': ['corechart'] });
    google.charts.setOnLoadCallback(resolve);
  });

  try {
    const org = sessionStorage.getItem('org') || 'Global';
    const { summary, timeSeries } = await dataService.getPerformanceData(org);

    await googleChartsLoaded;
    renderPerfView(container, summary, timeSeries);

  } catch (error) {
    console.error('Error initializing performance view:', error);
    container.innerHTML = `<div class="alert alert-danger">Failed to load performance data. Please try again later.</div>`;
  }
};

function renderPerfView(container, summary, timeSeries) {
  container.innerHTML = `
    <div class="row row-deck row-cards">
      <!-- KPI Cards -->
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Reporting Devices</div>
              <div class="ms-auto lh-1"><i class="ti ti-device-desktop-analytics text-muted"></i></div>
            </div>
            <div class="h1 mt-2 mb-0">${summary.deviceCount}</div>
          </div>
        </div>
      </div>
       <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Avg CPU / Peak</div>
              <div class="ms-auto lh-1"><i class="ti ti-cpu text-muted"></i></div>
            </div>
            <div class="d-flex align-items-baseline">
                <div class="h1 mt-2 mb-0">${summary.avgCpu}%</div>
                <div class="ms-2 text-muted">${summary.peakCpu}%</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Avg Memory / Peak</div>
              <div class="ms-auto lh-1"><i class="ti ti-database text-muted"></i></div>
            </div>
            <div class="d-flex align-items-baseline">
                <div class="h1 mt-2 mb-0">${summary.avgMem} <span class="fs-5">MB</span></div>
                <div class="ms-2 text-muted">${summary.peakMem} MB</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Avg Disk Latency (R/W)</div>
              <div class="ms-auto lh-1"><i class="ti ti-device-floppy text-muted"></i></div>
            </div>
             <div class="d-flex align-items-baseline">
                <div class="h1 mt-2 mb-0">${summary.avgDiskRead} <span class="fs-5">ms</span></div>
                <div class="ms-2 text-muted">${summary.avgDiskWrite} ms</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Charts -->
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
            <h3 class="card-title">Disk I/O Latency Over Time (Hourly Avg)</h3>
          </div>
          <div class="card-body">
            <div id="disk-timeseries-chart" style="height: 300px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  renderTimeSeriesChart('cpu-timeseries-chart', 'CPU', timeSeries, ['cpu'], '%');
  renderTimeSeriesChart('mem-timeseries-chart', 'Memory', timeSeries, ['memory'], 'MB');
  renderTimeSeriesChart('disk-timeseries-chart', 'Disk Latency', timeSeries, ['diskRead', 'diskWrite'], 'ms');
}

function renderTimeSeriesChart(elementId, title, data, dataKeys, unit) {
    const container = document.getElementById(elementId);
    if (!container || !data || data.length === 0) {
        container.innerHTML = '<div class="text-muted text-center p-5">No time-series data available for the selected period.</div>';
        return;
    }

    const dataArray = [['Time', ...dataKeys.map(k => k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()))]];
    data.forEach(d => {
        const row = [new Date(d.timestamp)];
        dataKeys.forEach(key => row.push(d[key]));
        dataArray.push(row);
    });
    const dataTable = google.visualization.arrayToDataTable(dataArray);

    const isDark = document.body.classList.contains('theme-dark');
    const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };
    const gridlineColor = isDark ? '#555' : '#e9ecef';

    const options = {
        curveType: 'function',
        legend: { position: dataKeys.length > 1 ? 'bottom' : 'none', textStyle: textStyle },
        backgroundColor: 'transparent',
        chartArea: { left: 60, top: 20, width: '90%', height: '75%' },
        hAxis: {
            textStyle: textStyle,
            gridlines: { color: 'transparent' },
            format: 'MMM d, HH:mm'
        },
        vAxis: {
            title: `${title} (${unit})`,
            titleTextStyle: { color: textStyle.color, italic: false, fontName: 'inherit' },
            textStyle: textStyle,
            gridlines: { color: gridlineColor },
            viewWindow: { min: 0 }
        },
        tooltip: { textStyle: { fontName: 'inherit' } },
        colors: ['#206bc4', '#d63939', '#ff9f40']
    };

    const chart = new google.visualization.AreaChart(container);
    chart.draw(dataTable, options);
    // Store for theme changes and resizing
    container.chartInstance = { chart, data: dataTable, options, type: 'AreaChart' };
}

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.perfViewInit;

/*
 * TODO: Modernize and modularize perfView.js using the same patterns as dashboardView.js:
 * - Use modular, modern filter dropdowns for Org, Process, Version, Aggregation.
 * - Integrate animated KPI cards (Google Charts) for key perf metrics (e.g., Response Time, Uptime, Errors, Throughput).
 * - Add timezone and theme toggles (reuse modular logic).
 * - Ensure all charts/tables use responsive, modern components and update on filter changes.
 * - Patch all time displays for timezone toggle.
 * - Preserve org isolation, session, and security logic.
 * - Add clear comments for extensibility and future KPIs/analytics.
 * - Document new patterns in COPILOT.md if any emerge.
 */