import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
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
            // Backend returns 204 No Content on success
            const response = await fetch(`${config.API_BASE}/api/analyst/feedback`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${auth.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reportId: reportId,
                    rating: rating,
                    comment: this.state.feedback.comment || ''
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
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
        const summary = report.RiskSummary || {};
        const topFactors = Array.isArray(summary.TopRiskFactors) ? summary.TopRiskFactors.slice(0, 3) : [];
        const recommendations = Array.isArray(report.Recommendations) ? report.Recommendations.slice(0, 4) : [];
        const devices = Array.isArray(report.DevicesAtRisk) ? report.DevicesAtRisk.slice(0, 5) : [];

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
                ${report.ExecutiveSummary && html`<div class="alert alert-info mb-4">
                    <h4 class="alert-heading">Executive Summary</h4>
                    <div dangerouslySetInnerHTML=${this.renderMarkdown(report.ExecutiveSummary)}></div>
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
                    <h4 class="mb-3 mt-4">Recommendations</h4>
                    <div class="list-group list-group-flush">
                        ${recommendations.map((rec, idx) => html`<div key=${idx} class="list-group-item">
                            <div class="d-flex align-items-center">
                                <span class="badge bg-primary me-3">${idx + 1}</span>
                                <div class="flex-fill">
                                    <div>${typeof rec === 'string' ? rec : rec.action || rec}</div>
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
                                    <td><code>${dev.DeviceId || dev}</code></td>
                                    <td>
                                        <span class="badge ${dev.RiskScore >= 80 ? 'bg-danger' : dev.RiskScore >= 50 ? 'bg-warning' : 'bg-info'}">
                                            ${dev.RiskScore ? dev.RiskScore.toFixed(1) : 'Unknown'}
                                        </span>
                                    </td>
                                    <td>${dev.CriticalCount + dev.HighCount || '-'}</td>
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
        const user = auth.getUser();
        
        return html`<div class="page">
            <!-- Navigation Header -->
            <header class="navbar navbar-expand-md navbar-dark bg-primary">
                <div class="container-xl">
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <h1 class="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
                        <a href="#!/dashboard" onclick=${(e) => { e.preventDefault(); window.page('/dashboard'); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-white" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
                                <circle cx="12" cy="11" r="1" />
                                <line x1="12" y1="12" x2="12" y2="14.5" />
                            </svg>
                        </a>
                        <span class="text-white ms-2">MagenSec</span>
                    </h1>
                    <div class="navbar-nav flex-row order-md-last">
                        <div class="nav-item dropdown">
                            <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown" aria-label="Open user menu">
                                <span class="avatar avatar-sm" style="background-image: url(https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || user?.email || 'User')}&background=random)"></span>
                                <div class="d-none d-xl-block ps-2">
                                    <div class="text-white small">${user?.name || user?.email}</div>
                                    <div class="mt-1 small text-white-50">AI Analyst</div>
                                </div>
                            </a>
                            <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                                <a href="#!/dashboard" onclick=${(e) => { e.preventDefault(); window.page('/dashboard'); }} class="dropdown-item">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="5 12 3 12 12 3 21 12 19 12" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /></svg>
                                    Dashboard
                                </a>
                                <a href="#!/devices" onclick=${(e) => { e.preventDefault(); window.page('/devices'); }} class="dropdown-item">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                    Devices
                                </a>
                                <a href="#!/security-dashboard" onclick=${(e) => { e.preventDefault(); window.page('/security-dashboard'); }} class="dropdown-item">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><circle cx="12" cy="11" r="1" /><line x1="12" y1="12" x2="12" y2="14.5" /></svg>
                                    Security Posture
                                </a>
                                <div class="dropdown-divider"></div>
                                <a href="#" onclick=${(e) => { e.preventDefault(); auth.logout(); }} class="dropdown-item text-danger">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></svg>
                                    Logout
                                </a>
                            </div>
                        </div>
                    </div>
                    <div class="collapse navbar-collapse" id="navbar-menu">
                        <div class="d-flex flex-column flex-md-row flex-fill align-items-stretch align-items-md-center">
                            <ul class="navbar-nav">
                                <li class="nav-item">
                                    <a class="nav-link" href="#!/dashboard" onclick=${(e) => { e.preventDefault(); window.page('/dashboard'); }}>
                                        <span class="nav-link-icon d-md-none d-lg-inline-block">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="5 12 3 12 12 3 21 12 19 12" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /></svg>
                                        </span>
                                        <span class="nav-link-title">Dashboard</span>
                                    </a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" href="#!/devices" onclick=${(e) => { e.preventDefault(); window.page('/devices'); }}>
                                        <span class="nav-link-icon d-md-none d-lg-inline-block">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                        </span>
                                        <span class="nav-link-title">Devices</span>
                                    </a>
                                </li>
                                <li class="nav-item active">
                                    <a class="nav-link" href="#!/analyst" onclick=${(e) => { e.preventDefault(); window.page('/analyst'); }}>
                                        <span class="nav-link-icon d-md-none d-lg-inline-block">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8" /><path d="M10 16v4" /><path d="M14 16v4" /></svg>
                                        </span>
                                        <span class="nav-link-title">AI Analyst</span>
                                    </a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" href="#!/security-dashboard" onclick=${(e) => { e.preventDefault(); window.page('/security-dashboard'); }}>
                                        <span class="nav-link-icon d-md-none d-lg-inline-block">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><circle cx="12" cy="11" r="1" /><line x1="12" y1="12" x2="12" y2="14.5" /></svg>
                                        </span>
                                        <span class="nav-link-title">Security Posture</span>
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Content -->
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
