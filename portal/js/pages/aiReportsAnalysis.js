import { api } from '../api.js';
import { logger } from '../config.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

/**
 * AI Reports Analysis - Monitor and analyze report generation metrics
 */
export function AiReportsAnalysisPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState({
        totalReports: 0,
        avgGenerationTime: 0,
        avgEnqueueToComplete: 0,
        slowestReport: null,
        fastestReport: null,
        orgsWithReports: 0
    });
    const [timeRange, setTimeRange] = useState('7'); // days
    const [selectedOrg, setSelectedOrg] = useState('');
    const [orgStats, setOrgStats] = useState({});

    useEffect(() => {
        loadReports();
    }, [timeRange]);

    const loadReports = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get('/api/v1/admin/ai/reports');
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to load AI reports');
            }

            if (!data.data || !Array.isArray(data.data)) {
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
            
            const filteredReports = data.data.filter(r => {
                const completedAt = r.completedAt ? new Date(r.completedAt) : null;
                return completedAt && completedAt >= daysAgo;
            });

            setReports(filteredReports);
            calculateStats(filteredReports);
        } catch (err) {
            logger.error('[AiReportsAnalysis] Error loading reports:', err);
            setError(err.message || 'Failed to load AI reports');
            setReports([]);
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

    return html`
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">AI Reports Analysis</h2>
                        <div class="text-muted mt-1">Monitor and analyze security posture report generation metrics</div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <select class="form-select d-inline-block w-auto me-2" value=${timeRange} onChange=${(e) => setTimeRange(e.target.value)}>
                            <option value="1">Last 24 hours</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                        </select>
                        <button class="btn btn-primary" onClick=${loadReports}>
                            <i class="ti ti-refresh me-2"></i>
                            Refresh
                        </button>
                    </div>
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
                            <h3 class="card-title">Recent Reports</h3>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-hover">
                                <thead>
                                    <tr>
                                        <th>Organization</th>
                                        <th>Enqueued</th>
                                        <th>Started</th>
                                        <th>Completed</th>
                                        <th>Gen Time</th>
                                        <th>Total Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${reports.length > 0 ? reports
                                        .slice()
                                        .reverse()
                                        .slice(0, 20)
                                        .map(r => {
                                            const genTime = r.startedAt && r.completedAt ? new Date(r.completedAt) - new Date(r.startedAt) : 0;
                                            const totalTime = r.enqueuedAt && r.completedAt ? new Date(r.completedAt) - new Date(r.enqueuedAt) : 0;
                                            return html`
                                                <tr>
                                                    <td class="fw-semibold">${r.partitionKey || 'unknown'}</td>
                                                    <td class="text-muted small">${formatDate(r.enqueuedAt)}</td>
                                                    <td class="text-muted small">${formatDate(r.startedAt)}</td>
                                                    <td class="text-muted small">${formatDate(r.completedAt)}</td>
                                                    <td>${formatDuration(genTime)}</td>
                                                    <td>${formatDuration(totalTime)}</td>
                                                </tr>
                                            `;
                                        })
                                    : html`
                                        <tr>
                                            <td colspan="6" class="text-center text-muted py-4">No reports found for selected time range</td>
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
