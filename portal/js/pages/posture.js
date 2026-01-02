import { auth } from '../auth.js';
import { api } from '../api.js';
import { config, logger } from '../config.js';
import { orgContext } from '../orgContext.js';
import { ChartRenderer } from '../components/ChartRenderer.js';

const { html, Component } = window;

/**
 * Security Posture Report - Cached daily/hourly security assessment with smart refresh
 */
export class PosturePage extends Component {
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

    async loadDashboard(targetDate = null) {
        const date = targetDate || this.state.selectedDate;
        const currentOrg = orgContext.getCurrentOrg();
        
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        // Ensure we use the orgId property, not email or name
        const orgId = currentOrg.orgId;
        logger.debug('[Posture] Loading dashboard for org:', orgId, 'date:', date);

        this.setState({ loading: true, error: null });

        try {
            // Use the new AI endpoint
            const data = await api.get(`/api/v1/orgs/${orgId}/ai/reports/${date}`);

            // Handle 404 - no report exists for this date
            if (!data || data.error === 'NOT_FOUND' || data.error?.includes('No dashboard report found') || data.success === false) {
                // Auto-generate report if none exists for today
                const isToday = date === new Date().toISOString().slice(0,10).replace(/-/g,'');
                if (isToday) {
                    logger.info(`[Posture] No report found for today, auto-generating...`);
                    await this.generateDashboard();
                    return;
                }
                
                // For historical dates, show generate button
                this.setState({
                    loading: false,
                    error: null,
                    report: null,
                    reportId: null,
                    selectedDate: date,
                    showGenerateButton: true,
                    canRefreshNow: true,
                    refreshing: false
                });
                logger.info(`[Posture] No report found for ${date}, showing generate button`);
                return;
            }

            if (!data.success) {
                throw new Error(data.message || data.error || 'Failed to load dashboard');
            }

            this.setState({
                loading: false,
                report: data.report,
                reportId: `REPORT-${date}`,
                generatedAt: data.generatedAt ? new Date(data.generatedAt) : null,
                nextRefreshAt: null, // Not supported in new endpoint yet
                canRefreshNow: true,
                selectedDate: date,
                showGenerateButton: false
            });
        } catch (err) {
            // Check for 404 status code directly
            if (err.status === 404) {
                // Show generate button for missing reports
                this.setState({
                    loading: false,
                    error: null,
                    report: null,
                    reportId: null,
                    selectedDate: date,
                    showGenerateButton: true,
                    canRefreshNow: true,
                    refreshing: false
                });
                logger.info(`[Posture] No report found for ${date}, showing generate button`);
                return;
            }
            
            let errorMsg = err.message || 'Failed to load dashboard';
            if (err.status === 403 || err.message?.includes('403') || err.message?.includes('FORBIDDEN')) {
                errorMsg += ' - Please switch to the correct organization using the navbar dropdown.';
            }
            logger.error('[Posture] Load failed:', err);
            this.setState({ 
                error: errorMsg, 
                loading: false,
                showGenerateButton: false
            });
        }
    }

    async generateDashboard() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg) return;

        const selectedModel = this.state.selectedModel || 'heuristic';
        const user = auth.getUser();
        
        // Check if report already exists for today (skip if not forcing regeneration)
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        if (this.state.selectedDate === today && this.state.report && user?.userType !== 'SiteAdmin') {
            logger.info('[Posture] Report already exists for today, skipping generation');
            return;
        }

        this.setState({ refreshing: true, error: null, showGenerateButton: false });

        try {
            // Trigger new dashboard generation via the new AI endpoint
            const payload = user?.userType === 'SiteAdmin' && selectedModel !== 'heuristic' 
                ? { model: selectedModel } 
                : {};
                
            const data = await api.post(`/api/v1/orgs/${currentOrg.orgId}/ai/reports/generate`, payload);

            if (!data.success) {
                throw new Error(data.message || data.error || 'Failed to refresh dashboard');
            }

            // The new endpoint returns the report content directly with the date it was stored
            if (data.report) {
                const generatedDate = data.generatedDate || new Date().toISOString().slice(0,10).replace(/-/g,'');
                const reportId = data.reportId || `REPORT-${generatedDate}`;
                
                this.setState({
                    refreshing: false,
                    report: data.report,
                    reportId: reportId,
                    generatedAt: new Date(),
                    canRefreshNow: false,
                    showGenerateButton: false,
                    selectedDate: generatedDate
                });
                logger.info(`[Posture] Report generated with model ${selectedModel}: ${reportId}`);
                return;
            }

            // Fallback for async behavior (if implemented later)
            if (data.reportId) {
                await this.pollForCompletion(data.reportId);
            }
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
                const response = await fetch(
                    `${config.API_BASE}/api/v1/analyst/reports/${reportId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );

                const data = await response.json();

                if (!data.Success) {
                    throw new Error(data.Message || 'Failed to check report status');
                }

                if (data.Status?.State === 'Completed') {
                    this.setState({
                        refreshing: false
                    });
                    // Reload the dashboard to get the newly generated report
                    await this.loadDashboard();
                    return;
                }

                if (data.Status?.State === 'Failed') {
                    throw new Error(data.Status.Error || 'Report generation failed');
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

    render({ }, { loading, error, report, reportId, generatedAt, nextRefreshAt, canRefreshNow, refreshing, showGenerateButton, selectedDate }) {
        const currentOrg = orgContext.getCurrentOrg();
        const user = auth.getUser();
        const displayDate = selectedDate ? `${selectedDate.substring(0, 4)}-${selectedDate.substring(4, 6)}-${selectedDate.substring(6, 8)}` : '';

        return html`
            <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Security Posture Report</h2>
                            <div class="text-secondary mt-1">
                                ${currentOrg ? currentOrg.name || currentOrg.orgId : 'No organization selected'}
                            </div>
                        </div>
                        <div class="col-auto ms-auto d-print-none">
                            <div class="btn-list">
                                ${user?.userType === 'SiteAdmin' && html`
                                    <select 
                                        class="form-select d-inline-block w-auto me-2" 
                                        value=${this.state.selectedModel || 'heuristic'}
                                        onChange=${(e) => this.setState({ selectedModel: e.target.value })}
                                        title="AI Model Selection (SiteAdmin only)"
                                    >
                                        <option value="heuristic">Heuristic (Fast)</option>
                                        <option value="mistral-7b-instruct">Mistral-7B-Instruct-GGUF</option>
                                        <option value="tinyllama-1.1b">TinyLlama-1.1B</option>
                                        <option value="qwen2.5-0.5b">Qwen2.5-0.5B-Instruct</option>
                                        <option value="phi3-mini">Phi-3-Mini-4K-Instruct</option>
                                        <option value="llama-3.1-8b">Meta-Llama-3.1-8B-Instruct-GPTQ-INT4</option>
                                    </select>
                                `}
                                <input 
                                    type="date" 
                                    class="form-control d-inline-block w-auto" 
                                    value="${displayDate}"
                                    max="${this.formatDate(new Date()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}"
                                    onChange=${this.handleDateChange}
                                />
                                <button 
                                    class="btn btn-outline-primary me-2" 
                                    onClick=${() => this.loadDashboard(selectedDate)}
                                    disabled=${loading}
                                    title="Reload the report from the server"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-refresh" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path>
                                    </svg>
                                    ${loading ? 'Loading...' : 'Reload Report'}
                                </button>
                                <button 
                                    class="btn btn-primary" 
                                    onClick=${() => this.generateDashboard()}
                                    disabled=${refreshing}
                                    title="Generate a fresh security dashboard with latest data (may take 30-60 seconds)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-refresh" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path>
                                    </svg>
                                    ${refreshing ? 'Generating...' : 'Generate New Report'}
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
                                <h4 class="alert-title">📊 Premium Security Posture Report</h4>
                                <div class="text-secondary mb-3">
                                    Generate your comprehensive security assessment for ${this.formatDateDisplay(selectedDate)} with detailed vulnerability analysis, compliance metrics, and actionable recommendations.
                                </div>
                                <button 
                                    class="btn btn-primary"
                                    onClick=${() => this.generateDashboard()}
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

                ${refreshing && !loading && html`
                    <div class="alert alert-info" role="alert">
                        <div class="d-flex align-items-center">
                            <div class="spinner-border spinner-border-sm text-primary me-3" role="status">
                                <span class="visually-hidden">Generating...</span>
                            </div>
                            <div>
                                <h4 class="alert-title mb-0">Generating Security Dashboard</h4>
                                <div class="text-secondary">This may take 30-60 seconds. The page will automatically refresh when complete.</div>
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
                                    <div class="card-body d-flex justify-content-between align-items-center">
                                        <div class="text-secondary">
                                            <small>📅 Generated: ${generatedAt.toLocaleString()}</small>
                                            ${reportId && html` | <small>📋 Report ID: <code>${reportId}</code></small>`}
                                        </div>
                                        <div class="btn-group" role="group">
                                            <button class="btn btn-sm btn-outline-primary" title="Print or save as PDF" onClick=${() => window.print()}>
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"/><rect x="6" y="9" width="12" height="9" rx="2" ry="2"/></svg>
                                                Print
                                            </button>
                                            <button class="btn btn-sm btn-outline-primary" title="Download as HTML file" onClick=${() => this.downloadReportHTML(report)}>
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="15" /></svg>
                                                Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${typeof report === 'string' && html`
                            <div class="col-12">
                                <div class="card report-card">
                                    <div class="card-body markdown report-content">
                                        <div dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report) }}></div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${typeof report === 'object' && report.ExecutiveSummary && html`
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
                                        <div class="row g-3 mb-4">
                                            ${report.RiskSummary.OverallRiskScore !== undefined && html`
                                                <div class="col-md-3">
                                                    <div class="card bg-light">
                                                        <div class="card-body text-center">
                                                            <h2 class="mb-0 text-${report.RiskSummary.OverallRiskScore >= 80 ? 'danger' : report.RiskSummary.OverallRiskScore >= 50 ? 'warning' : 'success'}">
                                                                ${report.RiskSummary.OverallRiskScore.toFixed(1)}
                                                            </h2>
                                                            <small class="text-muted">Risk Score / 100</small>
                                                            <div class="progress mt-2" style="height: 8px;">
                                                                <div class="progress-bar bg-${report.RiskSummary.OverallRiskScore >= 80 ? 'danger' : report.RiskSummary.OverallRiskScore >= 50 ? 'warning' : 'success'}" 
                                                                    style="width: ${report.RiskSummary.OverallRiskScore}%"></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `}
                                            ${report.RiskSummary.RiskLevel && html`
                                                <div class="col-md-3">
                                                    <div class="card bg-light">
                                                        <div class="card-body text-center">
                                                            <span class="badge bg-${report.RiskSummary.RiskLevel === 'Critical' ? 'danger' : report.RiskSummary.RiskLevel === 'High' ? 'warning' : report.RiskSummary.RiskLevel === 'Medium' ? 'info' : 'success'} mb-2" style="font-size: 1rem;">
                                                                ${report.RiskSummary.RiskLevel}
                                                            </span>
                                                            <div><small class="text-muted">Risk Level</small></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `}
                                            ${report.RiskSummary.DevicesScored !== undefined && html`
                                                <div class="col-md-3">
                                                    <div class="card bg-light">
                                                        <div class="card-body text-center">
                                                            <h2 class="mb-0">${report.RiskSummary.DevicesScored || 0}</h2>
                                                            <small class="text-muted">Devices Analyzed</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            `}
                                            ${report.RiskSummary.HighRiskDeviceCount !== undefined && html`
                                                <div class="col-md-3">
                                                    <div class="card bg-light">
                                                        <div class="card-body text-center">
                                                            <h2 class="mb-0 text-danger">${report.RiskSummary.HighRiskDeviceCount || 0}</h2>
                                                            <small class="text-muted">High-Risk Devices</small>
                                                        </div>
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

                        ${report.DeviceBreakdown && (report.DeviceBreakdown.HighRiskDevices?.length > 0 || report.DeviceBreakdown.MediumRiskDevices?.length > 0) && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Device Risk Breakdown</h3>
                                    </div>
                                    <div class="card-body">
                                        ${report.DeviceBreakdown.HighRiskDevices?.length > 0 && html`
                                            <h5 class="text-danger">High Risk Devices (${report.DeviceBreakdown.HighRiskDevices.length})</h5>
                                            <div class="list-group list-group-flush mb-4">
                                                ${report.DeviceBreakdown.HighRiskDevices.map(device => html`
                                                    <div class="list-group-item">
                                                        <div class="row align-items-start">
                                                            <div class="col-md-3">
                                                                <strong>${device.Name || device.Hostname || 'Unknown Device'}</strong>
                                                                <div class="text-secondary small">
                                                                    ${device.RiskScore !== undefined && html`Risk Score: <strong>${device.RiskScore.toFixed(1)}</strong>`}
                                                                </div>
                                                            </div>
                                                            <div class="col-md-9">
                                                                ${device.TopVulnerabilities?.length > 0 && html`
                                                                    <div class="mb-2"><strong>Top Vulnerabilities:</strong></div>
                                                                    <ul class="mb-0">
                                                                        ${device.TopVulnerabilities.slice(0, 5).map(vuln => html`
                                                                            <li class="small">
                                                                                <strong>${vuln.CVE || vuln.Id}</strong> 
                                                                                ${vuln.Product && html`- ${vuln.Product}`}
                                                                                ${vuln.BaseScore && html`<span class="badge bg-danger ms-2">${vuln.BaseScore}</span>`}
                                                                            </li>
                                                                        `)}
                                                                    </ul>
                                                                `}
                                                                ${device.CriticalFindings?.length > 0 && html`
                                                                    <div class="mt-2 mb-2"><strong>Critical Findings:</strong></div>
                                                                    <ul class="mb-0">
                                                                        ${device.CriticalFindings.map(finding => html`
                                                                            <li class="small text-danger">${finding}</li>
                                                                        `)}
                                                                    </ul>
                                                                `}
                                                            </div>
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                        `}
                                        ${report.DeviceBreakdown.MediumRiskDevices?.length > 0 && html`
                                            <h5 class="text-warning">Medium Risk Devices (${report.DeviceBreakdown.MediumRiskDevices.length})</h5>
                                            <div class="list-group list-group-flush">
                                                ${report.DeviceBreakdown.MediumRiskDevices.map(device => html`
                                                    <div class="list-group-item">
                                                        <div class="row align-items-start">
                                                            <div class="col-md-3">
                                                                <strong>${device.Name || device.Hostname || 'Unknown Device'}</strong>
                                                                <div class="text-secondary small">
                                                                    ${device.RiskScore !== undefined && html`Risk Score: <strong>${device.RiskScore.toFixed(1)}</strong>`}
                                                                </div>
                                                            </div>
                                                            <div class="col-md-9">
                                                                ${device.TopVulnerabilities?.length > 0 && html`
                                                                    <div class="mb-2"><strong>Top Vulnerabilities:</strong></div>
                                                                    <ul class="mb-0">
                                                                        ${device.TopVulnerabilities.slice(0, 3).map(vuln => html`
                                                                            <li class="small">
                                                                                <strong>${vuln.CVE || vuln.Id}</strong>
                                                                                ${vuln.Product && html`- ${vuln.Product}`}
                                                                                ${vuln.BaseScore && html`<span class="badge bg-warning ms-2">${vuln.BaseScore}</span>`}
                                                                            </li>
                                                                        `)}
                                                                    </ul>
                                                                `}
                                                            </div>
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.Recommendations?.length > 0 && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Priority Recommendations</h3>
                                    </div>
                                    <div class="list-group list-group-flush">
                                        ${report.Recommendations.map((rec, idx) => {
                                            // Handle both string recommendations and object recommendations
                                            const isString = typeof rec === 'string';
                                            const title = isString ? rec : (rec.Title || rec.title || rec.Recommendation || rec.recommendation);
                                            const description = isString ? '' : (rec.Description || rec.description || '');
                                            const reason = isString ? '' : (rec.Reason || rec.reason || '');
                                            const affectedDevices = isString ? '' : (rec.AffectedDevices || rec.affectedDevices || '');
                                            const priority = isString ? '' : (rec.Priority || rec.priority || '');
                                            
                                            return html`
                                            <div class="list-group-item" key=${idx}>
                                                <div class="row align-items-start">
                                                    <div class="col-auto">
                                                        <span class="badge bg-primary">${idx + 1}</span>
                                                    </div>
                                                    <div class="col">
                                                        <div class="d-flex justify-content-between align-items-start">
                                                            <div class="flex-fill">
                                                                <strong>${title || `Recommendation ${idx + 1}`}</strong>
                                                                ${description && html`
                                                                    <div class="text-secondary small mt-1">${description}</div>
                                                                `}
                                                                ${reason && html`
                                                                    <div class="text-muted small mt-1"><em>${reason}</em></div>
                                                                `}
                                                                ${affectedDevices && html`
                                                                    <div class="text-danger small mt-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                                                        Affects: ${affectedDevices}
                                                                    </div>
                                                                `}
                                                            </div>
                                                            ${priority && html`
                                                                <span class="badge bg-${priority === 'High' || priority === 'Critical' ? 'danger' : priority === 'Medium' ? 'warning' : 'info'} ms-3">
                                                                    ${priority}
                                                                </span>
                                                            `}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            `;
                                        })}
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.Charts?.length > 0 && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Security Visualizations</h3>
                                    </div>
                                    <div class="card-body">
                                        <${ChartRenderer} charts=${report.Charts} />
                                    </div>
                                </div>
                            </div>
                        `}
                        
                        ${(!report.Charts || report.Charts.length === 0) && report.RiskSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Vulnerability Distribution</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="alert alert-info">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <circle cx="12" cy="12" r="9"></circle>
                                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                            </svg>
                                            Visual charts will appear here when vulnerability data is available. Generate a new report to see detailed visualizations.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `}
                    </div>
                `}
        `;
    }

    renderMarkdown(text) {
        if (!text) return '';
        
        if (!window.marked || !window.DOMPurify) {
            logger.error('[PosturePage] DOMPurify or marked.js not loaded - cannot render markdown safely');
            return ''; // Return empty instead of unsafe fallback
        }
        
        try {
            const rawHtml = window.marked.parse(text);
            const sanitized = window.DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'div', 'svg', 'g', 'path', 'circle', 'rect', 'line', 'text', 'polyline', 'polygon'],
                ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'class', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'fill', 'stroke', 'stroke-width', 'viewBox', 'data-id'],
                ALLOW_DATA_ATTR: false
            });
            
            // Handle Mermaid diagram blocks
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sanitized;
            
            // Find all mermaid code blocks and mark them for rendering
            tempDiv.querySelectorAll('code.language-mermaid').forEach(block => {
                const pre = block.parentElement;
                if (pre && pre.tagName === 'PRE') {
                    const div = document.createElement('div');
                    div.className = 'mermaid';
                    div.textContent = block.textContent;
                    pre.replaceWith(div);
                }
            });
            
            return tempDiv.innerHTML;
        } catch (err) {
            logger.error('[PosturePage] Markdown parsing failed:', err);
            return '';
        }
    }

    downloadReportHTML(report) {
        const currentOrg = orgContext.getCurrentOrg();
        const now = new Date();
        const filename = `${currentOrg?.name || 'Security'}-Report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.html`;
        
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Posture Report - ${currentOrg?.name || 'Organization'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: white;
            padding: 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .header {
            border-bottom: 3px solid #0066cc;
            margin-bottom: 30px;
            padding-bottom: 20px;
        }
        h1, h2, h3, h4, h5, h6 { 
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            color: #0066cc;
        }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.2em; }
        p { margin-bottom: 1em; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1.5em;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: left;
        }
        th {
            background-color: #f5f5f5;
            font-weight: bold;
            color: #0066cc;
        }
        tr:nth-child(even) { background-color: #fafafa; }
        code {
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        .mermaid {
            display: flex;
            justify-content: center;
            margin: 20px 0;
            background: #fafafa;
            padding: 15px;
            border-radius: 5px;
        }
        pre {
            background-color: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin-bottom: 1em;
        }
        ul, ol { margin-left: 2em; margin-bottom: 1em; }
        li { margin-bottom: 0.5em; }
        strong { color: #0066cc; }
        .alert {
            border-left: 4px solid #0066cc;
            padding: 15px;
            margin-bottom: 1.5em;
            background-color: #f0f7ff;
            border-radius: 4px;
        }
        .footer {
            border-top: 1px solid #ddd;
            margin-top: 50px;
            padding-top: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
        @media print {
            body { background: white; padding: 0; }
            .no-print { display: none !important; }
            a { text-decoration: none; color: #0066cc; }
            h1, h2, h3 { page-break-after: avoid; }
            table, .mermaid { page-break-inside: avoid; }
            h2 { page-break-before: always; margin-top: 0; }
            h2:first-of-type { page-break-before: avoid; }
        }
        @page {
            size: A4;
            margin: 2cm;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>
    <script>
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
    <\/script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Security Posture Report</h1>
            <p><strong>${currentOrg?.name || 'Organization'}</strong></p>
            <p><small>Generated: ${now.toLocaleString()}</small></p>
        </div>
        <div class="content">
            ${this.renderMarkdown(report)}
        </div>
        <div class="footer">
            <p><strong>MagenSec Security Platform</strong></p>
            <p>Continuous Endpoint Security & Compliance</p>
            <p style="margin-top: 10px; color: #999; font-size: 0.85em;">This report is confidential and intended for authorized recipients only.</p>
        </div>
    </div>
    <script>
        // Render Mermaid diagrams after page load
        window.addEventListener('load', function() {
            mermaid.contentLoaded();
        });
    <\/script>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }
}
