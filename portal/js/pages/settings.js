/**
 * Settings Page - Org Admin Experience
 * Manages organization settings, licenses, team access
 * Site Admins have additional capabilities
 */

import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { auth } from '../auth.js';
import toast from '../toast.js';
import { logger } from '../config.js';
import { LicenseAdjustmentDialog } from '../components/LicenseAdjustmentDialog.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

// Local helper to keep existing showToast signature while using default export
const showToast = (message, type) => toast.show(message, type);

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');
    const [loading, setLoading] = useState(true);
    const [org, setOrg] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [members, setMembers] = useState([]);
    const [telemetryConfig, setTelemetryConfig] = useState(null);
    const [isSiteAdmin, setIsSiteAdmin] = useState(false);
    const [isPersonalOrg, setIsPersonalOrg] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [newOrgSeats, setNewOrgSeats] = useState(20);
    const [newOrgCredits, setNewOrgCredits] = useState(0);
    const [updateOrgName, setUpdateOrgName] = useState('');
    const [updateOrgCredits, setUpdateOrgCredits] = useState(0);
    const [showCreateOrg, setShowCreateOrg] = useState(false);
    const [showUpdateOrg, setShowUpdateOrg] = useState(false);
    const [teamEmail, setTeamEmail] = useState('');
    const [teamRole, setTeamRole] = useState('ReadWrite');
    const [advancedTab, setAdvancedTab] = useState('create');
    const [accounts, setAccounts] = useState([]);
    const [teamSearch, setTeamSearch] = useState('');
    const [showTeamDropdown, setShowTeamDropdown] = useState(false);
    const [orgOwnerSearch, setOrgOwnerSearch] = useState('');
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const [adjustingLicense, setAdjustingLicense] = useState(null);

    // Email validation helper
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Load data on mount and reload when org changes
    useEffect(() => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) return;
        
        loadSettings();

        const handler = () => {
            setActiveTab('general');
            loadSettings();
        };
        const unsubscribe = orgContext.onChange(handler);
        window.addEventListener('orgChanged', handler);

        return () => {
            unsubscribe?.();
            window.removeEventListener('orgChanged', handler);
        };
    }, [orgContext.getCurrentOrg()?.orgId]);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const currentOrg = orgContext.getCurrentOrg();
            const currentOrgId = currentOrg?.orgId;
            
            if (!currentOrgId) {
                showToast('Please select an organization', 'warning');
                return;
            }

            // Check if user is Site Admin
            const user = auth.getUser();
            const userType = user?.userType || 'Individual';
            setIsSiteAdmin(userType === 'SiteAdmin');

            // Use org context data instead of Site Admin endpoint
            const currentOrgDetails = orgContext.getCurrentOrg();
            if (currentOrgDetails) {
                // Map context fields to org shape expected by UI
                // Note: ownerEmail should come from API; fallback if missing
                setOrg({
                    orgId: currentOrgDetails.orgId,
                    orgName: currentOrgDetails.name,
                    ownerEmail: currentOrgDetails.ownerEmail || currentOrgDetails.ownerId || '(Owner email not set)',
                    totalCredits: currentOrgDetails.totalCredits ?? currentOrgDetails.totalSeats ?? 0,
                    remainingCredits: currentOrgDetails.remainingCredits ?? currentOrgDetails.totalCredits ?? currentOrgDetails.totalSeats ?? 0,
                    seats: currentOrgDetails.totalSeats ?? null,
                    isDisabled: currentOrgDetails.isDisabled ?? false,
                    isPersonal: currentOrgDetails.type === 'Personal'
                });
                setIsPersonalOrg(currentOrgDetails.type === 'Personal');
                setUpdateOrgName(currentOrgDetails.name || '');
                setUpdateOrgCredits(currentOrgDetails.totalCredits ?? currentOrgDetails.totalSeats ?? 0);
            }

            // Load licenses
            // Use portal-friendly alias for org licenses
            const licensesRes = await api.get(`/api/v1/orgs/${currentOrgId}/licenses`);
            if (licensesRes.success && licensesRes.data) {
                setLicenses(licensesRes.data);
            }

            // Load team members
            const membersRes = await api.get(`/api/v1/orgs/${currentOrgId}/members`);
            if (membersRes.success && membersRes.data) {
                setMembers(membersRes.data);
            }

            // Load all accounts for user search (Site Admin)
            if (userType === 'SiteAdmin') {
                try {
                    const accountsRes = await api.get('/api/v1/admin/accounts');
                    if (accountsRes.success && accountsRes.data) {
                        const accountsData = accountsRes.data.accounts ?? accountsRes.data ?? [];
                        setAccounts(Array.isArray(accountsData) ? accountsData : []);
                    }
                } catch (err) {
                    // Endpoint may not exist yet; gracefully degrade to manual email entry
                    setAccounts([]);
                    logger.debug('[Settings] Accounts endpoint not available; manual email entry will work fine', err);
                }
            }

            // Load telemetry config (Site Admin path)
            if (userType === 'SiteAdmin') {
                try {
                    const cfg = await fetchTelemetryConfigAdmin(currentOrgId);
                    setTelemetryConfig(cfg);
                } catch (err) {
                    setTelemetryConfig(null);
                    logger.warn('[Settings] Telemetry config not found or inaccessible for org', currentOrgId);
                }
            }

        } catch (error) {
            logger.error('[Settings] Error loading settings:', error);
            showToast('Failed to load settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRotateLicense = async (licenseId) => {
        if (!confirm('Rotate license key? Existing devices will receive the new key on next heartbeat.')) {
            return;
        }

        try {
            const currentOrg = orgContext.getCurrentOrg();
            const res = await api.post(`/api/licenses/${licenseId}/rotate`, { orgId: currentOrg?.orgId });
            
            if (res.success) {
                showToast('License rotated successfully', 'success');
                await loadSettings(); // Reload to show new key
            } else {
                showToast(res.message || 'Failed to rotate license', 'error');
            }
        } catch (error) {
            logger.error('[Settings] Error rotating license:', error);
            showToast('Failed to rotate license', 'error');
        }
    };

    const handleDisableLicense = async (licenseId, currentlyDisabled) => {
        const action = currentlyDisabled ? 'enable' : 'disable';
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} license?`)) {
            return;
        }

        try {
            const currentOrg = orgContext.getCurrentOrg();
            const endpoint = currentlyDisabled ? 'enable' : 'disable';
            const res = await api.put(`/api/licenses/${licenseId}/${endpoint}`, { orgId: currentOrg?.orgId });
            
            if (res.success) {
                showToast(`License ${action}d successfully`, 'success');
                await loadSettings();
            } else {
                showToast(res.message || `Failed to ${action} license`, 'error');
            }
        } catch (error) {
            logger.error(`[Settings] Error ${action}ing license:`, error);
            showToast(`Failed to ${action} license`, 'error');
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard', 'success');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    };

    const fetchTelemetryConfigAdmin = async (orgId) => {
        // NOTE: This endpoint doesn't exist yet - fail gracefully
        // When implemented, it should return org-specific telemetry configuration
        try {
            const token = auth.getToken();
            const doFetch = async (id) => {
                const res = await fetch(`/api/v1/admin/telemetry/config/orgs/${id}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                });

                if (res.status === 404) {
                    return { data: null, notFound: true };
                }

                const data = await res.json();
                if (!res.ok || data?.success === false) {
                    return { data: null, notFound: true };
                }
                return { data: data?.data || null, notFound: false };
            };

            // Try the provided orgId; if missing ORG* prefix and not found, retry with ORGB-
            const primary = await doFetch(orgId);
            if (!primary.notFound) return primary.data;

            const normalized = (orgId?.startsWith('ORGB-') || orgId?.startsWith('ORGP-'))
                ? null
                : `ORGB-${orgId}`;

            if (normalized) {
                const secondary = await doFetch(normalized);
                if (!secondary.notFound) return secondary.data;
            }

            return null; // fallback to global/defaults
        } catch (err) {
            // Endpoint not implemented yet - fail silently
            logger.debug('[Settings] Telemetry config endpoint not available (expected for now)', err);
            return null;
        }
    };

    const handleCreateOrg = async () => {
        if (!newOrgName || !newOwnerEmail) {
            showToast('Org name and owner email are required', 'warning');
            return;
        }

        const payload = {
            orgName: newOrgName,
            ownerEmail: newOwnerEmail,
            totalCredits: newOrgCredits ? Number(newOrgCredits) : 0,
            seats: newOrgSeats ? Number(newOrgSeats) : 0
        };

        const res = await api.post('/api/v1/admin/orgs', payload);
        if (res.success) {
            showToast('Organization created', 'success');
            setNewOrgName('');
            setNewOwnerEmail('');
            setNewOrgSeats(20);
            setNewOrgCredits(0);
            await orgContext.initialize();
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to create org', 'error');
        }
    };

    const handleDisableOrg = async () => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        const res = await api.put(`/api/v1/admin/orgs/${currentOrg.orgId}/disable`);
        if (res.success) {
            showToast('Organization disabled', 'success');
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to disable org', 'error');
        }
    };

    const handleDeleteOrg = async () => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        if (!confirm('Delete this organization? This will cascade delete licenses and devices.')) {
            return;
        }

        const res = await api.delete(`/api/v1/admin/orgs/${currentOrg.orgId}`);
        if (res.success) {
            showToast('Organization deleted', 'success');
            await orgContext.initialize();
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to delete org', 'error');
        }
    };

    const handleAddTeamMember = async () => {
        if (!teamEmail) {
            showToast('Email is required', 'warning');
            return;
        }

        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        const payload = {
            userEmail: teamEmail,
            role: teamRole || 'ReadWrite'
        };

        const res = await api.post(`/api/v1/orgs/${currentOrg.orgId}/members`, payload);
        if (res.success) {
            showToast('Team member added', 'success');
            setTeamEmail('');
            setTeamRole('ReadWrite');
            // Optimistically update members list to reflect the new entry immediately
            setMembers((prev) => [...prev, { userId: teamEmail, userEmail: teamEmail, role: teamRole || 'ReadWrite', addedAt: new Date().toISOString(), addedBy: 'you' }]);
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to add team member', 'error');
        }
    };

    const handleRemoveTeamMember = async (userId) => {
        if (!confirm('Remove this team member?')) {
            return;
        }

        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        const res = await api.delete(`/api/v1/orgs/${currentOrg.orgId}/members/${userId}`);
        if (res.success) {
            showToast('Team member removed', 'success');
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to remove team member', 'error');
        }
    };

    const handleUpdateTeamRole = async (userId, newRole) => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        const res = await api.put(`/api/v1/orgs/${currentOrg.orgId}/members/${userId}`, { role: newRole });
        if (res.success) {
            showToast('Role updated', 'success');
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to update role', 'error');
        }
    };

    const handleUpdateOrg = async () => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        const payload = {
            orgName: updateOrgName,
            totalCredits: Number(updateOrgCredits) || 0
        };

        const res = await api.put(`/api/v1/admin/orgs/${currentOrg.orgId}`, payload);
        if (res.success) {
            showToast('Organization updated', 'success');
            await orgContext.initialize();
            await loadSettings();
        } else {
            showToast(res.message || 'Failed to update org', 'error');
        }
    };

    if (loading) {
        return html`
            <div class="container-xl">
                <div class="page-header d-print-none">
                    <h2 class="page-title">Organization Settings</h2>
                </div>
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="text-muted mt-2">Loading settings...</p>
                </div>
            </div>
        `;
    }

    return html`
        <div class="container-xl">
            <!-- Page Header -->
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">Organization Settings</h2>
                        <div class="text-muted mt-1">${org?.orgName || 'Loading...'}</div>
                    </div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="card">
                <div class="card-header">
                    <ul class="nav nav-tabs card-header-tabs" role="tablist">
                        <li class="nav-item">
                            <a 
                                class=${`nav-link ${activeTab === 'general' ? 'active' : ''}`}
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('general'); }}
                            >
                                <i class="ti ti-settings me-2"></i>
                                General
                            </a>
                        </li>
                        <li class="nav-item">
                            <a 
                                class=${`nav-link ${activeTab === 'licenses' ? 'active' : ''}`}
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('licenses'); }}
                            >
                                <i class="ti ti-key me-2"></i>
                                Licenses
                            </a>
                        </li>
                        <li class="nav-item">
                            <a 
                                class=${`nav-link ${activeTab === 'team' ? 'active' : ''}`}
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setActiveTab('team'); }}
                            >
                                <i class="ti ti-users me-2"></i>
                                Team
                            </a>
                        </li>
                        ${isSiteAdmin && html`
                            <li class="nav-item">
                                <a 
                                    class=${`nav-link ${activeTab === 'advanced' ? 'active' : ''}`}
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('advanced'); }}
                                >
                                    <i class="ti ti-shield-lock me-2"></i>
                                    Advanced
                                </a>
                            </li>
                        `}
                    </ul>
                </div>

                <div class="card-body">
                    ${activeTab === 'general' && html`<${GeneralTab} org=${org} isPersonal=${isPersonalOrg} />`}
                    ${activeTab === 'licenses' && (isPersonalOrg
                        ? html`<${BusinessOnlyMessage} 
                            title=${'License Management (Business Only)'}
                            description=${'Personal licenses are limited to 5 devices and do not support license management. Upgrade to a Business license to create, rotate, and manage licenses.'}
                        />`
                        : html`<${LicensesTab} 
                            licenses=${licenses} 
                            onRotate=${handleRotateLicense}
                            onDisable=${handleDisableLicense}
                            onCopy=${copyToClipboard}
                            onAdjust=${(license) => setAdjustingLicense(license)}
                            isSiteAdmin=${isSiteAdmin}
                        />`)}
                    ${activeTab === 'team' && (isPersonalOrg
                        ? html`<${BusinessOnlyMessage} 
                            title=${'Team Access (Business Only)'}
                            description=${'Personal organizations do not support team members or roles. Upgrade to a Business license to add members with role-based access.'}
                        />`
                        : html`<${TeamTab} 
                            members=${members} 
                            orgId=${org?.orgId} 
                            onReload=${loadSettings}
                            onAddMember=${handleAddTeamMember}
                            onRemoveMember=${handleRemoveTeamMember}
                            onUpdateRole=${handleUpdateTeamRole}
                            teamEmail=${teamEmail}
                            setTeamEmail=${setTeamEmail}
                            teamRole=${teamRole}
                            setTeamRole=${setTeamRole}
                            accounts=${accounts}
                            isValidEmail=${isValidEmail}
                            setTeamSearch=${setTeamSearch}
                            teamSearch=${teamSearch}
                            showTeamDropdown=${showTeamDropdown}
                            setShowTeamDropdown=${setShowTeamDropdown}
                        />`)}
                    ${activeTab === 'advanced' && isSiteAdmin && html`<${AdvancedTab} 
                        org=${org} 
                        telemetryConfig=${telemetryConfig}
                        onReload=${loadSettings}
                        onCreateOrg=${handleCreateOrg}
                        onUpdateOrg=${handleUpdateOrg}
                        onDisableOrg=${handleDisableOrg}
                        onDeleteOrg=${handleDeleteOrg}
                        newOrgName=${newOrgName}
                        setNewOrgName=${setNewOrgName}
                        newOwnerEmail=${newOwnerEmail}
                        setNewOwnerEmail=${setNewOwnerEmail}
                        newOrgSeats=${newOrgSeats}
                        setNewOrgSeats=${setNewOrgSeats}
                        newOrgCredits=${newOrgCredits}
                        setNewOrgCredits=${setNewOrgCredits}
                        updateOrgName=${updateOrgName}
                        setUpdateOrgName=${setUpdateOrgName}
                        updateOrgCredits=${updateOrgCredits}
                        setUpdateOrgCredits=${setUpdateOrgCredits}
                        advancedTab=${advancedTab}
                        setAdvancedTab=${setAdvancedTab}
                        accounts=${accounts}
                        isValidEmail=${isValidEmail}
                        orgOwnerSearch=${orgOwnerSearch}
                        setOrgOwnerSearch=${setOrgOwnerSearch}
                        showOwnerDropdown=${showOwnerDropdown}
                        setShowOwnerDropdown=${setShowOwnerDropdown}
                    />`}
                </div>
            </div>
            
            ${adjustingLicense && html`<${LicenseAdjustmentDialog}
                license=${adjustingLicense}
                onClose=${() => setAdjustingLicense(null)}
                onSuccess=${loadSettings}
                api=${api}
                showToast=${showToast}
            />`}
        </div>
    `;
}

// General Tab - Org info and credits
function GeneralTab({ org, isPersonal }) {
    if (!org) return html`<div class="text-muted">No organization data</div>`;

    return html`
        <div class="row">
            <div class="col-md-6">
                <h3 class="card-title mb-3">Organization Information</h3>
                <table class="table">
                    <tbody>
                        <tr>
                            <td class="text-muted">Organization ID</td>
                            <td><code>${org.orgId}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">Name</td>
                            <td>${org.orgName}</td>
                        </tr>
                        <tr>
                            <td class="text-muted">Owner</td>
                            <td>${org.ownerEmail}</td>
                        </tr>
                        <tr>
                            <td class="text-muted">Seats</td>
                            <td><strong>${org.seats || 'N/A'}</strong></td>
                        </tr>
                        <tr>
                            <td class="text-muted">Status</td>
                            <td>
                                <span class=${`badge ${org.isDisabled ? 'bg-danger' : 'bg-success'}`}>
                                    ${org.isDisabled ? 'Disabled' : 'Active'}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="col-md-6">
                <h3 class="card-title mb-3">Credits</h3>
                <div class="card bg-light">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-6">
                                <div class="text-muted mb-1">Total Credits</div>
                                <div class="h3 mb-0">${org.totalCredits || 0}</div>
                            </div>
                            <div class="col-6">
                                <div class="text-muted mb-1">Remaining</div>
                                <div class="h3 mb-0 ${org.remainingCredits < 100 ? 'text-danger' : 'text-success'}">
                                    ${org.remainingCredits || 0}
                                </div>
                            </div>
                        </div>
                        <div class="progress mt-3" style="height: 8px;">
                            <div 
                                class="progress-bar" 
                                role="progressbar" 
                                style="width: ${org.totalCredits > 0 ? (org.remainingCredits / org.totalCredits * 100) : 0}%"
                            ></div>
                        </div>
                        <div class="text-muted small mt-2">
                            ${org.totalCredits > 0 ? Math.round((org.remainingCredits / org.totalCredits) * 100) : 0}% remaining
                        </div>
                    </div>
                </div>
            </div>
        </div>

        ${isPersonal ? html`
            <div class="row mt-4">
                <div class="col-12">
                    <div class="alert alert-info" role="alert">
                        <h4 class="alert-title">
                            <i class="ti ti-rocket me-2"></i>
                            Upgrade to Business License
                        </h4>
                        <div class="text-muted">
                            <p class="mb-2">Personal license is limited to 5 devices and does not include:</p>
                            <ul class="mb-3">
                                <li><strong>License Management:</strong> Create, rotate, and manage multiple licenses</li>
                                <li><strong>Team Access:</strong> Add team members with role-based access control</li>
                                <li><strong>Seat-based Licensing:</strong> Scale to unlimited devices based on seats purchased</li>
                                <li><strong>Advanced Configuration:</strong> Org-level telemetry and compliance settings</li>
                            </ul>
                            <a href="mailto:sales@magensec.com?subject=Upgrade%20to%20Business%20License" class="btn btn-primary">
                                <i class="ti ti-mail me-2"></i>
                                Contact Sales
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        ` : ''}
    `;
}

// Licenses Tab
function LicensesTab({ licenses, onRotate, onDisable, onCopy, onAdjust, isSiteAdmin }) {
    if (!licenses || licenses.length === 0) {
        return html`
            <div class="empty">
                <div class="empty-icon">
                    <i class="ti ti-key icon"></i>
                </div>
                <p class="empty-title">No licenses found</p>
                <p class="empty-subtitle text-muted">Contact your administrator to add a license</p>
            </div>
        `;
    }

    return html`
        <div>
            <h3 class="card-title mb-3">License Management</h3>
            <div class="table-responsive">
                <table class="table table-vcenter">
                    <thead>
                        <tr>
                            <th>Serial Key</th>
                            <th>Type</th>
                            <th>Seats</th>
                            <th>Credits</th>
                            <th>Status</th>
                            <th>Rotated</th>
                            <th class="w-1"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${licenses.map(license => {
                            const serialKey = license.serialKey || 'N/A';
                            const maskedKey = serialKey.length > 8 ? `${serialKey.substring(0, 4)}-****-****` : serialKey;
                            
                            return html`
                                <tr>
                                    <td>
                                        <code class="me-2">${maskedKey}</code>
                                        <button 
                                            class="btn btn-sm btn-ghost-secondary"
                                            onClick=${() => onCopy(serialKey)}
                                            title="Copy full key"
                                        >
                                            <i class="ti ti-copy"></i>
                                        </button>
                                    </td>
                                    <td>
                                        <span class="badge bg-blue-lt">${license.licenseType || 'Business'}</span>
                                    </td>
                                    <td>${license.seats || 'N/A'}</td>
                                    <td>
                                        <span class="text-muted">${license.remainingCredits || 0}</span>
                                        / ${license.totalCredits || 0}
                                    </td>
                                    <td>
                                        ${license.isDisabled && html`
                                            <span class="badge bg-warning">Disabled</span>
                                        `}
                                        ${!license.isActive && !license.isDisabled && html`
                                            <span class="badge bg-danger">Inactive</span>
                                        `}
                                        ${license.isActive && !license.isDisabled && html`
                                            <span class="badge bg-success">Active</span>
                                        `}
                                    </td>
                                    <td class="text-muted">
                                        ${license.rotatedAt ? new Date(license.rotatedAt).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td>
                                        <div class="btn-group">
                                            <button 
                                                class="btn btn-sm btn-primary"
                                                onClick=${() => onRotate(license.licenseId || license.rowKey)}
                                                disabled=${!license.isActive}
                                            >
                                                Rotate
                                            </button>
                                            <button 
                                                class="btn btn-sm ${license.isDisabled ? 'btn-success' : 'btn-warning'}"
                                                onClick=${() => onDisable(license.licenseId || license.rowKey, license.isDisabled)}
                                            >
                                                ${license.isDisabled ? 'Enable' : 'Disable'}
                                            </button>
                                            ${isSiteAdmin && html`
                                                <button 
                                                    class="btn btn-sm btn-info"
                                                    onClick=${() => onAdjust(license)}
                                                    title="Adjust seats and credits"
                                                >
                                                    Adjust
                                                </button>
                                            `}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        })}
                    </tbody>
                </table>
            </div>
            
            <div class="alert alert-info mt-3">
                <div class="d-flex">
                    <div>
                        <i class="ti ti-info-circle icon alert-icon"></i>
                    </div>
                    <div>
                        <h4 class="alert-title">License Status Explained</h4>
                        <ul class="mb-0">
                            <li><strong>Active:</strong> License can be used for new device registrations and heartbeats</li>
                            <li><strong>Inactive:</strong> License was rotated or replaced. Devices must use the new license</li>
                            <li><strong>Disabled:</strong> Temporarily suspended. Devices continue with limited functionality (60m heartbeat)</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Team Tab
function TeamTab({ members, orgId, onReload, onAddMember, onRemoveMember, onUpdateRole, teamEmail, setTeamEmail, teamRole, setTeamRole, accounts, isValidEmail, setTeamSearch, teamSearch, showTeamDropdown, setShowTeamDropdown }) {
    const filteredAccounts = teamSearch 
        ? accounts.filter(acc => acc.email?.toLowerCase().includes(teamSearch.toLowerCase()))
        : accounts;
    
    const handleSelectUser = (email) => {
        setTeamEmail(email);
        setTeamSearch('');
        setShowTeamDropdown(false);
    };

    const handleAddClick = () => {
        if (!teamEmail) {
            return;
        }
        if (!isValidEmail(teamEmail)) {
            return;
        }
        onAddMember();
        setTeamSearch('');
        setShowTeamDropdown(false);
    };

    return html`
        <div>
            <h3 class="card-title mb-3">Team Members</h3>
            
            <!-- Add Member Form -->
            <div class="card bg-light mb-4">
                <div class="card-body">
                    <h4 class="card-title">Add Team Member</h4>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Email Address <span class="text-danger">*</span></label>
                            <div class="position-relative">
                                <input 
                                    type="text" 
                                    class=${`form-control ${teamEmail && !isValidEmail(teamEmail) ? 'is-invalid' : ''}`}
                                    placeholder="user@example.com"
                                    value=${teamEmail}
                                    onInput=${(e) => {
                                        setTeamEmail(e.target.value);
                                        setTeamSearch(e.target.value);
                                        setShowTeamDropdown(true);
                                    }}
                                    onFocus=${() => setShowTeamDropdown(true)}
                                />
                                ${teamEmail && !isValidEmail(teamEmail) && html`
                                    <div class="invalid-feedback d-block mt-1">
                                        <small><i class="ti ti-alert-circle me-1"></i>Please enter a valid email address</small>
                                    </div>
                                `}
                                ${showTeamDropdown && filteredAccounts.length > 0 && html`
                                    <div class="dropdown-menu show position-absolute w-100" style="top: 100%; z-index: 1000; display: block;\">
                                        ${filteredAccounts.slice(0, 10).map(acc => html`
                                            <button 
                                                type="button"
                                                class="dropdown-item"
                                                onClick=${() => handleSelectUser(acc.email)}
                                            >
                                                <small>${acc.email}</small>
                                            </button>
                                        `)}
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Role</label>
                            <select 
                                class="form-select" 
                                value=${teamRole}
                                onChange=${(e) => setTeamRole(e.target.value)}
                            >
                                <option value="ReadWrite\">ReadWrite</option>
                                <option value="ReadOnly\">ReadOnly</option>
                            </select>
                        </div>
                        <div class="col-md-2 d-flex align-items-end">
                            <button 
                                class="btn btn-primary w-100" 
                                onClick=${handleAddClick}
                                disabled=${!teamEmail || !isValidEmail(teamEmail)}
                            >
                                <i class="ti ti-plus me-1"></i>
                                Add
                            </button>
                        </div>
                    </div>
                    <div class="text-muted small mt-2">
                        <strong>ReadWrite:</strong> Can manage devices, licenses, and view telemetry.
                        <strong>ReadOnly:</strong> Can only view telemetry and device list.
                    </div>
                </div>
            </div>

            <!-- Members List -->
            ${(!members || members.length === 0) ? html`
                <div class="empty">
                    <div class="empty-icon">
                        <i class="ti ti-users icon"></i>
                    </div>
                    <p class="empty-title">No team members yet</p>
                    <p class="empty-subtitle text-muted">Add members above to collaborate on this organization</p>
                </div>
            ` : html`
                <div class="table-responsive">
                    <table class="table table-vcenter card-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Added</th>
                                <th class="w-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(member => html`
                                <tr>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <span class="avatar avatar-sm me-2">${member.userEmail?.substring(0, 2).toUpperCase()}</span>
                                            ${member.userId || 'Unknown'}
                                        </div>
                                    </td>
                                    <td>${member.userEmail}</td>
                                    <td>
                                        <select 
                                            class=${`form-select form-select-sm w-auto badge ${member.role === 'ReadWrite' ? 'bg-primary' : 'bg-secondary'}`}
                                            value=${member.role}
                                            onChange=${(e) => onUpdateRole(member.userId, e.target.value)}
                                            style="border: none; color: white; font-weight: 500;"
                                        >
                                            <option value="ReadWrite">ReadWrite</option>
                                            <option value="ReadOnly">ReadOnly</option>
                                        </select>
                                    </td>
                                    <td class="text-muted">
                                        ${member.addedAt ? new Date(member.addedAt).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td>
                                        <button 
                                            class="btn btn-sm btn-ghost-danger"
                                            onClick=${() => onRemoveMember(member.userId)}
                                            title="Remove member"
                                        >
                                            <i class="ti ti-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            `}
        </div>
    `;
}

// Advanced Tab (Site Admin only)
function AdvancedTab({ org, telemetryConfig, onReload, onCreateOrg, onUpdateOrg, onDisableOrg, onDeleteOrg, 
    newOrgName, setNewOrgName, newOwnerEmail, setNewOwnerEmail, newOrgSeats, setNewOrgSeats, newOrgCredits, setNewOrgCredits,
    updateOrgName, setUpdateOrgName, updateOrgCredits, setUpdateOrgCredits,
    advancedTab, setAdvancedTab, accounts, isValidEmail,
    orgOwnerSearch, setOrgOwnerSearch, showOwnerDropdown, setShowOwnerDropdown }) {
    
    const filteredOwnerAccounts = orgOwnerSearch 
        ? accounts.filter(acc => acc.email?.toLowerCase().includes(orgOwnerSearch.toLowerCase()))
        : accounts;

    const [showDangerZone, setShowDangerZone] = useState(false);
    
    const handleSelectOwner = (email) => {
        setNewOwnerEmail(email);
        setOrgOwnerSearch('');
        setShowOwnerDropdown(false);
    };

    return html`
        <div>
            <h3 class="card-title mb-3">Advanced Configuration (Site Admin)</h3>
            
            <div class="alert alert-warning">
                <div class="d-flex">
                    <div>
                        <i class="ti ti-shield-lock icon alert-icon"></i>
                    </div>
                    <div>
                        <h4 class="alert-title">Site Admin Access</h4>
                        <p class="mb-0">These settings affect telemetry, SAS tokens, and org-level configuration.</p>
                    </div>
                </div>
            </div>

            ${telemetryConfig && html`
                <div class="card bg-light mb-3">
                    <div class="card-body">
                        <h4>Telemetry Configuration</h4>
                        <table class="table table-sm">
                            <tbody>
                                <tr>
                                    <td>SAS Lifetime</td>
                                    <td><code>${telemetryConfig.sasLifetimeHours || 6} hours</code></td>
                                </tr>
                                <tr>
                                    <td>Ingest Mode</td>
                                    <td><code>${telemetryConfig.ingestMode || 'DirectToTable'}</code></td>
                                </tr>
                                <tr>
                                    <td>SAS Scope</td>
                                    <td><code>${telemetryConfig.sasScope || 'PerOrg'}</code></td>
                                </tr>
                                <tr>
                                    <td>Telemetry Enabled</td>
                                    <td>
                                        <span class=${`badge ${telemetryConfig.telemetryEnabled ? 'bg-success' : 'bg-danger'}`}>
                                            ${telemetryConfig.telemetryEnabled ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `}

            <!-- Org Management Tabs -->
            <div class="card">
                <div class="card-header">
                    <ul class="nav nav-tabs card-header-tabs" role="tablist">
                        <li class="nav-item">
                            <a 
                                class=${`nav-link ${advancedTab === 'create' ? 'active' : ''}`}
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setAdvancedTab('create'); }}
                            >
                                <i class="ti ti-plus me-2"></i>
                                Create Organization
                            </a>
                        </li>
                        <li class="nav-item">
                            <a 
                                class=${`nav-link ${advancedTab === 'update' ? 'active' : ''}`}
                                href="#"
                                onClick=${(e) => { e.preventDefault(); setAdvancedTab('update'); }}
                            >
                                <i class="ti ti-edit me-2"></i>
                                Update Organization
                            </a>
                        </li>
                    </ul>
                </div>

                <div class="card-body">
                    ${advancedTab === 'create' && html`
                        <div>
                            <h4 class="card-title mb-4">Create New Organization</h4>
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label">Organization Name <span class="text-danger">*</span></label>
                                    <input 
                                        class="form-control" 
                                        placeholder="Acme Corp" 
                                        value=${newOrgName} 
                                        onInput=${(e) => setNewOrgName(e.target.value)} 
                                    />
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
                                        ${newOwnerEmail && !isValidEmail(newOwnerEmail) && html`
                                            <div class="invalid-feedback d-block mt-1">
                                                <small><i class="ti ti-alert-circle me-1"></i>Please enter a valid email address</small>
                                            </div>
                                        `}
                                        ${showOwnerDropdown && filteredOwnerAccounts.length > 0 && html`
                                            <div class="dropdown-menu show position-absolute w-100" style="top: 100%; z-index: 1000; display: block;">
                                                ${filteredOwnerAccounts.slice(0, 10).map(acc => html`
                                                    <button 
                                                        type="button"
                                                        class="dropdown-item"
                                                        onClick=${() => handleSelectOwner(acc.email)}
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
                                    <label class="form-label">Total Credits</label>
                                    <input type="number" class="form-control" placeholder="7300" value=${newOrgCredits} onInput=${(e) => setNewOrgCredits(e.target.value)} />
                                </div>
                                <div class="col-12">
                                    <button 
                                        class="btn btn-primary" 
                                        onClick=${onCreateOrg}
                                        disabled=${!newOrgName || !newOwnerEmail || !isValidEmail(newOwnerEmail)}
                                    >
                                        <i class="ti ti-plus me-2"></i>
                                        Create Organization
                                    </button>
                                </div>
                            </div>
                        </div>
                    `}

                    ${advancedTab === 'update' && html`
                        <div>
                            <h4 class="card-title mb-4">Update Current Organization</h4>
                            ${!org?.orgId ? html`
                                <div class="alert alert-info">
                                    <i class="ti ti-info-circle me-2"></i>
                                    Select an organization from the dropdown to update settings.
                                </div>
                            ` : html`
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Organization Name</label>
                                        <input class="form-control" value=${updateOrgName} onInput=${(e) => setUpdateOrgName(e.target.value)} />
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Total Credits</label>
                                        <input type="number" class="form-control" value=${updateOrgCredits} onInput=${(e) => setUpdateOrgCredits(e.target.value)} />
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Owner Email</label>
                                        <input type="email" class="form-control" value=${org.ownerEmail} disabled />
                                        <small class="text-muted">Owner cannot be changed via UI</small>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Current Status</label>
                                        <div>
                                            <span class=${`badge ${org.isDisabled ? 'bg-danger' : 'bg-success'}`}>
                                                ${org.isDisabled ? 'Disabled' : 'Active'}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <hr />
                                        <div class="d-flex gap-2">
                                            <button class="btn btn-primary" onClick=${onUpdateOrg}>
                                                <i class="ti ti-device-floppy me-2"></i>
                                                Update Organization
                                            </button>
                                        </div>
                                    </div>
                                    <div class="col-12 mt-3">
                                        <div class="card border border-danger">
                                            <div class="card-header d-flex justify-content-between align-items-center">
                                                <div class="d-flex align-items-center gap-2">
                                                    <span class="badge bg-danger">Danger</span>
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
                                                            ${org.isDisabled ? 'Enable Organization' : 'Disable Organization'}
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
                            `}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Business-only message component used for Personal orgs
function BusinessOnlyMessage({ title, description }) {
    return html`
        <div>
            <h3 class="card-title mb-3">${title}</h3>
            <div class="alert alert-info" role="alert">
                <div class="d-flex">
                    <div>
                        <i class="ti ti-lock icon alert-icon"></i>
                    </div>
                    <div>
                        <h4 class="alert-title">Available for Business Organizations</h4>
                        <p class="mb-2 text-muted">${description}</p>
                        <a href="mailto:sales@magensec.com?subject=Upgrade%20to%20Business%20License" class="btn btn-primary">
                            <i class="ti ti-mail me-2"></i>
                            Contact Sales
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}
