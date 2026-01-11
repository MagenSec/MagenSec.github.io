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

    // Legacy alias: security-dashboard -> posture
    page('/security-dashboard', (ctx) => {
        page.redirect('/posture');
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

    // Site Admin (protected)
    page('/site-admin', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'site-admin', ctx });
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
