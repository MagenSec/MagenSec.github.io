/**
 * UnifiedDashboard - Persona-driven security dashboard
 * Uses html`` template literals (no JSX)
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

export default class UnifiedDashboard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: null,
      data: null,
      activePersona: 'business', // business | it | security
      aiExpanded: false
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

      console.log('[UnifiedDashboard] Loading unified dashboard for org:', orgId);
      console.log('[UnifiedDashboard] API URL:', `/api/v1/orgs/${orgId}/dashboard?format=unified`);

      const response = await api.get(`/api/v1/orgs/${orgId}/dashboard?format=unified`);
      
      console.log('[UnifiedDashboard] Response:', response);

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

  toggleAiExpanded = () => {
    this.setState({ aiExpanded: !this.state.aiExpanded });
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
          <div class="row align-items-center">
            <div class="col-auto">
              <div class="display-1 fw-bold">${score.score}</div>
              <div class="text-white-50">Security Score</div>
            </div>
            <div class="col-auto">
              <span class="badge badge-lg bg-${this.getGradeClass(score.grade)}" style="font-size: 2rem; padding: 0.5rem 1rem;">
                ${score.grade}
              </span>
            </div>
            <div class="col">
              <div class="row g-2">
                <div class="col-md-4">
                  <div class="card bg-white bg-opacity-10 border-0">
                    <div class="card-body p-3 text-center">
                      <div class="display-6">${score.urgentActionCount || 0}</div>
                      <div class="small text-white-50">Urgent Actions</div>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card bg-white bg-opacity-10 border-0">
                    <div class="card-body p-3 text-center">
                      <div class="display-6">${score.criticalCveCount || 0}</div>
                      <div class="small text-white-50">Critical CVEs</div>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card bg-white bg-opacity-10 border-0">
                    <div class="card-body p-3 text-center">
                      <div class="display-6">${score.compliancePercent || 0}%</div>
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
              <div class="h2 mb-0">${stats.device?.total || 0}</div>
              <div class="text-muted small">
                ${stats.device?.online || 0} online · ${stats.device?.critical || 0} critical
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
              <div class="h2 mb-0">${stats.app?.total || 0}</div>
              <div class="text-muted small">
                ${stats.app?.vulnerable || 0} vulnerable
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">CVEs</div>
                ${stats.cve?.kev > 0 ? html`
                  <div class="ms-auto">
                    <span class="badge bg-danger">${stats.cve.kev} KEV</span>
                  </div>
                ` : ''}
              </div>
              <div class="h2 mb-0">${stats.cve?.total || 0}</div>
              <div class="text-muted small">
                ${stats.cve?.critical || 0} critical · ${stats.cve?.high || 0} high
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
                  <span class="${this.getLicenseStatusClass(stats.license?.status)}">
                    ${stats.license?.status || 'Unknown'}
                  </span>
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

  renderBusinessOwnerView() {
    const { data } = this.state;
    if (!data?.businessOwner) return null;

    const bo = data.businessOwner;

    return html`
      <div class="row">
        <div class="col-md-8">
          <div class="card mb-3">
            <div class="card-header">
              <h3 class="card-title">Top Priority Actions</h3>
            </div>
            <div class="card-body">
              ${bo.topActions?.length ? bo.topActions.map((action, idx) => html`
                <div class="mb-3 pb-3 ${idx < bo.topActions.length - 1 ? 'border-bottom' : ''}">
                  <div class="d-flex align-items-start">
                    <div class="me-3">
                      <span class="badge ${action.urgency === 'critical' ? 'bg-danger' : action.urgency === 'high' ? 'bg-warning' : 'bg-info'}">
                        ${action.urgency}
                      </span>
                    </div>
                    <div class="flex-fill">
                      <h4 class="mb-1">${action.title}</h4>
                      <p class="text-muted mb-2">${action.description}</p>
                      <div class="d-flex align-items-center text-muted small">
                        <span class="me-3">📅 ${action.deadlineText || action.deadline}</span>
                        <span>🖥️ ${action.deviceCount} devices</span>
                      </div>
                    </div>
                  </div>
                </div>
              `) : html`<p class="text-muted">No urgent actions required</p>`}
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card mb-3">
            <div class="card-header">
              <h3 class="card-title">Compliance</h3>
            </div>
            <div class="card-body text-center">
              <div class="display-3 mb-2">${bo.complianceCard?.percent || 0}%</div>
              <div class="text-muted">${bo.complianceCard?.gapDescription || 'All compliant'}</div>
            </div>
          </div>
          <div class="card mb-3">
            <div class="card-header">
              <h3 class="card-title">License</h3>
            </div>
            <div class="card-body text-center">
              <div class="display-4 mb-2">${bo.licenseCard?.seatsUsed || 0}/${bo.licenseCard?.seatsTotal || 0}</div>
              <div class="progress mb-2">
                <div class="progress-bar" style="width: ${bo.licenseCard?.utilizationPercent || 0}%"></div>
              </div>
              <div class="text-muted">${bo.licenseCard?.daysRemaining || 0} days remaining</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderItAdminView() {
    const { data } = this.state;
    if (!data?.itAdmin) return null;

    const it = data.itAdmin;

    return html`
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">IT Admin Dashboard</h3>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6">
              <h4>Deployment Status</h4>
              <p class="text-muted">
                ${it.deploymentStatus?.pending || 0} pending · 
                ${it.deploymentStatus?.inProgress || 0} in progress · 
                ${it.deploymentStatus?.completed || 0} completed
              </p>
            </div>
            <div class="col-md-6">
              <h4>Inventory Summary</h4>
              <p class="text-muted">
                ${it.inventory?.totalApps || 0} total apps · 
                ${it.inventory?.uniqueAppCount || 0} unique vendors
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSecurityProView() {
    const { data } = this.state;
    if (!data?.securityPro) return null;

    const sec = data.securityPro;

    return html`
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Threat Intelligence</h3>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3">
              <div class="h3 mb-0">${sec.threatIntel?.totalCves || 0}</div>
              <div class="text-muted">Total CVEs</div>
            </div>
            <div class="col-md-3">
              <div class="h3 mb-0 text-danger">${sec.threatIntel?.criticalCves || 0}</div>
              <div class="text-muted">Critical</div>
            </div>
            <div class="col-md-3">
              <div class="h3 mb-0 text-warning">${sec.threatIntel?.kevCount || 0}</div>
              <div class="text-muted">KEV Exploits</div>
            </div>
            <div class="col-md-3">
              <div class="h3 mb-0 text-info">${sec.threatIntel?.epssHighRisk || 0}</div>
              <div class="text-muted">High EPSS</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPersonaContent() {
    const { activePersona } = this.state;

    switch (activePersona) {
      case 'business':
        return this.renderBusinessOwnerView();
      case 'it':
        return this.renderItAdminView();
      case 'security':
        return this.renderSecurityProView();
      default:
        return null;
    }
  }

  renderPersonaNav() {
    const { activePersona } = this.state;

    return html`
      <div class="persona-nav">
        <div class="persona-nav-inner">
          <button 
            class="persona-pill ${activePersona === 'business' ? 'active' : ''}"
            onClick=${() => this.handlePersonaChange('business')}
          >
            <span class="persona-icon">👔</span>
            <span class="persona-label">Business</span>
          </button>
          <button 
            class="persona-pill ${activePersona === 'it' ? 'active' : ''}"
            onClick=${() => this.handlePersonaChange('it')}
          >
            <span class="persona-icon">💻</span>
            <span class="persona-label">IT Admin</span>
          </button>
          <button 
            class="persona-pill ${activePersona === 'security' ? 'active' : ''}"
            onClick=${() => this.handlePersonaChange('security')}
          >
            <span class="persona-icon">🔒</span>
            <span class="persona-label">Security Pro</span>
          </button>
        </div>
      </div>
    `;
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

    return html`
      <div class="container-fluid p-4" style="padding-bottom: 100px !important;">
        ${this.renderHeroBanner()}
        ${this.renderQuickStats()}
        
        <div class="card mb-3">
          <div class="card-header">
            <h3 class="card-title">🤖 AI Security Analyst</h3>
          </div>
          <div class="card-body">
            <p class="text-muted">Chat interface coming soon...</p>
          </div>
        </div>

        <div class="mt-3">
          ${this.renderPersonaContent()}
        </div>

        ${this.renderPersonaNav()}
      </div>
    `;
  }
}
