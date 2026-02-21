/**
 * UnifiedDashboard - Persona-driven security dashboard
 * Uses html`` template literals (no JSX)
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import PersonaNav from './PersonaNav.js';

const { html, Component } = window;

const PERSONA_LABELS = {
  business: 'Business Owner',
  it: 'IT Admin',
  security: 'Security Pro',
  auditor: 'Auditor'
};

function renderMarkdown(text) {
  if (!text) return '';
  let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
  return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

export default class UnifiedDashboard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      refreshing: false,
      error: null,
      refreshError: null,
      data: null,
      isRefreshingInBackground: false,
      activePersona: 'business', // business | it | security | auditor
      aiPrompt: '',
      aiAnswer: null,
      aiLoading: false,
      aiError: null
    };
  }

  componentDidMount() {
    this.loadDashboard();
  }

  getCachedDashboard(key, ttlMinutes = 30) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const ageMs = Date.now() - timestamp;
      const TTL_MS = ttlMinutes * 60 * 1000;
      const isStale = ageMs >= TTL_MS;

      return { data, isStale };
    } catch (err) {
      console.warn('[UnifiedDashboard] Cache read error:', err);
    }
    return null;
  }

  setCachedDashboard(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (err) {
      console.warn('[UnifiedDashboard] Cache write error:', err);
    }
  }

  async loadDashboard({ refresh, background } = {}) {
    try {
      const isRefresh = !!refresh;
      const isBackground = !!background;
      this.setState({
        loading: !this.state.data && !isRefresh && !isBackground,
        refreshing: isRefresh && !isBackground,
        error: null,
        refreshError: null
      });

      const user = auth.getUser();
      const currentOrg = orgContext.getCurrentOrg();
      const orgId = currentOrg?.orgId || user?.email;

      if (!orgId) {
        window.location.hash = '#!/login';
        return;
      }

      const cacheKey = `unified_dashboard_${orgId}`;

      if (!isRefresh) {
        const cached = this.getCachedDashboard(cacheKey, 30);
        if (cached?.data) {
          this.setState({
            data: cached.data,
            loading: false,
            refreshing: false,
            isRefreshingInBackground: true,
            error: null,
            refreshError: null
          });
          await this.loadDashboard({ refresh: true, background: true });
          return;
        }
      }

      let url = `/api/v1/orgs/${orgId}/dashboard?format=unified`;
      if (isRefresh && !isBackground) {
        url += '&refresh=true';
      } else {
        url += '&include=cached-summary';
      }

      const response = await api.get(url);

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dashboard');
      }

      if (response.data) {
        this.setCachedDashboard(cacheKey, response.data);
      }

      this.setState({
        data: response.data,
        loading: false,
        refreshing: false,
        isRefreshingInBackground: false
      });
    } catch (err) {
      console.error('Failed to load unified dashboard:', err);

      const message = err?.message || 'Failed to load dashboard data';
      const isRefresh = !!refresh;
      const isBackground = !!background;

      // If we already have data, keep showing it and surface a non-blocking refresh error.
      if ((isRefresh || isBackground) && this.state.data) {
        this.setState({
          refreshError: message,
          loading: false,
          refreshing: false,
          isRefreshingInBackground: false
        });
        return;
      }

      this.setState({
        error: message,
        loading: false,
        refreshing: false,
        isRefreshingInBackground: false
      });
    }
  }

  refreshDashboard = async () => {
    if (this.state.refreshing) return;
    await this.loadDashboard({ refresh: true });
  };

  handlePersonaChange = (persona) => {
    this.setState({ activePersona: persona });
    // Scroll to top of content area
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  scrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  handleAiPromptChange = (e) => {
    this.setState({ aiPrompt: e?.target?.value ?? '' });
  };

  submitAiPrompt = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const prompt = (this.state.aiPrompt || '').trim();
    if (!prompt || this.state.aiLoading) return;

    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;
    if (!orgId) return;

    this.setState({ aiLoading: true, aiAnswer: null, aiError: null });
    try {
      const response = await api.askAIAnalyst(orgId, { question: prompt });
      const data = response?.data;
      const answer = data?.answer || response?.answer || data?.response || response?.response || null;
      if (!answer) throw new Error('No answer in response');
      this.setState({
        aiAnswer: {
          question: prompt,
          answer,
          confidence: data?.confidence ?? null,
          citations: Array.isArray(data?.citations) ? data.citations : []
        },
        aiLoading: false
      });
    } catch (err) {
      this.setState({ aiError: err?.message || 'Failed to get an answer', aiLoading: false });
    }
  };

  clearAiAnswer = () => {
    this.setState({ aiAnswer: null, aiError: null });
  };

  getGradeClass(grade) {
    const gradeMap = {
      'A+': 'success', 'A': 'success', 'A-': 'success',
      'B+': 'info', 'B': 'info', 'B-': 'info',
      'C+': 'warning', 'C': 'warning', 'C-': 'warning',
      'D+': 'orange', 'D': 'orange', 'D-': 'orange',
      'F': 'danger'
    };
    return gradeMap[grade] || 'secondary';
  }

  getLicenseStatusClass(status) {
    const statusMap = {
      'Active': 'bg-success',
      'Expiring Soon': 'bg-warning',
      'Expired': 'bg-danger',
      'Disabled': 'bg-secondary'
    };
    return statusMap[status] || 'bg-secondary';
  }

  getFreshnessInfo() {
    const generatedAt = this.state.data?.generatedAt;
    if (!generatedAt) return null;

    const dt = new Date(generatedAt);
    if (isNaN(dt.getTime())) return null;

    const ageMs = Date.now() - dt.getTime();
    const ageMinutes = Math.max(0, Math.floor(ageMs / 60000));
    const ageHours = Math.floor(ageMinutes / 60);

    const isStale = ageMs > (25 * 60 * 60 * 1000);
    const ageText = ageHours >= 24
      ? `${Math.floor(ageHours / 24)}d ${ageHours % 24}h ago`
      : ageHours >= 1
        ? `${ageHours}h ${ageMinutes % 60}m ago`
        : `${ageMinutes}m ago`;

    return {
      generatedAt: dt,
      ageText,
      isStale
    };
  }

  getDeviceHealthDotClass(stats) {
    const offline = Number(stats?.devices?.offlineCount || 0);
    const total = Number(stats?.devices?.totalCount || 0);

    if (total === 0) return 'status-gray';
    if (offline <= 0) return 'status-green';
    if (offline <= 2) return 'status-yellow';
    return 'status-red';
  }

  renderRefreshBanner() {
    const { refreshing, refreshError, data, isRefreshingInBackground } = this.state;
    if (!refreshing && !refreshError && !isRefreshingInBackground) return null;
    if (!data) return null;

    if (refreshing) {
      return html`
        <div class="alert alert-info mb-4 border-0 shadow-sm rounded-3">
          <div class="d-flex align-items-center justify-content-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></div>
            <div>Updating intelligence...</div>
          </div>
        </div>
      `;
    }

    if (isRefreshingInBackground) {
      return html`
        <div class="alert alert-info mb-4 border-0 shadow-sm rounded-3">
          <div class="d-flex align-items-center justify-content-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></div>
            <div>Refreshing cached snapshot...</div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="alert alert-warning mb-4 border-0 shadow-sm rounded-3">
        <div class="d-flex align-items-center justify-content-center gap-3">
          <div>Displaying cached snapshot. ${refreshError}</div>
          <button class="btn btn-warning btn-sm btn-pill" onClick=${() => this.refreshDashboard()}>Try Again</button>
        </div>
      </div>
    `;
  }

  renderSearchHeader() {
    const { data, aiLoading, aiAnswer, aiError } = this.state;
    const score = data?.securityScore || { score: '?', grade: '-', urgentActionCount: 0 };

    return html`
      <div class="text-center mb-5 mt-4">
        <h1 class="display-4 fw-bold mb-2" style="letter-spacing: -1px;">
          <span class="text-primary">Magen</span>Sec
        </h1>
        <div class="text-muted mb-4 fs-3">Your AI Security Intelligence Partner</div>

        <div class="row justify-content-center mb-4">
          <div class="col-md-10 col-lg-8">
            <form onSubmit=${this.submitAiPrompt} class="position-relative">
              <div class="input-group input-group-lg shadow-sm rounded-pill overflow-hidden border">
                <span class="input-group-text bg-white border-0 ps-4">
                  ${aiLoading
                    ? html`<span class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>`
                    : html`<svg class="icon text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>`}
                </span>
                <input
                  type="text"
                  class="form-control border-0 shadow-none ps-2"
                  placeholder="Ask anything (e.g. 'Show active threats' or 'List Windows 11 devices')"
                  value=${this.state.aiPrompt}
                  onInput=${this.handleAiPromptChange}
                  style="min-height: 56px;"
                  autofocus
                  disabled=${aiLoading}
                />
                <button class="btn btn-white border-0 text-primary pe-4 fw-bold" type="submit" disabled=${aiLoading}>
                  ${aiLoading ? 'Analyzing…' : 'Analyze'}
                </button>
              </div>
            </form>

            ${aiLoading ? html`
              <div class="mt-3 text-center text-muted small">
                <span class="spinner-border spinner-border-sm me-2 text-primary"></span>Asking AI Analyst…
              </div>
            ` : ''}

            ${aiAnswer ? html`
              <div class="card mt-3 text-start shadow-sm border-0">
                <div class="card-body pb-2">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="d-flex align-items-center gap-2">
                      <svg class="icon text-primary" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
                      <span class="fw-semibold text-muted small">AI Analyst</span>
                      ${aiAnswer.confidence != null ? html`
                        <span class="badge bg-${aiAnswer.confidence >= 0.9 ? 'success' : aiAnswer.confidence >= 0.7 ? 'info' : 'secondary'}-lt text-${aiAnswer.confidence >= 0.9 ? 'success' : aiAnswer.confidence >= 0.7 ? 'primary' : 'muted'} small">
                          ${Math.round((aiAnswer.confidence || 0) * 100)}% confident
                        </span>
                      ` : ''}
                    </div>
                    <div class="d-flex gap-2">
                      <button
                        class="btn btn-sm btn-outline-primary"
                        onClick=${() => {
                          try {
                            sessionStorage.setItem('ai_analyst_prefill', JSON.stringify({
                              question: aiAnswer.question,
                              answer: aiAnswer.answer
                            }));
                          } catch (_) {}
                          window.location.hash = '#!/analyst';
                        }}
                      >Continue in AI Analyst →</button>
                      <button class="btn btn-sm btn-outline-secondary" onClick=${this.clearAiAnswer}>✕</button>
                    </div>
                  </div>
                  <div class="text-muted small mb-2 border-bottom pb-2">${aiAnswer.question}</div>
                  <div class="position-relative">
                    <div class="chat-markdown-content" style="max-height: 500px; overflow-y: auto; font-size: 0.9rem;" dangerouslySetInnerHTML=${{ __html: renderMarkdown(aiAnswer.answer) }}></div>
                  </div>
                  ${aiAnswer.citations?.length ? html`
                    <div class="mt-2 pt-2 border-top">
                      <span class="text-muted small">
                        <svg class="icon icon-inline me-1" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><line x1="3" y1="6" x2="3" y2="19" /><line x1="12" y1="6" x2="12" y2="19" /><line x1="21" y1="6" x2="21" y2="19" /></svg>
                        ${aiAnswer.citations.join(' · ')}
                      </span>
                    </div>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            ${aiError ? html`
              <div class="alert alert-warning mt-3 d-flex align-items-center justify-content-between">
                <span>${aiError}</span>
                <button class="btn btn-sm btn-outline-secondary ms-2" onClick=${this.clearAiAnswer}>Dismiss</button>
              </div>
            ` : ''}

            <div class="mt-4 d-flex justify-content-center gap-3 flex-wrap">
              <a class="btn btn-light btn-pill border shadow-sm px-4" href="#" onClick=${(e) => { e.preventDefault(); window.location.hash = '#!/posture'; }}>
                <span class="badge bg-${this.getGradeClass(score.grade)} me-2">Grade ${score.grade}</span> View Report
              </a>
              ${score.urgentActionCount > 0 ? html`
                <a class="btn btn-light btn-pill border shadow-sm px-4" href="#" onClick=${(e) => { e.preventDefault(); this.scrollToSection('priority'); }}>
                  <span class="badge bg-danger me-2">${score.urgentActionCount}</span> Urgent Actions
                </a>
              ` : ''}
              <button class="btn btn-light btn-pill border shadow-sm px-4" onClick=${() => this.refreshDashboard()}>
                ${this.state.refreshing
                  ? html`<span class="spinner-border spinner-border-sm me-2"></span>Refreshing`
                  : html`<svg class="icon icon-inline me-1 text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg> Refresh`}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderConfidenceTiles() {
    const { data } = this.state;
    if (!data) return null;

    const score = data.securityScore || {};
    const compliance = data.businessOwner?.complianceCard || {};
    const stats = data.quickStats || {};

    const compliancePercent = compliance.percent || 0;
    const auditReady = compliancePercent >= 80;
    const complianceColor = compliancePercent >= 80 ? 'success' : compliancePercent >= 60 ? 'warning' : 'danger';
    const dotClass = this.getDeviceHealthDotClass(stats);

    return html`
      <div class="row row-cols-2 row-cols-md-4 g-3 mb-5">
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt card-link-hover" style="cursor: pointer;" onClick=${() => window.location.hash = '#!/security'}>
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">Security Score</div>
              <div class="h2 mb-0">
                <span class="badge bg-${this.getGradeClass(score.grade)} me-1">${score.grade || '-'}</span>${score.score || 0}
              </div>
              <div class="text-muted small mt-1">
                ${score.urgentActionCount > 0
                  ? html`<span class="text-danger">${score.urgentActionCount} urgent</span>`
                  : html`<span class="text-success">No urgent actions</span>`}
              </div>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt card-link-hover" style="cursor: pointer;" onClick=${() => window.location.hash = '#!/compliance'}>
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">Compliance</div>
              <div class="h2 mb-0 text-${complianceColor}">${compliancePercent}%</div>
              <div class="progress mt-2" style="height: 4px;">
                <div class="progress-bar bg-${complianceColor}" style="width: ${compliancePercent}%"></div>
              </div>
              <div class="text-muted small mt-1">${compliance.gapDescription || 'No data yet'}</div>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt card-link-hover" style="cursor: pointer;" onClick=${() => window.location.hash = '#!/auditor'}>
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">Audit Ready</div>
              <div class="h2 mb-0">
                ${auditReady
                  ? html`<svg class="icon text-success" width="28" height="28" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`
                  : html`<svg class="icon text-warning" width="28" height="28" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>`}
              </div>
              <div class="text-muted small mt-1">
                ${auditReady ? 'Ready' : 'Not ready — score below 80%'}
              </div>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt card-link-hover" style="cursor: pointer;" onClick=${() => window.location.hash = '#!/devices'}>
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">Devices Protected</div>
              <div class="h2 mb-0">${stats.devices?.totalCount || 0}</div>
              <div class="d-flex align-items-center justify-content-center mt-1 text-muted small">
                <span class="status-dot ${dotClass} me-1"></span>
                ${stats.devices?.activeCount || 0} active
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPrioritySection() {
    const { data, activePersona } = this.state;
    if (!data) return null;

    if (activePersona === 'business') {
      const bo = data.businessOwner;
      return html`
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">Priority actions</h3>
          </div>
          <div class="card-body">
            ${bo?.topActions?.length ? bo.topActions.map((action, idx) => html`
              <div class="mb-3 pb-3 ${idx < bo.topActions.length - 1 ? 'border-bottom' : ''}">
                <div class="d-flex align-items-start">
                  <div class="me-3">
                    <span class="badge ${action.urgency === 'critical' ? 'bg-danger text-white' : action.urgency === 'high' ? 'bg-warning text-white' : 'bg-info text-white'}">
                      ${action.urgency}
                    </span>
                  </div>
                  <div class="flex-fill">
                    <div class="font-weight-medium">${action.title}</div>
                    <div class="text-muted">${action.description}</div>
                    <div class="text-muted small mt-1">${action.deadlineText || ''}</div>
                  </div>
                </div>
              </div>
            `) : html`<div class="text-muted">No urgent actions right now.</div>`}
          </div>
        </div>
      `;
    }

    if (activePersona === 'it') {
      const it = data.itAdmin;
      const hasAppRisks = it?.appRisks?.length > 0;
      return html`
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">Patch priorities</h3>
            <div class="card-options text-muted small">
              ${it?.inventory ? html`${it.inventory.totalDevices || 0} devices · ${it.inventory.totalApps || 0} apps` : ''}
            </div>
          </div>
          <div class="card-body">
            ${hasAppRisks ? html`
              <div class="table-responsive">
                <table class="table table-vcenter table-sm card-table">
                  <thead>
                    <tr>
                      <th>Application to patch</th>
                      <th class="text-center">CVEs</th>
                      <th class="text-center">KEV</th>
                      <th class="text-end">Devices affected</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${it.appRisks.slice(0, 5).map((a, i) => html`
                      <tr>
                        <td>
                          <span class="badge bg-secondary me-2">#${i + 1}</span>
                          <span class="fw-medium">${a.appName}</span>
                          ${a.version ? html`<span class="text-muted small ms-1">${a.version}</span>` : ''}
                        </td>
                        <td class="text-center"><span class="badge bg-danger-lt text-danger">${a.cveCount}</span></td>
                        <td class="text-center">${a.kevCount > 0 ? html`<span class="badge bg-orange text-white">${a.kevCount} KEV</span>` : html`<span class="text-muted">—</span>`}</td>
                        <td class="text-end text-muted">${a.deviceCount}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            ` : html`
              <div class="row g-3 text-center">
                <div class="col-4">
                  <div class="h3 mb-0 text-warning">${it?.deploymentStatus?.pendingUpdates || 0}</div>
                  <div class="text-muted small">Pending updates</div>
                </div>
                <div class="col-4">
                  <div class="h3 mb-0 text-primary">${it?.deploymentStatus?.inProgressUpdates || 0}</div>
                  <div class="text-muted small">In progress</div>
                </div>
                <div class="col-4">
                  <div class="h3 mb-0 text-success">${it?.deploymentStatus?.completedToday || 0}</div>
                  <div class="text-muted small">Completed today</div>
                </div>
              </div>
            `}
          </div>
        </div>
      `;
    }

    if (activePersona === 'auditor') {
      const bo = data.businessOwner;
      const compliancePercent = bo?.complianceCard?.percent || 0;
      const auditReady = compliancePercent >= 80;
      const complianceColor = compliancePercent >= 80 ? 'success' : compliancePercent >= 60 ? 'warning' : 'danger';
      return html`
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">Audit readiness</h3>
            <div class="card-options">
              <a href="#!/auditor" class="btn btn-sm btn-outline-secondary">Full Auditor View →</a>
            </div>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3 text-center">
                <div class="h1 mb-0 text-${complianceColor}">${compliancePercent}%</div>
                <div class="text-muted">Compliance score</div>
                <div class="progress mt-2" style="height: 6px;">
                  <div class="progress-bar bg-${complianceColor}" style="width: ${compliancePercent}%"></div>
                </div>
              </div>
              <div class="col-md-3 text-center">
                <div class="h1 mb-0 text-${auditReady ? 'success' : 'warning'}">
                  ${auditReady ? 'Ready' : 'Not Ready'}
                </div>
                <div class="text-muted">Audit status</div>
              </div>
              <div class="col-md-3 text-center">
                <div class="h1 mb-0">${bo?.riskSummary?.riskScore || '—'}</div>
                <div class="text-muted">Risk score</div>
              </div>
              <div class="col-md-3 text-center">
                <div class="h1 mb-0 text-${bo?.riskSummary?.overallRisk === 'low' ? 'success' : bo?.riskSummary?.overallRisk === 'medium' ? 'warning' : 'danger'}">
                  ${bo?.riskSummary?.overallRisk || '—'}
                </div>
                <div class="text-muted">Overall risk</div>
              </div>
            </div>
            ${bo?.complianceCard?.gapDescription ? html`
              <div class="mt-3 alert alert-${complianceColor}-lt border-0">
                ${bo.complianceCard.gapDescription}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    const sec = data.securityPro;
    const totalCves = (sec?.threatIntel?.criticalCveCount || 0) + (sec?.threatIntel?.highCveCount || 0);
    return html`
      <div class="card mb-3">
        <div class="card-header"><h3 class="card-title">Threat intelligence</h3></div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3">
              <div class="h2 mb-0">${totalCves}</div>
              <div class="text-muted">Total CVEs</div>
            </div>
            <div class="col-md-3">
              <div class="h2 mb-0 text-danger">${sec?.threatIntel?.criticalCveCount || 0}</div>
              <div class="text-muted">Critical</div>
            </div>
            <div class="col-md-3">
              <div class="h2 mb-0 text-warning">${sec?.threatIntel?.exploitCount || 0}</div>
              <div class="text-muted">KEV exploits</div>
            </div>
            <div class="col-md-3">
              <div class="h2 mb-0 text-info">${sec?.threatIntel?.highEpssCount || 0}</div>
              <div class="text-muted">High EPSS</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderExposureSection() {
    const { data, activePersona } = this.state;
    if (!data) return null;

    if (activePersona === 'business') {
      const bo = data.businessOwner;
      return html`
        <div class="row">
          <div class="col-md-4">
            <div class="card mb-3">
              <div class="card-header"><h3 class="card-title">Compliance</h3></div>
              <div class="card-body text-center">
                <div class="display-3 mb-2">${bo?.complianceCard?.percent || 0}%</div>
                <div class="text-muted">${bo?.complianceCard?.gapDescription || ''}</div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card mb-3">
              <div class="card-header"><h3 class="card-title">License</h3></div>
              <div class="card-body text-center">
                <div class="display-4 mb-2">${bo?.licenseCard?.seatsUsed || 0}/${bo?.licenseCard?.seatsTotal || 0}</div>
                <div class="progress mb-2">
                  <div class="progress-bar bg-primary" style="width: ${bo?.licenseCard?.utilizationPercent || 0}%"></div>
                </div>
                <div class="text-muted">${bo?.licenseCard?.daysRemaining || 0} days remaining</div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card mb-3">
              <div class="card-header"><h3 class="card-title">Risk summary</h3></div>
              <div class="card-body">
                <div class="d-flex align-items-center mb-2">
                  <span class="badge bg-danger text-white me-2">${bo?.riskSummary?.overallRisk || 'unknown'}</span>
                  <span class="text-muted small">Risk score: ${bo?.riskSummary?.riskScore || 0}</span>
                </div>
                ${bo?.riskSummary?.topRiskFactors?.length ? html`
                  <ul class="text-muted mb-0">
                    ${bo.riskSummary.topRiskFactors.slice(0, 3).map(f => html`<li>${f}</li>`) }
                  </ul>
                ` : html`<div class="text-muted">No risk factors available.</div>`}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (activePersona === 'it') {
      const it = data.itAdmin;
      const hasDevices = it?.deviceHealth?.length > 0;
      const hasAppRisks = it?.appRisks?.length > 0;
      return html`
        <div class="card mb-3">
          <div class="card-header"><h3 class="card-title">Operational exposure</h3></div>
          <div class="card-body">
            ${hasAppRisks ? html`
              <div class="subheader mb-2">Riskiest applications</div>
              <div class="table-responsive">
                <table class="table table-vcenter table-sm card-table">
                  <thead><tr><th>Application</th><th>CVEs</th><th>KEV</th><th>Devices</th></tr></thead>
                  <tbody>
                    ${it.appRisks.slice(0, 5).map(a => html`
                      <tr>
                        <td><span class="text-truncate d-inline-block" style="max-width:200px;">${a.appName}</span>${a.version ? html` <span class="text-muted small">${a.version}</span>` : ''}</td>
                        <td><span class="badge bg-danger-lt">${a.cveCount}</span></td>
                        <td>${a.kevCount > 0 ? html`<span class="badge bg-warning">${a.kevCount}</span>` : html`<span class="text-muted">—</span>`}</td>
                        <td>${a.deviceCount}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            ` : ''}
            ${hasDevices ? html`
              <div class="${hasAppRisks ? 'mt-3' : ''}">
                <div class="subheader mb-2">Devices needing attention</div>
                <div class="list-group list-group-flush">
                  ${it.deviceHealth.slice(0, 5).map(d => html`
                    <div class="list-group-item px-0">
                      <div class="d-flex align-items-center justify-content-between">
                        <div>
                          <div class="fw-medium">${d.deviceName || d.deviceId || 'Device'}</div>
                          <div class="text-muted small">${d.reason || (d.cveCount ? `${d.cveCount} CVEs` : '')}</div>
                        </div>
                        <span class="badge ${d.riskLevel === 'critical' || d.risk === 'critical' ? 'bg-danger' : 'bg-warning'}">${d.riskLevel || d.risk || 'at risk'}</span>
                      </div>
                    </div>
                  `)}
                </div>
              </div>
            ` : ''}
            ${!hasAppRisks && !hasDevices ? html`
              <div class="text-muted">No exposure data yet — devices may still be syncing.</div>
            ` : ''}
          </div>
        </div>
      `;
    }

    if (activePersona === 'auditor') {
      const bo = data.businessOwner;
      const compliancePercent = bo?.complianceCard?.percent || 0;
      const complianceColor = compliancePercent >= 80 ? 'success' : compliancePercent >= 60 ? 'warning' : 'danger';
      const gapCount = bo?.complianceCard?.gapCount || 0;
      return html`
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">Compliance evidence summary</h3>
            <div class="card-options">
              <a href="#!/audit" class="btn btn-sm btn-outline-secondary">Full audit log →</a>
            </div>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4 text-center">
                <div class="h1 mb-0 text-${complianceColor} fw-bold">${compliancePercent}%</div>
                <div class="progress mt-2 mb-1" style="height: 6px;">
                  <div class="progress-bar bg-${complianceColor}" style="width: ${compliancePercent}%"></div>
                </div>
                <div class="text-muted small">Compliance score</div>
              </div>
              <div class="col-md-4 text-center">
                <div class="h1 mb-0 ${gapCount > 0 ? 'text-warning' : 'text-success'} fw-bold">${gapCount}</div>
                <div class="text-muted small">Compliance gaps</div>
              </div>
              <div class="col-md-4 text-center">
                <div class="h1 mb-0 fw-bold">${bo?.riskSummary?.riskScore || '—'}</div>
                <div class="text-muted small">Risk score</div>
              </div>
            </div>
            ${bo?.complianceCard?.gapDescription ? html`
              <div class="mt-3 alert alert-${complianceColor}-lt border-0 mb-0">
                ${bo.complianceCard.gapDescription}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    const sec = data.securityPro;
    const layers = sec?.attackSurface?.layers || [];
    return html`
      <div class="card mb-3">
        <div class="card-header"><h3 class="card-title">Exposure &amp; attack surface</h3></div>
        <div class="card-body">
          <div class="row g-3 mb-${layers.length ? '3' : '0'}">
            <div class="col-4 text-center">
              <div class="h3 mb-0">${sec?.attackSurface?.exposedServices || 0}</div>
              <div class="text-muted small">Exposed services</div>
            </div>
            <div class="col-4 text-center">
              <div class="h3 mb-0 text-danger">${sec?.attackSurface?.criticalExposures || 0}</div>
              <div class="text-muted small">Critical exposures</div>
            </div>
            <div class="col-4 text-center">
              <div class="h3 mb-0">${layers.length || 0}</div>
              <div class="text-muted small">Attack layers</div>
            </div>
          </div>
          ${layers.length ? html`
            <div class="subheader mb-2">By attack layer</div>
            <div class="list-group list-group-flush">
              ${layers.map(layer => html`
                <div class="list-group-item px-0 py-2">
                  <div class="d-flex align-items-center justify-content-between">
                    <div class="fw-medium">${layer.name}</div>
                    <div class="d-flex gap-2 align-items-center">
                      <span class="text-muted small">${layer.cveCount} CVEs</span>
                      ${layer.criticalCount > 0 ? html`<span class="badge bg-danger">${layer.criticalCount} critical</span>` : ''}
                      <span class="badge bg-${layer.riskLevel === 'critical' ? 'danger' : layer.riskLevel === 'high' ? 'warning' : layer.riskLevel === 'medium' ? 'info' : 'success'}-lt">${layer.riskLevel || 'low'}</span>
                    </div>
                  </div>
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  render() {
    const { loading, error } = this.state;

    if (loading) {
      return html`
        <div class="container p-4">
          <div class="d-flex flex-column justify-content-center align-items-center" style="min-height: 60vh;">
            <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status">
              <span class="visually-hidden">Loading dashboard...</span>
            </div>
            <div class="text-muted">Loading MagenSec Intelligence...</div>
          </div>
        </div>
      `;
    }

    if (error && !this.state.data) {
      return html`
        <div class="container p-4">
          <div class="d-flex flex-column justify-content-center align-items-center" style="min-height: 50vh;">
            <div class="display-1 text-muted mb-3">:(</div>
            <h2 class="h2 mb-3">Connection Interrupted</h2>
            <p class="text-muted text-center mb-4" style="max-width: 500px;">
              We couldn't reach the intelligence engine. ${error}
            </p>
            <div class="d-flex gap-2">
              <button class="btn btn-primary btn-pill px-4" onClick=${() => this.loadDashboard()}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const freshness = this.getFreshnessInfo();

    // Google-style centered layout
    return html`
      <div class="container py-4" style="max-width: 960px; padding-bottom: 120px !important;">
        ${this.renderRefreshBanner()}
        ${this.renderSearchHeader()}

        ${freshness ? html`
          <div class="text-center text-muted small mb-4" style="margin-top: -1rem;">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline me-1" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>
            Data as of ${freshness.ageText}${freshness.isStale ? html` <span class="text-warning">(stale)</span>` : ''}
          </div>
        ` : ''}

        ${this.renderConfidenceTiles()}

        <div class="d-flex align-items-center justify-content-between mb-3 text-uppercase text-muted small fw-bold" style="letter-spacing: 0.05em;">
           <span>Insights</span>
           <span>${PERSONA_LABELS[this.state.activePersona] || this.state.activePersona} Perspective</span>
        </div>

        <div id="priority"></div>
        ${this.renderPrioritySection()}

        <div id="exposure"></div>
        ${this.renderExposureSection()}

        <${PersonaNav} activePersona=${this.state.activePersona} onPersonaChange=${this.handlePersonaChange} />
      </div>
    `;
  }
}
