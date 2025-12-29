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

    // Security Posture (protected)
    page('/posture', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'posture', ctx });
    });

    // Legacy alias: security-dashboard -> posture
    page('/security-dashboard', (ctx) => {
        page.redirect('/posture');
    });

    // Security routes (protected)
    page('/security/threat-intel', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'threat-intel', ctx });
    });

    page('/security/response', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'response-actions', ctx });
    });

    page('/security/vulnerabilities', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'vulnerabilities', ctx });
    });

    // Assets routes (protected)
    page('/assets/software', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'software-inventory', ctx });
    });

    page('/assets/hardware', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'hardware-inventory', ctx });
    });

    // Reports routes (protected)
    page('/reports/compliance', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'compliance-report', ctx });
    });

    // Advanced routes (protected)
    page('/alerts', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'alerts', ctx });
    });

    page('/platform/insights', (ctx) => {
        if (!ctx.isAuthenticated) {
            page.redirect('/');
            return;
        }
        renderApp({ page: 'platform-insights', ctx });
    });

    // Other placeholder routes (protected)
    const protectedRoutes = [
        ['inventory', 'inventory'],
        ['trends', 'trends'],
        ['audit', 'audit'],
        ['orgs', 'orgs'],
        ['members', 'members'],
        ['licenses', 'licenses'],
        ['account', 'account'],
        ['settings', 'settings']
    ];
    protectedRoutes.forEach(([path, pageName]) => {
        page(`/${path}`, (ctx) => {
            if (!ctx.isAuthenticated) {
                page.redirect('/');
                return;
            }
            renderApp({ page: pageName, ctx });
        });
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
            page.redirect('/dashboard');
        } else {
            page.redirect('/');
        }
    }
}
