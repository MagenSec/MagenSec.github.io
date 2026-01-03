import { api } from '../api.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class AssetsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            assets: [],
            loading: true,
            error: null,
            searchTerm: '',
            riskFilter: 'all',
            sortColumn: 'riskScore',
            sortDirection: 'desc'
        };
    }

    async componentDidMount() {
        this.unsubscribeOrg = orgContext.onChange(() => this.loadAssets());
        await this.loadAssets();
    }

    componentWillUnmount() {
        if (this.unsubscribeOrg) {
            this.unsubscribeOrg();
        }
    }

    async loadAssets() {
        try {
            this.setState({ loading: true, error: null });
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId;
            
            if (!orgId) {
                throw new Error('No organization selected');
            }

            const response = await api.getSoftwareInventory(orgId);
            
            if (response.success) {
                // The API returns array directly in data
                const assets = Array.isArray(response.data) ? response.data : [];
                this.setState({ 
                    assets: assets, 
                    loading: false 
                });
            } else {
                throw new Error(response.message || 'Failed to load software inventory');
            }
        } catch (err) {
            console.error('Failed to load assets:', err);
            this.setState({ 
                error: err.message || 'Failed to load software inventory. Please try again.', 
                loading: false 
            });
        }
    }

    getRiskBadgeClass(risk) {
        switch (risk?.toLowerCase()) {
            case 'critical': return 'bg-danger';
            case 'high': return 'bg-warning';
            case 'medium': return 'bg-warning'; // Orange usually, but using warning for now
            case 'low': return 'bg-success';
            default: return 'bg-secondary';
        }
    }

    handleSort(column) {
        const { sortColumn, sortDirection } = this.state;
        if (sortColumn === column) {
            this.setState({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
        } else {
            this.setState({ sortColumn: column, sortDirection: 'desc' });
        }
    }

    getRiskValue(riskScore) {
        switch (riskScore?.toLowerCase()) {
            case 'critical': return 4;
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 0;
        }
    }

    render() {
        const { assets, loading, error, searchTerm, riskFilter, sortColumn, sortDirection } = this.state;

        let filteredAssets = assets.filter(asset => {
            const matchesSearch = !searchTerm || 
                asset.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                asset.vendor?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesRisk = riskFilter === 'all' || asset.riskScore?.toLowerCase() === riskFilter.toLowerCase();
            
            return matchesSearch && matchesRisk;
        });

        // Sort filtered assets
        filteredAssets = filteredAssets.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortColumn) {
                case 'deviceCount':
                    aVal = a.deviceCount || 0;
                    bVal = b.deviceCount || 0;
                    break;
                case 'cveCount':
                    aVal = a.cveCount || 0;
                    bVal = b.cveCount || 0;
                    break;
                case 'riskScore':
                    aVal = this.getRiskValue(a.riskScore);
                    bVal = this.getRiskValue(b.riskScore);
                    break;
                default:
                    return 0;
            }
            
            if (sortDirection === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        });

        if (loading) {
            return html`
                <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Application Inventory</h2>
                        </div>
                    </div>
                </div>
                <div class="empty">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="empty-title">Loading inventory...</p>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Application Inventory</h2>
                        </div>
                    </div>
                </div>
                <div class="alert alert-danger" role="alert">
                    <h4 class="alert-title">Error loading inventory</h4>
                    <div class="text-muted">${error}</div>
                    <div class="mt-2">
                        <button class="btn btn-danger" onClick=${() => this.loadAssets()}>Retry</button>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">Application Inventory</h2>
                        <div class="text-muted mt-1">${assets.length} Applications Installed</div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="d-flex">
                            <div class="me-3">
                                <div class="input-icon">
                                    <input 
                                        type="text" 
                                        class="form-control" 
                                        placeholder="Search applications..." 
                                        value=${searchTerm}
                                        onInput=${(e) => this.setState({ searchTerm: e.target.value })}
                                    />
                                    <span class="input-icon-addon">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                    </span>
                                </div>
                            </div>
                            <select class="form-select" value=${riskFilter} onChange=${(e) => this.setState({ riskFilter: e.target.value })}>
                                <option value="all">All Risks</option>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter card-table">
                        <thead>
                            <tr>
                                <th>Application</th>
                                <th>Vendor</th>
                                <th>Version</th>
                                <th class="text-center cursor-pointer" onClick=${() => this.handleSort('deviceCount')}>
                                    Installations
                                    ${sortColumn === 'deviceCount' ? html`
                                        <i class=${`ti ti-arrow-${sortDirection === 'asc' ? 'up' : 'down'} ms-1`}></i>
                                    ` : ''}
                                </th>
                                <th class="text-center cursor-pointer" onClick=${() => this.handleSort('cveCount')}>
                                    Vulnerabilities
                                    ${sortColumn === 'cveCount' ? html`
                                        <i class=${`ti ti-arrow-${sortDirection === 'asc' ? 'up' : 'down'} ms-1`}></i>
                                    ` : ''}
                                </th>
                                <th class="text-center cursor-pointer" onClick=${() => this.handleSort('riskScore')}>
                                    Risk Score
                                    ${sortColumn === 'riskScore' ? html`
                                        <i class=${`ti ti-arrow-${sortDirection === 'asc' ? 'up' : 'down'} ms-1`}></i>
                                    ` : ''}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredAssets.length === 0 ? html`
                                <tr>
                                    <td colspan="6" class="text-center py-4">
                                        <div class="empty">
                                            <div class="empty-img"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-package-off" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M8.812 4.793l3.188 -1.793l8 4.5v9m-2.282 1.784l-5.718 3.216l-8 -4.5v-9l2.223 -1.25"></path><path d="M14.543 10.57l5.457 -3.07"></path><path d="M12 12v9"></path><path d="M12 12l-8 -4.5"></path><path d="M16 5.25l-4.35 2.447m-2.564 1.442l-1.086 .611"></path><path d="M3 3l18 18"></path></svg></div>
                                            <p class="empty-title">No applications found</p>
                                            <p class="empty-subtitle text-muted">
                                                ${searchTerm || riskFilter !== 'all' ? 'Try adjusting your search or filters' : 'No software inventory data available yet'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ` : filteredAssets.map(asset => html`
                                <tr>
                                    <td>
                                        <div class="font-weight-medium">${asset.name}</div>
                                    </td>
                                    <td class="text-muted">
                                        ${asset.vendor || 'Unknown'}
                                    </td>
                                    <td class="text-muted">
                                        ${asset.version}
                                    </td>
                                    <td class="text-center">
                                        <span class="badge bg-blue-lt">${asset.deviceCount}</span>
                                    </td>
                                    <td class="text-center">
                                        ${asset.cveCount > 0 ? html`
                                            <span class="badge bg-red-lt">${asset.cveCount} CVEs</span>
                                        ` : html`
                                            <span class="text-muted">-</span>
                                        `}
                                    </td>
                                    <td class="text-center">
                                        <span class="badge ${this.getRiskBadgeClass(asset.riskScore)} text-white">
                                            ${asset.riskScore || 'Low'}
                                        </span>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}