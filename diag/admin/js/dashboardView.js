// dashboardView.js: Renders the main 'Command Center' dashboard using Tabler components.
window.dashboardViewInit = async function(container) {
  if (!container) {
    console.error('Dashboard view requires a container element.');
    return;
  }

  // Load Google Charts for gauges
  const googleChartsLoaded = new Promise(resolve => {
    google.charts.load('current', { 'packages': ['gauge'] });
    google.charts.setOnLoadCallback(resolve);
  });

  // Create the dashboard-specific layout
  container.innerHTML = `
    <div id="kpi-main-row" class="row row-deck row-cards"></div>
    <div id="kpi-secondary-row" class="row row-deck row-cards mt-4"></div>
    <div id="chartsSection" class="row row-deck row-cards mt-4"></div>
  `;

  // Get containers
  const kpiMainRow = container.querySelector('#kpi-main-row');
  const kpiSecondaryRow = container.querySelector('#kpi-secondary-row');
  const chartsSection = container.querySelector('#chartsSection');

  console.log('Initializing dashboard view...');

  // Set loading state
  kpiMainRow.innerHTML = '<div class="text-muted">Loading KPIs...</div>';
  chartsSection.innerHTML = ''; // Clear other sections

  // Fetch data
  const data = await (window.dataService.getDashboardMetrics ? window.dataService.getDashboardMetrics() : null);
  if (!data || !data.kpis) {
    kpiMainRow.innerHTML = '<div class="alert alert-warning">No dashboard data available for this organization.</div>';
    return;
  }

  const { kpis, charts } = data;
  const isDark = document.body.classList.contains('theme-dark');

  /**
   * Renders a KPI gauge using ApexCharts for the main security score.
   * @param {string} elementId The ID of the container element.
   * @param {number} value The value to display (0-100).
   */
  function renderSecurityScoreGauge(elementId, value) {
    const chartEl = document.getElementById(elementId);
    if (!chartEl) return;

    const val = Number(value);
    const options = {
      chart: { type: 'radialBar', height: 250, sparkline: { enabled: true } },
      series: [val],
      plotOptions: {
        radialBar: {
          hollow: { size: '75%' },
          track: { background: 'transparent', strokeWidth: '97%' },
          dataLabels: {
            name: { show: false },
            value: {
              offsetY: 10,
              fontSize: '2.5rem',
              fontWeight: 700,
              color: 'var(--tblr-body-color)',
              formatter: (v) => `${v}`
            }
          }
        }
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'dark',
          type: 'horizontal',
          shadeIntensity: 0.5,
          gradientToColors: ['#50c878', '#f0b400', '#d63939'],
          inverseColors: false,
          opacityFrom: 1,
          opacityTo: 1,
          stops: [0, 50, 100]
        }
      },
      stroke: { lineCap: 'round' },
      labels: ['Security Score'],
      theme: { mode: isDark ? 'dark' : 'light' }
    };
    
    chartEl.innerHTML = '';
    const chart = new ApexCharts(chartEl, options);
    chart.render();
    // Store chart instance for theme changes
    chartEl.chartInstance = chart;
  }

  /**
   * Creates the HTML for a single KPI card.
   * @param {string} kpiKey Unique key for IDs.
   * @param {string} title The KPI title.
   * @param {string|number} value The main KPI value.
   * @param {string} icon Tabler icon name.
   * @param {boolean} hasTrend If true, adds a sparkline container.
   * @returns {string} HTML string for the card.
   */
  function createKpiCardHtml(kpiKey, title, value, icon, hasTrend) {
    const sparklineId = `sparkline-${kpiKey}`;
    return `
      <div class="col-sm-6 col-lg-4">
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
            ${hasTrend ? `<div id="${sparklineId}" class="chart-sm mt-2"></div>` : '<div class="chart-sm mt-2" style="height: 40px;"></div>'}
          </div>
        </div>
      </div>`;
  }

  /**
   * Creates HTML for a resource gauge KPI card.
   * @param {string} kpiKey Unique key for the element ID.
   * @param {string} title The title to display on the card.
   * @returns {string} HTML string for the gauge card.
   */
  function createGaugeKpiCardHtml(kpiKey, title) {
    const chartId = `gauge-${kpiKey}`;
    // The title is now rendered inside the gauge, so we just need the container.
    return `
      <div class="col-sm-4 col-lg-2">
        <div class="card kpi-tile">
          <div class="card-body text-center">
            <div id="${chartId}" class="kpi-gauge-sm" style="height: 150px;"></div>
          </div>
        </div>
      </div>`;
  }

  /**
   * Renders a 270-degree gauge for resource metrics.
   * @param {string} elementId The ID of the container element.
   * @param {string} title The title for the label inside the gauge.
   * @param {number} value The absolute value.
   * @param {number} total The total value for percentage calculation.
   * @param {string} unit The unit for the value display.
   * @param {string} rangeType The type of value ('cpu' or 'memory') for color coding.
   */
  function renderResourceGauge(elementId, title, value, total, unit, rangeType) {
    const chartEl = document.getElementById(elementId);
    if (!chartEl) return;

    const isDark = document.body.classList.contains('theme-dark');
    const val = Number(value);
    const percentage = total > 0 ? Math.min(100, Math.round((val / total) * 100)) : 0;

    const getColorForValue = (v, type) => {
        if (type === 'cpu') {
            if (v <= 10) return '#50c878'; // green
            if (v <= 20) return '#f0b400'; // yellow
            if (v <= 50) return '#fd7e14'; // orange
            return '#d63939'; // red
        }
        if (type === 'memory') {
            if (v <= 50) return '#50c878'; // green
            if (v <= 100) return '#f0b400'; // yellow
            return '#d63939'; // red
        }
        return '#206bc4'; // default
    };

    const gaugeColor = getColorForValue(val, rangeType);

    const options = {
        chart: {
            type: 'radialBar',
            height: 150,
            sparkline: { enabled: true },
            background: 'transparent'
        },
        series: [percentage],
        plotOptions: {
            radialBar: {
                startAngle: -135,
                endAngle: 135,
                hollow: {
                    margin: 0,
                    size: '70%',
                    background: 'transparent',
                },
                track: {
                    background: isDark ? '#3a3a3a' : '#e9ecef',
                    strokeWidth: '100%',
                    margin: 0,
                },
                dataLabels: {
                    name: {
                        show: true,
                        offsetY: -15,
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: 'var(--tblr-muted)',
                        formatter: () => title
                    },
                    value: {
                        offsetY: 10,
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        color: 'var(--tblr-body-color)',
                        formatter: () => `${val}${unit}`
                    }
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: isDark ? 'dark' : 'light',
                type: 'horizontal',
                shadeIntensity: 0.5,
                gradientToColors: [gaugeColor],
                inverseColors: true,
                opacityFrom: 1,
                opacityTo: 1,
                stops: [0, 100]
            }
        },
        stroke: {
            lineCap: 'round'
        },
        theme: {
            mode: isDark ? 'dark' : 'light'
        }
    };

    chartEl.innerHTML = '';
    const chart = new ApexCharts(chartEl, options);
    chart.render();
    chartEl.chartInstance = chart;
  }

  /**
   * Renders a Google Gauge chart for resource metrics.
   * @param {string} elementId The ID of the container element.
   * @param {string} title The title for the label.
   * @param {number} value The value to display.
   * @param {string} rangeType 'cpu' or 'memory' for color settings.
   * @param {number} max The max value for the gauge.
   */
  function renderGoogleGauge(elementId, title, value, rangeType, max) {
    const chartEl = document.getElementById(elementId);
    if (!chartEl) return;

    const val = Number(value);
    const data = google.visualization.arrayToDataTable([
      ['Label', 'Value'],
      [title, val]
    ]);

    let colorOptions = {};
    if (rangeType === 'cpu') {
      colorOptions = {
        greenFrom: 0, greenTo: 10,
        yellowFrom: 10, yellowTo: 50, // Note: Google Charts supports 3 ranges, so yellow/orange are combined.
        redFrom: 50, redTo: 100,
      };
    } else { // memory
      colorOptions = {
        greenFrom: 0, greenTo: 50,
        yellowFrom: 50, yellowTo: 100,
        redFrom: 100, redTo: max,
      };
    }

    const isDark = document.body.classList.contains('theme-dark');
    const textAndBgStyle = {
        color: isDark ? '#e5e5e5' : '#424242',
        backgroundColor: 'transparent'
    };

    const options = {
      width: 150, height: 150,
      max: max,
      minorTicks: 5,
      ...colorOptions,
      backgroundColor: 'transparent',
      legend: { textStyle: textAndBgStyle },
      labelStyle: { color: textAndBgStyle.color, fontSize: 12 },
    };

    const chart = new google.visualization.Gauge(chartEl);
    chart.draw(data, options);
  }

  /**
   * Renders a sparkline chart.
   * @param {string} elementId The ID of the container element.
   * @param {Array<number>} data The data points.
   */
  function renderSparkline(elementId, data) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const options = {
        chart: { type: 'area', height: 40, sparkline: { enabled: true }, animations: { enabled: true } },
        series: [{ data: data }],
        stroke: { width: 2, curve: 'smooth' },
        fill: { opacity: 0.25 },
        tooltip: { enabled: false },
        colors: ['#206bc4']
    };
    new ApexCharts(el, options).render();
  }

  /**
   * Renders a main chart in a card.
   * @param {object} chartInfo The chart configuration.
   */
  function renderApexChart(chartInfo) {
    const chartEl = document.getElementById(chartInfo.id);
    if (!chartEl) return;

    const options = {
      chart: {
        type: chartInfo.type || 'bar',
        height: 350,
        background: 'transparent',
        toolbar: { show: true, tools: { download: true } },
        fontFamily: 'inherit',
      },
      series: chartInfo.data.datasets.map(ds => ({ name: ds.label, data: ds.data })),
      labels: chartInfo.data.labels,
      theme: { mode: isDark ? 'dark' : 'light' },
      dataLabels: { enabled: chartInfo.type !== 'line' },
      legend: { show: true, position: 'bottom', labels: { colors: 'var(--tblr-body-color)' } },
      grid: { strokeDashArray: 4, borderColor: 'var(--tblr-border-color)' },
      xaxis: {
        labels: { style: { colors: 'var(--tblr-body-color)' } },
        axisBorder: { show: false },
        axisTicks: { color: 'var(--tblr-border-color)' }
      },
      yaxis: { labels: { style: { colors: 'var(--tblr-body-color)' } } },
      plotOptions: {
        bar: { borderRadius: 4, horizontal: chartInfo.type === 'horizontalBar' },
        donut: { labels: { show: true, total: { show: true, label: 'Total', color: 'var(--tblr-body-color)' }, value: { color: 'var(--tblr-body-color)'} } }
      },
      fill: {
        opacity: 1,
        colors: chartInfo.type === 'donut' ? ['#d63939', '#ff9f40', '#ffcd56'] : ['#206bc4']
      },
      tooltip: { theme: isDark ? 'dark' : 'light' },
      title: { text: chartInfo.title, style: { fontSize: '1rem', fontWeight: '600', color: 'var(--tblr-body-color)' } },
    };

    chartEl.innerHTML = '';
    const chart = new ApexCharts(chartEl, options);
    chart.render();
    chartEl.chartInstance = chart;
  }

  // --- RENDER DASHBOARD ---

  // 1. Render Main Security Score
  kpiMainRow.innerHTML = `
    <div class="col-12">
      <div class="card">
        <div class="card-body text-center">
          <div class="subheader">Overall Security Score</div>
          <div id="securityScoreGauge" class="kpi-gauge"></div>
        </div>
      </div>
    </div>`;
  renderSecurityScoreGauge('securityScoreGauge', kpis.securityScore.value);

  // 2. Render Secondary KPIs & Resource Gauges
  let kpiSecondaryHtml = '';
  const kpiMap = {
      managedDevices: { title: 'Managed Devices', icon: 'device-desktop' },
      liveDevices: { title: 'Live Devices (24h)', icon: 'wifi' },
      offlineDevices: { title: 'Offline Devices', icon: 'wifi-off' },
      totalVulnerableApps: { title: 'Vulnerable Apps', icon: 'alert-triangle' },
      highRiskAssets: { title: 'High-Risk Assets', icon: 'shield-off' },
      uniqueApps: { title: 'Unique Apps', icon: 'apps' },
  };

  Object.entries(kpiMap).forEach(([key, config]) => {
      const kpi = kpis[key];
      if (kpi) {
          const hasTrend = kpi.trend && kpi.trend.length > 0;
          kpiSecondaryHtml += createKpiCardHtml(key, config.title, kpi.value, config.icon, hasTrend);
      }
  });
  
  // Add CPU/Memory Gauges
  if (kpis.cpu) {
      kpiSecondaryHtml += createGaugeKpiCardHtml('cpu-avg', 'Avg CPU');
      kpiSecondaryHtml += createGaugeKpiCardHtml('cpu-max', 'Max CPU');
      kpiSecondaryHtml += createGaugeKpiCardHtml('cpu-min', 'Min CPU');
  }
  if (kpis.memory) {
      kpiSecondaryHtml += createGaugeKpiCardHtml('mem-avg', 'Avg Memory');
      kpiSecondaryHtml += createGaugeKpiCardHtml('mem-max', 'Max Memory');
      kpiSecondaryHtml += createGaugeKpiCardHtml('mem-min', 'Min Memory');
  }

  kpiSecondaryRow.innerHTML = kpiSecondaryHtml;

  // Render sparklines after HTML is injected
  Object.entries(kpiMap).forEach(([key, config]) => {
      const kpi = kpis[key];
      if (kpi && kpi.trend) {
          renderSparkline(`sparkline-${key}`, kpi.trend);
      }
  });

  // Render gauges after HTML is injected
  await googleChartsLoaded;
  if (kpis.cpu) {
      renderGoogleGauge('gauge-cpu-avg', 'Avg CPU', kpis.cpu.avg, 'cpu', 100);
      renderGoogleGauge('gauge-cpu-max', 'Max CPU', kpis.cpu.max, 'cpu', 100);
      renderGoogleGauge('gauge-cpu-min', 'Min CPU', kpis.cpu.min, 'cpu', 100);
  }
  if (kpis.memory) {
      const MEMORY_GAUGE_TOTAL = 200; // Set a fixed total for memory gauges (in MB) for a consistent scale
      renderGoogleGauge('gauge-mem-avg', 'Avg Memory', kpis.memory.avg, 'memory', MEMORY_GAUGE_TOTAL);
      renderGoogleGauge('gauge-mem-max', 'Max Memory', kpis.memory.max, 'memory', MEMORY_GAUGE_TOTAL);
      renderGoogleGauge('gauge-mem-min', 'Min Memory', kpis.memory.min, 'memory', MEMORY_GAUGE_TOTAL);
  }

  // 3. Render Charts
  let chartsHtml = '';
  charts.forEach(chart => {
    chartsHtml += `
      <div class="col-lg-6">
        <div class="card">
          <div class="card-body">
            <div id="${chart.id}"></div>
          </div>
        </div>
      </div>`;
  });
  chartsSection.innerHTML = chartsHtml;
  charts.forEach(renderApexChart);
};

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.dashboardViewInit;