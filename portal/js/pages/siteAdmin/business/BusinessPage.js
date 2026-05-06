/**
 * Business Page - Site Admin business command center.
 * Route: #!/siteadmin/business
 *
 * Loads platform business snapshots and shows them as separate Business,
 * Operations, and Profitability views.
 */

import { api } from '@api';
import { logger } from '@config';
import { ExecutiveSummary } from './components/ExecutiveSummary.js';
import { OperationsConsole } from './components/OperationsConsole.js';
import { ProfitabilityPage } from './components/Profitability.js';
import {
    getCurrencySymbol, convertCurrency, CURRENCY_SYMBOLS,
} from './businessConstants.js';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;
const SUPPORTED_DISPLAY_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);

function normalizeDisplayCurrency(code) {
    const normalized = (code || 'USD').toUpperCase();
    return SUPPORTED_DISPLAY_CURRENCIES.includes(normalized) ? normalized : 'USD';
}

export function BusinessPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [history, setHistory] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [activeView, setActiveView] = useState(localStorage.getItem('businessDashView') || 'business');
    const [refreshing, setRefreshing] = useState(false);

    // Currency state
    const billingCcy = (snapshot?.billingCurrencyCode || 'USD').toUpperCase();
    const revenueCcy = (snapshot?.revenueCurrencyCode || 'USD').toUpperCase();
    const [displayCcy, setDisplayCcy] = useState(normalizeDisplayCurrency(localStorage.getItem('businessDashCcy')));
    const ccySymbol = getCurrencySymbol(displayCcy);
    const convert = (val, sourceCcy = billingCcy) => convertCurrency(val, sourceCcy, displayCcy);

    const CACHE_KEY = 'ms-business-dashboard';
    const CACHE_TTL = 30 * 60 * 1000; // 30 min

    function getCached() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const { data, timestamp } = JSON.parse(raw);
            const isStale = Date.now() - timestamp >= CACHE_TTL;
            return { data, isStale };
        } catch { return null; }
    }

    function setCache(data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch { /* quota */ }
    }

    // Unmounted guard
    const unmountedRef = useRef(false);
    useEffect(() => {
        unmountedRef.current = false;
        // SWR: serve cached immediately, then fetch fresh
        const cached = getCached();
        if (cached) {
            setSnapshot(cached.data);
            setHistory(cached.data.history || []);
            setLoading(false);
            setRefreshing(true);
        }
        loadDashboard();
        return () => { unmountedRef.current = true; };
    }, []);

    async function loadDashboard(refresh = false) {
        try {
            if (refresh) setRefreshing(true);
            else if (!snapshot) setLoading(true);
            setError(null);

            const url = refresh
                ? '/api/v1/admin/business-metrics?refresh=true'
                : '/api/v1/admin/business-metrics?include=cached-summary';
            const [response, catalogResponse] = await Promise.all([
                api.get(url),
                api.get('/api/v1/admin/orgs/license-catalog').catch(() => null),
            ]);

            if (unmountedRef.current) return;

            if (response.success && response.data) {
                setSnapshot(response.data);
                setHistory(response.data.history || []);
                setCache(response.data);
                if (catalogResponse?.success && catalogResponse.data) {
                    setCatalog(catalogResponse.data);
                }
            } else {
                setError(response.message || 'Failed to load business metrics');
            }
        } catch (err) {
            if (!unmountedRef.current) {
                logger.error('Failed to load business dashboard:', err);
                setError(err.message || 'Failed to load business metrics');
            }
        } finally {
            if (!unmountedRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }

    function setView(key) {
        setActiveView(key);
        localStorage.setItem('businessDashView', key);
    }

    function handleCurrencyChange(code) {
        const normalized = normalizeDisplayCurrency(code);
        setDisplayCcy(normalized);
        localStorage.setItem('businessDashCcy', normalized);
    }

    // ── Loading / Error states ──────────────────────────────────────
    if (loading) {
        return html`
            <div class="container-xl py-4">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <div class="text-muted mt-2">Loading business intelligence...</div>
                </div>
            </div>
        `;
    }

    if (error) {
        return html`
            <div class="container-xl py-4">
                <div class="alert alert-danger d-flex align-items-center">
                    <i class="ti ti-alert-circle me-2"></i>
                    <div>${error}</div>
                    <button class="btn btn-sm btn-outline-danger ms-3" onClick=${() => loadDashboard()}>Retry</button>
                </div>
            </div>
        `;
    }

    const views = [
        { key: 'business', icon: 'ti-chart-dots-2', label: 'Business', description: 'Dossiers, billing, margin' },
        { key: 'operations', icon: 'ti-heart-rate-monitor', label: 'Operations', description: 'Signal volume, fleet pressure' },
        { key: 'profitability', icon: 'ti-cash', label: 'Profitability', description: 'COGS, org margins, planner' },
    ];

    const snapshotDate = snapshot?.date ? new Date(snapshot.date) : null;
    const snapshotDateLabel = snapshotDate && !Number.isNaN(snapshotDate.getTime())
        ? snapshotDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Dossier pending';
    const generatedAt = snapshot?.generatedAt ? new Date(snapshot.generatedAt) : null;
    const generatedAtLabel = generatedAt && !Number.isNaN(generatedAt.getTime())
        ? generatedAt.toLocaleString()
        : 'Not generated yet';
    const latestDailyCost = (snapshot?.costDetail?.dailySnapshots || [])
        .filter(item => item?.date && Number(item.totalCost || 0) > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const costDate = latestDailyCost?.date ? new Date(latestDailyCost.date) : null;
    const costDateLabel = costDate && !Number.isNaN(costDate.getTime())
        ? costDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'No daily cost row';
    const telemetryTotal = Number(snapshot?.totalTelemetryToday || 0);
    const coveragePercent = Number(snapshot?.coveragePercent || 0);
    const dataSourceLabel = snapshot?.dataSource === 'live-generated'
        ? 'Live regenerated'
        : 'Dossier served';

    return html`
        <div class="container-xl business-intelligence-shell business-dashboard py-3">
            <!-- Page Header -->
            <div class="business-intelligence-header page-header d-print-none mb-3">
                <div class="row align-items-center">
                    <div class="col">
                        <div class="page-pretitle">Site Admin</div>
                        <h2 class="page-title">Business Intelligence</h2>
                        <div class="text-white opacity-75 small mt-1">Business view is Dossier-first. Current-day telemetry is displayed as indicative operating pressure only.</div>
                    </div>
                    <div class="col-auto d-flex gap-2 align-items-center">
                        <!-- Currency Toggle -->
                        <div class="btn-group btn-group-sm">
                            ${SUPPORTED_DISPLAY_CURRENCIES.map(code => html`
                                <button class="btn ${displayCcy === code ? 'btn-primary' : 'btn-outline-secondary'}"
                                    onClick=${() => handleCurrencyChange(code)}>
                                    ${CURRENCY_SYMBOLS[code]} ${code}
                                </button>
                            `)}
                        </div>

                        <!-- Refresh -->
                        <button class="btn btn-sm btn-outline-primary ${refreshing ? 'disabled' : ''}"
                            onClick=${() => loadDashboard(true)}
                            disabled=${refreshing}>
                            <i class="ti ${refreshing ? 'ti-loader ti-spin' : 'ti-refresh'} me-1"></i>
                            ${refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            <div class="business-view-tabs nav nav-tabs business-intelligence-tabs mb-3">
                ${views.map(view => html`
                    <button
                        type="button"
                        class=${`nav-link ${activeView === view.key ? 'active' : ''}`}
                        onClick=${() => setView(view.key)}>
                        <i class="ti ${view.icon} me-1"></i>
                        <span>${view.label}</span>
                        <small class="d-none d-md-inline ms-2 opacity-75">${view.description}</small>
                    </button>
                `)}
            </div>

            ${activeView === 'business' && html`
                <${ExecutiveSummary}
                    snapshot=${snapshot}
                    history=${history}
                    catalog=${catalog}
                    displayCcy=${displayCcy}
                    billingCcy=${billingCcy}
                    convert=${convert}
                    ccySymbol=${ccySymbol}
                />
            `}

            ${activeView === 'operations' && html`
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <div>
                        <h3 class="mb-1"><i class="ti ti-heart-rate-monitor me-2"></i>Operations Console</h3>
                        <div class="text-muted small">Processing inputs, materialized outputs, and devices that are driving cost or reliability pressure.</div>
                    </div>
                </div>
                <${OperationsConsole}
                    snapshot=${snapshot}
                    history=${history}
                    convert=${convert}
                    ccySymbol=${ccySymbol}
                />
            `}

            ${activeView === 'profitability' && html`
                <div class="d-flex align-items-center justify-content-between mb-3">
                    <div>
                        <h3 class="mb-1"><i class="ti ti-cash me-2"></i>Profitability Matrix</h3>
                        <div class="text-muted small">Daily revenue, allocated COGS, package margins, and pricing scenarios from the same dossier/cost basis.</div>
                    </div>
                </div>
                <${ProfitabilityPage}
                    snapshot=${snapshot}
                    catalog=${catalog}
                    displayCcy=${displayCcy}
                    billingCcy=${billingCcy}
                    convert=${convert}
                    ccySymbol=${ccySymbol}
                />
            `}

            <div class="business-source-footer mt-4">
                <span><i class="ti ti-database me-1"></i>${dataSourceLabel}: ${snapshotDateLabel}, generated ${generatedAtLabel}</span>
                <span><i class="ti ti-receipt me-1"></i>Daily cost row ${costDateLabel}; monthly cards use Azure Cost API MTD.</span>
                <span><i class="ti ti-activity me-1"></i>Latest signal ${telemetryTotal.toLocaleString()} rows · ${coveragePercent.toFixed(1)}% org coverage</span>
            </div>
        </div>
    `;
}

