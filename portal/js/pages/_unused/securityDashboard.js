import { auth } from '@auth';
import { api } from '@api';
import { config } from '@config';
import { orgContext } from '@orgContext';
import { ChartRenderer } from '@components/ChartRenderer.js';

const { html, Component } = window;

/**
 * Security Posture Report - Cached daily/hourly security assessment with smart refresh
 */
export class SecurityDashboardPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            report: null,
            reportId: null,
            generatedAt: null,
            nextRefreshAt: null,
            canRefreshNow: false,
            refreshing: false,
            selectedDate: this.formatDate(new Date()),
            showGenerateButton: false
        };
    }

    componentDidMount() {
        this.loadDashboard();
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    async loadDashboard(date = null) {
        const targetDate = date || this.state.selectedDate;
        const currentOrg = orgContext.getCurrentOrg();
        
        if (!currentOrg) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            const data = await api.getAIReportByDate(currentOrg.orgId, targetDate);
            if (data?.success === false) {
                throw new Error(data.message || data.error || 'Failed to load dashboard');
            }

            // Normalize fields from GetSecurityReport
            const report = data.report || data.Report || null;
            const generatedAt = data.completedAt || data.GeneratedAt || null;
            const nextRefreshAt = null;
            const canRefreshNow = true;

            this.setState({
                loading: false,
                report,
                reportId: data.reportId || null,
                generatedAt: generatedAt ? new Date(generatedAt) : null,
                nextRefreshAt: nextRefreshAt ? new Date(nextRefreshAt) : null,
                canRefreshNow,
                selectedDate: targetDate,
                showGenerateButton: false
            });
        } catch (err) {
            // If not found, offer to generate a fresh report
            this.setState({ 
                error: err.message || 'Failed to load dashboard', 
                loading: false, 
                showGenerateButton: true 
            });
        }
    }

    async refreshDashboard() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg) return;

        this.setState({ refreshing: true, error: null });

        try {
            // Trigger new dashboard generation via unified AI report endpoint
            const resp = await api.generateAIReport(currentOrg.orgId, { model: 'heuristic' });
            if (resp?.success === false) {
                throw new Error(resp.message || resp.error || 'Failed to refresh dashboard');
            }

            // If completed inline, reload
            const generatedDate = resp.generatedDate || this.formatDate(new Date());
            const report = resp.report || null;
            if (report) {
                this.setState({
                    refreshing: false,
                    report,
                    reportId: resp.reportId || null,
                    generatedAt: new Date(),
                    canRefreshNow: false
                });
                return;
            }

            // Fetch freshly generated report by date
            const latest = await api.getAIReportByDate(currentOrg.orgId, generatedDate);
            if (latest?.success === false) {
                throw new Error(latest.message || latest.error || 'Report generation failed');
            }
            this.setState({
                refreshing: false,
                report: latest.report || null,
                reportId: latest.reportId || null,
                generatedAt: latest.completedAt ? new Date(latest.completedAt) : new Date(),
                canRefreshNow: false
            });
        } catch (err) {
            this.setState({ 
                error: err.message || 'Failed to refresh dashboard', 
                refreshing: false 
            });
        }
    }

    async pollForCompletion(reportId) {
        const token = auth.getToken();
        const maxAttempts = 30;
        let attempts = 0;

        const poll = async () => {
            if (attempts >= maxAttempts) {
                this.setState({ 
                    error: 'Dashboard generation timed out. Please try again later.', 
                    refreshing: false 
                });
                return;
            }

            attempts++;

            try {
                // Re-fetch report by selected date to check freshness
                const data = await api.getAIReportByDate(orgContext.getCurrentOrg().orgId, this.state.selectedDate);
                if (data?.success !== false && (data?.report || data?.Report)) {
                    this.setState({
                        refreshing: false
                    });
                    // Reload the dashboard to get the newly generated report
                    await this.loadDashboard();
                    return;
                }

                // Still processing, poll again
                setTimeout(poll, 5000);
            } catch (err) {
                this.setState({ 
                    error: err.message || 'Failed to poll report status', 
                    refreshing: false 
                });
            }
        };

        poll();
    }

    formatDateDisplay(yyyymmdd) {
        const year = yyyymmdd.substring(0, 4);
        const month = yyyymmdd.substring(4, 6);
        const day = yyyymmdd.substring(6, 8);
        return `${year}-${month}-${day}`;
    }

    handleDateChange = (e) => {
        const dateValue = e.target.value; // YYYY-MM-DD from input
        const yyyymmdd = dateValue.replace(/-/g, '');
        this.loadDashboard(yyyymmdd);
    }

    handleLogout = () => {
        auth.logout();
        window.page('/');
    }

    render({ }, { loading, error, report, generatedAt, nextRefreshAt, canRefreshNow, refreshing, selectedDate, showGenerateButton }) {
        const currentOrg = orgContext.getCurrentOrg();
        const user = auth.getUser();
        const displayDate = selectedDate ? `${selectedDate.substring(0, 4)}-${selectedDate.substring(4, 6)}-${selectedDate.substring(6, 8)}` : '';

        return html`
            <div class="page-header d-print-none mb-3">
                <div class="container-xl">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="19" x2="20" y2="19" /><polyline points="4 15 8 9 12 11 16 6 20 10" /></svg>
                                Security Posture Report
                            </h2>
                            <div class="page-subtitle">
                                <span class="text-muted">${currentOrg ? currentOrg.name || currentOrg.orgId : 'No organization selected'}</span>
                            </div>
                            </div>
                        </div>
                        <div class="col-auto ms-auto d-print-none">
                            <div class="btn-list">
                                <input 
                                    type="date" 
                                    class="form-control d-inline-block w-auto" 
                                    value="${displayDate}"
                                    max="${this.formatDate(new Date()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}"
                                    onChange=${this.handleDateChange}
                                />
                                <button 
                                    class="btn btn-primary" 
                                    onClick=${() => this.refreshDashboard()}
                                    disabled=${!canRefreshNow || refreshing || loading}
                                    title="${canRefreshNow ? 'Refresh security report with latest data' : 'Refresh temporarily disabled to conserve AI resources'}"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-refresh" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path>
                                    </svg>
                                    ${refreshing ? 'Refreshing...' : canRefreshNow ? 'Refresh Report' : 'Refresh Disabled'}
                                </button>
                            </div>
                            ${!canRefreshNow && nextRefreshAt && html`
                                <div class="text-secondary mt-2">
                                    <small>Next refresh available: ${nextRefreshAt.toLocaleTimeString()}</small>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                ${!loading && !report && !error && showGenerateButton && html`
                    <div class="alert alert-info" role="alert">
                        <div class="d-flex">
                            <div>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <circle cx="12" cy="12" r="9"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>
                            <div class="flex-fill">
                                <h4 class="alert-title">No Security Report Available</h4>
                                <div class="text-secondary mb-3">
                                    No security posture report has been generated for ${this.formatDateDisplay(selectedDate)} yet.
                                </div>
                                <button 
                                    class="btn btn-primary"
                                    onClick=${() => this.refreshDashboard()}
                                    disabled=${refreshing}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    ${refreshing ? 'Generating Report...' : 'Generate Security Report'}
                                </button>
                            </div>
                        </div>
                    </div>
                `}

                ${error && html`
                    <div class="alert alert-warning" role="alert">
                        <div class="d-flex">
                            <div>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M12 9v4"></path>
                                    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"></path>
                                    <path d="M12 16h.01"></path>
                                </svg>
                            </div>
                            <div>
                                <h4 class="alert-title">Notice</h4>
                                <div class="text-secondary">${error}</div>
                            </div>
                        </div>
                    </div>
                `}

                ${loading && html`
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <div class="text-secondary mt-3">Loading dashboard...</div>
                    </div>
                `}

                ${!loading && !error && report && html`
                    <div class="row row-deck row-cards">
                        ${generatedAt && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-secondary">
                                            <small>Generated: ${generatedAt.toLocaleString()}</small>
                                            ${reportId && html` | <small>Report ID: <code>${reportId}</code></small>`}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.ExecutiveSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Executive Summary</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report.ExecutiveSummary) }}></div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.RiskSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Risk Summary</h3>
                                    </div>
                                    <div class="card-body">
                                        ${report.RiskSummary.MitigatedThreats && html`
                                            <div class="alert alert-info mb-3">
                                                <div class="fw-semibold">Mitigated vulnerabilities (resolved apps)</div>
                                                <div class="small text-muted">Last 30 days</div>
                                                <div class="d-flex gap-2 flex-wrap mt-2">
                                                    <span class="badge bg-azure-lt text-azure">Total mitigated: ${report.RiskSummary.MitigatedThreats.Total ?? 0}</span>
                                                    <span class="badge bg-azure-lt text-azure">Critical: ${report.RiskSummary.MitigatedThreats.Critical ?? 0}</span>
                                                    <span class="badge bg-azure-lt text-azure">High: ${report.RiskSummary.MitigatedThreats.High ?? 0}</span>
                                                    <span class="badge bg-azure-lt text-azure">Medium: ${report.RiskSummary.MitigatedThreats.Medium ?? 0}</span>
                                                    <span class="badge bg-azure-lt text-azure">Low: ${report.RiskSummary.MitigatedThreats.Low ?? 0}</span>
                                                </div>
                                            </div>
                                        `}
                                        <div class="row">
                                            ${report.RiskSummary.OverallRiskScore && html`
                                                <div class="col-md-4">
                                                    <div class="text-center">
                                                        <h4 class="mb-0">${report.RiskSummary.OverallRiskScore.toFixed(1)}/100</h4>
                                                        <small class="text-muted">Overall Risk Score</small>
                                                    </div>
                                                </div>
                                            `}
                                            ${report.RiskSummary.RiskLevel && html`
                                                <div class="col-md-4">
                                                    <div class="text-center">
                                                        <span class="badge bg-${report.RiskSummary.RiskLevel === 'Critical' ? 'danger' : report.RiskSummary.RiskLevel === 'High' ? 'warning' : report.RiskSummary.RiskLevel === 'Medium' ? 'info' : 'success'}">
                                                            ${report.RiskSummary.RiskLevel}
                                                        </span>
                                                        <div><small class="text-muted">Risk Level</small></div>
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                        ${report.RiskSummary.TopRiskFactors?.length > 0 && html`
                                            <hr class="my-3" />
                                            <h5>Top Risk Factors</h5>
                                            <ul class="list-unstyled">
                                                ${report.RiskSummary.TopRiskFactors.slice(0, 5).map((factor, idx) => html`
                                                    <li key=${idx} class="mb-2">
                                                        <span class="badge bg-danger me-2">${idx + 1}</span>
                                                        <strong>${factor.Category || factor.Description}</strong>
                                                        ${factor.ImpactScore && html`<span class="text-muted ms-2">(Impact: ${factor.ImpactScore})</span>`}
                                                    </li>
                                                `)}
                                            </ul>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.Recommendations?.length > 0 && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Recommendations</h3>
                                    </div>
                                    <div class="list-group list-group-flush">
                                        ${report.recommendations.map((rec, idx) => html`
                                            <div class="list-group-item">
                                                <div class="row align-items-center">
                                                    <div class="col-auto">
                                                        <span class="badge bg-primary">${idx + 1}</span>
                                                    </div>
                                                    <div class="col">
                                                        <strong>${rec.title || rec.recommendation}</strong>
                                                        ${rec.description && html`<div class="text-secondary small mt-1">${rec.description}</div>`}
                                                    </div>
                                                    ${rec.priority && html`
                                                        <div class="col-auto">
                                                            <span class="badge bg-${rec.priority === 'High' ? 'danger' : rec.priority === 'Medium' ? 'warning' : 'info'}">
                                                                ${rec.priority}
                                                            </span>
                                                        </div>
                                                    `}
                                                </div>
                                            </div>
                                        `)}
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.Charts?.length > 0 && html`
                            <${ChartRenderer} charts=${report.Charts} />
                        `}
                    </div>
                `}
        `;
    }

    renderMarkdown(text) {
        if (!text) return '';
        
        if (!window.marked || !window.DOMPurify) {
            logger.error('[SecurityDashboard] DOMPurify or marked.js not loaded - cannot render markdown safely');
            return ''; // Return empty instead of unsafe fallback
        }
        
        try {
            const rawHtml = window.marked.parse(text);
            return window.DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote'],
                ALLOWED_ATTR: ['href', 'title'],
                ALLOW_DATA_ATTR: false
            });
        } catch (err) {
            logger.error('[SecurityDashboard] Markdown parsing failed:', err);
            return '';
        }
    }
}
