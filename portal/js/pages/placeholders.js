// Simple placeholder pages that follow the portal render pattern
const { html, Component } = window;

export class PosturePage extends Component {
  render() {
    return html`
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">Security Posture</h2>
              <div class="text-muted">Coming soon</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card"><div class="card-body">This page is under construction.</div></div>
    `;
  }
}

export class InventoryPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Inventory: Coming soon</div></div>`;
  }
}

export class OrgsPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Organizations: Coming soon</div></div>`;
  }
}

export class AccountPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Account: Coming soon</div></div>`;
  }
}

export class SoftwareInventoryPage extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, software: [], error: null };
  }

  async componentDidMount() {
    const { orgContext, api } = window;
    const orgId = orgContext.getOrg();
    if (!orgId) return;

    try {
      const result = await api.getSoftwareInventory(orgId);
      if (result.success) {
        this.setState({ software: result.data, loading: false });
      } else {
        this.setState({ error: result.message, loading: false });
      }
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  }

  render() {
    const { loading, software, error } = this.state;

    return html`
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col"><h2 class="page-title">Software Inventory</h2></div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          ${loading ? html`<div class="card"><div class="card-body">Loading...</div></div>` : ''}
          ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}
          ${!loading && !error && software.length === 0 ? html`
            <div class="empty">
              <div class="empty-icon"><svg class="icon" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-apps" /></svg></div>
              <p class="empty-title">No software found</p>
            </div>
          ` : ''}
          ${!loading && !error && software.length > 0 ? html`
            <div class="card">
              <div class="table-responsive">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Version</th>
                      <th>Vendor</th>
                      <th>Installations</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${software.map(app => html`
                      <tr>
                        <td>${app.name}</td>
                        <td>${app.version}</td>
                        <td>${app.vendor}</td>
                        <td>${app.deviceCount}</td>
                        <td><span class="badge bg-${app.riskScore === 'High' ? 'danger' : app.riskScore === 'Medium' ? 'warning' : 'success'} text-white">${app.riskScore || 'Low'}</span></td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}

export class HardwareInventoryPage extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, hardware: [], error: null };
  }

  async componentDidMount() {
    const { orgContext, api } = window;
    const orgId = orgContext.getOrg();
    if (!orgId) return;

    try {
      const result = await api.getHardwareInventory(orgId);
      if (result.success) {
        this.setState({ hardware: result.data, loading: false });
      } else {
        this.setState({ error: result.message, loading: false });
      }
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  }

  render() {
    const { loading, hardware, error } = this.state;

    return html`
      <div class="page-header d-print-none mb-3">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="5" y="5" width="14" height="14" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /><line x1="3" y1="10" x2="5" y2="10" /><line x1="3" y1="14" x2="5" y2="14" /><line x1="10" y1="3" x2="10" y2="5" /><line x1="14" y1="3" x2="14" y2="5" /><line x1="19" y1="10" x2="21" y2="10" /><line x1="19" y1="14" x2="21" y2="14" /><line x1="10" y1="19" x2="10" y2="21" /><line x1="14" y1="19" x2="14" y2="21" /></svg>
                Hardware Inventory
              </h2>
              <div class="page-subtitle">
                <span class="text-muted">View device hardware specifications and configurations</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          ${loading ? html`<div class="card"><div class="card-body">Loading...</div></div>` : ''}
          ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}
          ${!loading && !error && hardware.length === 0 ? html`
            <div class="empty">
              <div class="empty-icon"><svg class="icon" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-cpu" /></svg></div>
              <p class="empty-title">No hardware data found</p>
            </div>
          ` : ''}
          ${!loading && !error && hardware.length > 0 ? html`
            <div class="card">
              <div class="table-responsive">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>CPU</th>
                      <th>RAM (GB)</th>
                      <th>Disk (GB)</th>
                      <th>OS Version</th>
                      <th>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${hardware.map(hw => html`
                      <tr>
                        <td>${hw.deviceName}</td>
                        <td>${hw.cpuModel}</td>
                        <td>${hw.ramGB}</td>
                        <td>${hw.diskGB}</td>
                        <td>${hw.osVersion}</td>
                        <td>${hw.lastSeen}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}

export class ComplianceReportPage extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, report: null, error: null, framework: 'CIS' };
  }

  async componentDidMount() {
    await this.loadReport();
  }

  async loadReport() {
    const { orgContext, api } = window;
    const orgId = orgContext.getOrg();
    if (!orgId) return;

    this.setState({ loading: true });
    try {
      const result = await api.get(`/api/v1/orgs/${orgId}/reports/compliance?framework=${this.state.framework}`);
      if (result.success) {
        this.setState({ report: result.data, loading: false });
      } else {
        this.setState({ error: result.message, loading: false });
      }
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  }

  async onFrameworkChange(e) {
    await this.setState({ framework: e.target.value });
    await this.loadReport();
  }

  render() {
    const { loading, report, error, framework } = this.state;

    return html`
      <div class="page-header d-print-none mb-3">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 12l2 2l4 -4" /><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>
                Compliance Reports
              </h2>
              <div class="page-subtitle">
                <span class="text-muted">Assess compliance against security frameworks</span>
              </div>
            </div>
            <div class="col-auto">
              <select class="form-select" value=${framework} onChange=${e => this.onFrameworkChange(e)}>
                <option value="CIS">CIS Controls</option>
                <option value="NIST">NIST CSF</option>
                <option value="PCI">PCI-DSS</option>
                <option value="HIPAA">HIPAA</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          ${loading ? html`<div class="card"><div class="card-body">Loading...</div></div>` : ''}
          ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}
          ${!loading && !error && report ? html`
            <div class="row mb-3">
              <div class="col-md-6 col-xl-3">
                <div class="card">
                  <div class="card-body">
                    <div class="d-flex align-items-center">
                      <div class="subheader">Overall Score</div>
                    </div>
                    <div class="h1 mb-0">${report.overallScore}%</div>
                    <div class="progress progress-sm mt-2">
                      <div class="progress-bar ${report.overallScore >= 80 ? 'bg-success' : report.overallScore >= 50 ? 'bg-warning' : 'bg-danger'}" 
                           style="width: ${report.overallScore}%" />
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-md-6 col-xl-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Passed Checks</div>
                  <div class="h1 mb-0 text-success">${report.passedChecks}</div>
                </div></div>
              </div>
              <div class="col-md-6 col-xl-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Failed Checks</div>
                  <div class="h1 mb-0 text-danger">${report.failedChecks}</div>
                </div></div>
              </div>
              <div class="col-md-6 col-xl-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Total Checks</div>
                  <div class="h1 mb-0">${report.totalChecks}</div>
                </div></div>
              </div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">${framework} Requirements</h3></div>
              <div class="list-group list-group-flush">
                ${report.checks.map(check => html`
                  <div class="list-group-item">
                    <div class="row align-items-center">
                      <div class="col-auto">
                        <span class="badge ${check.passed ? 'bg-success' : 'bg-danger'}">
                          ${check.passed ? '✓' : '✗'}
                        </span>
                      </div>
                      <div class="col">
                        <strong>${check.controlId}</strong>: ${check.description}
                        ${!check.passed ? html`<div class="text-secondary mt-1">${check.remediationAdvice}</div>` : ''}
                      </div>
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
}

export class AlertsPage extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, alerts: [], error: null, severity: 'all' };
  }

  async componentDidMount() {
    await this.loadAlerts();
  }

  async loadAlerts() {
    const { orgContext, api } = window;
    const orgId = orgContext.getOrg();
    if (!orgId) return;

    this.setState({ loading: true });
    try {
      const query = this.state.severity !== 'all' ? `?severity=${this.state.severity}` : '';
      const result = await api.get(`/api/v1/orgs/${orgId}/alerts${query}`);
      if (result.success) {
        this.setState({ alerts: result.data.alerts, loading: false });
      } else {
        this.setState({ error: result.message, loading: false });
      }
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  }

  async onSeverityChange(e) {
    await this.setState({ severity: e.target.value });
    await this.loadAlerts();
  }

  getSeverityBadge(severity) {
    const badges = {
      Critical: 'bg-danger',
      High: 'bg-warning',
      Medium: 'bg-info',
      Low: 'bg-secondary'
    };
    return badges[severity] || 'bg-secondary';
  }

  render() {
    const { loading, alerts, error, severity } = this.state;

    return html`
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">Alerts & Notifications</h2>
            </div>
            <div class="col-auto">
              <select class="form-select" value=${severity} onChange=${e => this.onSeverityChange(e)}>
                <option value="all">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          ${loading ? html`<div class="card"><div class="card-body">Loading...</div></div>` : ''}
          ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}
          ${!loading && !error && alerts.length === 0 ? html`
            <div class="empty">
              <div class="empty-icon"><svg class="icon" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-bell" /></svg></div>
              <p class="empty-title">No alerts found</p>
            </div>
          ` : ''}
          ${!loading && !error && alerts.length > 0 ? html`
            <div class="card">
              <div class="list-group list-group-flush">
                ${alerts.map(alert => html`
                  <div class="list-group-item">
                    <div class="row align-items-center">
                      <div class="col-auto">
                        <span class="badge ${this.getSeverityBadge(alert.severity)}">
                          ${alert.severity}
                        </span>
                      </div>
                      <div class="col">
                        <strong>${alert.title}</strong>
                        <div class="text-secondary mt-1">${alert.message}</div>
                        <div class="text-muted small mt-1">
                          Device: ${alert.deviceId} • ${alert.timestamp}
                        </div>
                      </div>
                      <div class="col-auto">
                        ${alert.acknowledged ? html`
                          <span class="badge bg-success-lt">Acknowledged</span>
                        ` : html`
                          <button class="btn btn-sm btn-primary">Acknowledge</button>
                        `}
                      </div>
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
}

export class PlatformInsightsPage extends Component {
  constructor(props) {
    super(props);
    this.state = { loading: true, insights: null, error: null };
  }

  async componentDidMount() {
    const { api } = window;
    
    // Site Admin check
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'SiteAdmin') {
      this.setState({ error: 'Access denied. Site Admin role required.', loading: false });
      return;
    }

    try {
      const result = await api.get('/api/v1/admin/platform/insights');
      if (result.success) {
        this.setState({ insights: result.data, loading: false });
      } else {
        this.setState({ error: result.message, loading: false });
      }
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  }

  render() {
    const { loading, insights, error } = this.state;

    return html`
      <div class="page-header d-print-none mb-3">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="12" width="6" height="8" rx="1" /><rect x="9" y="8" width="6" height="12" rx="1" /><rect x="15" y="4" width="6" height="16" rx="1" /><line x1="4" y1="20" x2="18" y2="20" /></svg>
                Platform Insights
              </h2>
              <div class="page-subtitle">
                <span class="text-muted">System-wide analytics and performance metrics</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          ${loading ? html`<div class="card"><div class="card-body">Loading...</div></div>` : ''}
          ${error ? html`<div class="alert alert-danger">${error}</div>` : ''}
          ${!loading && !error && insights ? html`
            <div class="row mb-3">
              <div class="col-md-6 col-xl-3">
                <div class="card">
                  <div class="card-body">
                    <div class="d-flex align-items-center">
                      <div class="subheader">Total Organizations</div>
                    </div>
                    <div class="d-flex align-items-baseline">
                      <div class="h1 mb-0 me-2">${insights.totalOrgs}</div>
                      <div class="text-success">
                        <svg class="icon" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-trending-up" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-md-6 col-xl-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Total Devices</div>
                    <div class="h1 mb-0">${insights.totalDevices}</div>
                    <div class="text-muted small">${insights.activeDevices} active</div>
                  </div>
                </div>
              </div>
              <div class="col-md-6 col-xl-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Total Users</div>
                    <div class="h1 mb-0">${insights.totalUsers}</div>
                  </div>
                </div>
              </div>
              <div class="col-md-6 col-xl-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Monthly Profitability</div>
                    <div class="h1 mb-0 ${insights.profitMargin >= 0 ? 'text-success' : 'text-danger'}">
                      ${insights.profitMargin}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header"><h3 class="card-title">Revenue Analysis</h3></div>
                  <div class="card-body">
                    <div class="row">
                      <div class="col-6">
                        <div class="subheader">Monthly Revenue</div>
                        <div class="h2 mb-3">$${insights.estimatedMonthlyRevenue.toFixed(2)}</div>
                      </div>
                      <div class="col-6">
                        <div class="subheader">Average per Org</div>
                        <div class="h2 mb-3">$${insights.avgRevenuePerOrg.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header"><h3 class="card-title">Azure Costs</h3></div>
                  <div class="card-body">
                    <div class="row">
                      <div class="col-6">
                        <div class="subheader">Monthly Cost</div>
                        <div class="h2 mb-3 text-danger">$${insights.estimatedAzureCost.toFixed(2)}</div>
                      </div>
                      <div class="col-6">
                        <div class="subheader">Cost per Device</div>
                        <div class="h2 mb-3">$${insights.costPerDevice.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">Growth Trends</h3></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4">
                    <div class="subheader">New Orgs (30d)</div>
                    <div class="h3">${insights.newOrgsLast30Days || 'N/A'}</div>
                  </div>
                  <div class="col-md-4">
                    <div class="subheader">New Devices (30d)</div>
                    <div class="h3">${insights.newDevicesLast30Days || 'N/A'}</div>
                  </div>
                  <div class="col-md-4">
                    <div class="subheader">Churn Rate</div>
                    <div class="h3">${insights.churnRate || '0'}%</div>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}
