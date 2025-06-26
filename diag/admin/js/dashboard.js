// dashboard.js: Handles initialization for the Tabler-based dashboard.
(function() {
  console.log('dashboard.js (Tabler version) loaded');

  // 1. Authentication & Session Check
  if (!sessionStorage.getItem('org')) {
    window.location.href = 'login.html';
    return;
  }

  // 2. State and DOM References
  const expiryDiv = document.getElementById('expiryCounter');
  const isAdmin = sessionStorage.getItem('userRole') === 'admin';

  // 3. Dynamic UI Setup
  function setupDynamicElements() {
    // Add Logout button to sidebar footer
    const sidebarFooter = document.getElementById('sidebar-footer');
    if (sidebarFooter) {
        const logoutItem = document.createElement('div');
        logoutItem.className = 'nav-item';
        logoutItem.innerHTML = `
          <a class="nav-link" href="#" id="logoutBtn">
            <span class="nav-link-icon d-md-none d-lg-inline-block"><i class="ti ti-logout"></i></span>
            <span class="nav-link-title">Logout</span>
          </a>`;
        sidebarFooter.appendChild(logoutItem);

        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.clear();
            window.location.href = 'login.html';
        });
    }
  }

  // 4. SAS Token Expiry Counter for Admins
  async function updateExpiryCounter() {
    if (!isAdmin || !expiryDiv) return;

    await window.dataService.fetchSasExpiry();
    const expiry = window.dataService.getExpiry();
    if (!expiry) return;

    const remainingMs = expiry - Date.now();
    if (remainingMs <= 0) return; // Don't show if expired

    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    // Only show a dismissible alert if the token is expiring within 30 days.
    if (remainingDays <= 30) {
        const alertClass = remainingDays < 7 ? 'alert-warning' : 'alert-info';
        expiryDiv.innerHTML = `
            <div class="alert ${alertClass} alert-dismissible" role="alert">
                <div class="d-flex">
                    <div><i class="icon ti ti-alert-circle me-2"></i></div>
                    <div>
                        <div class="alert-title">Admin token expires in ${remainingDays} day${remainingDays !== 1 ? 's' : ''}.</div>
                    </div>
                </div>
                <a class="btn-close" data-bs-dismiss="alert" aria-label="close"></a>
            </div>
        `;
    }
  }

  // 5. Initial Page Load
  function initializeDashboard() {
    console.log('Initializing Tabler dashboard components...');
    
    setupDynamicElements();

    // Initialize header controls
    if (window.initTimezoneToggle) window.initTimezoneToggle();
    if (window.initOrgSwitcher) window.initOrgSwitcher();

    // Initialize the router to load the default view
    if (window.router) {
      window.router.init();
    } else {
      console.error('Router not found!');
      const container = document.querySelector('.page-body .container-xl');
      if(container) container.innerHTML = '<div class="alert alert-danger">Error: Failed to load router.</div>';
    }

    // Show admin-only expiry counter
    updateExpiryCounter();
  }

  // 6. Debug Log Viewer (show if ?debug is present)
  if (window.location.search.includes('debug')) {
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
      dbgDiv.style.padding = '8px 4px 32px 4px';
      dbgDiv.style.boxSizing = 'border-box';
      dbgDiv.style.pointerEvents = 'auto';
      dbgDiv.style.marginBottom = '48px'; // Avoid overlap with logout
      dbgDiv.innerHTML = '<pre id="debugLog" style="margin:0;white-space:pre-wrap;"></pre>';
      document.body.appendChild(dbgDiv);
    }
    window.__debugLog = function(msg) {
      const log = document.getElementById('debugLog');
      if (log) log.textContent += msg + '\n';
    };
  }

  // 7. Theme Toggle Button
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.onclick = function() {
      const isDark = document.body.classList.toggle('theme-dark');
      if (isDark) {
        document.body.classList.remove('theme-light');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.add('theme-light');
        localStorage.setItem('theme', 'light');
      }
    };
    // On load, set theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
    } else {
      document.body.classList.add('theme-dark');
      document.body.classList.remove('theme-light');
    }
  }

  // Run initialization when the page is fully loaded
  window.addEventListener('load', initializeDashboard);

})();
