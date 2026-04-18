/**
 * MagenSec — Core JS
 * Replaces the old jQuery-based main.js with a lean vanilla ES6+ module.
 * Responsibilities: navbar scroll state, mobile menu, smooth scroll, active link.
 */
(function () {
  'use strict';

  /* ── Navbar Scroll State ───────────────────────────────────────────── */
  function initNavbarScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          nav.classList.toggle('nav--scrolled', window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load
  }

  /* ── Mobile Menu Toggle ────────────────────────────────────────────── */
  function initMobileMenu() {
    const burger = document.querySelector('.nav__burger') || document.querySelector('.nav__hamburger');
    const menu   = document.querySelector('.nav__mobile-menu') || document.querySelector('#mobile-nav');
    const body   = document.body;
    if (!burger || !menu) return;

    burger.addEventListener('click', () => {
      const isOpen = burger.classList.toggle('is-open');
      menu.classList.toggle('is-open', isOpen);
      body.classList.toggle('menu-open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!burger.contains(e.target) && !menu.contains(e.target)) {
        burger.classList.remove('is-open');
        menu.classList.remove('is-open');
        body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on nav link click (mobile)
    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        burger.classList.remove('is-open');
        menu.classList.remove('is-open');
        body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        burger.classList.remove('is-open');
        menu.classList.remove('is-open');
        body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.focus();
      }
    });
  }

  /* ── Promo Banner ─────────────────────────────────────────────────── */
  function initPromoBanner() {
    const banner = document.querySelector('.promo-banner');
    const root = document.documentElement;
    if (!banner) {
      root.style.setProperty('--promo-banner-height', '0px');
      return;
    }

    if (localStorage.getItem('promoBannerDismissed') === '1') {
      banner.remove();
      root.style.setProperty('--promo-banner-height', '0px');
      return;
    }

    const closeBtn = banner.querySelector('.promo-banner__close');
    const setHeight = () => {
      const height = banner.offsetHeight || 0;
      root.style.setProperty('--promo-banner-height', `${height}px`);
    };

    setHeight();
    window.addEventListener('resize', setHeight, { passive: true });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.remove();
        root.style.setProperty('--promo-banner-height', '0px');
        localStorage.setItem('promoBannerDismissed', '1');
      });
    }
  }

  /* ── Theme Toggle ──────────────────────────────────────────────────── */
  function initThemeToggle() {
    const root = document.documentElement;
    const saved = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
    const initial = saved || (prefersLight.matches ? 'light' : 'dark');

    function setTheme(theme) {
      root.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      document.querySelectorAll('.theme-toggle').forEach((btn) => {
        btn.setAttribute('aria-pressed', String(theme === 'dark'));
        btn.dataset.theme = theme;
        btn.innerHTML = theme === 'dark'
          ? '<span class="theme-toggle__icon" aria-hidden="true">☀️</span>Light'
          : '<span class="theme-toggle__icon" aria-hidden="true">🌙</span>Dark';
      });
    }

    function createButton() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-toggle';
      btn.setAttribute('aria-label', 'Toggle light and dark theme');
      btn.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
      return btn;
    }

    const actions = document.querySelector('.nav__actions');
    if (actions && !actions.querySelector('.theme-toggle')) {
      actions.insertBefore(createButton(), actions.firstChild);
    }

    const mobileMenu = document.querySelector('.nav__mobile-menu');
    if (mobileMenu && !mobileMenu.querySelector('.theme-toggle')) {
      const wrapper = document.createElement('div');
      wrapper.style.padding = '1rem 1.5rem 0';
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'center';
      wrapper.appendChild(createButton());
      mobileMenu.insertBefore(wrapper, mobileMenu.firstChild);
    }

    setTheme(initial);

    prefersLight.addEventListener('change', (event) => {
      if (!localStorage.getItem('theme')) {
        setTheme(event.matches ? 'light' : 'dark');
      }
    });
  }

  /* ── Downloads Dropdown ────────────────────────────────────────────── */
  function initDownloadDropdown() {
    document.querySelectorAll('.download-dropdown').forEach((wrap) => {
      const trigger = wrap.querySelector('.download-dropdown__trigger');
      const panel   = wrap.querySelector('.download-dropdown__panel');
      if (!trigger || !panel) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrap.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', String(isOpen));
      });

      document.addEventListener('click', () => {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ── Smooth Scroll ─────────────────────────────────────────────────── */
  function initSmoothScroll() {
    const getOffset = () => {
      const styles = getComputedStyle(document.documentElement);
      const nav = parseFloat(styles.getPropertyValue('--nav-height')) || 0;
      const promo = parseFloat(styles.getPropertyValue('--promo-banner-height')) || 0;
      return nav + promo + 8;
    };

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const hash = anchor.getAttribute('href');
        if (hash === '#') return;
        const target = document.querySelector(hash);
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - getOffset();
        window.scrollTo({ top, behavior: 'smooth' });
        history.replaceState(null, '', hash);
      });
    });
  }

  /* ── Active Nav Link ───────────────────────────────────────────────── */
  function initActiveNavLink() {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav__link').forEach((link) => {
      const rawHref = link.getAttribute('href') || '';
      const href = rawHref.replace(/\/$/, '');
      if (!href) return;
      if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
        link.classList.add('nav__link--active');
      }
    });
  }

  /* ── Reduced Motion Preference ─────────────────────────────────────── */
  function respectReducedMotion() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('reduce-motion');
    }
  }

  /* ── Init ──────────────────────────────────────────────────────────── */
  function init() {
    respectReducedMotion();
    initPromoBanner();
    initThemeToggle();
    initNavbarScroll();
    initMobileMenu();
    initDownloadDropdown();
    initSmoothScroll();
    initActiveNavLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
