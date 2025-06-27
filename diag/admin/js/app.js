import { initOrgSwitcher } from './orgSwitcher.js';

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
    const viewModules = {
        dashboard: { path: './dashboardView.js', init: 'dashboardViewInit' },
        applications: { path: './appsView.js', init: 'appsViewInit' },
        devices: { path: './deviceView.js', init: 'deviceViewInit' },
        performance: { path: './perfView.js', init: 'perfViewInit' },
        installs: { path: './installsView.js', init: 'installsViewInit' },
        security: { path: './securityView.js', init: 'securityViewInit' },
        reports: { path: './reportsView.js', init: 'reportsViewInit' },
    };

    async function loadView(viewName) {
        container.innerHTML = `<div class="d-flex justify-content-center align-items-center" style="height: 80vh;"><div class="spinner-border" role="status"></div></div>`;

        // Deactivate all nav links
        document.querySelectorAll('.nav-link').forEach(link => link.parentElement.classList.remove('active'));

        // Activate the current one
        const activeLink = document.querySelector(`.nav-link[data-view="${viewName}"]`);
        if (activeLink) {
            activeLink.parentElement.classList.add('active');
        }

        try {
            const module = viewModules[viewName];
            if (!module) throw new Error(`View "${viewName}" not found.`);

            // Import the view module, which executes it and attaches its init function to the window
            await import(module.path);
            const viewInitializer = window[module.init];

            if (typeof viewInitializer !== 'function') {
                throw new Error(`Initializer function ${module.init} not found in ${module.path}`);
            }
            
            // Set the current view initializer for theme/timezone refreshes
            window.currentViewInit = viewInitializer;
            
            // Initialize the view, passing dependencies
            await viewInitializer(container, { dataService: window.dataService });

        } catch (error) {
            console.error(`Error loading view: ${viewName}`, error);
            container.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <h4 class="alert-title">Error loading view: ${viewName}</h4>
                    <div class="text-muted">${error.message}</div>
                </div>`;
        }
    }

    // Navigation click handler
    document.querySelector('.navbar-nav').addEventListener('click', (e) => {
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

    // Initial load
    const initialView = window.location.hash.substring(1) || 'dashboard';
    loadView(initialView);
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

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
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.clear();
            window.location.href = 'login.html';
        });
    }

    google.charts.load('current', { packages: ['corechart', 'gauge', 'timeline'] });
    google.charts.setOnLoadCallback(async () => {
        console.log('Google Charts loaded');
        const contentContainer = document.getElementById('view-content');
        if (contentContainer) {
            try {
                // First, initialize the data service and wait for it to be ready.
                await window.dataService.init();
                console.log('dataService initialized successfully.');

                // Now that dataService is ready, initialize the rest of the app.
                initializeApp(contentContainer);
                await initOrgSwitcher(window.dataService);
            } catch (error) {
                console.error('Failed to initialize the application:', error);
                contentContainer.innerHTML = `<div class="alert alert-danger">Failed to initialize application: ${error.message}</div>`;
            }
        } else {
            console.error('Main content container #view-content not found.');
        }
    });
});
