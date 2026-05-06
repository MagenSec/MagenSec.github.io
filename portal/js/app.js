/**
 * Main App - No build, no compile, just works!
 * Uses Preact + HTM from CDN
 */

import { auth } from './auth.js';
import { api } from './api.js';
import { orgContext } from './orgContext.js';
import { rewindContext } from './rewindContext.js';
import { RewindBar } from './components/RewindBar.js';
import { initRouter } from './router.js';
import { logger } from './config.js';
import keyboardShortcuts from './services/keyboardShortcuts.js';
import themeService from './services/themeService.js';
import { LoginPage } from './pages/login.js';
import UnifiedDashboard from './pages/dashboard/UnifiedDashboard.js';
import DevicesPage from './pages/devices/Devices.js';
import { DeviceDetailPage } from './pages/device-detail/DeviceDetail.js';
import { ResponseActionsPage } from './pages/response-actions/ResponseActions.js';
import { AnalystPage } from './pages/analyst/Analyst.js';
import AIAnalystChatPage from './pages/ai/aiAnalystChat.js';
import AIReportsPage from './pages/ai/aiReports.js';
import { PosturePage } from './pages/posture/Posture.js';
import { PatchPosturePage } from './pages/posture/PatchPosture.js';
import { AIPosturePage } from './pages/posture-ai/PostureAI.js';
import { AssetsPage } from './pages/inventory/Assets.js';
import { SoftwareInventoryPage } from './pages/inventory/SoftwareInventory.js';
import { InventoryChangelogPage } from './pages/inventory/InventoryChangelog.js';
import { Vulnerabilities } from './pages/vulnerabilities/index.js';
import { AlertsPage } from './pages/alerts/Alerts.js';
import { CVEDetails } from './pages/cves/index.js';
import { ReviewPage } from './pages/placeholders.js';
import { AppVulnerabilityReviewPage } from './pages/siteAdmin/review/AppVulnerabilityReviewPage.js';
import { AccountPage } from './pages/account/Account.js';
import { CompliancePage } from './pages/compliance/Compliance.js';
import { AuditorPage } from './pages/auditor/Auditor.js';
import { ReportsPage } from './pages/reports/Reports.js';
import { ChatDrawer } from './components/ChatDrawer.js';
import { SettingsPage } from './pages/settings/Settings.js';
import { AuditPage } from './pages/audit/Audit.js';
import { BusinessPage } from './pages/siteAdmin/business/BusinessPage.js';
import { ManagePage } from './pages/siteAdmin/manage/ManagePage.js';
import { ActivityPage } from './pages/siteAdmin/activity/ActivityPage.js';
import { PreviewPage } from './pages/siteAdmin/preview/PreviewPage.js';
import { SearchableOrgSwitcher } from './components/SearchableOrgSwitcher.js';
import { DocumentationHub } from './pages/docs/DocumentationHub/index.js';
import { GettingStartedPage } from './pages/getting-started/GettingStarted.js';
import { ClientDevicePage } from './pages/client-device/ClientDevicePage.js';
import { PeerBenchmarkPage }      from './pages/add-ons/PeerBenchmark.js';
import { HygieneCoachPage }       from './pages/add-ons/HygieneCoach.js';
import { InsuranceReadinessPage } from './pages/add-ons/InsuranceReadiness.js';
import { CompliancePlusPage }     from './pages/add-ons/CompliancePlus.js';
import { SupplyChainPage }        from './pages/add-ons/SupplyChain.js';
import { SecurityOverview }       from './pages/security/SecurityOverview.js';
import { Upgrade }                from './pages/upgrade/Upgrade.js';
import { AttackChainPage }        from './pages/attack-chain/AttackChain.js';
import { AiResponsesAdminPage }   from './pages/siteAdmin/ai-responses/AiResponsesAdmin.js';

const { html, render } = window;

// Make auth, api, orgContext and rewindContext available globally for pages
window.auth = auth;
window.api = api;
window.orgContext = orgContext;
window.rewindContext = rewindContext;

// App state
let currentPage = 'login';
let currentCtx = null;
let currentParams = null;

function closeOpenTopDropdowns() {
    const toggles = document.querySelectorAll('.navbar [data-bs-toggle="dropdown"]');
    toggles.forEach((toggle) => {
        toggle.setAttribute('aria-expanded', 'false');
        if (typeof bootstrap !== 'undefined') {
            const instance = bootstrap.Dropdown.getInstance(toggle);
            if (instance) {
                instance.hide();
                return;
            }
        }
        const parent = toggle.closest('.dropdown');
        if (!parent) return;
        parent.querySelector('.dropdown-menu')?.classList.remove('show');
    });

    // SearchableOrgSwitcher is a custom dropdown (not Bootstrap-driven).
    // Toggle it closed so route transitions never leave the panel open.
    const openOrgPanel = document.querySelector('.navbar .org-switcher-panel.show');
    if (openOrgPanel) {
        const orgTrigger = openOrgPanel.closest('.dropdown')?.querySelector('button[aria-haspopup="listbox"]');
        if (orgTrigger) {
            orgTrigger.click();
        }
    }

    document.body.classList.remove('navbar-dropdown-open');
    document.body.classList.remove('org-switcher-open');
}

/**
 * applyRewindUiGuards — called whenever rewind state or org role changes.
 * Adds/removes blocking classes on mutating action buttons so CSS dims them.
 * The API layer and backend independently reject state-changing calls.
 */
function applyRewindUiGuards() {
    const active = rewindContext.isActive();
    const readOnlyMode = window.orgContext?.isReadOnly?.() && !window.orgContext?.isSiteAdmin?.();
    const MUTATING_SELECTORS = [
        '[data-mutates-state="true"]', '[data-capability-mutates="true"]',
        '[data-action="scan"]', '[data-action="check-updates"]',
        '[data-action="run-probe"]', '[data-action="refresh-inventory"]',
        '[data-action="add-device"]', '[data-action="remove-device"]',
        '[data-action="rotate-license"]', '[data-action="add-license"]',
        '.response-fire-btn',
        'form.settings-form button[type="submit"]',
    ].join(',');
    document.querySelectorAll(MUTATING_SELECTORS).forEach(el => {
        el.classList.toggle('rewind-blocked', active);
        el.classList.toggle('readonly-blocked', readOnlyMode);
        const blocked = active || readOnlyMode;
        if (blocked) {
            el.setAttribute('aria-disabled', 'true');
            el.setAttribute('title', readOnlyMode
                ? 'Auditor mode is read-only'
                : 'Disabled while viewing a Time Warp date');
            if ('disabled' in el && !el.disabled) {
                el.disabled = true;
                el.dataset.guardDisabled = 'true';
            }
        } else {
            if (el.dataset.guardDisabled === 'true') {
                el.disabled = false;
                delete el.dataset.guardDisabled;
            }
            el.removeAttribute('aria-disabled');
            el.removeAttribute('title');
        }
    });
}

function applyOrgUiRestrictions() {
    const body = document.body;
    if (!body) return;
    const orgType = orgContext.getCurrentOrg()?.type || 'Business';
    const isPersonal = orgType === 'Personal';
    const isEducation = orgType === 'Education';
    body.classList.toggle('org-personal', isPersonal);
    body.classList.toggle('org-education', isEducation);
    body.classList.toggle('org-business', !isPersonal && !isEducation);
    body.classList.toggle('readonly-active', orgContext.isReadOnly() && !orgContext.isSiteAdmin());

    const businessOnlyItems = document.querySelectorAll('.business-license-only');
    businessOnlyItems.forEach((item) => {
        const tooltip = item.getAttribute('data-business-tooltip') || 'Feature available in Business License only';
        const navTrigger = item.querySelector(':scope > .nav-link.dropdown-toggle');
        if (isPersonal) {
            item.setAttribute('aria-disabled', 'true');
            item.setAttribute('title', tooltip);
            if (navTrigger) {
                navTrigger.classList.add('disabled');
                navTrigger.setAttribute('aria-disabled', 'true');
                navTrigger.setAttribute('tabindex', '-1');
                if (navTrigger.hasAttribute('data-bs-toggle')) {
                    navTrigger.setAttribute('data-disabled-bs-toggle', navTrigger.getAttribute('data-bs-toggle') || 'dropdown');
                    navTrigger.removeAttribute('data-bs-toggle');
                }
                if (navTrigger.hasAttribute('href')) {
                    navTrigger.setAttribute('data-disabled-href', navTrigger.getAttribute('href') || '#');
                    navTrigger.removeAttribute('href');
                }
            }
        } else {
            item.removeAttribute('aria-disabled');
            item.removeAttribute('title');
            if (navTrigger) {
                navTrigger.classList.remove('disabled');
                navTrigger.removeAttribute('aria-disabled');
                navTrigger.removeAttribute('tabindex');
                if (navTrigger.hasAttribute('data-disabled-bs-toggle')) {
                    navTrigger.setAttribute('data-bs-toggle', navTrigger.getAttribute('data-disabled-bs-toggle') || 'dropdown');
                    navTrigger.removeAttribute('data-disabled-bs-toggle');
                }
                if (navTrigger.hasAttribute('data-disabled-href')) {
                    navTrigger.setAttribute('href', navTrigger.getAttribute('data-disabled-href') || '#');
                    navTrigger.removeAttribute('data-disabled-href');
                }
            }
        }
    });

    // Rewind nav: visible to SiteAdmins (already handled by site-admin-only) OR any user
    // with the Rewind add-on on their current org license.
    const rewindNavItem = document.getElementById('rewind-nav-item');
    if (rewindNavItem && auth.isAuthenticated()) {
        const user = auth.getUser();
        const isSiteAdmin = user?.userType === 'SiteAdmin';
        if (!isSiteAdmin && orgContext.hasRewind()) {
            rewindNavItem.style.display = '';
        } else if (!isSiteAdmin) {
            rewindNavItem.style.display = 'none';
        }
        // SiteAdmin visibility is handled by site-admin-only logic in setAuthenticationState
    }

    // Add-on nav gating is now handled via [data-addon] attributes in the
    // four-pillar nav structure.  The old standalone Add-ons dropdown has been
    // removed; individual feature items live inside Protect / Prove / Monitor.
    const isSiteAdminUser = auth.isAuthenticated() && auth.getUser()?.userType === 'SiteAdmin';

    // Personal org: hide nav items that are business-only
    const hideForPersonalNonAdmin = isPersonal && !isSiteAdminUser;
    const personalNavHideMap = {
        'nav-home-item':           false,
        'nav-prove-item':          hideForPersonalNonAdmin,
        'nav-audit-item':          hideForPersonalNonAdmin,
        'nav-insure-item':         hideForPersonalNonAdmin,
        'nav-magi-item':           hideForPersonalNonAdmin,
        'required-actions-nav':    hideForPersonalNonAdmin,
    };
    if (auth.isAuthenticated()) {
        for (const [id, hide] of Object.entries(personalNavHideMap)) {
            const el = document.getElementById(id);
            if (el) el.style.display = hide ? 'none' : '';
        }

        const homeLink = document.querySelector('#nav-home-item a.nav-link');
        if (homeLink) {
            homeLink.setAttribute('href', isPersonal ? '#!/security' : '#!/dashboard');
        }
    }

    // Add-on gated nav items: elements with [data-addon] attribute
    // SiteAdmin sees everything. Regular users see only items whose add-on is active.
    if (auth.isAuthenticated()) {
        const addonGatedItems = document.querySelectorAll('[data-addon]');
        addonGatedItems.forEach(el => {
            const addOnKey = el.getAttribute('data-addon');
            if (!addOnKey) return;
            const hasIt = isSiteAdminUser || (orgContext.hasAddOn?.(addOnKey) ?? false);
            // The static markup ships with a `ti-lock` glyph on every gated item; toggle its
            // visibility based on entitlement so an Ultimate/Site-Admin user does not see padlocks.
            const lockIcon = el.querySelector('.ti-lock');
            if (hasIt) {
                el.style.display = '';
                el.classList.remove('disabled');
                el.removeAttribute('aria-disabled');
                el.removeAttribute('title');
                if (lockIcon) lockIcon.style.display = 'none';
            } else if (hideForPersonalNonAdmin) {
                // Already hidden by personal-org logic above
                el.style.display = 'none';
            } else {
                // Business user without this add-on: show but disabled
                el.classList.add('disabled');
                el.setAttribute('aria-disabled', 'true');
                el.setAttribute('title', 'Not included in your current plan');
                if (lockIcon) lockIcon.style.display = '';
            }
        });

        // Business-nav-only items: hide for Personal, show for Business
        const businessNavItems = document.querySelectorAll('.business-nav-only');
        businessNavItems.forEach(el => {
            el.style.display = hideForPersonalNonAdmin ? 'none' : '';
        });
    }

}

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
            return html`<${UnifiedDashboard} />`;
        case 'getting-started':
            return html`<${GettingStartedPage} />`;
        case 'security':
            return html`
                <div>
                    <${SecurityOverview} />
                    ${orgContext.getCurrentOrg()?.type === 'Personal'
                        ? null
                        : html`<${ChatDrawer} contextHint="security threats and vulnerabilities" persona="secops" />`}
                </div>
            `;
        case 'devices':
            return html`<${DevicesPage} />`;
        case 'response-actions':
            return html`<${ResponseActionsPage} />`;
        case 'device-detail':
            return html`<${DeviceDetailPage} params=${{ deviceId: currentParams?.deviceId ?? currentCtx?.params?.deviceId ?? currentCtx?.params?.id }} />`;
        
        case 'analyst':
            return html`<${AIAnalystChatPage} />`;
        case 'ai-reports':
            return html`<${AIReportsPage} />`;
        case 'analyst-old':
            return html`<${AnalystPage} />`;
        case 'posture':
            return html`<${PosturePage} />`;
        case 'patch-posture':
            return html`
                <div>
                    <${PatchPosturePage} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="patch status report" persona="ciso" />`
                        : null}
                </div>
            `;
        case 'mission-brief':
            return html`<${AIPosturePage} />`;
        case 'posture-ai':
            return html`<${AIPosturePage} />`;
        case 'documentation-hub':
            return html`<${DocumentationHub} />`;
        case 'device-hub':
            return html`<${ClientDevicePage} />`;

        // Add-on pages
        case 'add-on/peer-benchmark':
            return html`<${PeerBenchmarkPage} />`;
        case 'add-on/hygiene-coach':
            return html`<${HygieneCoachPage} />`;
        case 'add-on/insurance-readiness':
            return html`<${InsuranceReadinessPage} />`;
        case 'add-on/compliance-plus':
            return html`<${CompliancePlusPage} />`;
        case 'add-on/supply-chain-intel':
            return html`<${SupplyChainPage} />`;
        case 'inventory':
            return html`
                <div>
                    <${AssetsPage} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="device inventory, asset management" persona="it_admin" />`
                        : null}
                </div>
            `;
        case 'apps':
            return html`
                <div>
                    <${SoftwareInventoryPage} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="software inventory and application vulnerabilities" persona="it_admin" />`
                        : null}
                </div>
            `;
        case 'changelog':
            return html`<${InventoryChangelogPage} />`;
        case 'alerts':
            return html`
                <div>
                    <${AlertsPage} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="security alerts, open findings, compliance gaps" persona="threat_hunter" />`
                        : null}
                </div>
            `;
        case 'vulnerabilities':
            return html`
                <div>
                    <${Vulnerabilities} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="CVE vulnerabilities, risk prioritization, and remediation" persona="threat_hunter" />`
                        : null}
                </div>
            `;
        case 'cves':
            return html`
                <div>
                    <${CVEDetails} cveId=${ currentParams?.cveId ?? currentCtx?.params?.cveId } />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="CVE threat intelligence and remediation guidance" persona="threat_hunter" />`
                        : null}
                </div>
            `;
        case 'siteadmin/business':
            return html`<${BusinessPage} />`;
        case 'siteadmin/manage':
            return html`<${ManagePage} />`;
        case 'siteadmin/activity':
            return html`<${ActivityPage} />`;
        case 'siteadmin/preview':
            return html`<${PreviewPage} />`;
        case 'reports/preview':
            return html`<${PreviewPage} />`;
        case 'compliance':
            return html`<${CompliancePage} />`;
        case 'auditor':
            return html`<${AuditorPage} />`;
        case 'attack-chain':
            return html`<${AttackChainPage} />`;
        case 'reports':
            return html`
                <div>
                    <${ReportsPage} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="security reports, delivery status, and report content" persona="ciso" />`
                        : null}
                </div>
            `;
        case 'settings':
            return html`<${SettingsPage} />`;
        case 'review':
            return html`<${ReviewPage} />`;
        case 'account':
            return html`<${AccountPage} />`;
        case 'audit':
            return html`
                <div>
                    <${AuditPage} />
                    ${orgContext.getCurrentOrg()?.type !== 'Personal'
                        ? html`<${ChatDrawer} contextHint="audit trail, remediation velocity, and patch compliance" persona="auditor" />`
                        : null}
                </div>
            `;
        case 'siteadmin/review':
            return html`<${AppVulnerabilityReviewPage} />`;
        case 'siteadmin/ai-responses':
            return html`<${AiResponsesAdminPage} />`;
        case 'upgrade':
            return html`<${Upgrade} feature=${currentParams?.feature} />`;
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

        applyOrgUiRestrictions();
        applyRewindUiGuards();
        
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
        body.classList.remove('org-personal', 'org-business');
        renderLoginOverlay();
    }
}

// Render counter to force unique keys
let renderCounter = 0;

// Render function
// Called by the router with {page, ctx, params}, or without args to re-render current page.
function renderApp(state) {
    if (state && state.page !== undefined) {
        currentPage = state.page;
        currentCtx = state.ctx;
        currentParams = state.params;
        logger.debug(`[App] Rendering page: ${currentPage} (render #${renderCounter})`);
    }

    // Close mobile hamburger menu on navigation
    const navbarCollapse = document.getElementById('navbar-menu');
    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
        const bsCollapse = bootstrap?.Collapse?.getInstance(navbarCollapse);
        if (bsCollapse) {
            bsCollapse.hide();
        } else {
            navbarCollapse.classList.remove('show');
        }
    }

    // Ensure nav dropdowns do not remain visually stuck open across route transitions.
    closeOpenTopDropdowns();

    // Always update authentication UI state
    const isAuthenticated = auth.isAuthenticated();
    // device-hub manages its own auth (device JWT) — suppress portal login overlay
    setAuthenticationState(currentPage === 'device-hub' ? true : isAuthenticated);
    
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

    // Mount rewind bar (always; it self-hides when inactive)
    const rewindRoot = document.getElementById('rewind-bar-root');
    if (rewindRoot) {
        render(html`<${RewindBar} />`, rewindRoot);
    }

    // Re-apply rewind guards after every render (new page buttons may have appeared in the DOM)
    setTimeout(applyRewindUiGuards, 0);
}

function hasUserPhoneConfigured() {
    try {
        const u = auth.getUser();
        const email = (u?.email || '').trim().toLowerCase();
        const phoneFromSession = (u?.phoneNumber || u?.phone || '').trim();
        if (phoneFromSession) {
            return true;
        }

        if (!email) {
            return false;
        }

        const phoneKey = `magensec_phone_${email}`;
        const cachedPhone = (localStorage.getItem(phoneKey) || '').trim();
        return cachedPhone.length > 0;
    } catch {
        return false;
    }
}

function maybeShowMissingPhoneToast(delayMs = 1200) {
    setTimeout(() => {
        const showToast = () => {
            window.toast?.show(
                `<div class="d-flex align-items-center gap-2 flex-wrap"><span><strong>Add your phone number</strong> &mdash; Set a contact number in your Account for security alerts.</span><a href="#!/account" class="btn btn-sm btn-warning">Open Account</a></div>`,
                'warning',
                0
            );
        };

        const cachePhoneIfPresent = (email, phone) => {
            const normalizedEmail = (email || '').trim().toLowerCase();
            const normalizedPhone = (phone || '').trim();
            if (!normalizedEmail || !normalizedPhone) {
                return;
            }
            localStorage.setItem(`magensec_phone_${normalizedEmail}`, normalizedPhone);
        };

        if (sessionStorage.getItem('phone_toast_shown')) {
            return;
        }

        if (hasUserPhoneConfigured()) {
            sessionStorage.setItem('phone_toast_shown', '1');
            return;
        }

        // Fallback check against backend profile to avoid false warnings when auth session lacks phone fields.
        const user = auth.getUser();
        const userEmail = (user?.email || '').trim();
        api.get('/api/v1/users/me').then((response) => {
            const profilePhone = (response?.data?.user?.phoneNumber || '').trim();
            if (profilePhone) {
                cachePhoneIfPresent(userEmail, profilePhone);
                sessionStorage.setItem('phone_toast_shown', '1');
                return;
            }

            sessionStorage.setItem('phone_toast_shown', '1');
            showToast();
        }).catch(() => {
            // If profile lookup fails, still surface the prompt.
            sessionStorage.setItem('phone_toast_shown', '1');
            showToast();
        });
    }, delayMs);
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

            // Redirect to Account page if saved default org is no longer accessible
            if (orgContext.defaultOrgMissing) {
                window.location.hash = '#!/account';
                setTimeout(() => window.toast?.show(
                    `<strong>Default organization not accessible</strong> &mdash; Your saved default organization is no longer available. Please select a new one in <a href="#!/account" style="color:inherit;font-weight:600;">Account</a>.`,
                    'warning', 0
                ), 800);
            }
            
            // Show authenticated state
            setAuthenticationState(true);

            const hasOrgsAfterOAuth = orgContext.getAvailableOrgs().length > 0;
            const isPersonalOrg = orgContext.getCurrentOrg()?.type === 'Personal';

            maybeShowMissingPhoneToast(1200);

            // Restore the pre-login deep link if one was captured (e.g., user followed
            // an email CTA like '#!/reports/preview?type=weekly&print=1'). Otherwise
            // fall back to the role-appropriate home route.
            let postLoginRedirect = null;
            try {
                postLoginRedirect = sessionStorage.getItem('post_login_redirect');
                if (postLoginRedirect) sessionStorage.removeItem('post_login_redirect');
            } catch (_) { /* noop */ }

            if (postLoginRedirect && postLoginRedirect.startsWith('#!')) {
                window.location.hash = postLoginRedirect;
            } else {
                window.location.hash = hasOrgsAfterOAuth
                    ? (isPersonalOrg ? '#!/security' : '#!/dashboard')
                    : '#!/getting-started';
            }
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

        if (orgContext.getAvailableOrgs().length === 0) {
            setTimeout(() => {
                window.location.hash = '#!/getting-started';
            }, 100);
        }

        // Redirect to Account page if saved default org is no longer accessible
        if (orgContext.defaultOrgMissing) {
            setTimeout(() => {
                window.location.hash = '#!/account';
                setTimeout(() => window.toast?.show(
                    `<strong>Default organization not accessible</strong> &mdash; Your saved default organization is no longer available. Please select a new one in <a href="#!/account" style="color:inherit;font-weight:600;">Account</a>.`,
                    'warning', 0
                ), 800);
            }, 500);
        }

        maybeShowMissingPhoneToast(1500);
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
    
    // Theme toggle is now in the top bar (index.html #theme-toggle-btn)
    // Wired by themeService below — no dynamic injection needed
    
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

    orgContext.onChange(() => {
        applyOrgUiRestrictions();
        applyRewindUiGuards();
        refreshActionsBadge();
    });

    // ── Required Actions badge ─────────────────────────────────────────────────
    // Poll alert summary on org change and every 5 minutes.
    // Updates the inline Actions pill: count, colour, and overdue glow.
    let _badgePollTimer = null;

    function updateActionsBadgeUi(totalOpen, hasOverdue) {
        const badge = document.getElementById('required-actions-badge');
        const btn = document.getElementById('required-actions-btn');
        const wrapper = document.getElementById('required-actions-nav');
        if (!badge || !btn || !wrapper) return;

        const isPersonalOrg = orgContext.getCurrentOrg()?.type === 'Personal';
        wrapper.style.display = auth.isAuthenticated() && !isPersonalOrg ? '' : 'none';
        btn.classList.remove('alert-active', 'alert-overdue');

        if (totalOpen > 0) {
            badge.textContent = totalOpen > 99 ? '99+' : String(totalOpen);
            badge.style.removeProperty('display');
            badge.className = `badge ms-1 ${hasOverdue ? 'bg-danger' : 'bg-warning'} text-white`;
            btn.classList.add('alert-active');
            if (hasOverdue) btn.classList.add('alert-overdue');
        } else {
            badge.style.setProperty('display', 'none', 'important');
        }
    }

    async function refreshActionsBadge() {
        const org = orgContext.getCurrentOrg();
        if (!org) {
            updateActionsBadgeUi(0, false);
            return;
        }

        const orgId = org.orgId;
        try {
            // Single call: AlertSummary now carries oldestOpenedBySeverity so we
            // can derive SLA-overdue locally without the parallel /alerts list
            // (which was Promise.all'd with the summary previously — silent
            // failures from either side hid the badge entirely on partial errors).
            const summaryResp = await api.getAlertSummary(orgId, { include: 'cached-summary' });
            if (!summaryResp?.success) return;

            const data = summaryResp.data || {};
            const totalOpen = data.totalOpen || 0;

            // SLA-overdue check uses the canonical per-severity oldest-opened
            // timestamps (UTC ISO strings, severity rank 1-4 keyed by canonical
            // label). A bucket is overdue if any open alert at that severity has
            // exceeded its policy SLA window.
            const SLA_DAYS = { Critical: 2, High: 7, Medium: 30, Low: 90 };
            const oldest = data.oldestOpenedBySeverity || {};
            const now = Date.now();
            const hasOverdue = Object.entries(SLA_DAYS).some(([sev, days]) => {
                const ts = oldest[sev];
                if (!ts) return false;
                const opened = new Date(ts).getTime();
                return Number.isFinite(opened) && (now - opened) > days * 86400000;
            });

            updateActionsBadgeUi(totalOpen, hasOverdue);
        } catch {
            // Badge is best-effort and should never break portal rendering.
        }
    }

    function scheduleActionsBadgePoll() {
        if (_badgePollTimer) clearInterval(_badgePollTimer);
        refreshActionsBadge();
        _badgePollTimer = setInterval(refreshActionsBadge, 5 * 60 * 1000); // every 5 min
    }

    // Start polling once authenticated
    auth.onChange((session) => {
        if (session) scheduleActionsBadgePoll();
        else {
            if (_badgePollTimer) { clearInterval(_badgePollTimer); _badgePollTimer = null; }
            updateActionsBadgeUi(0, false);
        }
    });
    if (auth.isAuthenticated()) scheduleActionsBadgePoll();

    // Re-render current page whenever rewind context changes (pages check rewindContext at render time)
    window.addEventListener('rewindChanged', () => {
        renderApp();
        applyRewindUiGuards();
    });

    // Wire Rewind navbar panel buttons (the panel HTML lives in index.html)
    wireRewindPanel();

    // Wire logout link
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }

    document.addEventListener('click', (e) => {
        const blocked = e.target.closest('.business-license-only');
        if (!blocked) {
            return;
        }
        if (!document.body.classList.contains('org-personal')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        window.toast?.show('Feature available in Business License only', 'warning', 3000);
    }, true);

    // Track open/close state of top navigation dropdowns for contextual layout shifts.
    document.addEventListener('shown.bs.dropdown', (e) => {
        const inNavbar = e.target?.closest?.('.navbar');
        if (inNavbar) {
            document.body.classList.add('navbar-dropdown-open');
        }
    });
    document.addEventListener('hidden.bs.dropdown', (e) => {
        const inNavbar = e.target?.closest?.('.navbar');
        if (!inNavbar) return;
        const anyOpen = document.querySelector('.navbar .dropdown-menu.show');
        if (!anyOpen) {
            document.body.classList.remove('navbar-dropdown-open');
        }
    });
    
    logger.info('[App] Ready');
}

/**
 * Wire the Rewind date-picker panel in the navbar.
 * The panel HTML lives in index.html (Bootstrap dropdown).
 * We populate #rewind-panel-inner and wire preset/activate/exit buttons.
 */
function wireRewindPanel() {
    const toKey = (d) => rewindContext.toDateKey(d);
    const toIso = (k) => k ? `${k.slice(0,4)}-${k.slice(4,6)}-${k.slice(6,8)}` : '';

    const today = new Date();
    today.setHours(0,0,0,0);
    const oldest = new Date(today);
    oldest.setDate(oldest.getDate() - 364);
    const maxIso = toIso(toKey(today));
    const minIso = toIso(toKey(oldest));

    let panelOpen = false;

    // ── Panel content ────────────────────────────────────────────────────────
    function renderPanel() {
        const panel  = document.getElementById('rewind-panel');
        const inner  = document.getElementById('rewind-panel-inner');
        if (!inner || !panel) return;

        const isActive     = rewindContext.isActive();
        const currentLabel = rewindContext.getDateLabel();
        const currentIso   = toIso(rewindContext.getDate());

        // Position panel under the trigger button (fixed to viewport)
        const trigger = document.getElementById('rewind-trigger');
        if (trigger) {
            const rect = trigger.getBoundingClientRect();
            panel.style.top  = rect.bottom + 'px';
            panel.style.right = Math.max(0, window.innerWidth - rect.right) + 'px';
            panel.style.left = 'auto';
        }

        // Theme colours
        const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const bg   = dark ? '#1e2535' : '#ffffff';
        const text = dark ? '#e2e8f0' : '#1a202c';
        const sub  = dark ? '#94a3b8' : '#64748b';
        const brd  = dark ? '#2d3748' : '#e2e8f0';

        // Days-ago helper for label
        const daysBack = isActive && currentIso ? (() => {
            const d = new Date(currentIso);
            const diff = Math.round((today - d) / 86400000);
            return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`;
        })() : '';

        inner.style.cssText = `background:${bg}; color:${text}; border-radius:0 0 12px 12px; border-top:3px solid #f59f00; padding:20px 18px;`;

        inner.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="animation:rewindPanelIcon 2s ease-in-out infinite; display:inline-flex; align-items:center; color:#f59f00;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" /></svg>
                    </span>
                    <div>
                        <div style="font-weight:800; font-size:0.95rem; letter-spacing:0.03em; color:${text};">Time Warp</div>
                        <div style="font-size:0.75rem; color:${sub};">Travel back to any date and see exactly what your auditors would have seen</div>
                    </div>
                </div>
                <button id="rewind-panel-close" style="background:none;border:none;color:${sub};cursor:pointer;font-size:1.1rem;line-height:1;padding:2px 6px;border-radius:4px;" title="Close">✕</button>
            </div>

            ${isActive ? `
            <div style="background:rgba(245,159,0,0.12); border:1.5px solid #f59f00; border-radius:8px; padding:10px 12px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
                <div>
                    <div style="font-size:0.68rem; font-weight:700; letter-spacing:0.08em; color:#f59f00; margin-bottom:2px;">TEMPORAL LOCK</div>
                    <div style="font-weight:800; font-size:0.92rem; color:${text};">${currentLabel}</div>
                    <div style="font-size:0.72rem; color:${sub};">${daysBack}</div>
                </div>
            <button id="rewind-exit-btn" style="background:#e53e3e; color:#fff; border:none; border-radius:8px; padding:5px 14px; font-weight:700; cursor:pointer; font-size:0.78rem; letter-spacing:0.04em; white-space:nowrap;">&#x2192; Present Day</button>
            </div>
            ` : ''}

            <div style="font-size:0.68rem; font-weight:700; letter-spacing:0.08em; color:${sub}; margin-bottom:8px;">MISSION PRESETS</div>
            <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:14px;">
                <button class="rewind-preset" data-days="1" style="flex:1;min-width:80px;padding:6px 4px;border:1.5px solid ${brd};border-radius:8px;background:${dark?'#2d3748':'#f8fafc'};color:${text};font-size:0.78rem;font-weight:600;cursor:pointer;text-align:center;transition:all 0.15s;">Yesterday</button>
                <button class="rewind-preset" data-days="7" style="flex:1;min-width:80px;padding:6px 4px;border:1.5px solid ${brd};border-radius:8px;background:${dark?'#2d3748':'#f8fafc'};color:${text};font-size:0.78rem;font-weight:600;cursor:pointer;text-align:center;transition:all 0.15s;">7 days ago</button>
                <button class="rewind-preset" data-days="30" style="flex:1;min-width:80px;padding:6px 4px;border:1.5px solid ${brd};border-radius:8px;background:${dark?'#2d3748':'#f8fafc'};color:${text};font-size:0.78rem;font-weight:600;cursor:pointer;text-align:center;transition:all 0.15s;">30 days</button>
                <button class="rewind-preset" data-days="90" style="flex:1;min-width:80px;padding:6px 4px;border:1.5px solid ${brd};border-radius:8px;background:${dark?'#2d3748':'#f8fafc'};color:${text};font-size:0.78rem;font-weight:600;cursor:pointer;text-align:center;transition:all 0.15s;">90 days</button>
                <button class="rewind-preset" data-days="180" style="flex:1;min-width:80px;padding:6px 4px;border:1.5px solid ${brd};border-radius:8px;background:${dark?'#2d3748':'#f8fafc'};color:${text};font-size:0.78rem;font-weight:600;cursor:pointer;text-align:center;transition:all 0.15s;">6 months</button>
                <button class="rewind-preset" data-days="364" style="flex:1;min-width:80px;padding:6px 4px;border:1.5px solid ${brd};border-radius:8px;background:${dark?'#2d3748':'#f8fafc'};color:${text};font-size:0.78rem;font-weight:600;cursor:pointer;text-align:center;transition:all 0.15s;">1 year ago</button>
            </div>

            <div style="font-size:0.68rem; font-weight:700; letter-spacing:0.08em; color:${sub}; margin-bottom:6px;">TARGET EPOCH</div>
            <input type="date" id="rewind-panel-date"
                style="width:100%; padding:7px 10px; border:1.5px solid ${brd}; border-radius:8px; background:${dark?'#2d3748':bg}; color:${text}; font-size:0.88rem; outline:none; color-scheme:${dark?'dark':'light'}; margin-bottom:12px;"
                value="${isActive ? currentIso : toIso(toKey(new Date(today.getTime() - 86400000)))}"
                min="${minIso}" max="${maxIso}" />

            <button id="rewind-activate-btn"
                style="width:100%; padding:9px; background:linear-gradient(135deg,#d97706,#f59f00); color:#fff; border:none; border-radius:8px; font-weight:800; font-size:0.88rem; letter-spacing:0.04em; cursor:pointer; box-shadow:0 3px 10px rgba(245,159,0,0.35); transition:opacity 0.15s;">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" /></svg>${isActive ? 'Update Epoch' : 'Engage Time Warp'}
            </button>

            <div style="margin-top:10px; font-size:0.68rem; color:${sub}; text-align:center;">
                Keyboard: <kbd style="background:${dark?'#374151':'#f1f5f9'};color:${text};padding:1px 5px;border-radius:3px;font-size:0.68rem;">←</kbd>
                <kbd style="background:${dark?'#374151':'#f1f5f9'};color:${text};padding:1px 5px;border-radius:3px;font-size:0.68rem;">→</kbd>
                step days &nbsp;|&nbsp;
                <kbd style="background:${dark?'#374151':'#f1f5f9'};color:${text};padding:1px 5px;border-radius:3px;font-size:0.68rem;">Esc</kbd>
                exit
            </div>
            <style>
                @keyframes rewindPanelIcon {
                    0%,100%{transform:translateX(0) scale(1)} 40%{transform:translateX(-3px) scale(1.1)} 60%{transform:translateX(1px) scale(1.05)}
                }
                .rewind-preset:hover { border-color:#f59f00 !important; color:#f59f00 !important; }
            </style>
        `;

        // Wire preset buttons
        inner.querySelectorAll('.rewind-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days, 10);
                const d = new Date(today);
                d.setDate(today.getDate() - days);
                const dateInput = inner.querySelector('#rewind-panel-date');
                if (dateInput) dateInput.value = toIso(toKey(d));
                // Highlight selected
                inner.querySelectorAll('.rewind-preset').forEach(b => b.style.borderColor = '');
                btn.style.borderColor = '#f59f00';
                btn.style.color = '#f59f00';
            });
        });

        inner.querySelector('#rewind-activate-btn')?.addEventListener('click', () => {
            const dateInput = inner.querySelector('#rewind-panel-date');
            const iso = dateInput?.value;
            const key = iso ? iso.replace(/-/g, '') : null;
            if (key && /^\d{8}$/.test(key)) {
                rewindContext.activate(key);
                closePanel();
            } else {
                window.toast?.show('Please select a valid date', 'warning', 2500);
            }
        });

        inner.querySelector('#rewind-exit-btn')?.addEventListener('click', () => {
            rewindContext.deactivate();
            closePanel();
        });

        inner.querySelector('#rewind-panel-close')?.addEventListener('click', closePanel);
    }

    // ── Panel open/close ─────────────────────────────────────────────────────
    function openPanel() {
        panelOpen = true;
        const panel = document.getElementById('rewind-panel');
        if (!panel) return;
        renderPanel();
        panel.style.display = 'block';
        panel.style.animation = 'rewindPanelDrop 0.22s cubic-bezier(0.34,1.4,0.64,1)';
        updateTriggerBtn();
    }

    function closePanel() {
        panelOpen = false;
        const panel = document.getElementById('rewind-panel');
        if (panel) panel.style.display = 'none';
        updateTriggerBtn();
    }

    // ── Trigger button visual state ──────────────────────────────────────────
    function updateTriggerBtn() {
        const btn   = document.getElementById('rewind-trigger');
        const icon  = document.getElementById('rewind-btn-icon');
        const label = document.getElementById('rewind-btn-label');
        if (!btn) return;

        const isActive = rewindContext.isActive();
        const dateLabel = rewindContext.getDateLabel();

        if (isActive) {
            btn.style.background      = 'linear-gradient(135deg,#d97706,#f59f00)';
            btn.style.color           = '#fff';
            btn.style.borderColor     = '#f59f00';
            btn.style.boxShadow       = '0 0 12px rgba(245,159,0,0.55)';
            btn.style.animation       = 'rewindBtnPulse 2.5s ease-in-out infinite';
            btn.setAttribute('data-active', 'true');
            if (icon)  icon.style.animation  = 'rewindIconSpin 3s ease-in-out infinite';
            if (label) label.textContent = dateLabel || 'Engaging';
        } else {
            // Restore dark-fire idle look (mirrors index.html base style)
            btn.style.background  = 'linear-gradient(135deg,#1c0a00 0%,#3d1800 55%,#1c0a00 100%)';
            btn.style.color       = '#f59f00';
            btn.style.borderColor = 'rgba(247,103,7,0.55)';
            btn.style.boxShadow   = '';
            btn.style.animation   = 'twIdleGlow 3.5s ease-in-out infinite';
            btn.removeAttribute('data-active');
            if (icon)  icon.style.animation  = 'rewindFlameFlicker 1.8s ease-in-out infinite';
            if (label) label.textContent = 'Time Warp';
        }

        // chevron direction when panel open
        if (panelOpen) {
            btn.setAttribute('aria-expanded', 'true');
        } else {
            btn.setAttribute('aria-expanded', 'false');
        }

        // Nav item active class
        const navItem = document.getElementById('rewind-nav-item');
        if (navItem) navItem.classList.toggle('rewind-nav-active', isActive);
    }

    // ── Wiring ───────────────────────────────────────────────────────────────
    const rewindTrigger = document.getElementById('rewind-trigger');
    if (rewindTrigger) {
        rewindTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            panelOpen ? closePanel() : openPanel();
        });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!panelOpen) return;
        const panel   = document.getElementById('rewind-panel');
        const trigger = document.getElementById('rewind-trigger');
        if (panel && !panel.contains(e.target) && !trigger?.contains(e.target)) {
            closePanel();
        }
    });

    // Close panel on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelOpen) closePanel();
    });

    // Update button + re-render panel whenever rewind context changes
    window.addEventListener('rewindChanged', () => {
        updateTriggerBtn();
        if (panelOpen) renderPanel();
    });

    // Initial state
    updateTriggerBtn();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


