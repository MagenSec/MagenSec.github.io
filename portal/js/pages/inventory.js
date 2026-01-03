// Inventory page - Software Inventory with filters
const { html, Component } = window.htm;

class InventoryPage extends Component {
  constructor() {
    super();
    this.state = {
      inventory: [],
      loading: true,
      error: null,
      riskFilter: 'all'
    };
  }

  componentDidMount() {
    this.loadInventory();
  }

  async loadInventory() {
    try {
      this.setState({ loading: true, error: null });
      
      const currentOrg = orgContext.getCurrentOrg();
      const user = auth.getUser();
      const orgId = currentOrg?.orgId || user.email;
      
      const response = await window.api.getSoftwareInventory(orgId);
      
      if (response.success && response.data) {
        this.setState({ inventory: response.data, loading: false });
      } else {
        this.setState({ error: response.message || 'Failed to load inventory', loading: false });
      }
    } catch (error) {
      console.error('[Inventory] Load failed:', error);
      this.setState({ error: error.message, loading: false });
    }
  }

  filterInventory() {
    const { inventory, riskFilter } = this.state;
    if (riskFilter === 'all') return inventory;
    
    return inventory.filter(item => {
      const risk = item.riskScore || 'None';
      return risk.toLowerCase() === riskFilter.toLowerCase();
    });
  }

  render() {
    const { loading, error, riskFilter } = this.state;
    const filteredInventory = this.filterInventory();

    if (loading) {
      return html`
        <div class="card">
          <div class="card-body text-center">
            <div class="spinner-border" role="status"></div>
            <p class="mt-2">Loading inventory...</p>
          </div>
        </div>
      `;
    }

    if (error) {
      return html`
        <div class="card">
          <div class="card-body">
            <div class="alert alert-danger">${error}</div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <strong>Software Inventory</strong>
          <div class="btn-group">
            <button class="btn btn-sm ${riskFilter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}" 
                    onclick=${() => this.setState({ riskFilter: 'all' })}>All</button>
            <button class="btn btn-sm ${riskFilter === 'critical' ? 'btn-danger' : 'btn-outline-secondary'}" 
                    onclick=${() => this.setState({ riskFilter: 'critical' })}>Critical</button>
            <button class="btn btn-sm ${riskFilter === 'high' ? 'btn-warning' : 'btn-outline-secondary'}" 
                    onclick=${() => this.setState({ riskFilter: 'high' })}>High</button>
            <button class="btn btn-sm ${riskFilter === 'medium' ? 'btn-info' : 'btn-outline-secondary'}" 
                    onclick=${() => this.setState({ riskFilter: 'medium' })}>Medium</button>
          </div>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-vcenter">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Version</th>
                  <th>Vendor</th>
                  <th>Devices</th>
                  <th>CVEs</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                ${filteredInventory.length === 0 ? html`
                  <tr><td colspan="6" class="text-center text-muted">No software inventory data</td></tr>
                ` : filteredInventory.map(item => html`
                  <tr key=${item.name}>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.version}</td>
                    <td>${item.vendor || 'Unknown'}</td>
                    <td>${item.deviceCount || 0}</td>
                    <td>${item.cveCount > 0 ? html`<span class="badge bg-danger">${item.cveCount}</span>` : '-'}</td>
                    <td>
                      ${item.riskScore === 'Critical' ? html`<span class="badge bg-danger">Critical</span>` : ''}
                      ${item.riskScore === 'High' ? html`<span class="badge bg-warning">High</span>` : ''}
                      ${item.riskScore === 'Medium' ? html`<span class="badge bg-info">Medium</span>` : ''}
                      ${item.riskScore === 'Low' ? html`<span class="badge bg-green-lt">Low</span>` : ''}
                      ${!item.riskScore || item.riskScore === 'None' ? html`<span class="badge bg-secondary">None</span>` : ''}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
}

render(html`<${InventoryPage} />`, document.getElementById('page-root'));
