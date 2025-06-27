// dashboardView.js: Renders the main 'Command Center' dashboard using Tabler components.
window.dashboardViewInit = async function(container, { dataService }) {
  if (!container) {
    console.error('Dashboard view requires a container element.');
    return;
  }

  // Load Google Charts
  const googleChartsLoaded = new Promise(resolve => {
    google.charts.load('current', { 'packages': ['gauge', 'corechart'] });
    google.charts.setOnLoadCallback(resolve);
  });

  // Create the dashboard-specific layout
  container.innerHTML = `
    <div id="kpi-main-row" class="row row-deck row-cards"></div>
    <div class="mt-4">
        <h2 class="h2">Device Telemetry</h2>
        <div id="kpi-global-row" class="row row-deck row-cards"></div>
    </div>
    <div class="mt-4">
        <h2 class="h2">Hardware Compliance</h2>
        <div id="hardware-compliance-row" class="row row-deck row-cards"></div>
    </div>
    <div id="chartsSection" class="row row-deck row-cards mt-4"></div>
  `;

  // Get containers
  const kpiMainRow = container.querySelector('#kpi-main-row');
  const kpiGlobalRow = container.querySelector('#kpi-global-row');
  const hardwareComplianceRow = container.querySelector('#hardware-compliance-row');
  const chartsSection = container.querySelector('#chartsSection');

  console.log('Initializing dashboard view...');

  // Set loading state
  kpiMainRow.innerHTML = '<div class="text-muted">Loading KPIs...</div>';
  chartsSection.innerHTML = ''; // Clear other sections

  // Fetch data
  const data = await (dataService.getDashboardMetrics ? dataService.getDashboardMetrics() : null);
  if (!data || !data.kpis) {
    kpiMainRow.innerHTML = '<div class="alert alert-warning">No dashboard data available for this organization.</div>';
    return;
  }

  const { kpis, charts } = data;
  const isDark = document.body.classList.contains('theme-dark');

  /**
   * Renders the main security score gauge using Google Charts.
   * @param {string} elementId The ID of the container element.
   * @param {number} value The value to display (0-100).
   */
  async function renderMainScoreGauge(elementId, value) {
    await googleChartsLoaded;
    const chartEl = document.getElementById(elementId);
    if (!chartEl) return;

    const val = Number(value);
    const data = google.visualization.arrayToDataTable([
      ['Label', 'Value'],
      ['Score', val]
    ]);

    const isDark = document.body.classList.contains('theme-dark');
    const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit', fontSize: 18 };
    const gaugeColor = isDark ? '#3a3a3a' : '#e9ecef';

    const options = {
      min: 0, max: 100,
      redFrom: 0, redTo: 40,
      yellowFrom: 40, yellowTo: 70,
      greenFrom: 70, greenTo: 100,
      minorTicks: 5,
      animation: { duration: 500, easing: 'out' },
      chartArea: { left: '5%', top: '5%', width: '90%', height: '90%' },
      backgroundColor: 'transparent',
      legend: { textStyle: textStyle },
      titleTextStyle: textStyle,
      gauge: {
          axis: {
              minValue: 0,
              maxValue: 100,
              ticks: [0, 20, 40, 60, 80, 100]
          },
          bar: { color: gaugeColor, thickness: 1 }, // This is the track
          backgroundColor: 'transparent',
      }
    };

    const chart = new google.visualization.Gauge(chartEl);
    chart.draw(data, options);
    // Store for theme changes and resizing
    chartEl.chartInstance = { chart, data, options, type: 'Gauge' };
  }


  /**
   * Creates the HTML for a single KPI card.
   * @param {string} kpiKey Unique key for IDs.
   * @param {string} title The KPI title.
   * @param {string|number} value The main KPI value.
   * @param {string} icon Tabler icon name.
   * @param {boolean} hasTrend If true, adds a sparkline container.
   * @param {string} subValue Optional smaller text below the main value.
   * @param {string} colClass Optional column classes for layout.
   * @returns {string} HTML string for the card.
   */
  function createKpiCardHtml(kpiKey, title, value, icon, hasTrend, subValue = '', colClass = 'col-sm-6 col-lg-3') {
    const sparklineId = `sparkline-${kpiKey}`;
    const subValueHtml = subValue ? `<div class="text-muted mt-1">${subValue}</div>` : '';
    const sparklineContainer = hasTrend ? `<div id="${sparklineId}" class="kpi-sparkline mt-2" data-chart-type="google"></div>` : `<div class="kpi-sparkline mt-2">${subValueHtml}</div>`;
    return `
      <div class="${colClass}">
        <div class="card kpi-tile">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">${title}</div>
            </div>
            <div class="d-flex align-items-baseline mt-3">
              <div class="h1 mb-0 me-2">${value}</div>
              <div class="ms-auto">
                <span class="text-secondary"><i class="ti ti-${icon} icon-lg"></i></span>
              </div>
            </div>
            ${sparklineContainer}
          </div>
        </div>
      </div>`;
  }

  /**
   * Creates HTML for the 1-over-2 resource gauge layout.
   * @param {string} resourceKey 'cpu' or 'memory'.
   * @param {string} title 'CPU Usage' or 'Memory Usage'.
   * @param {string} icon Tabler icon name.
   * @returns {string} HTML string for the card.
   */
  function createResourceKpiCardHtml(resourceKey, title, icon) {
      return `
      <div class="col-sm-6 col-lg-6">
        <div class="card kpi-tile resource-gauge-card">
          <div class="card-header">
            <h3 class="card-title d-flex align-items-center">
              <i class="ti ti-${icon} icon me-2"></i>
              ${title}
            </h3>
          </div>
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-6 text-center">
                <div id="gauge-${resourceKey}-avg" class="kpi-gauge-lg mx-auto" data-chart-type="google"></div>
                <div class="h3 mt-2 mb-0">Average</div>
              </div>
              <div class="col-6">
                <div class="text-center">
                    <div id="gauge-${resourceKey}-min" class="kpi-gauge-sm mx-auto" data-chart-type="google"></div>
                    <div class="text-muted mt-1">Min</div>
                </div>
                <div class="text-center mt-3">
                    <div id="gauge-${resourceKey}-max" class="kpi-gauge-sm mx-auto" data-chart-type="google"></div>
                    <div class="text-muted mt-1">Max</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /**
   * Renders a Google Gauge chart for resource metrics.
   * @param {string} elementId The ID of the container element.
   * @param {string} title The title for the label.
   * @param {number} value The value to display.
   * @param {string} rangeType 'cpu' or 'memory' for color settings.
   * @param {number} max The max value for the gauge.
   */
  async function renderGoogleGauge(elementId, title, value, rangeType, max) {
    await googleChartsLoaded;
    const chartEl = document.getElementById(elementId);
    if (!chartEl) return;

    const val = Number(value);
    const data = google.visualization.arrayToDataTable([
      ['Label', 'Value'],
      [title, val]
    ]);

    let colorOptions = {};
    if (rangeType === 'cpu') {
      colorOptions = { greenFrom: 0, greenTo: 50, yellowFrom: 50, yellowTo: 80, redFrom: 80, redTo: 100 };
      max = 100;
    } else { // memory
      // Dynamic ranges based on the max value
      const yellowStart = Math.round(max * 0.6);
      const redStart = Math.round(max * 0.8);
      colorOptions = { greenFrom: 0, greenTo: yellowStart, yellowFrom: yellowStart, yellowTo: redStart, redFrom: redStart, redTo: max };
    }

    const isDark = document.body.classList.contains('theme-dark');
    const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };
    
    const options = {
      max: max,
      minorTicks: 5,
      ...colorOptions,
      animation: { duration: 500, easing: 'out' },
      backgroundColor: 'transparent',
      legend: { textStyle: textStyle },
      // Let the container size dictate the chart size
      chartArea: { left: '5%', top: '5%', width: '90%', height: '75%' },
    };

    const chart = new google.visualization.Gauge(chartEl);
    chart.draw(data, options);
    chartEl.chartInstance = { chart, data, options, type: 'Gauge' };
  }

  /**
   * Renders a sparkline chart using Google Charts.
   * @param {string} elementId The ID of the container element.
   * @param {Array<number>} data The data points.
   */
  async function renderGoogleSparkline(elementId, data) {
      await googleChartsLoaded;
      const chartEl = document.getElementById(elementId);
      if (!chartEl) return;

      const dataTable = new google.visualization.DataTable();
      dataTable.addColumn('number', 'X');
      dataTable.addColumn('number', 'Value');
      dataTable.addRows(data.map((y, x) => [x, y]));

      const isDark = document.body.classList.contains('theme-dark');
      const options = {
          backgroundColor: 'transparent',
          colors: ['#206bc4'],
          chartArea: { left: 0, top: 0, width: '100%', height: '100%' },
          legend: { position: 'none' },
          hAxis: {
              baselineColor: 'transparent',
              gridlines: { color: 'transparent' },
              textPosition: 'none'
          },
          vAxis: {
              baselineColor: 'transparent',
              gridlines: { color: 'transparent' },
              textPosition: 'none'
          },
          tooltip: { trigger: 'none' }, // Disable tooltips for sparklines
          areaOpacity: 0.2,
          lineWidth: 2,
      };

      const chart = new google.visualization.AreaChart(chartEl);
      chart.draw(dataTable, options);
      chartEl.chartInstance = { chart, data: dataTable, options, type: 'AreaChart' };
  }


  /**
   * Renders a main chart (bar, donut, or line) in a card using Google Charts.
   * @param {object} chartInfo The chart configuration.
   */
  async function renderGoogleChart(chartInfo) {
    await googleChartsLoaded;
    const chartEl = document.getElementById(chartInfo.id);
    if (!chartEl) return;

    const isDark = document.body.classList.contains('theme-dark');
    const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };
    const gridlineColor = isDark ? '#555' : '#e9ecef';
    const bgColor = 'transparent';

    let chart;
    let data;
    let options = {
        backgroundColor: bgColor,
        chartArea: { left: 60, top: 40, width: '85%', height: '75%' },
        legend: { position: 'bottom', textStyle: textStyle },
        titleTextStyle: { color: textStyle.color, fontName: 'inherit', fontSize: 16, bold: false },
        title: chartInfo.title,
        tooltip: { textStyle: { fontName: 'inherit' } },
    };

    switch (chartInfo.type) {
        case 'bar':
            data = new google.visualization.DataTable();
            // Fixed: Provide a static label for the domain axis column.
            data.addColumn('string', chartInfo.title.includes('App') ? 'Application' : 'Category');
            data.addColumn('number', chartInfo.data.datasets[0].label);
            const barRows = chartInfo.data.labels.map((label, i) => {
                const value = parseFloat(chartInfo.data.datasets[0].data[i]);
                return [label, isNaN(value) ? null : value];
            });
            data.addRows(barRows);

            options.hAxis = { textStyle: textStyle, gridlines: { color: 'transparent' } };
            options.vAxis = { textStyle: textStyle, gridlines: { color: gridlineColor }, title: 'Exploit Probability (%)', titleTextStyle: textStyle };
            options.colors = ['#d63939'];
            options.legend.position = 'none';
            chart = new google.visualization.ColumnChart(chartEl);
            break;

        case 'donut':
            const chartData = chartInfo.data.labels.map((label, i) => {
                const value = parseFloat(chartInfo.data.datasets[0].data[i]);
                return [label, isNaN(value) ? 0 : value]; // Use 0 for donuts to avoid gaps
            });
            data = google.visualization.arrayToDataTable([['Vulnerability', 'Count'], ...chartData]);

            options.pieHole = 0.5;
            options.colors = chartInfo.colors || ['#d63939', '#ff9f40', '#ffcd56']; // Critical, High, Medium
            chart = new google.visualization.PieChart(chartEl);
            break;

        case 'line':
            // Use AreaChart for trends and ensure date parsing.
            const lineData = chartInfo.data.labels.map((label, i) => {
                const date = new Date(label);
                const value = parseFloat(chartInfo.data.datasets[0].data[i]);
                // Google charts can have issues with invalid dates, fallback to label.
                return [isNaN(date.getTime()) ? label : date, isNaN(value) ? null : value];
            });

            data = new google.visualization.DataTable();
            // Check if the first element is a date object to decide the column type
            const isDateAxis = lineData.length > 0 && lineData[0][0] instanceof Date;
            data.addColumn(isDateAxis ? 'date' : 'string', 'Date');
            data.addColumn('number', chartInfo.data.datasets[0].label || 'Value');
            data.addRows(lineData);

            options.curveType = 'function';
            options.hAxis = {
                textStyle: textStyle,
                gridlines: { color: 'transparent' },
                slantedText: true,
                slantedTextAngle: 30,
            };
            if (isDateAxis) {
                options.hAxis.format = 'MMM d'; // Format dates on the axis
            }
            options.vAxis = {
                textStyle: textStyle,
                gridlines: { color: gridlineColor },
                viewWindow: { min: 0 } // Let Google Charts determine max for better scaling
            };
            options.colors = ['#206bc4'];
            options.legend.position = 'none';
            options.areaOpacity = 0.2; // Add for area chart look
            chart = new google.visualization.AreaChart(chartEl); // Use AreaChart for trends
            break;

        default:
            console.error(`Unsupported Google Chart type: ${chartInfo.type}`);
            return;
    }

    chart.draw(data, options);
    chartEl.chartInstance = { chart, data, options, type: chartInfo.type };
    chartEl.dataset.chartType = 'google'; // Mark for global resizer
  }

  // --- RENDER DASHBOARD ---

  // 1. Render Main Security Score & KPIs
  kpiMainRow.innerHTML = `
    <div class="col-lg-4">
      <div class="card">
        <div class="card-body text-center">
          <div class="subheader mb-2">Overall Security Score</div>
          <div id="securityScoreGauge" class="kpi-gauge" style="height: 300px;" data-chart-type="google"></div>
        </div>
      </div>
    </div>`;
  
  let kpiSecondaryHtml = '';
  const kpiMap = {
      managedDevices: { title: 'Managed Devices', icon: 'device-desktop' },
      liveDevices: { title: 'Live Devices (24h)', icon: 'wifi' },
      offlineDevices: { title: 'Offline Devices', icon: 'wifi-off' },
      totalVulnerableApps: { title: 'Vulnerable Apps', icon: 'alert-triangle' },
      highRiskAssets: { title: 'High-Risk Assets', icon: 'shield-off' },
      uniqueApps: { title: 'Unique Apps', icon: 'apps' },
      avgRemediationTime: { title: 'Avg. Remediation', icon: 'clock-check', unit: ' days' },
      matchAnalysis: { title: 'Match Analysis', icon: 'search' },
  };

  Object.entries(kpiMap).forEach(([key, config]) => {
      const kpi = kpis[key];
      if (kpi) {
          const hasTrend = kpi.trend && kpi.trend.length > 0;
          let value = kpi.value !== undefined ? kpi.value : 'N/A';
          let subValue = '';
          if (key === 'avgRemediationTime') {
              value = kpi.value !== undefined ? `${kpi.value}${config.unit || ''}` : 'N/A';
          }
          if (key === 'matchAnalysis') {
              value = kpi.absolute !== undefined ? kpi.absolute : 'N/A';
              subValue = kpi.heuristic !== undefined ? `Heuristic: ${kpi.heuristic}` : '';
          }
          kpiSecondaryHtml += createKpiCardHtml(key, config.title, value, config.icon, hasTrend, subValue);
      }
  });
  
  const kpiCards = document.createElement('div');
  kpiCards.className = 'col-lg-8';
  kpiCards.innerHTML = `<div class="row row-cards">${kpiSecondaryHtml}</div>`;
  kpiMainRow.appendChild(kpiCards);
  
  if (kpis.securityScore && kpis.securityScore.value !== undefined) {
      renderMainScoreGauge('securityScoreGauge', kpis.securityScore.value);
  } else {
      const gaugeEl = document.getElementById('securityScoreGauge');
      if (gaugeEl) {
          gaugeEl.parentElement.innerHTML = '<div class="text-muted text-center p-4 d-flex align-items-center justify-content-center" style="height: 100%;">Security Score data is not available.</div>';
          gaugeEl.closest('.card').style.height = '100%';
      }
  }

  // Render sparklines after HTML is injected
  Object.entries(kpiMap).forEach(([key, config]) => {
      const kpi = kpis[key];
      if (kpi && kpi.trend && kpi.trend.length > 0) {
          renderGoogleSparkline(`sparkline-${key}`, kpi.trend);
      }
  });

  // 2. Render Global KPIs
  let globalKpiHtml = '';
  const globalKpiMap = {
      unlicensedDevices: { title: 'Unlicensed Devices', icon: 'id-off' },
      newDevices7d: { title: 'New Devices (7d)', icon: 'device-desktop-plus' },
      newlyLicensedDevices7d: { title: 'Newly Licensed (7d)', icon: 'license' },
      newDevices14d: { title: 'New Devices (14d)', icon: 'device-desktop-plus' },
      newlyLicensedDevices14d: { title: 'Newly Licensed (14d)', icon: 'license' },
  };

  Object.entries(globalKpiMap).forEach(([key, config]) => {
      const kpi = kpis[key];
      if (kpi && kpi.value !== undefined) {
          // Use custom column classes to fit 5 cards in a row on large screens
          globalKpiHtml += createKpiCardHtml(key, config.title, kpi.value, config.icon, false, '', 'col-lg col-md-6');
      }
  });
  if (kpiGlobalRow) {
      kpiGlobalRow.innerHTML = globalKpiHtml;
      // Rename the header to be more accurate based on org selection
      const org = sessionStorage.getItem('org') || 'all';
      const header = kpiGlobalRow.parentElement.querySelector('h2');
      if (header) {
          header.textContent = org === 'all' ? 'Global Device Telemetry' : 'Org Device Telemetry';
      }
  }

  // 3. Render Hardware Compliance Charts
  if (kpis.hardware && hardwareComplianceRow) {
      let hardwareHtml = '';
      const hardwareCharts = [
          { id: 'cpuArchChart', title: 'CPU Architecture', data: kpis.hardware.cpuArch, colors: ['#206bc4', '#79a6dc', '#b3c7e4', '#f2f2f2'] },
          { id: 'secureBootChart', title: 'Secure Boot Status', data: kpis.hardware.secureBoot, colors: { 'Enabled': '#50b83c', 'Disabled': '#d63939', 'Unknown': '#aaa' } },
          { id: 'tpmChart', title: 'TPM Status', data: kpis.hardware.tpm, colors: { 'Enabled': '#50b83c', 'Disabled': '#d63939', 'Unknown': '#aaa' } }
      ];

      hardwareCharts.forEach(chart => {
          if (chart.data && Object.keys(chart.data).length > 0) {
              hardwareHtml += `
                <div class="col-lg-4">
                  <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">${chart.title}</h3>
                    </div>
                    <div class="card-body">
                      <div id="${chart.id}" style="height: 250px;"></div>
                    </div>
                  </div>
                </div>`;
          }
      });

      hardwareComplianceRow.innerHTML = hardwareHtml;

      // Render charts after HTML is injected
      hardwareCharts.forEach(chartInfo => {
          if (chartInfo.data && Object.keys(chartInfo.data).length > 0) {
              // For charts with specific color mappings (like status), order the colors to match the labels
              const labels = Object.keys(chartInfo.data);
              const chartColors = Array.isArray(chartInfo.colors) ? chartInfo.colors : labels.map(label => chartInfo.colors[label]);

              renderGoogleChart({
                  id: chartInfo.id,
                  type: 'donut',
                  title: chartInfo.title,
                  data: {
                      labels: labels,
                      datasets: [{ data: Object.values(chartInfo.data) }]
                  },
                  colors: chartColors
              });
          }
      });
  }

  // 4. Render Resource Gauges & Charts
  let chartsAndGaugesHtml = '';
  if (kpis.cpu) {
      chartsAndGaugesHtml += createResourceKpiCardHtml('cpu', 'CPU Usage', 'cpu');
  }
  if (kpis.memory) {
      // Note the key change from 'mem' to 'memory' to match dataService
      chartsAndGaugesHtml += createResourceKpiCardHtml('memory', 'Memory Usage', 'database');
  }
  
  if (charts && charts.main) {
      charts.main.forEach(chart => {
        chartsAndGaugesHtml += `
          <div class="col-lg-6">
            <div class="card">
              <div class="card-body">
                <div id="${chart.id}" style="height: 350px;"></div>
              </div>
            </div>
          </div>`;
      });
  }
  
  chartsSection.innerHTML = chartsAndGaugesHtml; 

  // Render gauges after HTML is injected
  if (kpis.cpu) {
      renderGoogleGauge('gauge-cpu-avg', 'Avg', kpis.cpu.avg, 'cpu', 100);
      renderGoogleGauge('gauge-cpu-min', 'Min', kpis.cpu.min, 'cpu', 100);
      renderGoogleGauge('gauge-cpu-max', 'Max', kpis.cpu.max, 'cpu', 100);
  }
  if (kpis.memory) {
      // Use the dynamic max from the data. Fallback to a default if 0.
      const maxMem = kpis.memory.max > 0 ? kpis.memory.max * 1.2 : 200; // Add 20% buffer
      renderGoogleGauge('gauge-memory-avg', 'Avg', kpis.memory.avg, 'memory', maxMem);
      renderGoogleGauge('gauge-memory-min', 'Min', kpis.memory.min, 'memory', maxMem);
      renderGoogleGauge('gauge-memory-max', 'Max', kpis.memory.max, 'memory', maxMem);
  }

  // Render charts after HTML is injected
  if (charts && charts.main) {
    charts.main.forEach(renderGoogleChart);
  }
};

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.dashboardViewInit;