import { auth } from '@auth';
import { api } from '@api';
import { config } from '@config';
import { orgContext } from '@orgContext';
import { ChartRenderer } from '@components/ChartRenderer.js';
import { PromptSuggestions } from '@components/PromptSuggestions.js';
import { CONSTANTS } from '@utils/constants.js';

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
            selectedOrgId: orgContext.getCurrentOrg()?.orgId || '',
            availableOrgs: orgContext.getAvailableOrgs(),
            loading: false,
            result: null,
            error: null,
            history: []
        };
        this.orgUnsubscribe = null;
        this.pollInterval = null;
        this.pollAttempts = 0;
        this.maxPollAttempts = CONSTANTS.MAX_POLL_ATTEMPTS;
    }

    componentDidMount() {
        // Load history
        try {
            const savedHistory = localStorage.getItem('magensec_analyst_history');
            if (savedHistory) {
                this.setState({ history: JSON.parse(savedHistory) });
            }
        } catch (e) {
            console.warn('[AnalystPage] Failed to load history', e);
        }

        // Check for query parameter from dashboard
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
        const query = urlParams.get('q');
        
        if (query) {
            const decodedQuery = decodeURIComponent(query);
            const currentOrg = orgContext.getCurrentOrg();
            
            if (currentOrg?.orgId) {
                this.setState({ prompt: decodedQuery }, () => {
                    this.handleSubmit({ preventDefault: () => {} });
                });
            } else {
                this.setState({ prompt: decodedQuery, autoSubmitPending: true });
            }
        }

        this.orgUnsubscribe = orgContext.onChange(() => {
            const orgId = orgContext.getCurrentOrg()?.orgId || '';
            this.setState({
                selectedOrgId: orgId,
                availableOrgs: orgContext.getAvailableOrgs()
            }, () => {
                if (this.state.autoSubmitPending && this.state.selectedOrgId) {
                    this.setState({ autoSubmitPending: false });
                    this.handleSubmit({ preventDefault: () => {} });
                }
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

    addToHistory(query) {
        try {
            const { history } = this.state;
            // Remove duplicates and add to top
            const newHistory = [
                { query, timestamp: Date.now() },
                ...history.filter(h => h.query !== query)
            ].slice(0, 10); // Keep last 10

            this.setState({ history: newHistory });
            localStorage.setItem('magensec_analyst_history', JSON.stringify(newHistory));
        } catch (e) {
            console.warn('[AnalystPage] Failed to save history', e);
        }
    }

    clearHistory() {
        this.setState({ history: [] });
        localStorage.removeItem('magensec_analyst_history');
    }

    getUserInitials() {
        const user = auth.getUser();
        if (!user || !user.email) return 'U';
        const parts = user.email.split('@')[0].split('.');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return user.email.substring(0, 2).toUpperCase();
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

        // Save to history
        this.addToHistory(sanitizedPrompt);

        const payload = {
            entity: 0, // CveTelemetry
            operation: 0, // Count
            prompt: this.buildPrompt(prompt, selectedOrgId),
            limit: 50
        };

        this.setState({ loading: true, error: null, result: null });

        try {
            const response = await api.runAnalytics(selectedOrgId, payload);
            if (response?.success === false) {
                throw new Error(response.message || response.error || 'Request failed');
            }
            const result = response.result || response.data || response;
            this.setState({ result, loading: false });
        } catch (err) {
            const errorMsg = err?.message || 'Failed to call analyst.';
            this.setState({ loading: false, error: errorMsg });
        }
    }

    startPolling(reportId, orgId) {
        this.pollAttempts = 0;
        this.pollInterval = setInterval(() => this.pollReport(reportId, orgId), CONSTANTS.POLL_INTERVAL_MS);
        this.pollReport(reportId, orgId);
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

    async pollReport(reportId, orgId = this.state.selectedOrgId) {
        // Polling logic has been removed as per the new implementation
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
            await api.post('/api/v1/analyst/feedback', {
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
            await api.post('/api/v1/analyst/feedback', {
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
        const mitigated = summary.MitigatedThreats || summary.ResolvedThreats;
        const userInitials = this.getUserInitials();

        return html`
            <!-- User Prompt Bubble -->
            <div class="d-flex justify-content-end mb-3">
                <div class="d-flex align-items-start" style="max-width: 80%;">
                    <div class="card bg-primary-lt" style="border-radius: 1rem 1rem 0 1rem;">
                        <div class="card-body py-2 px-3">
                            <div class="text-muted small mb-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs me-1" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>
                                You
                            </div>
                            <div>${this.state.prompt}</div>
                        </div>
                    </div>
                    <span class="avatar avatar-sm ms-2 bg-blue">${userInitials}</span>
                </div>
            </div>
            
            <!-- AI Response Bubble -->
            <div class="d-flex mb-4">
                <span class="avatar avatar-sm me-2 bg-azure">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M18 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M6 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M18 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M8 6h8" /><path d="M8 18h8" /><path d="M6 8v8" /><path d="M18 8v8" /></svg>
                </span>
                <div style="max-width: 80%;">
                    <div class="card" style="border-radius: 1rem 1rem 1rem 0;">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon text-azure me-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M12 3l0 3" /><path d="M12 18l0 3" /><path d="M3 12l3 0" /><path d="M18 12l3 0" /></svg>
                                <span class="text-muted small">AI Analyst</span>
                            </div>
                            <div class="btn-group btn-group-sm" role="group">
                                <button type="button" class="btn ${feedback.rating === 'ThumbsUp' ? 'btn-success' : 'btn-ghost-secondary'}" 
                                    onClick=${() => this.submitFeedback('ThumbsUp')} title="Helpful">👍</button>
                                <button type="button" class="btn ${feedback.rating === 'ThumbsDown' ? 'btn-danger' : 'btn-ghost-secondary'}" 
                                    onClick=${() => this.submitFeedback('ThumbsDown')} title="Not helpful">👎</button>
                                <button type="button" class="btn btn-ghost-secondary" 
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

                ${mitigated && html`<div class="mt-4">
                    <h4>Mitigated Vulnerabilities (last 30 days)</h4>
                    <div class="d-flex gap-2 flex-wrap">
                        <span class="badge bg-azure-lt text-azure">Total mitigated: ${mitigated.Total ?? 0}</span>
                        <span class="badge bg-azure-lt text-azure">Critical: ${mitigated.Critical ?? 0}</span>
                        <span class="badge bg-azure-lt text-azure">High: ${mitigated.High ?? 0}</span>
                        <span class="badge bg-azure-lt text-azure">Medium: ${mitigated.Medium ?? 0}</span>
                        <span class="badge bg-azure-lt text-azure">Low: ${mitigated.Low ?? 0}</span>
                    </div>
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
                                        <span class="badge bg-primary-lt">${idx + 1}</span>
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
                                                <span class="badge bg-${priority === 'Critical' || priority === 'High' ? 'danger' : priority === 'Medium' ? 'warning' : 'info'}-lt ms-2">
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
                                                <span class="badge ${dev.RiskScore >= 80 ? 'bg-success-lt' : dev.RiskScore >= 50 ? 'bg-info-lt' : 'bg-danger-lt'}">
                                                    ${dev.RiskScore.toFixed(1)}
                                                </span>
                                            ` : html`<span class="text-muted">-</span>`}
                                        </td>
                                        <td>${!isStringDevice && dev.CriticalCount !== undefined ? html`<span class="badge bg-danger-lt">${dev.CriticalCount}</span>` : '-'}</td>
                                        <td>${!isStringDevice && dev.HighCount !== undefined ? html`<span class="badge bg-warning-lt">${dev.HighCount}</span>` : '-'}</td>
                                        <td>${!isStringDevice && dev.MediumCount !== undefined ? html`<span class="badge bg-info-lt">${dev.MediumCount}</span>` : '-'}</td>
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

    renderHistory() {
        const { history } = this.state;
        if (!history || history.length === 0) return null;

        return html`<div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title">Recent Investigations</h3>
                <button class="btn btn-sm btn-ghost-danger" onClick=${() => this.clearHistory()}>Clear History</button>
            </div>
            <div class="list-group list-group-flush">
                ${history.map((item, idx) => html`
                    <a href="#" class="list-group-item list-group-item-action" 
                       onClick=${(e) => { e.preventDefault(); this.handlePromptSelect(item.query); }}>
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="text-truncate me-3" title=${item.query}>${item.query}</div>
                            <small class="text-muted">${new Date(item.timestamp).toLocaleDateString()}</small>
                        </div>
                    </a>
                `)}
            </div>
        </div>`;
    }

    renderForm() {
        const { prompt, /*forceRecompute,*/ loading, polling, selectedOrgId, availableOrgs } = this.state;

        return html`<div>
            <div class="row">
                <div class="col-md-8">
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
                </div>
                <div class="col-md-4">
                    ${this.renderHistory()}
                </div>
            </div>
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
