// Account page - User profile and session info
const { html, Component } = window;

class AccountPage extends Component {
  constructor() {
    super();
    this.state = {
      user: null,
      orgs: [],
      loading: true
    };
  }

  componentDidMount() {
    this.loadAccountInfo();
  }

  loadAccountInfo() {
    try {
      const user = auth.getUser();
      const orgs = orgContext.getOrgs();
      
      this.setState({
        user,
        orgs,
        loading: false
      });
    } catch (error) {
      console.error('[Account] Load failed:', error);
      this.setState({ loading: false });
    }
  }

  render() {
    const { user, orgs, loading } = this.state;

    if (loading) {
      return html`
        <div class="card">
          <div class="card-body text-center">
            <div class="spinner-border" role="status"></div>
          </div>
        </div>
      `;
    }

    if (!user) {
      return html`
        <div class="alert alert-danger">Not logged in</div>
      `;
    }

    return html`
      <div class="row">
        <div class="col-md-6">
          <div class="card mb-3">
            <div class="card-header"><strong>Profile</strong></div>
            <div class="card-body">
              <table class="table table-borderless">
                <tbody>
                  <tr>
                    <td><strong>Email</strong></td>
                    <td>${user.email}</td>
                  </tr>
                  <tr>
                    <td><strong>Role</strong></td>
                    <td>
                      ${(() => {
                        const currentRole = orgContext.currentOrg?.role;
                        const roleLabel = currentRole || user.userType || 'EndUser';
                        const badgeClass = roleLabel === 'SiteAdmin' ? 'bg-danger text-white'
                            : (roleLabel === 'Owner' || roleLabel === 'ReadWrite' ? 'bg-primary text-white' : 'bg-info text-white');
                        return html`<span class="badge ${badgeClass}">${roleLabel}</span>`;
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td><strong>User ID</strong></td>
                    <td><code>${user.userId || 'N/A'}</code></td>
                  </tr>
                  <tr>
                    <td><strong>Session Expiry</strong></td>
                    <td>${user.exp ? new Date(user.exp * 1000).toLocaleString() : 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><strong>Quick Links</strong></div>
            <div class="card-body">
              <div class="list-group list-group-flush">
                <a href="#/dashboard" class="list-group-item list-group-item-action">
                  <svg class="icon me-2" width="24" height="24"><use href="#tabler-dashboard"/></svg>
                  Dashboard
                </a>
                <a href="#/devices" class="list-group-item list-group-item-action">
                  <svg class="icon me-2" width="24" height="24"><use href="#tabler-device-desktop"/></svg>
                  Devices
                </a>
                <a href="#/licenses" class="list-group-item list-group-item-action">
                  <svg class="icon me-2" width="24" height="24"><use href="#tabler-key"/></svg>
                  Licenses
                </a>
                <a href="#/vulnerabilities" class="list-group-item list-group-item-action">
                  <svg class="icon me-2" width="24" height="24"><use href="#tabler-bug"/></svg>
                  Vulnerabilities
                </a>
                <a href="#/trends" class="list-group-item list-group-item-action">
                  <svg class="icon me-2" width="24" height="24"><use href="#tabler-chart-line"/></svg>
                  Trends & Analytics
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card">
            <div class="card-header"><strong>Organizations</strong></div>
            <div class="card-body">
              ${orgs.length === 0 ? html`
                <div class="text-center text-muted">No organizations</div>
              ` : html`
                <div class="list-group list-group-flush">
                  ${orgs.map(org => html`
                    <div class="list-group-item" key=${org.orgId}>
                      <div class="row align-items-center">
                        <div class="col">
                          <strong>${org.orgName}</strong>
                          <div class="text-muted small">
                            ${org.orgId}
                          </div>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-sm btn-primary" 
                              onclick=${() => { orgContext.setCurrentOrg(org); window.location.hash = '#/dashboard'; }}>
                            Switch
                          </button>
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

export { AccountPage };
