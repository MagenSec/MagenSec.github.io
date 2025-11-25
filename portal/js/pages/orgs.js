import { auth } from '../auth.js';
import { api } from '../api.js';

const { html, Component } = window;

export class OrgsPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: null,
      orgs: []
    };
  }

  componentDidMount() {
    const user = auth.getUser();
    if (user.userType !== 'SiteAdmin') {
      this.setState({ error: 'Access denied. Site Admin role required.', loading: false });
      return;
    }
    this.loadOrgs();
  }

  async loadOrgs() {
    try {
      this.setState({ loading: true, error: null });
      const response = await api.get('/api/admin/orgs');
      
      if (response.success) {
        this.setState({ orgs: response.data || [], loading: false });
      } else {
        throw new Error(response.message || 'Failed to load organizations');
      }
    } catch (error) {
      console.error('[Orgs] Load failed:', error);
      this.setState({ error: error.message, loading: false });
    }
  }

  render() {
    const { loading, error, orgs } = this.state;

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
            <div class="col"><h2 class="page-title">Organizations (Site Admin)</h2></div>
          </div>
        </div>
      </div>
      <div class="page-body">
        <div class="container-xl">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">All Organizations</h3>
            </div>
            ${orgs.length === 0 ? html`
              <div class="card-body"><div class="empty"><p class="empty-title">No organizations found</p></div></div>
            ` : html`
              <div class="table-responsive">
                <table class="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Org ID</th>
                      <th>Org Name</th>
                      <th>Owner</th>
                      <th>Credits</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orgs.map(org => html`
                      <tr>
                        <td><code>${org.orgId}</code></td>
                        <td>${org.orgName}</td>
                        <td>${org.ownerId}</td>
                        <td>${org.remainingCredits} / ${org.totalCredits}</td>
                        <td><span class="badge ${org.isDisabled ? 'bg-danger' : 'bg-success'}">${org.isDisabled ? 'Disabled' : 'Active'}</span></td>
                        <td>${org.createdAt ? new Date(org.createdAt).toLocaleDateString() : 'N/A'}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }
}
