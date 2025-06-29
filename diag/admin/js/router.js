// router.js: Handles client-side view routing.
(function() {
  // Map view names to their initializer functions and content URLs
  const views = {
    dashboard: { init: () => window.viewInitializers.dashboard, content: 'views/dashboard.html', title: 'Command Center' },
    applications: { init: () => window.viewInitializers.applications, content: 'views/applications.html', title: 'Applications' },
    devices: { init: () => window.viewInitializers.devices, content: 'views/devices.html', title: 'Devices' },
    performance: { init: () => window.viewInitializers.performance, content: 'views/perf.html', title: 'Performance' },
    security: { init: () => window.viewInitializers.security, content: 'views/security.html', title: 'Security' },
    vulnerabilities: { init: () => window.viewInitializers.vulnerabilities, content: 'views/vulnerabilities.html', title: 'Vulnerability Management' },
    reports: { init: () => window.viewInitializers.reports, content: 'views/reports.html', title: 'Reports' },
  };

  let currentView = 'dashboard';

  async function loadView(viewName) {
    const view = views[viewName];
    if (!view) {
      console.error(`View '${viewName}' not found.`);
      return;
    }

    // Update the current view and URL hash
    currentView = viewName;
    
    // Update URL hash without triggering page reload
    if (window.location.hash !== `#${viewName}`) {
      window.history.replaceState(null, null, `#${viewName}`);
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
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link[data-view]');
    navLinks.forEach(link => {
      if (link.dataset.view === viewName) {
        link.closest('.nav-item').classList.add('active');
      } else {
        link.closest('.nav-item').classList.remove('active');
      }
    });
  }

  function updatePageTitle(title) {
    // Update the page header title
    const pageTitle = document.getElementById('pageTitle');
    
    if (pageTitle) {
      pageTitle.textContent = title;
    }
    
    // Update browser title
    document.title = `${title} - MagenSec Command Center`;
  }

  function init() {
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link[data-view]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        loadView(view);
      });
    });

    // Load initial view based on hash or default to dashboard
    const hash = window.location.hash.slice(1); // Remove the '#'
    const initialView = hash && views[hash] ? hash : 'dashboard';
    loadView(initialView);
  }

  window.router = {
    init,
    loadView,
    getCurrentView: () => currentView
  };
})();
