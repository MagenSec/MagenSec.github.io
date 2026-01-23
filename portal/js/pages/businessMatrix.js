import { api } from '../api.js';
import toast from '../toast.js';
import { logger } from '../config.js';

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
    
    // Chart refs
    const revenueChartRef = useRef(null);
    const mrrTrendChartRef = useRef(null);
    const marginBandChartRef = useRef(null);
    
    // Chart instances
    const [revenueChart, setRevenueChart] = useState(null);
    const [mrrTrendChart, setMrrTrendChart] = useState(null);
    const [marginBandChart, setMarginBandChart] = useState(null);

    useEffect(() => {
        loadBusinessMetrics();
        return () => {
            // Cleanup charts on unmount
            if (revenueChart) revenueChart.destroy();
            if (mrrTrendChart) mrrTrendChart.destroy();
            if (marginBandChart) marginBandChart.destroy();
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
    };

    const renderRevenueChart = (breakdown) => {
        if (!revenueChartRef.current) return;

        const options = {
            series: [breakdown.personalRevenue, breakdown.businessRevenue],
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
                    return '$' + opts.w.globals.series[opts.seriesIndex].toFixed(0);
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return '$' + val.toFixed(2);
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

        if (mrrTrendChart) {
            mrrTrendChart.destroy();
        }

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'MRR',
                    data: trends.map(t => t.value),
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
                                return 'MRR: $' + context.parsed.y.toFixed(0);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(0);
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
                    data: bandData.map(b => b.value),
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
                                return '$' + context.parsed.x.toFixed(0);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });

        setMarginBandChart(chart);
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
            5: '#ae3ec9'   // Bliss
        };
        return colors[bandNum] || '#6c757d';
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

    return html`
        <div class="business-matrix-container">
            <!-- Hero Section with Platform Summary -->
            <div class="card mb-4" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div class="card-body p-4">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <h2 class="mb-2">Business Health  
                                <span class="badge" style="background: ${getMarginBadgeStyle(platformSummary.marginBand)}; color: white;">
                                    ${getMarginBandText(platformSummary.marginBand)}
                                </span>
                            </h2>
                            <div class="mb-3">
                                <strong>Overall Profit Margin: ${platformSummary.profitMargin.toFixed(1)}%</strong>
                                · ${platformSummary.totalOrgs} Organizations
                                · ${deviceHealth.activeCount} Active Devices
                            </div>
                            <div class="btn-group">
                                <button class="btn btn-light btn-sm" onClick=${() => { setForceRefresh(true); loadBusinessMetrics(); }}>
                                    <i class="bi bi-arrow-clockwise"></i> Refresh Now
                                </button>
                                <a href="#!/posture" class="btn btn-light btn-sm">
                                    <i class="bi bi-graph-up"></i> View Security Posture
                                </a>
                            </div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="display-4 mb-0">${(platformSummary.profitMargin || 0).toFixed(0)}%</div>
                            <div class="small opacity-75">Profit Margin</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- KPI Cards Row -->
            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small mb-2">Monthly Recurring Revenue</div>
                            <div class="h2 mb-0 text-success">${(platformSummary.mrr || 0).toFixed(0)}</div>
                            <div class="text-muted small">ARR: ${(platformSummary.arr || 0).toFixed(0)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small mb-2">Azure Monthly Cost</div>
                            <div class="h2 mb-0 text-danger">${(platformSummary.actualMonthlyAzureCost || 0).toFixed(0)}</div>
                            <div class="text-muted small">Infrastructure</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small mb-2">Active Devices</div>
                            <div class="h2 mb-0 text-primary">${deviceHealth.activeCount}</div>
                            <div class="text-muted small">${deviceHealth.disabledCount} Disabled · ${deviceHealth.blockedCount} Blocked</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small mb-2">Organizations</div>
                            <div class="h2 mb-0">${platformSummary.totalOrgs || 0}</div>
                            <div class="text-muted small">${platformSummary.totalDevices || 0} Total Devices</div>
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
                            <h5 class="card-title mb-0">MRR Trend (30 Days)</h5>
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
                                            <div class="text-muted small">${org.licenseType} · ${org.seats} seats</div>
                                        </td>
                                        <td class="text-end">${org.deviceCount || 0}</td>
                                        <td class="text-end text-success">${(org.monthlyRevenue || 0).toFixed(2)}</td>
                                        <td class="text-end text-danger">${(org.monthlyCost || 0).toFixed(2)}</td>
                                        <td class="text-end ${(org.profit || 0) >= 0 ? 'text-success' : 'text-danger'}">
                                            ${(org.profit || 0).toFixed(2)}
                                        </td>
                                        <td class="text-center">
                                            <span class="badge ${getMarginBadgeClass(org.marginBand)}">
                                                ${(org.marginPercent || 0).toFixed(1)}% ${getMarginBandText(org.marginBand)}
                                            </span>
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
                                                                    <td class="text-end">${(device.dailyCost || 0).toFixed(4)}</td>
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
                                                <span class="badge ${getMarginBadgeClass(org.marginBand)}">
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
                                        <strong>$${(item.cost || 0).toFixed(4)} (${(item.percentage || 0).toFixed(1)}%)</strong>
                                    </div>
                                `)}
                            ` : html`
                                <div class="text-muted">No cost data available</div>
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
