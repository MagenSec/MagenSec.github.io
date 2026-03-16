/**
 * Theme Manager - Dark/Light mode using Tabler's built-in theme system
 * Uses data-bs-theme attribute and localStorage persistence
 */

class ThemeManager {
    constructor() {
        this.storageKey = 'magensec-theme';
        this.init();
    }

    init() {
        // Apply saved theme or default to light
        const savedTheme = this.getTheme();
        this.applyTheme(savedTheme);
        
        // Wire up toggle when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupToggle());
        } else {
            this.setupToggle();
        }
    }

    getTheme() {
        const saved = localStorage.getItem(this.storageKey);
        return saved === 'dark' ? 'dark' : 'light';
    }

    setTheme(theme) {
        const newTheme = theme === 'dark' ? 'dark' : 'light';
        localStorage.setItem(this.storageKey, newTheme);
        this.applyTheme(newTheme);
        this.updateToggle(newTheme);
    }

    applyTheme(theme) {
        // Use Tabler's built-in theme system
        document.documentElement.setAttribute('data-bs-theme', theme);
        // Also set data-theme for custom CSS selectors in portal.css / ai-pages.css
        document.documentElement.setAttribute('data-theme', theme);
        console.log('[Theme] Applied theme:', theme);
        // Fire custom event for components that need to react (like ApexCharts)
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
    }

    setupToggle() {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) {
            console.warn('[Theme] Toggle button not found, will retry');
            setTimeout(() => this.setupToggle(), 100);
            return;
        }

        // Set initial icon
        this.updateToggle(this.getTheme());

        // Listen for clicks
        btn.addEventListener('click', () => {
            const newTheme = this.getTheme() === 'dark' ? 'light' : 'dark';
            this.setTheme(newTheme);
        });

        console.log('[Theme] Toggle wired up, current:', this.getTheme());
    }

    updateToggle(theme) {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;
        btn.innerHTML = theme === 'dark' ? this.getSunIcon() : this.getMoonIcon();
    }

    getMoonIcon() {
        return '<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/></svg>';
    }

    getSunIcon() {
        return '<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="4"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/></svg>';
    }
}

// Export singleton instance
export const theme = new ThemeManager();

// Expose globally for easy access
window.themeManager = theme;

