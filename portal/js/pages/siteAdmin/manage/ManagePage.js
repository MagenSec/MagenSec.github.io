/**
 * Manage Page - Organizations, Accounts, Admin Actions
 * Route: #!/siteadmin/manage
 */

import { OrganizationsTab } from './components/OrganizationsTab.js';
import { AccountsTab } from './components/AccountsTab.js';
import { AdminActionsTab } from './components/AdminActionsTab.js';
import { MagiCodesTab } from './components/MagiCodesTab.js';
import { InvoiceManagementTab } from './components/InvoiceManagementTab.js';
import { PerfTab } from './components/PerfTab.js';

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
            activeTab: 'organizations', // 'organizations', 'accounts', 'magi-codes', 'admin-actions', 'platform-settings'
            loading: true,
            orgs: [],
            orgsRefreshKey: 0,
            accounts: [],
            licenseCatalog: null,
            platformSettings: {
                whatsappDailyEnabled: false,
                aiExecutiveSummaryEnabled: false,
                aiExecutiveSummaryInternetEnabled: false,
                sweTodaySnapshotRefreshHours: 6,
            },
            platformLoading: false,
            platformSaving: false
        };
    }

    async componentDidMount() {
        await this.loadData();
    }

    listOrganizations = async ({
        includeDisabled = true,
        orgType = 'All',
        search = '',
        orgIds = [],
        includeLicenses = true,
        activeOnlyLicenses = true,
        page = 1,
        pageSize = 50,
        sortBy = 'CreatedAt',
        sortOrder = 'desc'
    } = {}) => {
        try {
            const params = new URLSearchParams();
            params.set('includeDisabled', includeDisabled ? 'true' : 'false');
            params.set('orgType', orgType || 'All');
            params.set('includeLicenses', includeLicenses ? 'true' : 'false');
            params.set('activeOnlyLicenses', activeOnlyLicenses ? 'true' : 'false');
            params.set('page', String(page || 1));
            params.set('pageSize', String(pageSize || 50));
            params.set('sortBy', sortBy || 'CreatedAt');
            params.set('sortOrder', sortOrder || 'desc');

            if (typeof search === 'string' && search.trim().length > 0) {
                params.set('search', search.trim());
            }

            if (Array.isArray(orgIds) && orgIds.length > 0) {
                params.set('orgIds', orgIds.join(','));
            }

            const response = await window.api.get(`/api/v1/admin/orgs?${params.toString()}`);
            if (response?.success === false) {
                return { success: false, message: response?.message || 'Failed to list organizations' };
            }

            return { success: true, data: response?.data || {} };
        } catch (err) {
            console.error('[ManagePage] listOrganizations failed', err);
            return { success: false, message: err?.message || 'Failed to list organizations' };
        }
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

    deleteAccount = async (userId) => {
        try {
            const response = await window.api.request(`/api/v1/admin/accounts/${encodeURIComponent(userId)}`, {
                method: 'DELETE'
            });

            if (response?.success === false) {
                window.toast?.show?.(response?.message || 'Failed to delete account', 'error');
                return { success: false, message: response?.message };
            }

            window.toast?.show?.('Account deleted successfully', 'success');
            await this.loadData();
            return { success: true, data: response?.data };
        } catch (err) {
            console.error('[ManagePage] deleteAccount failed', err);
            window.toast?.show?.(err?.message || 'Failed to delete account', 'error');
            return { success: false, message: err?.message };
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
                    orgType: data.orgType || 'Business',
                    licenseType: data.licenseType,
                    licenseTier: data.licenseTier,
                    licensePackage: data.licensePackage || null,
                    licenseAddOns: data.licenseAddOns,
                    discountType: data.discountType,
                    discountValue: data.discountValue,
                    isDemoOrg: !!data.isDemoOrg,
                    dailyReportEnabled: !!data.dailyReportEnabled,
                    weeklyReportEnabled: !!data.weeklyReportEnabled,
                    sendToAllTeamMembers: data.sendToAllTeamMembers,
                    industry: data.industry,
                    orgSize: data.orgSize,
                    nextAuditDate: data.nextAuditDate,
                    orgRegion: data.orgRegion,
                    storageAccountName: data.storageAccountName || null,
                    createDedicatedStorageAccount: !!data.createDedicatedStorageAccount,
                    todaySnapshotRefreshHoursOverride: data.todaySnapshotRefreshHoursOverride
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
                    orgType: data.orgType,
                    isDemoOrg: data.isDemoOrg !== undefined ? !!data.isDemoOrg : undefined,
                    dailyReportEnabled: !!data.dailyReportEnabled,
                    weeklyReportEnabled: !!data.weeklyReportEnabled,
                    sendToAllTeamMembers: data.sendToAllTeamMembers,
                    industry: data.industry,
                    orgSize: data.orgSize,
                    nextAuditDate: data.nextAuditDate
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
            
            const [orgsRes, accountsRes, catalogRes] = await Promise.all([
                window.api.get('/api/v1/admin/orgs'),
                window.api.get('/api/v1/admin/accounts'),
                window.api.get('/api/v1/admin/orgs/license-catalog')
            ]);

            const orgsData = firstArrayOf(orgsRes, ['data', 'items', 'orgs', 'organizations']);
            const accountsData = firstArrayOf(accountsRes, ['data', 'items', 'accounts']);

            this.setState((prev) => ({
                loading: false,
                orgs: orgsData,
                orgsRefreshKey: prev.orgsRefreshKey + 1,
                accounts: accountsData,
                licenseCatalog: catalogRes?.data || null
            }));
        } catch (error) {
            console.error('Failed to load data:', error);
            this.setState({ loading: false });
        }
    }

    // Admin Actions Callbacks
    handleTriggerCron = async (taskOrRequest, params = {}) => {
        try {
            const request = typeof taskOrRequest === 'string'
                ? { taskId: taskOrRequest, ...params }
                : { ...(taskOrRequest || {}) };
            const label = request.jobId || request.taskId || 'Cron job';

            const response = await window.api.adminTriggerCron(request);

            if (!response?.success) {
                window.toast?.show?.(response?.message || `Failed to queue ${label}`, 'error');
                return { success: false, message: response?.message };
            }

            const queuedStatus = response?.data?.status || 'Queued';
            window.toast?.show?.(`${label} accepted with status ${queuedStatus}`, 'success');
            return {
                success: true,
                data: response?.data || null
            };
        } catch (error) {
            console.error('[ManagePage] handleTriggerCron failed', error);
            window.toast?.show?.(error?.message || 'Failed to queue cron job', 'error');
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
        const { activeTab, loading, orgs, orgsRefreshKey, accounts, licenseCatalog, platformSettings, platformLoading, platformSaving } = this.state;

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
                            <span class="badge bg-blue-lt text-blue ms-2">${orgs.length}</span>
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
                            <span class="badge bg-blue-lt text-blue ms-2">${accounts.length}</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a
                            class="nav-link ${activeTab === 'magi-codes' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'magi-codes' }); }}
                        >
                            <i class="ti ti-sparkles me-2"></i>
                            MAGICodes
                        </a>
                    </li>
                    <li class="nav-item">
                        <a
                            class="nav-link ${activeTab === 'invoices' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'invoices' }); }}
                        >
                            <i class="ti ti-file-invoice me-2"></i>
                            Invoices
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
                            class="nav-link ${activeTab === 'perf' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'perf' }); }}
                        >
                            <i class="ti ti-activity me-2"></i>
                            Performance
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
                        licenseCatalog=${licenseCatalog}
                        refreshKey=${orgsRefreshKey}
                        onListOrgs=${this.listOrganizations}
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
                        onDeleteAccount=${this.deleteAccount}
                    />`}
                    ${activeTab === 'magi-codes' && html`<${MagiCodesTab} />`}
                    ${activeTab === 'invoices' && html`<${InvoiceManagementTab} />`}
                    ${activeTab === 'perf' && html`<${PerfTab} />`}
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

                                    <div class="mb-4">
                                        <h4 class="mb-2">SWE Freshness Controls</h4>
                                        <div class="row g-3 align-items-end">
                                            <div class="col-md-4">
                                                <label class="form-label fw-bold" for="sweTodaySnapshotRefreshHours">
                                                    Today's Snapshot Refresh Cadence (hours)
                                                </label>
                                                <input
                                                    id="sweTodaySnapshotRefreshHours"
                                                    type="number"
                                                    min="1"
                                                    max="24"
                                                    step="1"
                                                    class="form-control"
                                                    value=${platformSettings.sweTodaySnapshotRefreshHours ?? 6}
                                                    disabled=${platformSaving}
                                                    onChange=${(e) => {
                                                        const parsed = Number.parseInt(e.target.value, 10);
                                                        if (!Number.isNaN(parsed)) {
                                                            this.savePlatformSetting('sweTodaySnapshotRefreshHours', Math.max(1, Math.min(24, parsed)));
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div class="col-md-8">
                                                <div class="text-muted small mt-1">
                                                    Controls how often cron refreshes <strong>today's rolling snapshot</strong>. Default is 6 hours; lower this for high-volume orgs to reduce merge gaps.
                                                    Per-org overrides are stored on organization rows and evaluated in the hourly cron pass.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mt-4 pt-3 border-top">
                                        <h4 class="mb-2">Org License Catalog (JSON)</h4>
                                        <div class="text-muted small mb-2">
                                            View current effective catalog (loaded from Metadata override if present, otherwise fallback JSON file).
                                        </div>
                                        <pre
                                            class="form-control"
                                            style="font-family: Consolas, 'Courier New', monospace; white-space: pre-wrap; max-height: 360px; overflow: auto;"
                                        >${JSON.stringify(licenseCatalog || {}, null, 2)}</pre>
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
