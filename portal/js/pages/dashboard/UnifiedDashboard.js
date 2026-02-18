/**
 * UnifiedDashboard - Persona-driven security dashboard
 * Uses html`` template literals (no JSX)
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import PersonaNav from './PersonaNav.js';
import AiAnalystCard from './AiAnalystCard.js';

const { html, Component } = window;

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
      activePersona: 'business', // business | it | security
      aiExpanded: false,
      aiPrompt: ''
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

      if (isStale) {
        console.log(`[UnifiedDashboard] 📦 Cache HIT (STALE): ${key} (age: ${Math.round(ageMs / 1000)}s)`);
      } else {
        console.log(`[UnifiedDashboard] 📦 Cache HIT (FRESH): ${key} (age: ${Math.round(ageMs / 1000)}s)`);
      }
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

  toggleAiExpanded = () => {
    this.setState({ aiExpanded: !this.state.aiExpanded });
  };

  handleAiPromptChange = (e) => {
    this.setState({ aiPrompt: e?.target?.value ?? '' });
  };

  submitAiPrompt = (e) => {
    if (e?.preventDefault) e.preventDefault();
    const prompt = (this.state.aiPrompt || '').trim();
    if (!prompt) return;
    window.location.hash = `#!/analyst?q=${encodeURIComponent(prompt)}`;
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
    const { data } = this.state;
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
                  <svg class="icon text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                </span>
                <input
                  type="text"
                  class="form-control border-0 shadow-none ps-2"
                  placeholder="Ask anything (e.g. 'Show active threats' or 'List Windows 11 devices')"
                  value=${this.state.aiPrompt}
                  onInput=${this.handleAiPromptChange}
                  style="min-height: 56px;"
                  autofocus
                />
                <button class="btn btn-white border-0 text-primary pe-4 fw-bold" type="submit">
                  Analyze
                </button>
              </div>
            </form>
            <div class="mt-4 d-flex justify-content-center gap-3 flex-wrap">
              <button class="btn btn-light btn-pill border shadow-sm px-4" onClick=${() => this.refreshDashboard()}>
                ${this.state.refreshing 
                  ? html`<span class="spinner-border spinner-border-sm me-2"></span>Refreshing`
                  : html`<svg class="icon icon-inline me-1 text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg> Refresh Intelligence`}
              </button>
              <a class="btn btn-light btn-pill border shadow-sm px-4" href="#" onClick=${(e) => { e.preventDefault(); window.location.hash = '#!/posture'; }}>
                <span class="badge bg-${this.getGradeClass(score.grade)} me-2">Grade ${score.grade}</span> View Report
              </a>
              ${score.urgentActionCount > 0 ? html`
                <a class="btn btn-light btn-pill border shadow-sm px-4" href="#" onClick=${(e) => { e.preventDefault(); this.scrollToSection('priority'); }}>
                  <span class="badge bg-danger me-2">${score.urgentActionCount}</span> Urgent Actions
                </a>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderMinimalStats() {
    const { data } = this.state;
    if (!data?.quickStats) return null;

    const stats = data.quickStats;
    const dotClass = this.getDeviceHealthDotClass(stats);

    // Google-style "knowledge panel" cards
    return html`
      <div class="row row-cols-2 row-cols-md-4 g-3 mb-5">
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt card-link-hover" style="cursor: pointer;" onClick=${() => window.location.hash = '#!/devices'}>
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">Devices</div>
              <div class="h2 mb-0">${stats.devices?.totalCount || 0}</div>
              <div class="d-flex align-items-center justify-content-center mt-1 text-muted small">
                <span class="status-dot ${dotClass} me-1"></span>
                ${stats.devices?.activeCount || 0} active
              </div>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt">
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">Apps</div>
              <div class="h2 mb-0">${stats.apps?.trackedCount || 0}</div>
              <div class="text-danger small mt-1">
                ${stats.apps?.vulnerableCount || 0} vulnerable
              </div>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt">
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">CVEs</div>
              <div class="h2 mb-0">${stats.cves?.totalCount || 0}</div>
              <div class="d-flex align-items-center justify-content-center mt-1 gap-2">
                ${stats.cves?.exploitCount > 0 
                  ? html`<span class="badge bg-danger-lt">${stats.cves.exploitCount} KEV</span>` 
                  : html`<span class="text-muted small">No KEVs</span>`}
              </div>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card h-100 border-0 shadow-sm bg-light-lt">
            <div class="card-body text-center p-3">
              <div class="text-muted text-uppercase small fw-bold mb-1">License</div>
              <div class="h2 mb-0">${stats.license?.seatsUsed || 0}</div>
              <div class="text-muted small mt-1">
                of ${stats.license?.seatsTotal || 0} used
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
      return html`
        <div class="row">
          <div class="col-md-6">
            <div class="card mb-3">
              <div class="card-header"><h3 class="card-title">Deployment status</h3></div>
              <div class="card-body">
                <div class="text-muted">
                  ${it?.deploymentStatus?.pendingUpdates || 0} pending ·
                  ${it?.deploymentStatus?.inProgressUpdates || 0} in progress ·
                  ${it?.deploymentStatus?.completedToday || 0} completed today
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card mb-3">
              <div class="card-header"><h3 class="card-title">Inventory summary</h3></div>
              <div class="card-body">
                <div class="text-muted">
                  ${it?.inventory?.totalDevices || 0} devices ·
                  ${it?.inventory?.totalApps || 0} apps ·
                  ${it?.inventory?.uniqueAppCount || 0} vendors
                </div>
              </div>
            </div>
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
      return html`
        <div class="card mb-3">
          <div class="card-header"><h3 class="card-title">Operational exposure</h3></div>
          <div class="card-body">
            <div class="text-muted">
              Snapshot-backed Top-N device/app risk lists appear here when available.
            </div>
            ${it?.deviceHealth?.length ? html`
              <div class="mt-3">
                <div class="subheader mb-2">Devices needing attention</div>
                <div class="list-group">
                  ${it.deviceHealth.slice(0, 5).map(d => html`
                    <div class="list-group-item">
                      <div class="d-flex align-items-center justify-content-between">
                        <div>
                          <div class="font-weight-medium">${d.deviceName || d.deviceId || 'Device'}</div>
                          <div class="text-muted small">${d.reason || ''}</div>
                        </div>
                        <span class="badge bg-warning text-white">${d.risk || d.riskLevel || 'risk'}</span>
                      </div>
                    </div>
                  `)}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    const sec = data.securityPro;
    return html`
      <div class="card mb-3">
        <div class="card-header"><h3 class="card-title">Exposure & attack surface</h3></div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-4">
              <div class="h2 mb-0">${sec?.attackSurface?.exposedServices || 0}</div>
              <div class="text-muted">Exposed services</div>
            </div>
            <div class="col-md-4">
              <div class="h2 mb-0 text-danger">${sec?.attackSurface?.criticalExposures || 0}</div>
              <div class="text-muted">Critical exposures</div>
            </div>
            <div class="col-md-4">
              <div class="h2 mb-0">${sec?.attackSurface?.layers?.length || 0}</div>
              <div class="text-muted">Attack layers tracked</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderNextStepsSection() {
    return html`
      <div class="card mb-3">
        <div class="card-header"><h3 class="card-title">Next steps</h3></div>
        <div class="card-body">
          <div class="d-flex flex-wrap gap-2">
            <a class="btn btn-primary" href="#" onClick=${(e) => { e.preventDefault(); window.location.hash = '#!/posture'; }}>
              Open posture snapshot
            </a>
            <a class="btn btn-outline-primary" href="#" onClick=${(e) => { e.preventDefault(); window.location.hash = '#!/devices'; }}>
              Review devices
            </a>
            <a class="btn btn-outline-secondary" href="#" onClick=${(e) => { e.preventDefault(); window.location.hash = '#!/analyst'; }}>
              Ask the AI Analyst
            </a>
          </div>
          <div class="text-muted mt-2">
            Tip: switch persona below to reframe the same data.
          </div>
        </div>
      </div>
    `;
  }

  buildAiCardData() {
    const ai = this.state.data?.aiContext;
    if (!ai) return null;

    const quick = this.state.data?.quickStats;
    const score = this.state.data?.securityScore;

    return {
      orgSummary: ai.orgSummary,
      topConcerns: ai.topConcerns,
      suggestedQueries: ai.suggestedQueries,
      metricsForAi: {
        totalDevices: quick?.devices?.totalCount,
        totalCves: quick?.cves?.totalCount,
        kevCount: quick?.cves?.exploitCount,
        securityScore: score?.score,
        maxScore: 100
      }
    };
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

    const aiCardData = this.buildAiCardData();

    // Google-style centered layout
    return html`
      <div class="container py-4" style="max-width: 960px; padding-bottom: 120px !important;">
        ${this.renderRefreshBanner()}
        ${this.renderSearchHeader()}
        ${this.renderMinimalStats()}

        ${aiCardData ? html`
          <div class="mb-4">
            <${AiAnalystCard}
              data=${aiCardData}
              expanded=${this.state.aiExpanded}
              onToggle=${this.toggleAiExpanded}
            />
          </div>
        ` : ''}

        <div class="d-flex align-items-center justify-content-between mb-3 text-uppercase text-muted small fw-bold tracking-wide">
           <span>Insights</span>
           <span>${this.state.activePersona} Perspective</span>
        </div>

        <div id="priority"></div>
        ${this.renderPrioritySection()}

        <div id="exposure"></div>
        ${this.renderExposureSection()}

        <div id="next"></div>
        ${this.renderNextStepsSection()}

        ${/* Persona Nav stays fixed at bottom or as minimal footer */ ''}
        <${PersonaNav} activePersona=${this.state.activePersona} onPersonaChange=${this.handlePersonaChange} />
      </div>
    `;
  }
}
