// MagenSec Hub Single Page Application Router
class MagenSecRouter {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.history = [];
        this.beforeNavigateHooks = [];
        this.afterNavigateHooks = [];
        
        // Initialize routing
        this.initializeRoutes();
        this.setupEventListeners();
        
        // Handle initial page load
        this.handleInitialLoad();
    }
    
    // ======================
    // Initialization
    // ======================
    
    initialize() {
        // Router is already initialized in constructor
        // This method provides a promise-based interface for app initialization
        return Promise.resolve();
    }
    
    // ======================
    // Route Definition
    // ======================
    
    initializeRoutes() {
        // Define all application routes
        this.addRoute('/auth', {
            component: 'auth',
            requireAuth: false,
            title: 'Sign In - MagenSec Hub'
        });
        
        this.addRoute('/dashboard', {
            component: 'dashboard',
            requireAuth: true,
            title: 'Dashboard - MagenSec Hub',
            icon: 'fas fa-tachometer-alt'
        });
        
        this.addRoute('/threats', {
            component: 'threats',
            requireAuth: true,
            title: 'Threat Management - MagenSec Hub',
            icon: 'fas fa-shield-virus'
        });
        
        this.addRoute('/threats/:id', {
            component: 'threat-details',
            requireAuth: true,
            title: 'Threat Details - MagenSec Hub'
        });
        
        this.addRoute('/devices', {
            component: 'devices',
            requireAuth: true,
            title: 'Device Management - MagenSec Hub',
            icon: 'fas fa-laptop'
        });
        
        this.addRoute('/devices/:id', {
            component: 'device-details',
            requireAuth: true,
            title: 'Device Details - MagenSec Hub'
        });
        
        this.addRoute('/compliance', {
            component: 'compliance',
            requireAuth: true,
            title: 'Compliance Center - MagenSec Hub',
            icon: 'fas fa-clipboard-check'
        });
        
        this.addRoute('/reports', {
            component: 'reports',
            requireAuth: true,
            title: 'Reports & Analytics - MagenSec Hub',
            icon: 'fas fa-chart-line'
        });
        
        this.addRoute('/profile', {
            component: 'profile',
            requireAuth: true,
            title: 'User Profile - MagenSec Hub'
        });
        
        this.addRoute('/settings', {
            component: 'settings',
            requireAuth: true,
            title: 'Settings - MagenSec Hub',
            requirePermission: 'manage'
        });
        
        // Default route
        this.addRoute('/', {
            redirect: '/dashboard'
        });
        
        // 404 route
        this.addRoute('/404', {
            component: '404',
            requireAuth: false,
            title: 'Page Not Found - MagenSec Hub'
        });
    }
    
    addRoute(path, config) {
        this.routes.set(path, {
            path,
            ...config
        });
    }
    
    // ======================
    // Navigation
    // ======================
    
    navigate(path, options = {}) {
        // Normalize path
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        
        // Check if this is the same route
        if (this.currentRoute && this.currentRoute.path === path && !options.force) {
            return;
        }
        
        // Run before navigate hooks
        for (const hook of this.beforeNavigateHooks) {
            const result = hook(path, this.currentRoute);
            if (result === false) {
                return; // Navigation cancelled
            }
        }
        
        try {
            // Find matching route
            const route = this.findRoute(path);
            if (!route) {
                this.navigate('/404');
                return;
            }
            
            // Handle redirects
            if (route.redirect) {
                this.navigate(route.redirect, options);
                return;
            }
            
            // Check authentication
            if (route.requireAuth && !window.MagenSecAuth.isAuthenticated()) {
                // Store intended destination
                sessionStorage.setItem('magensec_intended_route', path);
                this.navigate('/auth');
                return;
            }
            
            // Check permissions
            if (route.requirePermission && !window.MagenSecAuth.hasPermission(route.requirePermission)) {
                window.MagenSecUI.showToast('You do not have permission to access this page', 'error');
                this.navigate('/dashboard');
                return;
            }
            
            // Extract route parameters
            const params = this.extractParams(route.path, path);
            
            // Update history
            if (!options.replace) {
                this.history.push({
                    path: this.currentRoute?.path || '/',
                    timestamp: Date.now()
                });
            }
            
            // Update current route
            this.currentRoute = {
                ...route,
                params,
                query: this.parseQuery(path)
            };
            
            // Update browser history
            if (options.replace) {
                window.history.replaceState({ path }, '', `#${path}`);
            } else {
                window.history.pushState({ path }, '', `#${path}`);
            }
            
            // Update page title
            if (route.title) {
                document.title = route.title;
            }
            
            // Load component
            this.loadComponent(route.component, this.currentRoute);
            
            // Update navigation state
            this.updateNavigationState();
            
            // Run after navigate hooks
            for (const hook of this.afterNavigateHooks) {
                hook(this.currentRoute, path);
            }
            
        } catch (error) {
            console.error('Navigation error:', error);
            window.MagenSecUI.showToast('Navigation failed', 'error');
        }
    }
    
    back() {
        if (this.history.length > 0) {
            const previousRoute = this.history.pop();
            this.navigate(previousRoute.path, { replace: true });
        } else {
            this.navigate('/dashboard');
        }
    }
    
    refresh() {
        if (this.currentRoute) {
            this.navigate(this.currentRoute.path, { force: true });
        }
    }
    
    // ======================
    // Route Matching
    // ======================
    
    findRoute(path) {
        // Remove query string for matching
        const pathWithoutQuery = path.split('?')[0];
        
        // Try exact match first
        if (this.routes.has(pathWithoutQuery)) {
            return this.routes.get(pathWithoutQuery);
        }
        
        // Try parameter matching
        for (const [routePath, route] of this.routes.entries()) {
            if (this.isParameterizedRoute(routePath) && this.matchesParameterizedRoute(routePath, pathWithoutQuery)) {
                return route;
            }
        }
        
        return null;
    }
    
    isParameterizedRoute(routePath) {
        return routePath.includes(':');
    }
    
    matchesParameterizedRoute(routePath, actualPath) {
        const routeParts = routePath.split('/');
        const actualParts = actualPath.split('/');
        
        if (routeParts.length !== actualParts.length) {
            return false;
        }
        
        for (let i = 0; i < routeParts.length; i++) {
            const routePart = routeParts[i];
            const actualPart = actualParts[i];
            
            if (!routePart.startsWith(':') && routePart !== actualPart) {
                return false;
            }
        }
        
        return true;
    }
    
    extractParams(routePath, actualPath) {
        const params = {};
        const routeParts = routePath.split('/');
        const actualParts = actualPath.split('?')[0].split('/');
        
        for (let i = 0; i < routeParts.length; i++) {
            const routePart = routeParts[i];
            if (routePart.startsWith(':')) {
                const paramName = routePart.slice(1);
                params[paramName] = actualParts[i];
            }
        }
        
        return params;
    }
    
    parseQuery(path) {
        const queryString = path.split('?')[1];
        if (!queryString) return {};
        
        const params = {};
        queryString.split('&').forEach(param => {
            const [key, value] = param.split('=');
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });
        
        return params;
    }
    
    // ======================
    // Component Loading
    // ======================
    
    async loadPageComponent(pageName) {
        if (!window[`${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Page`]) {
            // Dynamically load the page component
            const script = document.createElement('script');
            script.src = `${window.MagenSecConfig.ui.assetPath}/js/pages/${pageName}.js`;
            script.async = true;
            
            return new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    }

    async loadComponent(componentName, route) {
        try {
            // Show loading state
            this.showLoadingState();
            
            // Load component based on type
            switch (componentName) {
                case 'auth':
                    this.showAuthView();
                    break;
                case 'dashboard':
                    await this.loadPageComponent('dashboard');
                    await window.DashboardPage.render(route);
                    break;
                case 'threats':
                    await this.loadPageComponent('threats');
                    await window.ThreatsPage.render(route);
                    break;
                case 'threat-details':
                    await this.loadPageComponent('threats');
                    await window.ThreatDetailsPage.render(route);
                    break;
                case 'devices':
                    await this.loadPageComponent('devices');
                    await window.DevicesPage.render(route);
                    break;
                case 'device-details':
                    await this.loadPageComponent('devices');
                    await window.DeviceDetailsPage.render(route);
                    break;
                case 'compliance':
                    await this.loadPageComponent('compliance');
                    await window.CompliancePage.render(route);
                    break;
                case 'reports':
                    await this.loadPageComponent('reports');
                    await window.ReportsPage.render(route);
                    break;
                case 'profile':
                    await this.loadPageComponent('profile');
                    await window.ProfilePage.render(route);
                    break;
                case 'settings':
                    await this.loadPageComponent('settings');
                    await window.SettingsPage.render(route);
                    break;
                case '404':
                    this.show404View();
                    break;
                default:
                    throw new Error(`Unknown component: ${componentName}`);
            }
        } catch (error) {
            console.error('Component loading error:', error);
            this.showErrorView(error);
        } finally {
            this.hideLoadingState();
        }
    }
    
    showAuthView() {
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('auth-container').classList.remove('hidden');
        
        // Initialize OAuth login UI
        if (window.MagenSecAuth) {
            window.MagenSecAuth.showLogin();
        }
    }
    
    showAppView() {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
    }
    
    showLoadingState() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="flex items-center justify-center min-h-screen">
                    <div class="flex flex-col items-center">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <p class="mt-4 text-gray-600">Loading...</p>
                    </div>
                </div>
            `;
        }
    }
    
    hideLoadingState() {
        // Loading state will be replaced by component content
    }
    
    show404View() {
        this.showAppView();
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center">
                        <h1 class="text-6xl font-bold text-gray-900">404</h1>
                        <p class="text-xl text-gray-600 mt-4">Page not found</p>
                        <button onclick="window.MagenSecRouter.navigate('/dashboard')" 
                                class="mt-6 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    showErrorView(error) {
        this.showAppView();
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="min-h-screen flex items-center justify-center">
                    <div class="text-center">
                        <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                        <h1 class="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                        <p class="text-gray-600 mb-6">${error.message}</p>
                        <button onclick="window.MagenSecRouter.refresh()" 
                                class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 mr-3">
                            Try Again
                        </button>
                        <button onclick="window.MagenSecRouter.navigate('/dashboard')" 
                                class="bg-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-400">
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    // ======================
    // Navigation State
    // ======================
    
    updateNavigationState() {
        if (!this.currentRoute) return;
        
        // Update active navigation links
        const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
                const path = href.replace('#', '');
                if (path === this.currentRoute.path || 
                    (path !== '/' && this.currentRoute.path.startsWith(path))) {
                    link.classList.add('active', 'text-blue-600', 'border-blue-600');
                    link.classList.remove('text-gray-700');
                } else {
                    link.classList.remove('active', 'text-blue-600', 'border-blue-600');
                    link.classList.add('text-gray-700');
                }
            }
        });
    }
    
    // ======================
    // Event Listeners
    // ======================
    
    setupEventListeners() {
        // Handle browser back/forward
        window.addEventListener('popstate', (event) => {
            const path = event.state?.path || window.location.hash.slice(1) || '/';
            this.navigate(path, { replace: true });
        });
        
        // Handle hash changes
        window.addEventListener('hashchange', () => {
            const path = window.location.hash.slice(1) || '/';
            if (path !== this.currentRoute?.path) {
                this.navigate(path, { replace: true });
            }
        });
        
        // Handle navigation clicks
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a[href^="#/"]');
            if (link) {
                event.preventDefault();
                const path = link.getAttribute('href').slice(1);
                this.navigate(path);
            }
        });
    }
    
    handleInitialLoad() {
        // Get initial route from hash or default to root
        const initialPath = window.location.hash.slice(1) || '/';
        
        // Check for intended route after auth
        const intendedRoute = sessionStorage.getItem('magensec_intended_route');
        if (intendedRoute && window.MagenSecAuth.isAuthenticated()) {
            sessionStorage.removeItem('magensec_intended_route');
            this.navigate(intendedRoute);
        } else {
            this.navigate(initialPath);
        }
    }
    
    // ======================
    // Navigation Hooks
    // ======================
    
    beforeNavigate(hook) {
        this.beforeNavigateHooks.push(hook);
    }
    
    afterNavigate(hook) {
        this.afterNavigateHooks.push(hook);
    }
    
    // ======================
    // Utility Methods
    // ======================
    
    getCurrentRoute() {
        return this.currentRoute;
    }
    
    buildPath(path, params = {}, query = {}) {
        let fullPath = path;
        
        // Replace parameters
        Object.entries(params).forEach(([key, value]) => {
            fullPath = fullPath.replace(`:${key}`, encodeURIComponent(value));
        });
        
        // Add query string
        const queryString = Object.entries(query)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        if (queryString) {
            fullPath += '?' + queryString;
        }
        
        return fullPath;
    }
}

// Initialize global router
window.MagenSecRouter = new MagenSecRouter();

// Setup authentication check for protected routes
window.MagenSecRouter.beforeNavigate((path, currentRoute) => {
    // Allow auth page without authentication
    if (path === '/auth') {
        return true;
    }
    
    // Check if user is authenticated for protected routes
    if (!window.MagenSecAuth.isAuthenticated()) {
        // Store intended destination
        sessionStorage.setItem('magensec_intended_route', path);
        window.MagenSecRouter.navigate('/auth');
        return false;
    }
    
    return true;
});

// Handle successful authentication
window.MagenSecRouter.afterNavigate((route, path) => {
    // Show appropriate view
    if (route.component === 'auth') {
        // Already handled in loadComponent
    } else {
        // Show app view for all other routes
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
    }
});
