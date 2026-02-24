/**
 * CVE Details Page - Detailed CVE information and remediation guidance
 * TRUE Stale-While-Revalidate (SWR) caching pattern
 * 
 * Pattern:
 * - Always display cached data (even if stale)
 * - Background refresh runs transparently
 * - User sees "Refreshing..." badge during background fetch
 * - Instant load from localStorage for repeat visits
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

export class CVEDetailsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            cveId: props?.cveId || '',
            cveDetails: null,
            loading: true,
            error: null,
            isRefreshingInBackground: false,
            affectedDevices: [],
            remediationSteps: []
        };
    }

    async componentDidMount() {
        this.unsubscribeOrg = orgContext.onChange(() => this.loadCVEDetails());
        await this.loadCVEDetails();
    }

    componentWillUnmount() {
        if (this.unsubscribeOrg) {
            this.unsubscribeOrg();
        }
    }

    /**
     * SWR Cache Helper: Get cached CVE details
     * Returns { data, isStale } - NEVER deletes expired cache
     */
    getCachedCVEDetails(key, ttlMinutes = 30) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = ttlMinutes * 60 * 1000;
            const isStale = ageMs >= TTL_MS;

            if (isStale) {
                console.log(`[CVEDetails] 📦 Cache HIT (STALE): ${key} (age: ${Math.round(ageMs/1000)}s, TTL: ${ttlMinutes}m)`);
            } else {
                console.log(`[CVEDetails] 📦 Cache HIT (FRESH): ${key} (age: ${Math.round(ageMs/1000)}s)`);
            }
            return { data, isStale };
        } catch (err) {
            console.warn('[CVEDetails] Cache read error:', err);
        }
        return null;
    }

    /**
     * SWR Cache Helper: Save CVE details to cache
     */
    setCachedCVEDetails(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (err) {
            console.warn('[CVEDetails] Cache write error:', err);
        }
    }

    /**
     * SWR Pattern: Load from cache first, then fetch fresh in background
     */
    async loadCVEDetails(forceRefresh = false) {
        const currentOrg = orgContext.getCurrentOrg();
        const orgId = currentOrg?.orgId;
        if (!orgId) {
            this.setState({ error: 'Organization not found', loading: false });
            return;
        }

        const cacheKey = `cve_${orgId}_${this.state.cveId}`;

        // Step 1: Try cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = this.getCachedCVEDetails(cacheKey);
            if (cached) {
                console.log('[CVEDetails] ⚡ Loading from cache immediately...');
                this.setState({
                    cveDetails: cached.data.cveDetails,
                    affectedDevices: cached.data.affectedDevices || [],
                    remediationSteps: cached.data.remediationSteps || [],
                    loading: false,
                    isRefreshingInBackground: true,
                    error: null
                });
                // Continue to background refresh (don't return!)
            }
        }

        // Step 2: Show loading state if no cache
        if (!this.state.cveDetails) {
            this.setState({ loading: true, error: null });
        }

        try {
            // Step 3: Fetch fresh data
            const response = await api.getCveDetails(this.state.cveId, orgId);

            if (response.success) {
                const cve = response.data?.cves?.[0] || null;

                const remediationFromRefs = Array.isArray(cve?.references)
                    ? cve.references
                        .filter(ref => ref && (ref.title || ref.url))
                        .slice(0, 10)
                        .map(ref => ({
                            title: ref.title || 'Reference',
                            description: ref.url || ''
                        }))
                    : [];

                const data = {
                    cveDetails: cve,
                    affectedDevices: cve?.affectedDevices || [],
                    remediationSteps: remediationFromRefs
                };

                // Cache the response
                this.setCachedCVEDetails(cacheKey, data);

                // Update UI with fresh data
                this.setState({
                    cveDetails: data.cveDetails,
                    affectedDevices: data.affectedDevices,
                    remediationSteps: data.remediationSteps,
                    loading: false,
                    isRefreshingInBackground: false,
                    error: null
                });

                console.log('[CVEDetails] ✅ Fresh data loaded from API');
            } else {
                throw new Error(response.message || 'Failed to load CVE details');
            }
        } catch (error) {
            console.error('[CVEDetails] Load failed:', error);
            // Still show cached data if available, even on error
            if (!this.state.cveDetails) {
                this.setState({
                    error: error.message,
                    loading: false,
                    isRefreshingInBackground: false
                });
            } else {
                this.setState({
                    isRefreshingInBackground: false
                });
            }
        }
    }

    getSeverityBadge(severity) {
        const map = {
            'Critical': 'danger',
            'High': 'warning',
            'Medium': 'info',
            'Low': 'secondary'
        };
        return map[severity] || 'secondary';
    }

    render() {
        const { loading, error, cveDetails, affectedDevices, remediationSteps, isRefreshingInBackground } = this.state;

        if (loading && !cveDetails) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error && !cveDetails) {
            return html`<div class="alert alert-danger"><h4 class="alert-title">Error</h4><div>${error}</div></div>`;
        }

        if (!cveDetails) {
            return html`<div class="alert alert-warning"><h4 class="alert-title">Not Found</h4><div>CVE details not available</div></div>`;
        }

        const severityColor = this.getSeverityBadge(cveDetails.severity);
        const hasExploit = cveDetails.knownExploit || cveDetails.epss > 0.5;

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">${cveDetails.cveId}</h2>
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle mt-2">
                                <div class="d-flex gap-2 flex-wrap align-items-center">
                                    <span class="badge bg-${severityColor} text-white">${cveDetails.severity}</span>
                                    ${hasExploit ? html`
                                        <span class="badge bg-danger-lt text-danger">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>
                                            Known Exploit
                                        </span>
                                    ` : ''}
                                    ${cveDetails.cvssScore ? html`
                                        <span class="text-muted">CVSS: ${cveDetails.cvssScore}</span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-primary" onClick=${() => this.loadCVEDetails(true)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <div class="row row-cards">
                        <!-- CVE Details Card -->
                        <div class="col-lg-8">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Description</h3>
                                </div>
                                <div class="card-body">
                                    <p>${cveDetails.description || 'No description available'}</p>
                                </div>
                            </div>

                            <!-- Remediation Steps -->
                            ${remediationSteps.length > 0 ? html`
                                <div class="card mt-3">
                                    <div class="card-header">
                                        <h3 class="card-title">Remediation Steps</h3>
                                    </div>
                                    <div class="card-body">
                                        <ol>
                                            ${remediationSteps.map((step, idx) => html`
                                                <li class="mb-3">
                                                    <div class="fw-bold">${step.title}</div>
                                                    <div class="text-muted">${step.description}</div>
                                                </li>
                                            `)}
                                        </ol>
                                    </div>
                                </div>
                            ` : ''}

                            <!-- Affected Devices -->
                            ${affectedDevices.length > 0 ? html`
                                <div class="card mt-3">
                                    <div class="card-header">
                                        <h3 class="card-title">Affected Devices (${affectedDevices.length})</h3>
                                    </div>
                                    <div class="table-responsive">
                                        <table class="table table-vcenter card-table">
                                            <thead>
                                                <tr>
                                                    <th>Device</th>
                                                    <th>Status</th>
                                                    <th>Last Seen</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${affectedDevices.map(device => html`
                                                    <tr>
                                                        <td><a href="#!/devices/${device.deviceId}" class="text-reset">${device.name}</a></td>
                                                        <td>
                                                            <span class="badge bg-danger text-white">Vulnerable</span>
                                                        </td>
                                                        <td class="text-muted">${device.lastSeen || '-'}</td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Sidebar Metrics -->
                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-body">
                                    <h3 class="card-title mb-3">Metrics</h3>

                                    ${cveDetails.epss ? html`
                                        <div class="mb-3">
                                            <div class="d-flex align-items-center justify-content-between mb-2">
                                                <span class="text-muted">EPSS Score</span>
                                                <span class="fw-bold">${Math.round(cveDetails.epss * 100)}%</span>
                                            </div>
                                            <div class="progress progress-sm">
                                                <div class="progress-bar bg-danger" style="width: ${Math.round(cveDetails.epss * 100)}%"></div>
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${cveDetails.cvssScore ? html`
                                        <div class="mb-3">
                                            <div class="d-flex align-items-center justify-content-between mb-2">
                                                <span class="text-muted">CVSS Score</span>
                                                <span class="fw-bold">${cveDetails.cvssScore}</span>
                                            </div>
                                            <div class="progress progress-sm">
                                                <div class="progress-bar bg-warning" style="width: ${(cveDetails.cvssScore / 10) * 100}%"></div>
                                            </div>
                                        </div>
                                    ` : ''}

                                    <div class="mb-3">
                                        <span class="text-muted">Published</span>
                                        <div class="fw-bold">${cveDetails.publishedDate || '-'}</div>
                                    </div>

                                    <div class="mb-3">
                                        <span class="text-muted">Modified</span>
                                        <div class="fw-bold">${cveDetails.modifiedDate || '-'}</div>
                                    </div>

                                    ${cveDetails.references?.length > 0 ? html`
                                        <div>
                                            <span class="text-muted">References</span>
                                            <div class="mt-2">
                                                ${cveDetails.references.map(ref => html`
                                                    <a href="${ref.url}" target="_blank" class="d-block text-truncate text-blue mb-1">
                                                        ${ref.source || 'Reference'}
                                                    </a>
                                                `)}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
