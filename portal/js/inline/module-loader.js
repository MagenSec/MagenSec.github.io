// Externalized from index.html for CSP compliance.
// Sequential module loader for portal.

async function loadModule(src) {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = src;
    document.body.appendChild(script);
    return new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
    });
}

async function init() {
    try {
        // Load core modules first
        await Promise.all([
            loadModule('./js/config.js'),
            loadModule('./js/theme.js')
        ]);

        // Load auth and API layer
        await Promise.all([
            loadModule('./js/auth.js'),
            loadModule('./js/api.js')
        ]);

        // Load context and routing
        await Promise.all([
            loadModule('./js/orgContext.js'),
            loadModule('./js/router.js'),
            loadModule('./js/utils/constants.js'),
            loadModule('./js/utils/manifestCache.js'),
            loadModule('./js/toast.js'),
            loadModule('./js/utils/piiDecryption.js')
        ]);

        // Load components in parallel
        await Promise.all([
            loadModule('./js/components/ChartRenderer.js'),
            loadModule('./js/components/PromptSuggestions.js'),
            loadModule('./js/components/SearchableOrgSwitcher.js'),
            loadModule('./js/components/ErrorBoundary.js')
        ]);

        // Note: Page modules (Login, Dashboard, Devices, SiteAdmin, etc.) are NOT
        // pre-loaded separately here. They are imported in app.js (lines 12-35)
        // and automatically loaded via ES6 module system when app.js loads.
        // Pre-loading them as separate module scripts is unnecessary and could
        // cause path resolution issues, especially on case-sensitive filesystems.

        // Load app last
        await loadModule('./js/app.js');
        console.log('[App] All modules loaded successfully');
    } catch (error) {
        console.error('[App] Module loading failed:', error);
        document.getElementById('app').innerHTML = `
            <div class="empty">
                <div class="empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <p class="empty-title">Failed to load portal</p>
                <p class="empty-subtitle text-muted">${error.message}</p>
            </div>
        `;
    }
}

init();
