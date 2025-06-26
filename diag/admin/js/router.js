// router.js: Handles client-side view routing.
(function() {
  // Map view names to their initializer functions and content URLs
  const views = {
    dashboard: { init: window.dashboardViewInit, content: 'views/dashboard.html' },
    applications: { init: window.appViewInit, content: 'views/applications.html' },
    devices: { init: window.deviceViewInit, content: 'views/devices.html' },
    security: { init: window.securityViewInit, content: 'views/security.html' },
    reports: { init: window.reportsViewInit, content: 'views/reports.html' },
  };

  let currentView = 'dashboard';

  async function loadView(viewName) {
    console.log(`Loading view: ${viewName}`);
    const view = views[viewName];
    if (!view) {
      console.error(`View '${viewName}' not found.`);
      return;
    }

    const container = document.getElementById('view-content');
    if (!container) {
      console.error('#view-content container not found!');
      return;
    }

    // Set loading state
    container.innerHTML = '<div class="text-muted">Loading...</div>';

    try {
      // The view's init function is now responsible for all rendering
      if (typeof view.init === 'function') {
        await view.init(container);
      } else {
        throw new Error(`Initializer for view '${viewName}' is not a function.`);
      }
    } catch (error) {
      console.error(`Error loading view '${viewName}':`, error);
      container.innerHTML = `<div class="alert alert-danger">Failed to load view. ${error.message}</div>`;
    }

    // Update the active state in the sidebar
    updateActiveNav(viewName);
    
    // Set the current view initializer for refreshes
    window.currentViewInit = () => loadView(viewName);
  }

  function updateActiveNav(viewName) {
    const navLinks = document.querySelectorAll('#sidebar-menu .nav-link');
    navLinks.forEach(link => {
      if (link.dataset.view === viewName) {
        link.closest('.nav-item').classList.add('active');
      } else {
        link.closest('.nav-item').classList.remove('active');
      }
    });
  }

  function init() {
    const navLinks = document.querySelectorAll('#sidebar-menu .nav-link[data-view]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        loadView(view);
      });
    });

    // Load initial view (dashboard)
    loadView('dashboard');
  }

  window.router = {
    init,
    loadView,
    getCurrentView: () => currentView
  };

  console.log('router.js loaded.');
})();
