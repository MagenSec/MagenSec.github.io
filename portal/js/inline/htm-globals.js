// Externalized from index.html for CSP compliance.
// Initializes Preact + HTM globals before module loading.

function initializeGlobals() {
    if (!window.preact || !window.htm) {
        console.error('[Portal] Preact or HTM not loaded yet');
        return false;
    }

    // Initialize Preact and HTM globals
    window.html = window.htm.bind(window.preact.h);
    window.render = window.preact.render;
    window.Component = window.preact.Component;
    window.h = window.preact.h;
    window.createRef = window.preact.createRef;
    return true;
}

// Try to initialize immediately, or wait for load event
if (!initializeGlobals()) {
    window.addEventListener('load', initializeGlobals);
}
