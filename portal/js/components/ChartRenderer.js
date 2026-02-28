import { html, useEffect, useRef } from 'https://unpkg.com/htm/preact/standalone.module.js';

/**
 * ChartRenderer - Renders charts using ApexCharts (bundled with Tabler)
 * @param {Object} props
 * @param {Array} props.charts - Array of ChartSpecification objects from SecurityReport
 */
export function ChartRenderer({ charts }) {
    if (!charts || charts.length === 0) {
        return null;
    }

    return html`
        <div class="row row-cards">
            ${charts.map((chart, index) => html`
                <${ChartCard} key=${index} chart=${chart} />
            `)}
        </div>
    `;
}

function ChartCard({ chart }) {
    const chartRef = useRef(null);
    const apexChartInstance = useRef(null);

    useEffect(() => {
        if (!chartRef.current || !window.ApexCharts) {
            console.warn('ApexCharts not loaded or chart ref not ready');
            return;
        }

        // Convert ChartSpecification to ApexCharts options
        const isCurrentlyDark = document.body.classList.contains('theme-dark');
        const options = convertToApexOptions(chart);
        if (options.theme) {
            options.theme.mode = isCurrentlyDark ? 'dark' : 'light';
        }


        // Create chart
        apexChartInstance.current = new ApexCharts(chartRef.current, options);

        apexChartInstance.current.render();
        const handleThemeChange = (e) => {
            if (apexChartInstance.current) {
                const isDark = e.detail && e.detail.theme === 'dark';
                apexChartInstance.current.updateOptions({
                    theme: { mode: isDark ? 'dark' : 'light' }
                });
            }
        };
        window.addEventListener('theme-changed', handleThemeChange);

        // Cleanup on unmount
        return () => {
            window.removeEventListener('theme-changed', handleThemeChange);
            if (apexChartInstance.current) {
                apexChartInstance.current.destroy();
            }
        };
    }, [chart]);

    return html`
        <div class="col-lg-6">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">${chart.title}</h3>
                </div>
                <div class="card-body">
                    <div ref=${chartRef} style="min-height: 300px;"></div>
                    ${chart.description && html`
                        <p class="text-muted mt-2 mb-0">${chart.description}</p>
                    `}
                </div>
            </div>
        </div>
    `;
}

/**
 * Convert ChartSpecification to ApexCharts options
 * @param {Object} chart - ChartSpecification from backend
 * @returns {Object} ApexCharts configuration
 */
function convertToApexOptions(chart) {
    const { type, series, labels, title, description } = chart;

    // Normalize series values to avoid NaN issues
    const toNumber = (v) => {
        const n = typeof v === 'number' ? v : parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };

    // Base configuration
    const baseOptions = {
        chart: {
            type: getApexChartType(type),
            height: 300,
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    zoom: false,
                    pan: false
                }
            },
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800
            }
        },
        theme: {
            mode: 'light',
            palette: 'palette1'
        },
        title: {
            text: title,
            align: 'center',
            style: {
                fontSize: '16px',
                fontWeight: 600
            }
        }
    };

    // Type-specific configurations
    if (type === 'Pie' || type === 'Donut') {
        return {
            ...baseOptions,
            chart: {
                ...baseOptions.chart,
                type: type.toLowerCase()
            },
            series: series.map(s => toNumber(s.value)),
            labels: labels || series.map(s => s.name),
            legend: {
                position: 'bottom',
                horizontalAlign: 'center'
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) {
                    const n = Number.isFinite(val) ? val : 0;
                    return n.toFixed(1) + '%';
                }
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: type === 'Donut' ? '70%' : '0%'
                    }
                }
            }
        };
    }

    if (type === 'Bar' || type === 'Column') {
        return {
            ...baseOptions,
            chart: {
                ...baseOptions.chart,
                type: 'bar'
            },
            series: [{
                name: title,
                data: series.map(s => toNumber(s.value))
            }],
            xaxis: {
                categories: labels || series.map(s => s.name),
                labels: {
                    rotate: -45,
                    rotateAlways: false,
                    hideOverlappingLabels: true
                }
            },
            yaxis: {
                title: {
                    text: 'Count'
                }
            },
            plotOptions: {
                bar: {
                    horizontal: type === 'Bar',
                    borderRadius: 4,
                    dataLabels: {
                        position: 'top'
                    }
                }
            },
            dataLabels: {
                enabled: true,
                offsetY: -20,
                style: {
                    fontSize: '12px'
                }
            }
        };
    }

    if (type === 'Line') {
        return {
            ...baseOptions,
            chart: {
                ...baseOptions.chart,
                type: 'line'
            },
            series: [{
                name: title,
                data: series.map(s => toNumber(s.value))
            }],
            xaxis: {
                categories: labels || series.map(s => s.name),
                labels: {
                    rotate: -45
                }
            },
            yaxis: {
                title: {
                    text: 'Value'
                }
            },
            stroke: {
                curve: 'smooth',
                width: 2
            },
            markers: {
                size: 4
            }
        };
    }

    // Default fallback (column)
    return {
        ...baseOptions,
        series: [{
            name: title,
            data: series.map(s => toNumber(s.value))
        }],
        xaxis: {
            categories: labels || series.map(s => s.name)
        }
    };
}

/**
 * Map ChartSpecification type to ApexCharts type
 */
function getApexChartType(type) {
    const typeMap = {
        'Pie': 'pie',
        'Donut': 'donut',
        'Bar': 'bar',
        'Column': 'bar',
        'Line': 'line',
        'Area': 'area'
    };
    return typeMap[type] || 'bar';
}
