// app.js: Main application entry point, router, and event handlers.
console.log('app.js loaded');

/**
 * Redraws all Google Charts on the page.
 * Finds charts by looking for elements with a 'chartInstance' property.
 */
function redrawAllGoogleCharts() {
    const chartElements = document.querySelectorAll('[data-chart-type="google"]');
    chartElements.forEach(el => {
        if (el.chartInstance && el.chartInstance.chart && el.chartInstance.data && el.chartInstance.options && typeof el.chartInstance.chart.draw === 'function') {
            // Remove fixed size for responsiveness before redrawing
            delete el.chartInstance.options.width;
            delete el.chartInstance.options.height;
            el.chartInstance.chart.draw(el.chartInstance.data, el.chartInstance.options);
        }
    });
}

// --- Global Resize Handler ---
// Debounce resize events to avoid excessive redraws
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(redrawAllGoogleCharts, 150);
}, false);


/**
 * Initializes the single-page application router.
 * @param {HTMLElement} container The main content container element.
 */
async function initializeApp(container) {
    
    async function loadView(viewName) {
        // container.innerHTML = `<div class="d-flex justify-content-center align-items-center" style="height: 80vh;"><div class="spinner-border" role="status"></div></div>`;

        // Deactivate all nav links in the main navbar
        document.querySelectorAll('#navbar-menu .nav-link').forEach(link => link.parentElement.classList.remove('active'));

        // Activate the current one and update the header title
        const activeLink = document.querySelector(`#navbar-menu .nav-link[data-view="${viewName}"]`);
        if (activeLink) {
            activeLink.parentElement.classList.add('active');
            const pageTitleElement = document.getElementById('pageTitle');
            const linkTitle = activeLink.querySelector('.nav-link-title');
            if (pageTitleElement && linkTitle) {
                pageTitleElement.textContent = linkTitle.textContent.trim();
            }
        }

        try {
            // Use the router's view mappings if available
            const viewMappings = {
                dashboard: 'dashboard.html',
                applications: 'applications.html', 
                devices: 'devices.html',
                performance: 'perf.html',  // Map performance to perf.html
                security: 'security.html',
                vulnerabilities: 'vulnerabilities.html',
                reports: 'reports.html'
            };

            // 1. Fetch the HTML for the view using the correct mapping
            const htmlFileName = viewMappings[viewName] || `${viewName}.html`;
            const response = await fetch(`views/${htmlFileName}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch HTML for view ${viewName}: ${response.statusText}`);
            }
            const viewHtml = await response.text();
            container.innerHTML = viewHtml;

            // 2. Get the corresponding view initializer
            const viewInitializer = window.viewInitializers[viewName];
            if (!viewInitializer) {
                throw new Error(`View initializer for "${viewName}" not found. Ensure its script is loaded and it registers itself.`);
            }
            
            window.currentViewInit = viewInitializer;
            
            // 3. Initialize the view, passing dependencies
            await viewInitializer(container, { 
                dataService: window.dataService,
                threatIntel: window.threatIntel
            });

        } catch (error) {
            console.error(`Error loading view: ${viewName}`, error);
            container.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <h4 class="alert-title">Error loading view: ${viewName}</h4>
                    <div class="text-muted">${error.message}</div>
                </div>`;
        }
    }

    // Navigation click handler for the main navbar
    document.querySelector('#navbar-menu .navbar-nav').addEventListener('click', (e) => {
        const navLink = e.target.closest('.nav-link');
        if (navLink && navLink.dataset.view && !navLink.classList.contains('disabled')) {
            e.preventDefault();
            const view = navLink.dataset.view;
            window.location.hash = view;
        }
    });

    // Hash change handler
    window.addEventListener('hashchange', () => {
        const view = window.location.hash.substring(1) || 'dashboard';
        loadView(view);
    });

    // Listen for device filter changes to reload the view
    window.addEventListener('device-filter-changed', () => {
        const view = window.location.hash.substring(1) || 'dashboard';
        loadView(view);
    });

    // Initial load
    const initialView = window.location.hash.substring(1) || 'dashboard';
    loadView(initialView);
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // Check if user is logged in before initializing the app
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    if (!isLoggedIn) {
        console.log('User not logged in, redirecting to login page');
        window.location.href = 'login.html';
        return;
    }

    // Update user info in the UI
    updateUserInfo();

    // Initialize theme switcher from the global scope
    if (window.themeSwitcherInit) {
        window.themeSwitcherInit();
    }

    // Initialize timezone toggle
    if (window.initTimezoneToggle) {
        window.initTimezoneToggle();
    } else {
        console.error('Timezone toggle initialization function not found.');
    }

    // Handle logout
    const logoutBtn = document.getElementById('logoutBtn') || document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.clear();
            localStorage.clear();
            // Remove all cookies for a clean logout
            document.cookie.split(';').forEach(function(c) {
                document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
            });
            window.location.href = 'login.html';
        });
    }

    google.charts.load('current', { packages: ['corechart', 'gauge', 'timeline'] });
    google.charts.setOnLoadCallback(async () => {
        console.log('Google Charts loaded');
        const contentContainer = document.getElementById('view-container');
        if (contentContainer) {
            try {
                // First, initialize the data service and wait for it to be ready.
                await window.dataService.init();
                console.log('dataService initialized successfully.');

                // Initialize threat intel service before the rest of the app
                console.log('Checking for window.threatIntel:', window.threatIntel);
                if (window.threatIntel && typeof window.threatIntel.init === 'function') {
                    console.log('Initializing threat intelligence service...');
                    await window.threatIntel.init();
                    console.log('Threat intelligence service initialized.');
                } else {
                    console.warn('ThreatIntel service not available or init method missing');
                }

                // Now that services are ready, initialize the rest of the app.
                initializeApp(contentContainer);
                await initOrgSwitcher(window.dataService);
                initDeviceFilter(window.dataService); // Initialize the device filter UI
            } catch (error) {
                console.error('Failed to initialize the application:', error);
                contentContainer.innerHTML = `<div class="alert alert-danger">Failed to initialize application: ${error.message}</div>`;
            }
        } else {
            console.error('Main content container #view-container not found.');
        }
    });
});

/**
 * Updates the user information displayed in the UI
 */
function updateUserInfo() {
    const username = sessionStorage.getItem('username') || 'Guest';
    const isAdmin = sessionStorage.getItem('isAdmin') === '1';
    const org = sessionStorage.getItem('org') || 'Unknown';
    
    const userNameElement = document.getElementById('user-name');
    const userRoleElement = document.getElementById('user-role');
    const userAvatarElement = document.getElementById('user-avatar');
    
    if (userNameElement) {
        userNameElement.textContent = username;
    }
    
    if (userRoleElement) {
        userRoleElement.textContent = isAdmin ? 'Administrator' : 'User';
    }
    
    if (userAvatarElement) {
        // Create avatar with first letter of username
        const initial = username.charAt(0).toUpperCase();
        userAvatarElement.textContent = initial;
        userAvatarElement.style.backgroundColor = '#206bc4';
        userAvatarElement.style.color = 'white';
        userAvatarElement.style.display = 'flex';
        userAvatarElement.style.alignItems = 'center';
        userAvatarElement.style.justifyContent = 'center';
    }
}

// --- Global Debug Log Viewer ---
(function setupDebugLogWindow() {
    if (window.location.search.includes('debug=1')) {
        if (!document.getElementById('debugLogContainer')) {
            const dbgDiv = document.createElement('div');
            dbgDiv.id = 'debugLogContainer';
            dbgDiv.style.position = 'fixed';
            dbgDiv.style.left = '0';
            dbgDiv.style.right = '0';
            dbgDiv.style.bottom = '0';
            dbgDiv.style.zIndex = '9999';
            dbgDiv.style.background = '#222';
            dbgDiv.style.color = '#fff';
            dbgDiv.style.maxHeight = '30vh';
            dbgDiv.style.overflowY = 'auto';
            dbgDiv.style.fontSize = '12px';
            dbgDiv.style.resize = 'vertical';
            dbgDiv.style.borderTop = '2px solid #444';
            dbgDiv.style.padding = '8px 4px 8px 4px';
            dbgDiv.style.boxSizing = 'border-box';
            dbgDiv.style.pointerEvents = 'auto';
            dbgDiv.innerHTML = '<pre id="debugLog" style="margin:0;white-space:pre-wrap;"></pre>';
            document.body.appendChild(dbgDiv);
            // Add bottom padding to .page so content is not hidden
            const page = document.querySelector('.page');
            if (page) page.style.paddingBottom = '32vh';
        }
        window.__debugLog = function(msg) {
            const log = document.getElementById('debugLog');
            if (log) log.textContent += msg + '\n';
        };
    } else {
        window.__debugLog = function(){};
    }
})();

class App {
    constructor() {
        this.dataService = new DataService();
        this.threatIntel = new ThreatIntel();
        this.currentView = null; // To hold the current view instance
    }

    async initializeApp() {
        console.log('Initializing app');

        // Initialize services
        await this.dataService.initialize();
        await this.threatIntel.initialize();

        // Initial load
        this.loadView();

        // Listen for hash changes to load different views
        window.addEventListener('hashchange', () => this.loadView());
    }

    async loadView() {
        const viewName = location.hash.substring(2) || 'dashboard';
        const container = document.getElementById('viewContent');
        if (!container) {
            console.error('#viewContent container not found');
            return;
        }

        // Clean up the previous view
        if (this.currentView && typeof this.currentView.destroy === 'function') {
            this.currentView.destroy();
            this.currentView = null;
        }

        // Fetch and inject the view's HTML
        try {
            const response = await fetch(`views/${viewName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load view: ${viewName}`);
            }
            container.innerHTML = await response.text();

            // Initialize the new view
            const initializer = window.viewInitializers[viewName];
            if (typeof initializer === 'function') {
                const dependencies = { dataService: this.dataService, threatIntel: this.threatIntel };
                this.currentView = initializer(container, dependencies);

                // The view is now responsible for its own initial rendering via its initialize method.
                if (this.currentView && typeof this.currentView.initialize === 'function') {
                    await this.currentView.initialize();
                }
            } else {
                console.warn(`No initializer found for view: ${viewName}`);
                container.innerHTML = `<div class="alert alert-warning">View '${viewName}' not found or is not implemented correctly.</div>`;
            }
        } catch (error) {
            console.error('Error loading view:', error);
            container.innerHTML = `<div class="alert alert-danger">Error loading page. Please try again.</div>`;
        }
    }
}

// Add handler for Performance in user menu
const perfMenu = document.getElementById('userMenuPerformance');
if (perfMenu) {
    perfMenu.addEventListener('click', (e) => {
        e.preventDefault();
        // Simulate navbar view switch
        const perfNav = document.querySelector('[data-view="performance"]');
        if (perfNav) perfNav.click();
    });
}
