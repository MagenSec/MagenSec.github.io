// dashboardView.js: Renders the main 'Command Center' dashboard using Tabler components.
(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }
    window.viewInitializers.dashboard = async function(container, { dataService }) {
        if (!container) {
            console.error('Dashboard view requires a container element.');
            return;
        }

        // The charting library is now loaded globally in index.html

        // Create the dashboard-specific layout
        container.innerHTML = `
            <div id="kpi-main-row" class="row row-deck row-cards"></div>
            <div class="mt-4">
                <h2 class="h2">Device Telemetry</h2>
                <div id="kpi-global-row" class="row row-deck row-cards"></div>
            </div>
            <div id="chartsSection" class="row row-deck row-cards mt-4"></div>
        `;

        // Get containers
        const kpiMainRow = container.querySelector('#kpi-main-row');
        const kpiGlobalRow = container.querySelector('#kpi-global-row');
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

        /**
         * Renders the main security score gauge using the centralized charting utility.
         * @param {string} elementId The ID of the container element.
         * @param {number} value The value to display (0-100).
         */
        function renderMainScoreGauge(elementId, value) {
            window.charting.renderGauge(elementId, 'Score', value, { type: 'score', max: 100 });
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
         * Renders a sparkline chart using the centralized charting utility.
         * @param {string} elementId The ID of the container element.
         * @param {Array<number>} data The data points.
         */
        function renderGoogleSparkline(elementId, data) {
            const dataRows = data.map((y, x) => [x, y]);
            const header = ['X', 'Value'];
            const options = {
                extraOptions: {
                    legend: { position: 'none' },
                    hAxis: { baselineColor: 'transparent', gridlines: { color: 'transparent' }, textPosition: 'none' },
                    vAxis: { baselineColor: 'transparent', gridlines: { color: 'transparent' }, textPosition: 'none' },
                    tooltip: { trigger: 'none' },
                }
            };
            window.charting.renderAreaChart(elementId, dataRows, header, options);
        }


        /**
         * Renders a main chart (bar, donut, or line) in a card using the centralized charting utility.
         * @param {object} chartInfo The chart configuration.
         */
        function renderGoogleChart(chartInfo) {
            const { id, type, title, data: chartData, colors } = chartInfo;

            switch (type) {
                case 'bar':
                    const barRows = chartData.labels.map((label, i) => {
                        const value = parseFloat(chartData.datasets[0].data[i]);
                        return [label, isNaN(value) ? null : value];
                    });
                    const barHeader = [title.includes('App') ? 'Application' : 'Category', chartData.datasets[0].label];
                    const barOptions = { vAxisTitle: 'Exploit Probability (%)', colors: ['#d63939'] };
                    window.charting.renderColumnChart(id, barRows, barHeader, barOptions);
                    break;

                case 'donut':
                    const donutRows = chartData.labels.map((label, i) => {
                        const value = parseFloat(chartData.datasets[0].data[i]);
                        return [label, isNaN(value) ? 0 : value];
                    });
                    const donutHeader = ['Vulnerability', 'Count'];
                    const donutOptions = { colors: colors || ['#d63939', '#ff9f40', '#ffcd56'] };
                    window.charting.renderPieChart(id, donutRows, donutHeader, donutOptions);
                    break;

                case 'line':
                    const lineRows = chartData.labels.map((label, i) => {
                        const date = new Date(label);
                        const value = parseFloat(chartData.datasets[0].data[i]);
                        return [isNaN(date.getTime()) ? label : date, isNaN(value) ? null : value];
                    });
                    const isDateAxis = lineRows.length > 0 && lineRows[0][0] instanceof Date;
                    const lineHeader = [isDateAxis ? 'date' : 'string', chartData.datasets[0].label || 'Value'];
                    const lineOptions = { colors: ['#206bc4'], hAxisFormat: isDateAxis ? 'MMM d' : undefined };
                    window.charting.renderAreaChart(id, lineRows, lineHeader, lineOptions);
                    break;

                default:
                    console.error(`Unsupported Google Chart type: ${type}`);
                    return;
            }
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
                    const total = (kpi.absolute || 0) + (kpi.heuristic || 0);
                    const percentage = total > 0 ? Math.round((kpi.absolute / total) * 100) : 0;
                    value = `${percentage}%`;
                    subValue = `Abs: ${kpi.absolute || 0} / Heur: ${kpi.heuristic || 0}`;
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

        // 3. Render Main Charts
        if (charts && charts.main && chartsSection) {
            let chartsHtml = '';
            charts.main.forEach(chart => {
                if (chart) {
                    chartsHtml += `
                        <div class="col-lg-6">
                          <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">${chart.title}</h3>
                            </div>
                            <div class="card-body">
                              <div id="${chart.id}" style="height: 300px;"></div>
                            </div>
                          </div>
                        </div>`;
                }
            });
            chartsSection.innerHTML = chartsHtml;

            // Render charts after HTML is injected
            charts.main.forEach(chartInfo => {
                if (chartInfo) {
                    renderGoogleChart(chartInfo);
                }
            });
        }
    };
})();

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.dashboardViewInit;