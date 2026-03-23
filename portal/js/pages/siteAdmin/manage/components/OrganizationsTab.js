/**
 * Site Admin - Organizations Tab Component
 * Full-featured organization management: create, filter, paginate, manage, transfer ownership
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
    const [showCreateAiContext, setShowCreateAiContext] = useState(false);
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
    const [updateTodaySnapshotRefreshHoursOverride, setUpdateTodaySnapshotRefreshHoursOverride] = useState('');

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
        setUpdateTodaySnapshotRefreshHoursOverride(
            org.todaySnapshotRefreshHoursOverride ?? org.TodaySnapshotRefreshHoursOverride ?? ''
        );
        const orgType = getOrgType(org);
        const defaultTier = getTierOptionsForOrgType(orgType, licenseUxCatalog)[0]?.value || 'Startup';
        setNewLicenseTier(defaultTier);
        setNewLicenseSeats(getLicenseTierConfig(orgType, defaultTier, licenseUxCatalog)?.defaultSeats ?? 20);
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
            nextAuditDate: newNextAuditDate || null
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
            setShowCreateAiContext(false);
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
    const selectedOrgType = updateOrgType || getOrgType(selectedOrg || {});
    const isSelectedPersonal = selectedOrgType === 'Personal';
    const hasPendingPayment = orgPayments.some((p) => (p.status || '').toLowerCase() === 'pending');
    const createLicenseButtonLabel = isSelectedPersonal && activeLicenseCount >= 1 ? 'Renew' : 'Create';
    const createLicenseButtonTitle = hasPendingPayment
        ? 'A pending payment request already exists for this organization'
        : (isSelectedPersonal && activeLicenseCount >= 1
            ? 'Generate renewal invoice for Personal license'
            : 'Create license');

    return html`
        <div id="organizations">
            <div class="row g-3">
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
                                                    <div class="card-body p-2 d-flex align-items-center gap-2">
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
                                                </div>
                                            </div>
                                        </div>

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

                                    <div class="col-12">
                                        <div class="card border border-light">
                                            <div
                                                class="card-header"
                                                style="cursor: pointer;"
                                                onClick=${() => setShowCreateAiContext(!showCreateAiContext)}
                                            >
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <h5 class="card-title mb-0"><i class="ti ti-brain me-2"></i>AI Context</h5>
                                                    <i class=${`ti ${showCreateAiContext ? 'ti-chevron-down' : 'ti-chevron-right'}`}></i>
                                                </div>
                                            </div>
                                            ${showCreateAiContext && html`
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
                                                        </div>
                                                        <div class="col-md-6">
                                                            <label class="form-label">Organisation Size</label>
                                                            <input
                                                                type="text"
                                                                class="form-control"
                                                                placeholder="e.g. 1-10, 11-50, 50-200"
                                                                value=${newOrgSize}
                                                                onInput=${(e) => setNewOrgSize(e.target.value)}
                                                            />
                                                        </div>
                                                        <div class="col-md-6">
                                                            <label class="form-label">Next Audit Date</label>
                                                            <input
                                                                type="date"
                                                                class="form-control"
                                                                value=${newNextAuditDate}
                                                                onInput=${(e) => setNewNextAuditDate(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                    </div>

                                    <div class="col-12">
                                        <div class="org-create-summary mb-2">
                                            <div class="org-create-summary__item"><span>Type</span><strong>${newOrgType}</strong></div>
                                            <div class="org-create-summary__item"><span>Tier</span><strong>${newOrgLicenseTier}</strong></div>
                                            <div class="org-create-summary__item"><span>Seats</span><strong>${createOrgInvoicePreview.effectiveSeats}</strong></div>
                                            <div class="org-create-summary__item"><span>Days</span><strong>${createOrgInvoicePreview.effectiveDuration}</strong></div>
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
                                </div>
                            </div>
                        `}
                    </div>
                </div>

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
                                                        : html`<small class="text-muted">No credit snapshot</small>`}
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

            <!-- Management Modal -->
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
                                <div class="modal-header">
                                    <h3 class="modal-title">Manage Organization: ${getOrgName(selectedOrg)}</h3>
                                    <button type="button" class="btn-close" onClick=${() => { setSelectedOrg(null); setSelectedOrgId(''); }}></button>
                                </div>

                                <div class="modal-body org-manage-modal__body" style="max-height: 80vh; overflow-y: auto;">
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
                                                                    <input
                                                                        type="radio"
                                                                        name="updateOrgType"
                                                                        value=${opt.value}
                                                                        checked=${updateOrgType === opt.value}
                                                                        onChange=${() => setUpdateOrgType(opt.value)}
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
                                                    <small class="form-text text-muted mt-2 d-block">Changing org type affects license constraints and feature access.</small>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- AI Context -->
                                        <div class="col-12">
                                            <div class="card border border-light">
                                                <div class="card-header">
                                                    <h5 class="card-title mb-0"><i class="ti ti-brain me-2"></i>AI Context</h5>
                                                </div>
                                                <div class="card-body">
                                                    <div class="row g-3">
                                                        <div class="col-md-6">
                                                            <label class="form-label">Industry</label>
                                                            <select
                                                                class="form-select"
                                                                value=${updateIndustry}
                                                                onChange=${(e) => setUpdateIndustry(e.target.value)}
                                                            >
                                                                <option value="">— Select industry —</option>
                                                                ${industryOptions.map(i => html`<option value=${i}>${i}</option>`)}
                                                            </select>
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
                                                        <div class="col-md-6">
                                                            <label class="form-label">Today's Snapshot Refresh Override (hours)</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="24"
                                                                step="1"
                                                                class="form-control"
                                                                placeholder="Use platform default"
                                                                value=${updateTodaySnapshotRefreshHoursOverride}
                                                                onInput=${(e) => setUpdateTodaySnapshotRefreshHoursOverride(e.target.value)}
                                                            />
                                                            <small class="form-text text-muted">Leave blank to use platform default cadence.</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Licenses Section -->
                                        <div class="col-12 mt-3">
                                            <div class="d-flex justify-content-between align-items-center mb-3">
                                                <h5 class="m-0">Licenses</h5>
                                                <button class="btn btn-sm btn-primary" onClick=${() => setShowCreateLicense(true)} disabled=${hasPendingPayment} title=${createLicenseButtonTitle}>
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
                                                                <input
                                                                    type="number"
                                                                    class="form-control form-control-sm"
                                                                    min="1"
                                                                    value=${newLicenseSeats}
                                                                    disabled=${newLicenseTier !== 'Custom' && !(newLicenseTier === demoTierValue && licenseUxCatalog.demoTier?.allowCustomSeats)}
                                                                    onInput=${(e) => setNewLicenseSeats(e.target.value)}
                                                                />
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
                                                        <tr><th>Type</th><th>Key / Email</th><th>Seats</th><th>Credits</th><th>Status</th><th>Created</th><th>Actions</th></tr>
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
                                                        `) : html`<tr><td colspan="7" class="text-center py-3 text-muted small">No licenses</td></tr>`}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <!-- Payment Requests Section -->
                                        <div class="col-12 mt-3">
                                            <div class="d-flex justify-content-between align-items-center mb-3">
                                                <h5 class="m-0">Payment Requests</h5>
                                            </div>
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

                                        <!-- Danger Zone -->
                                        <div class="col-12 mt-4">
                                            <div class="card border-danger">
                                                <div class="card-header bg-danger-lt text-danger" style="cursor: pointer;" onClick=${() => setShowDangerZone(!showDangerZone)}>
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
