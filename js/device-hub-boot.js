// Externalized from device-hub.html for CSP compliance.
// Boot overlay control + Preact/HTM globals init.

window.html = window.htm.bind(window.preact.h);
window.render = window.preact.render;
window.Component = window.preact.Component;
window.useState = window.preactHooks.useState;
window.useEffect = window.preactHooks.useEffect;
window.useMemo = window.preactHooks.useMemo;

const bootOverlay = document.getElementById('boot-overlay');
const bootTitle = document.getElementById('boot-title');
const bootBody = document.getElementById('boot-body');
const bootActions = document.getElementById('boot-actions');
const bootRetry = document.getElementById('boot-retry');

window.hideHubBootOverlay = function () {
    if (!bootOverlay) return;
    bootOverlay.classList.add('hide');
    setTimeout(() => {
        if (bootOverlay && bootOverlay.parentNode) {
            bootOverlay.parentNode.removeChild(bootOverlay);
        }
    }, 420);
};

window.showHubBootOffline = function () {
    if (!bootOverlay) return;
    bootTitle.textContent = 'Connection needed';
    bootBody.textContent = 'MagenSec Hub requires internet access to load the latest security context. Please check your connection and retry.';
    bootActions.classList.add('show');
};

bootRetry?.addEventListener('click', () => {
    window.location.reload();
});

if (!navigator.onLine) {
    window.showHubBootOffline();
}

window.addEventListener('offline', () => {
    window.showHubBootOffline();
});
