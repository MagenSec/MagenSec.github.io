// Externalized from index.html for CSP compliance.
// Bootstrap dropdown delegated handler + SPA navbar active-state tracking.

console.log('[Portal] Bootstrap available:', typeof bootstrap !== 'undefined');
console.log('[Portal] Tabler available:', typeof tabler !== 'undefined');

// Bootstrap dropdowns need to work for SPA-rendered content.
// Use delegated click handling so dynamically-added dropdown toggles work.
if (typeof bootstrap !== 'undefined') {
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-bs-toggle="dropdown"]');
        if (!toggle) return;

        // If Bootstrap is available, always drive via the Dropdown API to avoid
        // timing issues where data-api isn't bound for SPA-rendered nodes.
        try {
            if (window.bootstrap?.Dropdown) {
                e.preventDefault();
                const instance = window.bootstrap.Dropdown.getOrCreateInstance(toggle);
                instance.toggle();
            }
        } catch (_err) {
            // no-op
        }
    }, true);
}

function getCurrentRoutePath() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#!/')) {
        return '/dashboard';
    }

    // Handle both "#!/route" and "#!/route?query=params".
    const routeWithQuery = hash.slice(2);
    const routeWithoutQuery = routeWithQuery.split('?')[0] || '/dashboard';
    return routeWithoutQuery.startsWith('/') ? routeWithoutQuery : `/${routeWithoutQuery}`;
}

function clearNavbarActiveState() {
    const navRoot = document.getElementById('navbar-menu');
    if (!navRoot) return;

    navRoot.querySelectorAll('.nav-link.active, .dropdown-item.active, .nav-item.active').forEach((el) => {
        el.classList.remove('active');
    });
}

function markActive(anchor) {
    if (!anchor) return;

    anchor.classList.add('active');
    anchor.closest('.nav-item')?.classList.add('active');

    const dropdownMenu = anchor.closest('.dropdown-menu');
    if (!dropdownMenu) return;

    const dropdownToggle = dropdownMenu.previousElementSibling;
    if (dropdownToggle?.classList.contains('dropdown-toggle')) {
        dropdownToggle.classList.add('active');
        dropdownToggle.closest('.nav-item')?.classList.add('active');
    }
}

function setNavbarActiveState() {
    const navRoot = document.getElementById('navbar-menu');
    if (!navRoot) return;

    const routePath = getCurrentRoutePath();
    clearNavbarActiveState();

    // Required Actions bell
    const actionsBtn = document.querySelector('#required-actions-nav a');
    if (routePath.startsWith('/alerts')) {
        actionsBtn?.classList.add('active');
        return;
    }

    let targetHref = null;

    // --- Protect ---
    if (routePath.startsWith('/devices') || routePath.startsWith('/security/response') || routePath.startsWith('/response-actions')) {
        targetHref = routePath.startsWith('/devices') ? '#!/devices' : '#!/security/response';
    } else if (routePath.startsWith('/apps')) {
        targetHref = '#!/apps';
    } else if (routePath.startsWith('/vulnerabilities') || routePath.startsWith('/cves')) {
        targetHref = '#!/vulnerabilities';
    } else if (routePath.startsWith('/changelog')) {
        targetHref = '#!/changelog';
    } else if (routePath.startsWith('/attack-chain')) {
        targetHref = '#!/attack-chain';
    } else if (routePath.startsWith('/add-ons/hygiene-coach')) {
        targetHref = '#!/add-ons/hygiene-coach';

    // --- Prove ---
    } else if (routePath.startsWith('/compliance') && !routePath.startsWith('/add-ons/compliance-plus')) {
        targetHref = '#!/compliance';
    } else if (routePath.startsWith('/posture') && !routePath.startsWith('/posture-ai')) {
        targetHref = '#!/posture';
    } else if (routePath.startsWith('/add-ons/compliance-plus')) {
        targetHref = '#!/add-ons/compliance-plus';
    } else if (routePath.startsWith('/add-ons/peer-benchmark')) {
        targetHref = '#!/add-ons/peer-benchmark';

    // --- Audit ---
    } else if (routePath.startsWith('/audit') || routePath.startsWith('/members')) {
        targetHref = '#!/audit';
    } else if (routePath.startsWith('/auditor')) {
        targetHref = '#!/auditor';
    } else if (routePath.startsWith('/reports/preview')) {
        targetHref = '#!/reports/preview';
    } else if (routePath.startsWith('/reports')) {
        targetHref = '#!/reports';
    } else if (routePath.startsWith('/mission-brief') || routePath.startsWith('/posture-ai')) {
        targetHref = '#!/mission-brief';

    // --- Insure ---
    } else if (routePath.startsWith('/add-ons/insurance-readiness')) {
        targetHref = '#!/add-ons/insurance-readiness';
    } else if (routePath.startsWith('/add-ons/supply-chain-intel')) {
        targetHref = '#!/add-ons/supply-chain-intel';

    // --- Settings ---
    } else if (routePath.startsWith('/settings') || routePath.startsWith('/licenses')) {
        targetHref = '#!/settings';
    } else if (routePath.startsWith('/review')) {
        targetHref = '#!/review';

    // --- MAGI (top-level) ---
    } else if (routePath.startsWith('/analyst') || routePath.startsWith('/ai-reports')) {
        targetHref = '#!/analyst';

    // --- Home / Security dashboard ---
    } else if (routePath.startsWith('/security') || routePath.startsWith('/unified-dashboard')) {
        targetHref = '#!/dashboard';
    } else if (routePath === '/' || routePath.startsWith('/dashboard')) {
        targetHref = '#!/dashboard';

    // --- Site Admin routes (highlight nothing in main nav) ---
    } else if (routePath.startsWith('/siteadmin/')) {
        // Site admin routes don't correspond to main nav items
        targetHref = null;
    }

    if (!targetHref) return;

    const targetAnchor = navRoot.querySelector(`a[href="${targetHref}"]`);
    markActive(targetAnchor);
}

window.addEventListener('hashchange', setNavbarActiveState);
document.addEventListener('DOMContentLoaded', setNavbarActiveState);
