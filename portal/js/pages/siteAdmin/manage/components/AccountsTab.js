/**
 * AccountsTab - User accounts management UI
 * Extracted from SiteAdmin.js
 */

import { filterAccounts } from '../../utils/FilterUtils.js';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

export function AccountsTab({ accounts, showToast, onChangeUserType, onDeleteAccount }) {
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    const [accountsSearch, setAccountsSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [newUserType, setNewUserType] = useState('');
    const [showChangeUserType, setShowChangeUserType] = useState(false);
    const [changingUserType, setChangingUserType] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTargetUser, setDeleteTargetUser] = useState(null);
    const [deletingAccount, setDeletingAccount] = useState(false);

    const [visibleCount, setVisibleCount] = useState(30);
    const loadMoreStep = 20;
    const listRef = useRef(null);
    const sentinelRef = useRef(null);

    const filteredAccounts = filterAccounts(safeAccounts, accountsSearch) || [];
    const currentAccounts = filteredAccounts.slice(0, visibleCount);

    useEffect(() => {
        setVisibleCount(30);
    }, [accountsSearch, safeAccounts]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && visibleCount < filteredAccounts.length) {
                    setVisibleCount(prev => Math.min(prev + loadMoreStep, filteredAccounts.length));
                }
            });
        }, {
            root: listRef.current,
            rootMargin: '200px',
            threshold: 0.1
        });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredAccounts.length, visibleCount]);

    const handleChangeUserType = async () => {
        if (!selectedUser || !newUserType) return;
        if (typeof onChangeUserType !== 'function') {
            console.error('[AccountsTab] onChangeUserType not provided');
            return;
        }

        setChangingUserType(true);
        try {
            const res = await onChangeUserType(selectedUser.email || selectedUser.userId || selectedUser.UserId, newUserType);
            if (res?.success) {
                setShowChangeUserType(false);
                setSelectedUser(null);
            } else {
                console.error('[AccountsTab] Error changing user type:', res?.message);
                if (showToast) showToast(res?.message || 'Failed to change user type', 'error');
            }
        } catch (error) {
            console.error('[AccountsTab] Error changing user type:', error);
            if (showToast) showToast('Failed to change user type', 'error');
        } finally {
            setChangingUserType(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!deleteTargetUser || typeof onDeleteAccount !== 'function') {
            return;
        }

        const userId = deleteTargetUser.email || deleteTargetUser.userId || deleteTargetUser.UserId;
        if (!userId) {
            return;
        }

        setDeletingAccount(true);
        try {
            const result = await onDeleteAccount(userId);
            if (result?.success) {
                if (showToast) {
                    showToast('Account deleted successfully', 'success');
                }
                setShowDeleteConfirm(false);
                setDeleteTargetUser(null);
                setSelectedUser(null);
            } else if (showToast) {
                showToast(result?.message || 'Failed to delete account', 'error');
            }
        } catch (error) {
            console.error('[AccountsTab] Error deleting account:', error);
            if (showToast) {
                showToast('Failed to delete account', 'error');
            }
        } finally {
            setDeletingAccount(false);
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
                    <small>${filteredAccounts.length} of ${safeAccounts.length} accounts</small>
                </div>
            </div>

            ${(!accounts || accounts.length === 0) ? html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-users"></i></div>
                    <p class="empty-title">No accounts found</p>
                </div>
            ` : html`
                <div class="table-responsive" ref=${listRef} style="max-height: 70vh; overflow: auto;">
                    <table class="table table-sm table-hover">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>User Type</th>
                                <th>MAGICode</th>
                                <th>Created</th>
                                <th>Last Login</th>
                                <th class="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currentAccounts.map(acc => html`
                                <tr>
                                    <td><span class="fw-semibold">${acc.email}</span></td>
                                    <td><span class="badge bg-primary-lt text-primary text-uppercase">${acc.userType === 'SiteAdmin' ? 'SITEADMIN' : 'ENDUSER'}</span></td>
                                    <td>
                                        ${acc.magiCodeUsed || acc.MagiCodeUsed
                                            ? html`<span class="badge bg-success text-white" title=${acc.magiCodeUsed || acc.MagiCodeUsed}>${acc.magiCodeUsed || acc.MagiCodeUsed}</span>`
                                            : html`<span class="text-muted">-</span>`}
                                    </td>
                                    <td class="text-muted">${acc.createdAt ? new Date(acc.createdAt).toLocaleString() : 'N/A'}</td>
                                    <td class="text-muted">${acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString() : 'Never'}</td>
                                    <td class="text-center">
                                        <div class="btn-list justify-content-center">
                                            <button 
                                                class="btn btn-sm btn-outline-primary"
                                                onClick=${() => {
                                                    setSelectedUser(acc);
                                                    const currentType = acc.userType === 'SiteAdmin' ? 'SiteAdmin' : 'EndUser';
                                                    setNewUserType(currentType === 'SiteAdmin' ? 'EndUser' : 'SiteAdmin');
                                                    setShowChangeUserType(true);
                                                }}
                                            >
                                                <i class="ti ti-switch-horizontal me-1"></i>
                                                Change Type
                                            </button>
                                            <button
                                                class="btn btn-sm btn-outline-danger"
                                                onClick=${() => {
                                                    setDeleteTargetUser(acc);
                                                    setShowDeleteConfirm(true);
                                                }}
                                            >
                                                <i class="ti ti-trash me-1"></i>
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                    <div ref=${sentinelRef} class="py-2 text-center text-muted small">${visibleCount < filteredAccounts.length ? 'Loading more…' : 'End of list'}</div>
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
                                    <input type="text" class="form-control" value=${selectedUser.userType === 'SiteAdmin' ? 'SiteAdmin' : 'EndUser'} disabled />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">New Type</label>
                                    <select 
                                        class="form-select" 
                                        value=${newUserType}
                                        onChange=${(e) => setNewUserType(e.target.value)}
                                    >
                                        <option value="EndUser">EndUser</option>
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

            ${showDeleteConfirm && deleteTargetUser && html`
                <div class="modal modal-blur fade show" style="display: block;" onClick=${() => !deletingAccount && setShowDeleteConfirm(false)}>
                    <div class="modal-dialog modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title text-danger">Delete Account</h5>
                                <button
                                    type="button"
                                    class="btn-close"
                                    onClick=${() => !deletingAccount && setShowDeleteConfirm(false)}
                                    disabled=${deletingAccount}
                                ></button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2">You are about to permanently delete:</p>
                                <p class="fw-semibold mb-3">${deleteTargetUser.email || deleteTargetUser.userId || deleteTargetUser.UserId}</p>
                                <div class="alert alert-warning mb-0">
                                    <div class="fw-semibold mb-1">This action will:</div>
                                    <ul class="mb-0 ps-3">
                                        <li>Delete this user account from the system</li>
                                        <li>Remove all organization memberships linked to this user</li>
                                        <li>If this user owns a personal org, delete that org and all its licenses, devices, telemetry, and memberships</li>
                                    </ul>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button
                                    type="button"
                                    class="btn btn-secondary"
                                    onClick=${() => setShowDeleteConfirm(false)}
                                    disabled=${deletingAccount}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-danger"
                                    onClick=${handleDeleteAccount}
                                    disabled=${deletingAccount}
                                >
                                    ${deletingAccount ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                    Delete Account
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
