/**
 * AccountsTab - User accounts management UI
 * Extracted from SiteAdmin.js
 */

import { filterAccounts } from '../utils/FilterUtils.js';

const { html } = window;
const { useState } = window.preactHooks;

export function AccountsTab({ accounts, showToast, onChangeUserType }) {
    const [accountsSearch, setAccountsSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [newUserType, setNewUserType] = useState('');
    const [showChangeUserType, setShowChangeUserType] = useState(false);
    const [changingUserType, setChangingUserType] = useState(false);

    const filteredAccounts = filterAccounts(accounts, accountsSearch);

    const handleChangeUserType = async () => {
        if (!selectedUser || !newUserType) return;

        setChangingUserType(true);
        try {
            await onChangeUserType(selectedUser, newUserType);
            setShowChangeUserType(false);
            setSelectedUser(null);
        } catch (error) {
            console.error('[AccountsTab] Error changing user type:', error);
        } finally {
            setChangingUserType(false);
        }
    };

    return html`
        <div>
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <input 
                        type="text" 
                        class="form-control"
                        placeholder="Filter by email or role"
                        value=${accountsSearch}
                        onInput=${(e) => setAccountsSearch(e.target.value)}
                    />
                </div>
                <div class="col-md-6 text-end text-muted align-self-center">
                    <small>${filteredAccounts.length} of ${(accounts || []).length} accounts</small>
                </div>
            </div>

            ${(!accounts || accounts.length === 0) ? html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-users"></i></div>
                    <p class="empty-title">No accounts found</p>
                </div>
            ` : html`
                <div class="table-responsive">
                    <table class="table table-sm table-hover">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>User Type</th>
                                <th>Created</th>
                                <th>Last Login</th>
                                <th class="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredAccounts.map(acc => html`
                                <tr>
                                    <td><span class="fw-semibold">${acc.email}</span></td>
                                    <td><span class="badge bg-primary-lt text-uppercase">${acc.userType || 'Individual'}</span></td>
                                    <td class="text-muted">${acc.createdAt ? new Date(acc.createdAt).toLocaleString() : 'N/A'}</td>
                                    <td class="text-muted">${acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString() : 'Never'}</td>
                                    <td class="text-center">
                                        <button 
                                            class="btn btn-sm btn-outline-primary"
                                            onClick=${() => {
                                                setSelectedUser(acc);
                                                setNewUserType(acc.userType === 'SiteAdmin' ? 'Individual' : 'SiteAdmin');
                                                setShowChangeUserType(true);
                                            }}
                                        >
                                            <i class="ti ti-switch-horizontal me-1"></i>
                                            Change Type
                                        </button>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            `}

            <!-- Change User Type Modal -->
            ${showChangeUserType && selectedUser && html`
                <div class="modal modal-blur fade show" style="display: block;" onClick=${() => setShowChangeUserType(false)}>
                    <div class="modal-dialog modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Change User Type</h5>
                                <button type="button" class="btn-close" onClick=${() => setShowChangeUserType(false)}></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">User</label>
                                    <input type="text" class="form-control" value=${selectedUser.email} disabled />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Current Type</label>
                                    <input type="text" class="form-control" value=${selectedUser.userType || 'Individual'} disabled />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">New Type</label>
                                    <select 
                                        class="form-select" 
                                        value=${newUserType}
                                        onChange=${(e) => setNewUserType(e.target.value)}
                                    >
                                        <option value="Individual">Individual</option>
                                        <option value="SiteAdmin">SiteAdmin</option>
                                    </select>
                                </div>
                                <div class="alert alert-warning">
                                    <i class="ti ti-alert-triangle me-2"></i>
                                    <strong>Warning:</strong> Changing user type affects their permissions across the entire system.
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onClick=${() => setShowChangeUserType(false)}>
                                    Cancel
                                </button>
                                <button 
                                    type="button" 
                                    class="btn btn-primary" 
                                    onClick=${handleChangeUserType}
                                    disabled=${changingUserType || !newUserType}
                                >
                                    ${changingUserType ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                    Change Type
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
