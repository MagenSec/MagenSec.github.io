// Dashboard page - Overview with stats, trends, and alerts
const { html, Component } = window.htm;

class DashboardPage extends Component {
  constructor() {
    super();
    this.state = {
      stats: null,
      alerts: [],
      loading: true,
      error: null
    };
  }

  componentDidMount() {
    this.loadDashboard();
  }

  async loadDashboard() {
    try {
      this.setState({ loading: true, error: null });
      
      const currentOrg = orgContext.getCurrentOrg();
      const user = auth.getUser();
      const orgId = currentOrg?.orgId || user.email;
      
      // Load dashboard stats
      const statsResponse = await window.api.get(`/api/dashboard/${orgId}`);
      
      // Load alerts
      const alertsResponse = await window.api.get(`/api/alerts/${orgId}`);
      
      if (statsResponse.success) {
        this.setState({ 
          stats: statsResponse.data,
          alerts: alertsResponse.success ? alertsResponse.data?.slice(0, 5) || [] : [],
          loading: false 
        });
      } else {
        this.setState({ error: statsResponse.message || 'Failed to load dashboard', loading: false });
      }
    } catch (error) {
      console.error('[Dashboard] Load failed:', error);
      this.setState({ error: error.message, loading: false });
    }
  }

  render() {
    const { stats, alerts, loading, error } = this.state;

    if (loading) {
      return html`
        <div class="card">
          <div class="card-body text-center">
            <div class="spinner-border" role="status"></div>
            <p class="mt-2">Loading dashboard...</p>
          </div>
        </div>
      `;
    }

    if (error) {
      return html`
        <div class="alert alert-danger">${error}</div>
      `;
    }

    if (!stats) {
      return html`
        <div class="alert alert-info">No dashboard data available</div>
      `;
    }

    const riskScore = stats.riskScore || 0;
    const deviceCount = stats.deviceSummary?.total || 0;
    const activeDevices = stats.deviceSummary?.active || 0;
    const licenseStatus = stats.license?.status || 'Unknown';
    const alertCount = alerts.length;

    return html`
      <div class="row row-deck mb-4">
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Risk Score</div>
              </div>
              <div class="h1 mb-0">${riskScore}</div>
              <div class="text-muted">
                ${riskScore >= 80 ? 'Critical' : riskScore >= 60 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low'}
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Devices</div>
              </div>
              <div class="h1 mb-0">${deviceCount}</div>
              <div class="text-muted">${activeDevices} active</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">License</div>
              </div>
              <div class="h1 mb-0">
                ${licenseStatus === 'ACTIVE' ? html`<span class="badge bg-success">Active</span>` : 
                  licenseStatus === 'DISABLED' ? html`<span class="badge bg-warning">Disabled</span>` :
                  html`<span class="badge bg-secondary">${licenseStatus}</span>`}
              </div>
              <div class="text-muted">${stats.license?.type || 'Unknown'}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Alerts</div>
              </div>
              <div class="h1 mb-0">${alertCount}</div>
              <div class="text-muted">Recent issues</div>
            </div>
          </div>
        </div>
      </div>
      <div class="row">
        <div class="col-md-8">
          <div class="card">
            <div class="card-header"><strong>Risk Trends</strong></div>
            <div class="card-body">
              <p class="text-muted">
                View detailed trends in the <a href="#/trends">Trends & Analytics</a> page.
              </p>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card">
            <div class="card-header"><strong>Recent Alerts</strong></div>
            <div class="card-body">
              ${alerts.length === 0 ? html`
                <div class="text-center text-muted">No recent alerts</div>
              ` : html`
                <div class="list-group list-group-flush">
                  ${alerts.map(alert => html`
                    <div class="list-group-item" key=${alert.alertId}>
                      <div class="row align-items-center">
                        <div class="col">
                          <strong>${alert.alertType}</strong>
                          <div class="text-muted small">${alert.message}</div>
                        </div>
                        <div class="col-auto">
                          <span class="badge ${alert.severity === 'CRITICAL' ? 'bg-danger' : 
                            alert.severity === 'HIGH' ? 'bg-warning' : 'bg-info'}">
                            ${alert.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                  `)}
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

render(html`<${DashboardPage} />`, document.getElementById('page-root'));
