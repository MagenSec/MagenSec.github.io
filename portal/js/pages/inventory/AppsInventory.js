/**
 * Apps Inventory Page - Installed applications across devices
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

export class AppsInventoryPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            apps: [],
            loading: true,
            error: null,
            searchTerm: '',
            sortColumn: 'installations',
            sortDirection: 'desc',
            isRefreshingInBackground: false,
            totalApps: 0,
            vulnerableApps: 0
        };
    }

    async componentDidMount() {
        this.unsubscribeOrg = orgContext.onChange(() => this.loadApps());
        await this.loadApps();
    }

    componentWillUnmount() {
        if (this.unsubscribeOrg) {
            this.unsubscribeOrg();
        }
    }

    /**
     * SWR Cache Helper: Get cached apps data
     * Returns { data, isStale } - NEVER deletes expired cache
     */
    getCachedApps(key, ttlMinutes = 15) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = ttlMinutes * 60 * 1000;
            const isStale = ageMs >= TTL_MS;

            if (isStale) {
                console.log(`[AppsInventory] 📦 Cache HIT (STALE): ${key} (age: ${Math.round(ageMs/1000)}s, TTL: ${ttlMinutes}m)`);
            } else {
                console.log(`[AppsInventory] 📦 Cache HIT (FRESH): ${key} (age: ${Math.round(ageMs/1000)}s)`);
            }
            return { data, isStale };
        } catch (err) {
            console.warn('[AppsInventory] Cache read error:', err);
        }
        return null;
    }

    /**
     * SWR Cache Helper: Save apps to cache
     */
    setCachedApps(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (err) {
            console.warn('[AppsInventory] Cache write error:', err);
        }
    }

    /**
     * SWR Pattern: Load from cache first, then fetch fresh in background
     */
    async loadApps(forceRefresh = false) {
        const currentOrg = orgContext.getCurrentOrg();
        const orgId = currentOrg?.orgId;
        if (!orgId) {
            this.setState({ error: 'Organization not found', loading: false });
            return;
        }

        const cacheKey = `apps_${orgId}`;

        // Step 1: Try cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = this.getCachedApps(cacheKey);
            if (cached) {
                console.log('[AppsInventory] ⚡ Loading from cache immediately...');
                this.setState({
                    apps: cached.data.apps || [],
                    totalApps: cached.data.totalApps || 0,
                    vulnerableApps: cached.data.vulnerableApps || 0,
                    loading: false,
                    isRefreshingInBackground: true,
                    error: null
                });
                // Continue to background refresh (don't return!)
            }
        }

        // Step 2: Show loading state if no cache
        if (!this.state.apps.length) {
            this.setState({ loading: true, error: null });
        }

        try {
            // Step 3: Fetch fresh data
            const response = await api.get(`/api/v1/orgs/${orgId}/apps?include=cached-summary`);

            if (response.success) {
                const data = {
                    apps: response.data?.apps || [],
                    totalApps: response.data?.totalApps || 0,
                    vulnerableApps: response.data?.vulnerableApps || 0
                };

                // Cache the response
                this.setCachedApps(cacheKey, data);

                // Update UI with fresh data
                this.setState({
                    apps: data.apps,
                    totalApps: data.totalApps,
                    vulnerableApps: data.vulnerableApps,
                    loading: false,
                    isRefreshingInBackground: false,
                    error: null
                });

                console.log('[AppsInventory] ✅ Fresh data loaded from API');
            } else {
                throw new Error(response.message || 'Failed to load apps');
            }
        } catch (error) {
            console.error('[AppsInventory] Load failed:', error);
            // Still show cached data if available, even on error
            if (this.state.apps.length === 0) {
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

    filterAndSortApps() {
        let filtered = this.state.apps;

        // Apply search filter
        if (this.state.searchTerm) {
            const term = this.state.searchTerm.toLowerCase();
            filtered = filtered.filter(app =>
                app.name?.toLowerCase().includes(term) ||
                app.publisher?.toLowerCase().includes(term) ||
                app.version?.toLowerCase().includes(term)
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aVal = a[this.state.sortColumn] || 0;
            let bVal = b[this.state.sortColumn] || 0;

            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();

            const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            return this.state.sortDirection === 'asc' ? cmp : -cmp;
        });

        return filtered;
    }

    handleSort(column) {
        this.setState({
            sortColumn: column,
            sortDirection: this.state.sortColumn === column && this.state.sortDirection === 'asc' ? 'desc' : 'asc'
        });
    }

    getRiskBadge(riskScore) {
        if (riskScore >= 7) return 'danger';
        if (riskScore >= 4) return 'warning';
        return 'success';
    }

    render() {
        const { loading, error, searchTerm, isRefreshingInBackground, totalApps, vulnerableApps } = this.state;
        const filtered = this.filterAndSortApps();

        if (loading && !this.state.apps.length) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error && !this.state.apps.length) {
            return html`<div class="alert alert-danger"><h4 class="alert-title">Error</h4><div>${error}</div></div>`;
        }

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Applications</h2>
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle mt-2">
                                <span class="text-muted">${totalApps} applications · ${vulnerableApps} with vulnerabilities</span>
                            </div>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-primary" onClick=${() => this.loadApps(true)}>
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
                            <div class="input-group">
                                <span class="input-group-text">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>
                                </span>
                                <input type="text" class="form-control" placeholder="Search applications..."
                                       value=${searchTerm}
                                       onInput=${(e) => this.setState({ searchTerm: e.target.value })} />
                            </div>
                        </div>

                        ${filtered.length === 0 ? html`
                            <div class="empty">
                                <div class="empty-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /></svg>
                                </div>
                                <p class="empty-title">No applications found</p>
                            </div>
                        ` : html`
                            <div class="table-responsive">
                                <table class="table table-vcenter card-table">
                                    <thead>
                                        <tr>
                                            <th style="cursor: pointer;" onClick=${() => this.handleSort('name')}>
                                                Name
                                                ${this.state.sortColumn === 'name' ? html`<span class="text-muted ms-2">${this.state.sortDirection === 'asc' ? '↑' : '↓'}</span>` : ''}
                                            </th>
                                            <th style="cursor: pointer;" onClick=${() => this.handleSort('publisher')}>
                                                Publisher
                                                ${this.state.sortColumn === 'publisher' ? html`<span class="text-muted ms-2">${this.state.sortDirection === 'asc' ? '↑' : '↓'}</span>` : ''}
                                            </th>
                                            <th style="cursor: pointer;" onClick=${() => this.handleSort('version')}>
                                                Version
                                                ${this.state.sortColumn === 'version' ? html`<span class="text-muted ms-2">${this.state.sortDirection === 'asc' ? '↑' : '↓'}</span>` : ''}
                                            </th>
                                            <th style="cursor: pointer;" onClick=${() => this.handleSort('installations')}>
                                                Devices
                                                ${this.state.sortColumn === 'installations' ? html`<span class="text-muted ms-2">${this.state.sortDirection === 'asc' ? '↑' : '↓'}</span>` : ''}
                                            </th>
                                            <th style="cursor: pointer;" onClick=${() => this.handleSort('vulnerabilityCount')}>
                                                CVEs
                                                ${this.state.sortColumn === 'vulnerabilityCount' ? html`<span class="text-muted ms-2">${this.state.sortDirection === 'asc' ? '↑' : '↓'}</span>` : ''}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${filtered.map(app => html`
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        <span class="avatar avatar-sm bg-blue-lt text-blue">
                                                            ${app.name?.[0]?.toUpperCase() || '?'}
                                                        </span>
                                                        <div>
                                                            <a href="#" class="text-reset font-weight-medium">${app.name}</a>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-muted">${app.publisher || '-'}</td>
                                                <td class="text-muted">${app.version || '-'}</td>
                                                <td class="text-muted">${app.installations || 0}</td>
                                                <td>
                                                    ${app.vulnerabilityCount > 0 ? html`
                                                        <span class="badge bg-danger text-white">${app.vulnerabilityCount}</span>
                                                    ` : html`
                                                        <span class="badge bg-success text-white">0</span>
                                                    `}
                                                </td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}
