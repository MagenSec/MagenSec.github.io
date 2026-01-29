/**
 * Main App - No build, no compile, just works!
 * Uses Preact + HTM from CDN
 */

import { auth } from './auth.js';
import { api } from './api.js';
import { orgContext } from './orgContext.js';
import { initRouter } from './router.js';
import { logger } from './config.js';
import keyboardShortcuts from './services/keyboardShortcuts.js';
import themeService from './services/themeService.js';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard/Dashboard.js';
import DevicesPage from './pages/devices/Devices.js';
import { DeviceDetailPage } from './pages/device-detail/DeviceDetail.js';
import { AnalystPage } from './pages/analyst/Analyst.js';
import { PosturePage } from './pages/posture/Posture.js';
import { AIPosturePage } from './pages/posture-ai/PostureAI.js';
// TEMPORARY: Wired up _unused/ pages for validation (will be removed or re-wired later)
// DISABLED: Causing 404 in production - _unused folder not deployed
// import { ThreatIntelPage } from './pages/_unused/threatIntel.js';
// import { VulnerabilitiesPage } from './pages/_unused/vulnerabilities.js';
// import { AlertsPage } from './pages/_unused/alerts.js';
// import { SecurityDashboardPage } from './pages/_unused/securityDashboard.js';
// import { ResponseActionsPage } from './pages/_unused/responseActions.js';
import { AssetsPage } from './pages/inventory/Assets.js';
import { AccountPage, SoftwareInventoryPage, HardwareInventoryPage, ComplianceReportPage, PlatformInsightsPage } from './pages/placeholders.js';
import { SettingsPage } from './pages/settings/Settings.js';
import { AuditPage } from './pages/audit/Audit.js';
import { BusinessPage } from './pages/siteAdmin/business/BusinessPage.js';
import { ManagePage } from './pages/siteAdmin/manage/ManagePage.js';
import { ActivityPage } from './pages/siteAdmin/activity/ActivityPage.js';
import { PreviewPage } from './pages/siteAdmin/preview/PreviewPage.js';
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
        // TEMPORARY: _unused/ pages for validation
        // DISABLED: Routes commented out - pages not deployed to production
        // case 'threat-intel':
        //     return html`<${ThreatIntelPage} />`;
        // case 'vulnerabilities':
        //     return html`<${VulnerabilitiesPage} />`;
        // case 'alerts':
        //     return html`<${AlertsPage} />`;
        // case 'security-dashboard':
        //     return html`<${SecurityDashboardPage} />`;
        // case 'response-actions':
        //     return html`<${ResponseActionsPage} />`;
        // Report Preview moved under Site Admin → Activity Reports (Preview tab)
        // case 'report-preview':
        //     return html`<${ReportPreviewPage} />`;
        case 'inventory':
            return html`<${AssetsPage} />`;
        case 'siteadmin/business':
            return html`<${BusinessPage} />`;
        case 'siteadmin/manage':
            return html`<${ManagePage} />`;
        case 'siteadmin/activity':
            return html`<${ActivityPage} />`;
        case 'siteadmin/preview':
            return html`<${PreviewPage} />`;
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
    
    // Initialize keyboard shortcuts
    keyboardShortcuts.initialize();
    
    // Initialize theme service
    themeService.initialize();
    
    // Add theme toggle to navbar (if exists)
    const navbar = document.querySelector('.navbar-nav');
    if (navbar) {
        const themeToggle = themeService.createToggleButton();
        themeToggle.classList.add('nav-link');
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.appendChild(themeToggle);
        navbar.appendChild(li);
    }
    
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
