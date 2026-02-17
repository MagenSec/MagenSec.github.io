/**
 * Stale-While-Revalidate (SWR) Helper Module
 * Provides consistent caching pattern across all portal pages
 * 
 * Pattern:
 * 1. Load from localStorage immediately (even if stale)
 * 2. Call API with ?include=cached-summary for server-side cache (fast background fetch)
 * 3. On manual refresh: call API without parameters for fresh data
 * 
 * @example
 * // In component constructor
 * this.swr = new SWRHelper('dashboard', 30); // 30 min TTL
 * 
 * // In loadData method
 * const cached = this.swr.getCached();
 * if (cached) {
 *     this.setState({ data: cached, isStale: true });
 *     // Trigger background refresh with cached-summary parameter
 *     this.loadFreshWithCachedSummary();
 * }
 * 
 * // In background refresh method (called automatically)
 * const data = await api.getDashboard(orgId, { include: 'cached-summary' });
 * this.swr.setCached(data);
 * 
 * // In manual refresh method (user clicks button)
 * const data = await api.getDashboard(orgId); // No include parameter = fresh full data
 * this.swr.setCached(data);
 */
export class SWRHelper {
    constructor(cacheKey, ttlMinutes = 30) {
        this.cacheKey = cacheKey;
        this.ttlMinutes = ttlMinutes;
        this.TTL_MS = ttlMinutes * 60 * 1000;
    }

    /**
     * Get cached data (returns even if stale)
     * @returns { data, isStale, ageMs } or null if no cache
     */
    getCached() {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const isStale = ageMs >= this.TTL_MS;

            console.log(`[SWR ${this.cacheKey}] 📦 Cache HIT (${isStale ? 'STALE' : 'FRESH'}): age ${Math.round(ageMs / 1000)}s, TTL ${this.ttlMinutes}m`);

            return { data, isStale, ageMs };
        } catch (err) {
            console.warn(`[SWR ${this.cacheKey}] Cache read error:`, err);
            return null;
        }
    }

    /**
     * Save data to cache
     */
    setCached(data) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
            console.log(`[SWR ${this.cacheKey}] 💾 Cache SAVED`);
        } catch (err) {
            console.warn(`[SWR ${this.cacheKey}] Cache write error:`, err);
        }
    }

    /**
     * Clear cache (e.g., on logout or org change)
     */
    clearCache() {
        try {
            localStorage.removeItem(this.cacheKey);
            console.log(`[SWR ${this.cacheKey}] 🗑️  Cache CLEARED`);
        } catch (err) {
            console.warn(`[SWR ${this.cacheKey}] Cache clear error:`, err);
        }
    }

    /**
     * Check if cache is fresh (not stale)
     */
    isFresh() {
        const cached = this.getCached();
        return cached && !cached.isStale;
    }
}

/**
 * Standard SWR Pattern Implementation Guide
 * 
 * Copy this pattern to every page component:
 * 
 * ```javascript
 * import { SWRHelper } from '@utils/SWRHelper.js';
 * 
 * export class MyPage extends Component {
 *     constructor(props) {
 *         super(props);
 *         this.swr = new SWRHelper(`page_${this.constructor.name}`, 30);
 *         this.state = {
 *             data: null,
 *             loading: false,
 *             error: null,
 *             isRefreshingInBackground: false
 *         };
 *     }
 * 
 *     async loadData(forceRefresh = false) {
 *         // Step 1: Try cache first (skip if forcing refresh)
 *         if (!forceRefresh) {
 *             const cached = this.swr.getCached();
 *             if (cached) {
 *                 this.setState({
 *                     data: cached.data,
 *                     loading: false,
 *                     isRefreshingInBackground: true
 *                 });
 *                 // Step 2: Background refresh with cached-summary
 *                 this.refreshInBackground();
 *                 return;
 *             }
 *         }
 * 
 *         // Step 3: No cache or forced refresh - show loading spinner
 *         this.setState({ loading: true });
 * 
 *         try {
 *             // Step 4: Fetch fresh data (no include parameter)
 *             const response = await api.getMyData(this.orgId);
 *             this.swr.setCached(response.data);
 *             this.setState({ data: response.data, loading: false });
 *         } catch (err) {
 *             this.setState({ error: err.message, loading: false });
 *         }
 *     }
 * 
 *     async refreshInBackground() {
 *         try {
 *             // Background fetch with cached-summary (fast, uses server cache)
 *             const response = await api.getMyData(this.orgId, { 
 *                 include: 'cached-summary'  // KEY: Server returns cache if fresh
 *             });
 *             this.swr.setCached(response.data);
 *             this.setState({ 
 *                 data: response.data,
 *                 isRefreshingInBackground: false 
 *             });
 *         } catch (err) {
 *             console.warn('Background refresh failed:', err);
 *             this.setState({ isRefreshingInBackground: false });
 *         }
 *     }
 * 
 *     render() {
 *         return html`
 *             <div class="page-header">
 *                 <h1>My Page</h1>
 *                 ${this.state.isRefreshingInBackground ? html`
 *                     <span class="badge bg-info-lt text-info">
 *                         <span class="spinner-border spinner-border-sm"></span>
 *                         Refreshing...
 *                     </span>
 *                 ` : null}
 *                 <button onclick=${() => this.loadData(true)}>
 *                     ↻ Refresh
 *                 </button>
 *             </div>
 *             ${this.state.loading ? html`<div class="spinner"></div>` : null}
 *             ${this.state.data ? html`${this.renderData()}` : null}
 *         `;
 *     }
 * }
 * ```
 * 
 * KEY POINTS:
 * 1. Always load from cache first (instant UI)
 * 2. Use ?include=cached-summary for background refresh (server-side cache benefit)
 * 3. Manual refresh (forceRefresh=true) calls without parameters (full fresh data)
 * 4. Show "Refreshing..." badge during background fetch (UX transparency)
 * 5. Never block UI on fresh data - stale is better than waiting
 */
