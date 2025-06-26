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
        applications: { path: './appView.js', init: 'appViewInit' },
        devices: { path: './deviceView.js', init: 'deviceViewInit' },
        performance: { path: './perfView.js', init: 'perfViewInit' },
        // security: { path: './securityView.js', init: 'securityViewInit' },
        // reports: { path: './reportsView.js', init: 'reportsViewInit' },
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
            
            // Initialize the view
            await viewInitializer(container);

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

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.getElementById('view-content');
    if (mainContainer) {
        initializeApp(mainContainer);
    } else {
        console.error('Main content container #view-content not found.');
    }

    // Load other initializers
    if (window.orgSwitcherInit) {
        window.orgSwitcherInit();
    }
    if (window.themeSwitcherInit) {
        window.themeSwitcherInit();
    }
    if (window.expiryCounterInit) {
        window.expiryCounterInit();
    }
});
