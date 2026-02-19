import { api } from '@api';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

/**
 * AI Reports Analysis - Monitor and analyze report generation metrics
 */
export function AiReportsAnalysisPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reports, setReports] = useState([]);
    const [mlDiagnostics, setMlDiagnostics] = useState(null);
    const [showMlDetails, setShowMlDetails] = useState(false);
    const [stats, setStats] = useState({
        totalReports: 0,
        avgGenerationTime: 0,
        avgEnqueueToComplete: 0,
        slowestReport: null,
        fastestReport: null,
        orgsWithReports: 0
    });
    const [timeRange, setTimeRange] = useState('7'); // days
    const [selectedOrg, setSelectedOrg] = useState(''); // Filter by org
    const [startDate, setStartDate] = useState(''); // Filter by start date
    const [orgStats, setOrgStats] = useState({});
    const [sortBy, setSortBy] = useState('completed'); // Sort column: enqueued, started, completed, time
    const [sortOrder, setSortOrder] = useState('desc'); // asc or desc

    useEffect(() => {
        loadReports();
    }, [timeRange, selectedOrg, startDate]);

    const loadReports = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get('/api/v1/admin/ai/reports?includeDiagnostics=true');
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to load AI reports');
            }

            const payload = data.data;
            const reportData = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.reports) ? payload.reports : []);

            setMlDiagnostics(!Array.isArray(payload) ? (payload?.mlDiagnostics || null) : null);

            if (!reportData || !Array.isArray(reportData)) {
                setReports([]);
                setStats({
                    totalReports: 0,
                    avgGenerationTime: 0,
                    avgEnqueueToComplete: 0,
                    slowestReport: null,
                    fastestReport: null,
                    orgsWithReports: 0
                });
                return;
            }

            // Filter by time range
            const now = new Date();
            const daysAgo = new Date(now.getTime() - parseInt(timeRange) * 24 * 60 * 60 * 1000);
            
            let filteredReports = reportData.filter(r => {
                const completedAt = r.completedAt ? new Date(r.completedAt) : null;
                return completedAt && completedAt >= daysAgo;
            });

            // Filter by organization
            if (selectedOrg) {
                filteredReports = filteredReports.filter(r => r.partitionKey === selectedOrg);
            }

            // Filter by start date (if specified, only show reports from that date onwards)
            if (startDate) {
                const filterDate = new Date(startDate);
                filteredReports = filteredReports.filter(r => {
                    const enqueuedAt = r.enqueuedAt ? new Date(r.enqueuedAt) : null;
                    return enqueuedAt && enqueuedAt >= filterDate;
                });
            }

            setReports(filteredReports);
            calculateStats(filteredReports);
        } catch (err) {
            logger.error('[AiReportsAnalysis] Error loading reports:', err);
            setError(err.message || 'Failed to load AI reports');
            setReports([]);
            setMlDiagnostics(null);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (reportList) => {
        if (reportList.length === 0) {
            setStats({
                totalReports: 0,
                avgGenerationTime: 0,
                avgEnqueueToComplete: 0,
                slowestReport: null,
                fastestReport: null,
                orgsWithReports: 0
            });
            setOrgStats({});
            return;
        }

        let totalGenTime = 0;
        let totalEnqueueTime = 0;
        let slowestReport = null;
        let fastestReport = null;
        let slowestTime = 0;
        let fastestTime = Infinity;
        const orgMap = {};

        reportList.forEach(r => {
            const enqueuedAt = r.enqueuedAt ? new Date(r.enqueuedAt) : null;
            const startedAt = r.startedAt ? new Date(r.startedAt) : null;
            const completedAt = r.completedAt ? new Date(r.completedAt) : null;

            // Generation time: startedAt to completedAt
            if (startedAt && completedAt) {
                const genTime = completedAt - startedAt;
                totalGenTime += genTime;
                
                if (genTime > slowestTime) {
                    slowestTime = genTime;
                    slowestReport = r;
                }
                if (genTime < fastestTime) {
                    fastestTime = genTime;
                    fastestReport = r;
                }
            }

            // Enqueue to complete time
            if (enqueuedAt && completedAt) {
                const enqueueTime = completedAt - enqueuedAt;
                totalEnqueueTime += enqueueTime;
            }

            // Org stats
            const orgId = r.partitionKey || 'unknown';
            if (!orgMap[orgId]) {
                orgMap[orgId] = {
                    count: 0,
                    totalTime: 0,
                    avgTime: 0
                };
            }
            orgMap[orgId].count++;
            if (startedAt && completedAt) {
                orgMap[orgId].totalTime += completedAt - startedAt;
            }
        });

        // Calculate averages
        const avgGenTime = reportList.length > 0 ? totalGenTime / reportList.length : 0;
        const avgEnqueueTime = reportList.length > 0 ? totalEnqueueTime / reportList.length : 0;

        // Calculate org averages
        Object.keys(orgMap).forEach(orgId => {
            if (orgMap[orgId].count > 0) {
                orgMap[orgId].avgTime = orgMap[orgId].totalTime / orgMap[orgId].count;
            }
        });

        setStats({
            totalReports: reportList.length,
            avgGenerationTime: avgGenTime,
            avgEnqueueToComplete: avgEnqueueTime,
            slowestReport: slowestReport,
            fastestReport: fastestReport,
            orgsWithReports: Object.keys(orgMap).length
        });
        setOrgStats(orgMap);
    };

    const formatDuration = (ms) => {
        if (!ms || ms < 0) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString();
    };

    const formatTimestamp = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString();
    };

    const getMlHealth = (diagnostics) => {
        if (!diagnostics) {
            return {
                label: 'Unknown',
                badgeClass: 'bg-secondary text-white',
                message: 'ML diagnostics are not available yet.',
                action: 'Refresh this page to load current ML health.'
            };
        }

        if (!diagnostics.enabled) {
            return {
                label: 'Disabled',
                badgeClass: 'bg-secondary text-white',
                message: 'Time-series ML is currently disabled.',
                action: 'Enable TimeSeriesML in configuration if you want anomaly and forecast guidance.'
            };
        }

        const hasDiagnosticsError = !!diagnostics.diagnosticsError;
        const hasPlatformArtifact = !!diagnostics.platformArtifactPresent;
        const hasOrgArtifacts = (diagnostics.orgArtifactCount || 0) > 0;
        const reliabilityRatio = (diagnostics.orgArtifactCount || 0) > 0
            ? (diagnostics.orgReliableCount || 0) / diagnostics.orgArtifactCount
            : 0;

        let isStale = false;
        if (diagnostics.lastArtifactUpdatedAt) {
            const lastUpdated = new Date(diagnostics.lastArtifactUpdatedAt).getTime();
            const ageMs = Date.now() - lastUpdated;
            isStale = ageMs > (24 * 60 * 60 * 1000);
        }

        if (hasDiagnosticsError || !hasPlatformArtifact || !hasOrgArtifacts || isStale || reliabilityRatio < 0.5) {
            return {
                label: 'Degraded',
                badgeClass: 'bg-warning text-white',
                message: 'ML is running but signal quality or freshness needs attention.',
                action: 'Check cron freshness and model artifact generation in technical details.'
            };
        }

        return {
            label: 'Healthy',
            badgeClass: 'bg-success text-white',
            message: 'ML diagnostics are healthy and producing reliable insights.',
            action: 'No action required. Continue monitoring from this page.'
        };
    };

    const sortReports = (reportsToSort) => {
        const sorted = [...reportsToSort];
        sorted.sort((a, b) => {
            let valueA, valueB;
            
            switch (sortBy) {
                case 'enqueued':
                    valueA = a.enqueuedAt ? new Date(a.enqueuedAt).getTime() : 0;
                    valueB = b.enqueuedAt ? new Date(b.enqueuedAt).getTime() : 0;
                    break;
                case 'started':
                    valueA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
                    valueB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
                    break;
                case 'completed':
                    valueA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
                    valueB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
                    break;
                case 'time':
                    valueA = a.completedAt && a.startedAt ? new Date(a.completedAt) - new Date(a.startedAt) : 0;
                    valueB = b.completedAt && b.startedAt ? new Date(b.completedAt) - new Date(b.startedAt) : 0;
                    break;
                default:
                    return 0;
            }
            
            return sortOrder === 'asc' ? valueA - valueB : valueB - valueA;
        });
        return sorted;
    };

    const toggleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('desc');
        }
    };

    const getUniqueOrgs = () => {
        return [...new Set(reports.map(r => r.partitionKey))].sort();
    };

    return html`
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center mb-3">
                    <div class="col">
                        <h2 class="page-title">AI Reports Analysis</h2>
                        <div class="text-muted mt-1">Monitor and analyze security posture report generation metrics</div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <button class="btn btn-primary" onClick=${loadReports}>
                            <i class="ti ti-refresh me-2"></i>
                            Refresh
                        </button>
                    </div>
                </div>

                <!-- Filters -->
                <div class="row g-2 mb-3">
                    <div class="col-auto">
                        <label class="form-label mb-1">Time Range</label>
                        <select class="form-select" value=${timeRange} onChange=${(e) => setTimeRange(e.target.value)}>
                            <option value="1">Last 24 hours</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <label class="form-label mb-1">Organization</label>
                        <select class="form-select" value=${selectedOrg} onChange=${(e) => setSelectedOrg(e.target.value)}>
                            <option value="">All Organizations</option>
                            ${getUniqueOrgs().map(org => html`<option value=${org}>${org}</option>`)}
                        </select>
                    </div>
                    <div class="col-auto">
                        <label class="form-label mb-1">Start Date</label>
                        <input type="date" class="form-control" value=${startDate} onChange=${(e) => setStartDate(e.target.value)} />
                    </div>
                    ${(selectedOrg || startDate) && html`
                        <div class="col-auto d-flex align-items-end">
                            <button class="btn btn-outline-secondary" onClick=${() => { setSelectedOrg(''); setStartDate(''); }}>
                                <i class="ti ti-x me-1"></i>
                                Clear Filters
                            </button>
                        </div>
                    `}
                </div>
            </div>

            ${error && html`
                <div class="alert alert-danger alert-dismissible" role="alert">
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    <i class="ti ti-alert-triangle me-2"></i>
                    ${error}
                </div>
            `}

            ${loading && html`
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="text-muted mt-2">Loading AI reports data...</p>
                </div>
            `}

            ${!loading && html`
                <div>
                    ${mlDiagnostics && html`
                        ${(() => {
                            const mlHealth = getMlHealth(mlDiagnostics);
                            return html`
                                <div class="card mb-3">
                                    <div class="card-body">
                                        <div class="d-flex align-items-start justify-content-between gap-3">
                                            <div>
                                                <div class="d-flex align-items-center gap-2 mb-1">
                                                    <span class="badge ${mlHealth.badgeClass}">ML ${mlHealth.label}</span>
                                                    <span class="text-muted">Time-Series Diagnostics</span>
                                                </div>
                                                <div class="fw-semibold">${mlHealth.message}</div>
                                                <div class="small text-muted mt-1">Action: ${mlHealth.action}</div>
                                            </div>
                                            <button
                                                type="button"
                                                class="btn btn-outline-secondary btn-sm"
                                                onClick=${() => setShowMlDetails(!showMlDetails)}
                                            >
                                                ${showMlDetails ? 'Hide technical details' : 'View technical details'}
                                            </button>
                                        </div>

                                        ${showMlDetails && html`
                                            <div class="row g-2 mt-3">
                                                <div class="col-md-3">
                                                    <div class="small text-muted">Min points</div>
                                                    <div class="fw-semibold">${mlDiagnostics.minPoints ?? 'N/A'}</div>
                                                </div>
                                                <div class="col-md-3">
                                                    <div class="small text-muted">Min confidence</div>
                                                    <div class="fw-semibold">${Math.round((mlDiagnostics.minConfidence || 0) * 100)}%</div>
                                                </div>
                                                <div class="col-md-3">
                                                    <div class="small text-muted">Org artifacts</div>
                                                    <div class="fw-semibold">${mlDiagnostics.orgArtifactCount || 0} (reliable: ${mlDiagnostics.orgReliableCount || 0})</div>
                                                </div>
                                                <div class="col-md-3">
                                                    <div class="small text-muted">Platform artifact</div>
                                                    <div class="fw-semibold">${mlDiagnostics.platformArtifactPresent ? 'Present' : 'Missing'}</div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="small text-muted">Last artifact update</div>
                                                    <div class="fw-semibold">${formatTimestamp(mlDiagnostics.lastArtifactUpdatedAt)}</div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="small text-muted">Artifact root</div>
                                                    <div class="fw-semibold">${mlDiagnostics.artifactRoot || 'N/A'}</div>
                                                </div>
                                                ${mlDiagnostics.diagnosticsError && html`
                                                    <div class="col-12">
                                                        <div class="alert alert-warning mb-0" role="alert">
                                                            ${mlDiagnostics.diagnosticsError}
                                                        </div>
                                                    </div>
                                                `}
                                            </div>
                                        `}
                                    </div>
                                </div>
                            `;
                        })()}
                    `}

                    <!-- Summary Statistics -->
                    <div class="row row-deck">
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body">
                                    <div class="text-muted text-sm font-weight-medium">Total Reports</div>
                                    <div class="d-flex align-items-baseline">
                                        <div class="h3 mb-0">${stats.totalReports}</div>
                                        <span class="text-muted ms-2">(${stats.orgsWithReports} orgs)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body">
                                    <div class="text-muted text-sm font-weight-medium">Avg Generation Time</div>
                                    <div class="h3 mb-0">${formatDuration(stats.avgGenerationTime)}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body">
                                    <div class="text-muted text-sm font-weight-medium">Avg Enqueue to Complete</div>
                                    <div class="h3 mb-0">${formatDuration(stats.avgEnqueueToComplete)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Performance Breakdown -->
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Fastest Report</h3>
                                </div>
                                <div class="card-body">
                                    ${stats.fastestReport ? html`
                                        <div>
                                            <div class="row">
                                                <div class="col-6">
                                                    <span class="text-muted">Organization:</span>
                                                    <div class="fw-semibold">${stats.fastestReport.partitionKey || 'N/A'}</div>
                                                </div>
                                                <div class="col-6">
                                                    <span class="text-muted">Generation Time:</span>
                                                    <div class="fw-semibold text-success">${formatDuration((new Date(stats.fastestReport.completedAt) - new Date(stats.fastestReport.startedAt)))}</div>
                                                </div>
                                            </div>
                                            <div class="row mt-2">
                                                <div class="col-12">
                                                    <span class="text-muted">Completed:</span>
                                                    <div class="small">${formatDate(stats.fastestReport.completedAt)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ` : html`<span class="text-muted">No data available</span>`}
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Slowest Report</h3>
                                </div>
                                <div class="card-body">
                                    ${stats.slowestReport ? html`
                                        <div>
                                            <div class="row">
                                                <div class="col-6">
                                                    <span class="text-muted">Organization:</span>
                                                    <div class="fw-semibold">${stats.slowestReport.partitionKey || 'N/A'}</div>
                                                </div>
                                                <div class="col-6">
                                                    <span class="text-muted">Generation Time:</span>
                                                    <div class="fw-semibold text-warning">${formatDuration((new Date(stats.slowestReport.completedAt) - new Date(stats.slowestReport.startedAt)))}</div>
                                                </div>
                                            </div>
                                            <div class="row mt-2">
                                                <div class="col-12">
                                                    <span class="text-muted">Completed:</span>
                                                    <div class="small">${formatDate(stats.slowestReport.completedAt)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ` : html`<span class="text-muted">No data available</span>`}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Reports by Organization -->
                    ${Object.keys(orgStats).length > 0 && html`
                        <div class="card mt-3">
                            <div class="card-header">
                                <h3 class="card-title">Generation Time by Organization</h3>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm table-hover">
                                    <thead>
                                        <tr>
                                            <th>Organization</th>
                                            <th>Report Count</th>
                                            <th>Avg Generation Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.entries(orgStats)
                                            .sort((a, b) => b[1].avgTime - a[1].avgTime)
                                            .map(([orgId, stats]) => html`
                                                <tr>
                                                    <td class="fw-semibold">${orgId}</td>
                                                    <td>${stats.count}</td>
                                                    <td>${formatDuration(stats.avgTime)}</td>
                                                </tr>
                                            `)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `}

                    <!-- Recent Reports -->
                    <div class="card mt-3">
                        <div class="card-header">
                            <h3 class="card-title">Recent Reports (${reports.length} total)</h3>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-hover">
                                <thead>
                                    <tr>
                                        <th>Organization</th>
                                        <th style="cursor: pointer;" onClick=${() => toggleSort('enqueued')}>
                                            Enqueued
                                            ${sortBy === 'enqueued' && html`<i class="ti ${sortOrder === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} ms-1"></i>`}
                                        </th>
                                        <th style="cursor: pointer;" onClick=${() => toggleSort('started')}>
                                            Started
                                            ${sortBy === 'started' && html`<i class="ti ${sortOrder === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} ms-1"></i>`}
                                        </th>
                                        <th style="cursor: pointer;" onClick=${() => toggleSort('completed')}>
                                            Completed
                                            ${sortBy === 'completed' && html`<i class="ti ${sortOrder === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} ms-1"></i>`}
                                        </th>
                                        <th style="cursor: pointer;" onClick=${() => toggleSort('time')}>
                                            Gen Time
                                            ${sortBy === 'time' && html`<i class="ti ${sortOrder === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} ms-1"></i>`}
                                        </th>
                                        <th>Total Time</th>
                                        <th>Trigger</th>
                                        <th>Performed By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${reports.length > 0 ? sortReports(reports)
                                        .slice(0, 20)
                                        .map(r => {
                                            const genTime = r.startedAt && r.completedAt ? new Date(r.completedAt) - new Date(r.startedAt) : 0;
                                            const totalTime = r.enqueuedAt && r.completedAt ? new Date(r.completedAt) - new Date(r.enqueuedAt) : 0;
                                            const triggerSource = r.triggerSource || 'System';
                                            const performedBy = r.performedBy || 'system';
                                            const triggerBadge = triggerSource === 'User' ? 'bg-info-lt' : 'bg-secondary-lt';
                                            return html`
                                                <tr>
                                                    <td class="fw-semibold">${r.partitionKey || 'unknown'}</td>
                                                    <td class="text-muted small">${formatDate(r.enqueuedAt)}</td>
                                                    <td class="text-muted small">${formatDate(r.startedAt)}</td>
                                                    <td class="text-muted small">${formatDate(r.completedAt)}</td>
                                                    <td>${formatDuration(genTime)}</td>
                                                    <td>${formatDuration(totalTime)}</td>
                                                    <td><span class="badge ${triggerBadge}">${triggerSource}</span></td>
                                                    <td class="text-muted small">${performedBy}</td>
                                                </tr>
                                            `;
                                        })
                                    : html`
                                        <tr>
                                            <td colspan="9" class="text-center text-muted py-4">No reports found for selected time range</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
