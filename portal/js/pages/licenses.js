/**
 * Licenses Page - Full CRUD for License Management
 * Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { config } from '../config.js';

const { html, Component } = window;

class LicensesPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            licenses: [],
            error: null,
            showCreateModal: false,
            showCreditModal: false,
            selectedLicense: null,
            createForm: { seats: 20, days: 365 },
            creditForm: { totalCredits: 0 }
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.loadLicenses();
    }

    componentWillUnmount() {
        // No cleanup needed - HOC handles listener
    }

    async loadLicenses() {
        try {
            this.setState({ loading: true, error: null });
            
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.get(`/api/v1/orgs/${orgId}/licenses`);
            
            if (response.success) {
                this.setState({ licenses: response.data || [], loading: false });
            } else {
                throw new Error(response.message || 'Failed to load licenses');
            }
        } catch (error) {
            console.error('[Licenses] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    async createLicense() {
        try {
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const { seats, days } = this.state.createForm;
            
            const response = await api.post('/api/v1/licenses', {
                orgId,
                seats: parseInt(seats),
                days: parseInt(days)
            });
            
            if (response.success) {
                this.setState({ showCreateModal: false });
                this.loadLicenses();
                this.showToast('License created successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to create license');
            }
        } catch (error) {
            console.error('[Licenses] Create failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async rotateLicense(licenseId) {
        if (!confirm('Rotate license key? Old key will stop working for new devices.')) return;
        
        try {
            const response = await api.put(`/api/v1/licenses/${licenseId}/rotate`);
            
            if (response.success) {
                this.loadLicenses();
                this.showToast('License rotated successfully. Update devices with new key.', 'success');
            } else {
                throw new Error(response.message || 'Failed to rotate license');
            }
        } catch (error) {
            console.error('[Licenses] Rotate failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async toggleLicense(licenseId, currentlyDisabled) {
        const action = currentlyDisabled ? 'enable' : 'disable';
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this license? This will affect all associated devices.`)) return;
        
        try {
            const response = await api.put(`/api/v1/licenses/${licenseId}/${action}`);
            
            if (response.success) {
                this.loadLicenses();
                this.showToast(`License ${action}d successfully`, 'success');
            } else {
                throw new Error(response.message || `Failed to ${action} license`);
            }
        } catch (error) {
            console.error(`[Licenses] ${action} failed:`, error);
            this.showToast(error.message, 'danger');
        }
    }

    async deleteLicense(licenseId) {
        if (!confirm('Delete this license? All devices will be unregistered. This cannot be undone.')) return;
        
        try {
            const response = await api.delete(`/api/v1/licenses/${licenseId}`);
            
            if (response.success) {
                this.loadLicenses();
                this.showToast('License deleted successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to delete license');
            }
        } catch (error) {
            console.error('[Licenses] Delete failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    openCreditModal(license) {
        this.setState({
            showCreditModal: true,
            selectedLicense: license,
            creditForm: { totalCredits: license.totalCredits }
        });
    }

    async adjustCredits() {
        try {
            const { selectedLicense, creditForm } = this.state;
            
            const response = await api.put(`/api/v1/licenses/${selectedLicense.licenseId}/credits`, {
                totalCredits: parseInt(creditForm.totalCredits)
            });
            
            if (response.success) {
                this.setState({ showCreditModal: false, selectedLicense: null });
                this.loadLicenses();
                this.showToast('Credits adjusted successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to adjust credits');
            }
        } catch (error) {
            console.error('[Licenses] Adjust credits failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    showToast(message, type = 'info') {
        const toastType = type === 'danger' ? 'error' : type;
        window.toast[toastType](message);
    }

    render() {
        const { loading, licenses, error, showCreateModal, showCreditModal, selectedLicense, createForm, creditForm } = this.state;
        const user = auth.getUser();
        const isSiteAdmin = user?.userType === 'SiteAdmin';

        if (loading) {
            return html`<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>`;
        }

        if (error) {
            return html`<div class="alert alert-danger">${error}</div>`;
        }

        return html`
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title">Licenses</h3>
                    ${isSiteAdmin && html`
                        <button class="btn btn-primary" onClick=${() => this.setState({ showCreateModal: true })}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Create License
                        </button>
                    `}
                </div>
                <div class="card-body">
                    ${licenses.length === 0 ? html`
                        <div class="empty">
                            <div class="empty-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="5" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="16" r="1" /><path d="M8 11v-4a4 4 0 0 1 8 0v4" /></svg>
                            </div>
                            <p class="empty-title">No licenses found</p>
                            <p class="empty-subtitle text-muted">Get started by creating a new license</p>
                        </div>
                    ` : html`
                        <div class="table-responsive">
                            <table class="table table-vcenter">
                                <thead>
                                    <tr>
                                        <th>License Key</th>
                                        <th>Type</th>
                                        <th>Seats</th>
                                        <th>Credits</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${licenses.map(license => html`
                                        <tr>
                                            <td>
                                                <code>${license.serialKey || license.licenseKey}</code>
                                                ${license.rotatedAt && html`<br/><small class="text-muted">Rotated: ${new Date(license.rotatedAt).toLocaleDateString()}</small>`}
                                            </td>
                                            <td><span class="badge ${license.licenseType === 'Business' ? 'bg-blue' : 'bg-green'}">${license.licenseType}</span></td>
                                            <td>${license.seats || 'N/A'}</td>
                                            <td>
                                                <span class="text-muted">${license.remainingCredits || 0} / ${license.totalCredits || 0}</span>
                                                ${isSiteAdmin && html`
                                                    <br/><a href="#" onClick=${(e) => { e.preventDefault(); this.openCreditModal(license); }} class="text-primary">Adjust</a>
                                                `}
                                            </td>
                                            <td>
                                                ${license.isDisabled ? 
                                                    html`<span class="badge bg-red">Disabled</span>` : 
                                                    html`<span class="badge bg-green">Active</span>`
                                                }
                                            </td>
                                            <td><small class="text-muted">${new Date(license.createdAt).toLocaleDateString()}</small></td>
                                            <td>
                                                <div class="btn-group" role="group">
                                                    <button class="btn btn-sm btn-secondary" onClick=${() => this.rotateLicense(license.licenseId)} title="Rotate Key">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                                    </button>
                                                    <button class="btn btn-sm ${license.isDisabled ? 'btn-success' : 'btn-warning'}" onClick=${() => this.toggleLicense(license.licenseId, license.isDisabled)} title="${license.isDisabled ? 'Enable' : 'Disable'}">
                                                        ${license.isDisabled ? 'Enable' : 'Disable'}
                                                    </button>
                                                    ${isSiteAdmin && html`
                                                        <button class="btn btn-sm btn-danger" onClick=${() => this.deleteLicense(license.licenseId)} title="Delete">
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                                                        </button>
                                                    `}
                                                </div>
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>

            ${showCreateModal && this.renderCreateModal()}
            ${showCreditModal && this.renderCreditModal()}
        `;
    }

    renderCreateModal() {
        const { createForm } = this.state;
        
        return html`
            <div class="modal modal-blur fade show" style="display: block;" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Create License</h5>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showCreateModal: false })}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Seats</label>
                                <input type="number" class="form-control" value=${createForm.seats} 
                                    onInput=${(e) => this.setState({ createForm: { ...createForm, seats: e.target.value }})} />
                                <small class="form-hint">Number of concurrent devices allowed</small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Days</label>
                                <input type="number" class="form-control" value=${createForm.days} 
                                    onInput=${(e) => this.setState({ createForm: { ...createForm, days: e.target.value }})} />
                                <small class="form-hint">License duration in days</small>
                            </div>
                            <div class="alert alert-info">
                                <strong>Total Credits:</strong> ${parseInt(createForm.seats) * parseInt(createForm.days)} device-days
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn" onClick=${() => this.setState({ showCreateModal: false })}>Cancel</button>
                            <button type="button" class="btn btn-primary" onClick=${() => this.createLicense()}>Create</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop fade show"></div>
        `;
    }

    renderCreditModal() {
        const { selectedLicense, creditForm } = this.state;
        
        return html`
            <div class="modal modal-blur fade show" style="display: block;" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Adjust Credits</h5>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showCreditModal: false, selectedLicense: null })}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Total Credits</label>
                                <input type="number" class="form-control" value=${creditForm.totalCredits} 
                                    onInput=${(e) => this.setState({ creditForm: { totalCredits: e.target.value }})} />
                                <small class="form-hint">Current: ${selectedLicense.totalCredits}, Remaining: ${selectedLicense.remainingCredits}</small>
                            </div>
                            <div class="alert alert-warning">
                                <strong>Warning:</strong> Decreasing credits may disable the license if remaining credits become negative.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn" onClick=${() => this.setState({ showCreditModal: false, selectedLicense: null })}>Cancel</button>
                            <button type="button" class="btn btn-primary" onClick=${() => this.adjustCredits()}>Adjust</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop fade show"></div>
        `;
    }
}

export default LicensesPage;

// Initialize page
if (document.getElementById('page-root')) {
    window.preactRender(window.html`<${LicensesPage} />`, document.getElementById('page-root'));
}
