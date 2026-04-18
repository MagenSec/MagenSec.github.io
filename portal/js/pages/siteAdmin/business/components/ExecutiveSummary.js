/**
 * ExecutiveSummary — Hero band + financial KPIs + trend charts + revenue/cost donuts.
 * Replaces BusinessMatrix.js. Receives snapshot + history as props from BusinessPage.
 *
 * Props:
 *   snapshot      — PlatformDailySnapshot from API
 *   history       — BusinessHistoryPoint[] (365-day rolling)
 *   displayCcy    — current display currency code
 *   billingCcy    — billing currency code from snapshot
 *   convert       — (value) => converted value helper
 *   ccySymbol     — currency symbol for display
 */
import { KpiCard } from './KpiCard.js';
import {
    formatCurrency, formatCompact, formatPercent, calcTrendPercent,
    getHealthGrade, getMarginInfo, TELEMETRY_LABELS, TELEMETRY_COLORS,
    getRegionLabel, KNOWN_REGION_ORDER, formatNumberByCurrency,
} from '../businessConstants.js';
import {
    destroyChart, doughnutConfig, lineChartConfig, themeColors, CHART_PALETTE,
} from '../businessChartTheme.js';

const { html } = window;
const { useRef, useEffect, useState } = window.preactHooks;

export function ExecutiveSummary({ snapshot, history, catalog, displayCcy, billingCcy, convert, ccySymbol }) {
    if (!snapshot) return null;

    const s = snapshot;
    const [historyRange, setHistoryRange] = useState(90);
    const [costWindow, setCostWindow] = useState(30);
    const [costScale, setCostScale] = useState('linear');
    const [serviceTrendWindow, setServiceTrendWindow] = useState(30);
    const [serviceScale, setServiceScale] = useState('linear');

    // ── Refs ────────────────────────────────────────────────────────
    const revenueChartRef = useRef(null);
    const costChartRef = useRef(null);
    const growthChartRef = useRef(null);
    const costTrendChartRef = useRef(null);
    const serviceTrendChartRef = useRef(null);
    const regionChartRef = useRef(null);

    // ── Derived values ──────────────────────────────────────────────
    const revenueCcy = (s.revenueCurrencyCode || 'USD').toUpperCase();
    const costCcy = (s.billingCurrencyCode || billingCcy || 'USD').toUpperCase();

    const rawMrr = Number(s.mrr || 0);
    const rawArr = Number(s.arr || (rawMrr * 12));
    const rawDailyCost = Number(s.dailyCost || 0);
    const rawMonthlyCost = Number(s.totalCost || 0);

    const mrr = convert(rawMrr, revenueCcy);
    const arr = convert(rawArr, revenueCcy);
    const dailyCost = convert(rawDailyCost, costCcy);
    const monthlyCost = convert(rawMonthlyCost, costCcy);
    const totalOrgs = s.totalOrgs || 0;
    const totalDevices = s.totalDevices || 0;
    const recentDailySnaps = (s.costDetail?.dailySnapshots || []).filter(snap => snap?.date).sort((a, b) => new Date(a.date) - new Date(b.date));
    const seenDevicesLatest = recentDailySnaps.length > 0
        ? (recentDailySnaps[recentDailySnaps.length - 1].topTelemetryOrgs || []).reduce((sum, org) => sum + Number(org.activeDevices || 0), 0)
        : 0;
    const activeDevices = Number(s.totalSeenDevices || seenDevicesLatest || s.activeDevices || 0);
    const totalTelemetry = s.totalTelemetryToday || 0;
    const avgTelemetry7d = Number((s.window7d?.telemetryVolume || 0) / 7) || totalTelemetry;
    const signalUpdatedLabel = s.generatedAt
        ? `Signal updated ${new Date(s.generatedAt).toLocaleString()}`
        : 'Signal intelligence ready';

    const businessModel = catalog?.businessModel || {};
    const fixedOverheads = businessModel.fixedOverheadAnnualUsd || {};
    const gitHubBilling = s.costDetail?.gitHubBilling || s.gitHubBilling || {};
    const gitHubPaymentHistory = Array.isArray(gitHubBilling.paymentHistory) ? gitHubBilling.paymentHistory : [];
    const gitHubDailyExpenses = Array.isArray(gitHubBilling.dailyExpenses) ? gitHubBilling.dailyExpenses : [];
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const latestClosedGitHubPayment = [...gitHubPaymentHistory]
        .filter(item => item?.month && item.month !== currentMonthKey)
        .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0] || null;
    const githubAnnualConfigured = Number(fixedOverheads.githubBilling || fixedOverheads.github || 120);
    const githubBaseMonthlyUsd = Number(gitHubBilling.recurringSubscriptionMonthlyUsd || 0) > 0
        ? Number(gitHubBilling.recurringSubscriptionMonthlyUsd || 0)
        : (githubAnnualConfigured / 12);
    const githubMonthlyRunRateUsd = Number(gitHubBilling.monthlyRunRateUsd || 0) > 0
        ? Number(gitHubBilling.monthlyRunRateUsd || 0)
        : githubBaseMonthlyUsd;
    const codeSigningAnnual = Number(fixedOverheads.codeSigningCertificate || 200);
    const domainAnnual = Number(fixedOverheads.domain || 10);
    const adminAnnual = Number(fixedOverheads.accountingAuditLegal || fixedOverheads.accounting || 1000);
    const annualOverheadUsd = (githubMonthlyRunRateUsd * 12) + codeSigningAnnual + domainAnnual + adminAnnual;
    const monthlyOverhead = convert(annualOverheadUsd / 12, 'USD');
    const gitHubMonthlyExpense = convert(githubMonthlyRunRateUsd, 'USD');
    const expenseMonthlyCost = monthlyCost + gitHubMonthlyExpense;
    const loadedMonthlyCost = monthlyCost + monthlyOverhead;
    const loadedDailyRunRate = dailyCost + (monthlyOverhead / 30);
    const margin = mrr > 0 ? ((mrr - expenseMonthlyCost) / mrr) * 100 : 0;
    const grade = getHealthGrade(margin);
    const marginInfo = getMarginInfo(margin);
    const githubSourceLabel = gitHubBilling.hasLiveMonthlyCost ? 'GitHub live' : 'GitHub run-rate';
    const targetMarginPercent = Number(businessModel.targetGrossMarginPercent || 30);
    const monthlyMarkupPercent = Number(businessModel.monthlyBillingMarkupPercent || 20);
    const churnReservePercent = Number(businessModel.churnReservePercent || 8);
    const breakevenPerActiveDevice = activeDevices > 0 ? loadedMonthlyCost / activeDevices : 0;
    const recommendedPerActiveDevice = breakevenPerActiveDevice > 0
        ? breakevenPerActiveDevice / Math.max(0.05, 1 - (targetMarginPercent / 100))
        : 0;

    // Delta (day-over-day)
    const d = s.delta || {};
    const rawMarginDelta = Number(d.marginChangePoints || 0);
    const marginDeltaDisplay = Math.abs(rawMarginDelta) <= 100 ? rawMarginDelta : null;

    // Window averages
    const w7 = s.window7d || {};
    const avgDailyAzureCost7 = w7.avgCostPerDay ? convert(w7.avgCostPerDay, costCcy) : dailyCost;
    const avgDailyCost7 = avgDailyAzureCost7 + convert(githubMonthlyRunRateUsd / 30, 'USD');

    // Revenue breakdown
    const rb = {
        personal: s.personalMrr || 0,
        education: s.educationMrr || 0,
        business: s.businessMrr || 0,
    };
    const totalRevenue = rb.personal + rb.education + rb.business;

    // Intelligence stats
    const intel = s.intelligenceStats || {};
    const intelCpe = Number(intel.cpeRecords || 0);
    const intelCve = Number(intel.cveRecords || 0);
    const intelTotal = intelCpe + intelCve;

    // Cost breakdown from costDetail
    const costDetail = s.costDetail || {};
    const latestSnap = (costDetail.dailySnapshots || [])
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    // Monthly cost breakdowns (from Azure Cost API — more complete than daily snapshots)
    const monthlyCostByService = costDetail.monthlyCostByService || {};
    const monthlySvcEntries = Object.entries(monthlyCostByService)
        .filter(([, v]) => v > 0.01)
        .sort((a, b) => b[1] - a[1]);
    const monthlyCostByRegion = costDetail.monthlyCostByRegion || {};
    const monthlyRegionEntries = Object.entries(monthlyCostByRegion)
        .filter(([, v]) => v > 0.01)
        .sort((a, b) => b[1] - a[1]);

    // Daily cost trend data for chart — merge costDetail snapshots with long-range history
    const historyCostTrend = (history || [])
        .filter(point => point?.date && Number(point.dailyCost || 0) > 0)
        .map(point => ({
            date: point.date,
            totalCost: Number(point.dailyCost || 0),
            costsByResourceType: {},
            costByRegion: (point.regionBreakdown || []).reduce((acc, region) => {
                const key = region.region || 'unknown';
                acc[key] = (acc[key] || 0) + Number(region.cost || 0);
                return acc;
            }, {})
        }));

    const trendMap = new Map();
    [...historyCostTrend, ...(costDetail.dailySnapshots || [])]
        .filter(snap => snap?.date && Number(snap.totalCost || 0) >= 0)
        .forEach(snap => {
            const key = new Date(snap.date).toISOString().slice(0, 10);
            trendMap.set(key, {
                ...trendMap.get(key),
                ...snap,
                costByRegion: {
                    ...(trendMap.get(key)?.costByRegion || {}),
                    ...(snap.costByRegion || {})
                }
            });
        });

    const dailyCostTrend = Array.from(trendMap.values())
        .filter(snap => Number(snap.totalCost || 0) > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const filteredDailyCostTrend = dailyCostTrend.slice(-Math.max(7, costWindow));
    const dailyServiceCosts = (costDetail.dailyServiceCosts || [])
        .filter(entry => entry?.date && entry?.service)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const uniqueServiceDates = [...new Set(dailyServiceCosts.map(entry => new Date(entry.date).toISOString().slice(0, 10)))];

    const availableGrowthDays = (history || []).length;
    const availableCostDays = dailyCostTrend.length;
    const availableServiceDays = uniqueServiceDates.length;
    const requestedGrowthDays = Math.max(30, historyRange);
    const requestedCostDays = Math.max(7, costWindow);
    const requestedServiceDays = Math.max(1, serviceTrendWindow);
    const actualGrowthDays = Math.min(requestedGrowthDays, availableGrowthDays);
    const actualCostDays = Math.min(requestedCostDays, availableCostDays);
    const actualServiceDays = Math.min(requestedServiceDays, availableServiceDays);
    const serviceBreakdownLabel = monthlySvcEntries.length > 0
        ? '30d billed'
        : `${actualCostDays}d available`;
    const regionBreakdownLabel = monthlyRegionEntries.length > 0
        ? '30d billed'
        : `${actualCostDays}d available`;

    const fallbackServiceTotals = filteredDailyCostTrend.reduce((acc, snap) => {
        Object.entries(snap.costsByResourceType || {}).forEach(([svc, value]) => {
            acc[svc] = (acc[svc] || 0) + Number(value || 0);
        });
        return acc;
    }, {});

    const fallbackSvcEntries = Object.entries(fallbackServiceTotals)
        .filter(([, value]) => value > 0.01)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const attributedRegionEntries = (s.regionBreakdown || [])
        .map(region => [region.region || 'unknown', Number(region.cost || 0)])
        .filter(([, cost]) => cost > 0.01)
        .sort((a, b) => b[1] - a[1]);

    const fallbackRegionTotals = filteredDailyCostTrend.reduce((acc, snap) => {
        Object.entries(snap.costByRegion || {}).forEach(([region, value]) => {
            acc[region] = (acc[region] || 0) + Number(value || 0);
        });
        return acc;
    }, {});

    const historyRegionTotals = (history || []).reduce((acc, point) => {
        (point.regionBreakdown || []).forEach(region => {
            const key = region.region || 'unknown';
            acc[key] = (acc[key] || 0) + Number(region.cost || 0);
        });
        return acc;
    }, {});

    const fallbackRegionEntries = Object.entries(Object.keys(fallbackRegionTotals).length > 0 ? fallbackRegionTotals : historyRegionTotals)
        .sort((a, b) => b[1] - a[1]);

    const serviceEntries = monthlySvcEntries.length > 0 ? monthlySvcEntries : fallbackSvcEntries;

    const regionMap = new Map(KNOWN_REGION_ORDER.map(region => [getRegionLabel(region), 0]));
    [...monthlyRegionEntries, ...attributedRegionEntries, ...fallbackRegionEntries].forEach(([region, value]) => {
        const key = getRegionLabel(region || 'unknown');
        const current = Number(regionMap.get(key) || 0);
        regionMap.set(key, Math.max(current, Number(value || 0)));
    });
    const regionEntries = Array.from(regionMap.entries())
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));

    const serviceTrendDateKeys = uniqueServiceDates.slice(-Math.max(1, serviceTrendWindow));
    const serviceTrendSource = dailyServiceCosts.filter(entry => serviceTrendDateKeys.includes(new Date(entry.date).toISOString().slice(0, 10)));

    // Cost/Revenue ratio
    const mtdCost = expenseMonthlyCost;
    const costRevenueRatio = mrr > 0 ? (mtdCost / mrr) * 100 : 0;

    // AI cost
    const aiServices = ['openai', 'ai', 'cognitive'];
    const aiCostMtd = convert(
        (costDetail.dailySnapshots || [])
            .filter(snap => {
                const d = new Date(snap.date);
                const now = new Date();
                return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
            })
            .reduce((sum, snap) => {
                const byType = snap.costsByResourceType || {};
                return sum + Object.entries(byType)
                    .filter(([k]) => aiServices.some(ai => k.toLowerCase().includes(ai)))
                    .reduce((s, [, v]) => s + Number(v || 0), 0);
            }, 0)
    );
    const aiSharePercent = mtdCost > 0 ? (aiCostMtd / mtdCost) * 100 : 0;
    const gitHubAiEnabled = !!gitHubBilling?.aiProvider?.enabled;
    const gitHubAiModel = gitHubBilling?.aiProvider?.model || '';
    const runRateProfitAnnual = (mrr - loadedMonthlyCost) * 12;
    const krToneStyles = {
        good: 'linear-gradient(135deg,#16a34a,#22c55e)',
        watch: 'linear-gradient(135deg,#d97706,#f59e0b)',
        risk: 'linear-gradient(135deg,#dc2626,#ef4444)',
        info: 'linear-gradient(135deg,#2563eb,#4f46e5)',
    };
    const keyResults = [
        {
            label: 'Run-rate Profit',
            value: `${ccySymbol}${runRateProfitAnnual.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`,
            detail: 'after loaded costs',
            tone: runRateProfitAnnual > 0 ? 'good' : 'risk',
            ribbon: runRateProfitAnnual > 0 ? 'Good' : 'Risk',
            tooltip: 'Annualized gross profit after Azure spend plus fixed operating overhead.'
        },
        {
            label: 'Cost / Revenue',
            value: formatPercent(costRevenueRatio),
            detail: 'target under 15%',
            tone: costRevenueRatio <= 15 ? 'good' : costRevenueRatio <= 25 ? 'watch' : 'risk',
            ribbon: costRevenueRatio <= 15 ? 'Good' : costRevenueRatio <= 25 ? 'Watch' : 'Risk',
            tooltip: 'Lower is better. This is monthly platform cost divided by monthly recurring revenue.'
        },
        {
            label: 'AI Share',
            value: `${formatPercent(aiSharePercent)}`,
            detail: gitHubAiEnabled
                ? `${ccySymbol}${aiCostMtd.toFixed(2)}/mo · ${gitHubAiModel || 'GitHub Models'}`
                : `${ccySymbol}${aiCostMtd.toFixed(2)}/mo`,
            tone: aiSharePercent <= 15 ? 'good' : aiSharePercent <= 30 ? 'watch' : 'risk',
            ribbon: aiSharePercent <= 15 ? 'Lean' : aiSharePercent <= 30 ? 'Watch' : 'Heavy',
            tooltip: gitHubAiEnabled
                ? 'Share of Azure AI spend, with GitHub Models currently enabled as an additional AI provider.'
                : 'Share of Azure spend currently attributable to AI-related services.'
        },
        {
            label: 'Fixed Overhead',
            value: `${ccySymbol}${monthlyOverhead.toFixed(2)}/mo`,
            detail: `${githubSourceLabel} + cert + domain + admin`,
            tone: monthlyOverhead <= Math.max(25, mrr * 0.1) ? 'good' : 'watch',
            ribbon: monthlyOverhead <= Math.max(25, mrr * 0.1) ? 'Good' : 'Watch',
            tooltip: gitHubBilling.hasLiveMonthlyCost
                ? 'Fixed operating overhead including the live GitHub monthly run-rate plus certificate, domain, and administrative costs.'
                : 'Fixed operating overhead using the configured GitHub run-rate until GitHub exposes fuller org billing spend through the current API surface.'
        },
        {
            label: 'Breakeven Price',
            value: `${ccySymbol}${breakevenPerActiveDevice.toFixed(2)}`,
            detail: 'per active device / month',
            tone: breakevenPerActiveDevice <= 2 ? 'good' : breakevenPerActiveDevice <= 4 ? 'watch' : 'risk',
            ribbon: breakevenPerActiveDevice <= 2 ? 'Good' : breakevenPerActiveDevice <= 4 ? 'Watch' : 'Risk',
            tooltip: 'Current all-in breakeven per active device at today’s scale.'
        },
        {
            label: 'Billing Policy',
            value: `+${monthlyMarkupPercent}% / +${churnReservePercent}%`,
            detail: 'monthly premium · reserve',
            tone: 'info',
            ribbon: 'Policy',
            tooltip: 'Recommended markup for monthly billing and reserve buffer for churn, refunds, and collection risk.'
        }
    ];

    // Sparkline data from trends
    const trends = s.trends || [];
    const mrrSpark = trends.map(t => convert(t.mrr || t.MRR || 0, revenueCcy));
    const costSpark = trends.map(t => convert(t.cost || t.Cost || 0, costCcy));
    const marginSpark = trends.map(t => t.margin || t.Margin || t.marginPercent || 0);

    // History for growth chart
    const historySlice = (history || []).slice(-requestedGrowthDays);

    // ── Chart rendering ─────────────────────────────────────────────
    useEffect(() => {
        renderRevenueDonut();
        renderCostDonut();
        renderCostTrendChart();
        renderServiceTrendChart();
        renderRegionDonut();
    }, [snapshot, displayCcy, costWindow, costScale, serviceTrendWindow, serviceScale]);

    useEffect(() => {
        renderGrowthChart();
    }, [historyRange, history, displayCcy]);

    function renderRevenueDonut() {
        if (!revenueChartRef.current || !window.Chart) return;
        destroyChart(revenueChartRef);
        const labels = ['Personal', 'Education', 'Business'].filter((_, i) => [rb.personal, rb.education, rb.business][i] > 0);
        const data = [rb.personal, rb.education, rb.business].filter(v => v > 0).map(v => convert(v, revenueCcy));
        if (data.length === 0) return;
        const colors = ['#0054a6', '#2fb344', '#ae3ec9'];
        const filtered = colors.filter((_, i) => [rb.personal, rb.education, rb.business][i] > 0);
        new window.Chart(revenueChartRef.current.getContext('2d'), doughnutConfig(labels, data, filtered));
    }

    function renderCostDonut() {
        if (!costChartRef.current || !window.Chart) return;
        destroyChart(costChartRef);
        // Prefer monthly totals from Azure Cost API; fall back to latest daily snapshot
        const entries = serviceEntries;
        if (entries.length === 0) return;
        const labels = entries.map(([k]) => k);
        const data = entries.map(([, v]) => convert(v, costCcy));
        new window.Chart(costChartRef.current.getContext('2d'), doughnutConfig(labels, data, CHART_PALETTE.slice(0, labels.length)));
    }

    function renderCostTrendChart() {
        if (!costTrendChartRef.current || !window.Chart || filteredDailyCostTrend.length < 2) return;
        destroyChart(costTrendChartRef);
        const t = themeColors();
        const dateKeys = filteredDailyCostTrend.map(snap => new Date(snap.date).toISOString().slice(0, 10));
        const labels = filteredDailyCostTrend.map(snap => {
            const d = new Date(snap.date);
            return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        });
        const gitHubByDate = new Map(gitHubDailyExpenses.map(point => [new Date(point.date).toISOString().slice(0, 10), Number(point.totalUsd || 0)]));
        const rawAzureData = filteredDailyCostTrend.map(snap => convert(snap.totalCost || 0, costCcy));
        const rawGitHubData = dateKeys.map(key => convert(gitHubByDate.get(key) || 0, 'USD'));
        const rawTotalExpenseData = rawAzureData.map((value, idx) => Number(value || 0) + Number(rawGitHubData[idx] || 0));
        const axisValue = (value) => costScale === 'log' ? (Number(value || 0) > 0 ? Number(value) : null) : Number(value || 0);
        const azureData = rawAzureData.map(axisValue);
        const gitHubData = rawGitHubData.map(axisValue);
        const totalExpenseData = rawTotalExpenseData.map(axisValue);
        const loadedRunRateData = labels.map(() => axisValue(loadedDailyRunRate));
        const cfg = lineChartConfig(labels, [
            { label: 'Azure daily expense', data: azureData, borderColor: '#f76707', backgroundColor: 'rgba(247,103,7,0.08)', fill: true, borderWidth: 2, pointRadius: 2, tension: 0.3 },
            { label: 'GitHub daily expense', data: gitHubData, borderColor: '#0f766e', backgroundColor: 'transparent', fill: false, borderDash: [4, 4], borderWidth: 2, pointRadius: 0, tension: 0.25 },
            { label: 'Total daily expense', data: totalExpenseData, borderColor: '#0054a6', backgroundColor: 'transparent', fill: false, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.25 },
            { label: 'Loaded breakeven run-rate', data: loadedRunRateData, borderColor: '#7c3aed', backgroundColor: 'transparent', fill: false, borderDash: [2, 3], borderWidth: 2, pointRadius: 0, tension: 0 },
        ], {
            plugins: { legend: { display: true, position: 'bottom', labels: { color: t.text, usePointStyle: true, font: { size: 11 } } } },
            scales: {
                x: { ticks: { color: t.muted, maxTicksLimit: 10 }, grid: { color: t.gridLine } },
                y: {
                    type: costScale === 'log' ? 'logarithmic' : 'linear',
                    ticks: { color: t.muted, callback: v => `${ccySymbol}${Number(v).toFixed(Number(v) < 1 ? 2 : 0)}` },
                    grid: { color: t.gridLine }
                },
            },
        });
        new window.Chart(costTrendChartRef.current.getContext('2d'), cfg);
    }

    function renderServiceTrendChart() {
        if (!serviceTrendChartRef.current || !window.Chart || serviceTrendSource.length < 2) return;
        destroyChart(serviceTrendChartRef);
        const t = themeColors();
        const serviceTotals = serviceTrendSource.reduce((acc, entry) => {
            acc[entry.service] = (acc[entry.service] || 0) + Number(entry.cost || 0);
            return acc;
        }, {});
        const topServices = Object.entries(serviceTotals)
            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
            .slice(0, 5)
            .map(([service]) => service);
        const labels = [...new Set(serviceTrendSource.map(entry => {
            const d = new Date(entry.date);
            return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        }))];
        const dateKeys = [...new Set(serviceTrendSource.map(entry => new Date(entry.date).toISOString().slice(0, 10)))];
        const datasets = topServices.map((service, index) => ({
            label: service,
            data: dateKeys.map(dateKey => {
                const match = serviceTrendSource.find(entry => entry.service === service && new Date(entry.date).toISOString().slice(0, 10) === dateKey);
                const value = convert(match?.cost || 0, costCcy);
                return serviceScale === 'log' ? (Number(value || 0) > 0 ? Number(value) : null) : Number(value || 0);
            }),
            borderColor: CHART_PALETTE[index % CHART_PALETTE.length],
            backgroundColor: 'transparent',
            fill: false,
            borderWidth: 2,
            pointRadius: 1,
            tension: 0.25,
        }));
        if (datasets.length === 0 || labels.length < 2) return;
        const cfg = lineChartConfig(labels, datasets, {
            plugins: { legend: { display: true, position: 'bottom', labels: { color: t.text, usePointStyle: true, font: { size: 10 } } } },
            scales: {
                x: { ticks: { color: t.muted, maxTicksLimit: 10 }, grid: { color: t.gridLine } },
                y: {
                    type: serviceScale === 'log' ? 'logarithmic' : 'linear',
                    ticks: { color: t.muted, callback: v => `${ccySymbol}${Number(v).toFixed(Number(v) < 1 ? 2 : 0)}` },
                    grid: { color: t.gridLine }
                },
            },
        });
        new window.Chart(serviceTrendChartRef.current.getContext('2d'), cfg);
    }

    function renderRegionDonut() {
        if (!regionChartRef.current || !window.Chart || regionEntries.length === 0) return;
        destroyChart(regionChartRef);
        const labels = regionEntries.map(([k]) => getRegionLabel(k));
        const data = regionEntries.map(([, v]) => convert(v, costCcy));
        const regionPalette = ['#0054a6', '#2fb344', '#f76707', '#ae3ec9', '#d63939', '#f59f00', '#4299e1', '#17a2b8'];
        new window.Chart(regionChartRef.current.getContext('2d'), doughnutConfig(labels, data, regionPalette.slice(0, labels.length)));
    }

    function renderGrowthChart() {
        if (!growthChartRef.current || !window.Chart || historySlice.length < 2) return;
        destroyChart(growthChartRef);
        const t = themeColors();
        const labels = historySlice.map(h => {
            const d = new Date(h.date);
            return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        });
        const cfg = lineChartConfig(labels, [
            { label: 'Orgs', data: historySlice.map(h => h.orgCount || 0), borderColor: '#0054a6', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
            { label: 'Devices', data: historySlice.map(h => h.deviceCount || 0), borderColor: '#2fb344', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
            { label: 'MRR', data: historySlice.map(h => convert(h.mrr || h.MRR || 0, revenueCcy)), borderColor: '#ae3ec9', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' },
        ], {
            plugins: { legend: { display: true, position: 'bottom', labels: { color: t.text, usePointStyle: true, font: { size: 11 } } } },
            scales: {
                x: { ticks: { color: t.muted, maxTicksLimit: 12 }, grid: { color: t.gridLine } },
                y: { position: 'left', ticks: { color: t.muted }, grid: { color: t.gridLine }, title: { display: true, text: 'Count', color: t.muted } },
                y1: { position: 'right', ticks: { color: t.muted }, grid: { display: false }, title: { display: true, text: `MRR (${displayCcy})`, color: t.muted } },
            },
        });
        new window.Chart(growthChartRef.current.getContext('2d'), cfg);
    }

    // ── Render ───────────────────────────────────────────────────────
    return html`
        <div class="executive-summary">
            <!-- Hero Band -->
            <div class="card mb-3" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                <div class="card-body py-3">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <span class="badge ${grade.badge} fs-5 px-3 py-2">${grade.grade}</span>
                        </div>
                        <div class="col">
                            <div class="text-white opacity-75 small">Business Health</div>
                            <div class="text-white fs-3 fw-bold">
                                ${ccySymbol}${formatNumberByCurrency(mrr, displayCcy, 0)} MRR
                                <span class="fs-5 opacity-75 ms-2">${formatPercent(margin)} margin</span>
                            </div>
                        </div>
                        <div class="col-auto text-white text-end small">
                            <div>${totalOrgs} orgs · ${formatCompact(activeDevices)} active devices</div>
                            <div class="opacity-75">${formatCompact(avgTelemetry7d)} avg signals/day (7d)</div>
                            <div class="opacity-50 mt-1">${signalUpdatedLabel}</div>
                        </div>
                    </div>
                </div>
            </div>

            ${d.mrrChange != null && html`
                <div class="alert alert-light py-2 mb-3 d-flex gap-3 flex-wrap align-items-center small" style="color: var(--tblr-body-color, #182433);">
                    <span class="fw-medium text-muted me-1">Day-over-Day:</span>
                    <span>MRR <span class="badge ${d.mrrChange >= 0 ? 'bg-success' : 'bg-danger'} text-white">${d.mrrChange >= 0 ? '+' : ''}${ccySymbol}${convert(d.mrrChange || 0, revenueCcy).toFixed(0)}</span></span>
                    <span>Cost <span class="badge ${d.costChange <= 0 ? 'bg-success' : 'bg-danger'} text-white">${d.costChange >= 0 ? '+' : ''}${ccySymbol}${convert(d.costChange || 0, costCcy).toFixed(2)}</span></span>
                    <span>Margin <span class="badge ${marginDeltaDisplay == null ? 'bg-secondary' : marginDeltaDisplay >= 0 ? 'bg-success' : 'bg-danger'} text-white">${marginDeltaDisplay == null ? 'baseline updated' : `${marginDeltaDisplay >= 0 ? '+' : ''}${marginDeltaDisplay.toFixed(1)}pp`}</span></span>
                    ${d.orgCountChange != null && html`<span>Orgs <span class="badge bg-secondary text-white">${d.orgCountChange >= 0 ? '+' : ''}${d.orgCountChange}</span></span>`}
                    ${d.deviceCountChange != null && html`<span>Devices <span class="badge bg-secondary text-white">${d.deviceCountChange >= 0 ? '+' : ''}${d.deviceCountChange}</span></span>`}
                </div>
            `}

            <!-- Row 1: Financial KPIs -->
            <div class="row g-3 mb-3">
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="currency-dollar" label="MRR / ARR" color="primary"
                        value="${ccySymbol}${formatNumberByCurrency(mrr, displayCcy, 0)}"
                        subtitle="${ccySymbol}${formatNumberByCurrency(arr, displayCcy, 0)} ARR"
                        sparkData=${mrrSpark}
                        sparkColor="#0054a6"
                        trend=${{ pct: d.mrrChangePercent }}
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="receipt" label="Avg Daily Expense (7d)" color="warning"
                        value="${ccySymbol}${avgDailyCost7.toFixed(2)}"
                        subtitle="${ccySymbol}${mtdCost.toFixed(0)} expense MTD"
                        sparkData=${costSpark}
                        sparkColor="#f59f00"
                        trend=${{ pct: d.costChangePercent, higherIsBetter: false }}
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="percentage" label="Profit Margin" color=${marginInfo.color === '#2fb344' ? 'success' : marginInfo.color === '#d63939' ? 'danger' : 'warning'}
                        value=${formatPercent(margin)}
                        subtitle=${marginInfo.label}
                        sparkData=${marginSpark}
                        sparkColor=${marginInfo.color}
                        trend=${marginDeltaDisplay == null ? null : { pct: marginDeltaDisplay }}
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="arrows-exchange" label="Cost / Revenue" color=${costRevenueRatio > 25 ? 'danger' : costRevenueRatio > 15 ? 'warning' : 'success'}
                        value=${formatPercent(costRevenueRatio)}
                        subtitle="Target < 15%"
                    />
                </div>
            </div>

            <!-- Row 2: Volume KPIs -->
            <div class="row g-3 mb-3">
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="building" label="Organizations" color="primary"
                        value=${String(totalOrgs)}
                        subtitle="${s.personalOrgCount || 0}P · ${s.educationOrgCount || 0}E · ${s.businessOrgCount || 0}B"
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="devices" label="Daily Active Footprint" color="success"
                        value=${formatCompact(activeDevices)}
                        subtitle="online at least once / day"
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="database" label="Signal Volume (7d avg)" color="purple"
                        value=${formatCompact(avgTelemetry7d)}
                        subtitle="${formatCompact(totalTelemetry)} latest-day signals"
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard}
                        icon="shield-lock" label="Intelligence DB" color="cyan"
                        value=${intelTotal > 0 ? formatCompact(intelTotal) : '—'}
                        subtitle=${intelTotal > 0
                            ? `${formatCompact(intelCpe)} CPE · ${formatCompact(intelCve)} CVE`
                            : 'catalog stats pending'}
                    />
                </div>
            </div>

            <!-- Row 3: Growth Trends from History -->
            ${historySlice.length >= 2 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title"><i class="ti ti-trending-up me-2"></i>Growth Trends</h3>
                        <div class="card-actions d-flex gap-2 align-items-center">
                            <select class="form-select form-select-sm w-auto" value=${String(historyRange)} onChange=${(e) => setHistoryRange(Number(e.target.value) || 90)}>
                                ${[30, 90, 180, 365].map(d => html`<option value=${String(d)}>${d} days</option>`)}
                            </select>
                            <span class="badge bg-blue-lt text-blue">${actualGrowthDays}/${requestedGrowthDays} available</span>
                        </div>
                    </div>
                    <div class="card-body" style="height:280px">
                        <canvas ref=${growthChartRef}></canvas>
                    </div>
                    <div class="card-footer text-muted small">
                        Showing ${actualGrowthDays} verified day(s) of growth history. Longer windows will populate automatically as more history becomes available.
                    </div>
                </div>
            `}

            <!-- Row 4: Expense Trends -->
            ${dailyCostTrend.length >= 2 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title"><i class="ti ti-chart-line me-2"></i>Expense Trends</h3>
                        <div class="card-actions d-flex gap-2 align-items-center">
                            <select class="form-select form-select-sm w-auto" value=${String(costWindow)} onChange=${(e) => setCostWindow(Number(e.target.value) || 30)}>
                                ${[7, 15, 30, 60, 90].map(days => html`<option value=${String(days)}>${days} days</option>`)}
                            </select>
                            <select class="form-select form-select-sm w-auto" value=${costScale} onChange=${(e) => setCostScale(e.target.value || 'linear')}>
                                <option value="linear">Linear</option>
                                <option value="log">Log</option>
                            </select>
                            <span class="badge bg-orange-lt text-orange">${actualCostDays}/${requestedCostDays} available</span>
                        </div>
                    </div>
                    <div class="card-body" style="height:260px">
                        <canvas ref=${costTrendChartRef}></canvas>
                    </div>
                    <div class="card-footer text-muted small">
                        Orange = Azure billed daily expense from completed days. Teal = GitHub daily allocation from payment history or current run-rate. Blue dashed = combined expense trend. Purple dashed = loaded breakeven run-rate, implying about ${ccySymbol}${breakevenPerActiveDevice.toFixed(2)} per active device/month today.
                    </div>
                </div>
            `}

            ${serviceTrendSource.length >= 2 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title"><i class="ti ti-chart-infographic me-2"></i>Cost by Service Trends</h3>
                        <div class="card-actions d-flex gap-2 align-items-center">
                            <select class="form-select form-select-sm w-auto" value=${String(serviceTrendWindow)} onChange=${(e) => setServiceTrendWindow(Number(e.target.value) || 30)}>
                                ${[7, 15, 30, 60, 90].map(days => html`<option value=${String(days)}>${days} days</option>`)}
                            </select>
                            <select class="form-select form-select-sm w-auto" value=${serviceScale} onChange=${(e) => setServiceScale(e.target.value || 'linear')}>
                                <option value="linear">Linear</option>
                                <option value="log">Log</option>
                            </select>
                            <span class="badge bg-blue-lt text-blue">${actualServiceDays}/${requestedServiceDays} available</span>
                        </div>
                    </div>
                    <div class="card-body" style="height:280px">
                        <canvas ref=${serviceTrendChartRef}></canvas>
                    </div>
                    <div class="card-footer text-muted small">
                        Top services are shown as separate lines using daily Azure cost data for the selected window. Switch to a logarithmic Y-axis when a few expensive services visually flatten the smaller ones.
                    </div>
                </div>
            `}

            <!-- Row 5: Revenue Mix + Cost by Service + Cost by Region -->
            <div class="row g-3 mb-3">
                <div class="col-md-4 d-flex">
                    <div class="card h-100 w-100">
                        <div class="card-header"><h3 class="card-title"><i class="ti ti-chart-pie me-2"></i>Revenue Mix</h3></div>
                        <div class="card-body" style="height:240px">
                            ${totalRevenue > 0
                                ? html`<canvas ref=${revenueChartRef}></canvas>`
                                : html`<div class="empty"><p class="empty-title">No revenue data</p></div>`
                            }
                        </div>
                    </div>
                </div>
                <div class="col-md-4 d-flex">
                    <div class="card h-100 w-100">
                        <div class="card-header"><h3 class="card-title"><i class="ti ti-chart-donut me-2"></i>Cost by Service (${serviceBreakdownLabel})</h3></div>
                        <div class="card-body" style="height:240px">
                            ${serviceEntries.length > 0
                                ? html`<canvas ref=${costChartRef}></canvas>`
                                : html`<div class="empty"><p class="empty-title">No cost breakdown</p></div>`
                            }
                        </div>
                    </div>
                </div>
                <div class="col-md-4 d-flex">
                    <div class="card h-100 w-100">
                        <div class="card-header"><h3 class="card-title"><i class="ti ti-map-pin me-2"></i>Regional Cost Footprint (${regionBreakdownLabel})</h3></div>
                        <div class="card-body" style="height:240px">
                            ${regionEntries.some(([, value]) => Number(value || 0) > 0)
                                ? html`<canvas ref=${regionChartRef}></canvas>`
                                : html`<div class="empty"><p class="empty-title">No region data</p></div>`
                            }
                        </div>
                        <div class="card-footer text-muted small">This panel reflects the latest billed regional footprint, currently shown as a 30-day view when Azure monthly totals are available. Configured regions with zero spend remain listed below.</div>
                    </div>
                </div>
            </div>

            <!-- Row 6: Cost Summary Tables -->
            ${(serviceEntries.length > 0 || regionEntries.length > 0) && html`
                <div class="row g-3 mb-3">
                    ${serviceEntries.length > 0 && html`
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title"><i class="ti ti-list me-2"></i>Cost by Service (${serviceBreakdownLabel})</h3>
                                    <span class="badge bg-blue-lt text-blue ms-auto">${ccySymbol}${convert(serviceEntries.reduce((s, [, v]) => s + Number(v || 0), 0), costCcy).toFixed(2)}</span>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive" style="max-height:280px">
                                        <table class="table table-vcenter table-sm card-table">
                                            <thead><tr><th>Service</th><th class="text-end">Amount</th><th class="text-end">Share</th></tr></thead>
                                            <tbody>
                                                ${serviceEntries.map(([svc, cost]) => {
                                                    const total = serviceEntries.reduce((s, [, v]) => s + Number(v || 0), 0);
                                                    const share = total > 0 ? (cost / total * 100) : 0;
                                                    return html`<tr>
                                                        <td class="small">${svc}</td>
                                                        <td class="text-end font-monospace small">${ccySymbol}${convert(cost, costCcy).toFixed(2)}</td>
                                                        <td class="text-end small text-muted">${share.toFixed(1)}%</td>
                                                    </tr>`;
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}
                    ${regionEntries.length > 0 && html`
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title"><i class="ti ti-world me-2"></i>Regional Cost Footprint (${regionBreakdownLabel})</h3>
                                    <span class="badge bg-blue-lt text-blue ms-auto">${ccySymbol}${convert(regionEntries.reduce((s, [, v]) => s + Number(v || 0), 0), costCcy).toFixed(2)}</span>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive" style="max-height:280px">
                                        <table class="table table-vcenter table-sm card-table">
                                            <thead><tr><th>Region</th><th class="text-end">Amount</th><th class="text-end">Share</th></tr></thead>
                                            <tbody>
                                                ${regionEntries.map(([region, cost]) => {
                                                    const total = regionEntries.reduce((s, [, v]) => s + Number(v || 0), 0);
                                                    const share = total > 0 ? (cost / total * 100) : 0;
                                                    return html`<tr>
                                                        <td class="small">${getRegionLabel(region)}</td>
                                                        <td class="text-end font-monospace small">${ccySymbol}${convert(cost, costCcy).toFixed(2)}</td>
                                                        <td class="text-end small text-muted">${share.toFixed(1)}%</td>
                                                    </tr>`;
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            `}

            <!-- Row 7: Key Results Tiles -->
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title"><i class="ti ti-rosette-discount-check me-2"></i>Key Results</h3>
                    <div class="card-options text-muted small">Fixed-size tiles with decision signals</div>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        ${keyResults.map(item => html`
                            <div class="col-lg-2 col-md-4 col-sm-6 d-flex">
                                <div class="card h-100 w-100 position-relative overflow-hidden shadow-sm border-0" title=${item.tooltip} style="min-height:96px; background:var(--tblr-bg-surface, #fff); border:1px solid var(--tblr-border-color,#e5e7eb);">
                                    <div style=${`position:absolute;top:10px;right:-6px;background:${krToneStyles[item.tone]};color:#fff;padding:4px 12px;border-radius:999px 0 0 999px;font-size:.68rem;font-weight:800;letter-spacing:.02em;box-shadow:0 6px 16px rgba(15,23,42,.18);`}>
                                        ${item.ribbon}
                                    </div>
                                    <div class="card-body d-flex flex-column justify-content-between">
                                        <div class="subheader pe-5">${item.label}</div>
                                        <div class="h3 mb-1">${item.value}</div>
                                        <div class="text-muted small">${item.detail}</div>
                                    </div>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            </div>

            <!-- Row 8: At-Risk Alerts -->
            ${(s.atRiskOrgs || []).length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title text-danger"><i class="ti ti-alert-triangle me-2"></i>At-Risk Organizations</h3>
                        <span class="badge bg-danger text-white ms-2">${s.atRiskOrgs.length}</span>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-vcenter card-table table-sm">
                                <thead><tr>
                                    <th>Organization</th><th>Devices</th><th>Daily Cost</th><th>Risk</th>
                                </tr></thead>
                                <tbody>
                                    ${(s.atRiskOrgs || []).slice(0, 8).map(o => html`
                                        <tr>
                                            <td class="font-monospace small">${o.orgId || o.orgName}</td>
                                            <td>${o.activeDevices || 0}</td>
                                            <td>${ccySymbol}${convert(o.dailyCost || 0).toFixed(2)}</td>
                                            <td><span class="badge bg-danger text-white">${o.riskIndicator || 'At Risk'}</span></td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
