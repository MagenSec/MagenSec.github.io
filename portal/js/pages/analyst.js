import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { SearchableOrgSwitcher } from '../components/SearchableOrgSwitcher.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { PromptSuggestions } from '../components/PromptSuggestions.js';

const { html, Component } = window;

/**
 * Inline Org Selector - Searchable dropdown for selecting organization in forms
 * Cost-effective: All orgs cached client-side, no pagination API needed
 */
class OrgSelectorInline extends Component {
    constructor(props) {
        super(props);
        this.state = {
            searchQuery: '',
            isOpen: false,
            selectedIndex: -1
        };
        this.dropdownRef = null;
        this.searchInputRef = null;
    }

    componentDidMount() {
        document.addEventListener('click', this.handleClickOutside);
    }

    componentWillUnmount() {
        document.removeEventListener('click', this.handleClickOutside);
    }

    handleClickOutside = (e) => {
        if (this.dropdownRef && !this.dropdownRef.contains(e.target)) {
            this.setState({ isOpen: false, searchQuery: '', selectedIndex: -1 });
        }
    }

    filterOrgs(query, orgs) {
        if (!query || query.trim() === '') return orgs;
        const lowerQuery = query.toLowerCase();
        return orgs.filter(org => 
            (org.name && org.name.toLowerCase().includes(lowerQuery)) ||
            (org.orgId && org.orgId.toLowerCase().includes(lowerQuery)) ||
            (org.orgName && org.orgName.toLowerCase().includes(lowerQuery)) ||
            (org.role && org.role.toLowerCase().includes(lowerQuery))
        );
    }

    handleOrgSelect = (org) => {
        if (this.props.onOrgChange) {
            this.props.onOrgChange(org.orgId);
        }
        this.setState({ isOpen: false, searchQuery: '', selectedIndex: -1 });
    }

    render() {
        const { availableOrgs, selectedOrgId } = this.props;
        const { searchQuery, isOpen, selectedIndex } = this.state;
        
        const filteredOrgs = this.filterOrgs(searchQuery, availableOrgs);
        const selectedOrg = availableOrgs.find(o => o.orgId === selectedOrgId);
        
        return html`<div class="dropdown" ref=${(el) => this.dropdownRef = el}>
            <button
                type="button"
                class="form-select text-start d-flex justify-content-between align-items-center"
                onClick=${() => this.setState({ isOpen: !isOpen })}
            >
                <span>
                    ${selectedOrg ? `${selectedOrg.orgId} - ${selectedOrg.orgName || selectedOrg.name || 'Unnamed'}` : 'Select Organization'}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
                </svg>
            </button>
            
            ${isOpen && html`<div class="dropdown-menu show" style="width: 100%; max-height: 400px; overflow-y: auto;">
                <div class="p-2 border-bottom">
                    <input
                        ref=${(el) => this.searchInputRef = el}
                        type="text"
                        value=${searchQuery}
                        onInput=${(e) => this.setState({ searchQuery: e.target.value, selectedIndex: 0 })}
                        placeholder="Search organizations..."
                        class="form-control form-control-sm"
                        autoFocus
                    />
                    <div class="text-muted small mt-1">${filteredOrgs.length} of ${availableOrgs.length} orgs</div>
                </div>
                <div>
                    ${filteredOrgs.length === 0 ? html`<div class="dropdown-item disabled text-center">No results</div>` : 
                      filteredOrgs.map((org, idx) => html`<a
                        key=${org.orgId}
                        href="javascript:void(0)"
                        onClick=${() => this.handleOrgSelect(org)}
                        class="dropdown-item ${org.orgId === selectedOrgId ? 'active' : ''} ${idx === selectedIndex ? 'bg-light' : ''}"
                    >
                        <div>${org.orgId} - ${org.orgName || org.name || 'Unnamed'}</div>
                        ${org.role && html`<small class="text-muted">${org.role}</small>`}
                    </a>`
                    )}
                </div>
            </div>`}
        </div>`;
    }
}

/**
 * AI Analyst Page - Unified prompt-driven reporting with automatic polling
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
        this.maxPollAttempts = 24; // 2 minutes (5s × 24)
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

        if (!prompt.trim()) {
            this.setState({ error: 'Prompt is required.' });
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
            
            if (response.report) {
                this.setState({ result: response, loading: false, reportId: response.reportId });
            } else if (response.reportId) {
                this.setState({ reportId: response.reportId, loading: false, polling: true });
                this.startPolling(response.reportId);
            } else {
                throw new Error('Unexpected response format');
            }
        } catch (err) {
            this.setState({ loading: false, polling: false, error: err?.message || 'Failed to call analyst.' });
        }
    }

    startPolling(reportId) {
        this.pollAttempts = 0;
        this.pollInterval = setInterval(() => this.pollReport(reportId), 5000);
        this.pollReport(reportId);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
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
        
        if (!reportId) return;

        if (rating === 'comment') {
            this.setState({ showFeedbackModal: true, feedback: { ...this.state.feedback, rating: null } });
            return;
        }

        try {
            await api.post('/api/analyst/feedback', {
                reportId: reportId,
                rating: rating,
                comment: this.state.feedback.comment || ''
            });
            this.setState({ feedback: { rating, comment: this.state.feedback.comment }, showFeedbackModal: false });
        } catch (err) {
            console.error('[AnalystPage] Feedback failed:', err);
        }
    }

    async submitFeedbackComment() {
        const { feedback, reportId } = this.state;
        
        try {
            await api.post('/api/analyst/feedback', {
                reportId: reportId,
                rating: 'Unknown',
                comment: feedback.comment
            });
            this.setState({ showFeedbackModal: false });
        } catch (err) {
            console.error('[AnalystPage] Comment failed:', err);
        }
    }

    renderMarkdown(text) {
        if (!text) return '';
        
        try {
            // Use marked.js + DOMPurify if available (preferred)
            if (window.marked && window.DOMPurify) {
                const rawHtml = window.marked.parse(text);
                const cleanHtml = window.DOMPurify.sanitize(rawHtml);
                return { __html: cleanHtml };
            }
        } catch (err) {
            console.warn('[AnalystPage] Markdown parsing failed:', err);
        }
        
        // Fallback: simple rendering
        let html = text
            .replace(/### (.*?)$/gm, '<h5>$1</h5>')
            .replace(/## (.*?)$/gm, '<h4>$1</h4>')
            .replace(/# (.*?)$/gm, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br/>');
        
        return { __html: html };
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
        const summary = report.riskSummary || {};
        const topFactors = Array.isArray(summary.topRiskFactors) ? summary.topRiskFactors.slice(0, 3) : [];
        const recommendations = Array.isArray(report.recommendations) ? report.recommendations.slice(0, 4) : [];
        const devices = Array.isArray(report.devicesAtRisk) ? report.devicesAtRisk.slice(0, 5) : [];

        return html`<div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title">${label || 'Security Report'}</h3>
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
                ${report.executiveSummary && html`<div class="alert alert-info mb-4">
                    <h4 class="alert-heading">Executive Summary</h4>
                    <div dangerouslySetInnerHTML=${this.renderMarkdown(report.executiveSummary)}></div>
                </div>`}

                ${report.charts && report.charts.length > 0 && html`<div>
                    <h4 class="mb-3">Security Overview</h4>
                    <${ChartRenderer} charts=${report.charts} />
                </div>`}

                ${topFactors.length > 0 && html`<div>
                    <h4 class="mb-3 mt-4">Top Risk Factors</h4>
                    <ul class="list-unstyled">
                        ${topFactors.map((factor, idx) => html`<li key=${idx} class="mb-2">
                            <span class="badge bg-danger me-2">${idx + 1}</span>
                            <strong>${factor.factor || factor}</strong>
                            ${factor.score && html`<span class="text-muted ms-2">(Risk Score: ${factor.score})</span>`}
                        </li>`)}
                    </ul>
                </div>`}

                ${recommendations.length > 0 && html`<div>
                    <h4 class="mb-3 mt-4">Recommendations</h4>
                    <div class="list-group list-group-flush">
                        ${recommendations.map((rec, idx) => html`<div key=${idx} class="list-group-item">
                            <div class="d-flex align-items-center">
                                <span class="badge bg-primary me-3">${idx + 1}</span>
                                <div class="flex-fill">
                                    <div>${rec.action || rec}</div>
                                    ${rec.priority && html`<small class="text-muted">Priority: ${rec.priority}</small>`}
                                </div>
                            </div>
                        </div>`)}
                    </div>
                </div>`}

                ${devices.length > 0 && html`<div>
                    <h4 class="mb-3 mt-4">Devices at Risk</h4>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Device</th><th>Risk Level</th><th>Issues</th></tr></thead>
                            <tbody>
                                ${devices.map((dev, idx) => html`<tr key=${idx}>
                                    <td><code>${dev.deviceId || dev}</code></td>
                                    <td>
                                        <span class="badge ${dev.riskLevel === 'Critical' ? 'bg-danger' : dev.riskLevel === 'High' ? 'bg-warning' : 'bg-info'}">
                                            ${dev.riskLevel || 'Unknown'}
                                        </span>
                                    </td>
                                    <td>${dev.issueCount || '-'}</td>
                                </tr>`)}
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

        if (result.reportsByOrg) {
            return html`<div>
                ${Object.entries(result.reportsByOrg).map(([orgId, report]) => 
                    this.renderReportCard(report, `Report for ${orgId}`)
                )}
            </div>`;
        }

        return html`<div>
            ${this.state.reportId && html`<div class="mb-2"><small class="text-muted">Report ID: <code>${this.state.reportId}</code></small></div>`}
            ${this.renderReportCard(result.report, 'Security Report')}
        </div>`;
    }

    renderForm() {
        const { prompt, /*forceRecompute,*/ loading, polling, selectedOrgId, availableOrgs } = this.state;

        return html`<div>
            <${PromptSuggestions} onSelectPrompt=${(p) => this.handlePromptSelect(p)} />

            <form id="analyst-form" onSubmit=${(e) => this.handleSubmit(e)} class="card mb-4">
                <div class="card-header"><h3 class="card-title">Run Analysis</h3></div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label">Organization</label>
                        ${availableOrgs.length > 10 ? html`<${OrgSelectorInline}
                            availableOrgs=${availableOrgs}
                            selectedOrgId=${selectedOrgId}
                            onOrgChange=${(orgId) => {
                                this.setState({ selectedOrgId: orgId });
                                orgContext.setCurrentOrg(orgId);
                            }}
                        />` : html`<select class="form-select" value=${selectedOrgId}
                            onChange=${(e) => {
                                const newOrgId = e.target.value;
                                this.setState({ selectedOrgId: newOrgId });
                                orgContext.setCurrentOrg(newOrgId);
                            }}>
                            ${availableOrgs.map(org => html`<option key=${org.orgId} value=${org.orgId}>
                                ${org.orgId} - ${org.orgName || org.name || 'Unnamed'} ${org.role ? `(${org.role})` : ''}
                            </option>`)}
                        </select>`}
                    </div>
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
        return html`<div class="page">
            <div class="page-wrapper">
                <div class="page-header d-print-none">
                    <div class="container-xl">
                        <div class="row g-2 align-items-center">
                            <div class="col">
                                <h2 class="page-title">AI Security Analyst</h2>
                                <div class="text-muted mt-1">Ask questions about your security posture and get AI-powered insights</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="page-body">
                    <div class="container-xl">
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
                    </div>
                </div>
            </div>
            ${this.renderFeedbackModal()}
        </div>`;
    }
}
