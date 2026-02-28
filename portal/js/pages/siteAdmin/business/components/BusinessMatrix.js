import { api } from '@api';
import toast from '@toast';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

export function BusinessMatrixPage() {
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState(null);
    const [error, setError] = useState(null);
    const [forceRefresh, setForceRefresh] = useState(false);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [expandedOrgs, setExpandedOrgs] = useState(new Set());
    const [billingCurrencyCode, setBillingCurrencyCode] = useState('USD');
    const [displayCurrencyCode, setDisplayCurrencyCode] = useState(localStorage.getItem('businessMatrixCurrency') || 'USD');
    const [kpiWindowDays, setKpiWindowDays] = useState(7);
    const [serviceCostDays, setServiceCostDays] = useState(30); // 7, 30, or 90 days
    const [costTrendDays, setCostTrendDays] = useState(30);          // 7, 14, 30
    const [costBreakdownPeriod, setCostBreakdownPeriod] = useState('mtd'); // 'latest', '7d', 'mtd'
    const [showMrrMlDetails, setShowMrrMlDetails] = useState(false);
    
    // Chart refs
    const revenueChartRef = useRef(null);
    const mrrTrendChartRef = useRef(null);
    const marginBandChartRef = useRef(null);
    const costTrendChartRef = useRef(null);
    const costBreakdownChartRef = useRef(null);
    const telemetryByTypeChartRef = useRef(null);
    const topOrgTelemetryChartRef = useRef(null);
    const telemetryCostMixChartRef = useRef(null);
    
    // Service cost trend chart refs (dynamic)
    const [serviceChartRefs, setServiceChartRefs] = useState({});
    const [serviceCharts, setServiceCharts] = useState({});
    
    // Chart instances
    const [revenueChart, setRevenueChart] = useState(null);
    const [mrrTrendChart, setMrrTrendChart] = useState(null);
    const [marginBandChart, setMarginBandChart] = useState(null);
    const [costTrendChart, setCostTrendChart] = useState(null);
    const [costBreakdownChart, setCostBreakdownChart] = useState(null);
    const [telemetryByTypeChart, setTelemetryByTypeChart] = useState(null);
    const [topOrgTelemetryChart, setTopOrgTelemetryChart] = useState(null);
    const [telemetryCostMixChart, setTelemetryCostMixChart] = useState(null);

    const USD_INR_RATE = 83.5;

    const normalizeCurrency = (code) => (code || 'USD').toUpperCase();

    const getCurrencySymbol = (code) => {
        const normalized = normalizeCurrency(code);
        if (normalized === 'INR') return '₹';
        if (normalized === 'EUR') return '€';
        if (normalized === 'GBP') return '£';
        return '$';
    };

    const getConversionRate = (fromCode, toCode) => {
        const from = normalizeCurrency(fromCode);
        const to = normalizeCurrency(toCode);
        if (from === to) return 1;
        if (from === 'USD' && to === 'INR') return USD_INR_RATE;
        if (from === 'INR' && to === 'USD') return 1 / USD_INR_RATE;
        return 1;
    };

    const convertFromBilling = (value) => {
        const rate = getConversionRate(billingCurrencyCode, displayCurrencyCode);
        return Number(value || 0) * rate;
    };

    const getCurrencySymbolForDisplay = () => {
        const code = normalizeCurrency(displayCurrencyCode);
        if (code === 'INR') return '₹';
        if (code === 'EUR') return '€';
        if (code === 'GBP') return '£';
        return '$';
    };

    useEffect(() => {
        loadBusinessMetrics();
        return () => {
            // Cleanup charts on unmount
            if (revenueChart) revenueChart.destroy();
            if (mrrTrendChart) mrrTrendChart.destroy();
            if (marginBandChart) marginBandChart.destroy();
            if (costTrendChart) costTrendChart.destroy();
            if (costBreakdownChart) costBreakdownChart.destroy();
            if (telemetryByTypeChart) telemetryByTypeChart.destroy();
            if (topOrgTelemetryChart) topOrgTelemetryChart.destroy();
            if (telemetryCostMixChart) telemetryCostMixChart.destroy();
        };
    }, []);

    // Re-render cost trend when period selector changes
    useEffect(() => {
        const snapshots = metrics?.costAnalytics?.dailySnapshots;
        if (snapshots?.length > 0) {
            setTimeout(() => renderCostTrendChart(snapshots, costTrendDays), 50);
        }
    }, [costTrendDays]);

    // Re-render breakdown donut when period selector changes
    useEffect(() => {
        const snapshots = metrics?.costAnalytics?.dailySnapshots;
        if (snapshots?.length > 0) {
            setTimeout(() => renderCostBreakdownChart(snapshots, costBreakdownPeriod), 50);
        }
    }, [costBreakdownPeriod]);

    useEffect(() => {
        if (metrics) {
            setTimeout(() => renderCharts(metrics), 50);
        }
    }, [displayCurrencyCode, billingCurrencyCode]);

    const loadBusinessMetrics = async () => {
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (forceRefresh) params.append('forceRefresh', 'true');

            const response = await api.get(`/api/v1/admin/business-metrics?${params}`);
            
            if (response.success) {
                setMetrics(response.data);
                setBillingCurrencyCode((response.data?.platformSummary?.billingCurrencyCode || 'USD').toUpperCase());
                // Render charts after metrics loaded
                setTimeout(() => {
                    renderCharts(response.data);
                }, 100);
            } else {
                setError(response.message || 'Failed to load business metrics');
            }
        } catch (err) {
            logger.error('Failed to load business metrics:', err);
            setError(err.message || 'Failed to load business metrics');
        } finally {
            setLoading(false);
        }
    };

    const renderCharts = (data) => {
        if (!data) return;

        // Revenue Breakdown Donut Chart (ApexCharts)
        renderRevenueChart(data.revenueBreakdown);
        
        // MRR Trend Line Chart (Chart.js)
        renderMRRTrendChart(data.platformSummary.trends);
        
        // Margin Band Distribution (Chart.js horizontal bar)
        renderMarginBandChart(data.revenueBreakdown);

        // Cost Analytics Charts (if available)
        if (data.costAnalytics) {
            renderCostAnalytics(data.costAnalytics);
            renderTelemetryEconomicsCharts(data.costAnalytics);
            
            // Service cost trend charts (if available)
            if (data.costAnalytics.dailyServiceCosts && data.costAnalytics.dailyServiceCosts.length > 0) {
                setTimeout(() => renderServiceCostCharts(data.costAnalytics.dailyServiceCosts, serviceCostDays), 200);
            }
        }
    };

    const renderRevenueChart = (breakdown) => {
        if (!revenueChartRef.current) return;

        const currencySymbol = getCurrencySymbolForDisplay();

        const options = {
            series: [convertFromBilling(breakdown.personalRevenue), convertFromBilling(breakdown.businessRevenue)],
            chart: {
                type: 'donut',
                height: 280
            },
            labels: ['Personal', 'Business'],
            colors: ['#4299e1', '#0054a6'],
            legend: {
                position: 'bottom'
            },
            dataLabels: {
                enabled: true,
                formatter: function(val, opts) {
                    return currencySymbol + opts.w.globals.series[opts.seriesIndex].toFixed(0);
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return currencySymbol + val.toFixed(2);
                    }
                }
            }
        };

        if (revenueChart) {
            revenueChart.destroy();
        }

        const chart = new ApexCharts(revenueChartRef.current, options);
        chart.render();
        setRevenueChart(chart);
    };

    const renderMRRTrendChart = (trends) => {
        if (!mrrTrendChartRef.current || !trends || trends.length === 0) return;

        const ctx = mrrTrendChartRef.current.getContext('2d');
        const currencySymbol = getCurrencySymbolForDisplay();

        if (mrrTrendChart) {
            mrrTrendChart.destroy();
        }

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'MRR',
                    data: trends.map(t => convertFromBilling(t.mrr)),
                    borderColor: '#2fb344',
                    backgroundColor: 'rgba(47, 179, 68, 0.1)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'MRR: ' + currencySymbol + context.parsed.y.toFixed(0);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return currencySymbol + value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });

        setMrrTrendChart(chart);
    };

    const renderMarginBandChart = (breakdown) => {
        if (!marginBandChartRef.current) return;

        const ctx = marginBandChartRef.current.getContext('2d');
        const currencySymbol = getCurrencySymbolForDisplay();

        if (marginBandChart) {
            marginBandChart.destroy();
        }

        // Map from revenueByBand array (numeric bands)
        const bandData = [
            { band: 'Bliss', value: 0, color: '#ae3ec9' },
            { band: 'Desirable', value: 0, color: '#2fb344' },
            { band: 'Acceptable', value: 0, color: '#0054a6' },
            { band: 'Medium', value: 0, color: '#f59f00' },
            { band: 'Low', value: 0, color: '#f76707' },
            { band: 'Critical', value: 0, color: '#dc3545' }
        ];

        // Populate from API revenueByBand array
        if (breakdown.revenueByBand && Array.isArray(breakdown.revenueByBand)) {
            breakdown.revenueByBand.forEach(item => {
                const index = 5 - item.band; // Reverse order (5=Bliss at index 0)
                if (index >= 0 && index < bandData.length) {
                    bandData[index].value = item.revenue;
                }
            });
        }

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bandData.map(b => b.band),
                datasets: [{
                    label: 'Revenue by Margin Band',
                    data: bandData.map(b => convertFromBilling(b.value)),
                    backgroundColor: bandData.map(b => b.color),
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return currencySymbol + context.parsed.x.toFixed(0);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return currencySymbol + value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });

        setMarginBandChart(chart);
    };

    const renderCostAnalytics = (costAnalytics) => {
        if (!costAnalytics || !costAnalytics.dailySnapshots || costAnalytics.dailySnapshots.length === 0) {
            return;
        }

        renderCostTrendChart(costAnalytics.dailySnapshots, costTrendDays);
        renderCostBreakdownChart(costAnalytics.dailySnapshots, costBreakdownPeriod);
    };

    const renderCostTrendChart = (snapshots, days = 30) => {
        if (!costTrendChartRef.current) return;

        const ctx = costTrendChartRef.current.getContext('2d');

        if (costTrendChart) {
            costTrendChart.destroy();
        }

        const currencySymbol = getCurrencySymbolForDisplay();

        const sortedSnapshots = [...snapshots]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-days);
        const labels = sortedSnapshots.map(s => new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const dailyCosts = sortedSnapshots.map(s => convertFromBilling(s.totalCost));
        const runRate7 = dailyCosts.map((_, idx) => {
            const start = Math.max(0, idx - 6);
            const window = dailyCosts.slice(start, idx + 1);
            const avg = window.reduce((sum, value) => sum + value, 0) / window.length;
            return Number.isFinite(avg) ? avg : 0;
        });

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    type: 'bar',
                    label: 'Daily Expense',
                    data: dailyCosts,
                    borderColor: '#f76707',
                    backgroundColor: 'rgba(247, 103, 7, 0.25)',
                    borderWidth: 1,
                    borderRadius: 4
                }, {
                    type: 'line',
                    label: '7-day Run-rate',
                    data: runRate7,
                    borderColor: '#0054a6',
                    backgroundColor: 'rgba(0, 84, 166, 0.08)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.3,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + currencySymbol + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return currencySymbol + value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });

        setCostTrendChart(chart);
    };

    const renderCostBreakdownChart = (snapshots, period = 'mtd') => {
        if (!costBreakdownChartRef.current || snapshots.length === 0) return;

        const ctx = costBreakdownChartRef.current.getContext('2d');

        if (costBreakdownChart) {
            costBreakdownChart.destroy();
        }

        // Select which snapshots to aggregate based on period
        const sorted = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date));
        let relevantSnapshots;
        let periodLabel;
        if (period === 'latest') {
            relevantSnapshots = sorted.slice(-1);
            const d = relevantSnapshots[0] ? new Date(relevantSnapshots[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'today';
            periodLabel = `Latest day (${d})`;
        } else if (period === '7d') {
            relevantSnapshots = sorted.slice(-7);
            periodLabel = '7-day total';
        } else {
            relevantSnapshots = sorted;
            periodLabel = 'Month-to-date total';
        }

        // Aggregate resource costs across selected snapshots
        const simplified = {};
        relevantSnapshots.forEach(snap => {
            const costsByType = snap.costsByResourceType || {};
            Object.entries(costsByType).forEach(([type, cost]) => {
                const normalized = (type || '').toLowerCase();
                let category = 'Unclassified';
                if (normalized.includes('containerapp') || normalized.includes('managedenvironments')) category = 'Container Apps';
                else if (normalized.includes('containerregistry')) category = 'Container Registry';
                else if (normalized.includes('storage')) category = 'Storage';
                else if (normalized.includes('keyvault')) category = 'Key Vault';
                else if (normalized.includes('bandwidth') || normalized.includes('network')) category = 'Networking';
                else if (normalized.includes('monitor') || normalized.includes('applicationinsights')) category = 'Monitoring';
                else if (normalized.includes('cognitive') || normalized.includes('openai') || normalized.includes('foundry') || normalized.includes('ai')) category = 'AI Services';
                else if (normalized.includes('eventhub')) category = 'Event Hubs';
                else if (normalized.includes('communication')) category = 'Communication';
                simplified[category] = (simplified[category] || 0) + cost;
            });
        });

        const labels = Object.keys(simplified);
        const data = Object.values(simplified).map(v => convertFromBilling(v));
        const currencySymbol = getCurrencySymbolForDisplay();

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#0054a6',  // Container Apps
                        '#f76707',  // Container Registry
                        '#2fb344',  // Storage
                        '#f59f00',  // Key Vault
                        '#667eea'   // Other
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: periodLabel,
                        color: '#6c757d',
                        font: { size: 11, weight: 'normal' },
                        padding: { bottom: 4 }
                    },
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                return label + ': ' + currencySymbol + value.toFixed(2) + ' (' + percent + '%)';
                            }
                        }
                    }
                }
            }
        });

        setCostBreakdownChart(chart);
    };

    const renderTelemetryEconomicsCharts = (costAnalytics) => {
        const dailyTelemetry = costAnalytics?.dailyTelemetryTypeVolumes || [];
        if (dailyTelemetry.length > 0) {
            renderTelemetryByTypeChart(dailyTelemetry);
            renderTopOrgTelemetryChart(dailyTelemetry);
            renderTelemetryCostMixChart(dailyTelemetry[dailyTelemetry.length - 1]);
        }
    };

    const renderTelemetryByTypeChart = (dailyTelemetry) => {
        if (!telemetryByTypeChartRef.current) return;

        const ctx = telemetryByTypeChartRef.current.getContext('2d');
        if (telemetryByTypeChart) {
            telemetryByTypeChart.destroy();
        }

        const series = [...dailyTelemetry]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-30);

        const labels = series.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Heartbeat', data: series.map(t => Number(t.heartbeatRows || 0)), backgroundColor: 'rgba(0, 84, 166, 0.75)' },
                    { label: 'App', data: series.map(t => Number(t.appTelemetryRows || 0)), backgroundColor: 'rgba(47, 179, 68, 0.75)' },
                    { label: 'CVE', data: series.map(t => Number(t.cveTelemetryRows || 0)), backgroundColor: 'rgba(245, 159, 0, 0.8)' },
                    { label: 'Perf', data: series.map(t => Number(t.perfTelemetryRows || 0)), backgroundColor: 'rgba(247, 103, 7, 0.75)' },
                    { label: 'Machine', data: series.map(t => Number(t.machineTelemetryRows || 0)), backgroundColor: 'rgba(102, 126, 234, 0.75)' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${formatCompactNumber(context.parsed.y || 0)} rows`
                        }
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { callback: (value) => formatCompactNumber(value) }
                    }
                }
            }
        });

        setTelemetryByTypeChart(chart);
    };

    const renderTopOrgTelemetryChart = (dailyTelemetry) => {
        if (!topOrgTelemetryChartRef.current) return;

        const ctx = topOrgTelemetryChartRef.current.getContext('2d');
        if (topOrgTelemetryChart) {
            topOrgTelemetryChart.destroy();
        }

        const rows = [...dailyTelemetry]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-30);

        const latest = rows[rows.length - 1] || {};
        const topOrgs = [...(latest.topTelemetryOrgs || [])]
            .sort((a, b) => Number(b.telemetryRows || 0) - Number(a.telemetryRows || 0))
            .slice(0, 5);

        const labels = rows.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const colors = ['#0054a6', '#2fb344', '#f59f00', '#f76707', '#667eea'];

        const datasets = topOrgs.map((org, index) => {
            const orgId = org.orgId;
            return {
                label: orgId,
                data: rows.map(day => {
                    const match = (day.topTelemetryOrgs || []).find(x => x.orgId === orgId);
                    return Number(match?.telemetryRows || 0);
                }),
                borderColor: colors[index % colors.length],
                backgroundColor: `${colors[index % colors.length]}33`,
                borderWidth: 2,
                tension: 0.25,
                pointRadius: 2,
                fill: false
            };
        });

        const chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${formatCompactNumber(context.parsed.y || 0)} rows`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => formatCompactNumber(value) }
                    }
                }
            }
        });

        setTopOrgTelemetryChart(chart);
    };

    const renderTelemetryCostMixChart = (latestTelemetrySnapshot) => {
        if (!telemetryCostMixChartRef.current || !latestTelemetrySnapshot) return;

        const ctx = telemetryCostMixChartRef.current.getContext('2d');
        if (telemetryCostMixChart) {
            telemetryCostMixChart.destroy();
        }

        const costByType = latestTelemetrySnapshot.costByType || {};
        const labels = Object.keys(costByType);
        const values = labels.map(k => convertFromBilling(costByType[k] || 0));
        const currencySymbol = getCurrencySymbolForDisplay();

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#0054a6', '#2fb344', '#f59f00', '#f76707', '#667eea'],
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = (context.dataset.data || []).reduce((sum, value) => sum + Number(value || 0), 0);
                                const val = Number(context.parsed || 0);
                                const share = total > 0 ? (val / total) * 100 : 0;
                                return `${context.label}: ${currencySymbol}${val.toFixed(2)} (${share.toFixed(1)}%)`;
                            }
                        }
                    }
                }
            }
        });

        setTelemetryCostMixChart(chart);
    };

    const toggleOrgExpand = (orgId) => {
        const newExpanded = new Set(expandedOrgs);
        if (newExpanded.has(orgId)) {
            newExpanded.delete(orgId);
        } else {
            newExpanded.add(orgId);
        }
        setExpandedOrgs(newExpanded);
    };

    const getMarginBandText = (bandNumber) => {
        const bands = {
            5: 'Bliss',
            4: 'Desirable',
            3: 'Acceptable',
            2: 'Medium',
            1: 'Low',
            0: 'Critical'
        };
        return bands[bandNumber] || 'Unknown';
    };

    const getMarginBadgeClass = (band) => {
        const bandNum = typeof band === 'number' ? band : 0;
        const classes = {
            0: 'badge-danger',   // Critical
            1: 'badge-warning',  // Low
            2: 'badge-info',     // Medium
            3: 'badge-primary',  // Acceptable
            4: 'badge-success',  // Desirable
            5: 'badge-success'   // Bliss
        };
        return classes[bandNum] || 'badge-secondary';
    };

    const getMarginBadgeStyle = (band) => {
        const bandNum = typeof band === 'number' ? band : 0;
        const colors = {
            0: '#dc3545',  // Critical
            1: '#f76707',  // Low
            2: '#f59f00',  // Medium
            3: '#0054a6',  // Acceptable
            4: '#2fb344',  // Desirable
            5: '#ffd700'   // Bliss (Gold)
        };
        return colors[bandNum] || '#6c757d';
    };

    const formatCurrency = (value) => {
        const symbol = getCurrencySymbolForDisplay();
        const converted = convertFromBilling(value);
        return symbol + Number(converted || 0).toFixed(2);
    };

    const formatCompactNumber = (value) => {
        const n = Number(value || 0);
        if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toString();
    };
    // Calculate trend from historical data
    const calculateTrend = (currentValue, trends, metricKey) => {
        if (!trends || trends.length < 2) return null;
        
        // Get the previous data point (1 week ago or most recent available)
        const previousPoint = trends.length > 1 ? trends[trends.length - 2] : null;
        if (!previousPoint) return null;

        const previousValue = previousPoint[metricKey];
        if (!previousValue || previousValue === 0) return null;

        const change = ((currentValue - previousValue) / previousValue) * 100;
        return {
            percentage: Math.abs(change).toFixed(1),
            isPositive: change > 0,
            isNegative: change < 0
        };
    };

    const getLatestMrrMlInsight = (trends) => {
        if (!trends || trends.length === 0) return null;
        const latest = trends[trends.length - 1];
        if (!latest || latest.isReliable !== true) return null;
        return latest;
    };

    const getMrrMlHealth = (trends) => {
        if (!trends || trends.length === 0) {
            return {
                label: 'Unknown',
                badgeClass: 'bg-secondary text-white',
                message: 'ML trend signal is not available yet.',
                action: 'Wait for more trend points to be collected.'
            };
        }

        const latest = trends[trends.length - 1];
        if (!latest || latest.isReliable !== true) {
            return {
                label: 'Degraded',
                badgeClass: 'bg-warning text-white',
                message: 'ML signal is currently low-confidence.',
                action: 'Use trend direction only and recheck after next cron run.'
            };
        }

        if (latest.isAnomaly) {
            return {
                label: 'Degraded',
                badgeClass: 'bg-warning text-white',
                message: 'MRR anomaly detected in the latest reliable signal.',
                action: 'Review org-level drivers and recent cost/revenue changes.'
            };
        }

        return {
            label: 'Healthy',
            badgeClass: 'bg-success text-white',
            message: 'MRR ML signal is stable and reliable.',
            action: 'No immediate action required.'
        };
    };

    const renderMrrMlStatus = (trends) => {
        const mlHealth = getMrrMlHealth(trends);
        const insight = getLatestMrrMlInsight(trends);
        const confidencePercent = Math.round(((insight?.confidence) || 0) * 100);

        return html`
            <div class="mt-2 text-start">
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <span class="badge ${mlHealth.badgeClass}">ML ${mlHealth.label}</span>
                    <button
                        type="button"
                        class="btn btn-outline-secondary btn-sm"
                        onClick=${() => setShowMrrMlDetails(!showMrrMlDetails)}
                    >
                        ${showMrrMlDetails ? 'Hide details' : 'Details'}
                    </button>
                </div>
                <div class="small mt-1">${mlHealth.message}</div>
                <div class="small text-body-secondary">Action: ${mlHealth.action}</div>

                ${showMrrMlDetails && html`
                    <div class="small text-body-secondary mt-2 border-top pt-2">
                        <div>Reliable: ${insight ? 'Yes' : 'No'}</div>
                        <div>Anomaly: ${insight?.isAnomaly ? 'Yes' : 'No'}</div>
                        <div>Forecast next: ${Number.isFinite(insight?.forecastNext) ? formatCurrency(insight.forecastNext || 0) : 'N/A'}</div>
                        <div>Confidence: ${insight ? confidencePercent + '%' : 'N/A'}</div>
                    </div>
                `}
            </div>
        `;
    };

    // Render trend indicator
    const renderTrendIndicator = (trend, reverseColors = false) => {
        if (!trend) return null;

        // For costs, red = up (bad), green = down (good)
        // For revenue/devices, green = up (good), red = down (bad)
        const colorClass = reverseColors 
            ? (trend.isPositive ? 'text-danger' : 'text-success')
            : (trend.isPositive ? 'text-success' : 'text-danger');
        
        const arrow = trend.isPositive ? '↑' : '↓';

        return html`
            <div class="${colorClass} small mt-1">
                <strong>${arrow} ${trend.percentage}%</strong> vs last week
            </div>
        `;
    };

    const renderInfoTooltip = (text) => html`
        <span
            class="badge bg-info-lt text-info ms-1"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            title=${text}
        >
            <i class="ti ti-info-circle"></i>
        </span>
    `;
    // Render service cost trend cards
    const renderServiceCostCards = (dailyServiceCosts) => {
        if (!dailyServiceCosts || dailyServiceCosts.length === 0) {
            return html`
                <div class="col-12">
                    <div class="alert alert-info mb-0">
                        <i class="bi bi-info-circle"></i> No service cost data available yet. Run the daily cost allocation cron job to generate data.
                    </div>
                </div>
            `;
        }

        // Get top 6 services by total cost
        const serviceAggregates = {};
        dailyServiceCosts.forEach(entry => {
            if (!serviceAggregates[entry.service]) {
                serviceAggregates[entry.service] = { totalCost: 0, dates: [], costs: [] };
            }
            serviceAggregates[entry.service].totalCost += entry.cost;
        });

        const topServices = Object.entries(serviceAggregates)
            .sort((a, b) => b[1].totalCost - a[1].totalCost)
            .slice(0, 6)
            .map(([service]) => service);

        return topServices.map(service => {
            const serviceData = dailyServiceCosts.filter(e => e.service === service);
            const totalCost = serviceData.reduce((sum, e) => sum + e.cost, 0);
            const avgDailyCost = totalCost / serviceData.length;

            return html`
                <div class="col-md-4" key=${service}>
                    <div class="card">
                        <div class="card-body">
                            <div class="text-body-secondary small mb-2">${service}</div>
                            <div class="h3 mb-0">${formatCurrency(totalCost)}</div>
                            <div class="text-body-secondary small">Avg: ${formatCurrency(avgDailyCost)}/day</div>
                            <div style="height: 60px; margin-top: 10px;">
                                <canvas id="service-chart-${service.replace(/\s+/g, '-').toLowerCase()}"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    };

    // Render service cost trend charts (Chart.js sparklines)
    const renderServiceCostCharts = (dailyServiceCosts, days) => {
        if (!dailyServiceCosts || dailyServiceCosts.length === 0) return;

        // Destroy existing service charts
        Object.values(serviceCharts).forEach(chart => {
            if (chart) chart.destroy();
        });
        setServiceCharts({});

        // Filter data by days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const filteredData = dailyServiceCosts.filter(e => new Date(e.date) >= cutoffDate);

        // Group by service
        const serviceGroups = {};
        filteredData.forEach(entry => {
            if (!serviceGroups[entry.service]) {
                serviceGroups[entry.service] = [];
            }
            serviceGroups[entry.service].push(entry);
        });

        // Get top 6 services
        const topServices = Object.entries(serviceGroups)
            .sort((a, b) => {
                const sumA = a[1].reduce((sum, e) => sum + e.cost, 0);
                const sumB = b[1].reduce((sum, e) => sum + e.cost, 0);
                return sumB - sumA;
            })
            .slice(0, 6)
            .map(([service]) => service);

        const newCharts = {};
        const currencySymbol = getCurrencySymbolForDisplay();

        topServices.forEach(service => {
            const canvasId = `service-chart-${service.replace(/\s+/g, '-').toLowerCase()}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const serviceData = serviceGroups[service].sort((a, b) => new Date(a.date) - new Date(b.date));
            const labels = serviceData.map(e => new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            const costs = serviceData.map(e => convertFromBilling(e.cost));

            const ctx = canvas.getContext('2d');
            newCharts[service] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: costs,
                        borderColor: '#0054a6',
                        backgroundColor: 'rgba(0, 84, 166, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    return `${currencySymbol}${context.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: false
                        },
                        y: {
                            display: false,
                            beginAtZero: true
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        });

        setServiceCharts(newCharts);
    };

    const buildServiceCostTrendsSection = (currentMetrics) => {
        if (!currentMetrics || !currentMetrics.costAnalytics) return null;

        const dailyServiceCosts = currentMetrics.costAnalytics.dailyServiceCosts || [];
        const hasData = dailyServiceCosts.length > 0;

        const headerActions = hasData
            ? html`
                <div class="btn-group" role="group">
                    <button type="button"
                            class="btn btn-sm ${serviceCostDays === 7 ? 'btn-primary' : 'btn-outline-primary'}"
                            onClick=${() => { setServiceCostDays(7); setTimeout(() => renderServiceCostCharts(dailyServiceCosts, 7), 100); }}>
                        7 Days
                    </button>
                    <button type="button"
                            class="btn btn-sm ${serviceCostDays === 30 ? 'btn-primary' : 'btn-outline-primary'}"
                            onClick=${() => { setServiceCostDays(30); setTimeout(() => renderServiceCostCharts(dailyServiceCosts, 30), 100); }}>
                        30 Days
                    </button>
                    <button type="button"
                            class="btn btn-sm ${serviceCostDays === 90 ? 'btn-primary' : 'btn-outline-primary'}"
                            onClick=${() => { setServiceCostDays(90); setTimeout(() => renderServiceCostCharts(dailyServiceCosts, 90), 100); }}>
                        90 Days
                    </button>
                </div>
            `
            : null;

        const bodyContent = hasData
            ? html`<div class="row g-3">${renderServiceCostCards(dailyServiceCosts)}</div>`
            : html`
                <div class="text-center py-5">
                    <h5 class="text-body-secondary">Service Cost Data Collecting</h5>
                    <p class="text-body-secondary small mb-0">
                        Daily Azure service costs will appear here once the Cost Management API returns data.<br />
                        This typically requires 24-48 hours of Azure usage to populate.
                    </p>
                </div>
            `;

        return html`
            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="card-title mb-0">
                        <i class="bi bi-pie-chart"></i> Azure Service Cost Trends
                    </h5>
                    ${headerActions}
                </div>
                <div class="card-body">
                    ${bodyContent}
                </div>
            </div>
        `;
    };

    const getAiServiceDailySeries = (currentMetrics) => {
        const entries = currentMetrics?.costAnalytics?.dailyServiceCosts || [];
        return entries
            .filter(e => (e.service || '').toLowerCase() === 'azure ai models')
            .map(e => ({
                date: new Date(e.date),
                cost: Number(e.cost || 0)
            }))
            .sort((a, b) => a.date - b.date);
    };

    const getAiMtdSpend = (currentMetrics) => {
        const now = new Date();
        const currentYear = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth();
        return getAiServiceDailySeries(currentMetrics)
            .filter(entry => entry.date.getUTCFullYear() === currentYear && entry.date.getUTCMonth() === currentMonth)
            .reduce((sum, entry) => sum + entry.cost, 0);
    };

    const getAiTrailingAverage = (currentMetrics, days) => {
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, days - 1));

        const samples = getAiServiceDailySeries(currentMetrics)
            .filter(entry => entry.date >= cutoff)
            .map(entry => entry.cost);

        if (samples.length === 0) {
            return 0;
        }

        return samples.reduce((sum, value) => sum + value, 0) / samples.length;
    };

    const getFinancialKrMetrics = (currentMetrics, windowDays) => {
        const mrr = Number(currentMetrics?.platformSummary?.mrr || 0);
        const mtdCost = Number(currentMetrics?.platformSummary?.actualMonthlyAzureCost || 0);
        const dayOfMonth = Math.max(1, new Date().getUTCDate());
        const avgDailyCost = mtdCost / dayOfMonth;
        const snapshots = currentMetrics?.costAnalytics?.dailySnapshots || [];
        const sortedSnapshots = [...snapshots].sort((a, b) => new Date(a.date) - new Date(b.date));
        const trailing = sortedSnapshots.slice(-Math.max(1, windowDays)).map(s => Number(s.totalCost || 0));
        const runRate = trailing.length > 0 ? (trailing.reduce((sum, value) => sum + value, 0) / trailing.length) : avgDailyCost;

        const now = new Date();
        const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
        const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
        const projectedMonthEndCost = mtdCost + (runRate * remainingDays);

        const runRateProfit = mrr - projectedMonthEndCost;
        const costToRevenue = mrr > 0 ? (projectedMonthEndCost / mrr) * 100 : 0;

        const aiMtd = getAiMtdSpend(currentMetrics);
        const aiShareOfCost = projectedMonthEndCost > 0 ? (aiMtd / projectedMonthEndCost) * 100 : 0;
        const aiShareOfMrr = mrr > 0 ? (aiMtd / mrr) * 100 : 0;

        return {
            projectedMonthEndCost,
            runRateProfit,
            costToRevenue,
            aiShareOfCost,
            aiShareOfMrr,
            runRate
        };
    };

    const getMarginBadgeLightStyle = (band) => {
        const bandNum = typeof band === 'number' ? band : 0;
        const styles = {
            0: { bg: '#ffe5e5', text: '#dc3545' },  // Critical
            1: { bg: '#fff3e0', text: '#f76707' },  // Low
            2: { bg: '#fff8e1', text: '#f59f00' },  // Medium
            3: { bg: '#e3f2fd', text: '#0054a6' },  // Acceptable
            4: { bg: '#e8f5e9', text: '#2fb344' },  // Desirable
            5: { bg: '#fff9e6', text: '#b8860b' }   // Bliss (Gold with darker text)
        };
        return styles[bandNum] || { bg: '#f5f5f5', text: '#6c757d' };
    };

    const buildBusinessAlerts = () => {
        const alerts = [];

        if (krMetrics.runRateProfit < 0) {
            alerts.push({ level: 'danger', icon: 'bi-x-circle-fill', text: `Run-rate profit is ${formatCurrency(krMetrics.runRateProfit)} — costs will exceed MRR by month-end` });
        }

        if (krMetrics.costToRevenue > 60) {
            alerts.push({ level: 'danger', icon: 'bi-exclamation-octagon-fill', text: `Cost/Revenue at ${krMetrics.costToRevenue.toFixed(1)}% (target ≤ 40%) — critical overspend` });
        } else if (krMetrics.costToRevenue > 40) {
            alerts.push({ level: 'warning', icon: 'bi-exclamation-triangle-fill', text: `Cost/Revenue at ${krMetrics.costToRevenue.toFixed(1)}% (target ≤ 40%) — above target` });
        }

        if (krMetrics.aiShareOfCost > 25) {
            alerts.push({ level: 'danger', icon: 'bi-cpu-fill', text: `AI models consuming ${krMetrics.aiShareOfCost.toFixed(1)}% of costs (target ≤ 15%) — review AI usage` });
        } else if (krMetrics.aiShareOfCost > 15) {
            alerts.push({ level: 'warning', icon: 'bi-cpu', text: `AI models at ${krMetrics.aiShareOfCost.toFixed(1)}% of costs (target ≤ 15%)` });
        }

        const expiringCount = (atRiskOrganizations || []).filter(o => o.daysToExpiry !== null && o.daysToExpiry < 7).length;
        if (expiringCount > 0) {
            alerts.push({ level: 'danger', icon: 'bi-calendar-x-fill', text: `${expiringCount} organization${expiringCount > 1 ? 's' : ''} expiring in < 7 days — immediate action required` });
        } else {
            const expiring30 = (atRiskOrganizations || []).filter(o => o.daysToExpiry !== null && o.daysToExpiry < 30).length;
            if (expiring30 > 0) {
                alerts.push({ level: 'warning', icon: 'bi-calendar-event', text: `${expiring30} organization${expiring30 > 1 ? 's' : ''} expiring within 30 days` });
            }
        }

        if (alerts.length === 0) return null;

        return html`
            <div class="mb-3">
                ${alerts.map((alert, i) => html`
                    <div class="alert alert-${alert.level} d-flex align-items-center py-2 px-3 mb-1" key=${i}>
                        <i class="bi ${alert.icon} me-2 flex-shrink-0"></i>
                        <div class="small fw-medium">${alert.text}</div>
                    </div>
                `)}
            </div>
        `;
    };

    if (loading) {
        return html`
            <div class="d-flex justify-content-center align-items-center" style="min-height: 400px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading business metrics...</span>
                </div>
            </div>
        `;
    }

    if (error) {
        return html`
            <div class="alert alert-danger">
                <strong>Error:</strong> ${error}
                <button class="btn btn-sm btn-outline-danger ms-3" onClick=${loadBusinessMetrics}>
                    Retry
                </button>
            </div>
        `;
    }

    // Build projected costs section with capacity planning scenarios
    const buildProjectedCostsSection = (currentMetrics) => {
        if (!currentMetrics || !currentMetrics.costAnalytics) return null;

        const orgAllocations = currentMetrics.costAnalytics.latestOrgAllocations || {};
        const orgsWithProjections = Object.values(orgAllocations).filter(org => 
            org.projectedCosts && org.projectedCosts.inactiveSeats > 0
        );

        if (orgsWithProjections.length === 0) return null;

        const currencySymbol = getCurrencySymbolForDisplay();

        // Calculate platform-wide aggregates
        const totalInactiveSeats = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.inactiveSeats, 0);
        const totalAdditionalCostAvg = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.additionalCostAvg, 0);
        const totalAdditionalCostPeak = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.additionalCostPeak, 0);
        const totalCurrentMonthlyCost = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.currentMonthlyCost, 0);
        const projectionRangePercent = totalAdditionalCostAvg > 0
            ? ((totalAdditionalCostPeak - totalAdditionalCostAvg) / totalAdditionalCostAvg) * 100
            : 0;

        return html`
            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="card-title mb-0">
                        <i class="bi bi-graph-up me-2"></i>Projected Cost Impact (Capacity Planning)
                    </h5>
                    <span class="badge bg-warning-lt text-warning">${totalInactiveSeats} Inactive Seats</span>
                </div>
                <div class="card-body">
                    <!-- Platform-Wide Summary -->
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="card bg-light">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Current Monthly Cost</div>
                                    <div class="h3 mb-0">${formatCurrency(totalCurrentMonthlyCost)}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card bg-success-lt">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Projected (Avg Scenario)</div>
                                    <div class="h4 mb-0 text-success">+${formatCurrency(totalAdditionalCostAvg)}/mo</div>
                                    <div class="text-body-secondary small">If all seats at avg telemetry</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card bg-warning-lt">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Projected (Peak Scenario)</div>
                                    <div class="h4 mb-0 text-warning">+${formatCurrency(totalAdditionalCostPeak)}/mo</div>
                                    <div class="text-body-secondary small">If all seats at peak telemetry</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card bg-info-lt">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Cost Range</div>
                                    <div class="h4 mb-0 text-info">${projectionRangePercent.toFixed(0)}%</div>
                                    <div class="text-body-secondary small">Peak vs Avg variance</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Per-Organization Projection Table -->
                    <div class="table-responsive">
                        <table class="table table-hover table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Organization</th>
                                    <th class="text-end">Active</th>
                                    <th class="text-end">Licensed</th>
                                    <th class="text-end">Inactive</th>
                                    <th class="text-end">Current Cost/mo</th>
                                    <th class="text-end">Projected Avg/mo</th>
                                    <th class="text-end">Projected Peak/mo</th>
                                    <th class="text-end">Additional (Avg)</th>
                                    <th class="text-end">Additional (Peak)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orgsWithProjections.map(org => {
                                    const currentCost = org.projectedCosts.currentMonthlyCost;
                                    const projectedAvg = org.projectedCosts.projectedAvgMonthlyCost;
                                    const projectedPeak = org.projectedCosts.projectedPeakMonthlyCost;
                                    const additionalAvg = org.projectedCosts.additionalCostAvg;
                                    const additionalPeak = org.projectedCosts.additionalCostPeak;

                                    return html`
                                        <tr>
                                            <td>
                                                <span class="font-weight-medium">${org.orgId}</span>
                                            </td>
                                            <td class="text-end">
                                                <span class="badge bg-success-lt text-success">${org.activeDevices}</span>
                                            </td>
                                            <td class="text-end">
                                                <span class="badge bg-primary-lt text-primary">${org.licensedSeats}</span>
                                            </td>
                                            <td class="text-end">
                                                <span class="badge bg-warning-lt text-warning">${org.projectedCosts.inactiveSeats}</span>
                                            </td>
                                            <td class="text-end text-muted">${formatCurrency(currentCost)}</td>
                                            <td class="text-end text-success">${formatCurrency(projectedAvg)}</td>
                                            <td class="text-end text-warning">${formatCurrency(projectedPeak)}</td>
                                            <td class="text-end">
                                                <span class="badge bg-success text-white">+${formatCurrency(additionalAvg)}</span>
                                            </td>
                                            <td class="text-end">
                                                <span class="badge bg-warning text-white">+${formatCurrency(additionalPeak)}</span>
                                            </td>
                                        </tr>
                                    `;
                                })}
                            </tbody>
                        </table>
                    </div>

                    <!-- Explanation Box -->
                    <div class="alert alert-info mt-3 mb-0">
                        <div class="d-flex">
                            <div class="me-2">
                                <i class="bi bi-info-circle"></i>
                            </div>
                            <div>
                                <strong>How Projections Work:</strong>
                                <ul class="mb-0 mt-1 ps-3">
                                    <li><strong>Avg Scenario:</strong> Assumes new devices send average telemetry volume (based on current active devices)</li>
                                    <li><strong>Peak Scenario:</strong> Assumes new devices send telemetry like your noisiest device (upper bound)</li>
                                    <li><strong>Inactive Seats:</strong> Licensed capacity not yet utilized (opportunity for growth)</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    if (!metrics) {
        return html`<div class="alert alert-info">No metrics data available</div>`;
    }

    // Safely destructure with defaults to prevent undefined errors
    const platformSummary = metrics.platformSummary || {};
    const revenueBreakdown = metrics.revenueBreakdown || {};
    const costBreakdown = metrics.costBreakdown || {
        storageActual: 0,
        computeActual: 0,
        transactionsActual: 0,
        estimatedVsActualDiff: 0,
        costByResourceType: []
    };
    const deviceHealth = metrics.deviceHealth || {
        activeCount: 0,
        disabledCount: 0,
        blockedCount: 0,
        onlineCount: 0,
        offlineCount: 0,
        heartbeatOnlyCount: 0
    };
    const topOrganizations = metrics.topOrganizations || [];
    const atRiskOrganizations = metrics.atRiskOrganizations || [];
    const costOutliers = metrics.costOutliers || [];
    const serviceCostTrendsSection = buildServiceCostTrendsSection(metrics);
    const dayOfMonth = Math.max(1, new Date().getUTCDate());
    const nowUtc = new Date();
    const daysInMonth = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() + 1, 0)).getUTCDate();
    const sortedSnapshots = [...(metrics.costAnalytics?.dailySnapshots || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    const trailingSpendSamples = sortedSnapshots.slice(-Math.max(1, kpiWindowDays)).map(s => Number(s.totalCost || 0));
    const avgDailyAzureSpend = trailingSpendSamples.length > 0
        ? trailingSpendSamples.reduce((sum, value) => sum + value, 0) / trailingSpendSamples.length
        : (platformSummary.actualMonthlyAzureCost || 0) / dayOfMonth;
    const projectedMonthlySpendFromWindow = avgDailyAzureSpend * daysInMonth;
    const aiMtdSpend = getAiMtdSpend(metrics);
    const aiAvg7dSpend = getAiTrailingAverage(metrics, kpiWindowDays);
    const aiAvg14dSpend = getAiTrailingAverage(metrics, 14);
    const krMetrics = getFinancialKrMetrics(metrics, kpiWindowDays);
    const investorSummary = metrics?.costAnalytics?.investorCostSummary || {};
    const aiTrend = aiAvg14dSpend > 0
        ? {
            percentage: Math.abs(((aiAvg7dSpend - aiAvg14dSpend) / aiAvg14dSpend) * 100).toFixed(1),
            isPositive: aiAvg7dSpend > aiAvg14dSpend,
            isNegative: aiAvg7dSpend < aiAvg14dSpend
        }
        : null;

    return html`
        <div class="business-matrix-container">
            <!-- Business Alerts Strip -->
            ${buildBusinessAlerts()}

            <!-- Hero Section with Platform Summary -->
            <div class="card mb-4" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div class="card-body p-4">
                    <!-- Row 1: Business Health + Profit % + Currency Toggle -->
                    <div class="row align-items-center mb-2">
                        <div class="col-md-6">
                            <h2 class="mb-0">Business Health 
                                <span class="badge ms-2" style="background: ${getMarginBadgeStyle(platformSummary.marginBand)}; color: white; font-size: 1rem;">
                                    <i class="bi bi-graph-up-arrow me-1"></i>
                                    ${getMarginBandText(platformSummary.marginBand)}
                                </span>
                            </h2>
                        </div>
                        <div class="col-md-3 text-center">
                            <div class="display-4 mb-0">${(platformSummary.profitMargin || 0).toFixed(0)}%</div>
                        </div>
                        <div class="col-md-3 text-end">
                            <div
                                class="btn-group"
                                role="group"
                                title=${(() => {
                                    const rate = getConversionRate('USD', 'INR');
                                    const source = normalizeCurrency(platformSummary.billingCurrencyCode || billingCurrencyCode || 'USD');
                                    return `Source (API): ${source} | FX: 1 USD = ${rate.toFixed(2)} INR, 1 INR = ${(1 / rate).toFixed(4)} USD`;
                                })()}
                            >
                                <button
                                    class="btn btn-sm ${normalizeCurrency(displayCurrencyCode) === 'USD' ? 'btn-light' : 'btn-outline-light'}"
                                    onClick=${() => {
                                        setDisplayCurrencyCode('USD');
                                        localStorage.setItem('businessMatrixCurrency', 'USD');
                                    }}
                                >
                                    $ USD
                                </button>
                                <button
                                    class="btn btn-sm ${normalizeCurrency(displayCurrencyCode) === 'INR' ? 'btn-light' : 'btn-outline-light'}"
                                    onClick=${() => {
                                        setDisplayCurrencyCode('INR');
                                        localStorage.setItem('businessMatrixCurrency', 'INR');
                                    }}
                                >
                                    ₹ INR
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Row 2: Metrics (aligned to match row 1 columns) -->
                    <div class="row align-items-center mb-1">
                        <div class="col-md-6">
                            <div>
                                <strong>Overall Profit Margin: ${platformSummary.profitMargin.toFixed(1)}%</strong>
                                · ${platformSummary.totalOrgs} Organizations
                                ${(revenueBreakdown.demoOrgCount || 0) > 0 ? html`<span class="badge bg-warning-lt text-warning ms-1">${revenueBreakdown.demoOrgCount} Demo</span>` : ''}
                                · ${deviceHealth.activeCount} Active Devices
                                · ${(metrics.telemetryVolumes?.platform?.totalRows || 0).toLocaleString()} Daily Telemetry Rows
                            </div>
                        </div>
                        <div class="col-md-3"></div>
                        <div class="col-md-3"></div>
                    </div>
                    
                    <!-- Row 3: Profit Margin Label + Refresh (aligned to match row 1 columns) -->
                    <div class="row align-items-center">
                        <div class="col-md-6"></div>
                        <div class="col-md-3 text-center">
                            <div class="small opacity-75">Profit Margin</div>
                        </div>
                        <div class="col-md-3 text-end">
                            <button class="btn btn-light btn-sm" onClick=${() => { setForceRefresh(true); loadBusinessMetrics(); }}>
                                <i class="bi bi-arrow-clockwise"></i> Refresh Now
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="d-flex justify-content-end mb-3">
                <div class="input-group input-group-sm" style="max-width: 220px;">
                    <span class="input-group-text">Time Window</span>
                    <select class="form-select" value=${kpiWindowDays} onChange=${e => setKpiWindowDays(parseInt(e.target.value, 10))}>
                        <option value="7">7 days</option>
                        <option value="30">30 days</option>
                    </select>
                </div>
            </div>

            <!-- KPI Cards Row -->
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Monthly Recurring Revenue ${renderInfoTooltip('MRR is predictable monthly subscription revenue from all active paid organizations.')}</div>
                            <div class="h2 mb-0 text-success">${formatCurrency(platformSummary.mrr || 0)}</div>
                            ${platformSummary.trends && platformSummary.trends.length >= 2 
                                ? renderTrendIndicator(calculateTrend(platformSummary.mrr || 0, platformSummary.trends, 'mrr'), false)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                                ${renderMrrMlStatus(platformSummary.trends)}
                            <div class="text-body-secondary small mt-2">ARR: ${formatCurrency((platformSummary.mrr || 0) * 12)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Avg Daily Azure Spend (${kpiWindowDays}D) ${renderInfoTooltip('Average daily spend over selected time window using Azure Cost snapshots.')}</div>
                            <div class="h2 mb-0 text-danger">${formatCurrency(avgDailyAzureSpend || 0)}</div>
                            ${platformSummary.trends && platformSummary.trends.length >= 2
                                ? renderTrendIndicator(calculateTrend(avgDailyAzureSpend || 0, platformSummary.trends, 'cost'), true)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                            <div class="text-body-secondary small mt-2">Projected monthly: ${formatCurrency(projectedMonthlySpendFromWindow || 0)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">AI Models Spend (MTD) ${renderInfoTooltip('MTD AI spend is month-to-date Azure AI model cost from daily service cost entries.')}</div>
                            <div class="h2 mb-0 text-warning">${formatCurrency(aiMtdSpend || 0)}</div>
                            ${aiTrend
                                ? renderTrendIndicator(aiTrend, true)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                            <div class="text-body-secondary small mt-2">${kpiWindowDays}D avg: ${formatCurrency(aiAvg7dSpend || 0)}/day</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card h-100 ${atRiskOrganizations && atRiskOrganizations.length > 0 ? 'border-warning' : ''}">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">
                                <i class="bi bi-exclamation-triangle-fill text-warning"></i> Revenue Leak Alert
                            </div>
                            ${atRiskOrganizations && atRiskOrganizations.length > 0 ? html`
                                <div class="h2 mb-0 text-warning">${atRiskOrganizations.length}</div>
                                <div class="text-body-secondary small mb-2">
                                    ${atRiskOrganizations.length === 1 ? 'Organization' : 'Organizations'} Need Attention
                                </div>
                                <div class="d-flex justify-content-center gap-2 flex-wrap">
                                    ${atRiskOrganizations.filter(o => o.daysToExpiry !== null && o.daysToExpiry < 30).length > 0 ? html`
                                        <span class="badge bg-danger text-white">
                                            ${atRiskOrganizations.filter(o => o.daysToExpiry !== null && o.daysToExpiry < 30).length} Expiring
                                        </span>
                                    ` : ''}
                                    ${atRiskOrganizations.filter(o => (o.marginPercent || 0) < 20).length > 0 ? html`
                                        <span class="badge bg-warning text-white">
                                            ${atRiskOrganizations.filter(o => (o.marginPercent || 0) < 20).length} Low Margin
                                        </span>
                                    ` : ''}
                                </div>
                            ` : html`
                                <div class="h2 mb-0 text-success">0</div>
                                <div class="text-body-secondary small">All organizations healthy</div>
                            `}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Organizations & Devices</div>
                            <div class="h2 mb-0">${platformSummary.totalOrgs || 0} <span class="h4 text-body-secondary">orgs</span></div>
                            <div class="small mt-1">
                                ${platformSummary.trends && platformSummary.trends.length >= 2
                                    ? renderTrendIndicator(calculateTrend(platformSummary.totalOrgs || 0, platformSummary.trends, 'orgCount'), false)
                                    : html`<span class="text-body-secondary"><em>Org trend collecting...</em></span>`
                                }
                            </div>
                            <div class="text-body-secondary small mt-1">
                                ${revenueBreakdown.personalCount || 0} Personal · ${revenueBreakdown.businessCount || 0} Business
                                ${(revenueBreakdown.demoOrgCount || 0) > 0 ? html` · <span class="text-warning">${revenueBreakdown.demoOrgCount} Demo</span>` : ''}
                            </div>
                            <div class="text-body-secondary small mt-1">
                                ${deviceHealth.activeCount} Active · ${deviceHealth.disabledCount} Disabled
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Daily Telemetry Volume</div>
                            <div class="h2 mb-0 text-primary">${formatCompactNumber(metrics.telemetryVolumes?.platform?.totalRows || 0)}</div>
                            ${platformSummary.trends && platformSummary.trends.length >= 2
                                ? renderTrendIndicator(calculateTrend(metrics.telemetryVolumes?.platform?.totalRows || 0, platformSummary.trends, 'telemetryVolume'), true)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                            <div class="text-body-secondary small mt-2">
                                ${(() => {
                                    const tv = metrics.telemetryVolumes?.platform;
                                    if (!tv || tv.totalRows === 0) return 'rows / day (no telemetry yet)';
                                    return `Heartbeat: ${formatCompactNumber(tv.heartbeatRows || 0)} · App: ${formatCompactNumber(tv.appTelemetryRows || 0)} · CVE: ${formatCompactNumber(tv.cveTelemetryRows || 0)} · Perf: ${formatCompactNumber(tv.perfTelemetryRows || 0)} · Machine: ${formatCompactNumber(tv.machineTelemetryRows || 0)}`;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">KR: Run-rate Profit</div>
                            <div class="h3 mb-0 ${krMetrics.runRateProfit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(krMetrics.runRateProfit || 0)}</div>
                            <div class="text-body-secondary small mt-2">MRR minus projected month-end cost</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">KR: Cost / Revenue</div>
                            <div class="h3 mb-0 ${krMetrics.costToRevenue <= 40 ? 'text-success' : krMetrics.costToRevenue <= 60 ? 'text-warning' : 'text-danger'}">${krMetrics.costToRevenue.toFixed(1)}%</div>
                            <div class="text-body-secondary small mt-2">Target ≤ 40%</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">KR: AI Share of Cost</div>
                            <div class="h3 mb-0 ${krMetrics.aiShareOfCost <= 15 ? 'text-success' : krMetrics.aiShareOfCost <= 25 ? 'text-warning' : 'text-danger'}">${krMetrics.aiShareOfCost.toFixed(1)}%</div>
                            <div class="text-body-secondary small mt-2">Target ≤ 15%</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">KR: ${kpiWindowDays}D Daily Run-rate</div>
                            <div class="h3 mb-0 text-primary">${formatCurrency(krMetrics.runRate || 0)}</div>
                            <div class="text-body-secondary small mt-2">Projected month-end: ${formatCurrency(krMetrics.projectedMonthEndCost || 0)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Avg Cost / Org / Day</div>
                            <div class="h3 mb-0 text-primary">${formatCurrency(investorSummary.avgDailyCostPerOrg || 0)}</div>
                            <div class="text-body-secondary small mt-2">Max: ${formatCurrency(investorSummary.maxDailyCostPerOrg || 0)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Avg Cost / Device / Day</div>
                            <div class="h3 mb-0 text-info">${formatCurrency(investorSummary.avgDailyCostPerDevice || 0)}</div>
                            <div class="text-body-secondary small mt-2">Max: ${formatCurrency(investorSummary.maxDailyCostPerDevice || 0)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Projected Cost @ Avg Utilization</div>
                            <div class="h3 mb-0 text-warning">${formatCurrency(investorSummary.projectedMonthlyCostAtAvgUtilization || 0)}</div>
                            <div class="text-body-secondary small mt-2">+${formatCurrency(investorSummary.additionalCostAtAvgUtilization || 0)} vs current</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Projected Margin @ Max Utilization</div>
                            <div class="h3 mb-0 ${(investorSummary.estimatedProjectedMarginAtMaxUtilization || 0) >= 0 ? 'text-success' : 'text-danger'}">
                                ${(investorSummary.estimatedProjectedMarginAtMaxUtilization || 0).toFixed(1)}%
                            </div>
                            <div class="text-body-secondary small mt-2">Peak cost: ${formatCurrency(investorSummary.projectedMonthlyCostAtMaxUtilization || 0)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Telemetry Volume by Type (Daily)</h5>
                        </div>
                        <div class="card-body" style="height: 290px;">
                            ${metrics?.costAnalytics?.dailyTelemetryTypeVolumes?.length > 0
                                ? html`<canvas ref=${telemetryByTypeChartRef}></canvas>`
                                : html`<div class="text-body-secondary text-center py-5">Telemetry type trends are building from daily cost snapshots.</div>`}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Top 5 Orgs by Telemetry (30D)</h5>
                        </div>
                        <div class="card-body" style="height: 290px;">
                            ${metrics?.costAnalytics?.dailyTelemetryTypeVolumes?.length > 0
                                ? html`<canvas ref=${topOrgTelemetryChartRef}></canvas>`
                                : html`<div class="text-body-secondary text-center py-5">Top-organization telemetry trends are not available yet.</div>`}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Telemetry Cost Mix (Latest Day)</h5>
                        </div>
                        <div class="card-body" style="height: 290px;">
                            ${metrics?.costAnalytics?.dailyTelemetryTypeVolumes?.length > 0
                                ? html`<canvas ref=${telemetryCostMixChartRef}></canvas>`
                                : html`<div class="text-body-secondary text-center py-5">Telemetry cost attribution will appear after daily snapshot rebuild.</div>`}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Top Org Telemetry Economics</h5>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-sm table-vcenter mb-0">
                                    <thead>
                                        <tr>
                                            <th>Org</th>
                                            <th class="text-end">Rows (30D)</th>
                                            <th class="text-end">Avg Cost/Day</th>
                                            <th class="text-end">Cost/Device/Day</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(metrics?.costAnalytics?.topOrgTelemetryAggregates || []).slice(0, 10).map(item => html`
                                            <tr key=${item.orgId}>
                                                <td>${item.orgId}</td>
                                                <td class="text-end">${formatCompactNumber(item.totalTelemetryRows || 0)}</td>
                                                <td class="text-end">${formatCurrency(item.avgCostPerDay || 0)}</td>
                                                <td class="text-end">${formatCurrency(item.avgCostPerDevicePerDay || 0)}</td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Revenue Breakdown</h5>
                        </div>
                        <div class="card-body">
                            <div ref=${revenueChartRef}></div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">
                            <div class="d-flex align-items-center justify-content-between">
                                <h5 class="card-title mb-0">MRR Trend (30 Days)</h5>
                                <span 
                                    class="badge bg-info-lt text-info cursor-help" 
                                    data-bs-toggle="tooltip" 
                                    data-bs-placement="bottom"
                                    title="Monthly Recurring Revenue (MRR) represents your predictable monthly income from active subscriptions. Upward trend = growing user base; downward trend = lost customers or reduced activity."
                                >
                                    <i class="ti ti-info-circle"></i>
                                </span>
                            </div>
                        </div>
                        <div class="card-body" style="height: 280px;">
                            <canvas ref=${mrrTrendChartRef}></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Margin Band Distribution</h5>
                        </div>
                        <div class="card-body" style="height: 280px;">
                            <canvas ref=${marginBandChartRef}></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Cost Analytics Charts Row (always visible; shows empty state when data is collecting) -->
            <div class="row g-3 mb-4">
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header d-flex align-items-center justify-content-between">
                            <h5 class="card-title mb-0">
                                <i class="bi bi-bar-chart-line me-1"></i> Daily Azure Expenses
                            </h5>
                            <select
                                class="form-select form-select-sm w-auto ms-3"
                                value=${costTrendDays}
                                onChange=${e => setCostTrendDays(parseInt(e.target.value))}>
                                <option value="7">Last 7 days</option>
                                <option value="14">Last 14 days</option>
                                <option value="30">Last 30 days</option>
                            </select>
                        </div>
                        <div class="card-body" style="height: 280px; position: relative;">
                            ${metrics?.costAnalytics?.dailySnapshots?.length > 0
                                ? html`<canvas ref=${costTrendChartRef} style="width:100%;height:100%;"></canvas>`
                                : html`
                                    <div class="d-flex align-items-center justify-content-center h-100 text-body-secondary">
                                        <div class="text-center">
                                            <i class="bi bi-bar-chart-line fs-2 d-block mb-2 opacity-25"></i>
                                            <div class="small">Daily expense data collecting</div>
                                            <div class="small opacity-75">Populated by cost allocation cron (runs daily)</div>
                                        </div>
                                    </div>
                                `
                            }
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header d-flex align-items-center justify-content-between">
                            <h5 class="card-title mb-0">
                                <i class="bi bi-pie-chart me-1"></i> Cost by Resource Type
                            </h5>
                            <select
                                class="form-select form-select-sm w-auto ms-3"
                                value=${costBreakdownPeriod}
                                onChange=${e => setCostBreakdownPeriod(e.target.value)}>
                                <option value="latest">Latest day</option>
                                <option value="7d">7-day total</option>
                                <option value="mtd">Month to date</option>
                            </select>
                        </div>
                        <div class="card-body" style="height: 280px; position: relative;">
                            ${metrics?.costAnalytics?.dailySnapshots?.length > 0
                                ? html`<canvas ref=${costBreakdownChartRef} style="width:100%;height:100%;"></canvas>`
                                : html`
                                    <div class="d-flex align-items-center justify-content-center h-100 text-body-secondary">
                                        <div class="text-center">
                                            <i class="bi bi-pie-chart fs-2 d-block mb-2 opacity-25"></i>
                                            <div class="small">Resource cost breakdown collecting</div>
                                            <div class="small opacity-75">Requires Cost Management API data (24–48h delay)</div>
                                        </div>
                                    </div>
                                `
                            }
                        </div>
                    </div>
                </div>
            </div>

            <!-- Azure Service Cost Trends Section -->
            ${serviceCostTrendsSection}

            <!-- Projected Costs Section -->
            ${buildProjectedCostsSection(metrics)}

            <!-- Top Organizations Table with Expandable Device Rows -->
            <div class="card mb-4">
                <div class="card-header">
                    <h5 class="card-title mb-0">Top 20 Organizations by Revenue</h5>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover table-sm mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 30px;"></th>
                                    <th>Organization</th>
                                    <th class="text-end">Devices</th>
                                    <th class="text-end">Monthly Revenue</th>
                                    <th class="text-end">Monthly Cost</th>
                                    <th class="text-end">Profit</th>
                                    <th class="text-center">Margin</th>
                                    <th class="text-center" title="What if all seats were used?">Full Util</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${topOrganizations.map(org => html`
                                    <tr key=${org.orgId} class="cursor-pointer" onClick=${() => toggleOrgExpand(org.orgId)}>
                                        <td>
                                            <i class="bi ${expandedOrgs.has(org.orgId) ? 'bi-chevron-down' : 'bi-chevron-right'}"></i>
                                        </td>
                                        <td>
                                            <strong>${org.orgName || org.orgId}</strong>
                                            ${org.isDemoOrg ? html`<span class="badge bg-warning-lt text-warning ms-1">Demo</span>` : ''}
                                            <div class="text-body-secondary small">${org.licenseType} · ${org.seats} seats (${org.deviceCount} used)</div>
                                        </td>
                                        <td class="text-end">${org.deviceCount || 0}</td>
                                        <td class="text-end text-success">${formatCurrency(org.monthlyRevenue || 0)}</td>
                                        <td class="text-end text-danger">${formatCurrency(org.monthlyCost || 0)}</td>
                                        <td class="text-end ${(org.profit || 0) >= 0 ? 'text-success' : 'text-danger'}">
                                            ${formatCurrency(org.profit || 0)}
                                        </td>
                                        <td class="text-center">
                                            <span class="badge" 
                                                  style="background: ${getMarginBadgeLightStyle(org.marginBand).bg}; color: ${getMarginBadgeLightStyle(org.marginBand).text};" 
                                                  title="${getMarginBandText(org.marginBand)}">
                                                ${(org.marginPercent || 0).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td class="text-center">
                                            ${org.seats > org.deviceCount ? html`
                                                <div class="d-flex flex-column align-items-center" 
                                                     title="If all ${org.seats} seats were used: ${(org.projectedFullUtilizationMargin || 0).toFixed(1)}% margin, ${formatCurrency(org.projectedFullUtilizationProfit || 0)} profit">
                                                    <span class="badge ${org.wouldBeProfitableAtFullUtilization ? 'badge-success' : 'badge-danger'}">
                                                        ${org.wouldBeProfitableAtFullUtilization ? '✓' : '✗'} ${(org.projectedFullUtilizationMargin || 0).toFixed(0)}%
                                                    </span>
                                                    <small class="text-body-secondary">${formatCurrency(org.projectedFullUtilizationProfit || 0)}</small>
                                                </div>
                                            ` : html`
                                                <span class="text-body-secondary small" title="All seats are currently in use">Full</span>
                                            `}
                                        </td>
                                    </tr>
                                    ${expandedOrgs.has(org.orgId) && org.devices && org.devices.length > 0 && html`
                                        <tr>
                                            <td colspan="7" class="p-0">
                                                <div class="bg-light p-3">
                                                    <h6 class="mb-2">Devices (Top ${Math.min(10, org.devices.length)})</h6>
                                                    <table class="table table-sm table-bordered mb-0">
                                                        <thead>
                                                            <tr>
                                                                <th>Device Name</th>
                                                                <th>State</th>
                                                                <th class="text-end">Daily Cost</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            ${org.devices.slice(0, 10).map(device => html`
                                                                <tr key=${device.deviceId}>
                                                                    <td>
                                                                        <a href="#!/devices/${device.deviceId}" class="text-primary">
                                                                            ${device.deviceName || device.deviceId}
                                                                        </a>
                                                                    </td>
                                                                    <td>
                                                                        <span class="badge badge-${device.state === 'ACTIVE' ? 'success' : 'secondary'}">
                                                                            ${device.state}
                                                                        </span>
                                                                    </td>
                                                                    <td class="text-end">${formatCurrency(device.dailyCost || 0)}</td>
                                                                </tr>
                                                            `)}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    `}
                                `)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- At-Risk Organizations Alert -->
            ${atRiskOrganizations.length > 0 && html`
                <div class="card border-warning mb-4">
                    <div class="card-header bg-warning text-dark">
                        <h5 class="card-title mb-0">
                            <i class="bi bi-exclamation-triangle-fill"></i> At-Risk Organizations
                        </h5>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm mb-0">
                                <thead>
                                    <tr>
                                        <th>Organization</th>
                                        <th class="text-end">Devices</th>
                                        <th class="text-end">Margin</th>
                                        <th class="text-end">Days to Expiry</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${atRiskOrganizations.slice(0, 10).map(org => html`
                                        <tr key=${org.orgId}>
                                            <td><strong>${org.orgName || org.orgId}</strong></td>
                                            <td class="text-end">${org.deviceCount || 0}</td>
                                            <td class="text-end">
                                                <span class="badge" 
                                                      style="background: ${getMarginBadgeLightStyle(org.marginBand).bg}; color: ${getMarginBadgeLightStyle(org.marginBand).text};" 
                                                      title="${getMarginBandText(org.marginBand)}">
                                                    ${(org.marginPercent || 0).toFixed(1)}%
                                                </span>
                                            </td>
                                            <td class="text-end">
                                                ${org.daysToExpiry !== null ? html`
                                                    <span class="badge ${org.daysToExpiry < 30 ? 'badge-danger' : 'badge-warning'}">
                                                        ${org.daysToExpiry} days
                                                    </span>
                                                ` : 'N/A'}
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `}

            <!-- Cost Breakdown Details -->
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Telemetry Distribution (24h)</h5>
                        </div>
                        <div class="card-body">
                            ${metrics?.telemetryVolumes?.platform ? html`
                                ${(() => {
                                    const tv = metrics.telemetryVolumes.platform;
                                    const totalRows = Number(tv.totalRows || 0);
                                    const parts = [
                                        { label: 'Heartbeat', value: Number(tv.heartbeatRows || 0) },
                                        { label: 'AppTelemetry', value: Number(tv.appTelemetryRows || 0) },
                                        { label: 'CveTelemetry', value: Number(tv.cveTelemetryRows || 0) },
                                        { label: 'PerfTelemetry', value: Number(tv.perfTelemetryRows || 0) },
                                        { label: 'MachineTelemetry', value: Number(tv.machineTelemetryRows || 0) }
                                    ];

                                    return html`
                                        ${parts.map(item => {
                                            const pct = totalRows > 0 ? (item.value / totalRows) * 100 : 0;
                                            return html`
                                                <div class="mb-2" key=${item.label}>
                                                    <div class="d-flex justify-content-between small mb-1">
                                                        <span>${item.label}</span>
                                                        <strong>${formatCompactNumber(item.value)} (${pct.toFixed(1)}%)</strong>
                                                    </div>
                                                    <div class="progress progress-sm">
                                                        <div class="progress-bar" style=${`width:${pct.toFixed(1)}%`}></div>
                                                    </div>
                                                </div>
                                            `;
                                        })}

                                        <hr />
                                        <h6 class="small text-body-secondary mb-2">Top Organizations by Telemetry Volume</h6>
                                        <div class="table-responsive">
                                            <table class="table table-sm mb-0">
                                                <thead>
                                                    <tr>
                                                        <th>Org</th>
                                                        <th class="text-end">Rows (24h)</th>
                                                        <th class="text-end">Share</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${Object.values(metrics.telemetryVolumes.perOrg || {})
                                                        .sort((a, b) => (b.totalRows || 0) - (a.totalRows || 0))
                                                        .slice(0, 8)
                                                        .map(org => {
                                                            const share = totalRows > 0 ? ((org.totalRows || 0) / totalRows) * 100 : 0;
                                                            return html`
                                                                <tr key=${org.orgId}>
                                                                    <td>${org.orgName || org.orgId}</td>
                                                                    <td class="text-end">${formatCompactNumber(org.totalRows || 0)}</td>
                                                                    <td class="text-end">${share.toFixed(1)}%</td>
                                                                </tr>
                                                            `;
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    `;
                                })()}
                            ` : html`
                                <div class="text-body-secondary">No telemetry distribution data available</div>
                            `}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">Device Health Summary</h5>
                        </div>
                        <div class="card-body">
                            <div class="mb-2 d-flex justify-content-between">
                                <span><span class="badge badge-success">Active</span></span>
                                <strong>${deviceHealth.activeCount} devices</strong>
                            </div>
                            <div class="mb-2 d-flex justify-content-between">
                                <span><span class="badge badge-secondary">Disabled</span></span>
                                <strong>${deviceHealth.disabledCount} devices</strong>
                            </div>
                            <div class="mb-2 d-flex justify-content-between">
                                <span><span class="badge badge-danger">Blocked</span></span>
                                <strong>${deviceHealth.blockedCount} devices</strong>
                            </div>
                            <div class="mb-2 d-flex justify-content-between">
                                <span><span class="badge badge-info">Online</span></span>
                                <strong>${deviceHealth.onlineCount} devices</strong>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span><span class="badge badge-warning">Heartbeat Only</span></span>
                                <strong>${deviceHealth.heartbeatOnlyCount} devices</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
