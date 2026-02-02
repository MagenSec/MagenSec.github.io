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
      error: null,
      data: null,
      activePersona: 'business', // business | it | security
      aiExpanded: false,
      aiPrompt: ''
    };
  }

  componentDidMount() {
    this.loadDashboard();
  }

  async loadDashboard() {
    try {
      this.setState({ loading: true, error: null });

      const user = auth.getUser();
      const currentOrg = orgContext.getCurrentOrg();
      const orgId = currentOrg?.orgId || user?.email;

      if (!orgId) {
        window.location.hash = '#!/login';
        return;
      }
      const response = await api.get(`/api/v1/orgs/${orgId}/dashboard?format=unified`);

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dashboard');
      }

      this.setState({
        data: response.data,
        loading: false
      });
    } catch (err) {
      console.error('Failed to load unified dashboard:', err);
      this.setState({
        error: err.message || 'Failed to load dashboard data',
        loading: false
      });
    }
  }

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

  renderHeroBanner() {
    const { data } = this.state;
    if (!data?.securityScore) return null;

    const score = data.securityScore;

    return html`
      <div class="card mb-3">
        <div class="card-body" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
          <div class="row align-items-center g-3">
            <div class="col-auto">
              <div class="display-1 fw-bold">${score.score}</div>
              <div class="text-white-50">Security Score</div>
            </div>
            <div class="col-auto">
              <span class="badge bg-${this.getGradeClass(score.grade)} text-white" style="font-size: 2rem; padding: 0.5rem 1rem;">
                ${score.grade}
              </span>
            </div>

            <div class="col">
              <form onSubmit=${this.submitAiPrompt} class="mb-3">
                <div class="input-group input-group-lg">
                  <span class="input-group-text" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.2);">
                    <svg class="icon" width="20" height="20" viewBox="0 0 24 24">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                      <circle cx="10" cy="10" r="7" />
                      <line x1="21" y1="21" x2="15" y2="15" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    class="form-control"
                    placeholder="Ask the AI Analyst: what should I fix first?"
                    value=${this.state.aiPrompt}
                    onInput=${this.handleAiPromptChange}
                    style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.2);"
                  />
                  <button class="btn btn-light" type="submit">Ask</button>
                </div>
                <div class="small text-white-50 mt-1">
                  Opens the AI Analyst workspace with your question.
                </div>
              </form>

              <div class="row g-2">
                <div class="col-md-4">
                  <div class="card bg-white bg-opacity-10 border-0">
                    <div class="card-body p-3 text-center">
                      <div class="h2 mb-0">${score.urgentActionCount || 0}</div>
                      <div class="small text-white-50">Urgent Actions</div>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card bg-white bg-opacity-10 border-0">
                    <div class="card-body p-3 text-center">
                      <div class="h2 mb-0">${score.criticalCveCount || 0}</div>
                      <div class="small text-white-50">Critical CVEs</div>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card bg-white bg-opacity-10 border-0">
                    <div class="card-body p-3 text-center">
                      <div class="h2 mb-0">${score.compliancePercent || 0}%</div>
                      <div class="small text-white-50">Compliance</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderQuickStats() {
    const { data } = this.state;
    if (!data?.quickStats) return null;

    const stats = data.quickStats;

    return html`
      <div class="row mb-3">
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Devices</div>
                <div class="ms-auto">
                  <span class="status-dot status-green d-inline-block"></span>
                </div>
              </div>
              <div class="h2 mb-0">${stats.devices?.totalCount || 0}</div>
              <div class="text-muted small">
                ${stats.devices?.activeCount || 0} active · ${stats.devices?.offlineCount || 0} offline
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Applications</div>
              </div>
              <div class="h2 mb-0">${stats.apps?.trackedCount || 0}</div>
              <div class="text-muted small">
                ${stats.apps?.vulnerableCount || 0} vulnerable
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">CVEs</div>
                ${stats.cves?.exploitCount > 0 ? html`
                  <div class="ms-auto">
                    <span class="badge bg-danger text-white">${stats.cves.exploitCount} KEV</span>
                  </div>
                ` : ''}
              </div>
              <div class="h2 mb-0">${stats.cves?.totalCount || 0}</div>
              <div class="text-muted small">
                ${stats.cves?.criticalCount || 0} critical · ${stats.cves?.highCount || 0} high
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">License</div>
                <div class="ms-auto">
                  <span class="badge bg-primary text-white">${stats.license?.licenseType || 'License'}</span>
                </div>
              </div>
              <div class="h2 mb-0">${stats.license?.seatsUsed || 0}/${stats.license?.seatsTotal || 0}</div>
              <div class="text-muted small">
                ${stats.license?.daysRemaining || 0} days remaining
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderNarrativeHeader() {
    const { activePersona } = this.state;
    const title = activePersona === 'business'
      ? 'Executive View'
      : activePersona === 'it'
        ? 'IT Operations View'
        : 'Security Operations View';

    const subtitle = activePersona === 'business'
      ? 'Decisions, risk, and ROI — in one scroll'
      : activePersona === 'it'
        ? 'Health, rollout, and remediation focus'
        : 'Threats, exploitability, and exposure focus';

    return html`
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 class="mb-1">${title}</h2>
          <div class="text-muted">${subtitle}</div>
        </div>
        <div class="d-none d-md-flex gap-2">
          <a class="btn btn-outline-secondary btn-sm" href="#" onClick=${(e) => { e.preventDefault(); this.scrollToSection('summary'); }}>Summary</a>
          <a class="btn btn-outline-secondary btn-sm" href="#" onClick=${(e) => { e.preventDefault(); this.scrollToSection('priority'); }}>Priority</a>
          <a class="btn btn-outline-secondary btn-sm" href="#" onClick=${(e) => { e.preventDefault(); this.scrollToSection('exposure'); }}>Exposure</a>
          <a class="btn btn-outline-secondary btn-sm" href="#" onClick=${(e) => { e.preventDefault(); this.scrollToSection('next'); }}>Next steps</a>
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
        <div class="container-fluid p-4">
          <div class="d-flex justify-content-center align-items-center" style="min-height: 400px;">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading dashboard...</span>
            </div>
          </div>
        </div>
      `;
    }

    if (error) {
      return html`
        <div class="container-fluid p-4">
          <div class="alert alert-danger">
            <h4 class="alert-title">Failed to load dashboard</h4>
            <p>${error}</p>
            <button class="btn btn-primary" onClick=${() => this.loadDashboard()}>
              Retry
            </button>
          </div>
        </div>
      `;
    }

    const aiCardData = this.buildAiCardData();

    return html`
      <div class="container-fluid p-4" style="padding-bottom: 100px !important;">
        <div id="summary"></div>
        ${this.renderHeroBanner()}
        ${this.renderNarrativeHeader()}
        ${this.renderQuickStats()}

        ${aiCardData ? html`
          <div class="mb-3">
            <${AiAnalystCard}
              data=${aiCardData}
              expanded=${this.state.aiExpanded}
              onToggle=${this.toggleAiExpanded}
            />
          </div>
        ` : ''}

        <div id="priority"></div>
        ${this.renderPrioritySection()}

        <div id="exposure"></div>
        ${this.renderExposureSection()}

        <div id="next"></div>
        ${this.renderNextStepsSection()}

        <${PersonaNav} activePersona=${this.state.activePersona} onPersonaChange=${this.handlePersonaChange} />
      </div>
    `;
  }
}
