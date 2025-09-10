/**
 * MagenSec Command Center - Application Initialization
 * Main application entry point and view management
 */

class AppManager {
    constructor() {
        this.currentView = null;
        this.userType = null;
        this.dashboardViews = new Map();
        this.authManager = null;
        this.apiManager = null;
        this.dashboardManager = null;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing MagenSec Command Center...');
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initApp());
            } else {
                this.initApp();
            }
        } catch (error) {
            console.error('Failed to initialize application:', error);
        }
    }

    /**
     * Initialize application after DOM is ready
     */
    async initApp() {
        try {
            // Wait for dependencies to load
            await this.waitForDependencies();
            
            // Set up references
            this.authManager = window.authManager;
            this.apiManager = window.apiManager;
            this.dashboardManager = window.dashboardManager;
            
            // Load dashboard view templates
            await this.loadDashboardViews();
            
            // Set up auth state callback
            this.authManager.setAuthStateChangeCallback(this.onAuthStateChange.bind(this));
            
            // Initialize UI based on current auth state
            this.updateUI();
            
            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    }

    /**
     * Wait for required dependencies
     */
    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDependencies = () => {
                if (window.authManager && window.apiManager && window.dashboardManager) {
                    resolve();
                } else {
                    setTimeout(checkDependencies, 100);
                }
            };
            checkDependencies();
        });
    }

    /**
     * Load dashboard view templates
     */
    async loadDashboardViews() {
        try {
            const views = [
                { name: 'individual', url: 'views/individual-dashboard.html' },
                { name: 'business', url: 'views/business-dashboard.html' },
                { name: 'admin', url: 'views/admin-dashboard.html' }
            ];

            const loadPromises = views.map(async (view) => {
                try {
                    const response = await fetch(view.url);
                    if (response.ok) {
                        const html = await response.text();
                        this.dashboardViews.set(view.name, html);
                    } else {
                        console.warn(`Failed to load ${view.name} dashboard view: ${response.status}`);
                    }
                } catch (error) {
                    console.warn(`Failed to load ${view.name} dashboard view:`, error);
                }
            });

            await Promise.allSettled(loadPromises);
            console.log('Dashboard views loaded successfully');
        } catch (error) {
            console.error('Failed to load dashboard views:', error);
        }
    }

    /**
     * Handle authentication state changes
     */
    onAuthStateChange(user, organizations) {
        this.updateUI();
        
        if (user) {
            this.loadUserDashboard();
        }
    }

    /**
     * Update UI based on authentication state
     */
    updateUI() {
        const isAuthenticated = this.authManager.isAuthenticated();
        
        // Show/hide containers
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');
        
        if (authContainer) {
            authContainer.style.display = isAuthenticated ? 'none' : 'flex';
        }
        
        if (appContainer) {
            appContainer.style.display = isAuthenticated ? 'block' : 'none';
        }
        
        if (isAuthenticated) {
            this.updateUserInfo();
            this.updateNavigation();
        }
    }

    /**
     * Update user information in the UI
     */
    updateUserInfo() {
        const user = this.authManager.getCurrentUser();
        if (!user) return;

        // Update user avatar and name
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const userEmail = document.getElementById('user-email');

        if (userAvatar && user.picture) {
            userAvatar.src = user.picture;
            userAvatar.alt = user.name;
        }

        if (userName) {
            userName.textContent = user.name;
        }

        if (userEmail) {
            userEmail.textContent = user.email;
        }

        // Update role display
        const userRole = document.getElementById('user-role');
        if (userRole) {
            const org = this.authManager.getCurrentOrganization();
            const roleText = this.getRoleDisplayText(org?.type);
            userRole.textContent = roleText;
        }
    }

    /**
     * Get display text for user role
     */
    getRoleDisplayText(orgType) {
        switch (orgType) {
            case 'site-admin':
                return 'Site Administrator';
            case 'business':
                return 'Business Administrator';
            default:
                return 'Individual User';
        }
    }

    /**
     * Update navigation based on user permissions
     */
    updateNavigation() {
        const org = this.authManager.getCurrentOrganization();
        const userType = org?.type || 'individual';
        
        // Show/hide admin navigation
        const adminNav = document.getElementById('admin-nav');
        if (adminNav) {
            adminNav.style.display = userType === 'site-admin' ? 'block' : 'none';
        }
        
        // Update organization selector
        this.updateOrganizationSelector();
    }

    /**
     * Update organization selector
     */
    updateOrganizationSelector() {
        const orgSelector = document.getElementById('org-selector');
        const organizations = this.authManager.getOrganizations();
        
        if (!orgSelector || organizations.length <= 1) {
            if (orgSelector) orgSelector.style.display = 'none';
            return;
        }
        
        orgSelector.style.display = 'block';
        orgSelector.innerHTML = '';
        
        organizations.forEach(org => {
            const option = document.createElement('option');
            option.value = org.id;
            option.textContent = org.name;
            option.selected = org.id === this.authManager.getCurrentOrganization()?.id;
            orgSelector.appendChild(option);
        });
        
        orgSelector.addEventListener('change', (e) => {
            this.authManager.switchOrganization(e.target.value);
        });
    }

    /**
     * Load appropriate dashboard for current user
     */
    async loadUserDashboard() {
        try {
            const org = this.authManager.getCurrentOrganization();
            const userType = org?.type || 'individual';
            
            this.userType = userType;
            
            // Get dashboard container
            const dashboardContainer = document.getElementById('dashboard-view');
            if (!dashboardContainer) {
                console.error('Dashboard container not found');
                return;
            }
            
            // Load appropriate dashboard view
            const viewHtml = this.dashboardViews.get(userType);
            if (viewHtml) {
                // Find the view content area (after the header)
                const viewHeader = dashboardContainer.querySelector('.view-header');
                if (viewHeader && viewHeader.nextElementSibling) {
                    // Replace content after header
                    const contentArea = viewHeader.nextElementSibling;
                    contentArea.innerHTML = viewHtml;
                } else {
                    // Replace entire dashboard content
                    dashboardContainer.innerHTML = viewHtml;
                }
            } else {
                // Fallback to basic dashboard
                this.loadBasicDashboard(dashboardContainer);
            }
            
            // Hide loading container
            const loadingContainer = document.getElementById('loading-container');
            if (loadingContainer) {
                loadingContainer.style.display = 'none';
            }
            
            // Show dashboard
            dashboardContainer.style.display = 'block';
            
            console.log(`Loaded ${userType} dashboard`);
        } catch (error) {
            console.error('Failed to load user dashboard:', error);
            this.showError('Failed to load dashboard. Please try refreshing the page.');
        }
    }

    /**
     * Load basic dashboard as fallback
     */
    loadBasicDashboard(container) {
        container.innerHTML = `
            <div class="view-header">
                <h2>Security Dashboard</h2>
                <div class="view-actions">
                    <button class="action-btn secondary" onclick="window.location.reload()">
                        <span class="btn-icon">🔄</span>
                        Refresh
                    </button>
                </div>
            </div>
            <div class="dashboard-content">
                <div class="card">
                    <div class="card-content">
                        <h3>Welcome to MagenSec Command Center</h3>
                        <p>Your security dashboard is loading. Please wait a moment...</p>
                        <div class="loading-spinner" style="margin: 20px auto;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show error message
     */
    showError(message) {
        // Create error overlay
        const errorOverlay = document.createElement('div');
        errorOverlay.className = 'error-overlay';
        errorOverlay.innerHTML = `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <h3>Application Error</h3>
                <p>${message}</p>
                <button onclick="window.location.reload()" class="btn btn-primary">
                    Reload Application
                </button>
            </div>
        `;
        
        // Add styles
        errorOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        
        document.body.appendChild(errorOverlay);
    }

    /**
     * Switch view (for navigation)
     */
    switchView(viewName) {
        console.log(`Switching to view: ${viewName}`);
        
        // Update navigation state
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
        
        // Load view content
        this.loadView(viewName);
    }

    /**
     * Load specific view content
     */
    async loadView(viewName) {
        try {
            // For now, just show a placeholder
            const dashboardContainer = document.getElementById('dashboard-view');
            if (dashboardContainer) {
                dashboardContainer.innerHTML = `
                    <div class="view-header">
                        <h2>${this.getViewTitle(viewName)}</h2>
                    </div>
                    <div class="view-content">
                        <div class="card">
                            <div class="card-content">
                                <p>The ${viewName} view is being developed. Please check back soon!</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error(`Failed to load view ${viewName}:`, error);
        }
    }

    /**
     * Get display title for view
     */
    getViewTitle(viewName) {
        const titles = {
            dashboard: 'Security Dashboard',
            devices: 'Device Management',
            security: 'Security Overview',
            compliance: 'Compliance Status',
            reports: 'Security Reports',
            admin: 'Administration'
        };
        return titles[viewName] || 'MagenSec Dashboard';
    }
}

// Create global app manager instance
window.appManager = new AppManager();

// Set up global navigation handler
document.addEventListener('DOMContentLoaded', () => {
    // Handle navigation clicks
    document.addEventListener('click', (e) => {
        const navBtn = e.target.closest('[data-view]');
        if (navBtn && window.appManager) {
            e.preventDefault();
            const viewName = navBtn.getAttribute('data-view');
            window.appManager.switchView(viewName);
        }
    });
    
    // Handle user menu toggle
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', () => {
            userDropdown.classList.add('hidden');
        });
    }
    
    // Handle logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (window.authManager) {
                window.authManager.signOut();
            }
        });
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppManager;
}
