/**
 * Router - Page.js integration
 * No build step - uses CDN page.js
 */

import { auth } from './auth.js';

function isPersonalOrg() {
    return window.orgContext?.getCurrentOrg?.()?.type === 'Personal';
}

function getHomeRoute() {
    return isPersonalOrg() ? '/security' : '/dashboard';
}

function redirectToHome(page) {
    page.redirect(getHomeRoute());
}

function guardPersonalRestrictedRoute(ctx, page) {
    if (isPersonalOrg()) {
        redirectToHome(page);
        return true;
    }
    return false;
}

function guardAddOnRoute(page, addOnKey) {
    const hasAddOn = window.orgContext?.hasAddOn?.(addOnKey);
    if (!hasAddOn) {
        redirectToHome(page);
        return true;
    }
    return false;
}

export function initRouter(renderApp) {
    const page = window.page || window.Page;
    
    if (!page) {
        console.error('[Router] page.js not loaded');
        return;
    }
    
    // Middleware: Check authentication
    page('*', (ctx, next) => {
        ctx.auth = auth;
        ctx.isAuthenticated = auth.isAuthenticated();
        next();
    });

    // Login page (public). If already authenticated, redirect to dashboard
    page('/', (ctx) => {
        if (ctx.isAuthenticated) {
            const noOrg = window.orgContext?.getAvailableOrgs?.().length === 0;
            if (noOrg) {
                page.redirect('/getting-started');
                return;
            }
            redirectToHome(page);
            return;
        }
        renderApp({ page: 'login', ctx });
    });

    // Explicit /login route support (normalize to "/")
    page('/login', (ctx) => {
        if (ctx.isAuthenticated) {
            const noOrg = window.orgContext?.getAvailableOrgs?.().length === 0;
            if (noOrg) {
                page.redirect('/getting-started');
                return;
            }
            redirectToHome(page);
            return;
        }
        page.redirect('/');
    });

    // Dashboard (protected)
    page('/dashboard', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (isPersonalOrg()) {
            page.redirect('/security');
            return;
        }
        renderApp({ page: 'dashboard', ctx });
    });

    // Getting started (protected, no-org onboarding)
    page('/getting-started', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'getting-started', ctx });
    });

    // Security deep-dive (protected) - former /dashboard
    page('/security', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'security', ctx });
    });

    // Backward compat: /unified-dashboard redirects to /dashboard
    page('/unified-dashboard', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        page.redirect('/dashboard');
    });

    // Devices (protected)
    page('/devices', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'devices', ctx });
    });

    // Response Actions (protected)
    page('/response-actions', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        page.redirect('/security/response');
    });

    // Security -> Response submenu route (protected)
    page('/security/response', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'response-actions', ctx });
    });

    // Device Detail (protected)
    page('/devices/:id', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'device-detail', ctx, params: { deviceId: ctx.params.id } });
    });

    // CVE Detail (protected)
    page('/cves/:id', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'cves', ctx, params: { cveId: ctx.params.id } });
    });

    // AI Analyst (protected)
    page('/analyst', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'analyst', ctx });
    });

    // AI Reports (protected) - org-scoped report generation/listing (ai-analyst endpoints)
    // Route: #!/ai-reports
    page('/ai-reports', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'ai-reports', ctx });
    });

    // Security Posture - New PostureEngine Snapshot (protected)
    page('/posture', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'posture', ctx });
    });

    // Mission Briefing - AI reports command page (protected)
    page('/mission-brief', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'mission-brief', ctx });
    });

    // Backward-compatible alias for old route
    page('/posture-ai', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        page.redirect('/mission-brief');
    });

    // Add-on pages (protected, business-license only)
    page('/add-ons/peer-benchmark', (ctx) => {
        if (!ctx.isAuthenticated) { page.redirect('/'); return; }
        if (guardPersonalRestrictedRoute(ctx, page)) return;
        if (guardAddOnRoute(page, 'PeerBenchmark')) return;
        renderApp({ page: 'add-on/peer-benchmark', ctx });
    });
    page('/add-ons/hygiene-coach', (ctx) => {
        if (!ctx.isAuthenticated) { page.redirect('/'); return; }
        if (guardPersonalRestrictedRoute(ctx, page)) return;
        if (guardAddOnRoute(page, 'HygieneCoach')) return;
        renderApp({ page: 'add-on/hygiene-coach', ctx });
    });
    page('/add-ons/insurance-readiness', (ctx) => {
        if (!ctx.isAuthenticated) { page.redirect('/'); return; }
        if (guardPersonalRestrictedRoute(ctx, page)) return;
        if (guardAddOnRoute(page, 'InsuranceReadiness')) return;
        renderApp({ page: 'add-on/insurance-readiness', ctx });
    });
    page('/add-ons/compliance-plus', (ctx) => {
        if (!ctx.isAuthenticated) { page.redirect('/'); return; }
        if (guardPersonalRestrictedRoute(ctx, page)) return;
        if (guardAddOnRoute(page, 'CompliancePlus')) return;
        renderApp({ page: 'add-on/compliance-plus', ctx });
    });
    page('/add-ons/supply-chain-intel', (ctx) => {
        if (!ctx.isAuthenticated) { page.redirect('/'); return; }
        if (guardPersonalRestrictedRoute(ctx, page)) return;
        if (guardAddOnRoute(page, 'SupplyChainIntel')) return;
        renderApp({ page: 'add-on/supply-chain-intel', ctx });
    });

    // Compliance (protected)
    page('/compliance', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'compliance', ctx });
    });

    // Auditor (protected)
    page('/auditor', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'auditor', ctx });
    });

    // Reports (protected)
    page('/reports', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        if (guardPersonalRestrictedRoute(ctx, page)) {
            return;
        }
        renderApp({ page: 'reports', ctx });
    });

    // Review - dead pages catalog (protected)
    page('/review', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'review', ctx });
    });

    page('/vulnerabilities', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'vulnerabilities', ctx });
    });

    // Security routes REMOVED - threatIntel, response, vulnerabilities are placeholder/unreachable
    // Use: Analyst for AI-powered insights, Posture for security posture

    // Assets routes REMOVED - software-inventory, hardware-inventory are placeholder/unreachable

    // Reports routes REMOVED - compliance-report is placeholder/unreachable

    // Advanced routes REMOVED - alerts, platform-insights are placeholder/unreachable

    // Inventory (protected)
    page('/inventory', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'inventory', ctx });
    });

    // Site Admin - Business (protected)
    page('/siteadmin/business', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'siteadmin/business', ctx });
    });

    // Site Admin - Manage (protected)
    page('/siteadmin/manage', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'siteadmin/manage', ctx });
    });

    // Site Admin - Activity (protected)
    page('/siteadmin/activity', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'siteadmin/activity', ctx });
    });

    // Site Admin - Preview (protected)
    page('/siteadmin/preview', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'siteadmin/preview', ctx });
    });

    // Site Admin - MagenSec Hub (protected)
    page('/siteadmin/review', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'siteadmin/review', ctx });
    });

    // Audit (protected)
    page('/audit', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'audit', ctx });
    });

    // Members (protected)
    page('/members', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'audit', ctx }); // Embedded in audit page
    });

    // Licenses (protected)
    page('/licenses', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'settings', ctx }); // Embedded in settings page
    });

    // Settings (protected)
    page('/settings', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'settings', ctx });
    });

    // Documentation Hub (public, no auth required)
    page('/docs', (ctx) => {
        renderApp({ page: 'documentation-hub', ctx });
    });

    // Device hub direct routes (canonical + legacy alias)
    page('/device-hub.html', (ctx) => {
        renderApp({ page: 'device-hub', ctx });
    });

    // Account (protected)
    page('/account', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'account', ctx });
    });

    // Start router with hash-bang mode
    // Set base to /portal/ for GitHub Pages, or current directory
    const basePath = window.location.pathname.endsWith('/portal/') || window.location.pathname.endsWith('/portal') 
        ? window.location.pathname.replace(/\/portal\/?$/, '/portal/')
        : '/';
    
    page.base(basePath);
    page({ hashbang: true });
    
    console.log('[Router] Initialized with hash-bang routing, base:', basePath);
    
    // Ensure we have a default route if at base
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#!/') {
        if (auth.isAuthenticated()) {
            const noOrg = window.orgContext?.getAvailableOrgs?.().length === 0;
            if (noOrg) {
                page.redirect('/getting-started');
            } else {
                redirectToHome(page);
            }
        } else {
            page.redirect('/');
        }
    }
}
