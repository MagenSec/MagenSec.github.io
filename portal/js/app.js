/**
 * Main App - No build, no compile, just works!
 * Uses Preact + HTM from CDN
 */

import { auth } from './auth.js';
import { api } from './api.js';
import { orgContext } from './orgContext.js';
import { initRouter } from './router.js';
import { logger } from './config.js';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import DevicesPage from './pages/devices.js';
import { DeviceDetailPage } from './pages/device-detail.js';
import { AnalystPage } from './pages/analyst.js';
import { PosturePage } from './pages/posture-snapshot.js';
import { AIPosturePage } from './pages/posture-ai.js';
// Removed: threatIntel, responseActions, vulnerabilities, alerts pages (unreachable/placeholder)
import { AssetsPage } from './pages/assets.js';
import { AccountPage, SoftwareInventoryPage, HardwareInventoryPage, ComplianceReportPage, PlatformInsightsPage } from './pages/placeholders.js';
import { SettingsPage } from './pages/settings.js';
import { AuditPage } from './pages/audit.js';
import { SiteAdminPage } from './pages/siteAdmin.js';
import ReportPreviewPage from './pages/ReportPreviewPage.js';
import { SearchableOrgSwitcher } from './components/SearchableOrgSwitcher.js';

const { html, render } = window;

// Make auth, api, and orgContext available globally for pages
window.auth = auth;
window.api = api;
window.orgContext = orgContext;

// App state
let currentPage = 'login';
let currentCtx = null;
let currentParams = null;

// Main app component
function App() {
    // Check for OAuth callback
    if (window.location.search.includes('code=')) {
        return html`
            <div class="d-flex align-items-center justify-content-center" style="min-height: 100vh;">
                <div class="text-center">
                    <div class="spinner-border text-primary mb-3" role="status"></div>
                    <p class="text-muted">Completing sign in...</p>
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
        case 'device-detail':
            return html`<${DeviceDetailPage} params=${{ deviceId: currentParams?.deviceId ?? currentCtx?.params?.deviceId ?? currentCtx?.params?.id }} />`;
        
        case 'analyst':
            return html`<${AnalystPage} />`;
        case 'posture':
            return html`<${PosturePage} />`;
        case 'posture-ai':
            return html`<${AIPosturePage} />`;
        case 'report-preview':
            return html`<${ReportPreviewPage} />`;
        case 'inventory':
            return html`<${AssetsPage} />`;
        case 'site-admin':
            return html`<${SiteAdminPage} />`;
        case 'settings':
            return html`<${SettingsPage} />`;
        case 'audit':
            return html`<${AuditPage} />`;
        default:
            return html`<${LoginPage} />`;
    }
}

// Login overlay management
function renderLoginOverlay(authenticating = false) {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
        render(html`<${LoginPage} authenticating=${authenticating} />`, overlay);
    }
}

function setAuthenticationState(isAuthenticated) {
    const overlay = document.getElementById('login-overlay');
    const body = document.body;
    
    if (isAuthenticated) {
        // Hide overlay, show main app
        if (overlay) overlay.classList.remove('active');
        body.classList.remove('unauthenticated');
        // Update avatar if we have a user picture, otherwise show fallback
        try {
            const user = auth.getUser();
            const img = document.getElementById('user-avatar-img');
            const fallback = document.getElementById('user-avatar-fallback');
            if (user?.picture && img) {
                img.src = user.picture;
                img.style.display = 'block';
                if (fallback) fallback.style.display = 'none';
            } else {
                // No picture - show fallback with user initials
                if (img) img.style.display = 'none';
                if (fallback) {
                    // Calculate initials from name or email
                    let initials = '?';
                    if (user?.name) {
                        initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    } else if (user?.email) {
                        initials = user.email.substring(0, 2).toUpperCase();
                    }
                    fallback.textContent = initials;
                    fallback.style.display = 'flex';
                }
            }

            // Toggle Site Admin links
            const siteAdminElements = document.querySelectorAll('.site-admin-only');
            if (user?.userType === 'SiteAdmin') {
                siteAdminElements.forEach(el => el.style.display = '');
            } else {
                siteAdminElements.forEach(el => el.style.display = 'none');
            }
        } catch {}
        
        // Initialize Bootstrap dropdowns (needed for dynamic content)
        setTimeout(() => {
            if (typeof bootstrap !== 'undefined') {
                const dropdowns = document.querySelectorAll('[data-bs-toggle="dropdown"]');
                logger.info(`[App] Initializing ${dropdowns.length} Bootstrap dropdowns`);
                dropdowns.forEach(el => {
                    if (!bootstrap.Dropdown.getInstance(el)) {
                        new bootstrap.Dropdown(el);
                        logger.debug(`[App] Initialized dropdown:`, el);
                    }
                });
            } else {
                logger.error('[App] Bootstrap not loaded - dropdowns will not work!');
            }
        }, 100);
    } else {
        // Show overlay, hide main page
        if (overlay) overlay.classList.add('active');
        body.classList.add('unauthenticated');
        renderLoginOverlay();
    }
}

// Render counter to force unique keys
let renderCounter = 0;

// Render function
function renderApp(state = {}) {
    if (state) {
        currentPage = state.page;
        currentCtx = state.ctx;
        currentParams = state.params;
        logger.debug(`[App] Rendering page: ${currentPage} (render #${renderCounter})`);
    }
    // Always update authentication UI state
    const isAuthenticated = auth.isAuthenticated();
    setAuthenticationState(isAuthenticated);
    
    // Render org switcher in navbar if authenticated
    const orgSwitcherRoot = document.getElementById('org-switcher-root');
    if (orgSwitcherRoot) {
        if (isAuthenticated) {
            render(html`<${SearchableOrgSwitcher} />`, orgSwitcherRoot);
        } else {
            render(null, orgSwitcherRoot);
        }
    }
    
    // Force new component instance with unique key combining page + counter
    renderCounter++;
    const uniqueKey = `${currentPage}-${renderCounter}`;
    render(html`<${App} key=${uniqueKey} />`, document.getElementById('app'));
}

// Initialize
async function init() {
    logger.info('[App] Initializing MagenSec Portal...');
    
    // Handle OAuth callback
    if (window.location.search.includes('code=')) {
        setAuthenticationState(false); // Show loading in overlay
        renderLoginOverlay(true);
        try {
            await auth.handleCallback();
            logger.info('[App] OAuth callback successful');
            
            // Initialize org context after successful login
            await orgContext.initialize();
            logger.info('[App] Org context initialized');
            
            // Show authenticated state
            setAuthenticationState(true);
            
            // Use hash navigation instead of full page redirect
            window.location.hash = '#!/dashboard';
            // Clear query params
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            // Initialize router after callback
            initRouter(renderApp);
        } catch (error) {
            logger.error('[App] OAuth callback failed:', error);
            alert('Login failed: ' + error.message);
            setAuthenticationState(false);
            const basePath = window.location.pathname.includes('/portal/') ? '/portal/' : '/';
            window.location.href = basePath;
        }
        return;
    }
    
    // If already logged in (page refresh), initialize org context
    if (auth.isAuthenticated()) {
        logger.debug('[App] User already authenticated, initializing org context');
        await orgContext.initialize();
        setAuthenticationState(true);
    } else {
        // Show login overlay
        setAuthenticationState(false);
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

    // Wire logout link
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }
    
    logger.info('[App] Ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
