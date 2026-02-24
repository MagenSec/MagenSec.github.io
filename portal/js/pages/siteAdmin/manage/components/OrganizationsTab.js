/**
 * Site Admin - Organizations Tab Component
 * Full-featured organization management: create, filter, paginate, manage, transfer ownership
 */

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

const ORG_DURATION_OPTIONS = [
    { label: '6 months (180 days)', value: 180 },
    { label: '1 year (365 days)', value: 365 },
    { label: '2 years (730 days)', value: 730 },
    { label: '3 years (1095 days)', value: 1095 }
];

export function OrganizationsTab({ 
    orgs = [], 
    accounts = [],
    onCreateOrg,
    onUpdateOrg,
    onToggleOrgStatus,
    onDeleteOrg,
    onTransferOwnership
}) {
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [visibleCount, setVisibleCount] = useState(30);
    const loadMoreStep = 20;
    const [orgSearch, setOrgSearch] = useState('');
    const [orgTypeFilter, setOrgTypeFilter] = useState('All');
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [showTransferOwner, setShowTransferOwner] = useState(false);
    const [newTransferOwner, setNewTransferOwner] = useState('');
    const [showDangerZone, setShowDangerZone] = useState(false);

    // Form state for creating new org
    const [newOrgName, setNewOrgName] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [newOrgSeats, setNewOrgSeats] = useState(20);
    const [newOrgDuration, setNewOrgDuration] = useState(365);
    const [orgOwnerSearch, setOrgOwnerSearch] = useState('');
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

    // Form state for updating org
    const [updateOrgName, setUpdateOrgName] = useState('');

    // Report configuration state (daily + weekly only — no tier concept)
    const [newDailyReportEnabled, setNewDailyReportEnabled] = useState(true);
    const [newWeeklyReportEnabled, setNewWeeklyReportEnabled] = useState(false);
    const [newSendToAllMembers, setNewSendToAllMembers] = useState(false);
    const [newIsDemoOrg, setNewIsDemoOrg] = useState(false);

    const [updateDailyReportEnabled, setUpdateDailyReportEnabled] = useState(true);
    const [updateWeeklyReportEnabled, setUpdateWeeklyReportEnabled] = useState(false);
    const [updateSendToAllMembers, setUpdateSendToAllMembers] = useState(false);
    const [updateIsDemoOrg, setUpdateIsDemoOrg] = useState(false);

    // AI context fields (B2 / C8)
    const [updateIndustry, setUpdateIndustry] = useState('');
    const [updateOrgSize, setUpdateOrgSize] = useState('');
    const [updateNextAuditDate, setUpdateNextAuditDate] = useState('');

    // License state
    const [orgLicenses, setOrgLicenses] = useState([]);
    const [showCreateLicense, setShowCreateLicense] = useState(false);
    const [newLicenseSeats, setNewLicenseSeats] = useState(20);
    const [newLicenseDuration, setNewLicenseDuration] = useState(365);

    // Email validation
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Determine if org is personal (based on isPersonal flag or email pattern)
    const isPersonalOrg = (org) => {
        return org.isPersonal !== undefined 
            ? org.isPersonal 
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(org.orgId);
    };

    // Filter organizations
    const filteredOrgs = orgs.filter(org => {
        const matchesSearch = !orgSearch || 
            (org.orgName || org.name || '').toLowerCase().includes(orgSearch.toLowerCase()) ||
            (org.orgId || '').toLowerCase().includes(orgSearch.toLowerCase()) ||
            (org.ownerEmail || '').toLowerCase().includes(orgSearch.toLowerCase());
        
        const isPersonal = isPersonalOrg(org);
        const matchesType = orgTypeFilter === 'All' || 
                           (orgTypeFilter === 'Personal' && isPersonal) ||
                           (orgTypeFilter === 'Business' && !isPersonal);
        return matchesSearch && matchesType;
    });

    const currentOrgs = filteredOrgs.slice(0, visibleCount);

    const listContainerRef = useRef(null);
    const sentinelRef = useRef(null);

    // Reset visible count when filters change
    useEffect(() => {
        setVisibleCount(30);
    }, [orgSearch, orgTypeFilter, orgs]);

    // Infinite scroll via intersection observer
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && visibleCount < filteredOrgs.length) {
                    setVisibleCount(prev => Math.min(prev + loadMoreStep, filteredOrgs.length));
                }
            });
        }, {
            root: listContainerRef.current,
            rootMargin: '200px',
            threshold: 0.1
        });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredOrgs.length, visibleCount]);

    const handleSelectOrg = async (org) => {
        setSelectedOrg(org);
        setSelectedOrgId(org.orgId);
        setUpdateOrgName(org.orgName || org.name || '');
        setNewTransferOwner(org.ownerEmail);
        setUpdateIsDemoOrg(!!org.isDemoOrg);
        setUpdateIndustry(org.industry || '');
        setUpdateOrgSize(org.orgSize || '');
        setUpdateNextAuditDate(org.nextAuditDate || '');
        setShowDangerZone(false);

        // Load report config + licenses lazily
        try {
            const configRes = await window.api.get(`/api/v1/orgs/${org.orgId}/report-config`);
            if (configRes?.success !== false && configRes?.data) {
                setUpdateDailyReportEnabled(configRes.data.dailyReportEnabled !== false);
                setUpdateWeeklyReportEnabled(!!configRes.data.weeklyReportEnabled);
                setUpdateSendToAllMembers(configRes.data.sendToAllTeamMembers !== false);
            }
        } catch (err) {
            console.warn('[OrganizationsTab] Failed to load report config', err);
            window.toast?.show?.(err?.message || 'Failed to load report config', 'error');
        }

        try {
            const licRes = await window.api.get(`/api/v1/licenses/org/${org.orgId}`);
            if (licRes?.success !== false) {
                const licenses = licRes.data || licRes?.Data || [];
                setOrgLicenses(Array.isArray(licenses) ? licenses : []);
            }
        } catch (err) {
            console.error('[OrganizationsTab] Failed to load licenses', err);
            setOrgLicenses([]);
        }
    };

    const filteredOwnerAccounts = accounts.filter(acc => 
        acc.email?.toLowerCase().includes(orgOwnerSearch.toLowerCase())
    );

    const formatDate = (value) => value ? new Date(value).toLocaleString() : '-';

    const handleCreateOrg = async () => {
        if (!newOrgName.trim() || newOrgName.trim().length < 4) {
            window.toast?.show?.('Organization name must be at least 4 characters', 'warning');
            return;
        }
        if (!isValidEmail(newOwnerEmail)) {
            window.toast?.show?.('Please enter a valid email address', 'warning');
            return;
        }

        const result = await onCreateOrg?.({
            orgName: newOrgName,
            ownerEmail: newOwnerEmail,
            seats: parseInt(newOrgSeats) || 20,
            duration: parseInt(newOrgDuration) || 365,
            dailyReportEnabled: newDailyReportEnabled,
            weeklyReportEnabled: newWeeklyReportEnabled,
            sendToAllTeamMembers: newSendToAllMembers,
            isDemoOrg: newIsDemoOrg
        });

        if (result?.success) {
            setNewOrgName('');
            setNewOwnerEmail('');
            setNewOrgSeats(20);
            setNewOrgDuration(365);
            setShowCreateForm(false);
        }
    };

    const handleUpdateOrg = async () => {
        if (!updateOrgName.trim() || updateOrgName.trim().length < 4) {
            window.toast?.show?.('Organization name must be at least 4 characters', 'warning');
            return;
        }

        const result = await onUpdateOrg?.({
            orgId: selectedOrgId,
            orgName: updateOrgName,
            dailyReportEnabled: updateDailyReportEnabled,
            weeklyReportEnabled: updateWeeklyReportEnabled,
            sendToAllTeamMembers: updateSendToAllMembers,
            isDemoOrg: updateIsDemoOrg,
            industry: updateIndustry || null,
            orgSize: updateOrgSize || null,
            nextAuditDate: updateNextAuditDate || null
        });

        if (result?.success) {
            setSelectedOrg(null);
            setSelectedOrgId('');
        }
    };

    const handleToggleStatus = async () => {
        if (!selectedOrgId) return;
        
        const action = selectedOrg.isDisabled ? 'enable' : 'disable';
        const result = await onToggleOrgStatus?.(selectedOrgId, action);

        if (result?.success) {
            setSelectedOrg({ ...selectedOrg, isDisabled: !selectedOrg.isDisabled });
        }
    };

    const handleDeleteOrg = async () => {
        if (!selectedOrgId) return;
        
        if (!confirm('Are you sure you want to DELETE this organization? This action cannot be undone and will delete all associated data.')) {
            return;
        }

        const result = await onDeleteOrg?.(selectedOrgId);

        if (result?.success) {
            setSelectedOrg(null);
            setSelectedOrgId('');
        }
    };

    const handleTransferOwnership = async () => {
        if (!selectedOrgId || !newTransferOwner) return;
        if (!confirm(`Transfer ownership of ${selectedOrg.orgName} to ${newTransferOwner}?`)) {
            return;
        }

        const result = await onTransferOwnership?.(selectedOrgId, newTransferOwner);

        if (result?.success) {
            setShowTransferOwner(false);
            setSelectedOrg(null);
            setSelectedOrgId('');
        }
    };

    const handleCreateLicense = async () => {
        if (!selectedOrgId) return;
        try {
            const res = await window.api.post('/api/v1/licenses', {
                orgId: selectedOrgId,
                seats: parseInt(newLicenseSeats) || 20,
                durationDays: parseInt(newLicenseDuration) || 365
            });
            if (res?.success !== false) {
                window.toast?.show?.('License created successfully', 'success');
                setShowCreateLicense(false);
                setNewLicenseSeats(20);
                setNewLicenseDuration(365);
                await handleSelectOrg(selectedOrg);
            } else {
                window.toast?.show?.(res?.message || 'Failed to create license', 'error');
            }
        } catch (err) {
            console.error('[OrganizationsTab] create license failed', err);
            window.toast?.show?.(err?.message || 'Failed to create license', 'error');
        }
    };

    const handleToggleLicense = async (license) => {
        if (!license?.licenseId) return;
        const action = license.isDisabled ? 'enable' : 'disable';
        if (!confirm(`Are you sure you want to ${action} this license?`)) return;
        try {
            const res = await window.api.put(`/api/v1/licenses/${license.licenseId}/state`, {
                orgId: selectedOrgId,
                active: !!license.isDisabled
            });
            if (res?.success !== false) {
                window.toast?.show?.(`License ${action}d successfully`, 'success');
                await handleSelectOrg(selectedOrg);
            } else {
                window.toast?.show?.(res?.message || `Failed to ${action} license`, 'error');
            }
        } catch (err) {
            console.error('[OrganizationsTab] toggle license failed', err);
            window.toast?.show?.(err?.message || `Failed to ${action} license`, 'error');
        }
    };

    const handleDeleteLicense = async (licenseId) => {
        if (!licenseId) return;
        if (!confirm('Are you sure you want to DELETE this license? This action cannot be undone.')) return;
        try {
            const res = await window.api.delete(`/api/v1/licenses/${licenseId}`);
            if (res?.success !== false) {
                window.toast?.show?.('License deleted successfully', 'success');
                await handleSelectOrg(selectedOrg);
            } else {
                window.toast?.show?.(res?.message || 'Failed to delete license', 'error');
            }
        } catch (err) {
            console.error('[OrganizationsTab] delete license failed', err);
            window.toast?.show?.(err?.message || 'Failed to delete license', 'error');
        }
    };

    return html`
        <div id="organizations">
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
                        ${showCreateForm && html`
                            <div class="card-body">
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

                                    <!-- Report Toggles -->
                                    <div class="col-12">
                                        <div class="card border border-light">
                                            <div class="card-header">
                                                <h5 class="card-title mb-0"><i class="ti ti-mail me-2"></i>Report Configuration</h5>
                                            </div>
                                            <div class="card-body">
                                                <div class="d-flex gap-4 flex-wrap">
                                                    <div class="d-flex flex-column gap-2">
                                                        <label class="form-label mb-0"><strong>Daily Report</strong></label>
                                                        <div class="form-check form-switch">
                                                            <input
                                                                class="form-check-input"
                                                                type="checkbox"
                                                                id="newDailyReportEnabled"
                                                                checked=${newDailyReportEnabled}
                                                                onChange=${(e) => setNewDailyReportEnabled(e.target.checked)}
                                                                style="width: 40px; height: 20px; margin-top: 0px;"
                                                            />
                                                        </div>
                                                        <small class="text-muted">Every day</small>
                                                    </div>
                                                    <div class="d-flex flex-column gap-2">
                                                        <label class="form-label mb-0"><strong>Weekly Brief</strong></label>
                                                        <div class="form-check form-switch">
                                                            <input
                                                                class="form-check-input"
                                                                type="checkbox"
                                                                id="newWeeklyReportEnabled"
                                                                checked=${newWeeklyReportEnabled}
                                                                onChange=${(e) => setNewWeeklyReportEnabled(e.target.checked)}
                                                                style="width: 40px; height: 20px; margin-top: 0px;"
                                                            />
                                                        </div>
                                                        <small class="text-muted">Every Monday</small>
                                                    </div>
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
                                                    <div class="d-flex flex-column gap-2">
                                                        <label class="form-label mb-0"><strong>Demo Org</strong></label>
                                                        <div class="form-check form-switch">
                                                            <input
                                                                class="form-check-input"
                                                                type="checkbox"
                                                                id="newIsDemoOrg"
                                                                checked=${newIsDemoOrg}
                                                                onChange=${(e) => setNewIsDemoOrg(e.target.checked)}
                                                                style="width: 40px; height: 20px; margin-top: 0px;"
                                                            />
                                                        </div>
                                                        <small class="text-muted">$0 revenue</small>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="col-12">
                                        <button 
                                            class="btn btn-primary" 
                                            onClick=${handleCreateOrg}
                                            disabled=${!newOrgName.trim() || newOrgName.trim().length < 4 || !isValidEmail(newOwnerEmail)}
                                        >
                                            <i class="ti ti-plus me-2"></i>
                                            Create Organization
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `}
                    </div>
                </div>

                <div class="col-12">
                    <div class="card" ref=${listContainerRef} style="overflow: auto; max-height: 70vh;">
                        <div class="card-header">
                            <h3 class="card-title">Organizations List</h3>
                        </div>
                        <div class="card-body">
                            <div class="d-flex gap-3 mb-3 flex-wrap">
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
                                            setVisibleCount(30);
                                        }}
                                    />
                                    <label class="btn btn-outline-secondary btn-sm" for="filterAll"><i class="ti ti-list me-1"></i>All</label>
                                    <input 
                                        type="radio" 
                                        class="btn-check" 
                                        id="filterBusiness"
                                        name="orgTypeFilter"
                                        value="Business"
                                        checked=${orgTypeFilter === 'Business'}
                                        onChange=${(e) => {
                                            setOrgTypeFilter(e.target.value);
                                            setVisibleCount(30);
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
                                            setVisibleCount(30);
                                        }}
                                    />
                                    <label class="btn btn-outline-secondary btn-sm" for="filterPersonal"><i class="ti ti-user me-1"></i>Personal</label>
                                </div>
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
                                            setVisibleCount(30);
                                        }}
                                    />
                                </div>
                            </div>

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
                                                        ${isPersonalOrg(org) ? html`
                                                            <span class="badge bg-info-lt" style="padding: 6px 8px; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                                                                <i class="ti ti-user" style="font-size: 16px;"></i>
                                                            </span>
                                                        ` : html`
                                                            <span class="badge bg-primary-lt" style="padding: 6px 8px; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                                                                <i class="ti ti-building" style="font-size: 16px;"></i>
                                                            </span>
                                                        `}
                                                        <div>
                                                            <div class="fw-bold">${org.orgName || org.name}</div>
                                                            <div class="text-muted small">${org.orgId}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>${org.ownerEmail}</td>
                                                <td>
                                                    <div>${org.remainingCredits ?? 0} / ${org.totalCredits ?? 0}</div>
                                                    <div class="progress progress-sm mt-1">
                                                        <div class="progress-bar bg-primary" style="width: ${org.totalCredits ? (org.remainingCredits / org.totalCredits) * 100 : 0}%"></div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span class=${`badge ${org.isDisabled ? 'bg-danger' : 'bg-success'}`}>
                                                        ${org.isDisabled ? 'Disabled' : 'Active'}
                                                    </span>
                                                </td>
                                                <td class="text-muted">
                                                    ${org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '-'}
                                                </td>
                                                <td>
                                                    <button 
                                                        class="btn btn-sm btn-outline-primary"
                                                        onClick=${() => handleSelectOrg(org)}
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
                                <div ref=${sentinelRef} style="height: 10px;"></div>
                            </div>

                            ${visibleCount < filteredOrgs.length && html`
                                <div class="card-footer text-center py-3">
                                    <small class="text-muted">Showing ${visibleCount} of ${filteredOrgs.length} organizations (scroll to load more)</small>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Management Modal -->
            ${selectedOrg && html`
                <div class="modal-root">
                    <div class="modal-backdrop fade show custom-backdrop"></div>
                    <div
                        class="modal modal-blur fade show"
                        style="display: block;"
                        tabindex="-1"
                        onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); }}
                    >
                        <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick=${(e) => e.stopPropagation()}>
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3 class="modal-title">Manage Organization: ${selectedOrg.orgName}</h3>
                                    <button type="button" class="btn-close" onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); }}></button>
                                </div>

                                <div class="modal-body" style="max-height: 80vh; overflow-y: auto;">
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Organization Name</label>
                                            <input 
                                                class="form-control"
                                                value=${updateOrgName} 
                                                onInput=${(e) => setUpdateOrgName(e.target.value)}
                                                minlength="4"
                                            />
                                            <small class="form-text text-muted">Minimum 4 characters required</small>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Owner Email</label>
                                            <div class="input-group">
                                                <input type="email" class="form-control" value=${selectedOrg.ownerEmail} disabled />
                                                <button
                                                    class="btn btn-outline-primary"
                                                    onClick=${() => setShowTransferOwner(true)}
                                                    disabled=${isPersonalOrg(selectedOrg)}
                                                    title=${isPersonalOrg(selectedOrg) ? 'Transfer not available for Personal organizations' : 'Transfer ownership'}
                                                >
                                                    <i class="ti ti-arrows-exchange me-1"></i>
                                                    Transfer
                                                </button>
                                            </div>
                                        </div>

                                        <!-- Save button -->
                                        <div class="col-12">
                                            <button
                                                class="btn btn-primary"
                                                onClick=${handleUpdateOrg}
                                                disabled=${!updateOrgName.trim() || updateOrgName.trim().length < 4}
                                            >
                                                <i class="ti ti-device-floppy me-1"></i>
                                                Save Changes
                                            </button>
                                        </div>

                                        <div class="col-12">
                                            <hr class="my-3" />
                                        </div>

                                        <!-- Report Configuration -->
                                        <div class="col-12">
                                            <div class="card border border-light">
                                                <div class="card-header">
                                                    <h5 class="card-title mb-0"><i class="ti ti-mail me-2"></i>Report Configuration</h5>
                                                </div>
                                                <div class="card-body">
                                                    <div class="d-flex gap-4 flex-wrap">
                                                        <div class="d-flex flex-column gap-2">
                                                            <label class="form-label mb-0"><strong>Daily Report</strong></label>
                                                            <div class="form-check form-switch">
                                                                <input class="form-check-input" type="checkbox" id="updateDailyReportEnabled" checked=${updateDailyReportEnabled} onChange=${(e) => setUpdateDailyReportEnabled(e.target.checked)} style="width: 40px; height: 20px;" />
                                                            </div>
                                                            <small class="text-muted">Every day</small>
                                                        </div>
                                                        <div class="d-flex flex-column gap-2">
                                                            <label class="form-label mb-0"><strong>Weekly Brief</strong></label>
                                                            <div class="form-check form-switch">
                                                                <input class="form-check-input" type="checkbox" id="updateWeeklyReportEnabled" checked=${updateWeeklyReportEnabled} onChange=${(e) => setUpdateWeeklyReportEnabled(e.target.checked)} style="width: 40px; height: 20px;" />
                                                            </div>
                                                            <small class="text-muted">Every Monday</small>
                                                        </div>
                                                        <div class="d-flex flex-column gap-2">
                                                            <label class="form-label mb-0"><strong>Send To All Members</strong></label>
                                                            <div class="form-check form-switch">
                                                                <input class="form-check-input" type="checkbox" id="updateSendToAllMembers" checked=${updateSendToAllMembers} onChange=${(e) => setUpdateSendToAllMembers(e.target.checked)} disabled=${isPersonalOrg(selectedOrg)} style="width: 40px; height: 20px;" />
                                                            </div>
                                                            <small class="text-muted">${isPersonalOrg(selectedOrg) ? 'Business only' : 'Owner + team'}</small>
                                                        </div>
                                                        <div class="d-flex flex-column gap-2">
                                                            <label class="form-label mb-0"><strong>Demo Org</strong></label>
                                                            <div class="form-check form-switch">
                                                                <input class="form-check-input" type="checkbox" id="updateIsDemoOrg" checked=${updateIsDemoOrg} onChange=${(e) => setUpdateIsDemoOrg(e.target.checked)} style="width: 40px; height: 20px;" />
                                                            </div>
                                                            <small class="text-muted">$0 revenue</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- AI Context (B2 / C8) -->
                                        <div class="col-12">
                                            <div class="card border border-light">
                                                <div class="card-header">
                                                    <h5 class="card-title mb-0"><i class="ti ti-brain me-2"></i>AI Context</h5>
                                                </div>
                                                <div class="card-body">
                                                    <div class="row g-3">
                                                        <div class="col-md-6">
                                                            <label class="form-label">Industry</label>
                                                            <input
                                                                type="text"
                                                                class="form-control"
                                                                placeholder="e.g. Healthcare, Finance, Legal"
                                                                value=${updateIndustry}
                                                                onInput=${(e) => setUpdateIndustry(e.target.value)}
                                                            />
                                                            <small class="form-text text-muted">Used by AI to add industry-specific threat context</small>
                                                        </div>
                                                        <div class="col-md-6">
                                                            <label class="form-label">Organisation Size</label>
                                                            <input
                                                                type="text"
                                                                class="form-control"
                                                                placeholder="e.g. 1-10, 11-50, 50-200"
                                                                value=${updateOrgSize}
                                                                onInput=${(e) => setUpdateOrgSize(e.target.value)}
                                                            />
                                                            <small class="form-text text-muted">Used by AI for size-appropriate risk framing</small>
                                                        </div>
                                                        <div class="col-md-6">
                                                            <label class="form-label">Next Audit Date</label>
                                                            <input
                                                                type="date"
                                                                class="form-control"
                                                                value=${updateNextAuditDate}
                                                                onInput=${(e) => setUpdateNextAuditDate(e.target.value)}
                                                            />
                                                            <small class="form-text text-muted">Shown as compliance countdown in weekly email</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Licenses Section -->
                                        <div class="col-12 mt-3">
                                            <div class="d-flex justify-content-between align-items-center mb-3">
                                                <h5 class="m-0">Licenses</h5>
                                                <button class="btn btn-sm btn-primary" onClick=${() => setShowCreateLicense(true)} disabled=${isPersonalOrg(selectedOrg)} title=${isPersonalOrg(selectedOrg) ? 'Personal orgs limited to 1 license' : 'Create license'}>
                                                    <i class="ti ti-plus me-1"></i> Create
                                                </button>
                                            </div>

                                            ${showCreateLicense && html`
                                                <div class="card mb-3 bg-light">
                                                    <div class="card-body">
                                                        <h6 class="card-title">New License</h6>
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
                                                                <button class="btn btn-sm btn-success me-1" onClick=${handleCreateLicense}>Create</button>
                                                                <button class="btn btn-sm btn-ghost-secondary" onClick=${() => setShowCreateLicense(false)}>Cancel</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `}

                                            <div class="table-responsive border rounded" style="font-size: 13px;">
                                                <table class="table table-vcenter card-table table-sm mb-0">
                                                    <thead>
                                                        <tr><th>Type</th><th>Key / Email</th><th>Seats</th><th>Credits</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        ${orgLicenses.length > 0 ? orgLicenses.map(lic => html`
                                                            <tr>
                                                                <td>${lic.licenseType}</td>
                                                                <td><div class="text-truncate" style="max-width: 150px;" title=${lic.serialKey}>${lic.serialKey}</div></td>
                                                                <td>${lic.seats || '-'}</td>
                                                                <td><div class="small">${lic.remainingCredits} / ${lic.totalCredits}</div></td>
                                                                <td><span class=${`badge ${lic.isDisabled ? 'bg-danger' : 'bg-success'}`}>${lic.isDisabled ? 'Disabled' : 'Active'}</span></td>
                                                                <td class="text-muted small">${new Date(lic.createdAt).toLocaleDateString()}</td>
                                                                <td>
                                                                    <div class="btn-list flex-nowrap">
                                                                        <button class="btn btn-sm btn-outline-warning" onClick=${() => handleToggleLicense(lic)}>
                                                                            <i class="ti ti-ban"></i>
                                                                        </button>
                                                                        <button class="btn btn-sm btn-outline-danger" onClick=${() => handleDeleteLicense(lic.licenseId)}>
                                                                            <i class="ti ti-trash"></i>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        `) : html`<tr><td colspan="7" class="text-center py-3 text-muted small">No licenses</td></tr>`}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <!-- Danger Zone -->
                                        <div class="col-12 mt-4">
                                            <div class="card border-danger">
                                                <div class="card-header bg-danger-lt" style="cursor: pointer;" onClick=${() => setShowDangerZone(!showDangerZone)}>
                                                    <div class="d-flex justify-content-between align-items-center">
                                                        <h5 class="card-title mb-0"><i class="ti ti-alert-triangle me-2"></i>Danger Zone</h5>
                                                        <i class=${`ti ${showDangerZone ? 'ti-chevron-down' : 'ti-chevron-right'}`}></i>
                                                    </div>
                                                </div>
                                                ${showDangerZone && html`
                                                    <div class="card-body">
                                                        <p class="text-muted small mb-3">Actions below affect organization availability and data.</p>
                                                        <button class="btn btn-warning me-2" onClick=${handleToggleStatus}>
                                                            <i class="ti ti-ban me-1"></i>${selectedOrg.isDisabled ? 'Enable' : 'Disable'}
                                                        </button>
                                                        <button class="btn btn-danger" onClick=${handleDeleteOrg}>
                                                            <i class="ti ti-trash me-1"></i>Delete
                                                        </button>
                                                    </div>
                                                `}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            <!-- Transfer Ownership Modal -->
            ${showTransferOwner && selectedOrg && html`
                <div class="modal-root">
                    <div class="modal-backdrop fade show custom-backdrop"></div>
                    <div
                        class="modal modal-blur fade show"
                        style="display: block;"
                        tabindex="-1"
                        onClick=${() => setShowTransferOwner(false)}
                    >
                        <div class="modal-dialog modal-md modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3 class="modal-title">Transfer Ownership</h3>
                                    <button type="button" class="btn-close" onClick=${() => setShowTransferOwner(false)}></button>
                                </div>

                                <div class="modal-body">
                                    <p>Transfer ownership of <strong>${selectedOrg.orgName}</strong> from <strong>${selectedOrg.ownerEmail}</strong> to:</p>
                                    <input 
                                        type="email" 
                                        class="form-control" 
                                        placeholder="new-owner@example.com"
                                        value=${newTransferOwner}
                                        onInput=${(e) => setNewTransferOwner(e.target.value)}
                                    />
                                </div>

                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" onClick=${() => setShowTransferOwner(false)}>Cancel</button>
                                    <button 
                                        type="button" 
                                        class="btn btn-primary"
                                        onClick=${handleTransferOwnership}
                                        disabled=${!isValidEmail(newTransferOwner)}
                                    >
                                        Transfer Ownership
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
