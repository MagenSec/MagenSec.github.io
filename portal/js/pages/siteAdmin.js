import { api } from '../api.js';
import { auth } from '../auth.js';
import toast from '../toast.js';
import { logger } from '../config.js';
import { ApiAuditPage } from './apiAudit.js';
import { DeviceActivityPage } from './deviceActivity.js';
import { CronActivityPage } from './cronActivity.js';
import { AiReportsAnalysisPage } from './aiReportsAnalysis.js';
import ReportPreviewPage from './ReportPreviewPage.js';
import { LicenseAdjustmentDialog } from '../components/LicenseAdjustmentDialog.js';
import { BusinessMatrixPage } from './businessMatrix.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

const ORG_DURATION_OPTIONS = [
    { label: '6 months (180 days)', value: 180 },
    { label: '1 year (365 days)', value: 365 },
    { label: '2 years (730 days)', value: 730 },
    { label: '3 years (1095 days)', value: 1095 }
];

// Local helper to keep existing showToast signature while using default export
const showToast = (message, type) => toast.show(message, type);

export function SiteAdminPage() {
    const [mainSection, setMainSection] = useState('business-matrix'); // 'business-matrix', 'overview', 'activity', or 'preview'
    const [activeTab, setActiveTab] = useState('organizations');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [orgs, setOrgs] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    // Organization Management State
    const [newOrgName, setNewOrgName] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [newOrgSeats, setNewOrgSeats] = useState(20);
    const [newOrgDuration, setNewOrgDuration] = useState('365');
    const [newReportEnabled, setNewReportEnabled] = useState(true);
    const [newWeeklyEnabled, setNewWeeklyEnabled] = useState(true);
    const [newDailySnapshotEnabled, setNewDailySnapshotEnabled] = useState(false);
    const [newSendToAllMembers, setNewSendToAllMembers] = useState(true);
    const [newBusinessTier, setNewBusinessTier] = useState('Professional');
    const [updateOrgName, setUpdateOrgName] = useState('');
    const [updateReportEnabled, setUpdateReportEnabled] = useState(true);
    const [updateWeeklyEnabled, setUpdateWeeklyEnabled] = useState(true);
    const [updateDailySnapshotEnabled, setUpdateDailySnapshotEnabled] = useState(false);
    const [updateSendToAllMembers, setUpdateSendToAllMembers] = useState(true);
    const [updateBusinessTier, setUpdateBusinessTier] = useState('Professional');
    const [orgSearch, setOrgSearch] = useState('');
    const [orgTypeFilter, setOrgTypeFilter] = useState('All'); // 'All', 'Business', 'Personal'
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [orgLicenses, setOrgLicenses] = useState([]);
    const [showCreateLicense, setShowCreateLicense] = useState(false);
    const [newLicenseSeats, setNewLicenseSeats] = useState(20);
    const [newLicenseDuration, setNewLicenseDuration] = useState(365);
    const [orgOwnerSearch, setOrgOwnerSearch] = useState('');
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [showTransferOwner, setShowTransferOwner] = useState(false);
    const [transferringOwner, setTransferringOwner] = useState(false);
    const [newTransferOwner, setNewTransferOwner] = useState('');
    const [adjustingLicense, setAdjustingLicense] = useState(null);

    // Account Management State
    const [accountsSearch, setAccountsSearch] = useState('');
    const [showChangeUserType, setShowChangeUserType] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [newUserType, setNewUserType] = useState('');
    const [changingUserType, setChangingUserType] = useState(false);

    // Cron Management State
    const [cronStatus, setCronStatus] = useState(null);
    const [loadingCron, setLoadingCron] = useState(false);

    // Admin Actions State
    const [triggeringCron, setTriggeringCron] = useState(null);
    const [cronResult, setCronResult] = useState(null);
    const [resetOrgId, setResetOrgId] = useState('');
    const [resettingRemediation, setResettingRemediation] = useState(false);
    const [resetResult, setResetResult] = useState(null);

    // Email validation helper
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    useEffect(() => {
        const user = auth.getUser();
        if (user?.userType !== 'SiteAdmin') {
            window.location.hash = '#!/dashboard';
            return;
        }
        loadData();
    }, []);

    // Close modal on Escape key
    useEffect(() => {
        if (!selectedOrg) return;
        const handler = (e) => {
            if (e.key === 'Escape') {
                setSelectedOrg(null);
                setSelectedOrgId('');
                setOrgLicenses([]);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectedOrg]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load Orgs
            const orgsRes = await api.get('/api/v1/admin/orgs');
            if (orgsRes.success) {
                setOrgs(orgsRes.data || []);
            }

            // Load Accounts
            try {
                const accountsRes = await api.adminListAccounts();
                if (accountsRes.success && accountsRes.data) {
                    const accountsData = accountsRes.data.accounts ?? accountsRes.data ?? [];
                    setAccounts(Array.isArray(accountsData) ? accountsData : []);
                }
            } catch (err) {
                setAccounts([]);
                logger.debug('[SiteAdmin] Accounts endpoint not available', err);
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error loading data:', error);
            showToast('Failed to load admin data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadCronStatus = async () => {
        setLoadingCron(true);
        try {
            const res = await api.get('/api/v1/admin/cron/status');
            if (res.success) {
                setCronStatus(res.data);
            } else {
                showToast(res.message || 'Failed to load cron status', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error loading cron status:', error);
            showToast('Failed to load cron status', 'error');
        } finally {
            setLoadingCron(false);
        }
    };

    const onTriggerCron = async (taskId) => {
        setTriggeringCron(taskId);
        setCronResult(null);
        try {
            const res = await api.adminTriggerCron(taskId);
            if (res.success) {
                setCronResult({ success: true, taskId, data: res.data });
                showToast(`Successfully triggered ${taskId}`, 'success');
            } else {
                setCronResult({ success: false, taskId, error: res.message });
                showToast(res.message || `Failed to trigger ${taskId}`, 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error triggering cron:', error);
            setCronResult({ success: false, taskId, error: error.message });
            showToast(`Failed to trigger ${taskId}`, 'error');
        } finally {
            setTriggeringCron(null);
        }
    };

    const onResetRemediation = async () => {
        if (!resetOrgId) {
            showToast('Please select an organization', 'warning');
            return;
        }
        
        setResettingRemediation(true);
        setResetResult(null);
        try {
            const res = await api.adminResetRemediation(resetOrgId, true, true);
            if (res.success) {
                setResetResult({ success: true, data: res.data });
                showToast('Remediation status reset successfully', 'success');
            } else {
                setResetResult({ success: false, error: res.message });
                showToast(res.message || 'Failed to reset remediation status', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error resetting remediation:', error);
            setResetResult({ success: false, error: error.message });
            showToast('Failed to reset remediation status', 'error');
        } finally {
            setResettingRemediation(false);
        }
    };

    const handleSelectOrg = async (orgId) => {
        setSelectedOrgId(orgId);
        const org = orgs.find(o => o.orgId === orgId);
        setSelectedOrg(org);
        if (org) {
            setUpdateOrgName(org.orgName || org.name || '');
            // Load report settings
            try {
                const configRes = await api.get(`/api/v1/admin/email/${orgId}/config`);
                if (configRes.success && configRes.data) {
                    setUpdateReportEnabled(configRes.data.reportEnabled !== false);
                    setUpdateWeeklyEnabled(!!configRes.data.weeklyEnabled);
                    setUpdateDailySnapshotEnabled(!!configRes.data.dailySnapshotEnabled);
                    setUpdateSendToAllMembers(configRes.data.sendToAllTeamMembers !== false);
                    setUpdateBusinessTier(configRes.data.reportTier || 'Professional');
                }
            } catch (error) {
                logger.warn('[SiteAdmin] Could not load report config:', error);
                // Use defaults
                setUpdateReportEnabled(true);
                setUpdateWeeklyEnabled(true);
                setUpdateDailySnapshotEnabled(false);
                setUpdateSendToAllMembers(true);
                setUpdateBusinessTier('Professional');
            }
            // Load licenses
            try {
                const res = await api.get(`/api/v1/licenses/org/${orgId}`);
                if (res.success) {
                    setOrgLicenses(res.data || []);
                }
            } catch (error) {
                logger.error('[SiteAdmin] Error loading licenses:', error);
                showToast('Failed to load organization licenses', 'error');
            }
        }
    };

    const onCreateOrg = async () => {
        if (!newOrgName || !newOwnerEmail) {
            showToast('Please fill in all required fields', 'warning');
            return;
        }

        // Validate org name length (minimum 4 characters for proper license key generation)
        if (newOrgName.trim().length < 4) {
            showToast('Organization name must be at least 4 characters long for proper license key generation', 'warning');
            return;
        }

        try {
            const payload = {
                orgName: newOrgName,
                ownerEmail: newOwnerEmail,
                seats: parseInt(newOrgSeats, 10),
                days: parseInt(newOrgDuration, 10),
                reportEnabled: newReportEnabled,
                weeklyEnabled: newWeeklyEnabled,
                dailySnapshotEnabled: newDailySnapshotEnabled,
                sendToAllTeamMembers: newSendToAllMembers,
                reportTier: newBusinessTier
            };

            const res = await api.post('/api/v1/admin/orgs', payload);
            if (res.success) {
                showToast('Organization created successfully', 'success');
                setNewOrgName('');
                setNewOwnerEmail('');
                setNewOrgSeats(20);
                setNewOrgDuration('365');
                setNewReportEnabled(true);
                setNewWeeklyEnabled(true);
                setNewDailySnapshotEnabled(false);
                setNewSendToAllMembers(true);
                setNewBusinessTier('Professional');
                loadData();
            } else {
                showToast(res.message || 'Failed to create organization', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error creating org:', error);
            showToast('Failed to create organization', 'error');
        }
    };

    const onUpdateOrg = async () => {
        if (!selectedOrgId || !updateOrgName) return;

        // Validate org name length (minimum 4 characters)
        if (updateOrgName.trim().length < 4) {
            showToast('Organization name must be at least 4 characters long', 'warning');
            return;
        }

        try {
            const res = await api.put(`/api/v1/admin/orgs/${selectedOrgId}`, {
                orgName: updateOrgName,
                reportEnabled: updateReportEnabled,
                weeklyEnabled: updateWeeklyEnabled,
                dailySnapshotEnabled: updateDailySnapshotEnabled,
                sendToAllTeamMembers: updateSendToAllMembers,
                reportTier: updateBusinessTier
            });

            if (res.success) {
                showToast('Organization updated successfully', 'success');
                loadData();
            } else {
                showToast(res.message || 'Failed to update organization', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error updating org:', error);
            showToast('Failed to update organization', 'error');
        }
    };

    const onCreateLicense = async (e) => {
        if (e) e.preventDefault();
        if (!selectedOrgId) return;

        try {
            const res = await api.post('/api/v1/licenses', {
                orgId: selectedOrgId,
                seats: parseInt(newLicenseSeats),
                durationDays: parseInt(newLicenseDuration)
            });

            if (res.success) {
                showToast('License created successfully', 'success');
                setShowCreateLicense(false);
                setNewLicenseSeats(20);
                setNewLicenseDuration(365);
                loadData();
            } else {
                showToast(res.message || 'Failed to create license', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error creating license:', error);
            showToast('Failed to create license', 'error');
        }
    };

    const onDisableLicense = async (license) => {
        if (!confirm(`Are you sure you want to ${license.isDisabled ? 'enable' : 'disable'} this license?`)) return;

        try {
            const endpoint = license.isDisabled ? 'enable' : 'disable';
            const res = await api.put(`/api/v1/licenses/${license.licenseId}/${endpoint}`);

            if (res.success) {
                showToast(`License ${license.isDisabled ? 'enabled' : 'disabled'} successfully`, 'success');
                loadData();
            } else {
                showToast(res.message || `Failed to ${endpoint} license`, 'error');
            }
        } catch (error) {
            logger.error(`[SiteAdmin] Error ${license.isDisabled ? 'enabling' : 'disabling'} license:`, error);
            showToast(`Failed to ${license.isDisabled ? 'enable' : 'disable'} license`, 'error');
        }
    };

    const onDeleteLicense = async (licenseId) => {
        if (!confirm('Are you sure you want to DELETE this license? This action cannot be undone.')) return;

        try {
            const res = await api.delete(`/api/v1/licenses/${licenseId}`);

            if (res.success) {
                showToast('License deleted successfully', 'success');
                loadData();
            } else {
                showToast(res.message || 'Failed to delete license', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error deleting license:', error);
            showToast('Failed to delete license', 'error');
        }
    };

    const onAdjustLicense = (license) => {
        setAdjustingLicense(license);
    };

    const onDisableOrg = async () => {
        if (!selectedOrgId) return;
        const action = selectedOrg.isDisabled ? 'enable' : 'disable';
        
        if (!confirm(`Are you sure you want to ${action} this organization?`)) return;

        try {
            const endpoint = selectedOrg.isDisabled ? 'enable' : 'disable';
            const res = await api.put(`/api/v1/admin/orgs/${selectedOrgId}/${endpoint}`);

            if (res.success) {
                showToast(`Organization ${action}d successfully`, 'success');
                loadData();
                // Update local state
                setSelectedOrg({ ...selectedOrg, isDisabled: !selectedOrg.isDisabled });
            } else {
                showToast(res.message || `Failed to ${action} organization`, 'error');
            }
        } catch (error) {
            logger.error(`[SiteAdmin] Error ${action}ing org:`, error);
            showToast(`Failed to ${action} organization`, 'error');
        }
    };

    const onDeleteOrg = async () => {
        if (!selectedOrgId) return;
        
        if (!confirm('Are you sure you want to DELETE this organization? This action cannot be undone and will delete all associated data.')) return;

        try {
            const res = await api.delete(`/api/v1/admin/orgs/${selectedOrgId}`);

            if (res.success) {
                showToast('Organization deleted successfully', 'success');
                setSelectedOrgId('');
                setSelectedOrg(null);
                loadData();
            } else {
                showToast(res.message || 'Failed to delete organization', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error deleting org:', error);
            showToast('Failed to delete organization', 'error');
        }
    };

    const onTransferOwnership = async () => {
        if (!selectedOrgId || !newTransferOwner) return;

        if (!confirm(`Transfer ownership of ${selectedOrg.orgName} to ${newTransferOwner}?`)) return;

        setTransferringOwner(true);
        try {
            const res = await api.post(`/api/v1/admin/orgs/${selectedOrgId}/transfer`, {
                newOwnerEmail: newTransferOwner
            });

            if (res.success) {
                showToast('Ownership transferred successfully', 'success');
                setShowTransferOwner(false);
                setNewTransferOwner('');
                loadData();
            } else {
                showToast(res.message || 'Failed to transfer ownership', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error transferring ownership:', error);
            showToast('Failed to transfer ownership', 'error');
        } finally {
            setTransferringOwner(false);
        }
    };

    const onChangeUserType = async () => {
        if (!selectedUser || !newUserType) return;

        setChangingUserType(true);
        try {
            // Use change-type endpoint to toggle Individual <-> SiteAdmin
            const res = await api.put(`/api/v1/admin/users/${selectedUser.userId}/change-type`, {
                newUserType: newUserType
            });

            if (res.success) {
                showToast(`User type changed to ${newUserType}`, 'success');
                setShowChangeUserType(false);
                loadData();
            } else {
                showToast(res.message || 'Failed to change user type', 'error');
            }
        } catch (error) {
            logger.error('[SiteAdmin] Error changing user type:', error);
            showToast('Failed to change user type', 'error');
        } finally {
            setChangingUserType(false);
        }
    };

    const filteredOwnerAccounts = accounts.filter(acc => 
        acc.email.toLowerCase().includes(orgOwnerSearch.toLowerCase())
    );

    const filteredAccounts = accounts.filter(acc => 
        !accountsSearch || 
        acc.email.toLowerCase().includes(accountsSearch.toLowerCase()) ||
        (acc.userType || '').toLowerCase().includes(accountsSearch.toLowerCase())
    );

    // Filter Logic
    const filteredOrgs = orgs.filter(org => {
        const matchesSearch = !orgSearch || 
            (org.orgName || org.name || '').toLowerCase().includes(orgSearch.toLowerCase()) ||
            (org.orgId || '').toLowerCase().includes(orgSearch.toLowerCase()) ||
            (org.ownerEmail || '').toLowerCase().includes(orgSearch.toLowerCase());
        
        // Determine org type: use isPersonal if available, fallback to email pattern match
        const isPersonal = org.isPersonal !== undefined ? org.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(org.orgId);
        const matchesType = orgTypeFilter === 'All' || 
                           (orgTypeFilter === 'Personal' && isPersonal) ||
                           (orgTypeFilter === 'Business' && !isPersonal);
        return matchesSearch && matchesType;
    });

    // Pagination Logic
    const indexOfLastOrg = currentPage * itemsPerPage;
    const indexOfFirstOrg = indexOfLastOrg - itemsPerPage;
    const currentOrgs = filteredOrgs.slice(indexOfFirstOrg, indexOfLastOrg);
    const totalPages = Math.ceil(filteredOrgs.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    if (loading && !orgs.length) {
        return html`
            <div class="container-xl">
                <div class="page-header d-print-none">
                    <h2 class="page-title">Site Administration</h2>
                </div>
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="text-muted mt-2">Loading admin data...</p>
                </div>
            </div>
        `;
    }

    return html`
        <div class="container-xl">
            <div class="page-header d-print-none mb-3">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>
                            Site Administration
                        </h2>
                        <div class="page-subtitle">
                            <span class="text-muted">Manage organizations, accounts, and system activity</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Section Navigation (Four-Level: Business Matrix | Overview | Activity Reports | Preview) -->
            <div class="mb-3">
                <ul class="nav nav-pills nav-fill">
                    <li class="nav-item">
                        <a 
                            class="nav-link ${mainSection === 'business-matrix' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { 
                                e.preventDefault(); 
                                setMainSection('business-matrix');
                            }}
                        >
                            <i class="ti ti-chart-dots-2 me-2"></i>
                            Business Matrix
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${mainSection === 'overview' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { 
                                e.preventDefault(); 
                                setMainSection('overview'); 
                                setActiveTab('organizations');
                            }}
                        >
                            <i class="ti ti-layout-dashboard me-2"></i>
                            Overview
                            <span class="badge bg-primary-lt ms-2">${orgs.length + accounts.length}</span>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${mainSection === 'activity' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { 
                                e.preventDefault(); 
                                setMainSection('activity'); 
                                setActiveTab('user-activity');
                            }}
                        >
                            <i class="ti ti-chart-bar me-2"></i>
                            Activity Reports
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${mainSection === 'preview' ? 'active' : ''}"
                            href="#"
                            onClick=${(e) => { 
                                e.preventDefault(); 
                                setMainSection('preview');
                            }}
                        >
                            <i class="ti ti-eye me-2"></i>
                            Preview
                        </a>
                    </li>
                </ul>
            </div>

            <!-- Render Business Matrix Section -->
            ${mainSection === 'business-matrix' && html`
                <${BusinessMatrixPage} />
            `}

            <!-- Card with Secondary Navigation (Sub-tabs) + Refresh Button -->
            ${mainSection === 'overview' && html`
            <div class="card mb-3">
                <div class="card-header d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center justify-content-between w-100 gap-3">
                        <ul class="nav nav-tabs card-header-tabs">
                            <li class="nav-item">
                                <a 
                                    class="nav-link ${activeTab === 'organizations' ? 'active' : ''}"
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('organizations'); }}
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
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('accounts'); }}
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
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('admin-actions'); }}
                                >
                                    <i class="ti ti-bolt me-2"></i>
                                    Admin Actions
                                </a>
                            </li>
                        </ul>
                        <button class="btn btn-sm btn-primary" onClick=${async () => { setRefreshing(true); await loadData(); setRefreshing(false); }} disabled=${refreshing}>
                            ${refreshing ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            ${refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${activeTab === 'organizations' && html`
                        <div class="row g-3">
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header" style="cursor: pointer;" onClick=${() => setShowCreateForm(!showCreateForm)}>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <h3 class="card-title mb-0">
                                                <i class="${`ti ${showCreateForm ? 'ti-chevron-down' : 'ti-chevron-right'}`} me-2"></i>
                                                Create New Organization
                                            </h3>
                                        </div>
                                    </div>
                                    ${showCreateForm && html`<div class="card-body">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">Organization Name <span class="text-danger">*</span></label>
                                                <input 
                                                    type="text" 
                                                    class=${`form-control ${newOrgName && newOrgName.trim().length < 4 ? 'is-invalid' : ''}`}
                                                    placeholder="Acme Corp" 
                                                    value=${newOrgName} 
                                                    onInput=${(e) => setNewOrgName(e.target.value)}
                                                    minlength="4"
                                                />
                                                <small class="form-text text-muted">Minimum 4 characters required for proper license key generation</small>
                                                ${newOrgName && newOrgName.trim().length < 4 ? html`
                                                    <div class="invalid-feedback d-block">
                                                        Organization name must be at least 4 characters long
                                                    </div>
                                                ` : ''}
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Owner Email <span class="text-danger">*</span></label>
                                                <div class="position-relative">
                                                    <input 
                                                        type="text" 
                                                        class=${`form-control ${newOwnerEmail && !isValidEmail(newOwnerEmail) ? 'is-invalid' : ''}`}
                                                        placeholder="admin@example.com" 
                                                        value=${newOwnerEmail} 
                                                        onInput=${(e) => {
                                                            setNewOwnerEmail(e.target.value);
                                                            setOrgOwnerSearch(e.target.value);
                                                            setShowOwnerDropdown(true);
                                                        }}
                                                        onFocus=${() => setShowOwnerDropdown(true)}
                                                    />
                                                    ${showOwnerDropdown && filteredOwnerAccounts.length > 0 && html`
                                                        <div class="dropdown-menu show position-absolute w-100" style="top: 100%; z-index: 1000; display: block;">
                                                            ${filteredOwnerAccounts.slice(0, 10).map(acc => html`
                                                                <button 
                                                                    type="button"
                                                                    class="dropdown-item"
                                                                    onClick=${() => {
                                                                        setNewOwnerEmail(acc.email);
                                                                        setShowOwnerDropdown(false);
                                                                    }}
                                                                >
                                                                    <small>${acc.email}</small>
                                                                </button>
                                                            `)}
                                                        </div>
                                                    `}
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">Seats</label>
                                                <input type="number" class="form-control" placeholder="20" value=${newOrgSeats} onInput=${(e) => setNewOrgSeats(e.target.value)} />
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label">License Duration</label>
                                                <select 
                                                    class="form-select" 
                                                    value=${newOrgDuration}
                                                    onChange=${(e) => setNewOrgDuration(e.target.value)}
                                                >
                                                    ${ORG_DURATION_OPTIONS.map(opt => html`
                                                        <option value=${opt.value}>${opt.label}</option>
                                                    `)}
                                                </select>
                                            </div>

                                            <div class="col-12">
                                                <hr class="my-2" />
                                            </div>

                                            <!-- Enable Reports Toggle -->
                                            <div class="col-12">
                                                <div class="form-check form-switch d-flex align-items-start gap-2">
                                                    <input 
                                                        class="form-check-input" 
                                                        type="checkbox" 
                                                        id="newReportEnabled"
                                                        checked=${newReportEnabled}
                                                        onChange=${(e) => setNewReportEnabled(e.target.checked)}
                                                        style="width: 40px; height: 20px; margin-top: 4px; flex-shrink: 0;"
                                                    />
                                                    <label class="form-check-label" for="newReportEnabled">
                                                        <strong>Enable Security Reports</strong>
                                                        <div class="small text-muted">Configure automated security reporting for this organization</div>
                                                    </label>
                                                </div>
                                            </div>

                                            <!-- Report Configuration - Only shown when reports enabled -->
                                            ${newReportEnabled ? html`
                                                <div class="col-12">
                                                    <div class="card border border-light">
                                                        <div class="card-header">
                                                            <h5 class="card-title mb-0"><i class="ti ti-mail me-2"></i>Report Configuration</h5>
                                                        </div>
                                                        <div class="card-body">
                                                            <div class="d-flex gap-4 flex-wrap">
                                                                <!-- Business Tier Toggle -->
                                                                <div class="d-flex flex-column gap-2">
                                                                    <label class="form-label mb-0"><strong>Business Tier</strong></label>
                                                                    <div class="btn-group" role="group">
                                                                        <input 
                                                                            type="radio" 
                                                                            class="btn-check" 
                                                                            id="newTierPro"
                                                                            name="newTier"
                                                                            value="Professional"
                                                                            checked=${newBusinessTier === 'Professional'}
                                                                            onChange=${(e) => setNewBusinessTier(e.target.value)}
                                                                        />
                                                                        <label class="btn btn-outline-primary" for="newTierPro">Professional</label>
                                                                        <input 
                                                                            type="radio" 
                                                                            class="btn-check" 
                                                                            id="newTierPrem"
                                                                            name="newTier"
                                                                            value="Premium"
                                                                            checked=${newBusinessTier === 'Premium'}
                                                                            onChange=${(e) => setNewBusinessTier(e.target.value)}
                                                                        />
                                                                        <label class="btn btn-outline-primary" for="newTierPrem">Premium</label>
                                                                    </div>
                                                                </div>

                                                                <!-- Weekly Report Toggle -->
                                                                <div class="d-flex flex-column gap-2">
                                                                    <label class="form-label mb-0"><strong>Weekly Report</strong></label>
                                                                    <div class="form-check form-switch">
                                                                        <input 
                                                                            class="form-check-input" 
                                                                            type="checkbox" 
                                                                            id="newWeeklyEnabled"
                                                                            checked=${newWeeklyEnabled}
                                                                            onChange=${(e) => setNewWeeklyEnabled(e.target.checked)}
                                                                            style="width: 40px; height: 20px; margin-top: 0px;"
                                                                        />
                                                                    </div>
                                                                    <small class="text-muted">Every Monday</small>
                                                                </div>

                                                                <!-- Daily Snapshot Toggle -->
                                                                <div class="d-flex flex-column gap-2">
                                                                    <label class="form-label mb-0"><strong>Daily Snapshot</strong></label>
                                                                    <div class="form-check form-switch">
                                                                        <input 
                                                                            class="form-check-input" 
                                                                            type="checkbox" 
                                                                            id="newDailySnapshotEnabled"
                                                                            checked=${newDailySnapshotEnabled}
                                                                            onChange=${(e) => setNewDailySnapshotEnabled(e.target.checked)}
                                                                            style="width: 40px; height: 20px; margin-top: 0px;"
                                                                        />
                                                                    </div>
                                                                    <small class="text-muted">Basic snapshot</small>
                                                                </div>

                                                                <!-- Send To All Members Toggle -->
                                                                <div class="d-flex flex-column gap-2">
                                                                    <label class="form-label mb-0"><strong>Send To All Members</strong></label>
                                                                    <div class="form-check form-switch">
                                                                        <input 
                                                                            class="form-check-input" 
                                                                            type="checkbox" 
                                                                            id="newSendToAllMembers"
                                                                            checked=${newSendToAllMembers}
                                                                            onChange=${(e) => setNewSendToAllMembers(e.target.checked)}
                                                                            style="width: 40px; height: 20px; margin-top: 0px;"
                                                                        />
                                                                    </div>
                                                                    <small class="text-muted">Owner + team</small>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ` : null}

                                            <div class="col-12">
                                                <button 
                                                    class="btn btn-primary" 
                                                    onClick=${onCreateOrg}
                                                    disabled=${!newOrgName || newOrgName.trim().length < 4 || !newOwnerEmail || !isValidEmail(newOwnerEmail)}
                                                >
                                                    <i class="ti ti-plus me-2"></i>
                                                    Create Organization
                                                </button>
                                            </div>
                                        </div>
                                    </div>`}
                                </div>
                            </div>

                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Manage Organizations</h3>
                                        <div class="card-actions ms-auto">
                                            <div class="d-flex gap-2">
                                                <!-- Org Type Filter -->
                                                <div class="btn-group" role="group">
                                                    <input 
                                                        type="radio" 
                                                        class="btn-check" 
                                                        id="filterAll"
                                                        name="orgTypeFilter"
                                                        value="All"
                                                        checked=${orgTypeFilter === 'All'}
                                                        onChange=${(e) => {
                                                            setOrgTypeFilter(e.target.value);
                                                            setCurrentPage(1);
                                                        }}
                                                    />
                                                    <label class="btn btn-outline-secondary btn-sm" for="filterAll">All</label>
                                                    <input 
                                                        type="radio" 
                                                        class="btn-check" 
                                                        id="filterBusiness"
                                                        name="orgTypeFilter"
                                                        value="Business"
                                                        checked=${orgTypeFilter === 'Business'}
                                                        onChange=${(e) => {
                                                            setOrgTypeFilter(e.target.value);
                                                            setCurrentPage(1);
                                                        }}
                                                    />
                                                    <label class="btn btn-outline-secondary btn-sm" for="filterBusiness"><i class="ti ti-building me-1"></i>Business</label>
                                                    <input 
                                                        type="radio" 
                                                        class="btn-check" 
                                                        id="filterPersonal"
                                                        name="orgTypeFilter"
                                                        value="Personal"
                                                        checked=${orgTypeFilter === 'Personal'}
                                                        onChange=${(e) => {
                                                            setOrgTypeFilter(e.target.value);
                                                            setCurrentPage(1);
                                                        }}
                                                    />
                                                    <label class="btn btn-outline-secondary btn-sm" for="filterPersonal"><i class="ti ti-user me-1"></i>Personal</label>
                                                </div>
                                                <!-- Search -->
                                                <div class="input-icon">
                                                    <span class="input-icon-addon">
                                                        <i class="ti ti-search"></i>
                                                    </span>
                                                    <input 
                                                        type="text" 
                                                        class="form-control" 
                                                        placeholder="Search organizations..." 
                                                        value=${orgSearch}
                                                        onInput=${(e) => {
                                                            setOrgSearch(e.target.value);
                                                            setCurrentPage(1);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="card-body">
                                        <div class="table-responsive">
                                            <table class="table table-vcenter card-table">
                                                <thead>
                                                    <tr>
                                                        <th>Organization</th>
                                                        <th>Owner</th>
                                                        <th>Credits</th>
                                                        <th>Status</th>
                                                        <th>Created</th>
                                                        <th class="w-1">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${currentOrgs.map(org => html`
                                                        <tr>
                                                            <td>
                                                                <div class="d-flex align-items-center gap-2">
                                                                    ${(() => {
                                                                        // Determine org type: use isPersonal if available, fallback to email check
                                                                        const isPersonal = org.isPersonal !== undefined ? org.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(org.orgId);
                                                                        return isPersonal ? html`
                                                                            <span class="badge bg-info-lt" style="padding: 6px 8px; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                                                                                <i class="ti ti-user" style="font-size: 16px;"></i>
                                                                            </span>
                                                                        ` : html`
                                                                            <span class="badge bg-primary-lt" style="padding: 6px 8px; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                                                                                <i class="ti ti-building" style="font-size: 16px;"></i>
                                                                            </span>
                                                                        `;
                                                                    })()}
                                                                    <div>
                                                                        <div class="fw-bold">${org.orgName || org.name}</div>
                                                                        <div class="text-muted small">${org.orgId}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>${org.ownerEmail}</td>
                                                            <td>
                                                                <div>${org.remainingCredits} / ${org.totalCredits}</div>
                                                                <div class="progress progress-sm mt-1">
                                                                    <div class="progress-bar bg-primary" style="width: ${(org.remainingCredits / org.totalCredits) * 100}%"></div>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span class=${`badge ${org.isDisabled ? 'bg-danger' : 'bg-success'}`}>
                                                                    ${org.isDisabled ? 'Disabled' : 'Active'}
                                                                </span>
                                                            </td>
                                                            <td class="text-muted">
                                                                ${new Date(org.createdAt).toLocaleDateString()}
                                                            </td>
                                                            <td>
                                                                <button 
                                                                    class="btn btn-sm btn-outline-primary"
                                                                    onClick=${() => handleSelectOrg(org.orgId)}
                                                                >
                                                                    Manage
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    `)}
                                                    ${currentOrgs.length === 0 && html`
                                                        <tr>
                                                            <td colspan="6" class="text-center py-4 text-muted">
                                                                No organizations found
                                                            </td>
                                                        </tr>
                                                    `}
                                                </tbody>
                                            </table>
                                        </div>
                                        
                                        ${totalPages > 1 && html`
                                            <div class="card-footer d-flex align-items-center">
                                                <p class="m-0 text-muted">Showing <span>${indexOfFirstOrg + 1}</span> to <span>${Math.min(indexOfLastOrg, filteredOrgs.length)}</span> of <span>${filteredOrgs.length}</span> entries</p>
                                                <ul class="pagination m-0 ms-auto">
                                                    <li class=${`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                                                        <a class="page-link" href="#" onClick=${(e) => { e.preventDefault(); paginate(currentPage - 1); }}>
                                                            <i class="ti ti-chevron-left"></i>
                                                            prev
                                                        </a>
                                                    </li>
                                                    ${Array.from({ length: totalPages }, (_, i) => i + 1).map(number => html`
                                                        <li class=${`page-item ${currentPage === number ? 'active' : ''}`}>
                                                            <a class="page-link" href="#" onClick=${(e) => { e.preventDefault(); paginate(number); }}>${number}</a>
                                                        </li>
                                                    `)}
                                                    <li class=${`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                                                        <a class="page-link" href="#" onClick=${(e) => { e.preventDefault(); paginate(currentPage + 1); }}>
                                                            next
                                                            <i class="ti ti-chevron-right"></i>
                                                        </a>
                                                    </li>
                                                </ul>
                                            </div>
                                        `}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}

                    ${selectedOrg && html`
                        <div class="modal-root">
                            <div class="modal-backdrop fade show custom-backdrop"></div>
                            <div
                                class="modal modal-blur fade show"
                                style="display: block;"
                                tabindex="-1"
                                onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); setOrgLicenses([]); }}
                            >
                                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" onClick=${(e) => e.stopPropagation()}>
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h3 class="modal-title">Manage Organization: ${selectedOrg.orgName}</h3>
                                            <button type="button" class="btn-close" onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); setOrgLicenses([]); }}></button>
                                        </div>

                                        <div class="modal-body">
                                            <div class="row g-3">
                                                <div class="col-md-6">
                                                    <label class="form-label">Organization Name</label>
                                                    <input 
                                                        class=${`form-control ${updateOrgName && updateOrgName.trim().length < 4 ? 'is-invalid' : ''}`}
                                                        value=${updateOrgName} 
                                                        onInput=${(e) => setUpdateOrgName(e.target.value)}
                                                        minlength="4"
                                                    />
                                                    <small class="form-text text-muted">Minimum 4 characters required</small>
                                                    ${updateOrgName && updateOrgName.trim().length < 4 ? html`
                                                        <div class="invalid-feedback d-block">
                                                            Organization name must be at least 4 characters long
                                                        </div>
                                                    ` : ''}
                                                </div>
                                                <div class="col-md-6">
                                                    <label class="form-label">Owner Email</label>
                                                    <div class="input-group">
                                                        <input type="email" class="form-control" value=${selectedOrg.ownerEmail} disabled />
                                                        <button
                                                            class="btn btn-outline-primary"
                                                            onClick=${() => {
                                                                setNewTransferOwner(selectedOrg.ownerEmail);
                                                                setShowTransferOwner(true);
                                                            }}
                                                            disabled=${(() => {
                                                                const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                return isPersonal;
                                                            })()}
                                                            title=${(() => {
                                                                const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                return isPersonal ? 'Transfer not available for Personal organizations' : 'Transfer ownership';
                                                            })()}
                                                        >
                                                            <i class="ti ti-arrows-exchange me-1"></i>
                                                            Transfer
                                                        </button>
                                                    </div>
                                                    ${(() => {
                                                        const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                        return isPersonal ? html`
                                                            <small class="text-muted"><i class="ti ti-info-circle me-1"></i>Ownership transfer is not available for Personal organizations</small>
                                                        ` : '';
                                                    })()}
                                                </div>
                                                <div class="col-md-6">
                                                    <label class="form-label">Current Status</label>
                                                    <div>
                                                        <span class=${`badge ${selectedOrg.isDisabled ? 'bg-danger' : 'bg-success'}`}>
                                                            ${selectedOrg.isDisabled ? 'Disabled' : 'Active'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div class="col-12">
                                                    <hr class="my-3" />
                                                </div>

                                                <!-- Enable Reports Toggle -->
                                                <div class="col-12">
                                                    <div class="form-check form-switch d-flex align-items-start gap-2">
                                                        <input 
                                                            class="form-check-input" 
                                                            type="checkbox" 
                                                            id="updateReportEnabled"
                                                            checked=${updateReportEnabled}
                                                            onChange=${(e) => setUpdateReportEnabled(e.target.checked)}
                                                            style="width: 40px; height: 20px; margin-top: 4px; flex-shrink: 0;"
                                                        />
                                                        <label class="form-check-label" for="updateReportEnabled">
                                                            <strong>Enable Security Reports</strong>
                                                            <div class="small text-muted">Configure automated security reporting for this organization</div>
                                                        </label>
                                                    </div>
                                                </div>

                                                <!-- Report Configuration - Only shown when reports enabled -->
                                                ${updateReportEnabled ? html`
                                                    <div class="col-12">
                                                        <div class="card border border-light">
                                                            <div class="card-header">
                                                                <h5 class="card-title mb-0"><i class="ti ti-mail me-2"></i>Report Configuration</h5>
                                                            </div>
                                                            <div class="card-body">
                                                                <div class="d-flex gap-4 flex-wrap">
                                                                    <!-- Business Tier Toggle -->
                                                                    <div class="d-flex flex-column gap-2">
                                                                        <label class="form-label mb-0">
                                                                            <strong>Business Tier</strong>
                                                                            ${(() => {
                                                                                const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                                return isPersonal ? html`
                                                                                    <span class="badge bg-warning-lt ms-2">
                                                                                        <i class="ti ti-alert-triangle me-1"></i>Business Org Only
                                                                                    </span>
                                                                                ` : '';
                                                                            })()}
                                                                        </label>
                                                                        <div class="btn-group" role="group" ${(() => {
                                                                            const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                            return isPersonal ? 'disabled' : '';
                                                                        })()}>
                                                                            <input 
                                                                                type="radio" 
                                                                                class="btn-check" 
                                                                                id="updateTierPro"
                                                                                name="updateTier"
                                                                                value="Professional"
                                                                                checked=${updateBusinessTier === 'Professional'}
                                                                                onChange=${(e) => setUpdateBusinessTier(e.target.value)}
                                                                                disabled=${(() => {
                                                                                    const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                                    return isPersonal;
                                                                                })()}
                                                                            />
                                                                            <label class="btn btn-outline-primary" for="updateTierPro">Professional</label>
                                                                            <input 
                                                                                type="radio" 
                                                                                class="btn-check" 
                                                                                id="updateTierPrem"
                                                                                name="updateTier"
                                                                                value="Premium"
                                                                                checked=${updateBusinessTier === 'Premium'}
                                                                                onChange=${(e) => setUpdateBusinessTier(e.target.value)}
                                                                                disabled=${(() => {
                                                                                    const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                                    return isPersonal;
                                                                                })()}
                                                                            />
                                                                            <label class="btn btn-outline-primary" for="updateTierPrem">Premium</label>
                                                                        </div>
                                                                    </div>

                                                                    <!-- Weekly Report Toggle -->
                                                                    <div class="d-flex flex-column gap-2">
                                                                        <label class="form-label mb-0">
                                                                            <strong>Weekly Report</strong>
                                                                            ${(() => {
                                                                                const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                                return isPersonal ? html`
                                                                                    <span class="badge bg-warning-lt ms-2">
                                                                                        <i class="ti ti-alert-triangle me-1"></i>Business Org Only
                                                                                    </span>
                                                                                ` : '';
                                                                            })()}
                                                                        </label>
                                                                        <div class="form-check form-switch">
                                                                            <input 
                                                                                class="form-check-input" 
                                                                                type="checkbox" 
                                                                                id="updateWeeklyEnabled"
                                                                                checked=${updateWeeklyEnabled}
                                                                                onChange=${(e) => setUpdateWeeklyEnabled(e.target.checked)}
                                                                                disabled=${(() => {
                                                                                    const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                                    return isPersonal;
                                                                                })()}
                                                                                style="width: 40px; height: 20px; margin-top: 0px;"
                                                                            />
                                                                        </div>
                                                                        <small class="text-muted">Every Monday</small>
                                                                    </div>

                                                                <!-- Daily Snapshot Toggle -->
                                                                <div class="d-flex flex-column gap-2">
                                                                    <label class="form-label mb-0"><strong>Daily Snapshot</strong></label>
                                                                    <div class="form-check form-switch">
                                                                        <input 
                                                                            class="form-check-input" 
                                                                            type="checkbox" 
                                                                            id="updateDailySnapshotEnabled"
                                                                            checked=${updateDailySnapshotEnabled}
                                                                            onChange=${(e) => setUpdateDailySnapshotEnabled(e.target.checked)}
                                                                            style="width: 40px; height: 20px; margin-top: 0px;"
                                                                        />
                                                                    </div>
                                                                    <small class="text-muted">Basic snapshot</small>
                                                                </div>

                                                                <!-- Send To All Members Toggle -->
                                                                <div class="d-flex flex-column gap-2">
                                                                    <label class="form-label mb-0"><strong>Send To All Members</strong></label>
                                                                    <div class="form-check form-switch">
                                                                        <input 
                                                                            class="form-check-input" 
                                                                            type="checkbox" 
                                                                            id="updateSendToAllMembers"
                                                                            checked=${updateSendToAllMembers}
                                                                            onChange=${(e) => setUpdateSendToAllMembers(e.target.checked)}
                                                                            disabled=${(() => {
                                                                                const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                                return isPersonal;
                                                                            })()}
                                                                            style="width: 40px; height: 20px; margin-top: 0px;"
                                                                        />
                                                                    </div>
                                                                    <small class="text-muted">${(() => {
                                                                        const isPersonal = selectedOrg.isPersonal !== undefined ? selectedOrg.isPersonal : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                        return isPersonal ? 'Business only' : 'Owner + team';
                                                                    })()}</small>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                ` : null}

                                                <div class="col-12">
                                                    <button 
                                                        class="btn btn-primary" 
                                                        onClick=${onUpdateOrg}
                                                        disabled=${!updateOrgName || updateOrgName.trim().length < 4}
                                                    >
                                                        <i class="ti ti-device-floppy me-2"></i>
                                                        Update Organization
                                                    </button>
                                                </div>

                                                <div class="col-12 mt-4">
                                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                                        <h4 class="m-0">Licenses</h4>
                                                        <div>
                                                            <button
                                                                class="btn btn-sm btn-primary"
                                                                onClick=${() => setShowCreateLicense(true)}
                                                                disabled=${(() => {
                                                                    const licenseType = orgLicenses && orgLicenses.length > 0 ? orgLicenses[0].licenseType : null;
                                                                    const isPersonal = selectedOrg.isPersonal !== undefined
                                                                        ? selectedOrg.isPersonal
                                                                        : licenseType === 'Personal' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                    return isPersonal;
                                                                })()}
                                                                title=${(() => {
                                                                    const licenseType = orgLicenses && orgLicenses.length > 0 ? orgLicenses[0].licenseType : null;
                                                                    const isPersonal = selectedOrg.isPersonal !== undefined
                                                                        ? selectedOrg.isPersonal
                                                                        : licenseType === 'Personal' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                    return isPersonal ? 'Additional licenses not available for Personal organizations' : 'Create new license';
                                                                })()}
                                                            >
                                                                <i class="ti ti-plus me-1"></i> Create License
                                                            </button>
                                                            ${(() => {
                                                                const licenseType = orgLicenses && orgLicenses.length > 0 ? orgLicenses[0].licenseType : null;
                                                                const isPersonal = selectedOrg.isPersonal !== undefined
                                                                    ? selectedOrg.isPersonal
                                                                    : licenseType === 'Personal' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedOrg.orgId);
                                                                return isPersonal ? html`
                                                                <div class="text-muted small mt-1">
                                                                    <i class="ti ti-info-circle me-1"></i>Personal organizations are limited to a single license
                                                                </div>
                                                            ` : '';
                                                            })()}
                                                        </div>
                                                    </div>

                                                    ${showCreateLicense && html`
                                                        <div class="card mb-3 bg-light">
                                                            <div class="card-body">
                                                                <h5 class="card-title">New License</h5>
                                                                <div class="row g-2 align-items-end">
                                                                    <div class="col-md-4">
                                                                        <label class="form-label small">Seats</label>
                                                                        <input type="number" class="form-control form-control-sm" value=${newLicenseSeats} onInput=${(e) => setNewLicenseSeats(e.target.value)} />
                                                                    </div>
                                                                    <div class="col-md-4">
                                                                        <label class="form-label small">Duration (Days)</label>
                                                                        <input type="number" class="form-control form-control-sm" value=${newLicenseDuration} onInput=${(e) => setNewLicenseDuration(e.target.value)} />
                                                                    </div>
                                                                    <div class="col-md-4">
                                                                        <button class="btn btn-sm btn-success me-1" onClick=${onCreateLicense}>Create</button>
                                                                        <button class="btn btn-sm btn-ghost-secondary" onClick=${() => setShowCreateLicense(false)}>Cancel</button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `}

                                                    <div class="table-responsive border rounded">
                                                        <table class="table table-vcenter card-table table-sm">
                                                            <thead>
                                                                <tr>
                                                                    <th>Type</th>
                                                                    <th>Key / Email</th>
                                                                    <th>Seats</th>
                                                                    <th>Credits</th>
                                                                    <th>Status</th>
                                                                    <th>Created</th>
                                                                    <th class="w-1">Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                ${orgLicenses.map(lic => html`
                                                                    <tr>
                                                                        <td>${lic.licenseType}</td>
                                                                        <td>
                                                                            <div class="text-truncate" style="max-width: 200px;" title=${lic.serialKey}>
                                                                                ${lic.serialKey}
                                                                            </div>
                                                                        </td>
                                                                        <td>${lic.seats || '-'}</td>
                                                                        <td>
                                                                            <div class="small text-muted">${lic.remainingCredits} / ${lic.totalCredits}</div>
                                                                            <div class="progress progress-sm mt-1" style="width: 60px">
                                                                                <div class="progress-bar bg-primary" style="width: ${(lic.remainingCredits / lic.totalCredits) * 100}%"></div>
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <span class=${`badge ${lic.isDisabled ? 'bg-danger' : 'bg-success'}`}>
                                                                                ${lic.isDisabled ? 'Disabled' : 'Active'}
                                                                            </span>
                                                                        </td>
                                                                        <td class="text-muted small">
                                                                            ${new Date(lic.createdAt).toLocaleDateString()}
                                                                        </td>
                                                                        <td>
                                                                            <div class="btn-list flex-nowrap">
                                                                                <button 
                                                                                    class="btn btn-sm btn-outline-primary"
                                                                                    onClick=${() => onAdjustLicense(lic)}
                                                                                    title="Adjust Credits"
                                                                                >
                                                                                    <i class="ti ti-adjustments"></i>
                                                                                </button>
                                                                                <button 
                                                                                    class="btn btn-sm btn-outline-warning"
                                                                                    onClick=${() => onDisableLicense(lic)}
                                                                                    title=${lic.isDisabled ? 'Enable' : 'Disable'}
                                                                                >
                                                                                    <i class=${`ti ${lic.isDisabled ? 'ti-check' : 'ti-ban'}`}></i>
                                                                                </button>
                                                                                <button 
                                                                                    class="btn btn-sm btn-outline-danger"
                                                                                    onClick=${() => onDeleteLicense(lic.licenseId)}
                                                                                    title="Delete"
                                                                                >
                                                                                    <i class="ti ti-trash"></i>
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                `)}
                                                                ${orgLicenses.length === 0 && html`
                                                                    <tr>
                                                                        <td colspan="6" class="text-center py-3 text-muted small">
                                                                            No licenses found
                                                                        </td>
                                                                    </tr>
                                                                `}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                <div class="col-12 mt-3">
                                                    <div class="card border border-danger">
                                                        <div class="card-header d-flex justify-content-between align-items-center">
                                                            <div class="d-flex align-items-center gap-2">
                                                                <span class="badge bg-danger text-white">Danger</span>
                                                                <span class="fw-bold">Danger Zone</span>
                                                            </div>
                                                            <button 
                                                                class="btn btn-sm btn-outline-danger"
                                                                onClick=${() => setShowDangerZone(!showDangerZone)}
                                                            >
                                                                ${showDangerZone ? 'Hide' : 'Show'}
                                                            </button>
                                                        </div>
                                                        ${showDangerZone && html`
                                                            <div class="card-body">
                                                                <p class="text-muted mb-3">
                                                                    Actions below are destructive or impact availability. Proceed with caution.
                                                                </p>
                                                                <div class="d-flex flex-wrap gap-2">
                                                                    <button class="btn btn-warning" onClick=${onDisableOrg}>
                                                                        <i class="ti ti-ban me-2"></i>
                                                                        ${selectedOrg.isDisabled ? 'Enable Organization' : 'Disable Organization'}
                                                                    </button>
                                                                    <button class="btn btn-danger" onClick=${onDeleteOrg}>
                                                                        <i class="ti ti-trash me-2"></i>
                                                                        Delete Organization
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        `}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="modal-footer">
                                            <button type="button" class="btn btn-secondary" onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); setOrgLicenses([]); }}>
                                                <i class="ti ti-x me-2"></i>
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}

                    ${activeTab === 'accounts' && html`
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
                        </div>
                    `}

                    ${activeTab === 'admin-actions' && html`
                        <div class="row g-3">
                            <!-- Cron Job Triggers -->
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">
                                            <i class="ti ti-clock me-2"></i>
                                            Manual Cron Job Triggers
                                        </h3>
                                    </div>
                                    <div class="card-body">
                                        <p class="text-muted mb-3">
                                            Manually trigger cron jobs for testing or immediate execution. Results will be logged to audit telemetry.
                                        </p>
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <button 
                                                    class="btn btn-primary w-100"
                                                    onClick=${() => onTriggerCron('AppRemediationDetection')}
                                                    disabled=${triggeringCron === 'AppRemediationDetection'}
                                                >
                                                    ${triggeringCron === 'AppRemediationDetection' ? html`
                                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                                        Triggering...
                                                    ` : html`
                                                        <i class="ti ti-refresh me-2"></i>
                                                        Trigger App Remediation Detection
                                                    `}
                                                </button>
                                                <small class="text-muted d-block mt-1">
                                                    Detects app updates and marks CVEs as remediated
                                                </small>
                                            </div>
                                            <div class="col-md-6">
                                                <button 
                                                    class="btn btn-primary w-100"
                                                    onClick=${() => onTriggerCron('ThreatIntelEnrichment')}
                                                    disabled=${triggeringCron === 'ThreatIntelEnrichment'}
                                                >
                                                    ${triggeringCron === 'ThreatIntelEnrichment' ? html`
                                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                                        Triggering...
                                                    ` : html`
                                                        <i class="ti ti-shield me-2"></i>
                                                        Trigger Threat Intel Enrichment
                                                    `}
                                                </button>
                                                <small class="text-muted d-block mt-1">
                                                    Enriches CVEs with EPSS scores and exploit data
                                                </small>
                                            </div>
                                        </div>
                                        
                                        ${cronResult && html`
                                            <div class="alert ${cronResult.success ? 'alert-success' : 'alert-danger'} mt-3" role="alert">
                                                <div class="d-flex align-items-center">
                                                    <div>
                                                        <i class="${cronResult.success ? 'ti ti-check' : 'ti ti-alert-circle'} me-2"></i>
                                                        <strong>${cronResult.taskId}</strong>: ${cronResult.success ? 'Completed successfully' : 'Failed'}
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        class="btn-close ms-auto" 
                                                        onClick=${() => setCronResult(null)}
                                                    ></button>
                                                </div>
                                                ${cronResult.data && html`
                                                    <div class="mt-2 small">
                                                        ${cronResult.data.itemsProcessed !== undefined && html`
                                                            <div>Items Processed: <strong>${cronResult.data.itemsProcessed}</strong></div>
                                                        `}
                                                        ${cronResult.data.duration && html`
                                                            <div>Duration: <strong>${cronResult.data.duration}</strong></div>
                                                        `}
                                                    </div>
                                                `}
                                                ${cronResult.error && html`
                                                    <div class="mt-2 small text-danger">${cronResult.error}</div>
                                                `}
                                            </div>
                                        `}

                                        <div class="mt-3">
                                            <a href="#" onClick=${(e) => { e.preventDefault(); setMainSection('activity'); setActiveTab('cron-jobs'); loadCronStatus(); }} class="btn btn-link">
                                                <i class="ti ti-external-link me-1"></i>
                                                View Cron Job Details & History
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Remediation Reset -->
                            <div class="col-12">
                                <div class="card border-warning">
                                    <div class="card-header bg-warning-lt">
                                        <h3 class="card-title">
                                            <i class="ti ti-restore me-2"></i>
                                            Reset Remediation Status
                                        </h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="alert alert-warning mb-3">
                                            <i class="ti ti-alert-triangle me-2"></i>
                                            <strong>Warning:</strong> This action resets AppStatus and RemediatedOn timestamps in both AppTelemetry and CVETelemetry tables. Use for testing remediation detection logic.
                                        </div>
                                        
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">Organization</label>
                                                <select 
                                                    class="form-select" 
                                                    value=${resetOrgId}
                                                    onChange=${(e) => setResetOrgId(e.target.value)}
                                                    disabled=${resettingRemediation}
                                                >
                                                    <option value="">Select organization...</option>
                                                    ${orgs.map(org => html`
                                                        <option value=${org.orgId}>${org.orgName || org.name || org.orgId}</option>
                                                    `)}
                                                </select>
                                            </div>
                                            <div class="col-md-6 align-self-end">
                                                <button 
                                                    class="btn btn-warning w-100"
                                                    onClick=${onResetRemediation}
                                                    disabled=${resettingRemediation || !resetOrgId}
                                                >
                                                    ${resettingRemediation ? html`
                                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                                        Resetting...
                                                    ` : html`
                                                        <i class="ti ti-restore me-2"></i>
                                                        Reset Remediation Status
                                                    `}
                                                </button>
                                            </div>
                                        </div>

                                        ${resetResult && html`
                                            <div class="alert ${resetResult.success ? 'alert-success' : 'alert-danger'} mt-3" role="alert">
                                                <div class="d-flex align-items-center">
                                                    <div>
                                                        <i class="${resetResult.success ? 'ti ti-check' : 'ti ti-alert-circle'} me-2"></i>
                                                        ${resetResult.success ? 'Remediation status reset successfully' : 'Failed to reset remediation status'}
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        class="btn-close ms-auto" 
                                                        onClick=${() => setResetResult(null)}
                                                    ></button>
                                                </div>
                                                ${resetResult.data && html`
                                                    <div class="mt-2 small">
                                                        <div>App Records Reset: <strong>${resetResult.data.appRecordsReset || 0}</strong></div>
                                                        <div>CVE Records Reset: <strong>${resetResult.data.cveRecordsReset || 0}</strong></div>
                                                    </div>
                                                `}
                                                ${resetResult.error && html`
                                                    <div class="mt-2 small text-danger">${resetResult.error}</div>
                                                `}
                                            </div>
                                        `}

                                        <div class="mt-3">
                                            <p class="text-muted small mb-0">
                                                <strong>Effect:</strong> Sets AppStatus='installed' and RemediatedOn=null for all apps and CVEs in the organization. Next remediation job will re-detect updates.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            </div>
            `}

            <!-- Activity Reports Section -->
            ${mainSection === 'activity' && html`
            <div class="card mb-3">
                <div class="card-header">
                    <ul class="nav nav-tabs card-header-tabs">
                        <li class="nav-item">
                            <a 
                                class="nav-link ${activeTab === 'user-activity' ? 'active' : ''}"
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('user-activity'); }}
                            >
                                <i class="ti ti-user-check me-2"></i>
                                User Activity
                            </a>
                        </li>
                        <li class="nav-item">
                            <a 
                                class="nav-link ${activeTab === 'device-activity' ? 'active' : ''}"
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('device-activity'); }}
                            >
                                <i class="ti ti-device-desktop me-2"></i>
                                Device Activity
                            </a>
                        </li>
                        <li class="nav-item">
                            <a 
                                class="nav-link ${activeTab === 'ai-reports' ? 'active' : ''}"
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('ai-reports'); }}
                            >
                                <i class="ti ti-brain me-2"></i>
                                AI Reports
                            </a>
                        </li>
                        <li class="nav-item">
                            <a 
                                class="nav-link ${activeTab === 'cron-jobs' ? 'active' : ''}"
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('cron-jobs'); }}
                            >
                                <i class="ti ti-clock me-2"></i>
                                Cron Jobs
                            </a>
                        </li>
                    </ul>
                </div>
                <div class="card-body">
                    ${activeTab === 'user-activity' && html`<${ApiAuditPage} />`}
                    ${activeTab === 'device-activity' && html`<${DeviceActivityPage} />`}
                    ${activeTab === 'ai-reports' && html`<${AiReportsAnalysisPage} />`}
                    ${activeTab === 'cron-jobs' && html`
                        <div>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h3 class="mb-0">Cron Jobs Status & Activity</h3>
                                <button 
                                    class="btn btn-sm btn-primary" 
                                    onClick=${loadCronStatus} 
                                    disabled=${loadingCron}
                                >
                                    ${loadingCron ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                                    ${loadingCron ? 'Refreshing...' : 'Refresh Status'}
                                </button>
                            </div>

                            ${loadingCron && !cronStatus ? html`
                                <div class="text-center py-5">
                                    <div class="spinner-border text-primary" role="status"></div>
                                    <p class="text-muted mt-2">Loading cron status...</p>
                                </div>
                            ` : !cronStatus ? html`
                                <div class="empty">
                                    <div class="empty-icon"><i class="ti ti-clock"></i></div>
                                    <p class="empty-title">No cron status available</p>
                                    <p class="empty-subtitle text-muted">Click Refresh to load cron status</p>
                                </div>
                            ` : html`
                                <!-- System Status Card -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <h3 class="card-title">System Status</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="row g-3">
                                            <div class="col-md-3">
                                                <div class="d-flex align-items-center">
                                                    <div class="me-3">
                                                        <i class="ti ti-${cronStatus.currentStatus.isHealthy ? 'circle-check text-success' : 'alert-circle text-danger'}" style="font-size: 2rem;"></i>
                                                    </div>
                                                    <div>
                                                        <div class="text-muted small">Health</div>
                                                        <div class="fw-bold ${cronStatus.currentStatus.isHealthy ? 'text-success' : 'text-danger'}">
                                                            ${cronStatus.currentStatus.isHealthy ? 'Healthy' : 'Unhealthy'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="text-muted small">Last Run</div>
                                                <div class="fw-bold">
                                                    ${cronStatus.currentStatus.lastRunAt ? (() => {
                                                        const lastRun = new Date(cronStatus.currentStatus.lastRunAt);
                                                        const now = new Date();
                                                        const diffMs = now - lastRun;
                                                        const diffMins = Math.floor(diffMs / 60000);
                                                        const diffHours = Math.floor(diffMins / 60);
                                                        const mins = diffMins % 60;
                                                        const isOverdue = diffMins > 60;
                                                        const timeAgo = diffHours > 0 ? `${diffHours}h ${mins}m ago` : `${mins}m ago`;
                                                        return html`
                                                            <div>${lastRun.toLocaleString()}</div>
                                                            <div class="small ${isOverdue ? 'text-danger' : 'text-muted'}">${timeAgo}</div>
                                                        `;
                                                    })() : 'Never'}
                                                </div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="text-muted small">Status</div>
                                                <div class="fw-bold">
                                                    ${cronStatus.currentStatus.lastStatus || 'N/A'}
                                                </div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="text-muted small">Lock Status</div>
                                                <div class="fw-bold">
                                                    ${cronStatus.currentStatus.lockHeldBy || 'Not locked'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Detailed Activity with Filters -->
                                <${CronActivityPage} cronStatus=${cronStatus} />
                            `}
                        </div>
                    `}
                </div>
            </div>
            `}

            ${mainSection === 'preview' && html`<${ReportPreviewPage} embedded=${true} />`}

            ${adjustingLicense && html`<${LicenseAdjustmentDialog} 
                license=${adjustingLicense}
                onClose=${() => setAdjustingLicense(null)}
                onSuccess=${() => {
                    setAdjustingLicense(null);
                    loadData();
                }}
                api=${api}
                showToast=${showToast}
            />`}

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
                                    onClick=${onChangeUserType}
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

            <!-- Transfer Ownership Modal -->
            ${showTransferOwner && selectedOrg && html`
                <div class="modal modal-blur fade show" style="display: block;" onClick=${() => setShowTransferOwner(false)}>
                    <div class="modal-dialog modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Transfer Ownership</h5>
                                <button type="button" class="btn-close" onClick=${() => setShowTransferOwner(false)}></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">Organization</label>
                                    <input type="text" class="form-control" value=${selectedOrg.orgName} disabled />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Current Owner</label>
                                    <input type="text" class="form-control" value=${selectedOrg.ownerEmail} disabled />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">New Owner Email</label>
                                    <input 
                                        type="email" 
                                        class="form-control" 
                                        placeholder="newowner@example.com"
                                        value=${newTransferOwner}
                                        onInput=${(e) => setNewTransferOwner(e.target.value)}
                                        disabled=${transferringOwner}
                                    />
                                    <small class="text-muted">New owner must be an existing org member</small>
                                </div>
                                <div class="alert alert-danger">
                                    <i class="ti ti-alert-circle me-2"></i>
                                    <strong>Caution:</strong> Transferring ownership gives full control to the new owner. This action cannot be undone.
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onClick=${() => setShowTransferOwner(false)}>
                                    Cancel
                                </button>
                                <button 
                                    type="button" 
                                    class="btn btn-danger" 
                                    onClick=${onTransferOwnership}
                                    disabled=${transferringOwner || !newTransferOwner || !isValidEmail(newTransferOwner)}
                                >
                                    ${transferringOwner ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                    Transfer Ownership
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
