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

import { orgContext } from '@orgContext';
import { CveDetailsContent, loadCveDetailsData } from '@components/CveDetailsShared.js';

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
            affectedApplications: [],
            impact: null,
            remediationSteps: [],
            activeTab: 'overview',
            selectedRemediationApp: ''
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
                    affectedApplications: cached.data.affectedApplications || [],
                    impact: cached.data.impact || null,
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
            const cve = await loadCveDetailsData(orgId, this.state.cveId);

            const remediationFromRefs = Array.isArray(cve?.references)
                ? cve.references
                    .filter(ref => ref && (ref.title || ref.Title || ref.Url || ref.url))
                    .slice(0, 10)
                    .map(ref => ({
                        title: ref.Title || ref.title || 'Reference',
                        description: ref.Url || ref.url || ''
                    }))
                : [];

            const data = {
                cveDetails: cve,
                affectedDevices: cve?.affectedDevices || [],
                affectedApplications: cve?.affectedApplications || [],
                impact: cve?.impact || null,
                remediationSteps: remediationFromRefs
            };

            this.setCachedCVEDetails(cacheKey, data);

            this.setState({
                cveDetails: data.cveDetails,
                affectedDevices: data.affectedDevices,
                affectedApplications: data.affectedApplications,
                impact: data.impact,
                remediationSteps: data.remediationSteps,
                loading: false,
                isRefreshingInBackground: false,
                error: null
            });

            console.log('[CVEDetails] ✅ Fresh data loaded from API');
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
        const { loading, error, cveDetails, isRefreshingInBackground } = this.state;

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
        const hasExploit = cveDetails.isKev || cveDetails.hasExploit || cveDetails.knownExploit || cveDetails.epssScore > 0.5;

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
                    <div class="card">
                        <div class="card-body">
                            <${CveDetailsContent}
                                cveData=${cveDetails}
                                loading=${loading}
                                error=${error}
                                activeTab=${this.state.activeTab}
                                onTabChange=${(tab) => this.setState({ activeTab: tab })}
                                selectedRemediationApp=${this.state.selectedRemediationApp}
                                onSelectRemediationApp=${(value) => this.setState({ selectedRemediationApp: value })}
                            />
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
