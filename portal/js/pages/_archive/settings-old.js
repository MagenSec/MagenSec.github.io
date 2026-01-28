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

const ORG_DURATION_OPTIONS = [
    { label: '6 months (180 days)', value: 180 },
    { label: '1 year (365 days)', value: 365 },
    { label: '2 years (730 days)', value: 730 },
    { label: '3 years (1095 days)', value: 1095 }
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const GAUGE_GRADIENT_ID = 'settings-gauge-blue-gradient';

function getDaysLeftInfo(projectedExhaustion) {
    if (!projectedExhaustion) {
        return { daysLeft: null, targetDate: null };
    }

    const targetDate = new Date(projectedExhaustion);
    if (Number.isNaN(targetDate.getTime())) {
        return { daysLeft: null, targetDate: null };
    }

    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
    return { daysLeft, targetDate };
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
    // Standard SVG: 0° is at 3 o'clock, increases clockwise
    const angleInRadians = angleInDegrees * Math.PI / 180.0;
    return {
        x: cx + (radius * Math.cos(angleInRadians)),
        y: cy + (radius * Math.sin(angleInRadians))
    };
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    
    // For 270° arc (-135° to 135°), we need largeArcFlag=1, sweepFlag=1 (clockwise)
    const arcSize = endAngle - startAngle;
    const largeArcFlag = arcSize > 180 ? 1 : 0;
    const sweepFlag = 1; // Always clockwise for our gauges
    
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function getPercentRemaining(org) {
    if (!org || !org.totalCredits || org.totalCredits <= 0) {
        return null;
    }
    const rawPercent = (org.remainingCredits ?? 0) / org.totalCredits * 100;
    return Math.min(100, Math.max(0, Math.round(rawPercent)));
}

// Local helper to keep existing showToast signature while using default export
const showToast = (message, type) => toast.show(message, type);

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');
    const [loading, setLoading] = useState(true);
    const [org, setOrg] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [members, setMembers] = useState([]);

    const [isSiteAdmin, setIsSiteAdmin] = useState(false);
    const [isPersonalOrg, setIsPersonalOrg] = useState(false);

    const [teamEmail, setTeamEmail] = useState('');
    const [teamRole, setTeamRole] = useState('ReadWrite');

    const [teamSearch, setTeamSearch] = useState('');
    const [showTeamDropdown, setShowTeamDropdown] = useState(false);
    const [accounts, setAccounts] = useState([]);

    const [adjustingLicense, setAdjustingLicense] = useState(null);
    const [creditHistory, setCreditHistory] = useState([]);
    const [projectedExhaustion, setProjectedExhaustion] = useState(null);
    const [sendingTestEmail, setSendingTestEmail] = useState(false);
    const [emailPreferences, setEmailPreferences] = useState(null);
    const [savingPreferences, setSavingPreferences] = useState(false);

    // Email validation helper
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const [reportConfig, setReportConfig] = useState(null);
    const [savingReportConfig, setSavingReportConfig] = useState(false);

    // Load data on mount and reload when org changes
    useEffect(() => {
        const unsubscribe = orgContext.onChange(() => {
            setActiveTab('general');
            loadSettings();
        });
        
        loadSettings();
        
        return unsubscribe;
    }, []);

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
            const userType = user?.userType || 'EndUser';
            setIsSiteAdmin(userType === 'SiteAdmin');

            // Fetch full org details from API for complete data
            let isPersonalType = false; // Default for fallback path
            try {
                const orgRes = await api.get(`/api/v1/orgs/${currentOrgId}`);
                logger.info('[Settings] Org API response', { success: orgRes.success, hasData: !!orgRes.data, orgRes });
                if (orgRes.success && orgRes.data) {
                    const orgData = orgRes.data;
                    logger.info('[Settings] Setting org state from API', { 
                        ownerEmail: orgData.ownerEmail, 
                        totalCredits: orgData.totalCredits,
                        remainingCredits: orgData.remainingCredits 
                    });
                    isPersonalType = orgData.type === 'Personal' || orgData.orgType === 'Personal';
                    setOrg({
                        orgId: orgData.orgId,
                        orgName: orgData.orgName || orgData.name,
                        ownerEmail: orgData.ownerEmail || 'Unknown',
                        totalCredits: orgData.totalCredits ?? 0,
                        remainingCredits: orgData.remainingCredits ?? 0,
                        seats: orgData.seats ?? orgData.totalSeats ?? null,
                        isDisabled: orgData.isDisabled ?? false,
                        isPersonal: isPersonalType
                    });
                    setIsPersonalOrg(isPersonalType);
                } else {
                    logger.warn('[Settings] Org API response not successful', orgRes);
                }
            } catch (orgErr) {
                logger.warn('[Settings] Failed to load org details, using context data as fallback', orgErr);
                // Fallback to org context if API fails
                const contextOrg = orgContext.getCurrentOrg();
                if (contextOrg) {
                    isPersonalType = contextOrg.type === 'Personal';
                    setOrg({
                        orgId: contextOrg.orgId,
                        orgName: contextOrg.name,
                        ownerEmail: contextOrg.ownerEmail || 'Unknown',
                        totalCredits: contextOrg.totalCredits ?? 0,
                        remainingCredits: contextOrg.remainingCredits ?? 0,
                        seats: contextOrg.totalSeats ?? null,
                        isDisabled: contextOrg.isDisabled ?? false,
                        isPersonal: isPersonalType
                    });
                    setIsPersonalOrg(isPersonalType);
                }
            }

            // Only load licenses and members for Business orgs
            // Personal orgs don't have these features (use computed value, not state)
            const isPersonal = isPersonalType;
            if (!isPersonal) {
                // Load licenses
                // Use portal-friendly alias for org licenses
                const licensesRes = await api.get(`/api/v1/licenses/org/${currentOrgId}`);
                if (licensesRes.success && licensesRes.data) {
                    setLicenses(licensesRes.data);
                }

                // Load team members
                const membersRes = await api.get(`/api/v1/orgs/${currentOrgId}/members`);
                if (membersRes.success && membersRes.data) {
                    setMembers(membersRes.data);
                }
            } else {
                // Clear licenses and members for personal orgs
                setLicenses([]);
                setMembers([]);
            }

            // Load all accounts for user search (Site Admin)
            if (isSiteAdmin) {
                try {
                    const accountsRes = await api.get('/api/v1/admin/accounts');
                    if (accountsRes.success && accountsRes.data) {
                        setAccounts(accountsRes.data);
                    }
                } catch (accErr) {
                    logger.debug('[Settings] Could not load accounts list', accErr);
                    setAccounts([]);
                }
            }

            // Credit history for charts (all org types)
            try {
                const creditRes = await api.get(`/api/v1/orgs/${currentOrgId}/credits/history`);
                if (creditRes.success && creditRes.data) {
                    setCreditHistory(creditRes.data.history || []);
                    setProjectedExhaustion(creditRes.data.projectedExhaustionDate || null);
                }
            } catch (creditErr) {
                logger.debug('[Settings] Credit history not available', creditErr);
                setCreditHistory([]);
                setProjectedExhaustion(null);
            }

            // Load email preferences for Business orgs (owner or SiteAdmin only)
            // NOTE: Email preferences feature is optional and should not block page load
            // Use direct fetch to avoid api.js auto-logout on permission errors
            const canManageEmailPrefs = (userType === 'SiteAdmin') || currentOrg?.role === 'Owner';
            if (!isPersonalType && canManageEmailPrefs) {
                try {
                    const response = await api.get(`/api/v1/orgs/${currentOrgId}/email-preferences`);

                    if (response.success && response.data) {
                        setEmailPreferences(response.data);
                        logger.debug('[Settings] Email preferences loaded');
                    } else if (response.error === 'NOT_FOUND') {
                        // Endpoint not implemented yet - expected, skip silently
                        logger.debug('[Settings] Email preferences endpoint not available');
                    } else if (response.error === 'FORBIDDEN' || response.error === 'UNAUTHORIZED') {
                        // Permission denied or not authorized - this is expected for some users
                        // Email preferences feature is admin-only, skip silently
                        logger.debug('[Settings] Email preferences not available (admin feature)');
                    } else if (response.error) {
                        logger.warn('[Settings] Email preferences error:', response.error);
                    }
                } catch (error) {
                    // Network error or other issue - log but don't fail page load
                    logger.error('[Settings] Error loading email preferences:', error);
                }

                // Load report configuration
                try {
                    const reportRes = await api.get(`/api/v1/admin/email/${currentOrgId}/config`);
                    if (reportRes.success && reportRes.data) {
                        setReportConfig(reportRes.data);
                        logger.debug('[Settings] Report configuration loaded');
                    } else {
                        logger.debug('[Settings] Report configuration not available:', reportRes.error);
                    }
                } catch (error) {
                    logger.error('[Settings] Error loading report config:', error);
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
            const res = await api.put(`/api/v1/licenses/${licenseId}/rotate`, { orgId: currentOrg?.orgId });
            
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

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard', 'success');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
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









    const toggleEmailPreference = (key) => {
        if (!emailPreferences) return;
        setEmailPreferences({
            ...emailPreferences,
            [key]: !emailPreferences[key]
        });
    };

    const handleSaveEmailPreferences = async (preferences) => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        try {
            setSavingPreferences(true);
            
            const res = await api.put(`/api/v1/orgs/${currentOrg.orgId}/email-preferences`, preferences || emailPreferences);
            
            if (res.success) {
                showToast('Email preferences saved', 'success');
                setEmailPreferences(preferences);
            } else if (res.error === 'FORBIDDEN' || res.error === 'UNAUTHORIZED') {
                showToast('You do not have permission to modify email preferences', 'warning');
            } else {
                showToast(res.message || 'Failed to save preferences', 'error');
            }
        } catch (error) {
            logger.error('[Settings] Error saving email preferences', error);
            showToast(error?.message || 'Failed to save preferences', 'error');
        } finally {
            setSavingPreferences(false);
        }
    };

    const handleSaveReportConfig = async (config) => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId) {
            showToast('No organization selected', 'warning');
            return;
        }

        try {
            setSavingReportConfig(true);
            
            const res = await api.put(`/api/v1/admin/email/${currentOrg.orgId}/config`, config);
            
            if (res.success) {
                showToast('Report configuration saved', 'success');
                setReportConfig(config);
            } else if (res.error === 'FORBIDDEN' || res.error === 'UNAUTHORIZED') {
                showToast('You do not have permission to modify report settings', 'warning');
            } else {
                showToast(res.message || 'Failed to save report configuration', 'error');
            }
        } catch (error) {
            logger.error('[Settings] Error saving report config', error);
            showToast(error?.message || 'Failed to save report configuration', 'error');
        } finally {
            setSavingReportConfig(false);
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
                        ${html`
                            <li class="nav-item">
                                <a 
                                    class=${`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('reports'); }}
                                >
                                    <i class="ti ti-file-text me-2"></i>
                                    Reports
                                </a>
                            </li>
                        `}

                        ${!isPersonalOrg && html`
                            <li class="nav-item">
                                <a 
                                    class=${`nav-link ${activeTab === 'notifications' ? 'active' : ''}`}
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('notifications'); }}
                                >
                                    <i class="ti ti-bell me-2"></i>
                                    Email Notifications
                                </a>
                            </li>
                        `}

                    </ul>
                </div>

                <div class="card-body">
                    ${activeTab === 'general' && html`<${GeneralTab} org=${org} isPersonal=${isPersonalOrg} creditHistory=${creditHistory} projectedExhaustion=${projectedExhaustion} />`}
                    ${activeTab === 'licenses' && (isPersonalOrg
                        ? html`<${BusinessOnlyMessage} 
                            title=${'License Management (Business Only)'}
                            description=${'Personal licenses are limited to 5 devices and do not support license management. Upgrade to a Business license to create, rotate, and manage licenses.'}
                        />`
                        : html`<${LicensesTab} 
                            licenses=${licenses} 
                            onRotate=${handleRotateLicense}
                            onCopy=${copyToClipboard}
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
                    ${activeTab === 'notifications' && !isPersonalOrg && html`<${EmailNotificationsTab} 
                        orgId=${org?.orgId}
                        emailPreferences=${emailPreferences}
                        setEmailPreferences=${setEmailPreferences}
                        savingPreferences=${savingPreferences}
                        onSavePreferences=${handleSaveEmailPreferences}
                    />`}
                    ${activeTab === 'reports' && html`<${ReportsConfigTab}
                        orgId=${org?.orgId}
                        reportConfig=${reportConfig}
                        savingReportConfig=${savingReportConfig}
                        onSaveReportConfig=${handleSaveReportConfig}
                        isPersonalOrg=${isPersonalOrg}
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
function GeneralTab({ org, isPersonal, creditHistory, projectedExhaustion }) {
    if (!org) return html`<div class="text-muted">No organization data</div>`;

    const { daysLeft, targetDate } = getDaysLeftInfo(projectedExhaustion);
    const projectionLabel = targetDate
        ? `Projected to expire on ${targetDate.toLocaleDateString()}`
        : 'Projection not available yet';
    const percentRemaining = getPercentRemaining(org);
    const percentDisplay = percentRemaining !== null ? percentRemaining : 0;
    const statusClass = org.isDisabled
        ? 'badge bg-light text-danger border border-danger'
        : 'badge bg-light text-success border border-success';
    const statusText = org.isDisabled ? 'Disabled' : 'Active';

    return html`
        <div class="row">
            <div class="col-md-6">
                <div class="card bg-light">
                    <div class="card-body">
                        <h3 class="card-title mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>
                            Organization Information
                        </h3>
                        <table class="table table-vcenter">
                            <tbody>
                                <tr>
                                    <td class="text-muted" style="width: 40%;">Organization ID</td>
                                    <td><code>${org.orgId}</code></td>
                                </tr>
                                <tr>
                                    <td class="text-muted">Name</td>
                                    <td><strong>${org.orgName}</strong></td>
                                </tr>
                                <tr>
                                    <td class="text-muted">Owner</td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <span class="avatar avatar-xs me-2 bg-blue-lt">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>
                                            </span>
                                            ${org.ownerEmail}
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-muted">Seats</td>
                                    <td>
                                        <span class="badge bg-blue-lt text-blue">${org.seats || 'N/A'}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-muted">Status</td>
                                    <td>
                                        <span class="badge ${org.isDisabled ? 'bg-secondary text-white' : 'bg-success text-white'}">
                                            ${statusText}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <h3 class="card-title mb-3">Days Remaining</h3>
                <div class="card bg-light">
                    <div class="card-body">
                        <div class="d-flex flex-column flex-sm-row align-items-center gap-4">
                            <div class="flex-fill">
                                <div class="text-muted small mb-1">Projected days left</div>
                                <div class="display-4 fw-bold mb-1">${daysLeft !== null ? daysLeft : '—'}</div>
                                <div class="text-muted small">${projectionLabel}</div>
                            </div>
                            <div class="d-flex flex-column align-items-center">
                                <${SemiCircleGauge} percent=${percentDisplay} />
                                <div class="text-muted small mt-2">
                                    ${daysLeft !== null && org.totalCredits && org.seats 
                                        ? `${daysLeft} of ${Math.round(org.totalCredits / org.seats)} days`
                                        : '—'}
                                </div>
                            </div>
                        </div>
                        <div class="mt-4">
                            <CreditsChart history=${creditHistory} projectedExhaustion=${projectedExhaustion} />
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

function SemiCircleGauge({ percent }) {
    const clamped = percent !== null ? Math.min(100, Math.max(0, percent)) : 0;
    
    // Rotated 90° anti-clockwise from bottom opening: now opens on right side
    const startAngle = -225; // -135° - 90°
    const endAngle = 45;     // 135° - 90°
    const totalDegrees = endAngle - startAngle; // 270°
    const valueDegrees = (clamped / 100) * totalDegrees;
    const valueEndAngle = startAngle + valueDegrees;
    
    const radius = 80;
    const centerX = 120;
    const centerY = 100;
    const strokeWidth = 15;
    
    // Generate arc paths
    const backgroundPath = describeArc(centerX, centerY, radius, startAngle, endAngle);
    const valuePath = clamped > 0 ? describeArc(centerX, centerY, radius, startAngle, valueEndAngle) : '';
    
    const displayPercent = percent !== null ? `${clamped}%` : '—';
    const ariaLabel = percent !== null ? `Credits remaining ${displayPercent}` : 'Credits remaining gauge';

    return html`
        <div class="position-relative" style="width: 240px; height: 160px;">
            <svg
                width="240"
                height="160"
                viewBox="0 0 240 160"
                role="img"
                aria-label=${ariaLabel}
            >
                <defs>
                    <linearGradient id=${GAUGE_GRADIENT_ID} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#0084ff" stop-opacity="1" />
                        <stop offset="50%" stop-color="#0066cc" stop-opacity="1" />
                        <stop offset="65%" stop-color="#0055b3" stop-opacity="1" />
                        <stop offset="91%" stop-color="#004499" stop-opacity="1" />
                    </linearGradient>
                </defs>
                
                <!-- Background arc (light gray, dashed) -->
                <path
                    d=${backgroundPath}
                    fill="none"
                    stroke="#e9ecef"
                    stroke-width=${strokeWidth}
                    stroke-linecap="round"
                    stroke-dasharray="4"
                />
                
                <!-- Value arc (blue gradient, dashed) -->
                ${clamped > 0 ? html`
                    <path
                        d=${valuePath}
                        fill="none"
                        stroke=${`url(#${GAUGE_GRADIENT_ID})`}
                        stroke-width=${strokeWidth}
                        stroke-linecap="round"
                        stroke-dasharray="4"
                    />
                ` : ''}
            </svg>
            
            <!-- Center label -->
            <div class="position-absolute" style="top: 70px; left: 50%; transform: translateX(-50%); text-align: center;">
                <div class="fs-3 fw-bold text-dark">${displayPercent}</div>
                <div class="text-muted small">remaining</div>
            </div>
        </div>
    `;
}

function CreditsChart({ history, projectedExhaustion }) {
    if (!history || history.length === 0) {
        return html`<div class="text-muted small">No recent credit activity yet.</div>`;
    }

    const points = history
        .map(h => ({
            x: new Date(h.date).getTime(),
            y: h.remainingCredits ?? 0,
            seats: h.seats ?? null
        }))
        .filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x !== null && p.y !== null && isFinite(p.x) && isFinite(p.y));

    if (points.length === 0) {
        return html`<div class="text-muted small">Invalid credit history data.</div>`;
    }

    const minY = Math.min(...points.map(p => p.y), 0);
    const maxY = Math.max(...points.map(p => p.y), 1);
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));

    const normalize = (val, min, max) => {
        if (!isFinite(val) || !isFinite(min) || !isFinite(max) || max === min) return 0;
        const result = (val - min) / (max - min);
        return isFinite(result) ? result : 0;
    };

    const width = 340;
    const height = 120;

    const polyline = points.map(p => {
        const x = normalize(p.x, minX, maxX) * width;
        const y = height - (normalize(p.y, minY, maxY) * height);
        // Ensure coordinates are valid numbers
        if (!isFinite(x) || !isFinite(y)) return null;
        return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    }).filter(p => p !== null).join(' ');

    const last = history[history.length - 1];
    const exhaustionText = projectedExhaustion
        ? `Projected to expire on ${new Date(projectedExhaustion).toLocaleDateString()}`
        : 'Projection not available yet';

    return html`
        <div>
            <div class="d-flex justify-content-between align-items-center mb-1">
                <div class="text-muted small">Credits trend</div>
                <div class="text-muted small">Remaining: <strong>${last?.remainingCredits ?? 0}</strong></div>
            </div>
            <svg width="100%" height="${height}" viewBox=${`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <polyline
                    fill="none"
                    stroke="var(--tblr-primary)"
                    stroke-width="3"
                    points=${polyline}
                    stroke-linejoin="round"
                    stroke-linecap="round"
                />
                <line x1="0" y1="${height - (normalize(0, minY, maxY) * height)}" x2="${width}" y2="${height - (normalize(0, minY, maxY) * height)}" stroke="#dee2e6" stroke-dasharray="4" />
            </svg>
            <div class="text-muted small mt-1">${exhaustionText}</div>
        </div>
    `;
}

// Licenses Tab
function LicensesTab({ licenses, onRotate, onCopy, isSiteAdmin }) {
    const [visibleKeys, setVisibleKeys] = useState({});

    const toggleKey = (id) => {
        setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return html`
        <div>
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="card-title mb-0">License Management</h3>
            </div>
            
            ${(!licenses || licenses.length === 0) ? html`
                <div class="empty">
                    <div class="empty-icon">
                        <i class="ti ti-key icon"></i>
                    </div>
                    <p class="empty-title">No licenses found</p>
                    <p class="empty-subtitle text-muted">Contact your administrator to create a license</p>
                </div>
            ` : html`
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
                                const id = license.licenseId || license.rowKey;
                                const serialKey = license.serialKey || 'N/A';
                                const isVisible = visibleKeys[id];
                                const displayKey = isVisible ? serialKey : (serialKey.length > 8 ? `${serialKey.substring(0, 4)}-****-****` : serialKey);
                                
                                return html`
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <code class="me-2">${displayKey}</code>
                                                <button 
                                                    class="btn btn-sm btn-icon btn-ghost-secondary me-1"
                                                    onClick=${() => toggleKey(id)}
                                                    title=${isVisible ? "Hide key" : "Show key"}
                                                >
                                                    <i class=${`ti ti-eye${isVisible ? '-off' : ''}`}></i>
                                                </button>
                                                <button 
                                                    class="btn btn-sm btn-icon btn-ghost-secondary"
                                                    onClick=${() => onCopy(serialKey)}
                                                    title="Copy full key"
                                                >
                                                    <i class="ti ti-copy"></i>
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge bg-primary">${license.licenseType || 'Business'}</span>
                                        </td>
                                        <td>${license.seats || 'N/A'}</td>
                                        <td>
                                            <span class="text-muted">${license.remainingCredits || 0}</span>
                                            / ${license.totalCredits || 0}
                                        </td>
                                        <td>
                                            ${license.isDisabled && html`
                                                <span class="badge bg-orange-lt">Disabled</span>
                                            `}
                                            ${!license.isActive && !license.isDisabled && html`
                                                <span class="badge bg-red-lt">Inactive</span>
                                            `}
                                            ${license.isActive && !license.isDisabled && html`
                                                <span class="badge bg-green-lt">Active</span>
                                            `}
                                        </td>
                                        <td class="text-muted">
                                            ${license.rotatedAt ? new Date(license.rotatedAt).toLocaleDateString() : 'Never'}
                                        </td>
                                        <td>
                                            <div class="btn-group">
                                                <button 
                                                    class="btn btn-sm btn-primary"
                                                    onClick=${() => onRotate(id)}
                                                    disabled=${!license.isActive}
                                                >
                                                    Rotate
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            })}
                        </tbody>
                    </table>
                </div>
            `}
            
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
function TeamTab({ members, orgId, onReload, onAddMember, onRemoveMember, onUpdateRole, teamEmail, setTeamEmail, teamRole, setTeamRole, accounts = [], isValidEmail, setTeamSearch, teamSearch, showTeamDropdown, setShowTeamDropdown }) {
    const filteredAccounts = (accounts && accounts.length > 0 && teamSearch)
        ? accounts.filter(acc => acc.email?.toLowerCase().includes(teamSearch.toLowerCase()) || acc.name?.toLowerCase().includes(teamSearch.toLowerCase()))
        : (accounts || []);
    
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
                    <h4 class="card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>
                        Add Team Member
                    </h4>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Email Address <span class="text-danger">*</span></label>
                            <div class="position-relative">
                                <div class="input-icon">
                                    <span class="input-icon-addon">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
                                    </span>
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
                                </div>
                                ${teamEmail && !isValidEmail(teamEmail) && html`
                                    <div class="invalid-feedback d-block mt-1">
                                        <small><i class="ti ti-alert-circle me-1"></i>Please enter a valid email address</small>
                                    </div>
                                `}
                                ${showTeamDropdown && filteredAccounts.length > 0 && html`
                                    <div class="dropdown-menu show position-absolute w-100" style="top: 100%; z-index: 1000; display: block;">
                                        ${filteredAccounts.slice(0, 10).map(acc => html`
                                            <button 
                                                type="button"
                                                class="dropdown-item"
                                                onClick=${() => handleSelectUser(acc.email)}
                                            >
                                                <small><strong>${acc.name || acc.email}</strong> · ${acc.email}</small>
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
                                <option value="ReadWrite">ReadWrite</option>
                                <option value="ReadOnly">ReadOnly</option>
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
                                            <span class="avatar avatar-sm me-2 bg-blue-lt text-blue">
                                                ${(member.displayName || member.userEmail || '').substring(0, 2).toUpperCase()}
                                            </span>
                                            <div class="d-flex flex-column">
                                                <strong>${member.displayName || member.userId || 'Unknown'}</strong>
                                                <small class="text-muted">${member.userId || member.userEmail}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1 text-muted" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
                                        ${member.userEmail}
                                    </td>
                                    <td>
                                        <select 
                                            class=${`form-select form-select-sm w-auto badge ${member.role === 'ReadWrite' ? 'bg-primary text-white' : 'bg-secondary text-white'}`}
                                            value=${member.role}
                                            onChange=${(e) => onUpdateRole(member.userId, e.target.value)}
                                            style="border: none; font-weight: 500;"
                                        >
                                            <option value="ReadWrite">ReadWrite</option>
                                            <option value="ReadOnly">ReadOnly</option>
                                        </select>
                                    </td>
                                    <td class="text-muted">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /></svg>
                                        ${member.addedAt ? new Date(member.addedAt).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td>
                                        <button 
                                            class="btn btn-sm btn-ghost-danger"
                                            onClick=${() => onRemoveMember(member.userId)}
                                            title="Remove member"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
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


// Email Notifications Tab - Manage email notification preferences
function EmailNotificationsTab({ orgId, emailPreferences, setEmailPreferences, savingPreferences, onSavePreferences }) {
    const [localPrefs, setLocalPrefs] = useState(null);

    const EVENT_GROUPS = [
        {
            title: 'Device Lifecycle',
            items: [
                { key: 'deviceRegistered', title: 'Device Registered', alwaysEnabled: true, defaultEnabled: true },
                { key: 'deviceBlocked', title: 'Device Blocked', alwaysEnabled: true, defaultEnabled: true },
                { key: 'deviceDeleted', title: 'Device Deleted', alwaysEnabled: true, defaultEnabled: true },
                { key: 'deviceDisabled', title: 'Device Disabled', defaultEnabled: true }
            ]
        },
        {
            title: 'License Lifecycle',
            items: [
                { key: 'licenseCreated', title: 'License Created', defaultEnabled: true },
                { key: 'licenseRotated', title: 'License Rotated', alwaysEnabled: true, defaultEnabled: true },
                { key: 'licenseExpired', title: 'License Expired', alwaysEnabled: true, defaultEnabled: true }
            ]
        },
        {
            title: 'Credit Monitoring',
            items: [
                { key: 'creditsLow', title: 'Credits Low Warning', alwaysEnabled: true, defaultEnabled: true },
                { key: 'licenseExpiringSoon', title: 'License Expiring Soon', alwaysEnabled: true, defaultEnabled: true }
            ]
        },
        {
            title: 'Organization Membership',
            items: [
                { key: 'orgMemberAdded', title: 'Member Added', defaultEnabled: true },
                { key: 'orgMemberRemoved', title: 'Member Removed', defaultEnabled: true },
                { key: 'roleChanged', title: 'Role Changed', defaultEnabled: true }
            ]
        },
        {
            title: 'Security & Monitoring',
            items: [
                { key: 'unauthorizedAccess', title: 'Unauthorized Access Attempts', alwaysEnabled: true, defaultEnabled: true },
                { key: 'highTelemetryFailures', title: 'High Telemetry Failure Rate', defaultEnabled: false },
                { key: 'seatLimitReached', title: 'Seat Limit Reached', defaultEnabled: true },
                { key: 'multiDeviceThreshold', title: 'Multi-Device Threshold Exceeded', defaultEnabled: false },
                { key: 'configurationChanged', title: 'Configuration Changed', defaultEnabled: false }
            ]
        },
        {
            title: 'Periodic Reports',
            items: [
                { key: 'weeklyDeviceSummary', title: 'Weekly Device Summary', defaultEnabled: false },
                { key: 'monthlyUsageReport', title: 'Monthly Usage Report', defaultEnabled: false }
            ]
        }
    ];

    useEffect(() => {
        const rawPrefs = emailPreferences?.preferences || emailPreferences?.Preferences || {};
        const sendToAllTeamMembers = emailPreferences?.sendToAllTeamMembers ?? emailPreferences?.SendToAllTeamMembers ?? false;
        const reportRecipients = [];
        const ownerEmail = emailPreferences?.ownerEmail || emailPreferences?.OwnerEmail || '';

        const normalizedPreferences = {};
        EVENT_GROUPS.forEach(group => {
            group.items.forEach(item => {
                const existing = rawPrefs[item.key] || rawPrefs[item.key.toLowerCase()] || null;
                const existingEnabled = existing?.enabled ?? existing?.Enabled;
                normalizedPreferences[item.key] = {
                    enabled: existingEnabled ?? item.defaultEnabled ?? true
                };
            });
        });

        setLocalPrefs({
            orgId,
            ownerEmail,
            sendToAllTeamMembers,
            reportRecipients,
            preferences: normalizedPreferences
        });
    }, [emailPreferences, orgId]);

    if (!localPrefs) {
        return html`<div class="text-muted">Loading preferences...</div>`;
    }

    const handleToggle = (key) => {
        const current = localPrefs.preferences[key]?.enabled ?? false;
        setLocalPrefs({
            ...localPrefs,
            preferences: {
                ...localPrefs.preferences,
                [key]: { enabled: !current }
            }
        });
    };

    const handleSave = async () => {
        const payload = {
            orgId: localPrefs.orgId,
            ownerEmail: localPrefs.ownerEmail,
            sendToAllTeamMembers: localPrefs.sendToAllTeamMembers,
            reportRecipients: [],
            preferences: localPrefs.preferences
        };
        await onSavePreferences(payload);
        setEmailPreferences(payload);
    };

    const EventToggle = ({ eventKey, title, alwaysEnabled = false, badge = null }) => {
        const enabled = alwaysEnabled ? true : (localPrefs.preferences[eventKey]?.enabled ?? false);
        if (alwaysEnabled) {
            return html`
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <i class="ti ti-check text-success"></i>
                        <span>${title}</span>
                    </div>
                    ${badge && html`<span class="badge bg-info-lt">${badge}</span>`}
                </div>
            `;
        }
        return html`
            <div class="form-check form-switch mb-2">
                <input 
                    class="form-check-input" 
                    type="checkbox" 
                    id=${eventKey}
                    checked=${enabled}
                    onChange=${() => handleToggle(eventKey)}
                    disabled=${savingPreferences}
                />
                <label class="form-check-label d-flex align-items-center" for=${eventKey}>
                    ${title}
                    ${badge && html`<span class="badge bg-info ms-2">${badge}</span>`}
                </label>
            </div>
        `;
    };

    return html`
        <div>
            <div class="d-flex justify-content-between align-items-start mb-4">
                <div>
                    <h3 class="card-title mb-1">Email Notifications</h3>
                    <div class="text-muted small">Choose who receives organization notifications and which events trigger emails</div>
                </div>
                <button 
                    class="btn btn-primary"
                    onClick=${handleSave}
                    disabled=${savingPreferences}
                >
                    ${savingPreferences ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-device-floppy me-2"></i>`}
                    Save Preferences
                </button>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h4 class="card-title">Recipients</h4>
                </div>
                <div class="card-body">
                    <div class="form-check form-switch mb-3">
                        <input 
                            class="form-check-input" 
                            type="checkbox" 
                            id="sendToAllTeamMembers"
                            checked=${localPrefs.sendToAllTeamMembers}
                            onChange=${() => setLocalPrefs({ ...localPrefs, sendToAllTeamMembers: !localPrefs.sendToAllTeamMembers })}
                            disabled=${savingPreferences}
                        />
                        <label class="form-check-label" for="sendToAllTeamMembers">
                            <strong>Send to All Team Members</strong>
                            <div class="small text-muted">Includes all users added under Team in addition to the organization owner</div>
                        </label>
                    </div>
                    <div class="alert alert-info mb-0">
                        <i class="ti ti-info-circle me-2"></i>
                        Notifications are delivered to the organization owner, plus team members when enabled.
                    </div>
                </div>
            </div>

            <div class="row g-3">
                ${EVENT_GROUPS.map(group => html`
                    <div class="col-12 col-lg-6">
                        <div class="card h-100">
                            <div class="card-header">
                                <h4 class="card-title">${group.title}</h4>
                            </div>
                            <div class="card-body">
                                ${group.items.map(item => html`
                                    <${EventToggle}
                                        eventKey=${item.key}
                                        title=${item.title}
                                        alwaysEnabled=${item.alwaysEnabled || false}
                                        badge=${item.alwaysEnabled ? 'Always On' : null}
                                    />
                                `)}
                                ${group.title === 'Periodic Reports' && html`
                                    <div class="alert alert-info mt-3">
                                        <i class="ti ti-info-circle me-2"></i>
                                        Reports are generated automatically and include device activity and usage trends.
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                `)}
            </div>

            <div class="text-end mt-4">
                <button 
                    class="btn btn-primary"
                    onClick=${handleSave}
                    disabled=${savingPreferences}
                >
                    ${savingPreferences ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-device-floppy me-2"></i>`}
                    Save Preferences
                </button>
            </div>
        </div>
    `;
}

// Reports Configuration Tab - Manage security report settings
function ReportsConfigTab({ orgId, reportConfig, savingReportConfig, onSaveReportConfig, isPersonalOrg }) {
    const [localConfig, setLocalConfig] = useState(null);
    const [showPopovers, setShowPopovers] = useState({});

    useEffect(() => {
        if (reportConfig) {
            // Normalize legacy fields if present and ensure required keys exist
            const normalized = {
                reportEnabled: reportConfig.reportEnabled ?? true,
                weeklyEnabled: reportConfig.weeklyEnabled ?? (reportConfig.reportFrequency === 'weekly'),
                dailySnapshotEnabled: reportConfig.dailySnapshotEnabled ?? (reportConfig.reportFrequency === 'daily'),
                reportTier: reportConfig.reportTier ?? 'Basic',
                sendToAllTeamMembers: reportConfig.sendToAllTeamMembers ?? true
            };
            // Personal orgs: force weekly off and tier Basic
            if (isPersonalOrg) {
                normalized.weeklyEnabled = false;
                normalized.reportTier = 'Basic';
            }
            setLocalConfig(normalized);
        } else {
            // Initialize with defaults
            const defaults = {
                reportEnabled: true,
                weeklyEnabled: !isPersonalOrg, // Business: weekly on by default; Personal: off
                dailySnapshotEnabled: false,
                reportTier: isPersonalOrg ? 'Basic' : 'Professional',
                sendToAllTeamMembers: true
            };
            setLocalConfig(defaults);
        }
    }, [reportConfig, orgId, isPersonalOrg]);

    if (!localConfig) {
        return html`<div class="text-muted">Loading report configuration...</div>`;
    }

    const handleToggle = (key) => {
        setLocalConfig({ ...localConfig, [key]: !localConfig[key] });
    };

    const handleTierChange = (value) => {
        setLocalConfig({ ...localConfig, reportTier: value });
    };

    const handleSave = async () => {
        const payload = { ...localConfig };
        // Ensure personal org constraints are respected
        if (isPersonalOrg) {
            payload.weeklyEnabled = false;
            payload.reportTier = 'Basic';
        }
        await onSaveReportConfig(payload);
    };

    const togglePopover = (key) => {
        setShowPopovers({ ...showPopovers, [key]: !showPopovers[key] });
    };

    return html`
        <div>
            <div class="d-flex justify-content-between align-items-start mb-4">
                <div>
                    <h3 class="card-title mb-1">Security Reports</h3>
                    <div class="text-muted small">Configure how and when security reports are delivered to your organization</div>
                </div>
                <button 
                    class="btn btn-primary"
                    onClick=${handleSave}
                    disabled=${savingReportConfig}
                >
                    ${savingReportConfig ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-device-floppy me-2"></i>`}
                    Save Settings
                </button>
            </div>

            <!-- Report Enable/Disable -->
            <div class="card mb-4">
                <div class="card-header">
                    <h4 class="card-title">Report Status</h4>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center gap-3">
                        <div class="form-check form-switch mb-0">
                            <input 
                                class="form-check-input" 
                                type="checkbox" 
                                id="reportEnabled"
                                checked=${localConfig.reportEnabled}
                                onChange=${() => handleToggle('reportEnabled')}
                                disabled=${savingReportConfig}
                            />
                            <label class="form-check-label" for="reportEnabled">
                                <strong>Enable Security Reports</strong>
                            </label>
                        </div>
                        <div class="text-muted small">When enabled, security reports will be generated and sent according to your configuration</div>
                    </div>
                </div>
            </div>

            <!-- Report Configuration - Only shown when reports enabled -->
            ${localConfig.reportEnabled && html`
                <div class="card mb-4">
                    <div class="card-header">
                        <h4 class="card-title">Report Configuration</h4>
                    </div>
                    <div class="card-body">
                        <!-- Toggles in a row -->
                        <div class="d-flex gap-4 flex-wrap">
                            <!-- Business Tier Toggle -->
                            <div class="d-flex flex-column gap-2">
                                <div class="d-flex align-items-center gap-2">
                                    <label class="form-label mb-0"><strong>Business Tier</strong></label>
                                    ${isPersonalOrg && html`
                                        <div 
                                            class="position-relative"
                                            onMouseEnter=${() => togglePopover('tier')}
                                            onMouseLeave=${() => togglePopover('tier')}
                                        >
                                            <i class="ti ti-info-circle text-warning" style="cursor: help; font-size: 16px;"></i>
                                            ${showPopovers.tier && html`
                                                <div class="popover bs-popover-bottom show" style="position: absolute; top: 100%; left: 0; margin-top: 8px; z-index: 1000; min-width: 200px;">
                                                    <div class="popover-arrow"></div>
                                                    <div class="popover-body p-2 text-muted small" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
                                                        Business Tier selection is available for Business organizations only. Upgrade to Business to unlock Professional and Premium tiers.
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                    `}
                                </div>
                                <div class="btn-group" role="group">
                                    <div class="position-relative">
                                        <input 
                                            type="radio" 
                                            class="btn-check" 
                                            id="tierPro"
                                            name="tier"
                                            value="Professional"
                                            checked=${localConfig.reportTier === 'Professional'}
                                            onChange=${(e) => handleTierChange(e.target.value)}
                                            disabled=${savingReportConfig || isPersonalOrg}
                                        />
                                        <label class="btn btn-outline-primary position-relative" for="tierPro">
                                            Professional
                                            <span 
                                                onMouseEnter=${() => togglePopover('professional')}
                                                onMouseLeave=${() => togglePopover('professional')}
                                                style="margin-left: 4px; cursor: help;"
                                            >
                                                <i class="ti ti-info-circle text-muted" style="font-size: 12px;"></i>
                                                ${showPopovers.professional && html`
                                                    <div class="popover bs-popover-top show" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; z-index: 1002; min-width: 240px;">
                                                        <div class="popover-arrow"></div>
                                                        <div class="popover-body p-2 text-muted small" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
                                                            <strong>Professional:</strong> Detailed analysis with device risk scores, vulnerability trends, and recommended actions.
                                                        </div>
                                                    </div>
                                                `}
                                            </span>
                                        </label>
                                    </div>
                                    
                                    <div class="position-relative">
                                        <input 
                                            type="radio" 
                                            class="btn-check" 
                                            id="tierPrem"
                                            name="tier"
                                            value="Premium"
                                            checked=${localConfig.reportTier === 'Premium'}
                                            onChange=${(e) => handleTierChange(e.target.value)}
                                            disabled=${savingReportConfig || isPersonalOrg}
                                        />
                                        <label class="btn btn-outline-primary position-relative" for="tierPrem">
                                            Premium
                                            <span 
                                                onMouseEnter=${() => togglePopover('premium')}
                                                onMouseLeave=${() => togglePopover('premium')}
                                                style="margin-left: 4px; cursor: help;"
                                            >
                                                <i class="ti ti-info-circle text-muted" style="font-size: 12px;"></i>
                                                ${showPopovers.premium && html`
                                                    <div class="popover bs-popover-top show" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; z-index: 1002; min-width: 240px;">
                                                        <div class="popover-arrow"></div>
                                                        <div class="popover-body p-2 text-muted small" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
                                                            <strong>Premium:</strong> Executive summary with compliance status, top threats, and strategic insights for leadership.
                                                        </div>
                                                    </div>
                                                `}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <!-- Weekly Report Toggle -->
                            <div class="d-flex flex-column gap-2">
                                <div class="d-flex align-items-center gap-2">
                                    <label class="form-label mb-0"><strong>Weekly Report</strong></label>
                                    <div 
                                        class="position-relative"
                                        onMouseEnter=${() => togglePopover('weeklyInfo')}
                                        onMouseLeave=${() => togglePopover('weeklyInfo')}
                                    >
                                        <i class="ti ti-info-circle text-muted" style="cursor: help; font-size: 16px;"></i>
                                        ${showPopovers.weeklyInfo && html`
                                            <div class="popover bs-popover-bottom show" style="position: absolute; top: 100%; left: 0; margin-top: 8px; z-index: 1000; min-width: 240px;">
                                                <div class="popover-arrow"></div>
                                                <div class="popover-body p-2 text-muted small" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
                                                    <strong>Weekly Summary:</strong> Comprehensive report delivered every Monday in your selected tier (Professional for detailed analysis or Premium for executive summary). Includes trends, comparative insights, and strategic recommendations.
                                                </div>
                                            </div>
                                        `}
                                    </div>
                                    ${isPersonalOrg && html`
                                        <div 
                                            class="position-relative"
                                            onMouseEnter=${() => togglePopover('weekly')}
                                            onMouseLeave=${() => togglePopover('weekly')}
                                        >
                                            <i class="ti ti-info-circle text-warning" style="cursor: help; font-size: 16px;"></i>
                                            ${showPopovers.weekly && html`
                                                <div class="popover bs-popover-bottom show" style="position: absolute; top: 100%; left: 0; margin-top: 8px; z-index: 1000; min-width: 200px;">
                                                    <div class="popover-arrow"></div>
                                                    <div class="popover-body p-2 text-muted small" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">
                                                        Weekly reports are exclusive to Business organizations. Upgrade to Business to enable.
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                    `}
                                </div>
                                <div class="form-check form-switch">
                                    <input 
                                        class="form-check-input" 
                                        type="checkbox" 
                                        id="weeklyEnabled"
                                        checked=${localConfig.weeklyEnabled}
                                        onChange=${() => handleToggle('weeklyEnabled')}
                                        disabled=${savingReportConfig || isPersonalOrg}
                                        style="width: 48px; height: 24px; margin-top: 2px;"
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
                                        id="dailySnapshotEnabled"
                                        checked=${localConfig.dailySnapshotEnabled}
                                        onChange=${() => handleToggle('dailySnapshotEnabled')}
                                        disabled=${savingReportConfig}
                                        style="width: 48px; height: 24px; margin-top: 2px;"
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
                                        id="sendToAllTeamMembers"
                                        checked=${localConfig.sendToAllTeamMembers}
                                        onChange=${() => handleToggle('sendToAllTeamMembers')}
                                        disabled=${savingReportConfig || isPersonalOrg}
                                        style="width: 48px; height: 24px; margin-top: 2px;"
                                    />
                                </div>
                                <small class="text-muted">${isPersonalOrg ? 'Business only' : 'Owner + team'}</small>
                            </div>
                        </div>

                        <div class="mt-4 pt-3 border-top">
                            <small class="text-muted d-block">
                                <i class="ti ti-info-circle me-2"></i>
                                Reports are sent to the organization owner and all team members who have opted in to email notifications.
                            </small>
                        </div>
                    </div>
                </div>
            `}
            <!-- Recipients moved to Email Notifications. No manual recipients here. -->
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
