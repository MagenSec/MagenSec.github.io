(function () {
  'use strict';

  function resolvePortalUrl() {
    var host = (window.location.hostname || '').toLowerCase();

    if (host === 'magensec.app' || host === 'www.magensec.app') {
      return 'https://console.magensec.app/';
    }

    if (window.location.protocol === 'file:') {
      return 'portal/';
    }

    return '/portal/';
  }

  function applyPortalLinks(scope) {
    var root = scope || document;
    var portalUrl = resolvePortalUrl();
    var links = root.querySelectorAll('[data-portal-link]');

    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('href', portalUrl);
    }
  }

  function init() {
    applyPortalLinks(document);

    if (!window.MutationObserver || !document.body) return;

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('[data-portal-link]')) {
            node.setAttribute('href', resolvePortalUrl());
          }
          if (node.querySelectorAll) {
            applyPortalLinks(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();