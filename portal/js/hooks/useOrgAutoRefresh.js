/**
 * useOrgAutoRefresh Hook
 * 
 * Automatically reloads component data when organization changes.
 * Uses window.preactHooks (from CDN) instead of ES module imports.
 * 
 * Usage:
 * ```javascript
 * export function MyPage() {
 *     const [data, setData] = useState(null);
 *     
 *     useOrgAutoRefresh(() => {
 *         // Load your org-specific data here
 *         loadData();
 *     });
 *     
 *     // ... rest of component
 * }
 * ```
 */

export function useOrgAutoRefresh(loadDataFn) {
    // Use preactHooks from window global (portal CDN pattern)
    const { useEffect } = window.preactHooks;
    const { orgContext } = window;

    useEffect(() => {
        if (!loadDataFn || typeof loadDataFn !== 'function') {
            console.error('[useOrgAutoRefresh] loadDataFn must be a function');
            return;
        }

        // Subscribe to org changes
        const unsubscribe = orgContext.onChange((org) => {
            console.debug('[useOrgAutoRefresh] Org changed to:', org?.orgId);
            loadDataFn();
        });

        // Load initial data
        loadDataFn();

        // Cleanup on unmount
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []); // Empty deps = run once on mount
}
