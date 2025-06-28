// charting.js: Centralized Google Charts rendering functions for the admin dashboard.
window.charting = {
    // A promise to ensure the Google Charts library is loaded before any chart rendering is attempted.
    googleChartsLoaded: new Promise(resolve => {
        google.charts.load('current', { 'packages': ['gauge', 'corechart', 'timeline', 'table'] });
        google.charts.setOnLoadCallback(resolve);
    }),

    /**
     * Renders a generic Google Gauge chart.
     * @param {string} elementId The ID of the container element.
     * @param {string} title The title for the label.
     * @param {number} value The value to display.
     * @param {object} [optionsConfig] Optional configuration for gauge colors and max value.
     */
    async renderGauge(elementId, title, value, optionsConfig = {}) {
        await this.googleChartsLoaded;
        const chartEl = document.getElementById(elementId);
        if (!chartEl) return;

        const val = Number(value) || 0;
        const max = Number(optionsConfig.max) || 100;

        const data = google.visualization.arrayToDataTable([
            ['Label', 'Value'],
            [title, val]
        ]);

        const isDark = document.body.classList.contains('theme-dark');
        const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };

        let colorRanges = {};
        if (optionsConfig.type === 'score') {
            colorRanges = { redFrom: 0, redTo: 40, yellowFrom: 40, yellowTo: 70, greenFrom: 70, greenTo: 100 };
        } else if (optionsConfig.type === 'cpu') {
            colorRanges = { greenFrom: 0, greenTo: 50, yellowFrom: 50, yellowTo: 80, redFrom: 80, redTo: 100 };
        } else if (optionsConfig.type === 'memory') {
            const yellowStart = Math.round(max * 0.6);
            const redStart = Math.round(max * 0.8);
            colorRanges = { greenFrom: 0, greenTo: yellowStart, yellowFrom: yellowStart, yellowTo: redStart, redFrom: redStart, redTo: max };
        }

        const options = {
            max: max,
            min: 0,
            minorTicks: 5,
            ...colorRanges,
            animation: { duration: 500, easing: 'out' },
            backgroundColor: 'transparent',
            legend: { textStyle: textStyle },
            chartArea: { left: '5%', top: '5%', width: '90%', height: '75%' },
            ...optionsConfig.extraOptions,
        };

        const chart = new google.visualization.Gauge(chartEl);
        chart.draw(data, options);
        chartEl.chartInstance = { chart, data, options, type: 'Gauge' };
    },

    /**
     * Renders a generic Pie or Donut chart.
     * @param {string} elementId The ID of the container element.
     * @param {Array<Array<string|number>>} dataRows The data rows (e.g., [['Category', 10], ['Another', 20]]).
     * @param {string[]} header The header row (e.g., ['Category', 'Count']).
     * @param {object} [optionsConfig] Optional configuration for pieHole, colors, etc.
     */
    async renderPieChart(elementId, dataRows, header, optionsConfig = {}) {
        await this.googleChartsLoaded;
        const chartEl = document.getElementById(elementId);
        if (!chartEl) return;

        if (!dataRows || dataRows.length === 0) {
            chartEl.innerHTML = '<div class="text-muted text-center p-5">No data available.</div>';
            return;
        }

        const data = google.visualization.arrayToDataTable([header, ...dataRows]);
        const isDark = document.body.classList.contains('theme-dark');
        const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };

        const options = {
            pieHole: optionsConfig.pieHole || 0.4,
            backgroundColor: 'transparent',
            chartArea: { left: 10, top: 20, width: '90%', height: '80%' },
            legend: { textStyle: textStyle, position: 'right' },
            titleTextStyle: { color: textStyle.color, fontName: 'inherit', fontSize: 16, bold: false },
            tooltip: { textStyle: { fontName: 'inherit' } },
            colors: optionsConfig.colors || ['#206bc4', '#d63939', '#f76707', '#f59f00', '#79a6dc', '#adb5bd'],
            ...optionsConfig.extraOptions,
        };

        const chart = new google.visualization.PieChart(chartEl);
        chart.draw(data, options);
        chartEl.chartInstance = { chart, data, options, type: 'PieChart' };
    },

    /**
     * Renders a generic Area or Line chart for time-series data.
     * @param {string} elementId The ID of the container element.
     * @param {Array<Array>} dataRows The data rows, where the first column is typically a Date object.
     * @param {string[]} header The header row (e.g., ['Date', 'Metric 1', 'Metric 2']).
     * @param {object} [optionsConfig] Optional configuration for stacking, colors, axes, etc.
     */
    async renderAreaChart(elementId, dataRows, header, optionsConfig = {}) {
        await this.googleChartsLoaded;
        const chartEl = document.getElementById(elementId);
        if (!chartEl) return;

        if (!dataRows || dataRows.length < 2) {
            chartEl.innerHTML = '<div class="text-muted text-center p-5">Not enough data for a trend chart.</div>';
            return;
        }

        const data = google.visualization.arrayToDataTable([header, ...dataRows]);
        const isDark = document.body.classList.contains('theme-dark');
        const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };
        const gridlineColor = isDark ? '#555' : '#e9ecef';

        const options = {
            backgroundColor: 'transparent',
            chartArea: { left: 60, top: 20, width: '90%', height: '75%' },
            legend: { position: header.length > 2 ? 'top' : 'none', alignment: 'end', textStyle: textStyle },
            hAxis: { textStyle: textStyle, gridlines: { color: 'transparent' }, format: optionsConfig.hAxisFormat || 'MMM d' },
            vAxis: { title: optionsConfig.vAxisTitle || '', titleTextStyle: { color: textStyle.color, italic: false }, textStyle: textStyle, gridlines: { color: gridlineColor }, viewWindow: { min: 0 } },
            tooltip: { textStyle: { fontName: 'inherit' } },
            isStacked: optionsConfig.isStacked || false,
            areaOpacity: optionsConfig.areaOpacity || 0.2,
            lineWidth: 2,
            pointSize: 4,
            curveType: 'function',
            colors: optionsConfig.colors || ['#206bc4', '#d63939', '#f76707', '#f59f00'],
            ...optionsConfig.extraOptions,
        };

        const chart = new google.visualization.AreaChart(chartEl);
        chart.draw(data, options);
        chartEl.chartInstance = { chart, data, options, type: 'AreaChart' };
    },

    /**
     * Renders a generic Column/Bar chart.
     * @param {string} elementId The ID of the container element.
     * @param {Array<Array>} dataRows The data rows.
     * @param {string[]} header The header row.
     * @param {object} [optionsConfig] Optional configuration.
     */
    async renderColumnChart(elementId, dataRows, header, optionsConfig = {}) {
        await this.googleChartsLoaded;
        const chartEl = document.getElementById(elementId);
        if (!chartEl) return;

        if (!dataRows || dataRows.length === 0) {
            chartEl.innerHTML = '<div class="text-muted text-center p-5">No data available.</div>';
            return;
        }

        const data = google.visualization.arrayToDataTable([header, ...dataRows]);
        const isDark = document.body.classList.contains('theme-dark');
        const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };
        const gridlineColor = isDark ? '#555' : '#e9ecef';

        const options = {
            backgroundColor: 'transparent',
            chartArea: { left: 60, top: 40, width: '85%', height: '70%' },
            legend: { position: 'none' },
            title: optionsConfig.title || '',
            titleTextStyle: { color: textStyle.color, fontName: 'inherit', fontSize: 16, bold: false },
            hAxis: { textStyle: textStyle, gridlines: { color: 'transparent' } },
            vAxis: { textStyle: textStyle, gridlines: { color: gridlineColor }, title: optionsConfig.vAxisTitle || '', titleTextStyle: textStyle },
            colors: optionsConfig.colors || ['#206bc4'],
            ...optionsConfig.extraOptions,
        };

        const chart = new google.visualization.ColumnChart(chartEl);
        chart.draw(data, options);
        chartEl.chartInstance = { chart, data, options, type: 'ColumnChart' };
    },
    
    /**
     * Renders a Google Timeline chart.
     * @param {string} elementId The ID of the container element.
     * @param {Array<Array>} dataRows The data rows for the timeline.
     * @param {Array<object>} header An array of column descriptor objects.
     */
    async renderTimeline(elementId, dataRows, header) {
        await this.googleChartsLoaded;
        const chartEl = document.getElementById(elementId);
        if (!chartEl) return;

        if (!dataRows || dataRows.length === 0) {
            chartEl.innerHTML = '<div class="text-muted text-center p-5">No timeline data available.</div>';
            return;
        }
        
        const dataTable = new google.visualization.DataTable();
        header.forEach(h => dataTable.addColumn(h));
        dataTable.addRows(dataRows);

        const isDark = document.body.classList.contains('theme-dark');
        const options = {
            height: 300,
            backgroundColor: 'transparent',
            timeline: {
                showRowLabels: true,
                groupByRowLabel: true,
                colorByRowLabel: true
            },
            hAxis: {
                textStyle: { color: isDark ? '#e5e5e5' : '#424242' }
            }
        };

        const chart = new google.visualization.Timeline(chartEl);
        chart.draw(dataTable, options);
        chartEl.chartInstance = { chart, data: dataTable, options, type: 'Timeline' };
    }
};
