/**
 * ApexCharts configuration helpers
 * Centralized chart configs for consistency across dashboard, devices, and posture pages
 */

/**
 * Base ApexCharts configuration with common defaults
 */
export const baseChartConfig = {
    chart: {
        fontFamily: 'inherit',
        parentHeightOffset: 0,
        toolbar: { show: false },
        animations: { enabled: true, speed: 400 }
    },
    dataLabels: { enabled: false },
    tooltip: {
        theme: 'light',
        fillSeriesColor: false
    },
    legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontFamily: 'inherit',
        fontSize: '13px'
    }
};

/**
 * Donut chart configuration
 * Used for: Threat distribution, Compliance, Coverage
 */
export function getDonutChartConfig(series, labels, colors) {
    return {
        ...baseChartConfig,
        chart: {
            ...baseChartConfig.chart,
            type: 'donut',
            height: 240
        },
        series: series,
        labels: labels,
        colors: colors,
        plotOptions: {
            pie: {
                donut: {
                    size: '65%'
                }
            }
        },
        legend: {
            ...baseChartConfig.legend,
            markers: { width: 10, height: 10, radius: 2 }
        }
    };
}

/**
 * Radar chart configuration
 * Used for: Posture radar (domain scores)
 */
export function getRadarChartConfig(categories, seriesData) {
    return {
        ...baseChartConfig,
        chart: {
            ...baseChartConfig.chart,
            type: 'radar',
            height: 300
        },
        series: seriesData,
        xaxis: {
            categories: categories
        },
        yaxis: {
            show: true,
            min: 0,
            max: 100,
            tickAmount: 5
        },
        markers: {
            size: 4
        },
        colors: ['#0054a6']
    };
}

/**
 * Radial gauge chart configuration
 * Used for: Device risk scores
 */
export function getRadialGaugeConfig(value, label, color) {
    return {
        chart: {
            type: 'radialBar',
            height: 120,
            sparkline: { enabled: true }
        },
        series: [value],
        plotOptions: {
            radialBar: {
                hollow: { size: '60%' },
                track: { background: '#e9ecef' },
                dataLabels: {
                    name: {
                        show: true,
                        fontSize: '11px',
                        color: '#626976',
                        offsetY: 20
                    },
                    value: {
                        show: true,
                        fontSize: '22px',
                        fontWeight: 700,
                        offsetY: -10,
                        formatter: (val) => Math.round(val)
                    }
                }
            }
        },
        colors: [color],
        labels: [label]
    };
}

/**
 * Scatter plot configuration
 * Used for: Device risk distribution
 */
export function getScatterChartConfig(seriesData) {
    return {
        ...baseChartConfig,
        chart: {
            ...baseChartConfig.chart,
            type: 'scatter',
            height: 300,
            zoom: { enabled: false }
        },
        series: seriesData,
        xaxis: {
            title: { text: 'Device Index' },
            tickAmount: 10
        },
        yaxis: {
            title: { text: 'Risk Score' },
            min: 0,
            max: 100
        },
        markers: {
            size: 6,
            hover: { size: 8 }
        }
    };
}

/**
 * Polar chart configuration
 * Used for: Coverage distribution
 */
export function getPolarChartConfig(series, labels, colors) {
    return {
        ...baseChartConfig,
        chart: {
            ...baseChartConfig.chart,
            type: 'polarArea',
            height: 300
        },
        series: series,
        labels: labels,
        colors: colors,
        stroke: {
            colors: ['#fff']
        },
        fill: {
            opacity: 0.8
        }
    };
}

/**
 * Get severity colors (Tabler.io palette)
 */
export const severityColors = {
    critical: '#d63939',
    high: '#f76707',
    medium: '#f59f00',
    low: '#2fb344',
    info: '#0054a6'
};

/**
 * Get connection status colors
 */
export const statusColors = {
    online: '#2fb344',
    degraded: '#f59f00',
    offline: '#d63939'
};

/**
 * Render chart safely with error handling
 */
export function renderChart(elementOrId, config, retryOnError = true) {
    try {
        const element = typeof elementOrId === 'string' 
            ? document.getElementById(elementOrId) 
            : elementOrId;
            
        if (!element) {
            console.warn('[ChartHelpers] Element not found:', elementOrId);
            return null;
        }

        // Clear existing chart
        element.innerHTML = '';

        // Validate ApexCharts is loaded
        if (!window.ApexCharts) {
            console.error('[ChartHelpers] ApexCharts library not loaded');
            return null;
        }

        // Create and render chart
        const chart = new window.ApexCharts(element, config);
        chart.render();
        return chart;
    } catch (error) {
        console.error('[ChartHelpers] Error rendering chart:', error);
        if (retryOnError) {
            setTimeout(() => renderChart(elementOrId, config, false), 500);
        }
        return null;
    }
}

/**
 * Destroy chart instance safely
 */
export function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') {
        try {
            chart.destroy();
        } catch (e) {
            console.warn('[ChartHelpers] Error destroying chart:', e);
        }
    }
}
