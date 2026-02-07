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
    const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'USD');
    const [serviceCostDays, setServiceCostDays] = useState(30); // 7, 30, or 90 days
    
    // Chart refs
    const revenueChartRef = useRef(null);
    const mrrTrendChartRef = useRef(null);
    const marginBandChartRef = useRef(null);
    const costTrendChartRef = useRef(null);
    const costBreakdownChartRef = useRef(null);
    
    // Service cost trend chart refs (dynamic)
    const [serviceChartRefs, setServiceChartRefs] = useState({});
    const [serviceCharts, setServiceCharts] = useState({});
    
    // Chart instances
    const [revenueChart, setRevenueChart] = useState(null);
    const [mrrTrendChart, setMrrTrendChart] = useState(null);
    const [marginBandChart, setMarginBandChart] = useState(null);
    const [costTrendChart, setCostTrendChart] = useState(null);
    const [costBreakdownChart, setCostBreakdownChart] = useState(null);

    // Exchange rate: Hardcoded approximate INR/USD rate (Jan 2026)
    const EXCHANGE_RATE = 83.5; // ₹83.5 per $1

    useEffect(() => {
        loadBusinessMetrics();
        return () => {
            // Cleanup charts on unmount
            if (revenueChart) revenueChart.destroy();
            if (mrrTrendChart) mrrTrendChart.destroy();
            if (marginBandChart) marginBandChart.destroy();
            if (costTrendChart) costTrendChart.destroy();
            if (costBreakdownChart) costBreakdownChart.destroy();
        };
    }, []);

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
            
            // Service cost trend charts (if available)
            if (data.costAnalytics.dailyServiceCosts && data.costAnalytics.dailyServiceCosts.length > 0) {
                setTimeout(() => renderServiceCostCharts(data.costAnalytics.dailyServiceCosts, serviceCostDays), 200);
            }
        }
    };

    const renderRevenueChart = (breakdown) => {
        if (!revenueChartRef.current) return;

        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;
        const currencySymbol = currency === 'INR' ? '₹' : '$';

        const options = {
            series: [breakdown.personalRevenue * currencyMultiplier, breakdown.businessRevenue * currencyMultiplier],
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
        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;
        const currencySymbol = currency === 'INR' ? '₹' : '$';

        if (mrrTrendChart) {
            mrrTrendChart.destroy();
        }

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'MRR',
                    data: trends.map(t => t.mrr * currencyMultiplier),
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
        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;
        const currencySymbol = currency === 'INR' ? '₹' : '$';

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
                    data: bandData.map(b => b.value * currencyMultiplier),
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

        renderCostTrendChart(costAnalytics.dailySnapshots);
        renderCostBreakdownChart(costAnalytics.dailySnapshots);
    };

    const renderCostTrendChart = (snapshots) => {
        if (!costTrendChartRef.current) return;

        const ctx = costTrendChartRef.current.getContext('2d');

        if (costTrendChart) {
            costTrendChart.destroy();
        }

        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;
        const currencySymbol = currency === 'INR' ? '₹' : '$';

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: snapshots.map(s => new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'Daily Cost',
                    data: snapshots.map(s => s.totalCost * currencyMultiplier),
                    borderColor: '#f76707',
                    backgroundColor: 'rgba(247, 103, 7, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
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
                                return 'Cost: ' + currencySymbol + context.parsed.y.toFixed(2);
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

    const renderCostBreakdownChart = (snapshots) => {
        if (!costBreakdownChartRef.current || snapshots.length === 0) return;

        const ctx = costBreakdownChartRef.current.getContext('2d');

        if (costBreakdownChart) {
            costBreakdownChart.destroy();
        }

        // Get latest snapshot's cost breakdown
        const latest = snapshots[snapshots.length - 1];
        const costsByType = latest.costsByResourceType || {};

        // Simplify resource type names and group
        const simplified = {};
        Object.entries(costsByType).forEach(([type, cost]) => {
            let category = 'Other';
            if (type.includes('Container')) category = 'Container Apps';
            else if (type.includes('Registry')) category = 'Container Registry';
            else if (type.includes('Storage')) category = 'Storage';
            else if (type.includes('KeyVault')) category = 'Key Vault';
            else if (type.includes('Bandwidth')) category = 'Bandwidth';
            
            simplified[category] = (simplified[category] || 0) + cost;
        });

        const labels = Object.keys(simplified);
        const data = Object.values(simplified);
        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;
        const currencySymbol = currency === 'INR' ? '₹' : '$';

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data.map(v => v * currencyMultiplier),
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
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percent = ((value / total) * 100).toFixed(1);
                                return label + ': ' + currencySymbol + value.toFixed(2) + ' (' + percent + '%)';
                            }
                        }
                    }
                }
            }
        });

        setCostBreakdownChart(chart);
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
        if (currency === 'INR') {
            return '₹' + (value * EXCHANGE_RATE).toFixed(0);
        }
        return '$' + value.toFixed(2);
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
    const toggleCurrency = () => {
        const newCurrency = currency === 'USD' ? 'INR' : 'USD';
        setCurrency(newCurrency);
        localStorage.setItem('currency', newCurrency);
        // Re-render charts with new currency
        if (metrics) {
            setTimeout(() => renderCharts(metrics), 50);
        }
    };

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
        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;

        topServices.forEach(service => {
            const canvasId = `service-chart-${service.replace(/\s+/g, '-').toLowerCase()}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            const serviceData = serviceGroups[service].sort((a, b) => new Date(a.date) - new Date(b.date));
            const labels = serviceData.map(e => new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            const costs = serviceData.map(e => e.cost * currencyMultiplier);

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
                                    const symbol = currency === 'INR' ? '₹' : '$';
                                    return `${symbol}${context.parsed.y.toFixed(2)}`;
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
                        Daily Azure service costs will appear here once the Cost Management API returns data.<br>
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

        const orgAllocations = currentMetrics.costAnalytics.orgAllocations || {};
        const orgsWithProjections = Object.values(orgAllocations).filter(org => 
            org.projectedCosts && org.projectedCosts.inactiveSeats > 0
        );

        if (orgsWithProjections.length === 0) return null;

        const currencySymbol = currency === 'INR' ? '₹' : '$';
        const currencyMultiplier = currency === 'INR' ? EXCHANGE_RATE : 1;

        // Calculate platform-wide aggregates
        const totalInactiveSeats = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.inactiveSeats, 0);
        const totalAdditionalCostAvg = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.additionalCostAvg, 0) * currencyMultiplier;
        const totalAdditionalCostPeak = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.additionalCostPeak, 0) * currencyMultiplier;
        const totalCurrentMonthlyCost = orgsWithProjections.reduce((sum, org) => sum + org.projectedCosts.currentMonthlyCost, 0) * currencyMultiplier;

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
                                    <div class="h3 mb-0">${currencySymbol}${totalCurrentMonthlyCost.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card bg-success-lt">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Projected (Avg Scenario)</div>
                                    <div class="h4 mb-0 text-success">+${currencySymbol}${totalAdditionalCostAvg.toFixed(2)}/mo</div>
                                    <div class="text-body-secondary small">If all seats at avg telemetry</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card bg-warning-lt">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Projected (Peak Scenario)</div>
                                    <div class="h4 mb-0 text-warning">+${currencySymbol}${totalAdditionalCostPeak.toFixed(2)}/mo</div>
                                    <div class="text-body-secondary small">If all seats at peak telemetry</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card bg-info-lt">
                                <div class="card-body text-center">
                                    <div class="text-body-secondary small mb-1">Cost Range</div>
                                    <div class="h4 mb-0 text-info">${((totalAdditionalCostPeak - totalAdditionalCostAvg) / totalAdditionalCostAvg * 100).toFixed(0)}%</div>
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
                                    const currentCost = org.projectedCosts.currentMonthlyCost * currencyMultiplier;
                                    const projectedAvg = org.projectedCosts.projectedAvgMonthlyCost * currencyMultiplier;
                                    const projectedPeak = org.projectedCosts.projectedPeakMonthlyCost * currencyMultiplier;
                                    const additionalAvg = org.projectedCosts.additionalCostAvg * currencyMultiplier;
                                    const additionalPeak = org.projectedCosts.additionalCostPeak * currencyMultiplier;

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
                                            <td class="text-end text-muted">
                                                ${currencySymbol}${currentCost.toFixed(2)}
                                            </td>
                                            <td class="text-end text-success">
                                                ${currencySymbol}${projectedAvg.toFixed(2)}
                                            </td>
                                            <td class="text-end text-warning">
                                                ${currencySymbol}${projectedPeak.toFixed(2)}
                                            </td>
                                            <td class="text-end">
                                                <span class="badge bg-success text-white">+${currencySymbol}${additionalAvg.toFixed(2)}</span>
                                            </td>
                                            <td class="text-end">
                                                <span class="badge bg-warning text-white">+${currencySymbol}${additionalPeak.toFixed(2)}</span>
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

    return html`
        <div class="business-matrix-container">
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
                            <!-- Currency Toggle Slider -->
                            <div class="btn-group" role="group" style="background: rgba(255,255,255,0.2); border-radius: 20px; padding: 2px;">
                                <button 
                                    class="btn btn-sm ${currency === 'INR' ? 'btn-light' : ''}" 
                                    style="border-radius: 18px; min-width: 50px; ${currency === 'INR' ? '' : 'background: transparent; border: none; color: white;'}"
                                    onClick=${() => { if (currency !== 'INR') toggleCurrency(); }}
                                >
                                    ₹ INR
                                </button>
                                <button 
                                    class="btn btn-sm ${currency === 'USD' ? 'btn-light' : ''}" 
                                    style="border-radius: 18px; min-width: 50px; ${currency === 'USD' ? '' : 'background: transparent; border: none; color: white;'}"
                                    onClick=${() => { if (currency !== 'USD') toggleCurrency(); }}
                                >
                                    $ USD
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
                                · ${deviceHealth.activeCount} Active Devices
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

            <!-- KPI Cards Row -->
            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Monthly Recurring Revenue</div>
                            <div class="h2 mb-0 text-success">${formatCurrency(platformSummary.mrr || 0)}</div>
                            ${platformSummary.trends && platformSummary.trends.length >= 2 
                                ? renderTrendIndicator(calculateTrend(platformSummary.mrr || 0, platformSummary.trends, 'mrr'), false)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                            <div class="text-body-secondary small mt-2">ARR: ${formatCurrency((platformSummary.mrr || 0) * 12)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Azure Monthly Cost</div>
                            <div class="h2 mb-0 text-danger">${formatCurrency(platformSummary.actualMonthlyAzureCost || 0)}</div>
                            ${platformSummary.trends && platformSummary.trends.length >= 2
                                ? renderTrendIndicator(calculateTrend(platformSummary.actualMonthlyAzureCost || 0, platformSummary.trends, 'cost'), true)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                            <div class="text-body-secondary small mt-2">Infrastructure</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card ${atRiskOrganizations && atRiskOrganizations.length > 0 ? 'border-warning' : ''}">
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
                                        <span class="badge bg-danger">
                                            ${atRiskOrganizations.filter(o => o.daysToExpiry !== null && o.daysToExpiry < 30).length} Expiring
                                        </span>
                                    ` : ''}
                                    ${atRiskOrganizations.filter(o => (o.marginPercent || 0) < 20).length > 0 ? html`
                                        <span class="badge bg-warning">
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
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-body-secondary small mb-2">Organizations & Devices</div>
                            <div class="h2 mb-0">${platformSummary.totalOrgs || 0} <span class="h4 text-body-secondary">orgs</span></div>
                            ${platformSummary.trends && platformSummary.trends.length >= 2
                                ? renderTrendIndicator(calculateTrend(platformSummary.totalDevices || 0, platformSummary.trends, 'deviceCount'), false)
                                : html`<div class="text-body-secondary small mt-1"><em>Trend data collecting...</em></div>`
                            }
                            <div class="text-body-secondary small mt-2">
                                ${deviceHealth.activeCount} Active · ${deviceHealth.disabledCount} Disabled
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
                                    class="badge bg-info-lt cursor-help" 
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

            <!-- Cost Analytics Charts Row -->
            ${metrics && metrics.costAnalytics && (metrics.costAnalytics.dailySnapshots && metrics.costAnalytics.dailySnapshots.length > 0) ? html`
                <div class="row g-3 mb-4">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5 class="card-title mb-0">Daily Cost Trend (Last 30 Days)</h5>
                            </div>
                            <div class="card-body" style="height: 280px;">
                                <canvas ref=${costTrendChartRef}></canvas>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5 class="card-title mb-0">Cost Breakdown by Resource Type</h5>
                            </div>
                            <div class="card-body" style="height: 280px;">
                                <canvas ref=${costBreakdownChartRef}></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}

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
                            <h5 class="card-title mb-0">Cost Breakdown by Resource</h5>
                        </div>
                        <div class="card-body">
                            ${costBreakdown.costByResourceType && costBreakdown.costByResourceType.length > 0 ? html`
                                ${costBreakdown.costByResourceType.map(item => html`
                                    <div class="mb-2 d-flex justify-content-between" key=${item.type}>
                                        <span>${item.type}</span>
                                        <strong>${formatCurrency(item.cost || 0)} (${(item.percentage || 0).toFixed(1)}%)</strong>
                                    </div>
                                `)}
                            ` : html`
                                <div class="text-body-secondary">No cost data available</div>
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
