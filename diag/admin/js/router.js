// router.js: Handles client-side view routing.
(function() {
  // Map view names to their initializer functions and content URLs
  const views = {
    dashboard: { init: () => window.viewInitializers.dashboard, content: 'views/dashboard.html', title: 'Command Center' },
    applications: { init: () => window.viewInitializers.applications, content: 'views/applications.html', title: 'Applications' },
    devices: { init: () => window.viewInitializers.devices, content: 'views/devices.html', title: 'Devices' },
    performance: { init: () => window.viewInitializers.performance, content: 'views/perf.html', title: 'Performance' },
    security: { init: () => window.viewInitializers.security, content: 'views/security.html', title: 'Security' },
    reports: { init: () => window.viewInitializers.reports, content: 'views/reports.html', title: 'Reports' },
  };

  let currentView = 'dashboard';

  async function loadView(viewName) {
    console.log(`Loading view: ${viewName}`);
    const view = views[viewName];
    if (!view) {
      console.error(`View '${viewName}' not found.`);
      return;
    }

    const container = document.getElementById('view-container');
    if (!container) {
      console.error('#view-container container not found!');
      return;
    }

    // Set loading state
    container.innerHTML = '<div class="text-muted">Loading...</div>';

    try {
      // The view's init function is now responsible for all rendering
      const viewInit = view.init();
      if (typeof viewInit === 'function') {
        await viewInit(container, { dataService: window.dataService });
      } else {
        throw new Error(`Initializer for view '${viewName}' is not a function.`);
      }
    } catch (error) {
      console.error(`Error loading view '${viewName}':`, error);
      container.innerHTML = `<div class="alert alert-danger">Failed to load view. ${error.message}</div>`;
    }

    // Update the active state in the sidebar
    updateActiveNav(viewName);
    
    // Update page title
    updatePageTitle(view.title || viewName);
    
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

  function updatePageTitle(title) {
    // Update both the header title and the browser title
    const headerTitle = document.querySelector('#page-title-container .page-title');
    const viewTitle = document.getElementById('view-title');
    
    if (headerTitle) {
      headerTitle.textContent = title;
    }
    if (viewTitle) {
      viewTitle.textContent = title;
    }
    
    // Update browser title
    document.title = `${title} - MagenSec Command Center`;
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
