/**
 * MagenSec — Animations Module
 * Intersection Observer scroll reveals, counter animation, typewriter effect
 * No dependencies — vanilla ES6+
 */
(function () {
  'use strict';

  /* ── Scroll Reveal ─────────────────────────────────────────────────── */
  function initScrollReveal() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    // If observer APIs are unavailable, reveal everything immediately.
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ── Animated Counters ─────────────────────────────────────────────── */
  function animateCounter(el) {
    const target = parseFloat(el.dataset.target || el.textContent.replace(/[^0-9.]/g, ''));
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const duration = parseInt(el.dataset.duration || '2000', 10);
    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0;
    const start = performance.now();

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const current = target * eased;
      el.textContent = prefix + current.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function initCounters() {
    const els = document.querySelectorAll('[data-counter]');
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => {
        const target = el.dataset.target;
        if (typeof target !== 'undefined' && target !== '') {
          el.textContent = target + (el.dataset.suffix || '');
        }
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ── Typewriter Effect ─────────────────────────────────────────────── */
  function initTypewriter() {
    const el = document.querySelector('[data-typewriter]');
    if (!el) return;

    const phrases = JSON.parse(el.dataset.typewriter || '[]');
    const cursor = el.querySelector('.hero__typewriter-cursor');
    const textEl = el.querySelector('[data-typewriter-text]') || el;
    if (!phrases.length) return;

    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let isPaused = false;

    const TYPING_SPEED   = 65;
    const DELETING_SPEED = 35;
    const PAUSE_END      = 2200;
    const PAUSE_START    = 400;

    function type() {
      const phrase = phrases[phraseIdx];

      if (isPaused) {
        isPaused = false;
        setTimeout(type, isDeleting ? PAUSE_START : PAUSE_END);
        return;
      }

      if (!isDeleting) {
        charIdx++;
        textEl.textContent = phrase.slice(0, charIdx);
        if (charIdx === phrase.length) {
          isDeleting = true;
          isPaused = true;
          setTimeout(type, PAUSE_END);
          return;
        }
      } else {
        charIdx--;
        textEl.textContent = phrase.slice(0, charIdx);
        if (charIdx === 0) {
          isDeleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
          isPaused = true;
          setTimeout(type, PAUSE_START);
          return;
        }
      }

      setTimeout(type, isDeleting ? DELETING_SPEED : TYPING_SPEED);
    }

    // Small initial delay before starting
    setTimeout(type, 800);
  }

  /* ── FAQ Accordion ─────────────────────────────────────────────────── */
  function initFaq() {
    document.querySelectorAll('.faq-question').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('is-open');

        // Close all
        document.querySelectorAll('.faq-item.is-open').forEach((open) => {
          if (open !== item) open.classList.remove('is-open');
        });

        // Toggle clicked
        item.classList.toggle('is-open', !isOpen);
      });
    });
  }

  /* ── Promo Banner Dismiss ──────────────────────────────────────────── */
  function initPromoBanner() {
    const close = document.querySelector('.promo-banner__close');
    if (!close) return;
    const banner = close.closest('.promo-banner');
    if (!banner) return;
    close.addEventListener('click', () => {
      banner.style.maxHeight = banner.offsetHeight + 'px';
      requestAnimationFrame(() => {
        banner.style.transition = 'max-height .3s ease, opacity .3s ease';
        banner.style.maxHeight = '0';
        banner.style.opacity = '0';
        banner.style.overflow = 'hidden';
      });
      try { sessionStorage.setItem('promo-dismissed', '1'); } catch (_) {}
    });

    try {
      if (sessionStorage.getItem('promo-dismissed')) banner.style.display = 'none';
    } catch (_) {}
  }

  /* ── Pricing Tier Toggle ───────────────────────────────────────────── */
  function initPricingTabs() {
    document.querySelectorAll('.pricing-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const group = tab.dataset.group;
        document.querySelectorAll('.pricing-tab').forEach((t) => t.classList.remove('pricing-tab--active'));
        tab.classList.add('pricing-tab--active');

        document.querySelectorAll('[data-pricing-group]').forEach((panel) => {
          panel.style.display = panel.dataset.pricingGroup === group ? '' : 'none';
        });
      });
    });
  }

  /* ── Terms ToC Active Link ─────────────────────────────────────────── */
  function initTermsToc() {
    const links = document.querySelectorAll('.terms-toc__link');
    if (!links.length) return;

    const sections = Array.from(links)
      .map((l) => document.querySelector(l.getAttribute('href')))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = '#' + entry.target.id;
            links.forEach((l) => l.classList.toggle('terms-toc__link--active', l.getAttribute('href') === id));
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach((s) => observer.observe(s));
  }

  /* ── Copy-to-clipboard for code snippets ──────────────────────────── */
  function initCopy() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy;
        navigator.clipboard?.writeText(text).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 2000);
        });
      });
    });
  }

  /* ── Chat message animation ────────────────────────────────────────── */
  function initChatDemo() {
    const chat = document.querySelector('.magi-chat__messages');
    if (!chat) return;

    const msgs = chat.querySelectorAll('.chat-msg');
    msgs.forEach((msg, i) => {
      msg.style.opacity = '0';
      msg.style.transform = 'translateY(12px)';
      msg.style.transition = `opacity .4s ease, transform .4s ease`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          msgs.forEach((msg, i) => {
            setTimeout(() => {
              msg.style.opacity = '1';
              msg.style.transform = 'translateY(0)';
            }, i * 350);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(chat);
  }

  /* ── Init all ──────────────────────────────────────────────────────── */
  function init() {
    try {
      initScrollReveal();
      initCounters();
      initTypewriter();
      initFaq();
      initPromoBanner();
      initPricingTabs();
      initTermsToc();
      initCopy();
      initChatDemo();
    } catch (error) {
      // Never leave reveal-gated pages blank if animations fail.
      document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
