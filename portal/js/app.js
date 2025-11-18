/**
 * Main App - No build, no compile, just works!
 * Uses Preact + HTM from CDN
 */

import { auth } from './auth.js';
import { orgContext } from './orgContext.js';
import { initRouter } from './router.js';
import { logger } from './config.js';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard-v2.js';
import { DevicesPage } from './pages/devices.js';
import { AnalystPage } from './pages/analyst.js';
import { SecurityDashboardPage } from './pages/securityDashboard.js';

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
        case 'analyst':
            return html`<${AnalystPage} />`;
        case 'security-dashboard':
            return html`<${SecurityDashboardPage} />`;
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
    logger.info('[App] Initializing MagenSec Portal...');
    
    // Handle OAuth callback
    if (window.location.search.includes('code=')) {
        renderApp(); // Show loading
        try {
            await auth.handleCallback();
            logger.info('[App] OAuth callback successful');
            
            // Initialize org context after successful login
            await orgContext.initialize();
            logger.info('[App] Org context initialized');
            
            // Use hash navigation instead of full page redirect
            window.location.hash = '#!/dashboard';
            // Clear query params
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            // Initialize router after callback
            initRouter(renderApp);
        } catch (error) {
            logger.error('[App] OAuth callback failed:', error);
            alert('Login failed: ' + error.message);
            const basePath = window.location.pathname.includes('/portal/') ? '/portal/' : '/';
            window.location.href = basePath;
        }
        return;
    }
    
    // If already logged in (page refresh), initialize org context
    if (auth.isAuthenticated()) {
        logger.debug('[App] User already authenticated, initializing org context');
        await orgContext.initialize();
    }
    
    // Initialize router
    initRouter(renderApp);
    
    // Listen for auth changes
    auth.onChange((session) => {
        logger.debug('[App] Auth changed:', session ? 'logged in' : 'logged out');
        if (session) {
            // Re-initialize org context when user logs in
            orgContext.initialize().catch(err => {
                logger.error('[App] Org context init failed:', err);
            });
        }
        renderApp();
    });
    
    logger.info('[App] Ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
