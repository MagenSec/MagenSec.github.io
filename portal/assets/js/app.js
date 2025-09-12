// Application Initialization and Global Functions
class MagenSecApp {
    constructor() {
        this.initialized = false;
        this.modules = [];
    }
    
    async initialize() {
        if (this.initialized) return;
        
        try {
            console.log('MagenSec Hub initializing...');
            
            // Initialize core modules
            await this.initializeModules();
            
            // Initialize router
            window.MagenSecRouter.initialize();
            
            // Set up global error handling
            this.setupErrorHandling();
            
            // Set up keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            this.initialized = true;
            console.log('MagenSec Hub initialized successfully');
            
        } catch (error) {
            console.error('Application initialization failed:', error);
            this.showInitializationError(error);
        }
    }
    
    async initializeModules() {
        // Initialize authentication first
        if (window.MagenSecAuth) {
            await window.MagenSecAuth.initialize();
            this.modules.push('auth');
        }
        
        // Initialize other modules as needed
        this.modules.push('router', 'ui', 'api');
    }
    
    setupErrorHandling() {
        // Global error handler for unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            
            // Don't show toast for authentication errors (handled elsewhere)
            if (event.reason?.message?.includes('auth') || 
                event.reason?.message?.includes('token')) {
                return;
            }
            
            window.MagenSecUI?.showToast('An unexpected error occurred', 'error');
        });
        
        // Global error handler for runtime errors
        window.addEventListener('error', (event) => {
            console.error('Runtime error:', event.error);
            
            // Only show user-facing errors for critical issues
            if (event.error?.message?.includes('Failed to fetch') ||
                event.error?.message?.includes('Network')) {
                window.MagenSecUI?.showToast('Network connection error', 'error');
            }
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when not in input fields
            if (event.target.tagName === 'INPUT' || 
                event.target.tagName === 'TEXTAREA' || 
                event.target.contentEditable === 'true') {
                return;
            }
            
            // Handle keyboard shortcuts
            if (event.ctrlKey || event.metaKey) {
                switch (event.key) {
                    case 'k':
                        event.preventDefault();
                        this.openGlobalSearch();
                        break;
                    case 'h':
                        event.preventDefault();
                        window.MagenSecRouter.navigate('/dashboard');
                        break;
                    case 'r':
                        event.preventDefault();
                        window.location.reload();
                        break;
                }
            }
            
            // Handle escape key
            if (event.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }
    
    openGlobalSearch() {
        // Focus on search input if it exists
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
        if (searchInput) {
            searchInput.focus();
        } else {
            window.MagenSecUI?.showToast('Search functionality coming soon', 'info');
        }
    }
    
    closeAllModals() {
        // Close any open modals
        const modals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        modals.forEach(modal => {
            if (modal.id && modal.id.includes('modal')) {
                modal.classList.add('hidden');
            }
        });
        
        // Close any open dropdowns
        const dropdowns = document.querySelectorAll('.dropdown-open');
        dropdowns.forEach(dropdown => {
            dropdown.classList.remove('dropdown-open');
        });
    }
    
    showInitializationError(error) {
        document.body.innerHTML = `
            <div class="min-h-screen flex items-center justify-center bg-gray-50">
                <div class="max-w-md w-full text-center p-6">
                    <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                        <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                    </div>
                    <h1 class="text-2xl font-bold text-gray-900 mb-2">Application Failed to Load</h1>
                    <p class="text-gray-600 mb-6">
                        There was an error starting MagenSec Hub. Please refresh the page to try again.
                    </p>
                    <div class="space-y-3">
                        <button onclick="window.location.reload()" 
                                class="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                            Refresh Page
                        </button>
                        <details class="text-left">
                            <summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                                Technical Details
                            </summary>
                            <pre class="mt-2 text-xs text-gray-600 bg-gray-100 p-3 rounded overflow-auto">
                                ${error.message}
                                ${error.stack ? '\n\n' + error.stack : ''}
                            </pre>
                        </details>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Utility method for debugging
    getStatus() {
        return {
            initialized: this.initialized,
            modules: this.modules,
            currentRoute: window.MagenSecRouter?.currentRoute,
            isAuthenticated: window.MagenSecAuth?.isAuthenticated(),
            user: window.MagenSecAuth?.getCurrentUser()
        };
    }
}

// Initialize the application
const app = new MagenSecApp();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.initialize();
});

// Make app available globally for debugging
window.MagenSecApp = app;
