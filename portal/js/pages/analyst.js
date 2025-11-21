import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
import { orgContext } from '../orgContext.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { PromptSuggestions } from '../components/PromptSuggestions.js';
import { CONSTANTS } from '../utils/constants.js';

const { html, Component } = window;

/**
 * AI Analyst Page - Unified prompt-driven reporting with automatic polling
 * Uses navbar org switcher - no inline org selector needed
 */
export class AnalystPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            prompt: '',
            forceRecompute: false,
            selectedOrgId: orgContext.getCurrentOrg()?.orgId || '',
            availableOrgs: orgContext.getAvailableOrgs(),
            loading: false,
            polling: false,
            result: null,
            error: null,
            reportId: null,
            feedback: { rating: null, comment: '' },
            showFeedbackModal: false
        };
        this.orgUnsubscribe = null;
        this.pollInterval = null;
        this.pollAttempts = 0;
        this.maxPollAttempts = CONSTANTS.MAX_POLL_ATTEMPTS;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => {
            this.setState({
                selectedOrgId: orgContext.getCurrentOrg()?.orgId || '',
                availableOrgs: orgContext.getAvailableOrgs()
            });
        });

        if (!this.state.availableOrgs?.length && auth.isAuthenticated()) {
            orgContext.initialize().catch((err) => console.error('[AnalystPage] Org init failed', err));
        }

        // Load ApexCharts with error handling
        if (!window.ApexCharts && !document.querySelector('script[src*="apexcharts"]')) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/apexcharts@3.45.0/dist/apexcharts.min.js';
            script.onerror = () => console.warn('[CDN] ApexCharts failed to load');
            document.head.appendChild(script);
        }

        // Load marked.js (stable build) with error handling
        if (!window.marked && !document.querySelector('script[src*="marked"]')) {
            const markedScript = document.createElement('script');
            markedScript.src = 'https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js';
            markedScript.onerror = () => console.warn('[CDN] marked.js failed, using regex fallback');
            document.head.appendChild(markedScript);
        }

        // Load DOMPurify with error handling
        if (!window.DOMPurify && !document.querySelector('script[src*="purify"]')) {
            const purifyScript = document.createElement('script');
            purifyScript.src = 'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js';
            purifyScript.onerror = () => console.warn('[CDN] DOMPurify failed, using regex fallback');
            document.head.appendChild(purifyScript);
        }
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        this.stopPolling();
    }

    buildPrompt(prompt, orgId) {
        const trimmed = (prompt || '').trim();
        if (!trimmed || !orgId) return trimmed;
        if (trimmed.toLowerCase().includes(orgId.toLowerCase())) return trimmed;
        return `${trimmed}\n\nTargetOrg: ${orgId}`;
    }

    async handleSubmit(event) {
        event.preventDefault();
        const { prompt, forceRecompute, selectedOrgId } = this.state;

        // Validate prompt
        const sanitizedPrompt = prompt.trim();
        if (!sanitizedPrompt) {
            this.setState({ error: 'Prompt is required.' });
            return;
        }

        if (sanitizedPrompt.length > CONSTANTS.MAX_PROMPT_LENGTH) {
            this.setState({ error: `Prompt is too long (maximum ${CONSTANTS.MAX_PROMPT_LENGTH} characters).` });
            return;
        }

        // Validate orgId
        if (!selectedOrgId) {
            this.setState({ error: 'Please select an organization.' });
            return;
        }

        const payload = {
            prompt: this.buildPrompt(prompt, selectedOrgId),
            waitSeconds: 30,
            forceRecompute
        };

        this.setState({ loading: true, polling: false, error: null, result: null, reportId: null, feedback: { rating: null, comment: '' } });

        try {
            const response = await api.post('/api/analyst/run', payload);
            
            // Normalized response: report, reportId, success, message (all lowercase)
            if (response.report || response.Report) {
                // Inline completion (HTTP 200)
                const report = response.report || response.Report;
                const reportId = response.reportId || response.ReportId;
                
                // Check for graph execution errors in the report
                if (report.ExecutiveSummary?.includes('Graph executed with no Generator node')) {
                    throw new Error('The AI analysis could not be completed. This may happen if the query is too complex or requires data that is not available. Please try rephrasing your question or use one of the suggested prompts.');
                }
                
                this.setState({ result: response, loading: false, reportId });
            } else if (response.reportId || response.ReportId) {
                // Job queued, poll for completion (HTTP 202)
                const reportId = response.reportId || response.ReportId;
                this.setState({ reportId, loading: false, polling: true });
                this.startPolling(reportId);
            } else if (response.success === false || response.Success === false) {
                // Explicit error from backend
                throw new Error(response.message || response.Message || response.error || response.Error || 'Request failed');
            } else {
                throw new Error('Unexpected response format');
            }
        } catch (err) {
            let errorMsg = err?.message || 'Failed to call analyst.';
            // Make graph execution errors more user-friendly
            if (errorMsg.includes('Graph executed with no Generator node')) {
                errorMsg = 'The AI analysis could not generate a report for this query. Please try: \n• Using one of the suggested prompts\n• Rephrasing your question\n• Ensuring you have devices registered in your organization';
            }
            this.setState({ loading: false, polling: false, error: errorMsg });
        }
    }

    startPolling(reportId) {
        this.pollAttempts = 0;
        this.pollInterval = setInterval(() => this.pollReport(reportId), CONSTANTS.POLL_INTERVAL_MS);
        this.pollReport(reportId);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }

    componentWillUnmount() {
        // Clean up polling resources
        this.stopPolling();
        if (this.orgUnsubscribe) {
            this.orgUnsubscribe();
        }
    }

    async pollReport(reportId) {
        this.pollAttempts++;

        if (this.pollAttempts > this.maxPollAttempts) {
            this.stopPolling();
            this.setState({ polling: false, error: `Report generation timed out. Report ID: ${reportId}`, reportId });
            return;
        }

        try {
            const status = await api.get(`/api/analyst/reports/${reportId}`);

            // Normalized response: report, status (with state, errorMessage)
            if (status.report) {
                this.stopPolling();
                this.setState({ result: status, polling: false, reportId });
            } else if (status.status?.state === 'Failed') {
                this.stopPolling();
                this.setState({ polling: false, error: `Report generation failed. Report ID: ${reportId}. ${status.status.errorMessage || ''}`, reportId });
            }
        } catch (err) {
            console.error('[AnalystPage] Poll error:', err);
            this.setState({ polling: false, error: `Polling error: ${err?.message || err}. Report ID: ${reportId}`, reportId });
        }
    }

    handlePromptSelect(suggestedPrompt) {
        this.setState({ prompt: suggestedPrompt });
        document.querySelector('#analyst-form')?.scrollIntoView({ behavior: 'smooth' });
    }

    async submitFeedback(rating) {
        const { prompt, selectedOrgId, reportId } = this.state;
        
        if (!reportId) {
            console.warn('[AnalystPage] No report ID for feedback');
            return;
        }

        if (rating === 'comment') {
            this.setState({ showFeedbackModal: true, feedback: { ...this.state.feedback, rating: null } });
            return;
        }

        try {
            await api.post('/api/analyst/feedback', {
                ReportId: reportId,
                Rating: rating,
                Comment: this.state.feedback.comment || ''
            });
            
            this.setState({ feedback: { rating, comment: this.state.feedback.comment }, showFeedbackModal: false });
            console.log('[AnalystPage] Feedback submitted:', rating);
        } catch (err) {
            console.error('[AnalystPage] Feedback failed:', err);
            // Don't show error to user for feedback failures
        }
    }

    async submitFeedbackComment() {
        const { feedback, reportId } = this.state;
        
        if (!reportId || !feedback.comment?.trim()) {
            this.setState({ showFeedbackModal: false });
            return;
        }
        
        try {
            await api.post('/api/analyst/feedback', {
                ReportId: reportId,
                Rating: 'Neutral',
                Comment: feedback.comment.trim()
            });
            this.setState({ showFeedbackModal: false, feedback: { rating: null, comment: '' } });
            console.log('[AnalystPage] Feedback comment submitted');
        } catch (err) {
            console.error('[AnalystPage] Comment failed:', err);
        }
    }

    renderMarkdown(text) {
        // Handle non-string inputs (objects, arrays, etc.)
        if (!text) return '';
        if (typeof text === 'object') {
            // If it's an object, try to stringify it or extract meaningful content
            if (text.text || text.content) {
                text = text.text || text.content;
            } else {
                console.warn('[AnalystPage] ExecutiveSummary is object:', text);
                return JSON.stringify(text, null, 2);
            }
        }
        
        if (typeof text !== 'string') {
            return String(text);
        }
        
        // ALWAYS require DOMPurify - don't use fallback
        if (!window.marked || !window.DOMPurify) {
            logger.error('[AnalystPage] DOMPurify or marked.js not loaded - cannot render markdown safely');
            return '';
        }
        
        try {
            const rawHtml = window.marked.parse(text);
            const cleanHtml = window.DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                ALLOWED_ATTR: ['href', 'title', 'class'],
                ALLOW_DATA_ATTR: false
            });
            return cleanHtml;
        } catch (err) {
            logger.error('[AnalystPage] Markdown parsing failed:', err);
            return '';
        }
    }

    renderFeedbackModal() {
        const { showFeedbackModal, feedback } = this.state;
        
        if (!showFeedbackModal) return null;

        return html`<div class="modal modal-blur show" style="display: block;" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Share Feedback</h5>
                        <button type="button" class="btn-close" onClick=${() => this.setState({ showFeedbackModal: false })}></button>
                    </div>
                    <div class="modal-body">
                        <textarea 
                            class="form-control" 
                            rows="4" 
                            placeholder="Tell us what worked well or what could be improved..."
                            value=${feedback.comment}
                            onInput=${(e) => this.setState({ feedback: { ...feedback, comment: e.target.value } })}
                        ></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-link" onClick=${() => this.setState({ showFeedbackModal: false })}>Cancel</button>
                        <button type="button" class="btn btn-primary" onClick=${() => this.submitFeedbackComment()}>Submit</button>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop show"></div>
        </div>`;
    }

    renderReportCard(report, label) {
        if (!report) return null;

        const { feedback } = this.state;
        const summary = report.RiskSummary || report.Summary || {};
        const topFactors = Array.isArray(summary.TopRiskFactors) ? summary.TopRiskFactors.slice(0, CONSTANTS.MAX_TOP_RISK_FACTORS) : [];
        const recommendations = Array.isArray(report.Recommendations) ? report.Recommendations.slice(0, CONSTANTS.MAX_RECOMMENDATIONS) : [];
        const devices = Array.isArray(report.DevicesAtRisk) ? report.DevicesAtRisk.slice(0, CONSTANTS.MAX_DEVICES_AT_RISK) : [];
        const analysisText = report.Analysis || report.AnalysisText || report.DetailedAnalysis || '';

        return html`<div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title">${label || 'Analysis Results'}</h3>
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm ${feedback.rating === 'ThumbsUp' ? 'btn-success' : 'btn-outline-success'}" 
                        onClick=${() => this.submitFeedback('ThumbsUp')} title="Helpful">👍</button>
                    <button type="button" class="btn btn-sm ${feedback.rating === 'ThumbsDown' ? 'btn-danger' : 'btn-outline-danger'}" 
                        onClick=${() => this.submitFeedback('ThumbsDown')} title="Not helpful">👎</button>
                    <button type="button" class="btn btn-sm btn-outline-primary" 
                        onClick=${() => this.submitFeedback('comment')} title="Add comment">💬</button>
                </div>
            </div>
            <div class="card-body">
                ${report.ExecutiveSummary && html`<div class="mb-4">
                    <h4>Executive Summary</h4>
                    <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report.ExecutiveSummary) }}></div>
                </div>`}
                
                ${analysisText && html`<div class="mb-4">
                    <h4>Detailed Analysis</h4>
                    <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(analysisText) }}></div>
                </div>`}
                
                ${report.KeyFindings && html`<div class="mb-4">
                    <h4>Key Findings</h4>
                    <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report.KeyFindings) }}></div>
                </div>`}

                ${report.Charts && report.Charts.length > 0 && html`<div>
                    <h4 class="mb-3">Security Overview</h4>
                    <${ChartRenderer} charts=${report.Charts} />
                </div>`}

                ${topFactors.length > 0 && html`<div>
                    <h4 class="mb-3 mt-4">Top Risk Factors</h4>
                    <ul class="list-unstyled">
                        ${topFactors.map((factor, idx) => html`<li key=${idx} class="mb-2">
                            <span class="badge bg-danger me-2">${idx + 1}</span>
                            <strong>${factor.Category || factor.Description || factor}</strong>
                            ${factor.ImpactScore && html`<span class="text-muted ms-2">(Impact: ${factor.ImpactScore})</span>`}
                        </li>`)}
                    </ul>
                </div>`}

                ${recommendations.length > 0 && html`<div>
                    <h4 class="mb-3 mt-4">Action Items</h4>
                    <div class="list-group list-group-flush">
                        ${recommendations.map((rec, idx) => {
                            const isString = typeof rec === 'string';
                            const action = isString ? rec : (rec.Action || rec.action || rec.Title || rec.title || rec.Recommendation);
                            const details = isString ? '' : (rec.Details || rec.details || rec.Description || rec.description || '');
                            const priority = isString ? '' : (rec.Priority || rec.priority || '');
                            const affectedItems = isString ? [] : (rec.AffectedDevices || rec.affectedDevices || rec.Vulnerabilities || rec.vulnerabilities || []);
                            
                            return html`<div key=${idx} class="list-group-item">
                                <div class="row align-items-start">
                                    <div class="col-auto">
                                        <span class="badge bg-primary">${idx + 1}</span>
                                    </div>
                                    <div class="col">
                                        <div class="d-flex justify-content-between">
                                            <div class="flex-fill">
                                                <strong>${action || `Action ${idx + 1}`}</strong>
                                                ${details && html`<div class="text-secondary small mt-1">${details}</div>`}
                                                ${Array.isArray(affectedItems) && affectedItems.length > 0 && html`
                                                    <div class="mt-2">
                                                        <small class="text-muted">Affected items:</small>
                                                        <ul class="small mb-0 mt-1">
                                                            ${affectedItems.slice(0, 10).map(item => html`
                                                                <li key=${item}><code>${typeof item === 'string' ? item : item.CVE || item.Id || JSON.stringify(item)}</code></li>
                                                            `)}
                                                            ${affectedItems.length > 10 && html`<li class="text-muted">...and ${affectedItems.length - 10} more</li>`}
                                                        </ul>
                                                    </div>
                                                `}
                                            </div>
                                            ${priority && html`
                                                <span class="badge bg-${priority === 'Critical' || priority === 'High' ? 'danger' : priority === 'Medium' ? 'warning' : 'info'} ms-2">
                                                    ${priority}
                                                </span>
                                            `}
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        })}
                    </div>
                </div>`}

                ${devices.length > 0 && html`<div>
                    <h4 class="mb-3 mt-4">Devices at Risk</h4>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover">
                            <thead><tr><th>Device</th><th>Risk Score</th><th>Critical</th><th>High</th><th>Medium</th></tr></thead>
                            <tbody>
                                ${devices.map((dev, idx) => {
                                    const deviceName = dev.Name || dev.Hostname || dev.DeviceName || '';
                                    const deviceId = dev.DeviceId || dev.Id || dev;
                                    const isStringDevice = typeof dev === 'string';
                                    
                                    return html`<tr key=${idx}>
                                        <td>
                                            ${deviceName && html`<div><strong>${deviceName}</strong></div>`}
                                            <code class="small text-muted">${isStringDevice ? dev : deviceId}</code>
                                        </td>
                                        <td>
                                            ${!isStringDevice && dev.RiskScore !== undefined ? html`
                                                <span class="badge ${dev.RiskScore >= 80 ? 'bg-danger' : dev.RiskScore >= 50 ? 'bg-warning' : 'bg-info'}">
                                                    ${dev.RiskScore.toFixed(1)}
                                                </span>
                                            ` : html`<span class="text-muted">-</span>`}
                                        </td>
                                        <td>${!isStringDevice && dev.CriticalCount !== undefined ? html`<span class="badge bg-danger">${dev.CriticalCount}</span>` : '-'}</td>
                                        <td>${!isStringDevice && dev.HighCount !== undefined ? html`<span class="badge bg-warning">${dev.HighCount}</span>` : '-'}</td>
                                        <td>${!isStringDevice && dev.MediumCount !== undefined ? html`<span class="badge bg-info">${dev.MediumCount}</span>` : '-'}</td>
                                    </tr>`;
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>`}
            </div>
        </div>`;
    }

    renderResult() {
        const { result, polling, reportId } = this.state;

        if (polling) {
            return html`<div class="card mb-4">
                <div class="card-body text-center py-5">
                    <div class="spinner-border text-primary mb-3"></div>
                    <h4>Generating report...</h4>
                    <p class="text-muted">This may take up to 2 minutes.</p>
                    <small class="text-muted">Poll attempt: ${this.pollAttempts}/${this.maxPollAttempts}</small>
                    ${reportId && html`<div class="mt-2"><small class="text-muted">Report ID: <code>${reportId}</code></small></div>`}
                </div>
            </div>`;
        }

        if (!result) return null;

        // Backend returns PascalCase: ReportsByOrg, Report
        if (result.ReportsByOrg) {
            return html`<div>
                ${Object.entries(result.ReportsByOrg).map(([orgId, report]) => 
                    this.renderReportCard(report, `Report for ${orgId}`)
                )}
            </div>`;
        }

        return html`<div>
            ${this.state.reportId && html`<div class="mb-2"><small class="text-muted">Report ID: <code>${this.state.reportId}</code></small></div>`}
            ${this.renderReportCard(result.Report, 'Security Report')}
        </div>`;
    }

    renderForm() {
        const { prompt, /*forceRecompute,*/ loading, polling, selectedOrgId, availableOrgs } = this.state;

        return html`<div>
            <${PromptSuggestions} onSelectPrompt=${(p) => this.handlePromptSelect(p)} />

            <form id="analyst-form" onSubmit=${(e) => this.handleSubmit(e)} class="card mb-4">
                <div class="card-header"><h3 class="card-title">Run Analysis</h3></div>
                <div class="card-body">
                    <!-- Organization is selected via navbar switcher -->
                    <div class="mb-3">
                        <label class="form-label">Your Question</label>
                        <textarea class="form-control" rows="5" value=${prompt} 
                            onInput=${(e) => this.setState({ prompt: e.target.value })} 
                            placeholder="e.g., What are the critical vulnerabilities I should patch first?"></textarea>
                        <div class="form-text">Describe what you want investigated. Use suggestions above for inspiration.</div>
                    </div>
                    
                    <div class="d-flex justify-content-end">
                        <button type="submit" class="btn btn-primary" disabled=${loading || polling}>
                            ${loading || polling ? html`<span><span class="spinner-border spinner-border-sm me-2"></span>
                                ${polling ? 'Generating...' : 'Submitting...'}</span>` : 'Run Analysis'}
                        </button>
                    </div>
                </div>
            </form>
        </div>`;
    }

    render() {
        const { html } = window;
        
        return html`
            ${this.state.error && html`<div class="alert alert-danger alert-dismissible">
                <div class="d-flex">
                    <div>
                        <h4 class="alert-title">Error</h4>
                        <div class="text-muted">${this.state.error}</div>
                        ${this.state.reportId && html`<div class="mt-2"><small class="text-muted">Report ID: <code>${this.state.reportId}</code></small></div>`}
                    </div>
                </div>
                <button type="button" class="btn-close" onClick=${() => this.setState({ error: null })}></button>
            </div>`}
            ${this.renderForm()}
            ${this.renderResult()}
            ${this.renderFeedbackModal()}
        `;
    }
}
