/**
 * MagenSec  Navbar component
 * Injects shared navigation HTML into every page.
 * Call loadNavbar({ active: "home|magi|pricing|about|fixit", relativePath: "" }) 
 * from each page, or set <body data-nav-active="..."> and omit params.
 */
(function () {
  'use strict';

  var NAV_LINKS = [
    { key: 'home',    label: 'Home',       href: 'index.html' },
    { key: 'magi',    label: 'MAGI AI',    href: 'magi.html',    accent: true },
    { key: 'pricing', label: 'Pricing',    href: 'pricing.html' },
    { key: 'fixit',   label: 'Install',    href: 'FixIt.html' },
    { key: 'about',   label: 'About',      href: 'about.html' },
  ];

  function buildNavHTML(opts) {
    var base   = opts.relativePath || '';
    var active = opts.active || document.body.dataset.navActive || '';

    var logoHref    = base + 'index.html';
    var portalHref  = base + 'portal/';
    var downloadHref = base + 'FixIt.html';
    var storeHref   = 'https://apps.microsoft.com/detail/xpfmw6btjzf89s';

    var linksHTML = NAV_LINKS.map(function (link) {
      var href    = base + link.href;
      var cls     = 'nav__link' + (link.key === active ? ' nav__link--active' : '') + (link.accent ? ' nav__link--accent' : '');
      return '<a href="' + href + '" class="' + cls + '">' + link.label + '</a>';
    }).join('\n        ');

    var mobileLinksHTML = NAV_LINKS.map(function (link) {
      var href = base + link.href;
      var cls  = 'nav__mobile-link' + (link.key === active ? ' nav__mobile-link--active' : '') + (link.accent ? ' nav__mobile-link--accent' : '');
      return '<a href="' + href + '" class="' + cls + '">' + link.label + '</a>';
    }).join('\n        ');

    return [
      '<header class="nav" id="nav" role="banner">',
      '  <div class="nav__inner container">',
      '',
      '    <!-- Logo -->',
      '    <a href="' + logoHref + '" class="nav__logo" aria-label="MagenSec  Home">',
      '      <img src="' + base + 'assets/black_shield_256x256.png" alt="" width="32" height="32" aria-hidden="true">',
      '      <span class="nav__brand">Magen<span class="nav__brand-sec">Sec</span></span>',
      '    </a>',
      '',
      '    <!-- Desktop nav links -->',
      '    <nav class="nav__links" aria-label="Main navigation">',
      '      ' + linksHTML,
      '    </nav>',
      '',
      '    <!-- Desktop actions -->',
      '    <div class="nav__actions">',
      '      <div class="download-dropdown" role="group" aria-label="Download options">',
      '        <button class="btn-ghost btn--sm download-dropdown__trigger" aria-haspopup="true" aria-expanded="false">',
      '          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      '          Download',
      '          <svg class="chevron" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
      '        </button>',
      '        <div class="download-dropdown__panel" role="menu">',
      '          <div class="download-dropdown__header">MagenSec for Windows</div>',
      '          <a id="dl-store"  href="' + storeHref + '" class="download-dropdown__item" role="menuitem" target="_blank" rel="nofollow noopener">',
      '            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5 12 3l9 2.5v13L12 21 3 18.5V5.5Z"/><path d="M12 3v18"/><path d="M3 9.5 12 12l9-2.5"/></svg>',
      '            Download on Microsoft Store',
      '          </a>',
      '          <a id="dl-manual" href="' + downloadHref + '#enterprise-deploy" class="download-dropdown__item" role="menuitem">',
      '            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      '            Manual & CLI install',
      '          </a>',
      '        </div>',
      '      </div>',
      '',
      '      <a href="' + portalHref + '" class="btn-primary btn--sm">',
      '        Sign In',
      '        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
      '      </a>',
      '    </div>',
      '',
      '    <!-- Burger (mobile) -->',
      '    <button class="nav__burger" aria-controls="mobile-menu" aria-expanded="false" aria-label="Open navigation menu">',
      '      <span class="nav__burger-bar"></span>',
      '      <span class="nav__burger-bar"></span>',
      '      <span class="nav__burger-bar"></span>',
      '    </button>',
      '  </div>',
      '',
      '  <!-- Mobile menu overlay -->',
      '  <div class="nav__mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu">',
      '    <nav aria-label="Mobile navigation">',
      '      ' + mobileLinksHTML,
      '    </nav>',
      '    <div class="nav__mobile-actions">',
      '      <a href="' + storeHref + '" class="btn-ghost btn--full" target="_blank" rel="nofollow noopener">Get it on Microsoft Store</a>',
      '      <a href="' + downloadHref + '#enterprise-deploy" class="btn-ghost btn--full">Manual & CLI Install</a>',
      '      <a href="' + portalHref + '" class="btn-primary btn--full">Sign In to Portal</a>',
      '    </div>',
      '    <div class="nav__mobile-contact">',
      '      <a href="mailto:MagenSec@Gigabits.co.in">MagenSec@Gigabits.co.in</a>',
      '    </div>',
      '  </div>',
      '</header>',
    ].join('\n');
  }

  window.loadNavbar = function (opts) {
    opts = opts || {};
    var placeholder = document.getElementById('navbar-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'navbar-placeholder';
      document.body.insertBefore(placeholder, document.body.firstChild);
    }
    placeholder.outerHTML = buildNavHTML(opts);

    // Hydrate download links after insertion
    if (typeof window.initDownloadLinks === 'function') {
      window.initDownloadLinks();
    }
  };

})();
