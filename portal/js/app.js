/**
 * Main App - No build, no compile, just works!
 * Uses Preact + HTM from CDN
 */

import { auth } from './auth.js';
import { initRouter } from './router.js';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { DevicesPage } from './pages/devices.js';

const { html, render } = window;

// App state
let currentPage = 'login';
let currentCtx = null;

// Main app component
function App() {
    // Check for OAuth callback
    if (window.location.search.includes('code=')) {
        return html`
            <div class="min-h-screen flex items-center justify-center">
                <div class="text-center">
                    <div class="spinner mx-auto mb-4"></div>
                    <p class="text-gray-600">Completing sign in...</p>
                </div>
            </div>
        `;
    }

    // Render current page
    switch (currentPage) {
        case 'login':
            return html`<${LoginPage} />`;
        case 'dashboard':
            return html`<${DashboardPage} />`;
        case 'devices':
            return html`<${DevicesPage} />`;
        default:
            return html`<${LoginPage} />`;
    }
}

// Render function
function renderApp(state) {
    if (state) {
        currentPage = state.page;
        currentCtx = state.ctx;
    }
    
    render(html`<${App} />`, document.getElementById('app'));
}

// Initialize
async function init() {
    console.log('[App] Initializing MagenSec Portal...');
    
    // Handle OAuth callback
    if (window.location.search.includes('code=')) {
        renderApp(); // Show loading
        try {
            await auth.handleCallback();
            console.log('[App] OAuth callback successful');
            // Use hash navigation instead of full page redirect
            window.location.hash = '#!/dashboard';
            // Clear query params
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            // Initialize router after callback
            initRouter(renderApp);
        } catch (error) {
            console.error('[App] OAuth callback failed:', error);
            alert('Login failed: ' + error.message);
            const basePath = window.location.pathname.includes('/portal/') ? '/portal/' : '/';
            window.location.href = basePath;
        }
        return;
    }
    
    // Initialize router
    initRouter(renderApp);
    
    // Listen for auth changes
    auth.onChange((session) => {
        console.log('[App] Auth changed:', session ? 'logged in' : 'logged out');
        renderApp();
    });
    
    console.log('[App] Ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
