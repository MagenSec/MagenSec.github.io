/**
 * Router - Page.js integration
 * No build step - uses CDN page.js
 */

import { auth } from './auth.js';

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
            page.redirect('/dashboard');
            return;
        }
        renderApp({ page: 'login', ctx });
    });

    // Explicit /login route support (normalize to "/")
    page('/login', (ctx) => {
        if (ctx.isAuthenticated) {
            page.redirect('/dashboard');
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
        renderApp({ page: 'dashboard', ctx });
    });

    // Unified Dashboard (protected) - Persona-driven dashboard
    page('/unified-dashboard', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'unified-dashboard', ctx });
    });

    // Devices (protected)
    page('/devices', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'devices', ctx });
    });

    // Device Detail (protected)
    page('/devices/:id', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'device-detail', ctx, params: { deviceId: ctx.params.id } });
    });

    // AI Analyst (protected)
    page('/analyst', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'analyst', ctx });
    });

    // Security Posture - New PostureEngine Snapshot (protected)
    page('/posture', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'posture', ctx });
    });

    // AI-Based Security Posture - Legacy AI Reports (protected)
    page('/posture-ai', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'posture-ai', ctx });
    });

    // TEMPORARY: _unused/ pages for validation (will be removed or re-wired later)
    page('/threat-intel', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'threat-intel', ctx });
    });

    page('/vulnerabilities', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'vulnerabilities', ctx });
    });

    page('/alerts', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'alerts', ctx });
    });

    page('/response-actions', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'response-actions', ctx });
    });

        // Report Preview moved under Site Admin → Activity Reports (Preview tab)

    // Legacy alias: security-dashboard -> _unused validation page (temporary)
    page('/security-dashboard', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'security-dashboard', ctx });
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

    // Account route REMOVED - account page is placeholder (login-based signup/profile)

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
            page.redirect('/dashboard');
        } else {
            page.redirect('/');
        }
    }
}
