(function () {
  var mount = document.getElementById('site-footer');
  if (!mount) return;

  function getBasePath() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('assets/js/footer-include.js') === -1) continue;
      try {
        var url = new URL(src, window.location.href);
        var path = url.pathname.replace(/\/assets\/js\/footer-include\.js.*$/, '');
        return path && path !== '/' ? path : '';
      } catch (e) {
        continue;
      }
    }
    return '';
  }

  var basePath = getBasePath();

  function toBasePath(path) {
    if (!path) return path;
    if (/^(https?:)?\/\//i.test(path) || path.indexOf('mailto:') === 0 || path.indexOf('#') === 0 || path.indexOf('javascript:') === 0 || path.indexOf('data:') === 0) {
      return path;
    }
    var cleaned = path.replace(/^\.?\//, '').replace(/^\//, '');
    if (isFileProtocol) {
      // On file://, keep links anchored to detected project base so subfolder pages
      // do not resolve assets under /features/assets or /editions/assets.
      if (basePath) return basePath + '/' + cleaned;
      return cleaned;
    }
    if (!basePath) return '/' + cleaned;
    return basePath + '/' + cleaned;
  }

  function normalizeLinks(scope) {
    var anchors = scope.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href');
      anchors[i].setAttribute('href', toBasePath(href));
    }

    var images = scope.querySelectorAll('img[src]');
    for (var j = 0; j < images.length; j++) {
      var src = images[j].getAttribute('src');
      images[j].setAttribute('src', toBasePath(src));
    }
  }

  function hydrateFooter(scope) {
    var years = scope.querySelectorAll('[data-footer-year]');
    var currentYear = String(new Date().getFullYear());
    for (var i = 0; i < years.length; i++) {
      years[i].textContent = currentYear;
    }
  }

  function normalizePath(path) {
    var out = String(path || '');
    out = out.replace(/\/index\.html$/i, '/');
    out = out.replace(/\/+$|\\+$/g, '');
    return out || '/';
  }

  function applyActiveLinks(scope) {
    var currentPath = normalizePath(window.location.pathname);
    var links = scope.querySelectorAll('.footer__link[href], .footer__bottom-link[href]');

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      link.classList.remove('footer__link--active', 'footer__bottom-link--active');
      var href = link.getAttribute('href') || '';
      if (!href || href === '#' || href.indexOf('mailto:') === 0 || href.indexOf('javascript:') === 0) continue;

      try {
        var targetUrl = new URL(href, window.location.href);
        var targetPath = normalizePath(targetUrl.pathname);
        if (targetPath !== currentPath) continue;
        if (link.classList.contains('footer__bottom-link')) {
          link.classList.add('footer__bottom-link--active');
        } else {
          link.classList.add('footer__link--active');
        }
      } catch (e) {
        continue;
      }
    }
  }

  var isFileProtocol = window.location.protocol === 'file:';

  var src = mount.getAttribute('data-footer-src') || 'footer.html';
  var attempts = [src, 'footer.html', '../footer.html', '../../footer.html'];
  if (basePath) attempts.push(basePath + '/footer.html');
  attempts.push('/footer.html');

  var fallbackHtml = `
<footer class="footer" role="contentinfo">
  <div class="container">
    <div class="footer__grid">
      <div class="footer__brand">
        <a href="index.html" class="footer__brand-logo">
          <img src="assets/black_shield_256x256.png" alt="MagenSec Shield" width="32" height="32" loading="lazy" decoding="async">
          <span class="footer__brand-name">MagenSec</span>
        </a>
        <p class="footer__brand-tagline">Continuous security auditing for SMB environments. Protect, Prove, and act with MAGI AI.</p>
        <a href="mailto:MagenSec@Gigabits.co.in" class="footer__contact-link">
          <span class="footer__icon" aria-hidden="true"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
          <span>MagenSec@Gigabits.co.in</span>
        </a>
      </div>
      <nav aria-label="Platform links">
        <h3 class="footer__col-title">Platform</h3>
        <div class="footer__product-grid">
          <div class="footer__stack">
            <a href="platform/antivirus-management.html" class="footer__link">Security Coverage</a>
            <a href="platform/vulnerability.html" class="footer__link">Vulnerability Detection</a>
            <a href="platform/software-inventory.html" class="footer__link">Software Inventory</a>
            <a href="platform/license-management.html" class="footer__link">License Management</a>
          </div>
          <div class="footer__stack">
            <a href="platform/compliance.html" class="footer__link">Compliance Monitoring</a>
            <a href="platform/audit.html" class="footer__link">Audit + Rewind</a>
            <a href="magi.html" class="footer__link">MAGI AI</a>
          </div>
        </div>
      </nav>
      <nav aria-label="Plan links">
        <h3 class="footer__col-title">Plans</h3>
        <div class="footer__stack">
          <a href="editions/personal.html" class="footer__link">Personal</a>
          <a href="editions/education.html" class="footer__link">Education</a>
          <a href="editions/business.html" class="footer__link">Business</a>
          <a href="mailto:MagenSec@Gigabits.co.in" class="footer__link">Managed Services</a>
        </div>
      </nav>
      <nav aria-label="Company links">
        <h3 class="footer__col-title">Company</h3>
        <div class="footer__stack">
          <a href="about.html" class="footer__link">About</a>
          <a href="terms.html" class="footer__link">Legal</a>
          <a href="portal/" class="footer__link">
            <span class="footer__icon" aria-hidden="true"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg></span>
            <span>Customer Portal</span>
          </a>
          <a href="mailto:MagenSec@Gigabits.co.in" class="footer__link">Contact</a>
        </div>
      </nav>
    </div>
    <div class="footer__bottom">
      <div class="footer__copyright">&copy; 2024-<span data-footer-year>2026</span> MagenSec by Gigabits. All rights reserved.</div>
      <div class="footer__bottom-links">
        <span class="footer__status-pill footer__status-pill--inline">System Status: Operational</span>
        <a href="terms.html#privacy" class="footer__bottom-link">
          <span class="footer__icon" aria-hidden="true"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 3 4 7v6c0 5 3.5 7.8 8 9 4.5-1.2 8-4 8-9V7l-8-4Z"/><path d="M9 12l2 2 4-4"/></svg></span>
          <span>Privacy Policy</span>
        </a>
        <a href="terms.html#terms" class="footer__bottom-link">Terms of Service</a>
        <a href="#" class="footer__bottom-link footer__bottom-link--top" aria-label="Back to top">Back to Top</a>
      </div>
    </div>
  </div>
</footer>`;

  if (isFileProtocol) {
    mount.innerHTML = fallbackHtml;
    normalizeLinks(mount);
    hydrateFooter(mount);
    applyActiveLinks(mount);
    return;
  }

  function tryLoad(index) {
    if (index >= attempts.length) {
      mount.innerHTML = fallbackHtml;
      normalizeLinks(mount);
      hydrateFooter(mount);
      applyActiveLinks(mount);
      return;
    }

    fetch(attempts[index], { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Footer load failed: ' + response.status);
        return response.text();
      })
      .then(function (html) {
        mount.innerHTML = html;
        normalizeLinks(mount);
        hydrateFooter(mount);
        applyActiveLinks(mount);
      })
      .catch(function () {
        tryLoad(index + 1);
      });
  }

  tryLoad(0);
})();
