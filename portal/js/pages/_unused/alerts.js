import { api } from '@api';
import { orgContext } from '@orgContext';

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
                <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Security Alerts</h2>
                            <div class="page-subtitle">
                                <div class="d-flex gap-2 flex-wrap">
                                    <span class="badge bg-danger text-white">${alerts.filter(a => a.severity?.toLowerCase() === 'critical').length} Critical</span>
                                    <span class="badge bg-warning text-white">${alerts.filter(a => a.severity?.toLowerCase() === 'high').length} High</span>
                                    <span class="badge bg-info text-white">${alerts.filter(a => a.severity?.toLowerCase() === 'medium').length} Medium</span>
                                    <span class="badge bg-success text-white">${alerts.filter(a => a.severity?.toLowerCase() === 'low').length} Low</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-auto ms-auto d-print-none">
                            <div class="btn-list">
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
                                <button class="btn btn-primary" onClick=${() => this.loadAlerts()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                    Refresh
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                ${filteredAlerts.length === 0 ? html`
                    <div class="empty">
                        <div class="empty-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                        </div>
                        <p class="empty-title">No alerts found</p>
                        <p class="empty-subtitle text-muted">
                            ${filter === 'all' ? 'Great! No security alerts detected.' : `No ${filter} severity alerts found.`}
                        </p>
                    </div>
                ` : html`
                    <div class="row row-cards">
                        ${filteredAlerts.map(alert => {
                            const severityColor = (() => {
                                switch(alert.severity?.toLowerCase()) {
                                    case 'critical': return 'danger';
                                    case 'high': return 'warning';
                                    case 'medium': return 'info';
                                    case 'low': return 'success';
                                    default: return 'secondary';
                                }
                            })();
                            const severityIcon = (() => {
                                switch(alert.severity?.toLowerCase()) {
                                    case 'critical': return '⚠️';
                                    case 'high': return '🔴';
                                    case 'medium': return '🟡';
                                    case 'low': return '🔵';
                                    default: return 'ℹ️';
                                }
                            })();
                            const typeIcon = (() => {
                                if (alert.title?.includes('CVE')) return '🛡️';
                                if (alert.title?.includes('Policy')) return '🔒';
                                if (alert.title?.includes('Network')) return '🌐';
                                return '🚨';
                            })();
                            
                            return html`
                                <div class="col-12">
                                    <div class="card" style="border-left: 4px solid var(--tblr-${severityColor});">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-sm bg-${severityColor}-lt">
                                                        ${severityIcon}
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <div class="fw-semibold">${typeIcon} ${alert.title || 'Security Alert'}</div>
                                                    <div class="text-muted small">${alert.description || 'No description available'}</div>
                                                    <div class="d-flex gap-2 mt-2">
                                                        <span class="badge bg-${severityColor} text-white">${alert.severity || 'Unknown'}</span>
                                                        ${alert.deviceName ? html`
                                                            <a href="#!/devices/${alert.deviceId}" class="badge bg-blue-lt">
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
                                                                ${alert.deviceName}
                                                            </a>
                                                        ` : ''}
                                                        <span class="text-muted small ms-auto">
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                                                            ${this.formatDate(alert.detectedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <div class="btn-list">
                                                        <button class="btn btn-sm" title="Mark as read" onclick=${() => console.info('Mark as read:', alert.id)}>
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                        </button>
                                                        <div class="dropdown">
                                                            <button class="btn btn-sm dropdown-toggle" data-bs-toggle="dropdown">
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /><circle cx="12" cy="5" r="1" /></svg>
                                                            </button>
                                                            <div class="dropdown-menu dropdown-menu-end">
                                                                <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Snooze 1 day:', alert.id); }}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 13m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M12 10l0 3l2 0" /><path d="M7 4l-2.75 2" /><path d="M17 4l2.75 2" /></svg>
                                                                    Snooze 1 day
                                                                </a>
                                                                <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Snooze 7 days:', alert.id); }}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 13m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M12 10l0 3l2 0" /><path d="M7 4l-2.75 2" /><path d="M17 4l2.75 2" /></svg>
                                                                    Snooze 7 days
                                                                </a>
                                                                <div class="dropdown-divider"></div>
                                                                <a class="dropdown-item text-danger" href="#" onclick=${(e) => { e.preventDefault(); console.info('Dismiss:', alert.id); }}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                                    Dismiss
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        })}
                    </div>
                `}
            </div>
        `;
    }
}