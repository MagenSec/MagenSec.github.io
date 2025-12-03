/**
 * Vulnerabilities Page - CVE tracking and remediation guidance
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class VulnerabilitiesPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            vulnerabilities: [],
            severityFilter: 'all'
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadVulnerabilities());
        this.loadVulnerabilities();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
    }

    async loadVulnerabilities() {
        try {
            this.setState({ loading: true, error: null });
            
            const user = auth.getUser();
            const currentOrg = orgContext.getOrg();
            const orgId = currentOrg || user.email;

            const response = await api.get(`/api/v1/vulnerabilities/${orgId}`);
            
            if (response.success) {
                this.setState({ 
                    vulnerabilities: response.data?.vulnerabilities || [],
                    summary: response.data?.summary,
                    loading: false 
                });
            } else {
                throw new Error(response.message || 'Failed to load vulnerabilities');
            }
        } catch (error) {
            console.error('[Vulnerabilities] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    getSeverityBadge(severity) {
        const map = { 'Critical': 'danger', 'High': 'warning', 'Medium': 'info', 'Low': 'secondary' };
        return map[severity] || 'secondary';
    }

    render() {
        const { loading, error, vulnerabilities, severityFilter } = this.state;

        if (loading) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error) {
            return html`<div class="alert alert-danger"><h4 class="alert-title">Error</h4><div>${error}</div></div>`;
        }

        const filtered = severityFilter === 'all' ? vulnerabilities : vulnerabilities.filter(v => v.severity === severityFilter);

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col"><h2 class="page-title">Vulnerabilities</h2></div>
                    </div>
                </div>
            </div>
            <div class="page-body">
                <div class="container-xl">
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="btn-group">
                                ${['all', 'Critical', 'High', 'Medium', 'Low'].map(s => html`
                                    <button class="btn ${severityFilter === s ? 'btn-primary' : 'btn-outline-primary'}" 
                                            onClick=${() => this.setState({ severityFilter: s })}>${s}</button>
                                `)}
                            </div>
                        </div>
                    </div>
                    ${filtered.length === 0 ? html`
                        <div class="card"><div class="empty"><p class="empty-title">No vulnerabilities found</p></div></div>
                    ` : html`
                        <div class="row row-cards">
                            ${filtered.map(vuln => html`
                                <div class="col-12">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto"><span class="badge bg-${this.getSeverityBadge(vuln.severity)}">${vuln.severity}</span></div>
                                                <div class="col">
                                                    <h3>${vuln.cveId}</h3>
                                                    <div class="text-muted">${vuln.description}</div>
                                                    <div class="mt-2"><strong>Affected:</strong> ${vuln.affectedDevices} device(s)</div>
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
