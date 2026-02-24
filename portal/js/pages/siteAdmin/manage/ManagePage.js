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
            activeTab: 'organizations', // 'organizations', 'accounts', 'admin-actions', 'platform-settings'
            loading: true,
            orgs: [],
            accounts: [],
            platformSettings: {
                whatsappDailyEnabled: false,
                aiExecutiveSummaryEnabled: false,
                aiExecutiveSummaryInternetEnabled: false,
            },
            platformLoading: false,
            platformSaving: false
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
                    dailyReportEnabled: data.reportEnabled,
                    weeklyEnabled: data.weeklyEnabled,
                    dailySnapshotEnabled: data.dailySnapshotEnabled,
                    sendToAllTeamMembers: data.sendToAllTeamMembers,
                    weeklyReportTier: data.reportTier
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
                    dailyReportEnabled: data.reportEnabled,
                    weeklyEnabled: data.weeklyEnabled,
                    dailySnapshotEnabled: data.dailySnapshotEnabled,
                    sendToAllTeamMembers: data.sendToAllTeamMembers,
                    weeklyReportTier: data.reportTier
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

    loadPlatformSettings = async () => {
        this.setState({ platformLoading: true });
        try {
            const res = await window.api.get('/api/v1/admin/platform/settings');
            if (res?.data) {
                this.setState({ platformSettings: res.data });
            }
        } catch (err) {
            console.error('[ManagePage] Failed to load platform settings', err);
        } finally {
            this.setState({ platformLoading: false });
        }
    }

    savePlatformSetting = async (key, value) => {
        this.setState({ platformSaving: true });
        try {
            await window.api.request('/api/v1/admin/platform/settings', {
                method: 'PUT',
                body: JSON.stringify({ [key]: value })
            });
            this.setState(prev => ({
                platformSettings: { ...prev.platformSettings, [key]: value }
            }));
        } catch (err) {
            console.error('[ManagePage] Failed to save platform setting', err);
            // Revert UI on failure
            await this.loadPlatformSettings();
        } finally {
            this.setState({ platformSaving: false });
        }
    }

    render() {
        const { activeTab, loading, orgs, accounts, platformSettings, platformLoading, platformSaving } = this.state;

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
                    <li class="nav-item">
                        <a
                            class="nav-link ${activeTab === 'platform-settings' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'platform-settings' }); this.loadPlatformSettings(); }}
                        >
                            <i class="ti ti-settings me-2"></i>
                            Platform Settings
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
                    ${activeTab === 'platform-settings' && html`
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">Platform-wide Settings</h3>
                            </div>
                            <div class="card-body">
                                ${platformLoading ? html`<div class="text-muted">Loading settings...</div>` : html`
                                    <div class="mb-4">
                                        <h4 class="mb-2">WhatsApp Notifications</h4>
                                        <div class="form-check form-switch d-flex align-items-start gap-2">
                                            <input
                                                class="form-check-input"
                                                type="checkbox"
                                                id="whatsappDailyEnabled"
                                                checked=${platformSettings.whatsappDailyEnabled}
                                                disabled=${platformSaving}
                                                onChange=${(e) => this.savePlatformSetting('whatsAppDailyEnabled', e.target.checked)}
                                            />
                                            <div>
                                                <label class="form-check-label fw-bold" for="whatsappDailyEnabled">
                                                    Daily WhatsApp Push Notifications
                                                </label>
                                                <div class="text-muted small mt-1">
                                                    When enabled, sends a daily security brief via WhatsApp to each organisation's configured number.
                                                    Requires the recipient to have messaged the MAGI number within the past 24 hours (Meta service window).
                                                    Uses the Utility Conversation category. <strong>Disabled by default.</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="mb-4">
                                        <h4 class="mb-2">AI Reports</h4>
                                        <div class="form-check form-switch d-flex align-items-start gap-2">
                                            <input
                                                class="form-check-input"
                                                type="checkbox"
                                                id="aiExecutiveSummaryEnabled"
                                                checked=${platformSettings.aiExecutiveSummaryEnabled}
                                                disabled=${platformSaving}
                                                onChange=${(e) => this.savePlatformSetting('aiExecutiveSummaryEnabled', e.target.checked)}
                                            />
                                            <div>
                                                <label class="form-check-label fw-bold" for="aiExecutiveSummaryEnabled">
                                                    AI Executive Summary in Reports
                                                </label>
                                                <div class="text-muted small mt-1">
                                                    When enabled, daily security reports include a short AI-written executive summary based on the current posture snapshot.
                                                </div>
                                            </div>
                                        </div>

                                        <div class="form-check form-switch d-flex align-items-start gap-2 mt-3">
                                            <input
                                                class="form-check-input"
                                                type="checkbox"
                                                id="aiExecutiveSummaryInternetEnabled"
                                                checked=${platformSettings.aiExecutiveSummaryInternetEnabled}
                                                disabled=${platformSaving || !platformSettings.aiExecutiveSummaryEnabled}
                                                onChange=${(e) => this.savePlatformSetting('aiExecutiveSummaryInternetEnabled', e.target.checked)}
                                            />
                                            <div>
                                                <label class="form-check-label fw-bold" for="aiExecutiveSummaryInternetEnabled">
                                                    Include Threat Intel Enrichment
                                                </label>
                                                <div class="text-muted small mt-1">
                                                    When enabled, the AI summary may include KEV/EPSS/CVE description context (if available). Disable to keep the summary strictly snapshot-only.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mt-4 pt-3 border-top">
                                        <h4 class="mb-2">WhatsApp AI Chat</h4>
                                        <div class="text-muted small">
                                            AI Chat via WhatsApp is always active when the webhook is configured.
                                            Users initiate conversations via <a href="https://wa.me/message/67GDBBIFLTSGG1" target="_blank" rel="noopener">wa.me/message/67GDBBIFLTSGG1</a>
                                            and chat with Officer MAGI. This is free for user-initiated conversations (no template required).
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
}
