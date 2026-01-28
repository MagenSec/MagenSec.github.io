/**
 * Manage Page - Organizations, Accounts, Admin Actions
 * Route: #!/siteadmin/manage
 */

import { OrganizationsTab } from './components/OrganizationsTab.js';
import { AccountsTab } from './components/AccountsTab.js';
import { AdminActionsTab } from './components/AdminActionsTab.js';

const { html, Component } = window;
const { useState, useEffect } = window.preactHooks;

function firstArrayOf(obj, candidateKeys = []) {
    if (!obj || typeof obj !== 'object') return [];

    // Direct matches by key
    for (const key of candidateKeys) {
        const val = obj[key];
        if (Array.isArray(val)) return val;
    }

    // Look for common nested shapes
    const candidates = [obj.data, obj.items, obj.orgs, obj.organizations, obj.accounts, obj.results];
    for (const val of candidates) {
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object') {
            const nested = firstArrayOf(val, candidateKeys);
            if (nested.length) return nested;
        }
    }

    // Scan any enumerable property that is an array
    for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) return obj[key];
    }

    return [];
}

export class ManagePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeTab: 'organizations', // 'organizations', 'accounts', 'admin-actions'
            loading: true,
            orgs: [],
            accounts: []
        };
    }

    async componentDidMount() {
        await this.loadData();
    }

    changeUserType = async (userId, newUserType) => {
        try {
            await window.api.request(`/api/v1/admin/users/${encodeURIComponent(userId)}/change-type`, {
                method: 'PUT',
                body: JSON.stringify({ newUserType })
            });
            await this.loadData();
            return { success: true };
        } catch (err) {
            console.error('[ManagePage] changeUserType failed', err);
            return { success: false, message: err?.message || 'Failed to change user type' };
        }
    }

    // Organization Management Callbacks
    createOrg = async (data) => {
        try {
            const response = await window.api.request('/api/v1/admin/orgs', {
                method: 'POST',
                body: JSON.stringify({
                    orgName: data.orgName,
                    ownerEmail: data.ownerEmail,
                    seats: data.seats,
                    durationDays: data.duration,
                    reportEnabled: data.reportEnabled,
                    weeklyEnabled: data.weeklyEnabled,
                    dailySnapshotEnabled: data.dailySnapshotEnabled,
                    sendToAllTeamMembers: data.sendToAllTeamMembers,
                    reportTier: data.reportTier
                })
            });
            
            if (response?.success === false) {
                window.toast?.show?.(response?.message || 'Failed to create organization', 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.('Organization created successfully', 'success');
            await this.loadData();
            return { success: true };
        } catch (err) {
            console.error('[ManagePage] createOrg failed', err);
            window.toast?.show?.(err?.message || 'Failed to create organization', 'error');
            return { success: false, message: err?.message };
        }
    }

    updateOrg = async (data) => {
        try {
            const response = await window.api.request(`/api/v1/admin/orgs/${encodeURIComponent(data.orgId)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    orgName: data.orgName,
                    reportEnabled: data.reportEnabled,
                    weeklyEnabled: data.weeklyEnabled,
                    dailySnapshotEnabled: data.dailySnapshotEnabled,
                    sendToAllTeamMembers: data.sendToAllTeamMembers,
                    reportTier: data.reportTier
                })
            });

            if (response?.success === false) {
                window.toast?.show?.(response?.message || 'Failed to update organization', 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.('Organization updated successfully', 'success');
            await this.loadData();
            return { success: true };
        } catch (err) {
            console.error('[ManagePage] updateOrg failed', err);
            window.toast?.show?.(err?.message || 'Failed to update organization', 'error');
            return { success: false, message: err?.message };
        }
    }

    toggleOrgStatus = async (orgId, action) => {
        try {
            const endpoint = action === 'disable'
                ? `/api/v1/admin/orgs/${encodeURIComponent(orgId)}/disable`
                : `/api/v1/admin/orgs/${encodeURIComponent(orgId)}/enable`;

            const response = await window.api.request(endpoint, {
                method: 'PUT'
            });

            if (response?.success === false) {
                window.toast?.show?.(response?.message || `Failed to ${action} organization`, 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.(`Organization ${action}d successfully`, 'success');
            await this.loadData();
            return { success: true };
        } catch (err) {
            console.error('[ManagePage] toggleOrgStatus failed', err);
            window.toast?.show?.(err?.message || `Failed to ${action} organization`, 'error');
            return { success: false, message: err?.message };
        }
    }

    deleteOrg = async (orgId) => {
        try {
            const response = await window.api.request(`/api/v1/admin/orgs/${encodeURIComponent(orgId)}`, {
                method: 'DELETE'
            });

            if (response?.success === false) {
                window.toast?.show?.(response?.message || 'Failed to delete organization', 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.('Organization deleted successfully', 'success');
            await this.loadData();
            return { success: true };
        } catch (err) {
            console.error('[ManagePage] deleteOrg failed', err);
            window.toast?.show?.(err?.message || 'Failed to delete organization', 'error');
            return { success: false, message: err?.message };
        }
    }

    transferOwnership = async (orgId, newOwnerEmail) => {
        try {
            const response = await window.api.request(`/api/v1/admin/orgs/${encodeURIComponent(orgId)}/transfer`, {
                method: 'POST',
                body: JSON.stringify({ newOwnerEmail })
            });

            if (response?.success === false) {
                window.toast?.show?.(response?.message || 'Failed to transfer ownership', 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.('Ownership transferred successfully', 'success');
            await this.loadData();
            return { success: true };
        } catch (err) {
            console.error('[ManagePage] transferOwnership failed', err);
            window.toast?.show?.(err?.message || 'Failed to transfer ownership', 'error');
            return { success: false, message: err?.message };
        }
    }

    async loadData() {
        try {
            this.setState({ loading: true });
            
            const [orgsRes, accountsRes] = await Promise.all([
                window.api.get('/api/v1/admin/orgs'),
                window.api.get('/api/v1/admin/accounts')
            ]);

            const orgsData = firstArrayOf(orgsRes, ['data', 'items', 'orgs', 'organizations']);
            const accountsData = firstArrayOf(accountsRes, ['data', 'items', 'accounts']);

            this.setState({
                loading: false,
                orgs: orgsData,
                accounts: accountsData
            });
        } catch (error) {
            console.error('Failed to load data:', error);
            this.setState({ loading: false });
        }
    }

    // Admin Actions Callbacks
    handleTriggerCron = async (taskId) => {
        try {
            const response = await window.api.adminTriggerCron(taskId);
            
            if (!response?.success) {
                window.toast?.show?.(response?.message || `Failed to trigger ${taskId}`, 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.(`${taskId} triggered successfully`, 'success');
            return { 
                success: true, 
                data: {
                    itemsProcessed: response?.data?.itemsProcessed,
                    duration: response?.data?.durationMs ? `${response.data.durationMs}ms` : 'N/A'
                }
            };
        } catch (error) {
            console.error('[ManagePage] handleTriggerCron failed', error);
            window.toast?.show?.(error?.message || `Failed to trigger ${taskId}`, 'error');
            return { success: false, message: error?.message };
        }
    }

    handleResetRemediation = async (orgId, resetApps = true, resetCves = true) => {
        try {
            const response = await window.api.adminResetRemediation(orgId, resetApps, resetCves);
            
            if (!response?.success) {
                window.toast?.show?.(response?.message || 'Failed to reset remediation status', 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.('Remediation status reset successfully', 'success');
            return { 
                success: true, 
                data: {
                    appRecordsReset: response?.data?.appRecordsReset || 0,
                    cveRecordsReset: response?.data?.cveRecordsReset || 0
                }
            };
        } catch (error) {
            console.error('[ManagePage] handleResetRemediation failed', error);
            window.toast?.show?.(error?.message || 'Failed to reset remediation status', 'error');
            return { success: false, message: error?.message };
        }
    }

    render() {
        const { activeTab, loading, orgs, accounts } = this.state;

        return html`
            <div class="container-xl">
                <!-- Page header -->
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Site Admin</div>
                            <h2 class="page-title">Manage</h2>
                        </div>

                    </div>
                </div>

                <!-- Tabs -->
                <ul class="nav nav-tabs mb-3">
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'organizations' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'organizations' }); }}
                        >
                            <i class="ti ti-building me-2"></i>
                            Organizations
                            <span class="badge bg-blue-lt ms-2">${orgs.length}</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'accounts' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'accounts' }); }}
                        >
                            <i class="ti ti-users me-2"></i>
                            Accounts
                            <span class="badge bg-blue-lt ms-2">${accounts.length}</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'admin-actions' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'admin-actions' }); }}
                        >
                            <i class="ti ti-bolt me-2"></i>
                            Admin Actions
                        </a>
                    </li>
                </ul>

                <!-- Tab content -->
                <div class="tab-content">
                    ${activeTab === 'organizations' && html`<${OrganizationsTab} 
                        orgs=${orgs} 
                        accounts=${accounts}
                        onRefresh=${() => this.loadData()}
                        onCreateOrg=${this.createOrg}
                        onUpdateOrg=${this.updateOrg}
                        onToggleOrgStatus=${this.toggleOrgStatus}
                        onDeleteOrg=${this.deleteOrg}
                        onTransferOwnership=${this.transferOwnership}
                    />`}
                    ${activeTab === 'accounts' && html`<${AccountsTab} 
                        accounts=${accounts} 
                        onRefresh=${() => this.loadData()}
                        onChangeUserType=${this.changeUserType}
                    />`}
                    ${activeTab === 'admin-actions' && html`<${AdminActionsTab} 
                        orgs=${orgs}
                        onTriggerCron=${this.handleTriggerCron}
                        onResetRemediation=${this.handleResetRemediation}
                        setMainSection=${(section) => this.setState({ activeSection: section })}
                        setActiveTab=${(tab) => this.setState({ activeTab: tab })}
                        loadCronStatus=${() => {}}
                    />`}
                </div>
            </div>
        `;
    }
}
