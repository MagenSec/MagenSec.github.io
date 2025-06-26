// js/orgSwitcher.js
console.log('orgSwitcher.js (Tabler version) loaded');

window.initOrgSwitcher = async function() {
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
      const orgs = (window.dataService && window.dataService.getOrgs) ? await window.dataService.getOrgs() : [];
      if (!orgs.length) {
        orgSwitcherContainer.innerHTML = '<div class="error">Could not load orgs.</div>';
        return;
      }
      // Build dropdown
      orgSwitcherContainer.innerHTML = '';
      const select = document.createElement('select');
      select.className = 'form-select';
      select.id = 'orgSwitcher';
      select.innerHTML = '<option value="all">All Orgs</option>' + orgs.map(o => `<option value="${o}">${o}</option>`).join('');
      select.value = currentOrg || 'all';
      select.onchange = function() {
        sessionStorage.setItem('org', this.value);
        window.location.reload();
      };
      orgSwitcherContainer.appendChild(select);
    } catch (error) {
      orgSwitcherContainer.innerHTML = '<div class="error">Could not load orgs.</div>';
      console.error('Failed to initialize org switcher:', error);
    }
  } else {
    // For non-admins, show the org name as static text in the header
    orgSwitcherContainer.textContent = currentOrg;
  }
};
