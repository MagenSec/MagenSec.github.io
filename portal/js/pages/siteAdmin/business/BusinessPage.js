/**
 * Business Page - Redesigned command center with scrollable sections.
 * Route: #!/siteadmin/business
 *
 * Loads all data in a single API call (business-metrics + profitability).
 * Shared state: snapshot, history, currency, section nav.
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

export function BusinessPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [history, setHistory] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [activeSection, setActiveSection] = useState('executive');
    const [refreshing, setRefreshing] = useState(false);

    // Currency state
    const billingCcy = (snapshot?.billingCurrencyCode || 'USD').toUpperCase();
    const revenueCcy = (snapshot?.revenueCurrencyCode || 'USD').toUpperCase();
    const [displayCcy, setDisplayCcy] = useState(localStorage.getItem('businessDashCcy') || 'USD');
    const ccySymbol = getCurrencySymbol(displayCcy);
    const convert = (val, sourceCcy = billingCcy) => convertCurrency(val, sourceCcy, displayCcy);

    // Section refs for scroll-into-view
    const sectionRefs = {
        executive: useRef(null),
        operations: useRef(null),
        profitability: useRef(null),
    };

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

    function scrollToSection(key) {
        setActiveSection(key);
        sectionRefs[key]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function handleCurrencyChange(code) {
        setDisplayCcy(code);
        localStorage.setItem('businessDashCcy', code);
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

    const sections = [
        { key: 'executive', icon: 'ti-chart-dots-2', label: 'Executive Summary' },
        { key: 'operations', icon: 'ti-heart-rate-monitor', label: 'Operations' },
        { key: 'profitability', icon: 'ti-cash', label: 'Profitability' },
    ];

    return html`
        <div class="container-xl business-dashboard">
            <!-- Page Header -->
            <div class="page-header d-print-none mb-3">
                <div class="row align-items-center">
                    <div class="col">
                        <div class="page-pretitle">Site Admin</div>
                        <h2 class="page-title">Business Intelligence</h2>
                    </div>
                    <div class="col-auto d-flex gap-2 align-items-center">
                        <!-- Currency Toggle -->
                        <div class="btn-group btn-group-sm">
                            ${Object.keys(CURRENCY_SYMBOLS).map(code => html`
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

            <!-- Section Nav (sticky pills) -->
            <ul class="nav nav-pills mb-3" style="position:sticky;top:0;z-index:10;background:var(--tblr-bg-surface);padding:8px 0">
                ${sections.map(sec => html`
                    <li class="nav-item">
                        <a class="nav-link ${activeSection === sec.key ? 'active' : ''}" href="#"
                            onClick=${(e) => { e.preventDefault(); scrollToSection(sec.key); }}>
                            <i class="ti ${sec.icon} me-1"></i> ${sec.label}
                        </a>
                    </li>
                `)}
            </ul>

            <!-- Executive Summary Section -->
            <div ref=${sectionRefs.executive}>
                <${ExecutiveSummary}
                    snapshot=${snapshot}
                    history=${history}
                    catalog=${catalog}
                    displayCcy=${displayCcy}
                    billingCcy=${billingCcy}
                    convert=${convert}
                    ccySymbol=${ccySymbol}
                />
            </div>

            <!-- Operations Console Section -->
            <div ref=${sectionRefs.operations} class="mt-4">
                <h3 class="mb-3"><i class="ti ti-heart-rate-monitor me-2"></i>Operations Console</h3>
                <${OperationsConsole}
                    snapshot=${snapshot}
                    history=${history}
                    convert=${convert}
                    ccySymbol=${ccySymbol}
                />
            </div>

            <!-- Profitability Section -->
            <div ref=${sectionRefs.profitability} class="mt-4">
                <h3 class="mb-3"><i class="ti ti-cash me-2"></i>Profitability Matrix</h3>
                <${ProfitabilityPage}
                    snapshot=${snapshot}
                    catalog=${catalog}
                    displayCcy=${displayCcy}
                    billingCcy=${billingCcy}
                    convert=${convert}
                    ccySymbol=${ccySymbol}
                />
            </div>
        </div>
    `;
}

