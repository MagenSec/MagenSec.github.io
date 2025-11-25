/**
 * Threat Intelligence Page - Real-time security detections and behavioral analysis
 * Shows detections from SecurityTelemetry table
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class ThreatIntelPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            detections: [],
            filter: 'all', // all, high, medium, low
            timeRange: '24h' // 24h, 7d, 30d
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadDetections());
        this.loadDetections();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
    }

    async loadDetections() {
        try {
            this.setState({ loading: true, error: null });
            
            const currentOrg = orgContext.getCurrentOrg();
            const user = auth.getUser();
            const orgId = currentOrg?.orgId || user.email;
            
            // Load security detections from SecurityTelemetryEndpoint
            const response = await window.api.get(`/api/security/${orgId}/detections`);
            
            if (response.success && response.data) {
                this.setState({ detections: response.data, loading: false });
            } else {
                this.setState({ detections: [], loading: false });
            }
        } catch (error) {
            console.error('[ThreatIntel] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    setFilter(filter) {
        this.setState({ filter });
    }

    setTimeRange(timeRange) {
        this.setState({ timeRange }, () => this.loadDetections());
    }

    getFilteredDetections() {
        const { detections, filter } = this.state;
        if (filter === 'all') return detections;
        return detections.filter(d => d.severity?.toLowerCase() === filter);
    }

    getSeverityBadge(severity) {
        const classes = {
            'high': 'danger',
            'medium': 'warning',
            'low': 'info'
        };
        return classes[severity?.toLowerCase()] || 'secondary';
    }

    render() {
        const { loading, error, filter, timeRange } = this.state;
        const filteredDetections = this.getFilteredDetections();

        if (loading) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="alert alert-danger">
                    <h4 class="alert-title">Error Loading Threat Intelligence</h4>
                    <div class="text-secondary">${error}</div>
                </div>
            `;
        }

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <h2 class="page-title">Threat Intelligence</h2>
                            <div class="text-muted">Real-time security detections and behavioral analysis</div>
                        </div>
                        <div class="col-auto ms-auto">
                            <div class="btn-list">
                                <a href="#!/security/response" class="btn btn-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    Response Actions
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <!-- Filters -->
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="row g-2">
                                <div class="col-auto">
                                    <div class="btn-group" role="group">
                                        <button type="button" class="btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}" 
                                                onClick=${() => this.setFilter('all')}>All</button>
                                        <button type="button" class="btn ${filter === 'high' ? 'btn-danger' : 'btn-outline-danger'}" 
                                                onClick=${() => this.setFilter('high')}>High</button>
                                        <button type="button" class="btn ${filter === 'medium' ? 'btn-warning' : 'btn-outline-warning'}" 
                                                onClick=${() => this.setFilter('medium')}>Medium</button>
                                        <button type="button" class="btn ${filter === 'low' ? 'btn-info' : 'btn-outline-info'}" 
                                                onClick=${() => this.setFilter('low')}>Low</button>
                                    </div>
                                </div>
                                <div class="col-auto ms-auto">
                                    <select class="form-select" value=${timeRange} onChange=${(e) => this.setTimeRange(e.target.value)}>
                                        <option value="24h">Last 24 Hours</option>
                                        <option value="7d">Last 7 Days</option>
                                        <option value="30d">Last 30 Days</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Detections List -->
                    ${filteredDetections.length === 0 ? html`
                        <div class="card">
                            <div class="empty">
                                <div class="empty-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-success" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 11l3 3l8 -8" /><path d="M20 12v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h9" /></svg>
                                </div>
                                <p class="empty-title">No threats detected</p>
                                <p class="empty-subtitle text-muted">
                                    ${filter !== 'all' ? 'Try adjusting your filters' : 'Your environment is secure'}
                                </p>
                            </div>
                        </div>
                    ` : html`
                        <div class="row row-cards">
                            ${filteredDetections.map(detection => html`
                                <div class="col-12">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="badge bg-${this.getSeverityBadge(detection.severity)}">${detection.severity}</span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${detection.title}</h3>
                                                    <div class="text-muted">${detection.description}</div>
                                                    <div class="mt-2">
                                                        <span class="text-muted">Device: </span><strong>${detection.deviceId}</strong>
                                                        <span class="ms-3 text-muted">Time: </span><strong>${new Date(detection.timestamp).toLocaleString()}</strong>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <a href="#!/analyst?detection=${detection.id}" class="btn btn-primary">Investigate</a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `)}
                        </div>
                    `}
                </div>
            </div>
        `;
    }
}
