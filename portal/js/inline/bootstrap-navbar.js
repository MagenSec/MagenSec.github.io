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
        if (toggle.getAttribute('data-feature-locked') === 'true') return;

        // If Bootstrap is available, always drive via the Dropdown API to avoid
        // timing issues where data-api isn't bound for SPA-rendered nodes.
        try {
            if (window.bootstrap?.Dropdown) {
                e.preventDefault();
                e.stopPropagation();
                const instance = window.bootstrap.Dropdown.getOrCreateInstance(toggle);
                const dropdown = toggle.closest('.dropdown');
                const menu = dropdown?.querySelector(':scope > .dropdown-menu');
                if (menu?.classList.contains('show') && !toggle.closest('.table')) {
                    instance.show();
                } else {
                    instance.toggle();
                }
            }
        } catch (_err) {
            // no-op
        }
    }, true);

    const canHoverOpenDropdowns = () => window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
    const hoverCloseTimers = new WeakMap();

    const getHoverDropdownToggle = (dropdown) => {
        if (dropdown?.closest?.('.table')) return null;
        return dropdown.querySelector(':scope > [data-bs-toggle="dropdown"]');
    };

    const closeSiblingHoverDropdowns = (currentToggle) => {
        document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((toggle) => {
            if (toggle === currentToggle) return;
            if (toggle.closest('.table')) return;
            try {
                window.bootstrap?.Dropdown?.getInstance(toggle)?.hide();
            } catch (_err) {
                // no-op
            }
        });
    };

    document.addEventListener('mouseover', (e) => {
        if (!canHoverOpenDropdowns()) return;
        const dropdown = e.target.closest('.dropdown');
        if (!dropdown || dropdown.contains(e.relatedTarget)) return;
        const toggle = getHoverDropdownToggle(dropdown);
        if (!toggle || toggle.getAttribute('data-feature-locked') === 'true') return;

        const timer = hoverCloseTimers.get(dropdown);
        if (timer) {
            clearTimeout(timer);
            hoverCloseTimers.delete(dropdown);
        }

        try {
            closeSiblingHoverDropdowns(toggle);
            window.bootstrap?.Dropdown?.getOrCreateInstance(toggle).show();
        } catch (_err) {
            // no-op
        }
    }, true);

    document.addEventListener('mouseout', (e) => {
        if (!canHoverOpenDropdowns()) return;
        const dropdown = e.target.closest('.dropdown');
        if (!dropdown || dropdown.contains(e.relatedTarget)) return;
        const toggle = getHoverDropdownToggle(dropdown);
        if (!toggle) return;

        const timer = window.setTimeout(() => {
            if (dropdown.matches(':hover') || dropdown.contains(document.activeElement)) return;
            try {
                window.bootstrap?.Dropdown?.getInstance(toggle)?.hide();
            } catch (_err) {
                // no-op
            }
            hoverCloseTimers.delete(dropdown);
        }, 160);
        hoverCloseTimers.set(dropdown, timer);
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

function getCurrentRouteQueryParams() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#!/')) {
        return new URLSearchParams();
    }
    const routeWithQuery = hash.slice(2);
    const query = routeWithQuery.includes('?') ? routeWithQuery.slice(routeWithQuery.indexOf('?') + 1) : '';
    return new URLSearchParams(query);
}

function getNavScopes() {
    // Row 1 (top-right utility cluster) and Row 2 (#navbar-menu collapse) both
    // host nav items that need active-state highlighting (Trust/Assets on Row 2,
    // Tools/Settings/MAGI on Row 1). Treat them as a single nav surface.
    const scopes = [];
    const topRight = document.querySelector('.navbar-top-right');
    if (topRight) scopes.push(topRight);
    const collapse = document.getElementById('navbar-menu');
    if (collapse) scopes.push(collapse);
    return scopes;
}

function clearNavbarActiveState() {
    getNavScopes().forEach((scope) => {
        scope.querySelectorAll('.nav-link.active, .dropdown-item.active, .nav-item.active').forEach((el) => {
            el.classList.remove('active');
        });
        scope.querySelectorAll('[aria-current="page"]').forEach((el) => {
            el.removeAttribute('aria-current');
        });
    });
}

function markActive(anchor) {
    if (!anchor) return;

    anchor.classList.add('active');
    anchor.setAttribute('aria-current', 'page');
    anchor.closest('.nav-item')?.classList.add('active');

    const dropdownMenu = anchor.closest('.dropdown-menu');
    if (!dropdownMenu) return;

    // The toggle is the parent .nav-item's first .nav-link with
    // data-bs-toggle="dropdown" (covers Tabler's `dropdown-toggle`-classed
    // toggles and any plain data-toggle links). Walking from the dropdown-menu's previousElementSibling is
    // unreliable because the menu can be wrapped or rendered separately, so
    // resolve via the parent .nav-item.dropdown.
    const parentDropdown = dropdownMenu.closest('.nav-item.dropdown');
    if (!parentDropdown) return;

    const dropdownToggle = parentDropdown.querySelector(
        ':scope > .nav-link[data-bs-toggle="dropdown"], :scope > .nav-link.dropdown-toggle'
    );
    if (dropdownToggle) {
        dropdownToggle.classList.add('active');
        parentDropdown.classList.add('active');
    }
}

function setNavbarActiveState() {
    const scopes = getNavScopes();
    if (scopes.length === 0) return;

    const routePath = getCurrentRoutePath();
    const routeQuery = getCurrentRouteQueryParams();
    const alertDomain = (routeQuery.get('domain') || '').toLowerCase();
    const alertLens = (routeQuery.get('lens') || '').toLowerCase();
    clearNavbarActiveState();

    let targetHref = null;

    // Officer MAGI (right-aligned on row 2)
    if (routePath.startsWith('/analyst')) {
        targetHref = '#!/analyst';

    // Protect owns Security Overview, Security Alerts, vulnerabilities, patch posture,
    // posture, and attack-chain evidence.
    // Route map points at the specific child anchor so markActive() walks up to
    // light the Security parent.
    } else if (routePath.startsWith('/attack-chain')) {
        targetHref = '#!/attack-chain';
    } else if (routePath.startsWith('/vulnerabilities')) {
        targetHref = '#!/vulnerabilities';
    } else if (routePath.startsWith('/patch-posture')) {
        targetHref = '#!/patch-posture';
    } else if (routePath.startsWith('/posture')) {
        targetHref = '#!/posture';
    } else if (
        (routePath.startsWith('/security') && !routePath.startsWith('/security/response')) ||
        routePath.startsWith('/cves') ||
        routePath.startsWith('/unified-dashboard')
    ) {
        targetHref = '#!/security';

    // Compliance dropdown owns Overview + Compliance Plus.
    } else if (routePath.startsWith('/add-ons/compliance-plus')) {
        targetHref = '#!/add-ons/compliance-plus';
    } else if (routePath.startsWith('/compliance')) {
        targetHref = '#!/compliance';

    } else if (routePath.startsWith('/alerts') || routePath.startsWith('/remediation')) {
        targetHref = routePath.startsWith('/alerts/compliance') || alertLens === 'compliance' || alertDomain === 'compliance'
            ? '#!/alerts/compliance'
            : '#!/alerts/security';

    } else if (
        routePath.startsWith('/proof') ||
        routePath.startsWith('/audit') ||
        routePath.startsWith('/auditor') ||
        routePath.startsWith('/reports') ||
        routePath.startsWith('/mission-brief') ||
        routePath.startsWith('/posture-ai')
    ) {
        if (routePath.startsWith('/audit-log')) {
            targetHref = '#!/audit-log';
        } else if (routePath.startsWith('/audit') || routePath.startsWith('/auditor')) {
            targetHref = '#!/audit';
        } else if (routePath.startsWith('/reports')) {
            targetHref = (routeQuery.get('scope') || '').toLowerCase() === 'compliance' ? '#!/reports?scope=compliance' : '#!/reports';
        } else if (routePath.startsWith('/mission-brief') || routePath.startsWith('/posture-ai')) {
            targetHref = '#!/mission-brief';
        } else {
            targetHref = '#!/proof';
        }

    } else if (routePath.startsWith('/add-ons/hygiene-coach') || routePath.startsWith('/hygiene')) {
        targetHref = '#!/hygiene';

    // Improve owns hygiene, insurance readiness, peer benchmark, and supply-chain intelligence.
    } else if (routePath.startsWith('/add-ons/supply-chain-intel')) {
        targetHref = '#!/add-ons/supply-chain-intel';
    } else if (
        routePath.startsWith('/add-ons/peer-benchmark') ||
        routePath.startsWith('/add-ons/insurance-readiness') ||
        routePath.startsWith('/insurance') ||
        routePath.startsWith('/insure')
    ) {
        targetHref = '#!/insurance';

    // Assets dropdown owns Fleet / Software / Change Log plus Site Admin Response Actions.
    } else if (
        routePath.startsWith('/devices') ||
        routePath.startsWith('/apps') ||
        routePath.startsWith('/changelog') ||
        routePath.startsWith('/security/response')
    ) {
        if (routePath.startsWith('/security/response')) {
            targetHref = '#!/security/response';
        } else if (routePath.startsWith('/apps')) {
            targetHref = '#!/apps';
        } else if (routePath.startsWith('/changelog')) {
            targetHref = '#!/changelog';
        } else {
            targetHref = '#!/devices';
        }

    // Settings (Row 1 plain link).
    } else if (
        routePath.startsWith('/settings') ||
        routePath.startsWith('/licenses')
    ) {
        targetHref = '#!/settings';

    // ── Trust ────────────────────────────────────────────────────────────────

    } else if (
        routePath === '/' ||
        routePath.startsWith('/dashboard') ||
        routePath.startsWith('/hub') ||
        routePath.startsWith('/getting-started')
    ) {
        targetHref = '#!/dashboard';

    // ── Site admin (no main-nav highlight) ───────────────────────────────────
    // Includes /review (Feature Catalog — unwired-page review) and any /siteadmin/* path.
    } else if (routePath.startsWith('/siteadmin/') || routePath.startsWith('/review')) {
        targetHref = null;
    }

    if (!targetHref) return;

    const PREFERRED_DROPDOWN_IDS = new Set([
        'nav-home-item',
        'nav-assets-item',
        'nav-protect-item',
        'nav-comply-item',
        'nav-prove-item',
        'nav-improve-item',
        'nav-magi-item',
    ]);

    const candidates = [];
    getNavScopes().forEach((scope) => {
        scope.querySelectorAll(`a[href="${targetHref}"]`).forEach((a) => candidates.push(a));
    });
    // Sort candidates with two priorities, in order:
    //  1. Anchors whose parent `.nav-item.dropdown` is currently *visible* win.
    //     Hidden entitlement-gated parents should not win over visible parents.
    //  2. Site Admin dropdown historically duplicated customer-menu entries.
    //     Prefer the canonical Trust/Assets/Protect/Comply/Prove/Improve row so
    //     customer areas light up instead of Site Admin
    //     when both contain the same href.
    candidates.sort((a, b) => {
        const aParent = a.closest('.nav-item.dropdown');
        const bParent = b.closest('.nav-item.dropdown');
        const aParentVisible = aParent && aParent.offsetParent !== null ? 0 : 1;
        const bParentVisible = bParent && bParent.offsetParent !== null ? 0 : 1;
        if (aParentVisible !== bParentVisible) return aParentVisible - bParentVisible;
        const aPref = PREFERRED_DROPDOWN_IDS.has(aParent?.id || '') ? 0 : 1;
        const bPref = PREFERRED_DROPDOWN_IDS.has(bParent?.id || '') ? 0 : 1;
        return aPref - bPref;
    });
    const targetAnchor = candidates.find((anchor) => anchor.offsetParent !== null) || candidates[0] || null;
    markActive(targetAnchor);
}

window.addEventListener('hashchange', setNavbarActiveState);
document.addEventListener('DOMContentLoaded', setNavbarActiveState);

// Re-evaluate active state when the chevron-arc breakpoint is crossed in
// either direction. Without this, the active class can stick on a now-hidden
// parent (e.g. mobile journey dropdown active at <1200px stays active when the
// user widens the window past the breakpoint, leaving the now-visible chevron
// arc with no indicator). The two-tier candidate sort in
// setNavbarActiveState() does the right thing once it re-runs.
if (typeof window.matchMedia === 'function') {
    const mql = window.matchMedia('(max-width: 1199.98px)');
    if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', setNavbarActiveState);
    } else if (typeof mql.addListener === 'function') {
        mql.addListener(setNavbarActiveState);
    }
}
