import { api } from '../api.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class AlertsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            alerts: [],
            loading: true,
            error: null,
            filter: 'all' // all, high, medium, low
        };
    }

    async componentDidMount() {
        await this.loadAlerts();
    }

    async loadAlerts() {
        try {
            this.setState({ loading: true, error: null });
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId;
            
            if (!orgId) {
                throw new Error('No organization selected');
            }

            // Use the new API method
            const alerts = await api.getSecurityDetections(orgId);
            
            this.setState({ 
                alerts: alerts || [], 
                loading: false 
            });
        } catch (err) {
            console.error('Failed to load alerts:', err);
            this.setState({ 
                error: err.message || 'Failed to load security alerts. Please try again.', 
                loading: false 
            });
        }
    }

    getSeverityClass(severity) {
        switch(severity?.toLowerCase()) {
            case 'critical': return 'badge-critical';
            case 'high': return 'badge-high';
            case 'medium': return 'badge-medium';
            case 'low': return 'badge-low';
            default: return 'badge-info';
        }
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    }

    render() {
        const { alerts, loading, error, filter } = this.state;

        const filteredAlerts = filter === 'all' 
            ? alerts 
            : alerts.filter(a => a.severity?.toLowerCase() === filter);

        if (loading) {
            return html`
                <div class="page-header">
                    <h2>Security Alerts</h2>
                </div>
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading security alerts...</p>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="page-header">
                    <h2>Security Alerts</h2>
                </div>
                <div class="error-state">
                    <p>${error}</p>
                    <button class="btn btn-primary" onClick=${() => this.loadAlerts()}>Retry</button>
                </div>
            `;
        }

        return html`
            <div class="alerts-page">
                <div class="page-header">
                    <div class="header-title">
                        <h2>Security Alerts</h2>
                        <span class="badge badge-neutral">${alerts.length} Total</span>
                    </div>
                    <div class="header-actions">
                        <div class="filter-group">
                            <select 
                                class="form-select" 
                                value=${filter} 
                                onChange=${(e) => this.setState({ filter: e.target.value })}
                            >
                                <option value="all">All Severities</option>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                        <button class="btn btn-secondary" onClick=${() => this.loadAlerts()}>
                            <i class="icon-refresh"></i> Refresh
                        </button>
                    </div>
                </div>

                ${filteredAlerts.length === 0 ? html`
                    <div class="empty-state">
                        <div class="empty-icon">🛡️</div>
                        <h3>No Alerts Found</h3>
                        <p>Great job! No security alerts detected for the selected filter.</p>
                    </div>
                ` : html`
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Severity</th>
                                    <th>Alert Name</th>
                                    <th>Device</th>
                                    <th>Detected At</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredAlerts.map(alert => html`
                                    <tr>
                                        <td>
                                            <span class="badge ${this.getSeverityClass(alert.severity)}">
                                                ${alert.severity || 'Unknown'}
                                            </span>
                                        </td>
                                        <td>
                                            <div class="alert-name">${alert.title || 'Security Alert'}</div>
                                            <div class="alert-desc">${alert.description}</div>
                                        </td>
                                        <td>
                                            <a href="/devices/${alert.deviceId}" class="device-link">
                                                ${alert.deviceName || alert.deviceId}
                                            </a>
                                        </td>
                                        <td>${this.formatDate(alert.timestamp)}</td>
                                        <td>
                                            <span class="status-text ${alert.status?.toLowerCase()}">
                                                ${alert.status || 'Active'}
                                            </span>
                                        </td>
                                        <td>
                                            <button class="btn btn-sm btn-outline" title="View Details">
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    }
}