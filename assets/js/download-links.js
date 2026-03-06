/**
 * MagenSec  Download Links
 * Detects OS & architecture, highlights the best download and warns mobile users.
 * Exposes window.initDownloadLinks() so navbar.js can retrigger after injection.
 */
(function () {
  'use strict';

  var UA = navigator.userAgent;

  function isMobile() {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  }

  function isWindows() {
    return UA.includes('Windows') || navigator.platform === 'Win32';
  }

  function isArm64() {
    return /arm64|aarch64/i.test(UA);
  }

  function isX64() {
    return /Win64|x64|amd64/i.test(UA);
  }

  function showMobileWarning() {
    var items = document.querySelectorAll('.download-dropdown__item');
    items.forEach(function (el) {
      el.insertAdjacentHTML('beforebegin',
        '<p class="download-mobile-msg">MagenSec installs on Windows.<br>' +
        'Open this page on a Windows PC for Store or manual installation.</p>'
      );
    });
  }

  function highlightPrimary(id, label) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('download-dropdown__item--primary');
    el.setAttribute('data-recommended', 'true');
    el.setAttribute('aria-label', label + ' recommended for your PC');

    var svg = el.querySelector('svg');
    var iconMarkup = svg ? svg.outerHTML : '';
    el.innerHTML = iconMarkup + label + ' <span class="download-dropdown__hint">Recommended for your PC</span>';
  }

  window.initDownloadLinks = function () {
    if (isMobile()) {
      showMobileWarning();
      return;
    }

    if (!isWindows()) {
      // Not Windows — keep store/manual visible without platform-specific highlights
      ['dl-store', 'dl-manual'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = '';
      });
      return;
    }

    if (isArm64() || isX64()) {
      highlightPrimary('dl-store', 'Download on Microsoft Store');
    }
  };

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initDownloadLinks);
  } else {
    window.initDownloadLinks();
  }

})();
