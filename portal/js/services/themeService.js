/**
 * Theme Service
 * 
 * Manages light/dark theme switching with localStorage persistence
 */

class ThemeService {
    constructor() {
        this.currentTheme = this.getStoredTheme() || this.getPreferredTheme();
        this.listeners = new Set();
    }

    getStoredTheme() {
        // Read from unified key first; fall back to legacy 'theme' key
        return localStorage.getItem('magensec-theme') || localStorage.getItem('theme');
    }

    getPreferredTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    setTheme(theme) {
        this.currentTheme = theme;
        // Use unified key (same as theme.js ThemeManager)
        localStorage.setItem('magensec-theme', theme);
        // Set both attributes: data-bs-theme for Tabler components, data-theme for custom CSS
        document.documentElement.setAttribute('data-bs-theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update theme color meta tag
        const themeColor = theme === 'dark' ? '#1a1f36' : '#ffffff';
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = themeColor;
        
        // Notify listeners
        this.listeners.forEach(listener => listener(theme));
        
        console.log('[Theme] Switched to', theme);
    }

    toggle() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
        return newTheme;
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    isDark() {
        return this.currentTheme === 'dark';
    }

    initialize() {
        // Apply stored/preferred theme on load
        this.setTheme(this.currentTheme);
        
        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!this.getStoredTheme()) {
                    // Only auto-switch if user hasn't manually chosen a theme
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
        
        console.log('[Theme] Initialized with theme:', this.currentTheme);
    }

    onChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    createToggleButton() {
        const button = document.createElement('button');
        button.className = 'btn btn-icon';
        button.setAttribute('aria-label', 'Toggle theme');
        button.innerHTML = this.isDark() 
            ? this.getSunIcon() 
            : this.getMoonIcon();
        
        button.addEventListener('click', () => {
            this.toggle();
            button.innerHTML = this.isDark() 
                ? this.getSunIcon() 
                : this.getMoonIcon();
        });
        
        // Update button when theme changes from elsewhere
        this.onChange((theme) => {
            button.innerHTML = theme === 'dark' 
                ? this.getSunIcon() 
                : this.getMoonIcon();
        });
        
        return button;
    }

    getMoonIcon() {
        return `
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>
            </svg>
        `;
    }

    getSunIcon() {
        return `
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <circle cx="12" cy="12" r="4"/>
                <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>
            </svg>
        `;
    }
}

// Export singleton instance
const themeService = new ThemeService();
export default themeService;
