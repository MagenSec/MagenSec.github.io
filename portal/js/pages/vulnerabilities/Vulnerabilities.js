/**
 * Vulnerabilities Page - CVE tracking and remediation guidance
 * TRUE Stale-While-Revalidate (SWR) caching pattern
 * 
 * Pattern:
 * - Always display cached data (even if stale)
 * - Background refresh runs transparently
 * - User sees "Refreshing..." badge during background fetch
 * - Instant load from localStorage for repeat visits
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

export class VulnerabilitiesPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            vulnerabilities: [],
            severityFilter: 'all',
            isRefreshingInBackground: false
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadVulnerabilities());
        this.loadVulnerabilities();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
    }

    /**
     * SWR Cache Helper: Get cached vulnerabilities data
     * Returns { data, isStale } - NEVER deletes expired cache
     */
    getCachedVulnerabilities() {
        try {
            const cached = localStorage.getItem(`vulnerabilities_${orgContext.getCurrentOrg()?.orgId || 'default'}`);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = 10 * 60 * 1000; // 10 minutes

            const isStale = ageMs >= TTL_MS;
            if (isStale) {
                console.log('[Vulnerabilities] 📦 Cache HIT (stale): Displaying cached data');
            } else {
                console.log('[Vulnerabilities] 📦 Cache HIT (fresh): Displaying cached data');
            }
            return { data, isStale };
        } catch (err) {
            console.warn('[Vulnerabilities] Cache read error:', err);
        }
        return null;
    }

    /**
     * SWR Cache Helper: Save vulnerabilities to cache
     */
    setCachedVulnerabilities(data) {
        try {
            localStorage.setItem(
                `vulnerabilities_${orgContext.getCurrentOrg()?.orgId || 'default'}`,
                JSON.stringify({ data, timestamp: Date.now() })
            );
        } catch (err) {
            console.warn('[Vulnerabilities] Cache write error:', err);
        }
    }

    /**
     * SWR Pattern: Load from cache first, then fetch fresh in background
     */
    async loadVulnerabilities(forceRefresh = false) {
        const currentOrg = orgContext.getCurrentOrg();
        const orgId = currentOrg?.orgId || auth.getUser()?.email;

        // Step 1: Try cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = this.getCachedVulnerabilities();
            if (cached) {
                console.log('[Vulnerabilities] ⚡ Loading from cache immediately...');
                this.setState({
                    vulnerabilities: cached.data.vulnerabilities || [],
                    summary: cached.data.summary,
                    loading: false,
                    isRefreshingInBackground: true,
                    error: null
                });
                // Continue to background refresh (don't return!)
            }
        }

        // Step 2: Show loading state if no cache
        if (!this.state.vulnerabilities.length) {
            this.setState({ loading: true, error: null });
        }

        try {
            // Step 3: Fetch fresh data
            const response = await api.get(`/api/v1/orgs/${orgId}/vulnerabilities?include=cached-summary`);

            if (response.success) {
                const data = {
                    vulnerabilities: response.data?.vulnerabilities || [],
                    summary: response.data?.summary
                };

                // Cache the response
                this.setCachedVulnerabilities(data);

                // Update UI with fresh data
                this.setState({
                    vulnerabilities: data.vulnerabilities,
                    summary: data.summary,
                    loading: false,
                    isRefreshingInBackground: false,
                    error: null
                });

                console.log('[Vulnerabilities] ✅ Fresh data loaded from API');
            } else {
                throw new Error(response.message || 'Failed to load vulnerabilities');
            }
        } catch (error) {
            console.error('[Vulnerabilities] Load failed:', error);
            this.setState({
                error: error.message,
                loading: false,
                isRefreshingInBackground: false
            });
        }
    }

    getSeverityBadge(severity) {
        const map = { 'Critical': 'danger', 'High': 'warning', 'Medium': 'info', 'Low': 'secondary' };
        return map[severity] || 'secondary';
    }

    render() {
        const { loading, error, vulnerabilities, severityFilter, isRefreshingInBackground } = this.state;

        if (loading && !vulnerabilities.length) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error && !vulnerabilities.length) {
            return html`<div class="alert alert-danger"><h4 class="alert-title">Error</h4><div>${error}</div></div>`;
        }

        const filtered = severityFilter === 'all' ? vulnerabilities : vulnerabilities.filter(v => v.severity === severityFilter);

        const criticalCount = vulnerabilities.filter(v => v.severity === 'Critical').length;
        const highCount = vulnerabilities.filter(v => v.severity === 'High').length;
        const mediumCount = vulnerabilities.filter(v => v.severity === 'Medium').length;
        const lowCount = vulnerabilities.filter(v => v.severity === 'Low').length;

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Vulnerabilities</h2>
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle mt-2">
                                <div class="d-flex gap-2 flex-wrap">
                                    <span class="badge bg-danger text-white">${criticalCount} Critical</span>
                                    <span class="badge bg-warning text-white">${highCount} High</span>
                                    <span class="badge bg-info text-white">${mediumCount} Medium</span>
                                    <span class="badge bg-success text-white">${lowCount} Low</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-primary" onClick=${() => this.loadVulnerabilities(true)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="page-body">
                <div class="container-xl">
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="row g-2 align-items-center">
                                <div class="col-auto">
                                    <label class="form-label mb-0">Filter by severity:</label>
                                </div>
                                <div class="col-auto">
                                    <div class="btn-group">
                                        ${['all', 'Critical', 'High', 'Medium', 'Low'].map(s => html`
                                            <button class="btn btn-sm ${severityFilter === s ? 'btn-primary' : 'btn-outline-primary'}"
                                                    onClick=${() => this.setState({ severityFilter: s })}>
                                                ${s === 'all' ? 'All' : s}
                                                ${s !== 'all' ? html`<span class="badge ms-1">
                                                    ${s === 'Critical' ? criticalCount : s === 'High' ? highCount : s === 'Medium' ? mediumCount : lowCount}
                                                </span>` : ''}
                                            </button>
                                        `)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${filtered.length === 0 ? html`
                        <div class="empty">
                            <div class="empty-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M9 12l2 2l4 -4" /></svg>
                            </div>
                            <p class="empty-title">No vulnerabilities found</p>
                            <p class="empty-subtitle text-muted">
                                ${severityFilter === 'all' ? 'Great! No CVEs detected across your devices.' : `No ${severityFilter} severity vulnerabilities found.`}
                            </p>
                        </div>
                    ` : html`
                        <div class="row row-cards">
                            ${filtered.map(vuln => {
                                const severityColor = this.getSeverityBadge(vuln.severity);
                                const severityIcon = vuln.severity === 'Critical' ? '⚠️' : vuln.severity === 'High' ? '🔴' : vuln.severity === 'Medium' ? '🟡' : '🔵';
                                const hasExploit = vuln.knownExploit || vuln.epss > 0.5;
                                const epssColor = vuln.epss > 0.5 ? 'danger' : vuln.epss > 0.2 ? 'warning' : 'success';

                                return html`
                                    <div class="col-md-6 col-lg-4">
                                        <div class="card" style="border-left: 4px solid var(--tblr-${severityColor});">
                                            <div class="card-body">
                                                <div class="d-flex align-items-start mb-3">
                                                    <span class="avatar avatar-sm bg-${severityColor}-lt me-2">
                                                        ${severityIcon}
                                                    </span>
                                                    <div class="flex-fill">
                                                        <h3 class="card-title mb-1">
                                                            <a href="https://nvd.nist.gov/vuln/detail/${vuln.cveId}" target="_blank" class="text-reset">
                                                                ${vuln.cveId}
                                                            </a>
                                                        </h3>
                                                        <div class="d-flex gap-1 flex-wrap">
                                                            <span class="badge bg-${severityColor} text-white">${vuln.severity}</span>
                                                            ${hasExploit ? html`
                                                                <span class="badge bg-red-lt" title="Known exploit available">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>
                                                                    Exploit
                                                                </span>
                                                            ` : ''}
                                                            ${vuln.epss ? html`
                                                                <span class="badge bg-${epssColor}-lt">
                                                                    EPSS ${Math.round(vuln.epss * 100)}%
                                                                </span>
                                                            ` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <p class="text-muted small mb-3" style="height: 3rem; overflow: hidden; text-overflow: ellipsis;">
                                                    ${vuln.description || 'No description available'}
                                                </p>
                                                <div class="d-flex align-items-center justify-content-between">
                                                    <div class="text-muted small">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs me-1" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
                                                        ${vuln.affectedDevices} device${vuln.affectedDevices !== 1 ? 's' : ''}
                                                    </div>
                                                    ${vuln.cvssScore ? html`
                                                        <span class="badge badge-outline text-${severityColor}">
                                                            CVSS ${vuln.cvssScore}
                                                        </span>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            })}
                        </div>
                    `}
                </div>
            </div>
        `;
    }
}
