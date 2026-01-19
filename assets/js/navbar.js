/**
 * MagenSec Shared Navbar Loader
 * Solves the "multi-page static site" menu synchronization problem.
 * 
 * Usage:
 * <div id="navbar-placeholder"></div>
 * <script src="assets/js/navbar.js"></script>
 * <script>
 *   loadNavbar({
 *     active: 'personal', // 'personal' | 'business' | 'features'
 *     mode: 'personal',   // 'personal' (Download CTA) | 'enterprise' (Contact Sales CTA) 
 *     relativePath: ''    // '' for root pages, '../' for subfolders
 *   });
 * </script>
 */

function loadNavbar(options = {}) {
    const defaults = {
        active: 'personal',
        mode: 'personal',
        relativePath: ''
    };
    
    const config = { ...defaults, ...options };
    const p = config.relativePath; // Short alias for path prefix

    // Configurable content based on mode
    const isEnterprise = config.mode === 'enterprise';
    const brandSubtitle = isEnterprise ? 'Enterprise' : 'by Gigabits';
    const ctaLink = isEnterprise ? '#contact-sales' : '#download';
    const ctaText = isEnterprise ? 'Contact Sales' : '📥 Download Free Trial';
    const ctaClass = 'btn btn-primary';

    // Active state classes
    const activeClass = 'active fw-bold';
    
    const html = `
    <header class="navbar navbar-expand-md navbar-light d-print-none sticky-top">
        <div class="container-xl">
            <!-- Brand -->
            <h1 class="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
                <a href="${p}index.html" class="text-decoration-none d-flex align-items-center">
                    <picture class="me-2">
                        <source srcset="${p}assets/logo.webp" type="image/webp">
                        <img src="${p}assets/logo.png" alt="MagenSec" width="32" height="32" style="height: 32px; width: 32px;">
                    </picture>
                    <div>
                        <strong>MagenSec</strong>
                        <span class="text-muted small d-block" style="font-size: 0.7rem; line-height: 1;">${brandSubtitle}</span>
                    </div>
                </a>
            </h1>

            <!-- Right Side CTA (Desktop) -->
            <div class="navbar-nav flex-row order-md-last">
                <div class="nav-item d-none d-md-flex me-3">
                    <div class="btn-list">
                        <a href="${isEnterprise ? '' : p + 'index.html'}${ctaLink}" class="${ctaClass}">
                            ${ctaText}
                        </a>
                    </div>
                </div>
                <!-- Mobile Menu Toggler -->
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu" aria-controls="navbar-menu" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
            </div>

            <!-- Navigation Links -->
            <div class="collapse navbar-collapse" id="navbar-menu">
                <div class="d-flex flex-column flex-md-row flex-fill align-items-stretch align-items-md-center">
                    <ul class="navbar-nav">
                        <li class="nav-item ${config.active === 'personal' ? activeClass : ''}">
                            <a class="nav-link" href="${p}index.html">Personal</a>
                        </li>
                        <li class="nav-item ${config.active === 'business' ? activeClass : ''}">
                            <a class="nav-link" href="${p}enterprise.html">Business & Managed</a>
                        </li>
                        <li class="nav-item dropdown ${config.active === 'features' ? 'active' : ''}">
                            <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown" role="button" aria-expanded="false">Features</a>
                            <div class="dropdown-menu">
                                <a href="${p}features/vulnerability.html" class="dropdown-item">AI Vulnerability Analyst</a>
                                <a href="${p}features/software-inventory.html" class="dropdown-item">Software Inventory</a>
                                <a href="${p}features/compliance.html" class="dropdown-item">Compliance Reports</a>
                            </div>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="${p}index.html#pricing">Pricing</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="${p}index.html#faq">FAQ</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="${p}index.html#about">About</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="${p}FixIt.html">Security Guide</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="${p}index.html#contact">Contact</a>
                        </li>
                        <li class="nav-item dropdown">
                            <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown" role="button" aria-expanded="false">
                                <span class="d-md-none d-lg-inline-block">Admin Tools</span>
                            </a>
                            <div class="dropdown-menu">
                                <a class="dropdown-item" href="${p}portal/" target="_blank">Security Portal</a>
                                <div class="dropdown-divider"></div>
                                <h6 class="dropdown-header">For Organizations</h6>
                                <p class="dropdown-item text-muted small mb-0">
                                    Multi-device security management and reports for IT administrators.
                                </p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </header>
    `;

    document.getElementById('navbar-placeholder').innerHTML = html;
}
