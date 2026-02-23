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
    }

    setupToggle() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) {
            console.warn('[Theme] Toggle not found, will retry');
            setTimeout(() => this.setupToggle(), 100);
            return;
        }

        // Set initial state
        const currentTheme = this.getTheme();
        toggle.checked = currentTheme === 'dark';

        // Listen for changes
        toggle.addEventListener('change', (e) => {
            this.setTheme(e.target.checked ? 'dark' : 'light');
        });

        console.log('[Theme] Toggle wired up, current:', currentTheme);
    }

    updateToggle(theme) {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.checked = theme === 'dark';
        }
    }
}

// Export singleton instance
export const theme = new ThemeManager();

// Expose globally for easy access
window.themeManager = theme;
