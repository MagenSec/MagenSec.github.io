// dashboard.js: Handles initialization for the Tabler-based dashboard.
(function() {
  'use strict';
  console.log('dashboard.js (Tabler version) loaded');

  // 1. Authentication & Session Check
  if (!sessionStorage.getItem('org')) {
    window.location.href = 'login.html';
    return;
  }

  // 2. State and DOM References
  const expiryDiv = document.getElementById('expiryCounter');
  const isAdmin = sessionStorage.getItem('userRole') === 'admin';

  // 3. SAS Token Expiry Counter for Admins
  async function updateExpiryCounter() {
    if (!isAdmin || !expiryDiv) return;

    // This assumes dataService is loaded and initialized
    if (!window.dataService) {
        console.error("dataService not available for expiry counter.");
        return;
    }

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

  // 4. Initial Page Load
  function initializeDashboard() {
    console.log('Initializing Tabler dashboard components...');

    // Initialize header controls - these are now initialized in app.js
    // if (window.initTimezoneToggle) window.initTimezoneToggle();
    // if (window.initOrgSwitcher) window.initOrgSwitcher();
    // if (window.initDeviceFilter) window.initDeviceFilter();

    // The router is also initialized in app.js
    // if (window.router) {
    //   window.router.init();
    // } else {
    //   console.error('Router not found!');
    //   const container = document.querySelector('.page-body .container-xl');
    //   if(container) container.innerHTML = '<div class="alert alert-danger">Error: Failed to load router.</div>';
    // }

    // Show admin-only expiry counter
    updateExpiryCounter();
  }

  // Run initialization when the DOM is ready
  document.addEventListener('DOMContentLoaded', initializeDashboard);

})();
