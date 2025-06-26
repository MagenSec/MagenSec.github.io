// js/orgSwitcher.js
console.log('orgSwitcher.js (Tabler version) loaded');

function refreshCurrentView() {
    if (window.currentViewInit && typeof window.currentViewInit === 'function') {
        const contentContainer = document.getElementById('view-content');
        if (contentContainer) {
            window.currentViewInit(contentContainer);
        }
    }
}

function renderAdminSwitcher(container, orgs, currentOrg) {
    const selectedOrgs = new Set((currentOrg || 'all').split(',').filter(Boolean));

    const updateButtonText = (button, dropdown) => {
        const checked = dropdown.querySelectorAll('.dropdown-item input:checked');
        let text;
        if (checked.length === 0 || (checked.length === 1 && checked[0].value === 'all')) {
            text = 'All Orgs';
        } else if (checked.length === 1) {
            text = checked[0].parentElement.textContent.trim();
        } else {
            text = `${checked.length} Orgs Selected`;
        }
        button.innerHTML = `<span class="status-dot status-dot-animated bg-green me-2"></span> ${text}`;
    };

    const dropdownId = 'org-switcher-dropdown';
    const dropdownHTML = `
        <div class="dropdown">
            <a href="#" class="btn dropdown-toggle" data-bs-toggle="dropdown" data-bs-auto-close="outside" id="${dropdownId}-button">
                <!-- Button text will be set dynamically -->
            </a>
            <div class="dropdown-menu" aria-labelledby="${dropdownId}-button">
                <div class="dropdown-item">
                    <label class="form-check">
                        <input class="form-check-input" type="checkbox" value="all" ${selectedOrgs.has('all') || selectedOrgs.size === 0 ? 'checked' : ''}>
                        <span class="form-check-label">All Orgs</span>
                    </label>
                </div>
                ${orgs.map(org => `
                    <div class="dropdown-item">
                        <label class="form-check">
                            <input class="form-check-input" type="checkbox" value="${org}" ${selectedOrgs.has(org) ? 'checked' : ''}>
                            <span class="form-check-label">${org}</span>
                        </label>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    container.innerHTML = dropdownHTML;

    const dropdown = container.querySelector('.dropdown');
    const button = container.querySelector(`#${dropdownId}-button`);
    const allOrgsCheckbox = container.querySelector('input[value="all"]');
    const orgCheckboxes = container.querySelectorAll('input:not([value="all"])');

    updateButtonText(button, dropdown);

    dropdown.addEventListener('change', (e) => {
        const target = e.target;
        if (target.type !== 'checkbox') return;

        if (target.value === 'all' && target.checked) {
            orgCheckboxes.forEach(cb => cb.checked = false);
        } else if (target.value !== 'all' && target.checked) {
            allOrgsCheckbox.checked = false;
        }

        const currentlyChecked = Array.from(container.querySelectorAll('input:checked'));
        if (currentlyChecked.length === 0) {
            allOrgsCheckbox.checked = true;
        }

        const newSelected = Array.from(container.querySelectorAll('input:checked'))
            .map(cb => cb.value)
            .filter(Boolean);

        if (newSelected.length === 1 && newSelected[0] === 'all') {
            sessionStorage.setItem('org', 'all');
        } else {
            sessionStorage.setItem('org', newSelected.filter(v => v !== 'all').join(','));
        }
        
        updateButtonText(button, dropdown);
        refreshCurrentView();
    });
}

function renderNonAdminSwitcher(container, org) {
    container.innerHTML = `
        <span class="navbar-text">
            <span class="status-dot status-dot-animated bg-green"></span>
            <span class="ms-2">Org:</span>
            <span class="ms-1 fw-bold">${org}</span>
        </span>
    `;
}

export async function initOrgSwitcher() {
    const orgSwitcherContainer = document.getElementById('orgSwitcherContainer');
    if (!orgSwitcherContainer) {
        console.error('Organization switcher container not found.');
        return;
    }

    const isAdmin = sessionStorage.getItem('isAdmin') === '1';
    const currentOrg = sessionStorage.getItem('org') || 'all';

    if (isAdmin) {
        try {
            const orgs = (window.dataService && window.dataService.getOrgs) ? await window.dataService.getOrgs() : [];
            if (!orgs.length) {
                console.warn('No orgs found or dataService not ready.');
                renderNonAdminSwitcher(orgSwitcherContainer, 'Admin (No Orgs)');
                return;
            }
            renderAdminSwitcher(orgSwitcherContainer, orgs, currentOrg);
        } catch (error) {
            orgSwitcherContainer.innerHTML = '<div class="text-danger">Error loading orgs</div>';
            console.error('Failed to initialize org switcher:', error);
        }
    } else {
        renderNonAdminSwitcher(orgSwitcherContainer, currentOrg);
    }
}
