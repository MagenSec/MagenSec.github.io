import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class TrendsPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: null,
      trends: null,
      periodDays: 30
    };
  }

  componentDidMount() {
    this.loadTrends();
  }

  async loadTrends() {
    try {
      this.setState({ loading: true, error: null });
      
      const user = auth.getUser();
      const currentOrg = orgContext.getOrg();
      const orgId = currentOrg || user.email;

      const response = await api.get(`/api/v1/trends/${orgId}?days=${this.state.periodDays}`);
      
      if (response.success) {
        this.setState({ trends: response.data, loading: false });
      } else {
        throw new Error(response.message || 'Failed to load trends');
      }
    } catch (error) {
      console.error('[Trends] Load failed:', error);
      this.setState({ error: error.message, loading: false });
    }
  }

  getSeverityBadge(severity) {
    const map = { 'Critical': 'danger', 'High': 'warning', 'Medium': 'info', 'Low': 'secondary' };
    return map[severity] || 'secondary';
  }

  render() {
    const { loading, error, trends, periodDays } = this.state;

    if (loading) {
      return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;"><div class="spinner-border text-primary"></div></div>`;
    }

    if (error) {
      return html`<div class="alert alert-danger">${error}</div>`;
    }

    return html`
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col"><h2 class="page-title">Trends & Analytics</h2></div>
            <div class="col-auto">
              <select class="form-select" value=${periodDays} onChange=${e => { this.setState({ periodDays: parseInt(e.target.value) }); this.loadTrends(); }}>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          ${trends ? html`
            <div class="row mb-3">
              <div class="col-md-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Current Risk Score</div>
                  <div class="h1 ${trends.summary.currentRiskScore > 70 ? 'text-danger' : trends.summary.currentRiskScore > 40 ? 'text-warning' : 'text-success'}">${trends.summary.currentRiskScore}</div>
                  <div class="text-muted small">${trends.summary.riskChange > 0 ? '▲' : '▼'} ${Math.abs(trends.summary.riskChange)} from previous</div>
                </div></div>
              </div>
              <div class="col-md-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Total Detections</div>
                  <div class="h1">${trends.summary.totalDetections}</div>
                </div></div>
              </div>
              <div class="col-md-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Total Devices</div>
                  <div class="h1">${trends.summary.deviceCount}</div>
                </div></div>
              </div>
              <div class="col-md-3">
                <div class="card"><div class="card-body">
                  <div class="subheader">Period</div>
                  <div class="h1">${trends.summary.periodDays}<small> days</small></div>
                </div></div>
              </div>
            </div>

            <div class="card mb-3">
              <div class="card-header"><h3 class="card-title">Top Threats</h3></div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Threat Name</th>
                      <th>Severity</th>
                      <th>Detection Count</th>
                      <th>Affected Devices</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${trends.topThreats && trends.topThreats.length > 0 ? trends.topThreats.map(threat => html`
                      <tr>
                        <td>${threat.name}</td>
                        <td><span class="badge bg-${this.getSeverityBadge(threat.severity)}">${threat.severity}</span></td>
                        <td>${threat.count}</td>
                        <td>${threat.affectedDevices}</td>
                      </tr>
                    `) : html`<tr><td colspan="4" class="text-center text-muted">No threats detected</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          ` : html`<div class="card"><div class="card-body">No trend data available</div></div>`}
        </div>
      </div>
    `;
  }
}
