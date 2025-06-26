// js/orgSwitcher.js
console.log('orgSwitcher.js (Tabler version) loaded');

export async function initOrgSwitcher() {
  const orgSwitcherContainer = document.getElementById('orgSwitcherContainer');
  const currentUserRole = sessionStorage.getItem('userRole') || 'admin';

  if (!orgSwitcherContainer) {
    console.error('Organization switcher container not found.');
    return;
  }

  const currentOrg = sessionStorage.getItem('org') || 'Global';

  // Admins get a dropdown, others see a static label
  if (currentUserRole === 'admin') {
    try {
      // Ensure dataService is loaded and ready
      const orgs = (window.dataService && window.dataService.getOrgs) ? await window.dataService.getOrgs() : [];
      
      if (!orgs.length) {
        console.warn('No orgs found or dataService not ready.');
        orgSwitcherContainer.innerHTML = '<div class="text-muted">No orgs</div>';
        return;
      }

      // Build dropdown
      orgSwitcherContainer.innerHTML = ''; // Clear previous content
      const select = document.createElement('select');
      select.className = 'form-select';
      select.id = 'orgSwitcher';
      
      // Add a default/global option
      let options = '<option value="all">All Orgs</option>';
      options += orgs.map(o => `<option value="${o}" ${o === currentOrg ? 'selected' : ''}>${o}</option>`).join('');
      select.innerHTML = options;
      
      // Set current value if it's not 'all'
      if(currentOrg && currentOrg !== 'all') {
          select.value = currentOrg;
      } else {
          select.value = 'all';
      }

      select.addEventListener('change', function() {
        sessionStorage.setItem('org', this.value);
        // Instead of reloading, we can re-initialize the current view to reflect the change.
        if(window.currentViewInit && typeof window.currentViewInit === 'function'){
            const contentContainer = document.getElementById('view-content');
            window.currentViewInit(contentContainer);
        }
      });

      orgSwitcherContainer.appendChild(select);
    } catch (error) {
      orgSwitcherContainer.innerHTML = '<div class="error">Could not load orgs.</div>';
      console.error('Failed to initialize org switcher:', error);
    }
  } else {
    // For non-admins, show the org name as static text in the header
    orgSwitcherContainer.innerHTML = `<span class="navbar-text">${currentOrg}</span>`;
  }
};
