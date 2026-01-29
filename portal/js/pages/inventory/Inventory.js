// Inventory page - Software Inventory with filters
const { html, Component } = window.htm;

class InventoryPage extends Component {
  constructor() {
    super();
    this.state = {
      inventory: [],
      loading: true,
      error: null,
      riskFilter: 'all',
      textFilter: ''
    };
  }

  componentDidMount() {
    this.loadInventory();
    this.applyUrlFilters();
    window.addEventListener('hashchange', this.handleHashChange);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleHashChange);
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

  handleHashChange = () => {
    const textFilter = this.getFilterFromUrl();
    if (textFilter !== this.state.textFilter) {
      this.setState({ textFilter });
    }
  };

  applyUrlFilters() {
    const textFilter = this.getFilterFromUrl();
    if (textFilter) {
      this.setState({ textFilter });
    }
  }

  getFilterFromUrl() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex < 0) return '';

    const query = hash.substring(queryIndex + 1);
    const params = new URLSearchParams(query);
    return (params.get('filter') || params.get('app') || '').trim();
  }

  parseFilterTokens(filter) {
    const criteria = { app: [], vendor: [], version: [], any: [] };
    if (!filter) return criteria;

    const tokens = filter.split('|').map(t => t.trim()).filter(Boolean);
    for (const token of tokens) {
      const [rawKey, ...rest] = token.split(':');
      const value = rest.join(':').trim();
      if (!value) {
        criteria.any.push(rawKey.toLowerCase());
        continue;
      }

      const key = rawKey.toLowerCase();
      if (key === 'app') criteria.app.push(value.toLowerCase());
      else if (key === 'vendor') criteria.vendor.push(value.toLowerCase());
      else if (key === 'version') criteria.version.push(value.toLowerCase());
      else criteria.any.push(token.toLowerCase());
    }

    return criteria;
  }

  matchesFilter(item, criteria) {
    const name = (item.name || '').toLowerCase();
    const vendor = (item.vendor || '').toLowerCase();
    const version = (item.version || '').toLowerCase();

    if (criteria.app.length && !criteria.app.some(t => name.includes(t))) return false;
    if (criteria.vendor.length && !criteria.vendor.some(t => vendor.includes(t))) return false;
    if (criteria.version.length && !criteria.version.some(t => version.includes(t))) return false;
    if (criteria.any.length && !criteria.any.some(t => name.includes(t) || vendor.includes(t) || version.includes(t))) return false;

    return true;
  }

  filterInventory() {
    const { inventory, riskFilter, textFilter } = this.state;
    const criteria = this.parseFilterTokens(textFilter);

    return inventory.filter(item => {
      const risk = item.riskScore || 'None';
      const riskMatches = riskFilter === 'all' || risk.toLowerCase() === riskFilter.toLowerCase();
      const textMatches = !textFilter || this.matchesFilter(item, criteria);
      return riskMatches && textMatches;
    });
  }

  render() {
    const { loading, error, riskFilter } = this.state;
    const filteredInventory = this.filterInventory();

    if (loading) {
      return html`
        <div class="card">
          <div class="card-body text-center py-5">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-3 text-muted">Loading software inventory...</p>
          </div>
        </div>
      `;
    }

    if (error) {
      return html`
        <div class="card">
          <div class="card-body">
            <div class="alert alert-danger alert-dismissible">
              <h4 class="alert-title">Error loading inventory</h4>
              <div class="text-secondary">${error}</div>
              <button type="button" class="btn btn-sm btn-primary mt-2" onclick=${() => this.loadInventory()}>Retry</button>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h3 class="card-title mb-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <path d="M4 8h16"/>
              <path d="M8 4v4"/>
            </svg>
            Software Inventory
          </h3>
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
                  <tr>
                    <td colspan="6" class="p-4">
                      <div class="empty">
                        <div class="empty-icon">
                          <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                            <path d="M4 8h16"/>
                            <path d="M8 4v4"/>
                          </svg>
                        </div>
                        <p class="empty-title">No software inventory</p>
                        <p class="empty-subtitle text-muted">
                          ${riskFilter === 'all' ? 'No applications found' : `No ${riskFilter} risk applications found`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ` : filteredInventory.map(item => html`
                  <tr key=${item.name}>
                    <td><strong>${item.name}</strong></td>
                    <td><code class="text-muted">${item.version}</code></td>
                    <td>${item.vendor || 'Unknown'}</td>
                    <td>
                      <span class="badge bg-blue-lt">${item.deviceCount || 0} devices</span>
                    </td>
                    <td>${item.cveCount > 0 ? html`<span class="badge bg-danger-lt text-danger">${item.cveCount} CVEs</span>` : html`<span class="text-muted">—</span>`}</td>
                    <td>
                      ${item.riskScore === 'Critical' ? html`<span class="badge bg-danger">Critical</span>` : ''}
                      ${item.riskScore === 'High' ? html`<span class="badge bg-warning">High</span>` : ''}
                      ${item.riskScore === 'Medium' ? html`<span class="badge bg-info">Medium</span>` : ''}
                      ${item.riskScore === 'Low' ? html`<span class="badge bg-success-lt">Low</span>` : ''}
                      ${!item.riskScore || item.riskScore === 'None' ? html`<span class="badge bg-secondary-lt">None</span>` : ''}
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
