/**
 * Profitability — per-org bundle revenue vs COGS dashboard.
 * Data source: /api/v1/admin/profitability (Wave 3.4 endpoint)
 */

import { api } from '@api';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

const PACKAGES = ['All', 'Business', 'BusinessPlus', 'BusinessUltimate'];
const TIERS    = ['All', 'Team', 'Department', 'Division', 'Custom', 'Unknown'];
const PKG_KEYS  = ['Business', 'BusinessPlus', 'BusinessUltimate'];
const TIER_KEYS = ['Team', 'Department', 'Division', 'Custom'];
const PKG_COLORS = { Business: '#0054a6', BusinessPlus: '#0ca678', BusinessUltimate: '#7c3aed' };

const DEFAULT_BILLING_MODEL = {
    targetGrossMarginPercent: 30,
    monthlyBillingMarkupPercent: 20,
    churnReservePercent: 8,
    fixedOverheadAnnualUsd: {
        githubBilling: 240,
        codeSigningCertificate: 200,
        domain: 10,
        accountingAuditLegal: 1000,
    },
};

const DEFAULT_PRICING_GUIDANCE = [
    { key: 'Personal', label: 'Personal', devicesIncluded: 5, listAnnualUsd: 29, discountedAnnualUsd: 20, packageKey: 'Business', seatTier: 'Team', useObservedCohort: false },
    { key: 'Education', label: 'Education', devicesIncluded: 25, listAnnualUsd: 360, discountedAnnualUsd: 270, packageKey: 'Business', seatTier: 'Department', useObservedCohort: false },
    { key: 'Business', label: 'Business Foundation', devicesIncluded: 10, listAnnualUsdPerDevice: 24, discountedAnnualUsdPerDevice: 24, packageKey: 'Business', seatTier: 'Team' },
    { key: 'BusinessPlus', label: 'Business Premium', devicesIncluded: 25, listAnnualUsdPerDevice: 36, discountedAnnualUsdPerDevice: 36, packageKey: 'BusinessPlus', seatTier: 'Department' },
    { key: 'BusinessUltimate', label: 'Business Ultimate', devicesIncluded: 50, listAnnualUsdPerDevice: 48, discountedAnnualUsdPerDevice: 48, packageKey: 'BusinessUltimate', seatTier: 'Division' },
];

const DEFAULT_AI_USAGE_PROFILES = [
    { key: 'base', label: 'Base', relativeMultiplier: 1.0 },
    { key: 'heavy', label: 'Heavy', relativeMultiplier: 1.35 },
    { key: 'intense', label: 'Intense', relativeMultiplier: 1.75 },
];

function formatUsd(val) {
    if (val === null || val === undefined) return '—';
    return '$' + Number(val).toFixed(4);
}

function formatPct(val) {
    if (val === null || val === undefined) return '—';
    return (Number(val) * 100).toFixed(1) + '%';
}

function marginBadge(margin) {
    const pct = Number(margin) * 100;
    if (pct >= 70) return html`<span class="badge bg-success text-white" title="Healthy gross margin in this scenario">${pct.toFixed(1)}%</span>`;
    if (pct >= 40) return html`<span class="badge bg-warning text-white" title="Acceptable but should be watched">${pct.toFixed(1)}%</span>`;
    if (pct >= 0)  return html`<span class="badge bg-danger text-white" title="Thin margin; close to breakeven">${pct.toFixed(1)}%</span>`;
    return html`<span class="badge bg-dark text-white" title=${`Negative margin / loss: modeled cost exceeds revenue by ${Math.abs(pct).toFixed(1)}% in this scenario.`}>${pct.toFixed(1)}%</span>`;
}

function packageBadge(pkg) {
    const normalized = pkg || 'Business';
    if (normalized === 'BusinessUltimate') return html`<span class="badge bg-purple text-white" style="background:#7c3aed">${normalized}</span>`;
    if (normalized === 'BusinessPlus')     return html`<span class="badge bg-info text-white">${normalized}</span>`;
    return html`<span class="badge bg-secondary text-white">${normalized}</span>`;
}

/**
 * Builds a Package×Tier matrix of avg margin values from the orgs array.
 * Returns: { [pkgKey]: { [tierKey]: { avgMargin, count } } }
 */
function buildMatrix(orgs) {
    const matrix = {};
    for (const pkg of PKG_KEYS) {
        matrix[pkg] = {};
        for (const tier of TIER_KEYS) matrix[pkg][tier] = { sum: 0, count: 0 };
    }
    for (const o of orgs) {
        const pkg  = o.package || 'Business';
        const tier = o.seatTier || null;
        if (pkg && matrix[pkg] && tier && matrix[pkg][tier]) {
            matrix[pkg][tier].sum += (o.estimatedMargin || 0);
            matrix[pkg][tier].count++;
        }
    }
    return matrix;
}

function matrixCellColor(margin) {
    if (margin === null) return '#f8fafc';
    const pct = margin * 100;
    if (pct >= 70) return '#d1fae5';
    if (pct >= 40) return '#fef3c7';
    if (pct >= 0)  return '#fee2e2';
    return '#f1f5f9';
}

function resolveSeatTierByDevices(devices) {
    if (devices <= 10) return 'Team';
    if (devices <= 25) return 'Department';
    if (devices <= 50) return 'Division';
    return 'Custom';
}

function clampMarginRatio(value) {
    const num = Number(value || 0);
    return Math.max(-0.99, Math.min(0.99, num));
}

function computeMarginRatio(revenue, cost) {
    const topLine = Number(revenue || 0);
    const bottomLine = Number(cost || 0);
    return topLine > 0 ? clampMarginRatio((topLine - bottomLine) / topLine) : 0;
}

function getObservedMarginStats(orgs, packageKey, seatTier) {
    const pool = (orgs || []).filter(org => {
        const normalizedPackage = org.package || 'Business';
        const pkgMatch = !packageKey || normalizedPackage === packageKey;
        const tierMatch = !seatTier || !org.seatTier || org.seatTier === seatTier;
        return pkgMatch && tierMatch && Number.isFinite(Number(org.estimatedMargin));
    });

    if (!pool.length) return null;

    const margins = pool.map(org => Number(org.estimatedMargin || 0));
    return {
        count: margins.length,
        avg: clampMarginRatio(margins.reduce((sum, value) => sum + value, 0) / margins.length),
        floor: clampMarginRatio(Math.min(...margins)),
        ceiling: clampMarginRatio(Math.max(...margins)),
    };
}

export function ProfitabilityPage({ snapshot, catalog, displayCcy, billingCcy, convert, ccySymbol }) {
    const [loading, setLoading]         = useState(true);
    const [data, setData]               = useState(null);
    const [error, setError]             = useState(null);
    const [pkgFilter, setPkgFilter]     = useState('All');
    const [tierFilter, setTierFilter]   = useState('All');
    const [sortField, setSortField]     = useState('estimatedMargin');
    const [sortDir, setSortDir]         = useState('asc');   // low-margin first → problems surface first
    const [search, setSearch]           = useState('');
    const [activeTab, setActiveTab]     = useState('matrix');
    const [calculatorPlan, setCalculatorPlan] = useState('Business');
    const [calculatorSeats, setCalculatorSeats] = useState(25);
    const [calculatorBilling, setCalculatorBilling] = useState('annual');
    const [calculatorAiProfile, setCalculatorAiProfile] = useState('base');
    const [calculatorAdditive, setCalculatorAdditive] = useState(true);

    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);

    // Currency-aware formatters (fall back to USD if no props)
    const sym = ccySymbol || '$';
    const conv = convert || ((v) => Number(v || 0));
    const costSourceCcy = (snapshot?.billingCurrencyCode || billingCcy || 'USD').toUpperCase();
    const revenueSourceCcy = (snapshot?.revenueCurrencyCode || 'USD').toUpperCase();

    function formatDisplayNumber(val, decimals = 2) {
        return Number(val || 0).toLocaleString(displayCcy === 'USD' ? 'en-US' : 'en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }

    function fmtCost(val, decimals = 2, sourceCcy = 'USD') {
        if (val === null || val === undefined) return '—';
        return sym + formatDisplayNumber(conv(Number(val), sourceCcy), decimals);
    }

    const businessModel = {
        ...DEFAULT_BILLING_MODEL,
        ...(catalog?.businessModel || {}),
        fixedOverheadAnnualUsd: {
            ...DEFAULT_BILLING_MODEL.fixedOverheadAnnualUsd,
            ...(catalog?.businessModel?.fixedOverheadAnnualUsd || {}),
        },
    };

    const pricingGuidance = Array.isArray(catalog?.pricingGuidance) && catalog.pricingGuidance.length > 0
        ? catalog.pricingGuidance
        : DEFAULT_PRICING_GUIDANCE;

    const aiUsageProfiles = Array.isArray(catalog?.aiUsageProfiles) && catalog.aiUsageProfiles.length > 0
        ? catalog.aiUsageProfiles
        : DEFAULT_AI_USAGE_PROFILES;

    const loadProfitability = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (pkgFilter  !== 'All') params.package  = pkgFilter;
            if (tierFilter !== 'All') params.seatTier = tierFilter;
            const resp = await api.get('/api/v1/admin/profitability/', params);
            if (!resp?.success) throw new Error(resp?.message || 'API error');
            setData(resp.data);
        } catch (ex) {
            logger.error('[Profitability] load failed', ex);
            setError(ex.message || 'Failed to load profitability data');
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when filters change
    useEffect(() => { loadProfitability(); }, [pkgFilter, tierFilter]);

    // Render / update the margin-by-package bar chart whenever data changes
    useEffect(() => {
        if (!chartRef.current || !data?.orgs) return;
        const orgs = data.orgs;

        // Compute avg margin per package across all orgs
        const pkgGroups = {};
        for (const pkg of PKG_KEYS) pkgGroups[pkg] = { sum: 0, count: 0 };
        for (const o of orgs) {
            const p = o.package || 'Business';
            if (p && pkgGroups[p]) {
                pkgGroups[p].sum += (o.estimatedMargin || 0);
                pkgGroups[p].count++;
            }
        }
        const labels = PKG_KEYS.map(p => p.replace('Business', 'Business\n'));
        const values = PKG_KEYS.map(p => pkgGroups[p].count ? +(pkgGroups[p].sum / pkgGroups[p].count * 100).toFixed(1) : null);

        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
        }

        const Chart = window.Chart;
        if (!Chart) return;

        chartInstanceRef.current = new Chart(chartRef.current, {
            type: 'bar',
            data: {
                labels: PKG_KEYS,
                datasets: [{
                    label: 'Avg Gross Margin (%)',
                    data: values,
                    backgroundColor: PKG_KEYS.map(p => PKG_COLORS[p] + 'cc'),
                    borderColor: PKG_KEYS.map(p => PKG_COLORS[p]),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw !== null ? `${ctx.raw}%` : 'No data'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [data]);

    const orgs = (data?.orgs || []).filter(o => {
        if (!search) return true;
        return (o.orgId || '').toLowerCase().includes(search.toLowerCase());
    });

    // Client-side sort
    const sorted = [...orgs].sort((a, b) => {
        const av = a[sortField] ?? 0;
        const bv = b[sortField] ?? 0;
        return sortDir === 'asc' ? av - bv : bv - av;
    });

    const sizeTierDiscounts = (catalog?.sizeTiers || []).reduce((acc, tier) => {
        acc[tier.key] = Number(tier.discountPercent || 0);
        return acc;
    }, {});

    const fixedOverheads = businessModel.fixedOverheadAnnualUsd || {};
    const gitHubBilling = snapshot?.costDetail?.gitHubBilling || snapshot?.gitHubBilling || {};
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const githubBaseMonthlyUsd = Number(gitHubBilling.recurringSubscriptionMonthlyUsd || 0) > 0
        ? Number(gitHubBilling.recurringSubscriptionMonthlyUsd || 0)
        : (Number(fixedOverheads.githubBilling || fixedOverheads.github || 0) / 12);
    const githubMonthlyRunRateUsd = Number(gitHubBilling.monthlyRunRateUsd || 0) > 0
        ? Number(gitHubBilling.monthlyRunRateUsd || 0)
        : githubBaseMonthlyUsd;
    const latestGitHubPayment = [...(gitHubBilling.paymentHistory || [])]
        .filter(item => item?.month && item.month !== currentMonthKey)
        .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0] || null;
    const annualOpsCostUsd = (githubMonthlyRunRateUsd * 12)
        + Number(fixedOverheads.codeSigningCertificate || 0)
        + Number(fixedOverheads.domain || 0)
        + Number(fixedOverheads.accountingAuditLegal || fixedOverheads.accounting || 0);
    const monthlyOpsCost = conv(annualOpsCostUsd / 12, 'USD');
    const monthlyAzureCost = conv(Number(snapshot?.totalCost || 0), costSourceCcy);
    const loadedMonthlyCost = monthlyAzureCost + monthlyOpsCost;
    const activeDeviceCount = Math.max(1, Number(snapshot?.activeDevices || snapshot?.totalDevices || snapshot?.totalSeenDevices || 0));
    const currentVariableMonthlyCostPerDevice = activeDeviceCount > 0 ? (monthlyAzureCost / activeDeviceCount) : 0;
    const investor = snapshot?.costDetail?.investorCostSummary || {};
    const avgObservedVariableMonthlyCostPerDevice = Number(investor.avgDailyCostPerDevice || 0) > 0
        ? conv(Number(investor.avgDailyCostPerDevice || 0) * 30, costSourceCcy)
        : currentVariableMonthlyCostPerDevice;
    const maxObservedVariableMonthlyCostPerDevice = Number(investor.maxDailyCostPerDevice || 0) > 0
        ? conv(Number(investor.maxDailyCostPerDevice || 0) * 30, costSourceCcy)
        : (avgObservedVariableMonthlyCostPerDevice * 1.35);
    const avgMonthlyLoadedCostPerDevice = currentVariableMonthlyCostPerDevice + (monthlyOpsCost / activeDeviceCount);
    const aiMonthlyCost = Object.entries(snapshot?.costDetail?.monthlyCostByService || {})
        .filter(([service]) => /openai|ai|cognitive/i.test(service || ''))
        .reduce((sum, [, value]) => sum + conv(Number(value || 0), costSourceCcy), 0);
    const aiShareRatio = monthlyAzureCost > 0 ? (aiMonthlyCost / monthlyAzureCost) : 0.08;
    const monthlyMarkupPercent = Number(businessModel.monthlyBillingMarkupPercent || 20);
    const churnReservePercent = Number(businessModel.churnReservePercent || 8);
    const targetGrossMarginPercent = Number(businessModel.targetGrossMarginPercent || 30);

    const pricingRows = pricingGuidance.map(entry => {
        const devicesIncluded = Number(entry.devicesIncluded || entry.defaultSeats || 0);
        const seatTier = entry.seatTier || resolveSeatTierByDevices(devicesIncluded);
        const packageKey = entry.packageKey || entry.key || 'Business';
        const listAnnual = entry.listAnnualUsd != null
            ? conv(Number(entry.listAnnualUsd || 0), 'USD')
            : conv(Number(entry.listAnnualUsdPerDevice || 0) * devicesIncluded, 'USD');
        const discountAnnual = entry.discountedAnnualUsd != null
            ? conv(Number(entry.discountedAnnualUsd || 0), 'USD')
            : entry.discountedAnnualUsdPerDevice != null
                ? conv(Number(entry.discountedAnnualUsdPerDevice || 0) * devicesIncluded, 'USD')
                : listAnnual;
        const monthlyBilled = (discountAnnual / 12) * (1 + (monthlyMarkupPercent / 100));
        const insuranceReserve = monthlyBilled * (churnReservePercent / 100);
        const fixedCostShareAnnual = (monthlyOpsCost * 12) * (devicesIncluded / activeDeviceCount);
        const staticAnnualCost = (currentVariableMonthlyCostPerDevice * devicesIncluded * 12) + fixedCostShareAnnual;
        const runningAnnualCost = (avgObservedVariableMonthlyCostPerDevice * devicesIncluded * 12) + fixedCostShareAnnual;
        const stressAnnualCost = (maxObservedVariableMonthlyCostPerDevice * devicesIncluded * 12) + fixedCostShareAnnual;
        const useObservedCohort = entry.useObservedCohort !== undefined
            ? !!entry.useObservedCohort
            : ['Business', 'BusinessPlus', 'BusinessUltimate'].includes(packageKey);
        const observed = useObservedCohort ? getObservedMarginStats(data?.orgs || [], packageKey, seatTier) : null;

        return {
            ...entry,
            label: entry.label || entry.key,
            packageKey,
            seatTier,
            devicesIncluded,
            listAnnual,
            discountAnnual,
            monthlyBilled,
            insuranceReserve,
            breakEvenPerDevice: devicesIncluded > 0 ? (staticAnnualCost / 12 / devicesIncluded) : 0,
            staticMargin: computeMarginRatio(discountAnnual, staticAnnualCost),
            runningMargin: observed?.avg ?? computeMarginRatio(discountAnnual, runningAnnualCost),
            stressMargin: observed?.floor ?? computeMarginRatio(discountAnnual, stressAnnualCost),
            observedCount: observed?.count || 0,
        };
    });

    const baseBusinessAnnualPerDevice = (() => {
        const businessGuide = pricingRows.find(row => row.key === 'Business') || pricingRows.find(row => row.packageKey === 'Business');
        if (businessGuide?.devicesIncluded > 0) return businessGuide.discountAnnual / businessGuide.devicesIncluded;
        return conv(24, 'USD');
    })();

    const sizeRealityRows = [10, 25, 50, 1000, 10000, 100000].map(devices => {
        const seatTier = resolveSeatTierByDevices(devices);
        const discountPercent = Number(sizeTierDiscounts[seatTier] || 0);
        const annualRevenue = baseBusinessAnnualPerDevice * devices * (1 - (discountPercent / 100));
        const fixedMonthlyAtScale = monthlyOpsCost;
        const staticAnnualCost = (currentVariableMonthlyCostPerDevice * devices + fixedMonthlyAtScale) * 12;
        const runningAnnualCost = (avgObservedVariableMonthlyCostPerDevice * devices + fixedMonthlyAtScale) * 12;
        const stressAnnualCost = (maxObservedVariableMonthlyCostPerDevice * devices + fixedMonthlyAtScale) * 12;
        const observed = getObservedMarginStats(data?.orgs || [], 'Business', seatTier);

        return {
            devices,
            seatTier,
            annualRevenue,
            breakEvenPerDevice: devices > 0 ? (staticAnnualCost / 12 / devices) : 0,
            staticMargin: computeMarginRatio(annualRevenue, staticAnnualCost),
            runningMargin: observed?.avg ?? computeMarginRatio(annualRevenue, runningAnnualCost),
            stressMargin: observed?.floor ?? computeMarginRatio(annualRevenue, stressAnnualCost),
            observedCount: observed?.count || 0,
        };
    });

    const aiSensitivityRows = PKG_KEYS.map(pkgKey => {
        const guidance = pricingRows.find(row => row.key === pkgKey) || pricingRows.find(row => row.packageKey === pkgKey);
        if (!guidance) return null;

        const annualRevenue = guidance.discountAnnual;
        const deviceCount = Math.max(1, guidance.devicesIncluded || 1);

        return {
            label: guidance.label,
            deviceCount,
            profiles: aiUsageProfiles.map(profile => {
                const loadMultiplier = 1 + (Math.max(0, aiShareRatio) * Math.max(0, Number(profile.relativeMultiplier || 1) - 1));
                const fixedCostShareAnnual = (monthlyOpsCost * 12) * (deviceCount / activeDeviceCount);
                const annualCost = (avgObservedVariableMonthlyCostPerDevice * deviceCount * 12 * loadMultiplier) + fixedCostShareAnnual;
                return {
                    label: profile.label,
                    margin: computeMarginRatio(annualRevenue, annualCost),
                };
            })
        };
    }).filter(Boolean);

    const calculatorGuide = pricingRows.find(row => row.key === calculatorPlan) || pricingRows.find(row => row.packageKey === calculatorPlan) || pricingRows[0];
    const calculatorProfile = aiUsageProfiles.find(profile => profile.key === calculatorAiProfile) || aiUsageProfiles[0];
    const calculatorDeviceCount = Math.max(1, Number(calculatorSeats || calculatorGuide?.devicesIncluded || 1));
    const annualPerDevice = calculatorGuide?.devicesIncluded > 0
        ? (Number(calculatorGuide.discountAnnual || 0) / Number(calculatorGuide.devicesIncluded || 1))
        : 0;
    const calculatorAnnualRevenue = annualPerDevice * calculatorDeviceCount;
    const calculatorMonthlyRevenue = (calculatorAnnualRevenue / 12) * (calculatorBilling === 'monthly' ? (1 + monthlyMarkupPercent / 100) : 1);
    const currentPlatformMrr = conv(Number(snapshot?.mrr || 0), revenueSourceCcy);
    const incrementalStaticMonthlyCost = currentVariableMonthlyCostPerDevice * calculatorDeviceCount;
    const incrementalRunningMonthlyCost = avgObservedVariableMonthlyCostPerDevice * calculatorDeviceCount;
    const incrementalStressMonthlyCost = (maxObservedVariableMonthlyCostPerDevice * calculatorProfile.relativeMultiplier) * calculatorDeviceCount;
    const plannerFixedMonthlyCost = calculatorAdditive ? 0 : monthlyOpsCost;
    const calcFixedCostAnnual = plannerFixedMonthlyCost * 12;
    const calcStaticAnnualCost = (incrementalStaticMonthlyCost * 12) + calcFixedCostAnnual;
    const calcRunningAnnualCost = (incrementalRunningMonthlyCost * 12) + calcFixedCostAnnual;
    const calcStressAnnualCost = (incrementalStressMonthlyCost * 12) + calcFixedCostAnnual;
    const calculatorStaticMargin = computeMarginRatio(calculatorAnnualRevenue, calcStaticAnnualCost);
    const calculatorRunningMargin = computeMarginRatio(calculatorAnnualRevenue, calcRunningAnnualCost);
    const calculatorStressMargin = computeMarginRatio(calculatorAnnualRevenue, calcStressAnnualCost);
    const calculatorBreakevenMonthly = calculatorDeviceCount > 0
        ? ((incrementalStaticMonthlyCost + plannerFixedMonthlyCost) / calculatorDeviceCount)
        : 0;
    const blendedMonthlyRevenue = currentPlatformMrr + calculatorMonthlyRevenue;
    const blendedRunningProfit = blendedMonthlyRevenue - (loadedMonthlyCost + incrementalRunningMonthlyCost);
    const standaloneRunningProfit = calculatorMonthlyRevenue - (calcRunningAnnualCost / 12);
    const plannerMonthlyProfitImpact = calculatorAdditive
        ? (calculatorMonthlyRevenue - incrementalRunningMonthlyCost)
        : standaloneRunningProfit;
    const plannerMarginAfterAdd = calculatorAdditive
        ? computeMarginRatio(blendedMonthlyRevenue, loadedMonthlyCost + incrementalRunningMonthlyCost)
        : calculatorRunningMargin;

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const sortIcon = (field) => {
        if (sortField !== field) return html`<i class="ti ti-arrows-sort text-muted ms-1" style="font-size:.75rem"></i>`;
        return html`<i class="ti ${sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} text-primary ms-1" style="font-size:.75rem"></i>`;
    };

    if (error) {
        return html`
            <div class="alert alert-danger d-flex align-items-center mt-3">
                <i class="ti ti-alert-triangle me-2"></i>
                ${error}
                <button class="btn btn-sm btn-outline-danger ms-auto" onClick=${loadProfitability}>Retry</button>
            </div>
        `;
    }

    return html`
        <div class="profitability-page">

            ${!loading && data?.scopeNote ? html`
                <div class="alert alert-info mb-3">
                    <div class="fw-semibold">Profitability scope</div>
                    <div class="small text-muted">${data.scopeNote} COGS comes from DAILY_COST org allocation rows first, then historical allocation fallback.</div>
                </div>
            ` : null}

            <!-- KPI row -->
            <div class="row g-3 mb-4">
                ${loading ? html`
                    ${[0,1,2].map(() => html`
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body placeholder-glow">
                                    <span class="placeholder col-6 mb-2"></span>
                                    <span class="placeholder col-4 d-block" style="height:2rem"></span>
                                </div>
                            </div>
                        </div>
                    `)}
                ` : html`
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="subheader">Business Daily Revenue</div>
                                <div class="h1 mb-0">${fmtCost(data?.totalDailyRevenue, 2)}</div>
                                <div class="text-muted small">Licensed-seat model · ${data?.totalOrgs ?? 0} orgs tracked</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="subheader">Allocated Daily COGS</div>
                                <div class="h1 mb-0">${fmtCost(data?.totalDailyCost, 2)}</div>
                                <div class="text-muted small">Latest completed daily cost allocation attributed across the filtered customer base</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="subheader">Overall Gross Margin</div>
                                <div class="h1 mb-0">${formatPct(data?.overallMargin)}</div>
                                <div class="text-muted small">Average across filtered orgs</div>
                            </div>
                        </div>
                    </div>
                `}
            </div>

            ${!loading && html`
                <div class="card mb-3 border-0 shadow-sm" style="background:linear-gradient(135deg, rgba(37,99,235,.08), rgba(124,58,237,.06));">
                    <div class="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
                        <span class="text-muted small fw-semibold me-2">Business views</span>
                        <button class=${`btn btn-sm ${activeTab === 'matrix' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick=${() => setActiveTab('matrix')}>Live Org Matrix</button>
                        <button class=${`btn btn-sm ${activeTab === 'guide' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick=${() => setActiveTab('guide')}>Pricing Guide</button>
                        <button class=${`btn btn-sm ${activeTab === 'calculator' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick=${() => setActiveTab('calculator')}>Scenario Planner</button>
                    </div>
                </div>
            `}

            ${!loading && activeTab === 'guide' && html`
                <div class="row g-3 mb-4">
                    <div class="col-lg-5">
                        <div class="card h-100">
                            <div class="card-header">
                                <div class="card-title">Loaded cost inputs</div>
                            </div>
                            <div class="card-body p-0">
                                <table class="table table-sm card-table mb-0">
                                    <tbody>
                                        <tr><td>Azure spend (MTD)</td><td class="text-end font-monospace">${fmtCost(Number(snapshot?.totalCost || 0), 2, costSourceCcy)}</td></tr>
                                        <tr><td>${gitHubBilling.hasLiveMonthlyCost ? 'GitHub monthly run-rate' : 'GitHub recurring subscription / run-rate'}</td><td class="text-end font-monospace">${fmtCost(githubMonthlyRunRateUsd, 2, 'USD')}</td></tr>
                                        ${latestGitHubPayment ? html`<tr><td>Latest settled GitHub bill (${latestGitHubPayment.month})</td><td class="text-end font-monospace">${fmtCost(Number(latestGitHubPayment.totalUsd || 0), 2, 'USD')}</td></tr>` : null}
                                        <tr><td>Code signing certificate</td><td class="text-end font-monospace">${fmtCost(Number(fixedOverheads.codeSigningCertificate || 0), 0)}</td></tr>
                                        <tr><td>Domain</td><td class="text-end font-monospace">${fmtCost(Number(fixedOverheads.domain || 0), 0)}</td></tr>
                                        <tr><td>Accounting / audit / legal</td><td class="text-end font-monospace">${fmtCost(Number(fixedOverheads.accountingAuditLegal || fixedOverheads.accounting || 0), 0)}</td></tr>
                                        <tr><td class="fw-semibold">Loaded monthly run-rate</td><td class="text-end font-monospace fw-semibold">${fmtCost(loadedMonthlyCost, 2, displayCcy)}</td></tr>
                                        <tr><td class="fw-semibold">Breakeven / active device</td><td class="text-end font-monospace fw-semibold">${sym}${avgMonthlyLoadedCostPerDevice.toFixed(2)}/mo</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-7">
                        <div class="card h-100">
                            <div class="card-header">
                                <div class="card-title">Billing guidance</div>
                            </div>
                            <div class="card-body">
                                <div class="d-flex flex-wrap gap-2 mb-3">
                                    <span class="badge bg-primary text-white">Target margin ${targetGrossMarginPercent}%</span>
                                    <span class="badge bg-info text-white">Monthly billing uplift +${monthlyMarkupPercent}%</span>
                                    <span class="badge bg-dark text-white">Reserve / insurance +${churnReservePercent}%</span>
                                    <span class="badge bg-purple text-white">AI share ${(aiShareRatio * 100).toFixed(1)}%</span>
                                    <span class="badge bg-secondary text-white">GitHub ${fmtCost(githubMonthlyRunRateUsd, 2, 'USD')}/mo</span>
                                    ${latestGitHubPayment ? html`<span class="badge bg-warning text-white">Last bill ${fmtCost(Number(latestGitHubPayment.totalUsd || 0), 2, 'USD')} (${latestGitHubPayment.month})</span>` : null}
                                    ${gitHubBilling?.aiProvider?.enabled ? html`<span class="badge bg-secondary text-white">GitHub Models ${gitHubBilling.aiProvider.model || 'enabled'}</span>` : null}
                                </div>
                                <p class="text-muted small mb-2">
                                    <strong>Static</strong> = the current blended cost model using Azure cost per device plus allocated fixed overhead. <strong>Running</strong> = observed live economics from comparable orgs when available, otherwise a modeled steady-state case. <strong>Stress</strong> = a conservative scenario with elevated signal volume and heavier AI usage.
                                </p>
                                <p class="text-muted small mb-0">
                                    Negative values mean the plan is <strong>below breakeven</strong> in that scenario. GitHub expense now blends the recurring Copilot Pro subscription, saved payment history, and any live metered usage the current token can read.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header">
                        <div class="card-title">License guidance table</div>
                        <div class="card-options text-muted small">List vs annual billed vs realistic margin</div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table table-sm">
                            <thead>
                                <tr>
                                    <th title="Bundle or edition reference row">Plan</th>
                                    <th class="text-end" title="Reference list price before discounting">List</th>
                                    <th class="text-end" title="Annual billed price after the intended discount">Annual billed</th>
                                    <th class="text-end" title="Indicative month-to-month price after applying the monthly billing premium">Monthly billed</th>
                                    <th class="text-end" title="Baseline margin using current blended cost plus fixed overhead allocation">Static</th>
                                    <th class="text-end" title="Average-use margin based on similar live orgs or current average usage">Running</th>
                                    <th class="text-end" title="Conservative scenario using elevated signal volume and heavier AI traffic">Stress</th>
                                    <th class="text-end" title="How much real cohort data exists behind the estimate">Observed</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pricingRows.map(row => html`
                                    <tr>
                                        <td>
                                            <div class="fw-semibold">${row.label}</div>
                                            <div class="text-muted small">${Number(row.devicesIncluded).toLocaleString()} devices · breakeven ${sym}${row.breakEvenPerDevice.toFixed(2)}/device/mo</div>
                                        </td>
                                        <td class="text-end font-monospace">${fmtCost(row.listAnnual, 0, displayCcy)}</td>
                                        <td class="text-end font-monospace">${fmtCost(row.discountAnnual, 0, displayCcy)}</td>
                                        <td class="text-end font-monospace">
                                            ${fmtCost(row.monthlyBilled, 2, displayCcy)}
                                            <div class="text-muted small">+${fmtCost(row.insuranceReserve, 2, displayCcy)} reserve</div>
                                        </td>
                                        <td class="text-end">${marginBadge(row.staticMargin)}</td>
                                        <td class="text-end">${marginBadge(row.runningMargin)}</td>
                                        <td class="text-end">${marginBadge(row.stressMargin)}</td>
                                        <td class="text-end text-muted small">${row.observedCount > 0 ? `${row.observedCount} orgs` : 'modeled'}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                    <div class="card-footer text-muted small">
                        Personal and Education rows are modeled from current platform cost-per-device. Business rows use the same catalog list prices but are cross-checked against live business cohorts when similar orgs exist.
                    </div>
                </div>

                <div class="row g-3 mb-4">
                    <div class="col-lg-7">
                        <div class="card h-100">
                            <div class="card-header">
                                <div class="card-title">Scale economics by footprint</div>
                                <div class="card-options text-muted small">Business Foundation economics from 10 devices to 100k devices</div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-vcenter card-table table-sm mb-0">
                                    <thead>
                                        <tr>
                                            <th>Footprint</th>
                                            <th class="text-end">Annual revenue</th>
                                            <th class="text-end">Static</th>
                                            <th class="text-end">Running</th>
                                            <th class="text-end">Stress</th>
                                            <th class="text-end">Observed</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sizeRealityRows.map(row => html`
                                            <tr>
                                                <td>
                                                    <div class="fw-semibold">${Number(row.devices).toLocaleString()} devices</div>
                                                    <div class="text-muted small">${row.seatTier} tier · breakeven ${sym}${row.breakEvenPerDevice.toFixed(2)}/device/mo</div>
                                                </td>
                                                <td class="text-end font-monospace">${fmtCost(row.annualRevenue, 0, displayCcy)}</td>
                                                <td class="text-end">${marginBadge(row.staticMargin)}</td>
                                                <td class="text-end">${marginBadge(row.runningMargin)}</td>
                                                <td class="text-end">${marginBadge(row.stressMargin)}</td>
                                                <td class="text-end text-muted small">${row.observedCount > 0 ? `${row.observedCount} orgs` : 'modeled'}</td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-5">
                        <div class="card h-100">
                            <div class="card-header">
                                <div class="card-title">AI usage sensitivity</div>
                                <div class="card-options text-muted small">Bundle margins as AI usage rises</div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-vcenter card-table table-sm mb-0">
                                    <thead>
                                        <tr>
                                            <th>Bundle</th>
                                            ${aiUsageProfiles.map(profile => html`<th class="text-end">${profile.label}</th>`)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${aiSensitivityRows.map(row => html`
                                            <tr>
                                                <td>
                                                    <div class="fw-semibold">${row.label}</div>
                                                    <div class="text-muted small">${row.deviceCount} device model</div>
                                                </td>
                                                ${row.profiles.map(profile => html`<td class="text-end">${marginBadge(profile.margin)}</td>`)}
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${!loading && activeTab === 'calculator' && html`
                <div class="row g-3 mb-4">
                    <div class="col-lg-5">
                        <div class="card h-100">
                            <div class="card-header">
                                <div class="card-title">License profitability planner</div>
                                <div class="card-options text-muted small">Choose license type and seats</div>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">License type</label>
                                    <select class="form-select" value=${calculatorPlan} onChange=${(e) => setCalculatorPlan(e.target.value)}>
                                        ${pricingRows.map(row => html`<option value=${row.key}>${row.label}</option>`)}
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Seats / devices</label>
                                    <input type="number" class="form-control" min="1" step="1" value=${String(calculatorSeats)} onInput=${(e) => setCalculatorSeats(Math.max(1, Number(e.target.value || 1)))} />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Billing mode</label>
                                    <div class="btn-group w-100">
                                        <button class=${`btn ${calculatorBilling === 'annual' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick=${() => setCalculatorBilling('annual')}>Annual</button>
                                        <button class=${`btn ${calculatorBilling === 'monthly' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick=${() => setCalculatorBilling('monthly')}>Monthly (+${monthlyMarkupPercent}%)</button>
                                    </div>
                                </div>
                                <div class="mb-3 form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="planner-additive-switch" checked=${calculatorAdditive} onChange=${(e) => setCalculatorAdditive(!!e.target.checked)} />
                                    <label class="form-check-label" for="planner-additive-switch">
                                        Add on top of current run-rate
                                    </label>
                                    <div class="text-muted small">When on, the planner shows how this license improves today's business instead of modeling a standalone tenant.</div>
                                </div>
                                <div>
                                    <label class="form-label">Usage profile</label>
                                    <select class="form-select" value=${calculatorAiProfile} onChange=${(e) => setCalculatorAiProfile(e.target.value)}>
                                        ${aiUsageProfiles.map(profile => html`<option value=${profile.key}>${profile.label}</option>`)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-7">
                        <div class="card h-100">
                            <div class="card-header">
                                <div class="card-title">Projected profitability</div>
                                <div class="card-options text-muted small">Based on current platform economics</div>
                            </div>
                            <div class="card-body">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-4">
                                        <div class="border rounded p-3 h-100">
                                            <div class="subheader">${calculatorAdditive ? 'New license MRR' : 'Projected MRR'}</div>
                                            <div class="h2 mb-1">${fmtCost(calculatorMonthlyRevenue, 2, displayCcy)}</div>
                                            <div class="text-muted small">${calculatorBilling === 'monthly' ? 'monthly-billed scenario' : 'annual contract equivalent'}</div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="border rounded p-3 h-100">
                                            <div class="subheader">Bottomline impact</div>
                                            <div class="h2 mb-1 ${plannerMonthlyProfitImpact >= 0 ? 'text-success' : 'text-danger'}">${plannerMonthlyProfitImpact >= 0 ? '+' : ''}${fmtCost(plannerMonthlyProfitImpact, 2, displayCcy)}</div>
                                            <div class="text-muted small">running scenario per month</div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="border rounded p-3 h-100">
                                            <div class="subheader">Breakeven</div>
                                            <div class="h2 mb-1">${sym}${calculatorBreakevenMonthly.toFixed(2)}</div>
                                            <div class="text-muted small">per device / month</div>
                                        </div>
                                    </div>
                                </div>
                                ${calculatorAdditive && html`
                                    <div class="alert alert-primary py-2 small">
                                        Current MRR ${sym}${currentPlatformMrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → blended MRR ${sym}${blendedMonthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · blended margin ${formatPct(plannerMarginAfterAdd)}
                                    </div>
                                `}
                                <div class="alert alert-light border small mb-3">
                                    <div class="fw-semibold mb-1">How COGS changes</div>
                                    <div>
                                        COGS grows with <strong>device count</strong> and <strong>usage intensity</strong>. In this planner, <strong>Static</strong> uses today's average cloud cost per device, <strong>Running</strong> uses the current observed average from similar orgs, and <strong>Stress</strong> applies heavier AI / noisy-device assumptions. ${calculatorAdditive ? 'Because this is incremental to today\'s platform, fixed overhead is not added again.' : 'Because this is a standalone view, fixed overhead is included once on top of the variable device cost.'}
                                    </div>
                                    <div class="mt-2 text-muted">
                                        Variable COGS ≈ ${fmtCost(incrementalRunningMonthlyCost, 2, displayCcy)}/mo · Fixed overhead ${calculatorAdditive ? 'already covered in current run-rate' : `${fmtCost(monthlyOpsCost, 2, displayCcy)}/mo included`}
                                    </div>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-sm card-table mb-0">
                                        <thead>
                                            <tr>
                                                <th>Scenario</th>
                                                <th class="text-end">${calculatorAdditive ? 'Added annual cost' : 'Annual cost'}</th>
                                                <th class="text-end">Margin</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td title="Simple current-cost model using today's average platform cost per device plus fixed overhead share">Static</td>
                                                <td class="text-end font-monospace">${fmtCost(calcStaticAnnualCost, 0, displayCcy)}</td>
                                                <td class="text-end">${marginBadge(calculatorStaticMargin)}</td>
                                            </tr>
                                            <tr>
                                                <td title="Average-use scenario using the current observed running cost profile from similar organizations">Running</td>
                                                <td class="text-end font-monospace">${fmtCost(calcRunningAnnualCost, 0, displayCcy)}</td>
                                                <td class="text-end">${marginBadge(calculatorRunningMargin)}</td>
                                            </tr>
                                            <tr>
                                                <td title="Stress scenario using noisier devices, heavier AI traffic, and higher per-device cost assumptions">Stress</td>
                                                <td class="text-end font-monospace">${fmtCost(calcStressAnnualCost, 0, displayCcy)}</td>
                                                <td class="text-end">${marginBadge(calculatorStressMargin)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div class="text-muted small mt-3">
                                    Negative percentages mean the modeled cost is higher than the billed amount in that scenario. Hover over the values for details.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            <!-- Charts row -->
            ${!loading && activeTab === 'matrix' && data?.orgs?.length > 0 && (() => {
                const matrix = buildMatrix(data.orgs);
                return html`
                    <div class="row g-3 mb-4">
                        <!-- Package×Tier matrix -->
                        <div class="col-md-7">
                            <div class="card h-100">
                                <div class="card-header">
                                    <div class="card-title">Margin by Package × Tier</div>
                                    <div class="card-options text-muted small">Average gross margin %</div>
                                </div>
                                <div class="card-body p-2">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-bordered text-center mb-0" style="font-size:.8rem">
                                            <thead class="table-light">
                                                <tr>
                                                    <th class="text-start">Package</th>
                                                    ${TIER_KEYS.map(t => html`<th>${t}</th>`)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${PKG_KEYS.map(pkg => html`
                                                    <tr>
                                                        <td class="text-start fw-semibold">${pkg.replace('Business', 'Biz')}</td>
                                                        ${TIER_KEYS.map(tier => {
                                                            const cell = matrix[pkg]?.[tier];
                                                            const avg = cell?.count ? cell.sum / cell.count : null;
                                                            return html`
                                                                <td style="background:${matrixCellColor(avg)}">
                                                                    ${avg !== null
                                                                        ? html`<span class="fw-bold">${(avg * 100).toFixed(0)}%</span><br/><span class="text-muted" style="font-size:.7rem">${cell.count} org${cell.count !== 1 ? 's' : ''}</span>`
                                                                        : html`<span class="text-muted">—</span>`}
                                                                </td>
                                                            `;
                                                        })}
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="d-flex gap-3 mt-2 px-1" style="font-size:.72rem">
                                        <span><span class="d-inline-block me-1 rounded" style="width:12px;height:12px;background:#d1fae5;border:1px solid #6ee7b7"></span>≥70%</span>
                                        <span><span class="d-inline-block me-1 rounded" style="width:12px;height:12px;background:#fef3c7;border:1px solid #fcd34d"></span>40–69%</span>
                                        <span><span class="d-inline-block me-1 rounded" style="width:12px;height:12px;background:#fee2e2;border:1px solid #fca5a5"></span>${'<'}40%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Margin by package bar chart -->
                        <div class="col-md-5">
                            <div class="card h-100">
                                <div class="card-header">
                                    <div class="card-title">Avg Margin by Package</div>
                                </div>
                                <div class="card-body">
                                    <div style="position:relative;height:180px">
                                        <canvas ref=${chartRef}></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })()}

            ${!loading && activeTab === 'matrix' && html`
            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body py-2">
                    <div class="row g-2 align-items-center">
                        <div class="col-auto">
                            <label class="form-label mb-0 me-2 text-muted small">Package</label>
                            <div class="btn-group btn-group-sm">
                                ${PACKAGES.map(p => html`
                                    <button
                                        class="btn ${pkgFilter === p ? 'btn-primary' : 'btn-outline-secondary'}"
                                        onClick=${() => setPkgFilter(p)}>
                                        ${p === 'All' ? 'All Packages' : p}
                                    </button>
                                `)}
                            </div>
                        </div>
                        <div class="col-auto">
                            <label class="form-label mb-0 me-2 text-muted small">Tier</label>
                            <div class="btn-group btn-group-sm">
                                ${TIERS.map(t => html`
                                    <button
                                        class="btn ${tierFilter === t ? 'btn-info' : 'btn-outline-secondary'}"
                                        onClick=${() => setTierFilter(t)}>
                                        ${t}
                                    </button>
                                `)}
                            </div>
                        </div>
                        <div class="col">
                            <input
                                type="text"
                                class="form-control form-control-sm"
                                placeholder="Search org ID…"
                                value=${search}
                                onInput=${e => setSearch(e.target.value)}
                            />
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-sm btn-outline-secondary" onClick=${loadProfitability} disabled=${loading}>
                                <i class="ti ti-refresh me-1"></i> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Table -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        Org Profitability
                        ${!loading && html`<span class="badge bg-secondary-lt text-secondary ms-2">${sorted.length}</span>`}
                    </div>
                    <div class="card-options text-muted small">
                        Sorted by ${sortField} ${sortDir} • Click column header to re-sort
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table table-hover table-sm">
                        <thead>
                            <tr>
                                <th>Org ID</th>
                                <th>Package</th>
                                <th>Tier</th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('licensedSeats')}>
                                    Seats ${sortIcon('licensedSeats')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('activeDevices')}>
                                    Devices ${sortIcon('activeDevices')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('seenDevices')}>
                                    Seen ${sortIcon('seenDevices')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('telemetryVolume')}>
                                    Telemetry ${sortIcon('telemetryVolume')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('dailyRevenueUsd')}>
                                    Daily Rev ${sortIcon('dailyRevenueUsd')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('dailyCostUsd')}>
                                    Daily COGS ${sortIcon('dailyCostUsd')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('estimatedMargin')}>
                                    Margin ${sortIcon('estimatedMargin')}
                                </th>
                                <th class="text-end">Add-ons</th>
                                <th class="text-end">Computed</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${loading ? html`
                                ${Array.from({ length: 6 }).map(() => html`
                                    <tr class="placeholder-glow">
                                        ${Array.from({ length: 12 }).map(() => html`
                                            <td><span class="placeholder col-8"></span></td>
                                        `)}
                                    </tr>
                                `)}
                            ` : sorted.length === 0 ? html`
                                <tr>
                                    <td colspan="12" class="text-center text-muted py-4">
                                        No profitability data yet. Rows are computed by the nightly cron task.
                                    </td>
                                </tr>
                            ` : sorted.map(o => html`
                                <tr>
                                    <td>
                                        <code class="text-reset" style="font-size:.8rem">${o.orgId}</code>
                                    </td>
                                    <td>${packageBadge(o.package)}</td>
                                    <td><span class="text-muted small">${o.seatTier || '—'}</span></td>
                                    <td class="text-end">${o.licensedSeats ?? '—'}</td>
                                    <td class="text-end">${o.activeDevices ?? '—'}</td>
                                    <td class="text-end">${o.seenDevices > 0 ? o.seenDevices : html`<span class="text-muted">—</span>`}</td>
                                    <td class="text-end font-monospace small">${o.telemetryVolume > 0 ? Number(o.telemetryVolume).toLocaleString() : html`<span class="text-muted">—</span>`}</td>
                                    <td class="text-end font-monospace small">${fmtCost(o.dailyRevenueUsd, 2)}</td>
                                    <td class="text-end font-monospace small">${fmtCost(o.dailyCostUsd, 2)}</td>
                                    <td class="text-end">${marginBadge(o.estimatedMargin)}</td>
                                    <td class="text-end">
                                        ${o.enabledAddOnsCount > 0
                                            ? html`<span class="badge bg-purple-lt text-purple" style="--tblr-purple:#7c3aed">${o.enabledAddOnsCount}</span>`
                                            : html`<span class="text-muted">—</span>`}
                                    </td>
                                    <td class="text-end text-muted small">
                                        ${o.computedAt ? new Date(o.computedAt).toLocaleString() : '—'}
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
                ${data?.generatedAt && html`
                    <div class="card-footer text-muted small text-end">
                        Fetched ${new Date(data.generatedAt).toLocaleString()}
                    </div>
                `}
            </div>
            `}
        </div>
    `;
}
