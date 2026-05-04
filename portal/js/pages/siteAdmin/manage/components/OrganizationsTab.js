/**
 * Site Admin - Organizations Tab Component
 * Full-featured organization management: create, filter, paginate, manage, transfer ownership
 * 
 * FILE STRUCTURE (for code navigation):
 *   Lines 1-100:    JSDoc + imports + helper functions (normalizeIndustry, resolveLicenseCatalog, etc.)
 *   Lines 100-400:  Main component function declaration + 50+ useState hooks
 *   Lines 400-950:  Event handlers (handleSelectOrg, handleCreateOrg, handleScheduleMigration, etc.)
 *   Lines 950-3000: Main return statement with HTML structure:
 *     - SECTION 1 (Lines 990-1315):  Create Organization Card (collapsible form)
 *     - SECTION 2 (Lines 1320-1510): Organization List Card (search, filter, pagination, table)
 *     - SECTION 3 (Lines 1515-2115): Manage Organization Modal (tabbed: Details|Licenses|Storage|Danger)
 *     - SECTION 4 (Lines 2120-2260): Confirmation Modals (Transfer, Disable, Delete)
 * 
 * STATE MANAGEMENT (~50 hooks total):
 *   Create Form: newOrgName, newOwnerEmail, newOrgType, newOrgIndustry, newOrgSize, newOrgRegion, etc.
 *   Org List: showCreateForm, showOrgList, orgSearch, pageSize, filteredOrgs, selectedOrgId, etc.
 *   Manage Form: selectedOrg, updateOrgName, updateOrgType, activeManageTab, etc.
 *   Licenses: activeLicenses, orgPayments, createLicenseFormVisible, etc.
 *   Storage: orgMigrations, migrationTargetAccount, migrationTargetRegion, activeManageTab, etc.
 *   Modals: showTransferOwner, showDisableConfirm, showDeleteConfirm, etc.
 * 
 * EVENT HANDLERS (partial list — see lines 400-950):
 *   handleCreateOrg, handleSelectOrg, handleUpdateOrg, handleTransferOwnership
 *   handleScheduleMigration, loadMigrationJobs
 *   handleCreateLicense, handleToggleLicense, handleDeleteLicense
 *   handleApprovePayment, handleCompletePayment
 *   handleDisableOrg, handleDeleteOrg
 * 
 * API INTEGRATION:
 *   GET  /api/v1/admin/orgs                          -> list all organizations
 *   GET  /api/v1/admin/orgs/{orgId}                  -> fetch single org details
 *   POST /api/v1/admin/orgs                          -> create new organization
 *   PUT  /api/v1/admin/orgs/{orgId}                  -> update org details
 *   POST /api/v1/admin/orgs/{orgId}/transfer         -> transfer ownership
 *   POST /api/v1/admin/orgs/{orgId}/disable          -> disable organization
 *   POST /api/v1/admin/orgs/{orgId}/delete           -> delete organization
 *   GET  /api/v1/admin/orgs/{orgId}/storage/migrations    -> list migration jobs
 *   POST /api/v1/admin/orgs/{orgId}/storage/migrate       -> schedule new migration
 *   (+ License, Payment, Reports APIs called via handleCreateLicense, etc.)
 * 
 * FUTURE REFACTORING OPPORTUNITY:
 *   This 2200+ line file could be split into:
 *   - CreateOrganizationsTab.js     (SECTION 1 + helpers)
 *   - ManageOrganizationsTab.js     (SECTION 2-4 + manage event handlers)
 *   - orgSharedHelpers.js           (licenseHelpers, industryTaxonomy, etc.)
 *   Currently kept as monolith (browser env doesn't support ES6 imports without bundler).
 *   Organized with section markers for readability.
 */

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

// Canonical industry taxonomy — fallback used if catalog API hasn't loaded yet.
// Source of truth is org-license-catalog.json (Cloud/Configs); served via /api/v1/admin/orgs/license-catalog.
// To add a new industry: update org-license-catalog.json "industries" array and add fuzzy-match rules
// to IndustryTaxonomy.cs (Cloud).
const FALLBACK_INDUSTRIES = [
    'Consulting',
    'Education',
    'Finance',
    'Government',
    'Healthcare',
    'Legal',
    'Manufacturing',
    'Media & Entertainment',
    'Non-Profit',
    'Non-Government',
    'Others',
    'Professional Services',
    'Retail',
    'Technology',
];

// Returns the canonical industry value if it matches the provided list, else '' (unset)
const normalizeIndustry = (raw, industries = FALLBACK_INDUSTRIES) => (raw && industries.includes(raw)) ? raw : '';

const FALLBACK_DURATION_OPTIONS = [
    { label: '1 year (365 days)', value: 365 }
];

const REGION_OPTIONS = [
    { value: 'US', label: 'US (United States)' },
    { value: 'EU', label: 'EU (Europe)' },
    { value: 'AU', label: 'AU (Australia)' },
    { value: 'IN', label: 'IN (India)' }
];

function resolveLicenseCatalog(catalog) {
    const c = (catalog && typeof catalog === 'object') ? catalog : {};

    return {
        orgTypes: Array.isArray(c.orgTypes) && c.orgTypes.length ? c.orgTypes : [],
        tiersByOrgType: c.tiersByOrgType && typeof c.tiersByOrgType === 'object' ? c.tiersByOrgType : {},
        demoTier: c.demoTier && typeof c.demoTier === 'object' ? c.demoTier : null,
        addOns: Array.isArray(c.addOns) && c.addOns.length ? c.addOns : [],
        packages: Array.isArray(c.packages) && c.packages.length ? c.packages : [],
        sizeRecommendation: c.sizeRecommendation && typeof c.sizeRecommendation === 'object' ? c.sizeRecommendation : null,
        licenseDuration: Array.isArray(c.licenseDuration) && c.licenseDuration.length ? c.licenseDuration : FALLBACK_DURATION_OPTIONS,
        industries: Array.isArray(c.industries) && c.industries.length ? c.industries : FALLBACK_INDUSTRIES
    };
}

/** Returns the `includedAddOns` array for a given package key (empty array if not found). */
function getAddOnsForPackage(packageKey, catalog) {
    if (!packageKey || !Array.isArray(catalog.packages)) return [];
    const pkg = catalog.packages.find(p => p.key === packageKey);
    return Array.isArray(pkg?.includedAddOns) ? pkg.includedAddOns : [];
}

/** Returns a size-tier warning message if seats exceeds recommendation, or null. */
function getSizeTierWarning(seats, catalog) {
    const rec = catalog.sizeRecommendation;
    if (!rec) return null;
    const n = parseInt(seats, 10) || 0;
    if (n > (rec.hardMaxDevices || 100)) {
        return rec.overMaxMessage || `Organizations over ${rec.hardMaxDevices} devices require an enterprise plan.`;
    }
    const tiers = Array.isArray(rec.tiers) ? rec.tiers : [];
    for (const tier of tiers) {
        if (n >= (tier.minDevices || 0) && n <= (tier.maxDevices || Infinity)) {
            return tier.showWarning ? tier.warningMessage || null : null;
        }
    }
    return null;
}

function isDemoAllowedForOrgType(orgType, catalog) {
    const enabled = catalog.demoTier?.enabledForOrgTypes;
    return Array.isArray(enabled) && enabled.includes(orgType);
}

function getTierOptionsForOrgType(orgType, catalog) {
    const tierCatalog = catalog.tiersByOrgType || {};
    const fallback = tierCatalog.Business || [];
    const baseOptions = Array.isArray(tierCatalog[orgType]) && tierCatalog[orgType].length ? tierCatalog[orgType] : fallback;

    if (!isDemoAllowedForOrgType(orgType, catalog)) {
        return [...baseOptions];
    }

    const demoTier = catalog.demoTier || {};
    return [...baseOptions, {
        label: demoTier.label || 'Demo',
        value: demoTier.value || 'Demo',
        defaultSeats: Number.isFinite(demoTier.defaultSeats) ? demoTier.defaultSeats : 10
    }];
}

function getLicenseTierConfig(orgType, tier, catalog) {
    const options = getTierOptionsForOrgType(orgType, catalog);
    return options.find((opt) => opt.value === tier) || options[0] || { defaultSeats: 20 };
}

function normalizeCustomAddOns(addOns = [], isDemo = false, catalog = {}) {
    const addOnCatalog = Array.isArray(catalog.addOns) ? catalog.addOns : [];
    if (isDemo) {
        return addOnCatalog
            .filter((x) => x.includedByDefaultForDemo !== false)
            .map((x) => x.key);
    }

    const normalized = new Set(Array.isArray(addOns) ? addOns : []);
    addOnCatalog
        .filter((x) => x.requiredForAll)
        .forEach((x) => normalized.add(x.key));
    return Array.from(normalized);
}

function buildLicensePayload({ orgType, tier, seats, duration, addOns, packageKey, catalog }) {
    const config = getLicenseTierConfig(orgType, tier, catalog);
    const demoTierValue = catalog.demoTier?.value || 'Demo';
    const isCustom = tier === 'Custom';
    const isDemo = tier === demoTierValue && isDemoAllowedForOrgType(orgType, catalog);
    const effectiveSeats = isCustom ? (parseInt(seats, 10) || config.defaultSeats) : config.defaultSeats;
    const effectiveDuration = parseInt(duration, 10) || 365;
    const licenseType = isDemo ? 'Demo' : orgType;
    const demoDefaultSeats = Number.isFinite(catalog.demoTier?.defaultSeats) ? catalog.demoTier.defaultSeats : 10;
    const demoAllowCustomSeats = !!catalog.demoTier?.allowCustomSeats;

    return {
        licenseType,
        licenseTier: tier,
        package: packageKey || null,
        seats: isDemo ? (demoAllowCustomSeats ? Math.max(1, parseInt(seats, 10) || demoDefaultSeats) : demoDefaultSeats) : effectiveSeats,
        durationDays: effectiveDuration,
        addOns: normalizeCustomAddOns(addOns, isDemo, catalog),
        isCustom,
        isDemo
    };
}

function normalizeDiscountValue(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function calculateInvoicePreview({ orgType, tier, seats, duration, discountType, discountValue, catalog }) {
    const config = getLicenseTierConfig(orgType, tier, catalog) || {};
    const demoTierValue = catalog.demoTier?.value || 'Demo';
    const isDemo = tier === demoTierValue && isDemoAllowedForOrgType(orgType, catalog);
    const bundlePricing = config.bundlePricing || null;
    const effectiveSeats = Math.max(1, parseInt(seats, 10) || config.defaultSeats || 1);
    const effectiveDuration = Math.max(1, parseInt(duration, 10) || 365);
    const currency = bundlePricing?.currency || 'USD';

    let baseAmount = 0;
    let pricingMode = 'fallback:seatsxdays';
    const durationFactor = effectiveDuration / 365;
    if (isDemo) {
        baseAmount = 0;
        pricingMode = 'demo';
    } else if (bundlePricing?.mode === 'perSeat') {
        baseAmount = Math.max(0, (Number(bundlePricing.amount) || 0) * effectiveSeats * durationFactor);
        pricingMode = 'perSeat';
    } else if (bundlePricing?.mode === 'flat') {
        baseAmount = Math.max(0, (Number(bundlePricing.amount) || 0) * durationFactor);
        pricingMode = 'flat';
    } else {
        baseAmount = Math.max(0, effectiveSeats * effectiveDuration);
    }

    const explicitType = (discountType || 'none').toLowerCase();
    const explicitValue = normalizeDiscountValue(discountValue);
    const tierDefault = config.defaultInvoiceDiscount || null;

    let appliedType = 'none';
    let appliedValue = 0;
    if (explicitType !== 'none' && explicitValue > 0) {
        appliedType = explicitType;
        appliedValue = explicitValue;
    } else if (tierDefault && typeof tierDefault === 'object') {
        const mode = String(tierDefault.mode || '').toLowerCase();
        const val = normalizeDiscountValue(tierDefault.value);
        if ((mode === 'percent' || mode === 'fixed' || mode === 'targetfinal') && val > 0) {
            appliedType = mode;
            appliedValue = val;
        }
    }

    let discountAmount = 0;
    if (appliedType === 'percent') {
        const capped = Math.min(100, Math.max(0, appliedValue));
        discountAmount = (baseAmount * capped) / 100;
        appliedValue = capped;
    } else if (appliedType === 'fixed') {
        discountAmount = appliedValue;
    } else if (appliedType === 'targetfinal') {
        discountAmount = Math.max(0, baseAmount - appliedValue);
    }

    discountAmount = Math.min(baseAmount, Math.max(0, Number(discountAmount) || 0));
    const finalAmount = Math.max(0, baseAmount - discountAmount);

    return {
        currency,
        baseAmount,
        discountAmount,
        finalAmount,
        discountType: appliedType,
        discountValue: appliedValue,
        pricingMode,
        effectiveSeats,
        effectiveDuration
    };
}

export function OrganizationsTab({ 
    orgs = [], 
    accounts = [],
    licenseCatalog = null,
    refreshKey = 0,
    onListOrgs,
    onCreateOrg,
    onUpdateOrg,
    onToggleOrgStatus,
    onDeleteOrg,
    onTransferOwnership
}) {
    const licenseUxCatalog = resolveLicenseCatalog(licenseCatalog);
    const orgTypeOptions = licenseUxCatalog.orgTypes || [];
    const addOnCatalog = licenseUxCatalog.addOns || [];
    const packageCatalog = licenseUxCatalog.packages || [];
    const durationOptions = licenseUxCatalog.licenseDuration || FALLBACK_DURATION_OPTIONS;
    const demoTierValue = licenseUxCatalog.demoTier?.value || 'Demo';
    const industryOptions = licenseUxCatalog.industries || FALLBACK_INDUSTRIES;

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showOrgList, setShowOrgList] = useState(false);
    const [visibleCount, setVisibleCount] = useState(30);
    const loadMoreStep = 20;
    const [orgSearch, setOrgSearch] = useState('');
    const [debouncedOrgSearch, setDebouncedOrgSearch] = useState('');
    const [orgIdsFilter, setOrgIdsFilter] = useState('');
    const [orgTypeFilter, setOrgTypeFilter] = useState('Business');
    const [orgListLoading, setOrgListLoading] = useState(false);
    const [orgListError, setOrgListError] = useState('');
    const [serverOrgs, setServerOrgs] = useState([]);
    const [serverPage, setServerPage] = useState(1);
    const [serverHasMore, setServerHasMore] = useState(false);
    const [serverTotalCount, setServerTotalCount] = useState(0);
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [showTransferOwner, setShowTransferOwner] = useState(false);
    const [newTransferOwner, setNewTransferOwner] = useState('');
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [showDisableConfirm, setShowDisableConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [orgActionInProgress, setOrgActionInProgress] = useState(false);

    // Form state for creating new org
    const [newOrgName, setNewOrgName] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [newOrgSeats, setNewOrgSeats] = useState(20);
    const [newOrgDuration, setNewOrgDuration] = useState(365);
    const [newOrgType, setNewOrgType] = useState('Business');
    const [newOrgLicenseTier, setNewOrgLicenseTier] = useState('Startup');
    const [newOrgLicenseAddOns, setNewOrgLicenseAddOns] = useState(['Security']);
    const [newOrgPackage, setNewOrgPackage] = useState('');
    const [newOrgDiscountType, setNewOrgDiscountType] = useState('none');
    const [newOrgDiscountValue, setNewOrgDiscountValue] = useState(0);
    const [newIndustry, setNewIndustry] = useState('');
    const [newOrgSize, setNewOrgSize] = useState('');
    const [newNextAuditDate, setNewNextAuditDate] = useState('');
    const [newOrgRegion, setNewOrgRegion] = useState('US');
    const [newOrgStorageAccount, setNewOrgStorageAccount] = useState('');
    const [newOrgStorageMode, setNewOrgStorageMode] = useState('shared');
    const [createStorageCatalog, setCreateStorageCatalog] = useState(null);
    const [createStorageCatalogLoading, setCreateStorageCatalogLoading] = useState(false);
    const [orgOwnerSearch, setOrgOwnerSearch] = useState('');
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

    // Form state for updating org
    const [updateOrgName, setUpdateOrgName] = useState('');
    const [updateOrgType, setUpdateOrgType] = useState('Business');

    // Report configuration state (daily + weekly only)
    const [newDailyReportEnabled, setNewDailyReportEnabled] = useState(true);
    const [newWeeklyReportEnabled, setNewWeeklyReportEnabled] = useState(false);
    const [newSendToAllMembers, setNewSendToAllMembers] = useState(false);

    const [updateDailyReportEnabled, setUpdateDailyReportEnabled] = useState(true);
    const [updateWeeklyReportEnabled, setUpdateWeeklyReportEnabled] = useState(false);
    const [updateSendToAllMembers, setUpdateSendToAllMembers] = useState(false);

    // AI context fields
    const [updateIndustry, setUpdateIndustry] = useState('');
    const [updateOrgSize, setUpdateOrgSize] = useState('');
    const [updateNextAuditDate, setUpdateNextAuditDate] = useState('');
    const [updateOrgRegion, setUpdateOrgRegion] = useState('US');
    const [updateTodaySnapshotRefreshHoursOverride, setUpdateTodaySnapshotRefreshHoursOverride] = useState('');

    // Manage modal tab state
    const [activeManageTab, setActiveManageTab] = useState('details');

    // Storage migration state
    const [migrationTargetAccount, setMigrationTargetAccount] = useState('');
    const [migrationTargetRegion, setMigrationTargetRegion] = useState('');
    const [migrationJobs, setMigrationJobs] = useState([]);
    const [migrationLoading, setMigrationLoading] = useState(false);

    // Storage catalog state (from /storage/options endpoint)
    const [storageCatalog, setStorageCatalog] = useState(null);
    const [storageCatalogLoading, setStorageCatalogLoading] = useState(false);
    const [migrationCreateDedicated, setMigrationCreateDedicated] = useState(false);
    const [migrationSelectedRegion, setMigrationSelectedRegion] = useState('');

    // License state
    const [orgLicenses, setOrgLicenses] = useState([]);
    const [showCreateLicense, setShowCreateLicense] = useState(false);
    const [newLicenseSeats, setNewLicenseSeats] = useState(20);
    const [newLicenseDuration, setNewLicenseDuration] = useState(365);
    const [newLicenseTier, setNewLicenseTier] = useState('Startup');
    const [newLicenseAddOns, setNewLicenseAddOns] = useState(['Security']);
    const [newLicensePackage, setNewLicensePackage] = useState('');
    const [newLicenseDiscountType, setNewLicenseDiscountType] = useState('none');
    const [newLicenseDiscountValue, setNewLicenseDiscountValue] = useState(0);
    const [orgPayments, setOrgPayments] = useState([]);

    const createOrgInvoicePreview = calculateInvoicePreview({
        orgType: newOrgType,
        tier: newOrgLicenseTier,
        seats: newOrgSeats,
        duration: newOrgDuration,
        discountType: newOrgDiscountType,
        discountValue: newOrgDiscountValue,
        catalog: licenseUxCatalog
    });

    const createLicenseInvoicePreview = calculateInvoicePreview({
        orgType: updateOrgType || getOrgType(selectedOrg || {}),
        tier: newLicenseTier,
        seats: newLicenseSeats,
        duration: newLicenseDuration,
        discountType: newLicenseDiscountType,
        discountValue: newLicenseDiscountValue,
        catalog: licenseUxCatalog
    });

    // Email validation
    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Resolve org type from multiple possible fields
    const getOrgType = (org) => {
        if (org.orgType) return org.orgType;
        if (org.type && ['Personal', 'Education', 'Business'].includes(org.type)) return org.type;
        if (org.isPersonal !== undefined) return org.isPersonal ? 'Personal' : 'Business';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(org.orgId) ? 'Personal' : 'Business';
    };

    // Determine if org is personal (based on orgType or legacy isPersonal flag)
    const isPersonalOrg = (org) => getOrgType(org) === 'Personal';

    // Org type badge config
    const getOrgTypeBadge = (org) => {
        const type = getOrgType(org);
        if (type === 'Personal') return { bgClass: 'bg-info-lt text-info', icon: 'ti-user', label: 'Personal' };
        if (type === 'Education') return { bgClass: 'bg-success-lt text-success', icon: 'ti-school', label: 'Education' };
        return { bgClass: 'bg-primary-lt text-primary', icon: 'ti-building', label: 'Business' };
    };

    const getMagiCodeForOrg = (org) => {
        if (!isPersonalOrg(org)) return null;
        const ownerEmail = (org.ownerEmail || '').toLowerCase();
        if (!ownerEmail) return null;
        const account = (accounts || []).find(a => (a.email || '').toLowerCase() === ownerEmail);
        return account?.magiCodeUsed || account?.MagiCodeUsed || null;
    };

    const getOrgName = (org) => org?.orgName || org?.name || org?.OrgName || org?.OrgId || org?.orgId || '-';
    const getOwnerEmail = (org) => org?.ownerEmail || org?.OwnerEmail || '-';
    const getOrgId = (org) => org?.orgId || org?.OrgId || '-';
    const getCreatedAt = (org) => org?.createdAt || org?.CreatedAt || null;
    const isOrgDisabled = (org) => {
        if (typeof org?.isDisabled === 'boolean') return org.isDisabled;
        if (typeof org?.IsDisabled === 'boolean') return org.IsDisabled;
        if (typeof org?.isEnabled === 'boolean') return !org.isEnabled;
        if (typeof org?.IsEnabled === 'boolean') return !org.IsEnabled;
        return false;
    };
    const getCreditSnapshot = (org) => {
        const remaining = Number(org?.remainingCredits ?? org?.RemainingCredits ?? 0);
        const total = Number(org?.totalCredits ?? org?.TotalCredits ?? 0);
        const hasSnapshot = total > 0 || remaining > 0;
        const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
        return { remaining, total, hasSnapshot, pct };
    };

    const isServerListMode = typeof onListOrgs === 'function';

    const parseOrgIdsFilter = () => orgIdsFilter
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

    const fetchOrgPage = async (page, append = false) => {
        if (!isServerListMode) return;

        setOrgListLoading(true);
        setOrgListError('');
        try {
            const orgIds = parseOrgIdsFilter();
            const response = await onListOrgs({
                orgType: orgTypeFilter,
                search: debouncedOrgSearch,
                orgIds,
                page,
                pageSize: 50,
                includeDisabled: true,
                sortBy: 'CreatedAt',
                sortOrder: 'desc'
            });

            if (!response?.success) {
                const message = response?.message || 'Failed to load organizations';
                setOrgListError(message);
                return;
            }

            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            setServerOrgs((prev) => append ? [...prev, ...items] : items);
            setServerPage(page);
            setServerHasMore(!!response.data?.hasMore);
            setServerTotalCount(Number(response.data?.totalCount || items.length));
        } catch (err) {
            console.error('[OrganizationsTab] Failed to query organizations', err);
            setOrgListError(err?.message || 'Failed to load organizations');
        } finally {
            setOrgListLoading(false);
        }
    };

    // Filter organizations
    const sourceOrgs = isServerListMode ? serverOrgs : orgs;

    const filteredOrgs = sourceOrgs.filter(org => {
        if (isServerListMode) {
            // Server already applies orgType/search/orgIds filtering in this mode.
            return true;
        }

        const matchesSearch = !orgSearch || 
            (org.orgName || org.name || '').toLowerCase().includes(orgSearch.toLowerCase()) ||
            (org.orgId || '').toLowerCase().includes(orgSearch.toLowerCase()) ||
            (org.ownerEmail || '').toLowerCase().includes(orgSearch.toLowerCase());
        
        const orgType = getOrgType(org);
        const matchesType = orgTypeFilter === 'All' || orgTypeFilter === orgType;
        return matchesSearch && matchesType;
    });

    const currentOrgs = isServerListMode ? filteredOrgs : filteredOrgs.slice(0, visibleCount);

    const listContainerRef = useRef(null);
    const sentinelRef = useRef(null);

    // Reset visible count when filters change (local mode only)
    useEffect(() => {
        if (!isServerListMode) {
            setVisibleCount(30);
        }
    }, [orgSearch, orgTypeFilter, orgs, isServerListMode]);

    useEffect(() => {
        if (!showCreateForm) return;
        loadCreateStorageCatalog(newOrgType, newOrgRegion);
    }, [showCreateForm, newOrgType, newOrgRegion]);

    // Debounce search input for server list mode to avoid one API call per keystroke.
    useEffect(() => {
        if (!isServerListMode) {
            setDebouncedOrgSearch(orgSearch);
            return;
        }

        const handle = setTimeout(() => {
            setDebouncedOrgSearch(orgSearch);
        }, 250);

        return () => clearTimeout(handle);
    }, [orgSearch, isServerListMode]);

    // Server query load on filter changes or external refresh.
    useEffect(() => {
        if (!isServerListMode || !showOrgList) return;
        fetchOrgPage(1, false);
    }, [isServerListMode, showOrgList, orgTypeFilter, orgIdsFilter, debouncedOrgSearch, refreshKey]);

    // Infinite scroll via intersection observer
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const shouldLoad = isServerListMode
                    ? serverHasMore
                    : (visibleCount < filteredOrgs.length);

                if (entry.isIntersecting && shouldLoad) {
                    if (isServerListMode) {
                        if (!orgListLoading && serverHasMore) {
                            fetchOrgPage(serverPage + 1, true);
                        }
                    } else {
                        setVisibleCount(prev => Math.min(prev + loadMoreStep, filteredOrgs.length));
                    }
                }
            });
        }, {
            root: listContainerRef.current,
            rootMargin: '200px',
            threshold: 0.1
        });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [filteredOrgs.length, visibleCount, isServerListMode, orgListLoading, serverHasMore, serverPage]);

    const handleSelectOrg = async (org) => {
        setSelectedOrg(org);
        setSelectedOrgId(org.orgId);
        setUpdateOrgName(org.orgName || org.name || '');
        setUpdateOrgType(getOrgType(org));
        setNewTransferOwner(org.ownerEmail);
        setUpdateIndustry(normalizeIndustry(org.industry, industryOptions));
        setUpdateOrgSize(org.orgSize || '');
        setUpdateNextAuditDate(org.nextAuditDate || '');
            setUpdateOrgRegion(org.orgRegion || 'US');
        setUpdateTodaySnapshotRefreshHoursOverride(
            org.todaySnapshotRefreshHoursOverride ?? org.TodaySnapshotRefreshHoursOverride ?? ''
        );
        const orgType = getOrgType(org);
        const defaultTier = getTierOptionsForOrgType(orgType, licenseUxCatalog)[0]?.value || 'Startup';
        setNewLicenseTier(defaultTier);
        setNewLicenseSeats(getLicenseTierConfig(orgType, defaultTier, licenseUxCatalog)?.defaultSeats ?? 20);
        setShowDangerZone(false);
        setActiveManageTab('details');
        setMigrationTargetAccount('');
        setMigrationTargetRegion(org.orgRegion || 'US');
        setMigrationJobs([]);
        setStorageCatalog(null);
        setMigrationCreateDedicated(false);
        setMigrationSelectedRegion(org.orgRegion || 'US');

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
            const licRes = await window.api.get(`/api/v1/licenses/action?operation=list&orgId=${encodeURIComponent(org.orgId)}`);
            if (licRes?.success !== false) {
                const licenses = licRes.data || licRes?.Data || [];
                setOrgLicenses(Array.isArray(licenses) ? licenses : []);
            }
        } catch (err) {
            console.error('[OrganizationsTab] Failed to load licenses', err);
            setOrgLicenses([]);
        }

        try {
            const paymentsRes = await window.api.get(`/api/v1/orgs/${org.orgId}/payments`);
            if (paymentsRes?.success !== false) {
                const payments = paymentsRes.data || [];
                setOrgPayments(Array.isArray(payments) ? payments : []);
            }
        } catch (err) {
            console.error('[OrganizationsTab] Failed to load payments', err);
            window.toast?.show?.(err?.message || 'Failed to load payment requests', 'warning');
            setOrgPayments([]);
        }
    };

    const loadMigrationJobs = async (orgId) => {
        if (!orgId) return;
        try {
            const res = await window.api.get(`/api/v1/admin/orgs/${encodeURIComponent(orgId)}/storage/migrations`);
            if (res?.success !== false) {
                const rows = Array.isArray(res.data)
                    ? res.data
                    : (Array.isArray(res?.data?.migrations) ? res.data.migrations : []);
                setMigrationJobs(rows);
            }
        } catch (err) {
            console.warn('[OrganizationsTab] Failed to load migration jobs', err);
        }
    };

    const loadCreateStorageCatalog = async (orgType, region) => {
        setCreateStorageCatalogLoading(true);
        try {
            const query = new URLSearchParams({
                orgType: orgType || 'Business',
                region: region || 'US'
            });
            const res = await window.api.get(`/api/v1/admin/orgs/storage/options?${query.toString()}`);
            if (res?.success !== false && res?.data) {
                setCreateStorageCatalog(res.data);
                const selectedRegion = (res.data.regions || []).find((x) => x.regionCode === (region || 'US'));
                setNewOrgStorageAccount(selectedRegion?.sharedAccountName || '');
            }
        } catch (err) {
            console.warn('[OrganizationsTab] Failed to load create storage options', err);
            setCreateStorageCatalog(null);
            setNewOrgStorageAccount('');
        } finally {
            setCreateStorageCatalogLoading(false);
        }
    };

    const loadStorageCatalog = async (orgId) => {
        if (!orgId) return;
        setStorageCatalogLoading(true);
        try {
            const res = await window.api.get(`/api/v1/admin/orgs/${encodeURIComponent(orgId)}/storage/options`);
            if (res?.success !== false && res?.data) {
                setStorageCatalog(res.data);
                setMigrationSelectedRegion(res.data.currentRegion || 'US');
            }
        } catch (err) {
            console.warn('[OrganizationsTab] Failed to load storage catalog', err);
        } finally {
            setStorageCatalogLoading(false);
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
        if (newOrgStorageMode === 'shared' && !newOrgStorageAccount) {
            window.toast?.show?.('Select a shared storage account or switch to dedicated provisioning', 'warning');
            return;
        }

        const licensePayload = buildLicensePayload({
            orgType: newOrgType,
            tier: newOrgLicenseTier,
            seats: newOrgSeats,
            duration: newOrgDuration,
            addOns: newOrgLicenseAddOns,
            packageKey: newOrgPackage,
            catalog: licenseUxCatalog
        });

        const result = await onCreateOrg?.({
            orgName: newOrgName,
            ownerEmail: newOwnerEmail,
            seats: licensePayload.seats,
            duration: licensePayload.durationDays,
            orgType: newOrgType,
            licenseType: licensePayload.licenseType,
            licenseTier: licensePayload.licenseTier,
            licenseAddOns: licensePayload.addOns,
            licensePackage: licensePayload.package,
            dailyReportEnabled: newDailyReportEnabled,
            weeklyReportEnabled: newWeeklyReportEnabled,
            sendToAllTeamMembers: newSendToAllMembers,
            isDemoOrg: licensePayload.isDemo,
            discountType: newOrgDiscountType === 'none' ? null : newOrgDiscountType,
            discountValue: newOrgDiscountType === 'none' ? null : (parseFloat(newOrgDiscountValue) || 0),
            industry: newIndustry || null,
            orgSize: newOrgSize || null,
            nextAuditDate: newNextAuditDate || null,
            orgRegion: newOrgRegion,
            storageAccountName: newOrgStorageMode === 'shared' ? (newOrgStorageAccount || null) : null,
            createDedicatedStorageAccount: newOrgStorageMode === 'dedicated',
        });

        if (result?.success) {
            setNewOrgName('');
            setNewOwnerEmail('');
            setNewOrgSeats(20);
            setNewOrgDuration(365);
            setNewOrgType('Business');
            setNewOrgLicenseTier('Startup');
            setNewOrgLicenseAddOns(['Security']);
            setNewOrgPackage('');
            setNewOrgDiscountType('none');
            setNewOrgDiscountValue(0);
            setNewIndustry('');
            setNewOrgSize('');
            setNewNextAuditDate('');
            setNewOrgRegion('US');
            setNewOrgStorageAccount('');
            setNewOrgStorageMode('shared');
            setCreateStorageCatalog(null);
            setShowCreateForm(false);
        }
    };

    useEffect(() => {
        if (newOrgLicenseTier === 'Custom') return;
        const config = getLicenseTierConfig(newOrgType, newOrgLicenseTier, licenseUxCatalog);
        setNewOrgSeats(config.defaultSeats);
        if (newOrgLicenseTier === (licenseUxCatalog.demoTier?.value || 'Demo')) {
            setNewOrgLicenseAddOns(normalizeCustomAddOns([], true, licenseUxCatalog));
        }
    }, [newOrgLicenseTier, newOrgType, licenseCatalog]);

    useEffect(() => {
        if (newLicenseTier === 'Custom') return;
        const orgType = updateOrgType || getOrgType(selectedOrg || {});
        const config = getLicenseTierConfig(orgType || 'Business', newLicenseTier, licenseUxCatalog);
        setNewLicenseSeats(config.defaultSeats);
        if (newLicenseTier === (licenseUxCatalog.demoTier?.value || 'Demo')) {
            setNewLicenseAddOns(normalizeCustomAddOns([], true, licenseUxCatalog));
        }
    }, [newLicenseTier, updateOrgType, selectedOrg, licenseCatalog]);

    // When package changes, auto-fill included add-ons for create-org form
    useEffect(() => {
        if (!newOrgPackage) return;
        const pkgAddOns = getAddOnsForPackage(newOrgPackage, licenseUxCatalog);
        if (pkgAddOns.length) setNewOrgLicenseAddOns(pkgAddOns);
    }, [newOrgPackage, licenseCatalog]);

    // When package changes, auto-fill included add-ons for create-license form
    useEffect(() => {
        if (!newLicensePackage) return;
        const pkgAddOns = getAddOnsForPackage(newLicensePackage, licenseUxCatalog);
        if (pkgAddOns.length) setNewLicenseAddOns(pkgAddOns);
    }, [newLicensePackage, licenseCatalog]);

    useEffect(() => {
        const defaultTier = getTierOptionsForOrgType(newOrgType, licenseUxCatalog)[0]?.value || 'Startup';
        setNewOrgLicenseTier(defaultTier);
    }, [newOrgType, licenseCatalog]);

    const handleUpdateOrg = async () => {
        if (!updateOrgName.trim() || updateOrgName.trim().length < 4) {
            window.toast?.show?.('Organization name must be at least 4 characters', 'warning');
            return;
        }

        const result = await onUpdateOrg?.({
            orgId: selectedOrgId,
            orgName: updateOrgName,
            orgType: updateOrgType,
            dailyReportEnabled: updateDailyReportEnabled,
            weeklyReportEnabled: updateWeeklyReportEnabled,
            sendToAllTeamMembers: updateSendToAllMembers,
            industry: updateIndustry || null,
            orgSize: updateOrgSize || null,
            nextAuditDate: updateNextAuditDate || null,
            todaySnapshotRefreshHoursOverride: updateTodaySnapshotRefreshHoursOverride === ''
                ? 0
                : Math.max(1, Math.min(24, parseInt(updateTodaySnapshotRefreshHoursOverride, 10) || 0))
        });

        if (result?.success) {
            setSelectedOrg(null);
            setSelectedOrgId('');
        }
    };

    const handleToggleStatus = async () => {
        if (!selectedOrgId) return;
        
        const action = selectedOrg.isDisabled ? 'enable' : 'disable';
        if (action === 'disable') {
            setShowDisableConfirm(true);
            return;
        }

        const result = await onToggleOrgStatus?.(selectedOrgId, action);

        if (result?.success) {
            setSelectedOrg({ ...selectedOrg, isDisabled: !selectedOrg.isDisabled });
        }
    };

    const handleDeleteOrg = async () => {
        if (!selectedOrgId) return;
        setShowDeleteConfirm(true);
    };

    const confirmDisableOrg = async () => {
        if (!selectedOrgId) return;

        setOrgActionInProgress(true);
        try {
            const result = await onToggleOrgStatus?.(selectedOrgId, 'disable');
            if (result?.success) {
                setSelectedOrg({ ...selectedOrg, isDisabled: true });
                setShowDisableConfirm(false);
            }
        } finally {
            setOrgActionInProgress(false);
        }
    };

    const confirmDeleteOrg = async () => {
        if (!selectedOrgId) return;

        setOrgActionInProgress(true);
        try {
            const result = await onDeleteOrg?.(selectedOrgId);
            if (result?.success) {
                setSelectedOrg(null);
                setSelectedOrgId('');
                setShowDeleteConfirm(false);
                setShowDangerZone(false);
            }
        } finally {
            setOrgActionInProgress(false);
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
            const selectedOrgType = updateOrgType || getOrgType(selectedOrg || {});
            const licensePayload = buildLicensePayload({
                orgType: selectedOrgType,
                tier: newLicenseTier,
                seats: newLicenseSeats,
                duration: newLicenseDuration,
                addOns: newLicenseAddOns,
                packageKey: newLicensePackage,
                catalog: licenseUxCatalog
            });

            const activeLicense = orgLicenses.find((x) => (x.isActive || x.IsActive) && !(x.isDisabled || x.IsDisabled));
            const allowCreateNew = selectedOrgType === 'Business' || selectedOrgType === 'Education';
            const operation = allowCreateNew ? 'create-new' : 'renew-in-place';

            if (operation === 'renew-in-place' && !activeLicense?.licenseId) {
                window.toast?.show?.('No active license found to renew in place', 'warning');
                return;
            }

            const res = await window.api.post('/api/v1/licenses/action', {
                operation,
                orgId: selectedOrgId,
                licenseId: operation === 'renew-in-place' ? activeLicense.licenseId : null,
                seats: licensePayload.seats,
                durationDays: licensePayload.durationDays,
                licenseType: licensePayload.licenseType,
                licenseTier: licensePayload.licenseTier,
                package: licensePayload.package,
                addOns: licensePayload.addOns,
                discountType: newLicenseDiscountType === 'none' ? null : newLicenseDiscountType,
                discountValue: newLicenseDiscountType === 'none' ? null : (parseFloat(newLicenseDiscountValue) || 0)
            });
            if (res?.success !== false) {
                window.toast?.show?.('License created successfully', 'success');
                if (res?.data?.paymentRequestId) {
                    const paymentStatus = res?.data?.paymentStatus || 'Succeeded';
                    const isAutoCompleted = String(paymentStatus).toLowerCase() === 'succeeded';
                    window.toast?.show?.(`Invoice ${res.data.paymentRequestId} ${isAutoCompleted ? 'auto-completed' : 'created'} (${paymentStatus})`, 'info');
                }
                setShowCreateLicense(false);
                setNewLicenseSeats(20);
                setNewLicenseDuration(365);
                const currentOrgType = updateOrgType || getOrgType(selectedOrg || {});
                const defaultTier = getTierOptionsForOrgType(currentOrgType, licenseUxCatalog)[0]?.value || 'Startup';
                setNewLicenseTier(defaultTier);
                setNewLicenseAddOns(['Security']);
                setNewLicensePackage('');
                setNewLicenseDiscountType('none');
                setNewLicenseDiscountValue(0);
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
            const res = await window.api.post('/api/v1/licenses/action', {
                operation: 'state',
                licenseId: license.licenseId,
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
            const res = await window.api.post('/api/v1/licenses/action', {
                operation: 'delete',
                licenseId,
                orgId: selectedOrgId
            });
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

    const handleCompletePayment = async (paymentRequestId) => {
        if (!selectedOrgId || !paymentRequestId) return;
        try {
            const res = await window.api.post(`/api/v1/payments/${paymentRequestId}/complete`, {
                orgId: selectedOrgId,
                method: 'Online'
            });
            if (res?.success !== false) {
                window.toast?.show?.('Payment completed and license activated', 'success');
                await handleSelectOrg(selectedOrg);
            } else {
                window.toast?.show?.(res?.message || 'Failed to complete payment', 'error');
            }
        } catch (err) {
            console.error('[OrganizationsTab] complete payment failed', err);
            window.toast?.show?.(err?.message || 'Failed to complete payment', 'error');
        }
    };

    const handleApproveOfflinePayment = async (paymentRequestId) => {
        if (!selectedOrgId || !paymentRequestId) return;
        const notes = prompt('Enter approval notes for offline payment:') || '';
        try {
            const res = await window.api.post(`/api/v1/payments/${paymentRequestId}/approve-offline`, {
                orgId: selectedOrgId,
                notes
            });
            if (res?.success !== false) {
                window.toast?.show?.('Offline payment approved and license activated', 'success');
                await handleSelectOrg(selectedOrg);
            } else {
                window.toast?.show?.(res?.message || 'Failed to approve offline payment', 'error');
            }
        } catch (err) {
            console.error('[OrganizationsTab] approve offline payment failed', err);
            window.toast?.show?.(err?.message || 'Failed to approve offline payment', 'error');
        }
    };

    const activeLicenseCount = orgLicenses.filter((x) => (x.isActive || x.IsActive) && !(x.isDisabled || x.IsDisabled)).length;
    const handleScheduleMigration = async () => {
        if (!selectedOrgId) return;
        setMigrationLoading(true);
        try {
            const selectedRegionOpt = (storageCatalog?.regions || []).find(r => r.regionCode === migrationSelectedRegion);
            const payload = {
                targetOrgRegion: migrationSelectedRegion || null,
                ...(migrationCreateDedicated
                    ? { createDedicatedAccount: true }
                    : { targetStorageAccount: selectedRegionOpt?.sharedAccountName || null })
            };
            const res = await window.api.post(`/api/v1/admin/orgs/${encodeURIComponent(selectedOrgId)}/storage/migrate`, payload);
            if (res?.success !== false) {
                window.toast?.show?.('Storage migration job scheduled successfully', 'success');
                setMigrationCreateDedicated(false);
                await loadMigrationJobs(selectedOrgId);
                await loadStorageCatalog(selectedOrgId);
            } else {
                window.toast?.show?.(res?.message || 'Failed to schedule migration', 'error');
            }
        } catch (err) {
            console.error('[OrganizationsTab] schedule migration failed', err);
            window.toast?.show?.(err?.message || 'Failed to schedule migration', 'error');
        } finally {
            setMigrationLoading(false);
        }
    };

    const selectedOrgType = updateOrgType || getOrgType(selectedOrg || {});
    const isSelectedPersonal = selectedOrgType === 'Personal';
    const hasPendingPayment = orgPayments.some((p) => (p.status || '').toLowerCase() === 'pending');
    const createLicenseButtonLabel = isSelectedPersonal && activeLicenseCount >= 1 ? 'Renew' : 'Create';
    const createLicenseButtonTitle = hasPendingPayment
        ? 'A pending payment request already exists for this organization'
        : (isSelectedPersonal && activeLicenseCount >= 1
            ? 'Generate renewal invoice for Personal license'
            : 'Create license');

    const renderRegionOptions = () => REGION_OPTIONS.map((region) => html`
        <option value=${region.value}>${region.label}</option>
    `);

    const renderCreateReportCard = () => html`
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
                    </div>
                </div>
            </div>
        </div>
    `;

    const renderCreateBusinessProfileCard = () => html`
        <div class="col-12">
            <div class="card border border-light">
                <div class="card-header">
                    <h5 class="card-title mb-0"><i class="ti ti-building me-2"></i>Business Profile & Settings</h5>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Industry</label>
                            <select
                                class="form-select"
                                value=${newIndustry}
                                onChange=${(e) => setNewIndustry(e.target.value)}
                            >
                                <option value="">— Select industry —</option>
                                ${industryOptions.map(i => html`<option value=${i}>${i}</option>`)}
                            </select>
                            <small class="form-text text-muted">Used by AI for industry-specific threat context.</small>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Organization Size</label>
                            <input
                                type="text"
                                class="form-control"
                                placeholder="e.g. 1-10, 11-50, 50-200"
                                value=${newOrgSize}
                                onInput=${(e) => setNewOrgSize(e.target.value)}
                            />
                            <small class="form-text text-muted">Used by AI for size-appropriate risk framing.</small>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Next Audit Date</label>
                            <input
                                type="date"
                                class="form-control"
                                value=${newNextAuditDate}
                                onInput=${(e) => setNewNextAuditDate(e.target.value)}
                            />
                            <small class="form-text text-muted">Shown in compliance reminders and weekly summaries.</small>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Data Region</label>
                            <select class="form-select" value=${newOrgRegion} onChange=${(e) => setNewOrgRegion(e.target.value)}>
                                ${renderRegionOptions()}
                            </select>
                            <small class="form-text text-muted">Sets the initial storage routing region for this organization.</small>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Storage Provisioning</label>
                            <select class="form-select" value=${newOrgStorageMode} onChange=${(e) => setNewOrgStorageMode(e.target.value)}>
                                <option value="shared">Use shared storage account</option>
                                <option value="dedicated">Create dedicated storage account automatically</option>
                            </select>
                            <small class="form-text text-muted">Shared mode uses approved regional pools. Dedicated mode provisions a new account.</small>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Shared Storage Account</label>
                            <select
                                class="form-select"
                                value=${newOrgStorageAccount}
                                disabled=${newOrgStorageMode === 'dedicated' || createStorageCatalogLoading}
                                onChange=${(e) => setNewOrgStorageAccount(e.target.value)}
                            >
                                <option value="">— Select shared account —</option>
                                ${(createStorageCatalog?.regions || [])
                                    .filter((x) => x.regionCode === newOrgRegion)
                                    .map((x) => html`<option value=${x.sharedAccountName}>${x.sharedAccountName}</option>`)}
                            </select>
                            <small class="form-text text-muted">
                                ${newOrgStorageMode === 'dedicated'
                                    ? 'Dedicated mode selected. Shared account is not used.'
                                    : 'Select from approved shared storage accounts for this region.'}
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const renderCreateSummary = () => html`
        <div class="col-12">
            <div class="org-create-summary mb-2">
                <div class="org-create-summary__item"><span>Type</span><strong>${newOrgType}</strong></div>
                <div class="org-create-summary__item"><span>Tier</span><strong>${newOrgLicenseTier}</strong></div>
                <div class="org-create-summary__item"><span>Seats</span><strong>${createOrgInvoicePreview.effectiveSeats}</strong></div>
                <div class="org-create-summary__item"><span>Days</span><strong>${createOrgInvoicePreview.effectiveDuration}</strong></div>
                <div class="org-create-summary__item"><span>Region</span><strong>${newOrgRegion}</strong></div>
                <div class="org-create-summary__item"><span>Invoice</span><strong>${createOrgInvoicePreview.currency} ${createOrgInvoicePreview.finalAmount.toFixed(2)}</strong></div>
            </div>
            <button
                class="btn btn-primary"
                onClick=${handleCreateOrg}
                disabled=${!newOrgName.trim() || newOrgName.trim().length < 4 || !isValidEmail(newOwnerEmail)}
            >
                <i class="ti ti-plus me-2"></i>
                Create Organization
            </button>
        </div>
    `;

    // ========================================
    // MAIN RENDER
    // ========================================
    // Structure:
    //   Section 1: Create Organization Card (collapsible form)
    //   Section 2: Organization List Card (search, filter, pagination, list)
    //   Section 3: Manage Organization Modal (tabbed interface)
    //   Section 4: Confirmation & Transfer Modals
    // ========================================

    return html`
        <div id="organizations">
            <div class="row g-3">
                <!-- ====== SECTION 1: CREATE ORGANIZATION ====== -->
                <div class="col-12">
                    <div class="card org-create-card">
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
                                    <div class="col-12">
                                        <label class="form-label">Organization Type <span class="text-danger">*</span></label>
                                        <div class="d-flex gap-3 flex-wrap">
                                            ${orgTypeOptions.map(opt => html`
                                                <div
                                                    class=${`card flex-grow-1 cursor-pointer mb-0 ${newOrgType === opt.value ? 'border-primary' : 'border-light'}`}
                                                    style="min-width: 150px; cursor: pointer;"
                                                    onClick=${() => setNewOrgType(opt.value)}
                                                >
                                                    <div class="d-flex align-items-start gap-2 p-2">
                                                        <input
                                                            type="radio"
                                                            name="newOrgType"
                                                            value=${opt.value}
                                                            checked=${newOrgType === opt.value}
                                                            onChange=${() => setNewOrgType(opt.value)}
                                                            class="form-check-input mt-0 flex-shrink-0"
                                                        />
                                                        <div>
                                                            <div class="fw-semibold small"><i class=${`ti ${opt.icon} me-1`}></i>${opt.label}</div>
                                                            <div class="text-muted" style="font-size: 11px;">${opt.description}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `)}
                                        </div>
                                    </div>

                                    ${renderCreateReportCard()}

                                    ${renderCreateBusinessProfileCard()}

                                    <div class="col-12">
                                        <div class="card border border-light">
                                            <div class="card-header">
                                                <h5 class="card-title mb-0"><i class="ti ti-certificate me-2"></i>License Configuration</h5>
                                            </div>
                                            <div class="card-body">
                                                <div class="row g-3">
                                                    ${packageCatalog.length > 0 && newOrgType !== 'Education' && newOrgLicenseTier !== 'Demo' && newOrgLicenseTier !== demoTierValue && html`
                                                        <div class="col-md-4">
                                                            <label class="form-label">Package</label>
                                                            <select class="form-select" value=${newOrgPackage} onChange=${(e) => setNewOrgPackage(e.target.value)}>
                                                                <option value="">— None / Custom —</option>
                                                                ${packageCatalog.map(pkg => html`<option value=${pkg.key}>${pkg.label}${pkg.priceMultiplier !== 1 ? ` (×${pkg.priceMultiplier})` : ''}</option>`)}
                                                            </select>
                                                            <small class="text-muted">Pre-configures included add-ons for this package.</small>
                                                        </div>
                                                    `}
                                                    <div class="col-md-4">
                                                        <label class="form-label">License Tier</label>
                                                        <select class="form-select" value=${newOrgLicenseTier} onChange=${(e) => setNewOrgLicenseTier(e.target.value)}>
                                                            ${getTierOptionsForOrgType(newOrgType, licenseUxCatalog).map((opt) => html`<option value=${opt.value}>${opt.label}</option>`)}
                                                        </select>
                                                        <small class="text-muted">Tier decides seats unless Custom is selected. Type follows org type, except Demo.</small>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <label class="form-label">Seats</label>
                                                        <input
                                                            type="number"
                                                            class="form-control"
                                                            min="1"
                                                            value=${newOrgSeats}
                                                            disabled=${newOrgLicenseTier !== 'Custom' && !(newOrgLicenseTier === demoTierValue && licenseUxCatalog.demoTier?.allowCustomSeats)}
                                                            onInput=${(e) => setNewOrgSeats(e.target.value)}
                                                        />
                                                        ${(() => { const w = getSizeTierWarning(newOrgSeats, licenseUxCatalog); return w ? html`<small class="text-warning"><i class="ti ti-alert-triangle me-1"></i>${w}</small>` : null; })()}
                                                    </div>
                                                    <div class="col-md-4">
                                                        <label class="form-label">Duration</label>
                                                        <select class="form-select" value=${newOrgDuration} onChange=${(e) => setNewOrgDuration(e.target.value)}>
                                                            ${durationOptions.map(opt => html`<option value=${opt.value}>${opt.label}</option>`)}
                                                        </select>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <label class="form-label">Discount Type</label>
                                                        <select class="form-select" value=${newOrgDiscountType} onChange=${(e) => setNewOrgDiscountType(e.target.value)}>
                                                            <option value="none">None</option>
                                                            <option value="percent">Percent (%)</option>
                                                            <option value="fixed">Fixed (${createOrgInvoicePreview.currency})</option>
                                                        </select>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <label class="form-label">Discount Value</label>
                                                        <input
                                                            type="number"
                                                            class="form-control"
                                                            min="0"
                                                            value=${newOrgDiscountValue}
                                                            disabled=${newOrgDiscountType === 'none'}
                                                            onInput=${(e) => setNewOrgDiscountValue(e.target.value)}
                                                        />
                                                        <small class="text-muted">Leave None to use tier default discount (if configured).</small>
                                                    </div>
                                                    <div class="col-12">
                                                        <div class="alert alert-info mb-0 py-2">
                                                            <div class="d-flex flex-wrap gap-3 small">
                                                                <span><strong>Base:</strong> ${createOrgInvoicePreview.currency} ${createOrgInvoicePreview.baseAmount.toFixed(2)}</span>
                                                                <span><strong>Discount:</strong> ${createOrgInvoicePreview.currency} ${createOrgInvoicePreview.discountAmount.toFixed(2)}</span>
                                                                <span><strong>Final Invoice:</strong> ${createOrgInvoicePreview.currency} ${createOrgInvoicePreview.finalAmount.toFixed(2)}</span>
                                                                <span class="text-muted">Mode: ${createOrgInvoicePreview.pricingMode}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    ${(newOrgLicenseTier === 'Custom' || newOrgLicenseTier === demoTierValue || !!newOrgPackage) && html`
                                                        <div class="col-12">
                                                            <label class="form-label">Platform Features / Add-ons${newOrgPackage ? html` <span class="badge bg-primary-lt text-primary ms-2">Pre-configured by package</span>` : ''}</label>
                                                            <div class="row g-2">
                                                                ${addOnCatalog.map((addOn) => html`
                                                                    <div class="col-md-6">
                                                                        <label class="form-check border rounded p-2 mb-0 ${addOn.requiredForAll ? 'bg-light' : ''}">
                                                                            <input
                                                                                class="form-check-input"
                                                                                type="checkbox"
                                                                                        checked=${normalizeCustomAddOns(newOrgLicenseAddOns, newOrgLicenseTier === demoTierValue, licenseUxCatalog).includes(addOn.key)}
                                                                                        disabled=${!!addOn.requiredForAll || (newOrgLicenseTier === demoTierValue && !!addOn.lockedForDemo) || (!!newOrgPackage && getAddOnsForPackage(newOrgPackage, licenseUxCatalog).includes(addOn.key))}
                                                                                onChange=${(e) => {
                                                                                    if (addOn.requiredForAll || (newOrgLicenseTier === demoTierValue && addOn.lockedForDemo)) return;
                                                                                    if (newOrgPackage && getAddOnsForPackage(newOrgPackage, licenseUxCatalog).includes(addOn.key)) return;
                                                                                            const selected = new Set(normalizeCustomAddOns(newOrgLicenseAddOns, newOrgLicenseTier === demoTierValue, licenseUxCatalog));
                                                                                    if (e.target.checked) selected.add(addOn.key);
                                                                                    else selected.delete(addOn.key);
                                                                                    setNewOrgLicenseAddOns(normalizeCustomAddOns(Array.from(selected), newOrgLicenseTier === demoTierValue, licenseUxCatalog));
                                                                                }}
                                                                            />
                                                                            <span class="form-check-label ms-2">
                                                                                <strong>${addOn.label}${addOn.requiredForAll ? ' (required)' : ''}</strong>
                                                                                <div class="text-muted small">${addOn.description}</div>
                                                                            </span>
                                                                        </label>
                                                                    </div>
                                                                `)}
                                                            </div>
                                                        </div>
                                                    `}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    ${renderCreateSummary()}
                                </div>
                            </div>
                        `}
                    </div>
                </div>

                <!-- ====== SECTION 2: ORGANIZATION LIST ====== -->
                <div class="col-12">
                    <div class="card org-list-card">
                        <div class="card-header" style="cursor: pointer;" onClick=${() => setShowOrgList(!showOrgList)}>
                            <h3 class="card-title mb-0">
                                <i class="${`ti ${showOrgList ? 'ti-chevron-down' : 'ti-chevron-right'}`} me-2"></i>
                                Organizations List
                            </h3>
                        </div>
                        ${showOrgList && html`
                        <div class="card-body" ref=${listContainerRef} style="overflow: auto; max-height: 70vh;">
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
                                        id="filterEducation"
                                        name="orgTypeFilter"
                                        value="Education"
                                        checked=${orgTypeFilter === 'Education'}
                                        onChange=${(e) => {
                                            setOrgTypeFilter(e.target.value);
                                            setVisibleCount(30);
                                        }}
                                    />
                                    <label class="btn btn-outline-secondary btn-sm" for="filterEducation"><i class="ti ti-school me-1"></i>Education</label>
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
                                <div class="input-icon" style="min-width: 280px;">
                                    <span class="input-icon-addon">
                                        <i class="ti ti-filter"></i>
                                    </span>
                                    <input
                                        type="text"
                                        class="form-control"
                                        placeholder="Org IDs (comma-separated)"
                                        value=${orgIdsFilter}
                                        onInput=${(e) => setOrgIdsFilter(e.target.value)}
                                    />
                                </div>
                            </div>

                            ${orgListError && html`<div class="alert alert-danger py-2">${orgListError}</div>`}

                            ${isServerListMode && html`
                                <div class="text-muted small mb-2">
                                    Loaded ${sourceOrgs.length} of ${serverTotalCount} organizations from server
                                </div>
                            `}

                            <div class="table-responsive org-list-table-wrap">
                                <table class="table table-vcenter card-table">
                                    <thead>
                                        <tr>
                                            <th>Organization</th>
                                            <th>Owner</th>
                                            <th>MAGICode</th>
                                            <th>Credits</th>
                                            <th>Status</th>
                                            <th>Created</th>
                                            <th class="w-1">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${currentOrgs.map(org => {
                                            const badge = getOrgTypeBadge(org);
                                            const credits = getCreditSnapshot(org);
                                            const ownerEmail = getOwnerEmail(org);
                                            const orgId = getOrgId(org);
                                            const orgName = getOrgName(org);
                                            const createdAt = getCreatedAt(org);
                                            const disabled = isOrgDisabled(org);
                                            return html`
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        <span class=${`badge ${badge.bgClass}`} style="padding: 6px 8px; font-size: 14px; display: flex; align-items: center; gap: 4px;" title=${badge.label}>
                                                            <i class=${`ti ${badge.icon}`} style="font-size: 16px;"></i>
                                                        </span>
                                                        <div>
                                                            <div class="fw-bold">
                                                                ${orgName}
                                                                ${org.isDemoOrg ? html`<span class="badge bg-warning-lt text-warning ms-1" style="font-size: 10px;">Demo</span>` : ''}
                                                            </div>
                                                            <div class="text-muted small">${orgId}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="fw-semibold">${ownerEmail}</div>
                                                    <div class="text-muted small">${badge.label}</div>
                                                </td>
                                                <td>
                                                    ${getMagiCodeForOrg(org)
                                                        ? html`<span class="badge bg-success text-white">${getMagiCodeForOrg(org)}</span>`
                                                        : html`<span class="text-muted small">Not used</span>`}
                                                </td>
                                                <td>
                                                    <div class="fw-semibold">${credits.remaining} / ${credits.total}</div>
                                                    ${credits.hasSnapshot
                                                        ? html`<div class="progress progress-sm mt-1"><div class="progress-bar bg-primary" style="width: ${credits.pct}%"></div></div>`
                                                        : html`<small class="text-muted">No credit dossier</small>`}
                                                </td>
                                                <td>
                                                    <span class=${`badge ${disabled ? 'bg-danger' : 'bg-success'}`}>
                                                        ${disabled ? 'Disabled' : 'Active'}
                                                    </span>
                                                </td>
                                                <td class="text-muted">
                                                    ${createdAt ? new Date(createdAt).toLocaleDateString() : '-'}
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
                                        `;})}
                                        ${currentOrgs.length === 0 && html`
                                            <tr>
                                                <td colspan="7" class="text-center py-4 text-muted">
                                                    No organizations found
                                                </td>
                                            </tr>
                                        `}
                                    </tbody>
                                </table>
                                <div ref=${sentinelRef} style="height: 10px;"></div>
                            </div>

                            ${!isServerListMode && visibleCount < filteredOrgs.length && html`
                                <div class="card-footer text-center py-3">
                                    <small class="text-muted">Showing ${visibleCount} of ${filteredOrgs.length} organizations (scroll to load more)</small>
                                </div>
                            `}

                            ${isServerListMode && orgListLoading && html`
                                <div class="card-footer text-center py-3">
                                    <small class="text-muted">Loading organizations...</small>
                                </div>
                            `}
                        </div>
                        `}
                    </div>
                </div>
            </div>

            <!-- ====== SECTION 3: MANAGE ORGANIZATION MODAL ====== -->
            ${selectedOrg && html`
                                                                        <div class="modal-root">
                                                                            <div class="modal-backdrop fade show custom-backdrop"></div>
                                                                            <div
                                                                                class="modal modal-blur fade show org-manage-modal"
                                                                                style="display: block;"
                                                                                tabindex="-1"
                                                                                onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); }}
                                                                            >
                                                                                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick=${(e) => e.stopPropagation()}>
                                                                                    <div class="modal-content org-manage-modal__content">

                                                                                        <!-- Modal header with org name + tab bar -->
                                                                                        <div class="modal-header d-block pb-0">
                                                                                            <div class="d-flex justify-content-between align-items-start mb-2">
                                                                                                <div>
                                                                                                    <h3 class="modal-title mb-0">${getOrgName(selectedOrg)}</h3>
                                                                                                    <div class="text-muted small">${getOrgId(selectedOrg)} · ${getOrgTypeBadge(selectedOrg).label}</div>
                                                                                                </div>
                                                                                                <button type="button" class="btn-close mt-1" onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); }}></button>
                                                                                            </div>
                                                                                            <ul class="nav nav-tabs card-header-tabs border-bottom-0">
                                                                                                <li class="nav-item">
                                                                                                    <a class=${`nav-link ${activeManageTab === 'details' ? 'active' : ''}`} href="#" onClick=${(e) => { e.preventDefault(); setActiveManageTab('details'); }}>
                                                                                                        <i class="ti ti-info-circle me-1"></i>Details
                                                                                                    </a>
                                                                                                </li>
                                                                                                <li class="nav-item">
                                                                                                    <a class=${`nav-link ${activeManageTab === 'licenses' ? 'active' : ''}`} href="#" onClick=${(e) => { e.preventDefault(); setActiveManageTab('licenses'); }}>
                                                                                                        <i class="ti ti-certificate me-1"></i>Licenses
                                                                                                        ${activeLicenseCount > 0 ? html`<span class="badge bg-primary text-white ms-1">${activeLicenseCount}</span>` : ''}
                                                                                                    </a>
                                                                                                </li>
                                                                                                <li class="nav-item">
                                                                                                    <a class=${`nav-link ${activeManageTab === 'storage' ? 'active' : ''}`} href="#" onClick=${(e) => { e.preventDefault(); setActiveManageTab('storage'); loadMigrationJobs(selectedOrgId); loadStorageCatalog(selectedOrgId); }}>
                                                                                                        <i class="ti ti-database me-1"></i>Storage
                                                                                                    </a>
                                                                                                </li>
                                                                                                <li class="nav-item ms-auto">
                                                                                                    <a class=${`nav-link text-danger ${activeManageTab === 'danger' ? 'active fw-bold' : ''}`} href="#" onClick=${(e) => { e.preventDefault(); setActiveManageTab('danger'); }}>
                                                                                                        <i class="ti ti-alert-triangle me-1"></i>Danger Zone
                                                                                                    </a>
                                                                                                </li>
                                                                                            </ul>
                                                                                        </div>

                                                                                        <div class="modal-body org-manage-modal__body" style="overflow-y: auto;">

                                                                                            <!-- ── Tab: Details ── -->
                                                                                            ${activeManageTab === 'details' && html`
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
                                                                                                                <i class="ti ti-arrows-exchange me-1"></i>Transfer
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div class="col-12">
                                                                                                        <button
                                                                                                            class="btn btn-primary"
                                                                                                            onClick=${handleUpdateOrg}
                                                                                                            disabled=${!updateOrgName.trim() || updateOrgName.trim().length < 4}
                                                                                                        >
                                                                                                            <i class="ti ti-device-floppy me-1"></i>Save Changes
                                                                                                        </button>
                                                                                                    </div>
                                                                                                    <div class="col-12"><hr class="my-1" /></div>

                                                                                                    <!-- Reports -->
                                                                                                    <div class="col-12">
                                                                                                        <div class="card border border-light">
                                                                                                            <div class="card-header">
                                                                                                                <h5 class="card-title mb-0"><i class="ti ti-mail me-2"></i>Reports</h5>
                                                                                                            </div>
                                                                                                            <div class="card-body">
                                                                                                                <div class="d-flex gap-4 flex-wrap">
                                                                                                                    <div class="d-flex flex-column gap-2">
                                                                                                                        <label class="form-label mb-0"><strong>Daily</strong></label>
                                                                                                                        <div class="form-check form-switch">
                                                                                                                            <input class="form-check-input" type="checkbox" checked=${updateDailyReportEnabled} onChange=${(e) => setUpdateDailyReportEnabled(e.target.checked)} style="width: 40px; height: 20px;" />
                                                                                                                        </div>
                                                                                                                        <small class="text-muted">Every day</small>
                                                                                                                    </div>
                                                                                                                    <div class="d-flex flex-column gap-2">
                                                                                                                        <label class="form-label mb-0"><strong>Weekly</strong></label>
                                                                                                                        <div class="form-check form-switch">
                                                                                                                            <input class="form-check-input" type="checkbox" checked=${updateWeeklyReportEnabled} onChange=${(e) => setUpdateWeeklyReportEnabled(e.target.checked)} style="width: 40px; height: 20px;" />
                                                                                                                        </div>
                                                                                                                        <small class="text-muted">Every Monday</small>
                                                                                                                    </div>
                                                                                                                    <div class="d-flex flex-column gap-2">
                                                                                                                        <label class="form-label mb-0"><strong>All Members</strong></label>
                                                                                                                        <div class="form-check form-switch">
                                                                                                                            <input class="form-check-input" type="checkbox" checked=${updateSendToAllMembers} onChange=${(e) => setUpdateSendToAllMembers(e.target.checked)} disabled=${isPersonalOrg(selectedOrg)} style="width: 40px; height: 20px;" />
                                                                                                                        </div>
                                                                                                                        <small class="text-muted">${isPersonalOrg(selectedOrg) ? 'Business only' : 'Owner + team'}</small>
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <!-- Organization Type -->
                                                                                                    <div class="col-12">
                                                                                                        <div class="card border border-light">
                                                                                                            <div class="card-header">
                                                                                                                <h5 class="card-title mb-0"><i class="ti ti-tag me-2"></i>Organization Type</h5>
                                                                                                            </div>
                                                                                                            <div class="card-body">
                                                                                                                <div class="d-flex gap-3 flex-wrap">
                                                                                                                    ${orgTypeOptions.map(opt => html`
                                                                                                                        <div
                                                                                                                            class=${`card flex-grow-1 cursor-pointer mb-0 ${updateOrgType === opt.value ? 'border-primary' : 'border-light'}`}
                                                                                                                            style="min-width: 150px; cursor: pointer;"
                                                                                                                            onClick=${() => setUpdateOrgType(opt.value)}
                                                                                                                        >
                                                                                                                            <div class="card-body p-2 d-flex align-items-center gap-2">
                                                                                                                                <input type="radio" name="updateOrgType" value=${opt.value} checked=${updateOrgType === opt.value} onChange=${() => setUpdateOrgType(opt.value)} class="form-check-input mt-0 flex-shrink-0" />
                                                                                                                                <div>
                                                                                                                                    <div class="fw-semibold small"><i class=${`ti ${opt.icon} me-1`}></i>${opt.label}</div>
                                                                                                                                    <div class="text-muted" style="font-size: 11px;">${opt.description}</div>
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                    `)}
                                                                                                                </div>
                                                                                                                <small class="form-text text-muted mt-2 d-block">Changing org type affects license constraints and feature access.</small>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <!-- Business Profile & Settings -->
                                                                                                    <div class="col-12">
                                                                                                        <div class="card border border-light">
                                                                                                            <div class="card-header">
                                                                                                                <h5 class="card-title mb-0"><i class="ti ti-user-circle me-2"></i>Business Profile & Settings</h5>
                                                                                                            </div>
                                                                                                            <div class="card-body">
                                                                                                                <div class="row g-3">
                                                                                                                    <div class="col-md-6">
                                                                                                                        <label class="form-label">Industry</label>
                                                                                                                        <select class="form-select" value=${updateIndustry} onChange=${(e) => setUpdateIndustry(e.target.value)}>
                                                                                                                            <option value="">— Select industry —</option>
                                                                                                                            ${industryOptions.map(i => html`<option value=${i}>${i}</option>`)}
                                                                                                                        </select>
                                                                                                                        <small class="form-text text-muted">Used by AI for industry-specific threat context</small>
                                                                                                                    </div>
                                                                                                                    <div class="col-md-6">
                                                                                                                        <label class="form-label">Organisation Size</label>
                                                                                                                        <input type="text" class="form-control" placeholder="e.g. 1-10, 11-50, 50-200" value=${updateOrgSize} onInput=${(e) => setUpdateOrgSize(e.target.value)} />
                                                                                                                        <small class="form-text text-muted">Used by AI for size-appropriate risk framing</small>
                                                                                                                    </div>
                                                                                                                    <div class="col-md-4">
                                                                                                                        <label class="form-label">Next Audit Date</label>
                                                                                                                        <input type="date" class="form-control" value=${updateNextAuditDate} onInput=${(e) => setUpdateNextAuditDate(e.target.value)} />
                                                                                                                        <small class="form-text text-muted">Compliance countdown in weekly email</small>
                                                                                                                    </div>
                                                                                                                    <div class="col-md-4">
                                                                                                                        <label class="form-label">Data Region</label>
                                                                                                                        <input
                                                                                                                            type="text"
                                                                                                                            class="form-control"
                                                                                                                            value=${updateOrgRegion || selectedOrg.orgRegion || 'US'}
                                                                                                                            disabled
                                                                                                                        />
                                                                                                                        <small class="form-text text-muted">Managed in Storage tab only. Region changes are part of migration workflow.</small>
                                                                                                                    </div>
                                                                                                                    <div class="col-md-4">
                                                                                                                        <label class="form-label">Dossier Refresh Override (hrs)</label>
                                                                                                                        <input type="number" min="1" max="24" step="1" class="form-control" placeholder="Platform default" value=${updateTodaySnapshotRefreshHoursOverride} onInput=${(e) => setUpdateTodaySnapshotRefreshHoursOverride(e.target.value)} />
                                                                                                                        <small class="form-text text-muted">Leave blank to use platform default.</small>
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            `}

                                                                                            <!-- ── Tab: Licenses & Billing ── -->
                                                                                            ${activeManageTab === 'licenses' && html`
                                                                                                <div class="row g-3">
                                                                                                    <div class="col-12">
                                                                                                        <div class="d-flex justify-content-between align-items-center mb-2">
                                                                                                            <h5 class="m-0">Licenses</h5>
                                                                                                            <button class="btn btn-sm btn-primary" onClick=${() => setShowCreateLicense(!showCreateLicense)} disabled=${hasPendingPayment} title=${createLicenseButtonTitle}>
                                                                                                                <i class="ti ti-plus me-1"></i> ${createLicenseButtonLabel}
                                                                                                            </button>
                                                                                                        </div>

                                                                                                        ${showCreateLicense && html`
                                                                                                            <div class="card mb-3 bg-light">
                                                                                                                <div class="card-body">
                                                                                                                    <h6 class="card-title">${isSelectedPersonal && activeLicenseCount >= 1 ? 'Renew Personal License' : 'New License'}</h6>
                                                                                                                    ${isSelectedPersonal && activeLicenseCount >= 1 && html`
                                                                                                                        <div class="alert alert-info py-2 mb-2 small">
                                                                                                                            Renewal will generate an invoice/payment record and rotate to the new license after payment processing.
                                                                                                                        </div>
                                                                                                                    `}
                                                                                                                    <div class="row g-2 align-items-end">
                                                                                                                        ${packageCatalog.length > 0 && !isSelectedPersonal && html`
                                                                                                                            <div class="col-md-2">
                                                                                                                                <label class="form-label small">Package</label>
                                                                                                                                <select class="form-select form-select-sm" value=${newLicensePackage} onChange=${(e) => setNewLicensePackage(e.target.value)}>
                                                                                                                                    <option value="">— None —</option>
                                                                                                                                    ${packageCatalog.map(pkg => html`<option value=${pkg.key}>${pkg.label}</option>`)}
                                                                                                                                </select>
                                                                                                                            </div>
                                                                                                                        `}
                                                                                                                        <div class="col-md-2">
                                                                                                                            <label class="form-label small">Seats</label>
                                                                                                                            <input type="number" class="form-control form-control-sm" min="1" value=${newLicenseSeats} disabled=${newLicenseTier !== 'Custom' && !(newLicenseTier === demoTierValue && licenseUxCatalog.demoTier?.allowCustomSeats)} onInput=${(e) => setNewLicenseSeats(e.target.value)} />
                                                                                                                            ${(() => { const w = getSizeTierWarning(newLicenseSeats, licenseUxCatalog); return w ? html`<small class="text-warning d-block mt-1"><i class="ti ti-alert-triangle me-1"></i>${w}</small>` : null; })()}
                                                                                                                        </div>
                                                                                                                        <div class="col-md-2">
                                                                                                                            <label class="form-label small">Duration (Days)</label>
                                                                                                                            <select class="form-select form-select-sm" value=${newLicenseDuration} onChange=${(e) => setNewLicenseDuration(e.target.value)}>
                                                                                                                                ${durationOptions.map(opt => html`<option value=${opt.value}>${opt.label}</option>`)}
                                                                                                                            </select>
                                                                                                                        </div>
                                                                                                                        <div class="col-md-2">
                                                                                                                            <label class="form-label small">Tier</label>
                                                                                                                            <select class="form-select form-select-sm" value=${newLicenseTier} onChange=${(e) => setNewLicenseTier(e.target.value)}>
                                                                                                                                ${getTierOptionsForOrgType(updateOrgType || getOrgType(selectedOrg || {}), licenseUxCatalog).map((opt) => html`<option value=${opt.value}>${opt.label}</option>`)}
                                                                                                                            </select>
                                                                                                                            <small class="text-muted">Matches org type, or Demo.</small>
                                                                                                                        </div>
                                                                                                                        <div class="col-md-2">
                                                                                                                            <label class="form-label small">Discount</label>
                                                                                                                            <select class="form-select form-select-sm" value=${newLicenseDiscountType} onChange=${(e) => setNewLicenseDiscountType(e.target.value)}>
                                                                                                                                <option value="none">None</option>
                                                                                                                                <option value="percent">Percent (%)</option>
                                                                                                                                <option value="fixed">Fixed (${createLicenseInvoicePreview.currency})</option>
                                                                                                                            </select>
                                                                                                                        </div>
                                                                                                                        <div class="col-md-2">
                                                                                                                            <label class="form-label small">Value</label>
                                                                                                                            <input type="number" class="form-control form-control-sm" min="0" value=${newLicenseDiscountValue} disabled=${newLicenseDiscountType === 'none'} onInput=${(e) => setNewLicenseDiscountValue(e.target.value)} />
                                                                                                                        </div>
                                                                                                                        <div class="col-md-2">
                                                                                                                            <button class="btn btn-sm btn-success me-1" onClick=${handleCreateLicense}>Create</button>
                                                                                                                            <button class="btn btn-sm btn-ghost-secondary" onClick=${() => setShowCreateLicense(false)}>Cancel</button>
                                                                                                                        </div>
                                                                                                                        <div class="col-12">
                                                                                                                            <div class="alert alert-info mb-0 py-2">
                                                                                                                                <div class="d-flex flex-wrap gap-3 small">
                                                                                                                                    <span><strong>Base:</strong> ${createLicenseInvoicePreview.currency} ${createLicenseInvoicePreview.baseAmount.toFixed(2)}</span>
                                                                                                                                    <span><strong>Discount:</strong> ${createLicenseInvoicePreview.currency} ${createLicenseInvoicePreview.discountAmount.toFixed(2)}</span>
                                                                                                                                    <span><strong>Final Invoice:</strong> ${createLicenseInvoicePreview.currency} ${createLicenseInvoicePreview.finalAmount.toFixed(2)}</span>
                                                                                                                                    <span class="text-muted">Mode: ${createLicenseInvoicePreview.pricingMode}</span>
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                        ${(newLicenseTier === 'Custom' || newLicenseTier === demoTierValue || !!newLicensePackage) && html`
                                                                                                                            <div class="col-12">
                                                                                                                                <label class="form-label small">Platform Features / Add-ons${newLicensePackage ? html` <span class="badge bg-primary-lt text-primary ms-1">Package defaults</span>` : ''}</label>
                                                                                                                                <div class="row g-2">
                                                                                                                                    ${addOnCatalog.map((addOn) => html`
                                                                                                                                        <div class="col-md-6">
                                                                                                                                            <label class="form-check border rounded p-2 mb-0 ${addOn.requiredForAll ? 'bg-light' : ''}">
                                                                                                                                                <input
                                                                                                                                                    class="form-check-input"
                                                                                                                                                    type="checkbox"
                                                                                                                                                    checked=${normalizeCustomAddOns(newLicenseAddOns, newLicenseTier === demoTierValue, licenseUxCatalog).includes(addOn.key)}
                                                                                                                                                    disabled=${!!addOn.requiredForAll || (newLicenseTier === demoTierValue && !!addOn.lockedForDemo) || (!!newLicensePackage && getAddOnsForPackage(newLicensePackage, licenseUxCatalog).includes(addOn.key))}
                                                                                                                                                    onChange=${(e) => {
                                                                                                                                                        if (addOn.requiredForAll || (newLicenseTier === demoTierValue && addOn.lockedForDemo)) return;
                                                                                                                                                        if (newLicensePackage && getAddOnsForPackage(newLicensePackage, licenseUxCatalog).includes(addOn.key)) return;
                                                                                                                                                        const selected = new Set(normalizeCustomAddOns(newLicenseAddOns, newLicenseTier === demoTierValue, licenseUxCatalog));
                                                                                                                                                        if (e.target.checked) selected.add(addOn.key);
                                                                                                                                                        else selected.delete(addOn.key);
                                                                                                                                                        setNewLicenseAddOns(normalizeCustomAddOns(Array.from(selected), newLicenseTier === demoTierValue, licenseUxCatalog));
                                                                                                                                                    }}
                                                                                                                                                />
                                                                                                                                                <span class="form-check-label ms-2">
                                                                                                                                                    <strong>${addOn.label}${addOn.requiredForAll ? ' (required)' : ''}</strong>
                                                                                                                                                    <div class="text-muted small">${addOn.description}</div>
                                                                                                                                                </span>
                                                                                                                                            </label>
                                                                                                                                        </div>
                                                                                                                                    `)}
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        `}
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        `}

                                                                                                        <div class="table-responsive border rounded" style="font-size: 13px;">
                                                                                                            <table class="table table-vcenter card-table table-sm mb-0">
                                                                                                                <thead>
                                                                                                                    <tr><th>Type</th><th>Package</th><th>Key / Email</th><th>Seats</th><th>Credits</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                                                                                                                </thead>
                                                                                                                <tbody>
                                                                                                                    ${orgLicenses.length > 0 ? orgLicenses.map(lic => html`
                                                                                                                        <tr>
                                                                                                                            <td>
                                                                                                                                <span class=${`badge ${
                                                                                                                                    lic.licenseType === 'Personal' ? 'bg-info-lt text-info' :
                                                                                                                                    lic.licenseType === 'Education' ? 'bg-success-lt text-success' :
                                                                                                                                    lic.licenseType === 'Demo' ? 'bg-warning-lt text-warning' :
                                                                                                                                    'bg-primary-lt text-primary'
                                                                                                                                }`}>${lic.licenseTier || lic.licenseType || 'Business'}</span>
                                                                                                                            </td>
                                                                                                                            <td>
                                                                                                                                ${lic.packageKey
                                                                                                                                    ? html`<span class="badge bg-azure-lt text-azure">${lic.packageKey}</span>`
                                                                                                                                    : html`<span class="text-muted">—</span>`}
                                                                                                                            </td>
                                                                                                                            <td><div class="text-truncate" style="max-width: 150px;" title=${lic.serialKey}>${lic.serialKey}</div></td>
                                                                                                                            <td>${lic.seats || '-'}</td>
                                                                                                                            <td>
                                                                                                                                <div class="small">${lic.remainingCredits} / ${lic.totalCredits}</div>
                                                                                                                                ${lic.licenseType === 'Demo' ? html`<small class="text-warning">$0 revenue</small>` : ''}
                                                                                                                            </td>
                                                                                                                            <td>
                                                                                                                                <span class=${`badge ${
                                                                                                                                    (lic.status || '').toLowerCase() === 'pendingpayment' ? 'bg-warning text-white' :
                                                                                                                                    lic.isDisabled ? 'bg-danger' :
                                                                                                                                    lic.isActive ? 'bg-success' :
                                                                                                                                    'bg-secondary'
                                                                                                                                }`}>
                                                                                                                                    ${(lic.status || (lic.isDisabled ? 'Disabled' : lic.isActive ? 'Active' : 'Inactive'))}
                                                                                                                                </span>
                                                                                                                            </td>
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
                                                                                                                    `) : html`<tr><td colspan="8" class="text-center py-3 text-muted small">No licenses</td></tr>`}
                                                                                                                </tbody>
                                                                                                            </table>
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <!-- Payment Requests -->
                                                                                                    <div class="col-12 mt-2">
                                                                                                        <h5 class="mb-2">Payment Requests</h5>
                                                                                                        <div class="table-responsive border rounded" style="font-size: 13px;">
                                                                                                            <table class="table table-vcenter card-table table-sm mb-0">
                                                                                                                <thead>
                                                                                                                    <tr><th>Invoice</th><th>License</th><th>Base</th><th>Discount</th><th>Final</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                                                                                                                </thead>
                                                                                                                <tbody>
                                                                                                                    ${orgPayments.length > 0 ? orgPayments.map((p) => html`
                                                                                                                        <tr>
                                                                                                                            <td><span class="badge bg-secondary text-white">${p.invoiceId || p.paymentRequestId}</span></td>
                                                                                                                            <td class="text-muted small">${p.licenseId || '-'}</td>
                                                                                                                            <td>${p.currency || 'USD'} ${p.baseAmount ?? p.amount ?? 0}</td>
                                                                                                                            <td>
                                                                                                                                ${(p.discountAmount ?? 0) > 0
                                                                                                                                    ? html`${p.discountType === 'percent' ? `${p.discountValue}%` : `${p.currency || 'USD'} ${p.discountAmount}`}`
                                                                                                                                    : html`-`}
                                                                                                                            </td>
                                                                                                                            <td><strong>${p.currency || 'USD'} ${p.amount ?? 0}</strong></td>
                                                                                                                            <td>
                                                                                                                                <span class=${`badge ${
                                                                                                                                    (p.status || '').toLowerCase().includes('success') || (p.status || '').toLowerCase().includes('approved') ? 'bg-success' :
                                                                                                                                    (p.status || '').toLowerCase() === 'pending' ? 'bg-warning text-white' :
                                                                                                                                    'bg-secondary'
                                                                                                                                }`}>
                                                                                                                                    ${p.status || 'Pending'}
                                                                                                                                </span>
                                                                                                                            </td>
                                                                                                                            <td class="text-muted small">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}</td>
                                                                                                                            <td>
                                                                                                                                ${(p.status || '').toLowerCase() === 'pending' ? html`
                                                                                                                                    <div class="btn-list flex-nowrap">
                                                                                                                                        <button class="btn btn-sm btn-outline-success" onClick=${() => handleCompletePayment(p.paymentRequestId)} title="Mark payment complete">
                                                                                                                                            <i class="ti ti-check"></i>
                                                                                                                                        </button>
                                                                                                                                        <button class="btn btn-sm btn-outline-primary" onClick=${() => handleApproveOfflinePayment(p.paymentRequestId)} title="Approve offline payment">
                                                                                                                                            <i class="ti ti-receipt"></i>
                                                                                                                                        </button>
                                                                                                                                    </div>
                                                                                                                                ` : html`<span class="text-muted small">-</span>`}
                                                                                                                            </td>
                                                                                                                        </tr>
                                                                                                                    `) : html`<tr><td colspan="8" class="text-center py-3 text-muted small">No payment requests</td></tr>`}
                                                                                                                </tbody>
                                                                                                            </table>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            `}

                                                                                            <!-- ── Tab: Storage ── -->
                                                                                            ${activeManageTab === 'storage' && html`
                                                                                                <div class="row g-3">
                                                                                                    <!-- Current Storage Status -->
                                                                                                    <div class="col-12">
                                                                                                        <div class="d-flex gap-4 p-3 bg-light rounded flex-wrap">
                                                                                                            <div>
                                                                                                                <small class="text-muted d-block">Current Region</small>
                                                                                                                <span class="badge bg-blue text-white" style="font-size: 14px;">${selectedOrg.orgRegion || 'US'}</span>
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <small class="text-muted d-block">Storage Account</small>
                                                                                                                <span class="fw-semibold">${(storageCatalog?.currentStorageAccount) || selectedOrg.storageAccountName || html`<span class="text-muted fst-italic">platform default</span>`}</span>
                                                                                                            </div>
                                                                                                            ${storageCatalog?.currentAccountKind && html`
                                                                                                                <div>
                                                                                                                    <small class="text-muted d-block">Account Type</small>
                                                                                                                    <span class=${`badge ${
                                                                                                                        storageCatalog.currentAccountKind === 'Dedicated' ? 'bg-purple text-white' :
                                                                                                                        storageCatalog.currentAccountKind === 'SharedPersonal' ? 'bg-info text-white' :
                                                                                                                        storageCatalog.currentAccountKind === 'SharedEducation' ? 'bg-warning text-white' :
                                                                                                                        'bg-primary text-white'
                                                                                                                    }`}>
                                                                                                                        ${
                                                                                                                            storageCatalog.currentAccountKind === 'Dedicated' ? 'Dedicated' :
                                                                                                                            storageCatalog.currentAccountKind === 'SharedPersonal' ? 'Shared (Personal)' :
                                                                                                                            storageCatalog.currentAccountKind === 'SharedEducation' ? 'Shared (Education)' :
                                                                                                                            'Shared (Business)'
                                                                                                                        }
                                                                                                                    </span>
                                                                                                                </div>
                                                                                                            `}
                                                                                                            <div>
                                                                                                                <small class="text-muted d-block">Org ID</small>
                                                                                                                <span class="font-monospace small">${selectedOrg.orgId}</span>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <!-- Schedule Migration -->
                                                                                                    <div class="col-12">
                                                                                                        <div class="card border border-light">
                                                                                                            <div class="card-header">
                                                                                                                <h5 class="card-title mb-0"><i class="ti ti-transfer me-2"></i>Schedule Storage Migration</h5>
                                                                                                            </div>
                                                                                                            <div class="card-body">
                                                                                                                <p class="text-muted small mb-3">Move this organization's blob data (dossiers, reports) to a different storage account or region. The background job copies blobs with checkpoint resumption — safe to reschedule if interrupted.</p>
                                                                                                                ${storageCatalogLoading ? html`
                                                                                                                    <div class="d-flex align-items-center gap-2 text-muted small py-2">
                                                                                                                        <span class="spinner-border spinner-border-sm"></span> Loading storage options…
                                                                                                                    </div>
                                                                                                                ` : html`
                                                                                                                    <div class="row g-2 align-items-start">
                                                                                                                        <div class="col-md-4">
                                                                                                                            <label class="form-label">Target Region</label>
                                                                                                                            <select class="form-select" value=${migrationSelectedRegion} onChange=${(e) => setMigrationSelectedRegion(e.target.value)}>
                                                                                                                                ${storageCatalog?.regions
                                                                                                                                    ? storageCatalog.regions.map(r => html`<option value=${r.regionCode}>${r.regionCode} — ${r.location}</option>`)
                                                                                                                                    : renderRegionOptions()}
                                                                                                                            </select>
                                                                                                                        </div>
                                                                                                                        <div class="col-md-4">
                                                                                                                            <label class="form-label">Shared Storage Account</label>
                                                                                                                            <input
                                                                                                                                type="text"
                                                                                                                                class="form-control"
                                                                                                                                value=${(() => {
                                                                                                                                    if (migrationCreateDedicated) return '';
                                                                                                                                    const opt = (storageCatalog?.regions || []).find(r => r.regionCode === migrationSelectedRegion);
                                                                                                                                    return opt?.sharedAccountName || '';
                                                                                                                                })()
                                                                                                                                }
                                                                                                                                disabled
                                                                                                                                placeholder=${migrationCreateDedicated ? 'New dedicated account will be provisioned' : 'Select a region'}
                                                                                                                            />
                                                                                                                            <small class="text-muted">${storageCatalog?.orgType ? `${storageCatalog.orgType} pool` : (isPersonalOrg(selectedOrg) ? 'Personal pool' : 'Business pool')}</small>
                                                                                                                        </div>
                                                                                                                        <div class="col-md-4 d-flex flex-column justify-content-end">
                                                                                                                            <div class="form-check mb-2">
                                                                                                                                <input class="form-check-input" type="checkbox" id="chkCreateDedicated"
                                                                                                                                    checked=${migrationCreateDedicated}
                                                                                                                                    onChange=${(e) => setMigrationCreateDedicated(e.target.checked)} />
                                                                                                                                <label class="form-check-label" for="chkCreateDedicated">Provision dedicated account instead</label>
                                                                                                                            </div>
                                                                                                                            ${migrationCreateDedicated && html`
                                                                                                                                <div class="alert alert-info py-2 mb-2 small">
                                                                                                                                    <i class="ti ti-info-circle me-1"></i>A new dedicated storage account will be provisioned in <strong>${migrationSelectedRegion}</strong> and the migration will target it automatically.
                                                                                                                                </div>
                                                                                                                            `}
                                                                                                                            <button
                                                                                                                                class="btn btn-primary"
                                                                                                                                onClick=${handleScheduleMigration}
                                                                                                                                disabled=${migrationLoading}
                                                                                                                            >
                                                                                                                                ${migrationLoading
                                                                                                                                    ? html`<span class="spinner-border spinner-border-sm me-2"></span>`
                                                                                                                                    : html`<i class="ti ti-transfer me-1"></i>`}
                                                                                                                                Schedule Migration
                                                                                                                            </button>
                                                                                                                        </div>
                                                                                                                    </div>
                                                                                                                `}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    <!-- Migration History -->
                                                                                                    <div class="col-12">
                                                                                                        <div class="d-flex justify-content-between align-items-center mb-2">
                                                                                                            <h5 class="m-0">Migration History</h5>
                                                                                                            <button class="btn btn-sm btn-outline-secondary" onClick=${() => loadMigrationJobs(selectedOrgId)}>
                                                                                                                <i class="ti ti-refresh me-1"></i>Refresh
                                                                                                            </button>
                                                                                                        </div>
                                                                                                        <div class="table-responsive border rounded" style="font-size: 13px;">
                                                                                                            <table class="table table-vcenter card-table table-sm mb-0">
                                                                                                                <thead>
                                                                                                                    <tr>
                                                                                                                        <th>Source Account</th>
                                                                                                                        <th>Target Account</th>
                                                                                                                        <th>Kind</th>
                                                                                                                        <th>Region</th>
                                                                                                                        <th>Progress</th>
                                                                                                                        <th>Status</th>
                                                                                                                        <th>Scheduled</th>
                                                                                                                    </tr>
                                                                                                                </thead>
                                                                                                                <tbody>
                                                                                                                    ${migrationJobs.length > 0 ? migrationJobs.map(job => html`
                                                                                                                        <tr>
                                                                                                                            <td class="text-muted small">${job.sourceStorageAccount || html`<span class="fst-italic">platform default</span>`}</td>
                                                                                                                            <td class="fw-semibold small">${job.targetStorageAccount || '-'}</td>
                                                                                                                            <td>
                                                                                                                                ${job.targetAccountKind
                                                                                                                                    ? html`<span class=${`badge ${
                                                                                                                                        job.targetAccountKind === 'Dedicated' ? 'bg-purple text-white' :
                                                                                                                                        job.targetAccountKind === 'SharedPersonal' ? 'bg-info text-white' :
                                                                                                                                        job.targetAccountKind === 'SharedEducation' ? 'bg-warning text-white' :
                                                                                                                                        'bg-primary text-white'
                                                                                                                                    }`}>${
                                                                                                                                        job.targetAccountKind === 'Dedicated' ? 'Dedicated' :
                                                                                                                                        job.targetAccountKind === 'SharedPersonal' ? 'Shared Personal' :
                                                                                                                                        job.targetAccountKind === 'SharedEducation' ? 'Shared Education' :
                                                                                                                                        'Shared Business'
                                                                                                                                    }</span>`
                                                                                                                                    : html`<span class="text-muted small">-</span>`}
                                                                                                                            </td>
                                                                                                                            <td>
                                                                                                                                ${job.targetOrgRegion
                                                                                                                                    ? html`<span class="badge bg-blue-lt text-blue">${job.targetOrgRegion}</span>`
                                                                                                                                    : html`<span class="text-muted small">unchanged</span>`}
                                                                                                                            </td>
                                                                                                                            <td>
                                                                                                                                <div class="small">${job.copiedBlobs ?? 0} / ${job.totalBlobs ?? '?'} blobs</div>
                                                                                                                                ${(job.totalBlobs ?? 0) > 0 ? html`
                                                                                                                                    <div class="progress progress-sm mt-1" style="width: 80px;">
                                                                                                                                        <div class="progress-bar" style="width: ${Math.round(((job.copiedBlobs ?? 0) / job.totalBlobs) * 100)}%"></div>
                                                                                                                                    </div>
                                                                                                                                ` : ''}
                                                                                                                            </td>
                                                                                                                            <td>
                                                                                                                                <span class=${`badge ${
                                                                                                                                    job.status === 'Complete' ? 'bg-success' :
                                                                                                                                    job.status === 'Failed' ? 'bg-danger' :
                                                                                                                                    job.status === 'InProgress' ? 'bg-primary text-white' :
                                                                                                                                    'bg-secondary'
                                                                                                                                }`}>${job.status || 'Pending'}</span>
                                                                                                                                ${job.errorMessage ? html`<div class="text-danger small mt-1">${job.errorMessage}</div>` : ''}
                                                                                                                            </td>
                                                                                                                            <td class="text-muted small">${job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '-'}</td>
                                                                                                                        </tr>
                                                                                                                    `) : html`
                                                                                                                        <tr><td colspan="7" class="text-center py-3 text-muted small">No migration jobs for this organization</td></tr>
                                                                                                                    `}
                                                                                                                </tbody>
                                                                                                            </table>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            `}

                                                                                            <!-- ── Tab: Danger Zone ── -->
                                                                                            ${activeManageTab === 'danger' && html`
                                                                                                <div>
                                                                                                    <div class="alert alert-warning mb-3">
                                                                                                        <i class="ti ti-alert-triangle me-2"></i>
                                                                                                        Actions below permanently affect organization availability and data. They cannot be reversed without manual intervention.
                                                                                                    </div>
                                                                                                    <div class="row g-3">
                                                                                                        <div class="col-md-6">
                                                                                                            <div class=${`card h-100 ${isOrgDisabled(selectedOrg) ? 'border-success' : 'border-warning'}`}>
                                                                                                                <div class="card-body">
                                                                                                                    <h5 class="card-title">${isOrgDisabled(selectedOrg) ? 'Enable Organization' : 'Disable Organization'}</h5>
                                                                                                                    <p class="text-muted small">
                                                                                                                        ${isOrgDisabled(selectedOrg)
                                                                                                                            ? 'Re-enable this organization for normal operations. All licenses and devices will be reactivated.'
                                                                                                                            : 'Disable this organization. All linked licenses will be disabled and all devices will shift to 60-minute heartbeat interval.'}
                                                                                                                    </p>
                                                                                                                    <button class=${`btn btn-${isOrgDisabled(selectedOrg) ? 'success' : 'warning'}`} onClick=${handleToggleStatus}>
                                                                                                                        <i class=${`ti ${isOrgDisabled(selectedOrg) ? 'ti-check' : 'ti-ban'} me-1`}></i>
                                                                                                                        ${isOrgDisabled(selectedOrg) ? 'Enable' : 'Disable'} Organization
                                                                                                                    </button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div class="col-md-6">
                                                                                                            <div class="card h-100 border-danger">
                                                                                                                <div class="card-body">
                                                                                                                    <h5 class="card-title text-danger">Delete Organization</h5>
                                                                                                                    <p class="text-muted small">Permanently removes the organization, all linked licenses, devices, telemetry, and memberships. This action <strong>cannot be undone</strong>.</p>
                                                                                                                    <button class="btn btn-danger" onClick=${handleDeleteOrg}>
                                                                                                                        <i class="ti ti-trash me-1"></i>Delete Organization
                                                                                                                    </button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            `}

                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
            `}

            <!-- ====== SECTION 4: CONFIRMATION & TRANSFER MODALS ====== -->
            
            ${showTransferOwner && selectedOrg && html`
                <!-- Transfer Ownership Modal -->
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

        ${showDisableConfirm && selectedOrg && html`
            <div class="modal modal-blur fade show" style="display: block;" onClick=${() => !orgActionInProgress && setShowDisableConfirm(false)}>
                <div class="modal-dialog modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title text-warning">Disable Organization</h5>
                            <button
                                type="button"
                                class="btn-close"
                                onClick=${() => !orgActionInProgress && setShowDisableConfirm(false)}
                                disabled=${orgActionInProgress}
                            ></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-2">You are about to disable:</p>
                            <p class="fw-semibold mb-3">${selectedOrg.orgName || selectedOrg.orgId}</p>
                            <div class="alert alert-warning mb-0">
                                <div class="fw-semibold mb-1">This action will:</div>
                                <ul class="mb-0 ps-3">
                                    <li>Mark the organization as disabled</li>
                                    <li>Disable all linked licenses for this organization</li>
                                    <li>Disable all linked devices (heartbeat interval shifted to 60 minutes)</li>
                                </ul>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button
                                type="button"
                                class="btn btn-secondary"
                                onClick=${() => setShowDisableConfirm(false)}
                                disabled=${orgActionInProgress}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                class="btn btn-warning"
                                onClick=${confirmDisableOrg}
                                disabled=${orgActionInProgress}
                            >
                                ${orgActionInProgress ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                Disable Organization
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `}

        ${showDeleteConfirm && selectedOrg && html`
            <div class="modal modal-blur fade show" style="display: block;" onClick=${() => !orgActionInProgress && setShowDeleteConfirm(false)}>
                <div class="modal-dialog modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title text-danger">Delete Organization</h5>
                            <button
                                type="button"
                                class="btn-close"
                                onClick=${() => !orgActionInProgress && setShowDeleteConfirm(false)}
                                disabled=${orgActionInProgress}
                            ></button>
                        </div>
                        <div class="modal-body">
                            <p class="mb-2">You are about to permanently delete:</p>
                            <p class="fw-semibold mb-3">${selectedOrg.orgName || selectedOrg.orgId}</p>
                            <div class="alert alert-danger mb-0">
                                <div class="fw-semibold mb-1">This action will permanently remove:</div>
                                <ul class="mb-0 ps-3">
                                    <li>The organization record</li>
                                    <li>All linked licenses</li>
                                    <li>All linked devices and their telemetry</li>
                                    <li>All linked memberships</li>
                                </ul>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button
                                type="button"
                                class="btn btn-secondary"
                                onClick=${() => setShowDeleteConfirm(false)}
                                disabled=${orgActionInProgress}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                class="btn btn-danger"
                                onClick=${confirmDeleteOrg}
                                disabled=${orgActionInProgress}
                            >
                                ${orgActionInProgress ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                Delete Organization
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `}
    `;
}
