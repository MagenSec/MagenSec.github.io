// js/themeSwitcher.js

function themeSwitcherInit() {
    const themeToggle = document.querySelector('#theme-toggle-btn');
    if (!themeToggle) {
        console.log('Theme toggle button not found.');
        return;
    }
    const themeIcon = themeToggle.querySelector('i');

    const getPreferredTheme = () => {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const updateIcon = (theme) => {
        if (themeIcon) {
            themeIcon.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
        }
    };

    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem('theme', theme);
        updateIcon(theme);

        const navbar = document.querySelector('.navbar');
        if (navbar) {
            if (theme === 'dark') {
                navbar.classList.add('navbar-dark');
            } else {
                navbar.classList.remove('navbar-dark');
            }
        }

        // Redraw charts with a delay to allow theme to apply
        if (window.currentViewInit && typeof window.currentViewInit === 'function') {
            const container = document.getElementById('view-container');
            if (container && window.currentViewDependencies) {
                setTimeout(() => window.currentViewInit(container, window.currentViewDependencies), 50);
            }
        }
    };

    themeToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const currentTheme = localStorage.getItem('theme') || getPreferredTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });

    // Initial theme setup
    const savedTheme = localStorage.getItem('theme') || getPreferredTheme();
    applyTheme(savedTheme);

    console.log('Theme switcher initialized for Tabler 1.x.');
}

window.themeSwitcherInit = themeSwitcherInit;
