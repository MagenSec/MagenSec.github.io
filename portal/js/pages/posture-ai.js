import { api } from '../api.js';
import { logger } from '../config.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

/**
 * AI-Based Security Posture Page
 * Legacy AI report generation and viewing via /ai/reports endpoints
 */
export class AIPosturePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            generating: false,
            error: null,
            currentReport: null,
            selectedTemplate: 'full-posture'
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadReports());
        this.loadReports();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
    }

    async loadReports() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            // Try latest persisted report
            const latest = await api.getLatestAIReport(currentOrg.orgId);
            const report = latest?.data || latest;
            if (report) {
                this.setState({ currentReport: report, loading: false, error: null });
                return;
            }

            // If none, generate on-demand
            await this.generateReport();
            this.setState({ loading: false });
        } catch (err) {
            logger.error('[AI Posture] Failed to load/generate report:', err);
            this.setState({
                error: err?.message || 'Failed to load AI reports',
                loading: false
            });
        }
    }

    async generateReport() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        this.setState({ generating: true, error: null });

        try {
            const res = await api.generateAIReport(currentOrg.orgId, {
                prompt: this.state.prompt || 'Full security posture analysis',
                model: this.state.model || 'heuristic',
                waitSeconds: 30
            });

            if (res?.success === false) {
                throw new Error(res.message || res.error || 'Report generation failed');
            }

            const report = res?.data || res;
            this.setState({ currentReport: report, generating: false, error: null });
        } catch (err) {
            logger.error('[AI Posture] Failed to generate report:', err);
            this.setState({
                error: err?.message || 'Failed to generate report',
                generating: false
            });
        }
    }

    renderReportContent() {
        const { currentReport } = this.state;

        if (!currentReport) {
            return html`
                <div class="text-center text-muted py-5">
                    <div class="mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                            <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                            <line x1="9" y1="9" x2="10" y2="9" />
                            <line x1="9" y1="13" x2="15" y2="13" />
                            <line x1="9" y1="17" x2="15" y2="17" />
                        </svg>
                    </div>
                    <h3>No Report Available</h3>
                    <p class="text-muted">Generate an AI-powered security posture report for today</p>
                </div>
            `;
        }

        // Parse the report JSON/content
        let reportContent = currentReport.report || currentReport.content || currentReport.outputJson || '';
        if (typeof reportContent === 'string') {
            try {
                reportContent = JSON.parse(reportContent);
            } catch {
                // Keep as string if not JSON
            }
        }

        const riskScore = currentReport.riskScore || currentReport.summaryScore || 0;
        const completedAt = currentReport.completedAt || currentReport.generatedAt || currentReport.generatedAtUtc;
        const dateStr = completedAt ? new Date(completedAt).toLocaleString() : 'Just now';

        return html`
            <div class="p-4">
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body">
                                <h5 class="card-title">Risk Score</h5>
                                <div class="display-4 ${riskScore > 70 ? 'text-danger' : riskScore > 40 ? 'text-warning' : 'text-success'}">
                                    ${riskScore.toFixed(1)}
                                </div>
                                <div class="text-muted small">Generated: ${dateStr}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Report Content</h3>
                    </div>
                    <div class="card-body">
                        <pre class="mb-0" style="white-space: pre-wrap;">${typeof reportContent === 'string' ? reportContent : JSON.stringify(reportContent, null, 2)}</pre>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        if (this.state.loading) {
            return html`
                <div class="d-flex justify-content-center align-items-center" style="min-height: 50vh;">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            `;
        }

        if (this.state.error) {
            return html`
                <div class="container py-4">
                    <div class="alert alert-danger">${this.state.error}</div>
                    <button class="btn btn-primary" onClick=${() => this.loadReports()}>Retry</button>
                </div>
            `;
        }

        return html`
            <div class="container py-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 class="mb-0">AI Security Posture</h2>
                        <div class="text-muted">AI-generated security analysis and recommendations</div>
                    </div>
                    <button 
                        class="btn btn-primary" 
                        disabled=${this.state.generating}
                        onClick=${() => this.generateReport()}
                    >
                        ${this.state.generating ? html`
                            <span class="spinner-border spinner-border-sm me-2"></span>
                            Generating...
                        ` : 'Generate New Report'}
                    </button>
                </div>

                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">Report Template</h3>
                            </div>
                            <div class="card-body">
                                <input 
                                    class="form-control mb-2"
                                    placeholder="Prompt (e.g., Show critical vulnerabilities and top actions)"
                                    value=${this.state.prompt || ''}
                                    onChange=${(e) => this.setState({ prompt: e.target.value })}
                                />
                                <select 
                                    class="form-select" 
                                    value=${this.state.model || 'heuristic'}
                                    onChange=${(e) => this.setState({ model: e.target.value })}
                                >
                                    <option value="heuristic">Heuristic (fast)</option>
                                    <option value="local-llm">Local LLM</option>
                                </select>
                                <div class="text-muted small mt-2">
                                    Choose model and prompt for the report
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Today's Security Posture Report</h3>
                    </div>
                    <div class="card-body p-0">
                        ${this.renderReportContent()}
                    </div>
                </div>
            </div>
        `;
    }
}
