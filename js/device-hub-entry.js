// Externalized from device-hub.html for CSP compliance.
// Entry point for ClientDevicePage rendering.

import { config } from './portal/js/config.js';
import { ClientDevicePage } from './portal/js/pages/client-device/ClientDevicePage.js?v=2.1';

window.config = {
    API_BASE: config.API_BASE || localStorage.getItem('msec-api-url') || 'https://api.magensec.gigabits.co.in'
};

window.auth = {
    isAuthenticated: () => !!localStorage.getItem('msec-portal-token'),
    getToken: () => localStorage.getItem('msec-portal-token') || ''
};

document.addEventListener('DOMContentLoaded', () => {
    window.render(
        window.html`<${ClientDevicePage} />`,
        document.getElementById('root')
    );
});
