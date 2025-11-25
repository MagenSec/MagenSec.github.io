/**
 * Members Page - Org Team Management with Roles
 * Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class MembersPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            members: [],
            error: null,
            showInviteModal: false,
            inviteForm: { userEmail: '', role: 'ReadWrite' }
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadMembers());
        this.loadMembers();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
    }

    async loadMembers() {
        try {
            this.setState({ loading: true, error: null });
            
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.get(`/api/orgs/${orgId}/members`);
            
            if (response.success) {
                this.setState({ members: response.data || [], loading: false });
            } else {
                throw new Error(response.message || 'Failed to load members');
            }
        } catch (error) {
            console.error('[Members] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    async inviteMember() {
        try {
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const { userEmail, role } = this.state.inviteForm;
            
            if (!userEmail || !userEmail.includes('@')) {
                throw new Error('Please enter a valid email address');
            }
            
            const response = await api.post(`/api/orgs/${orgId}/members`, {
                userEmail,
                role
            });
            
            if (response.success) {
                this.setState({ showInviteModal: false, inviteForm: { userEmail: '', role: 'ReadWrite' } });
                this.loadMembers();
                this.showToast('Member invited successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to invite member');
            }
        } catch (error) {
            console.error('[Members] Invite failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async updateMemberRole(userId, currentRole) {
        const newRole = currentRole === 'ReadWrite' ? 'ReadOnly' : 'ReadWrite';
        
        if (!confirm(`Change this member's role to ${newRole}?`)) return;
        
        try {
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.put(`/api/orgs/${orgId}/members/${userId}`, { role: newRole });
            
            if (response.success) {
                this.loadMembers();
                this.showToast('Member role updated successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to update member role');
            }
        } catch (error) {
            console.error('[Members] Update role failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async removeMember(userId, userEmail) {
        if (!confirm(`Remove ${userEmail} from the organization?`)) return;
        
        try {
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.delete(`/api/orgs/${orgId}/members/${userId}`);
            
            if (response.success) {
                this.loadMembers();
                this.showToast('Member removed successfully', 'success');
            } else {
                throw new Error(response.message || 'Failed to remove member');
            }
        } catch (error) {
            console.error('[Members] Remove failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    showToast(message, type = 'info') {
        const toastType = type === 'danger' ? 'error' : type;
        window.toast[toastType](message);
    }

    render() {
        const { loading, members, error, showInviteModal, inviteForm } = this.state;
        const user = auth.getUser();
        const isBusinessAdmin = user?.userType === 'BusinessAdmin' || user?.userType === 'SiteAdmin';

        if (loading) {
            return html`<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>`;
        }

        if (error) {
            return html`<div class="alert alert-danger">${error}</div>`;
        }

        return html`
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title">Organization Members</h3>
                    ${isBusinessAdmin && html`
                        <button class="btn btn-primary" onClick=${() => this.setState({ showInviteModal: true })}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Invite Member
                        </button>
                    `}
                </div>
                <div class="card-body">
                    ${members.length === 0 ? html`
                        <div class="empty">
                            <div class="empty-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg>
                            </div>
                            <p class="empty-title">No members yet</p>
                            <p class="empty-subtitle text-muted">Invite team members to collaborate</p>
                        </div>
                    ` : html`
                        <div class="table-responsive">
                            <table class="table table-vcenter">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>Added</th>
                                        <th>Added By</th>
                                        ${isBusinessAdmin && html`<th>Actions</th>`}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${members.map(member => html`
                                        <tr>
                                            <td>
                                                <div class="d-flex align-items-center">
                                                    <span class="avatar avatar-sm bg-blue-lt">
                                                        ${member.userEmail?.charAt(0).toUpperCase()}
                                                    </span>
                                                    <div class="ms-2">
                                                        <div>${member.userEmail}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge ${member.role === 'ReadWrite' ? 'bg-blue' : 'bg-secondary'}">
                                                    ${member.role}
                                                </span>
                                                ${member.role === 'ReadOnly' && html`
                                                    <small class="text-muted d-block">View only access</small>
                                                `}
                                            </td>
                                            <td><small class="text-muted">${new Date(member.addedAt).toLocaleDateString()}</small></td>
                                            <td><small class="text-muted">${member.addedBy || 'System'}</small></td>
                                            ${isBusinessAdmin && html`
                                                <td>
                                                    <div class="btn-group" role="group">
                                                        <button class="btn btn-sm btn-secondary" 
                                                            onClick=${() => this.updateMemberRole(member.userId, member.role)}
                                                            title="Toggle Role">
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 11l3 3l8 -8" /><path d="M20 12v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h9" /></svg>
                                                        </button>
                                                        <button class="btn btn-sm btn-danger" 
                                                            onClick=${() => this.removeMember(member.userId, member.userEmail)}
                                                            title="Remove">
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            `}
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    `}
                    <div class="mt-3 alert alert-info">
                        <strong>Note:</strong> At least one ReadWrite admin must remain. ReadOnly members can view telemetry but cannot manage devices or licenses.
                    </div>
                </div>
            </div>

            ${showInviteModal && this.renderInviteModal()}
        `;
    }

    renderInviteModal() {
        const { inviteForm } = this.state;
        
        return html`
            <div class="modal modal-blur fade show" style="display: block;" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Invite Member</h5>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showInviteModal: false })}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Email Address</label>
                                <input type="email" class="form-control" placeholder="user@example.com" 
                                    value=${inviteForm.userEmail} 
                                    onInput=${(e) => this.setState({ inviteForm: { ...inviteForm, userEmail: e.target.value }})} />
                                <small class="form-hint">User must have logged in at least once</small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Role</label>
                                <select class="form-select" value=${inviteForm.role}
                                    onChange=${(e) => this.setState({ inviteForm: { ...inviteForm, role: e.target.value }})}>
                                    <option value="ReadWrite">ReadWrite - Full access</option>
                                    <option value="ReadOnly">ReadOnly - View only</option>
                                </select>
                                <small class="form-hint">ReadWrite can manage devices and licenses, ReadOnly can only view</small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn" onClick=${() => this.setState({ showInviteModal: false })}>Cancel</button>
                            <button type="button" class="btn btn-primary" onClick=${() => this.inviteMember()}>Invite</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop fade show"></div>
        `;
    }
}

// Initialize page
if (document.getElementById('page-root')) {
    window.preactRender(window.html`<${MembersPage} />`, document.getElementById('page-root'));
}
