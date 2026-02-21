/**
 * AI Security Reports Page
 *
 * Features:
 * - Generate new security posture reports
 * - View report generation queue/status
 * - Download completed reports
 * - Report templates (Full Posture, Vulnerability Summary, Compliance Check)
 *
 * API Endpoints:
 * - POST /api/v1/orgs/{orgId}/ai-analyst/run - Generate report
 * - GET /api/v1/orgs/{orgId}/ai-analyst/reports - List reports
 * - GET /api/v1/orgs/{orgId}/ai-analyst/reports/{reportId} - Get report detail
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';

const { html, Component } = window;

export default class AIReportsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            loadingMore: false,
            error: null,
            reports: [],
            generating: false,
            selectedTemplate: 'full-posture',
            selectedModel: 'azure-openai',
            generationStatus: null,
            continuationToken: null,
            hasMore: false,
            isSiteAdmin: false,
            feedbackData: null,
            loadingFeedback: false,
            feedbackDays: 7
        };
        this.scrollObserverEl = null;
        this.observer = null;
        this.orgChangeListener = null;
    }

    componentDidMount() {
        this.orgChangeListener = orgContext.onChange(() => {
            this.loadReports();
        });
        this.loadReports();

        const user = auth.getUser();
        if (user?.userType === 'SiteAdmin') {
            this.setState({ isSiteAdmin: true });
            this.loadFeedback();
        }
    }

    setupInfiniteScroll() {
        if (!this.scrollObserverEl) return;
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && this.state.hasMore && !this.state.loading && !this.state.loadingMore) {
                    this.loadMoreReports();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        this.observer.observe(this.scrollObserverEl);
    }

    componentWillUnmount() {
        if (this.orgChangeListener) {
            this.orgChangeListener();
        }
        if (this.observer) {
            this.observer.disconnect();
        }
    }

    async loadReports() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            const response = await api.get(`/api/v1/orgs/${org.orgId}/ai-analyst/reports?limit=20`);

            if (response.success) {
                this.setState({
                    reports: response.data.reports || [],
                    continuationToken: response.data.continuationToken,
                    hasMore: !!response.data.continuationToken,
                    loading: false
                });
            } else {
                this.setState({
                    error: response.message || 'Failed to load reports',
                    loading: false
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Failed to load reports',
                loading: false
            });
        }
    }

    async generateReport() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) {
            this.setState({ error: 'No organization selected' });
            return;
        }

        const { selectedTemplate } = this.state;

        this.setState({ generating: true, error: null, generationStatus: 'Initializing report generation...' });

        try {
            const prompts = {
                'full-posture': 'Generate a comprehensive security posture report covering vulnerabilities, compliance, devices, and risk trends.',
                'vulnerability-summary': 'Generate a vulnerability assessment report with CVE analysis and remediation priorities.',
                'compliance-check': 'Generate a compliance status report showing policy violations and security gaps.'
            };

            const prompt = prompts[selectedTemplate] || prompts['full-posture'];

            this.setState({ generationStatus: 'Sending request to AI engine...' });

            const response = await api.post(`/api/v1/orgs/${org.orgId}/ai-analyst/run`, {
                prompt: prompt,
                model: this.state.selectedModel,
                includeRecommendations: true,
                waitSeconds: 30
            });

            if (response.success) {
                this.setState({
                    generationStatus: response.data.status === 'completed'
                        ? 'Report generated successfully!'
                        : 'Report queued for generation. Refresh to check status.',
                    generating: false
                });

                setTimeout(() => this.loadReports(), 2000);
            } else {
                this.setState({
                    error: response.message || 'Failed to generate report',
                    generating: false,
                    generationStatus: null
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Failed to generate report',
                generating: false,
                generationStatus: null
            });
        }
    }

    async downloadReport(reportId) {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) return;

        try {
            const response = await api.get(`/api/v1/orgs/${org.orgId}/ai-analyst/reports/${reportId}`);

            if (response.success && response.data) {
                const report = response.data;
                const markdown = this.formatReportAsMarkdown(report);

                const blob = new Blob([markdown], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `security-report-${reportId}.md`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                this.setState({ error: response.message || 'Failed to download report' });
            }
        } catch (err) {
            this.setState({ error: err.message || 'Failed to download report' });
        }
    }

    formatReportAsMarkdown(report) {
        let md = `# Security Report\n\n`;
        md += `**Report ID:** ${report.reportId}\n`;
        md += `**Generated:** ${new Date(report.createdAt).toLocaleString()}\n`;
        md += `**Status:** ${report.status}\n\n`;

        if (report.sections && report.sections.length > 0) {
            report.sections.forEach(section => {
                md += `## ${section.title}\n\n`;
                md += `${section.content}\n\n`;
            });
        }

        if (report.recommendations && report.recommendations.length > 0) {
            md += `## Recommendations\n\n`;
            report.recommendations.forEach((rec, idx) => {
                md += `${idx + 1}. **${rec.title}** (Priority: ${rec.priority})\n`;
                md += `   ${rec.description}\n\n`;
            });
        }

        return md;
    }

    async loadFeedback(days) {
        const queryDays = days || this.state.feedbackDays;
        this.setState({ loadingFeedback: true });
        try {
            const response = await api.get(`/api/v1/ai-analyst/metrics/system/feedback?days=${queryDays}`);
            if (response.success) {
                this.setState({ feedbackData: response.data, loadingFeedback: false, feedbackDays: queryDays });
            } else {
                this.setState({ loadingFeedback: false });
            }
        } catch (err) {
            this.setState({ loadingFeedback: false });
        }
    }

    getFailureBadgeClass(failureType) {
        const map = { NO_TELEMETRY: 'bg-warning text-dark', LLM_ERROR: 'bg-danger text-white', INADEQUATE_RESPONSE: 'bg-orange text-white', POLICY_REJECTED: 'bg-secondary text-white' };
        return map[failureType] || 'bg-secondary text-white';
    }

    handleTemplateChange(e) {
        this.setState({ selectedTemplate: e.target.value });
    }

    handleModelChange(model) {
        this.setState({ selectedModel: model });
    }

    async loadMoreReports() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId || !this.state.continuationToken) return;

        this.setState({ loadingMore: true });

        try {
            const response = await api.get(
                `/api/v1/orgs/${org.orgId}/ai-analyst/reports?limit=20&continuationToken=${this.state.continuationToken}`
            );

            if (response.success) {
                this.setState(prevState => ({
                    reports: [...prevState.reports, ...(response.data.reports || [])],
                    continuationToken: response.data.continuationToken,
                    hasMore: !!response.data.continuationToken,
                    loadingMore: false
                }));
            }
        } catch (err) {
            this.setState({ error: err.message, loadingMore: false });
        }
    }

    getStatusBadgeClass(status) {
        const statusMap = {
            'completed': 'success',
            'running': 'info',
            'queued': 'warning',
            'failed': 'danger'
        };
        return statusMap[status] || 'secondary';
    }

    render() {
        const { loading, error, reports, generating, selectedTemplate, selectedModel, generationStatus, hasMore,
                isSiteAdmin, feedbackData, loadingFeedback, feedbackDays, loadingMore } = this.state;

        return html`
            <div class="ai-reports-page">
                <div class="page-header">
                    <h1>AI Security Reports</h1>
                    <p class="page-description">Generate comprehensive security posture reports using AI analysis of your infrastructure.</p>
                </div>

                ${error && html`
                    <div class="alert alert-danger alert-dismissible fade show">
                        <div class="d-flex">
                            <div>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <circle cx="12" cy="12" r="9"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <div>
                                <h4 class="alert-title">Error</h4>
                                <div class="text-secondary">${error}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" onClick=${() => this.setState({ error: null })}></button>
                    </div>
                `}

                <div class="card mb-4 card-hover">
                    <div class="card-stamp card-stamp-lg">
                        <div class="card-stamp-icon bg-primary">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M8 9h8"/>
                                <path d="M8 13h6"/>
                                <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"/>
                            </svg>
                        </div>
                    </div>
                    <div class="card-header">
                        <h3 class="card-title">Generate New Report</h3>
                        <div class="card-subtitle">AI-powered security analysis and recommendations</div>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label">Analysis Engine</label>
                            <div class="btn-group d-flex" role="group">
                                <button
                                    type="button"
                                    class=${`btn ${selectedModel === 'azure-openai' ? 'btn-primary' : 'btn-outline-secondary'} flex-fill`}
                                    onClick=${() => this.handleModelChange('azure-openai')}
                                    disabled=${generating}
                                >
                                    <span>✨ AI-Powered (GPT-4o)</span>
                                </button>
                                <button
                                    type="button"
                                    class=${`btn ${selectedModel === 'heuristic' ? 'btn-secondary' : 'btn-outline-secondary'} flex-fill`}
                                    onClick=${() => this.handleModelChange('heuristic')}
                                    disabled=${generating}
                                >
                                    <span>📊 Classic (Heuristic)</span>
                                </button>
                            </div>
                            ${selectedModel === 'azure-openai' && html`
                                <div class="form-text text-primary mt-1">✨ GPT-4o will use your real security telemetry to create a personalized narrative report.</div>
                            `}
                        </div>

                        <div class="form-group">
                            <label for="template-select">Report Template</label>
                            <select
                                id="template-select"
                                class="form-control"
                                value=${selectedTemplate}
                                onChange=${(e) => this.handleTemplateChange(e)}
                                disabled=${generating}
                            >
                                <option value="full-posture">Full Security Posture (Comprehensive)</option>
                                <option value="vulnerability-summary">Vulnerability Assessment</option>
                                <option value="compliance-check">Compliance Status Report</option>
                            </select>
                        </div>

                        ${generationStatus && html`
                            <div class="alert alert-info mt-3">
                                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                                ${generationStatus}
                            </div>
                        `}

                        <button
                            class="btn btn-primary mt-3"
                            onClick=${() => this.generateReport()}
                            disabled=${generating}
                        >
                            ${generating
                                ? html`<span class="spinner-border spinner-border-sm me-2" role="status"></span>Generating...`
                                : selectedModel === 'azure-openai'
                                ? html`<span>✨ Generate AI Report</span>`
                                : html`<span>📊 Generate Report</span>`
                            }
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <div class="header-with-actions">
                            <h3>Report History</h3>
                            <button
                                class="btn btn-sm btn-outline-secondary"
                                onClick=${() => this.loadReports()}
                                disabled=${loading}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/>
                                    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>
                                </svg>
                                ${' '}Refresh
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${loading && reports.length === 0 && html`
                            <div class="d-flex align-items-center justify-content-center" style="min-height: 300px;">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading reports...</span>
                                </div>
                            </div>
                        `}

                        ${!loading && reports.length === 0 && html`
                            <div class="text-center py-5 text-muted">
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" class="mb-3" style="display: block; margin: 0 auto 1rem;">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                                    <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/>
                                    <line x1="9" y1="9" x2="10" y2="9"/>
                                    <line x1="9" y1="13" x2="15" y2="13"/>
                                    <line x1="9" y1="17" x2="15" y2="17"/>
                                </svg>
                                <h4>No reports generated yet</h4>
                                <p>Generate your first security report using the panel above.</p>
                            </div>
                        `}

                        ${reports.length > 0 && html`
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Report ID</th>
                                            <th>Generated</th>
                                            <th>Status</th>
                                            <th>Type</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${reports.map(report => html`
                                            <tr key=${report.reportId}>
                                                <td><code>${report.reportId.substring(0, 12)}...</code></td>
                                                <td>${new Date(report.createdAt).toLocaleString()}</td>
                                                <td>
                                                    <span class=${`badge badge-${this.getStatusBadgeClass(report.status)}`}>
                                                        ${report.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    ${report.reportType || 'Security Posture'}
                                                    ${report.model && report.model !== 'heuristic' && html`
                                                        <span class="badge bg-primary text-white ms-2" title=${`Generated with ${report.model}`}>🤖 AI</span>
                                                    `}
                                                </td>
                                                <td>
                                                    <button
                                                        class="btn btn-sm btn-primary me-2"
                                                        onClick=${() => this.downloadReport(report.reportId)}
                                                        disabled=${report.status !== 'completed'}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/>
                                                            <polyline points="7 11 12 16 17 11"/>
                                                            <line x1="12" y1="4" x2="12" y2="16"/>
                                                        </svg>
                                                        ${' '}Download
                                                    </button>
                                                    <button
                                                        class="btn btn-sm btn-outline-secondary"
                                                        onClick=${() => window.location.href = `#/ai-reports/${report.reportId}`}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <circle cx="12" cy="12" r="2"/>
                                                            <path d="M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7"/>
                                                        </svg>
                                                        ${' '}View
                                                    </button>
                                                </td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        `}

                        ${hasMore && html`
                            <div class="text-center mt-3">
                                ${!loading && !loadingMore && html`
                                    <div ref=${(el) => { this.scrollObserverEl = el; if (el) this.setupInfiniteScroll(); }} style="height: 1px;"></div>
                                `}
                                ${loadingMore && html`
                                    <div class="py-3">
                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                        <span class="text-muted">Loading more reports...</span>
                                    </div>
                                `}
                            </div>
                        `}
                    </div>
                </div>

                ${isSiteAdmin && html`
                    <div class="card mt-4">
                        <div class="card-header">
                            <h3 class="card-title">
                                <span class="badge bg-danger text-white me-2">Admin</span>
                                AI Quality Issues
                            </h3>
                            <div class="card-subtitle text-muted">
                                Incidents where the AI gave inadequate responses, had no telemetry, or encountered errors. Fix these to improve answer quality.
                            </div>
                            <div class="ms-auto d-flex gap-2 align-items-center">
                                ${['7', '14', '30'].map(d => html`
                                    <button
                                        key=${d}
                                        class=${`btn btn-sm ${feedbackDays === parseInt(d) ? 'btn-primary' : 'btn-outline-secondary'}`}
                                        onClick=${() => this.loadFeedback(parseInt(d))}
                                    >${d}d</button>
                                `)}
                                <button
                                    class="btn btn-sm btn-outline-secondary"
                                    onClick=${() => this.loadFeedback()}
                                    disabled=${loadingFeedback}
                                >${loadingFeedback ? '…' : '↻'}</button>
                            </div>
                        </div>
                        <div class="card-body">
                            ${loadingFeedback && html`
                                <div class="text-center py-4">
                                    <span class="spinner-border text-secondary"></span>
                                </div>
                            `}

                            ${!loadingFeedback && feedbackData && feedbackData.totalIncidents === 0 && html`
                                <div class="text-center py-4 text-muted">
                                    <p class="mb-0">✅ No AI quality incidents in the last ${feedbackDays} days.</p>
                                </div>
                            `}

                            ${!loadingFeedback && feedbackData && feedbackData.totalIncidents > 0 && html`
                                <div>
                                    <div class="d-flex gap-3 mb-4 flex-wrap">
                                        ${feedbackData.byDay.slice(0, 14).map(day => html`
                                            <div key=${day.date} class="text-center" style="min-width: 64px;">
                                                <div class="h4 mb-0 text-danger">${day.totalCount}</div>
                                                <div class="text-muted small">${day.date.slice(4,6)}/${day.date.slice(6,8)}</div>
                                                ${Object.entries(day.breakdown).map(([type, count]) => html`
                                                    <div key=${type} class=${`badge ${this.getFailureBadgeClass(type)} d-block mt-1`} title=${type}>${count}</div>
                                                `)}
                                            </div>
                                        `)}
                                    </div>

                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Org</th>
                                                    <th>Type</th>
                                                    <th>Question</th>
                                                    <th>Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${feedbackData.allIncidents.slice(0, 50).map((inc, idx) => html`
                                                    <tr key=${idx}>
                                                        <td class="text-muted small text-nowrap">${new Date(inc.timestamp).toLocaleString()}</td>
                                                        <td class="small font-monospace">${inc.orgId}</td>
                                                        <td><span class=${`badge ${this.getFailureBadgeClass(inc.failureType)}`}>${inc.failureType}</span></td>
                                                        <td class="small" style="max-width:280px; word-break:break-word;">${inc.question}</td>
                                                        <td class="small text-muted" style="max-width:240px; word-break:break-word;">${inc.details || '—'}</td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                `}
            </div>
        `;
    }
}
