/**
 * MagenSec Command Center - Authentication Module
 * Handles Google OAuth, user session management, and organization access control
 */

class AuthManager {
    constructor() {
        this.user = null;
        this.organizations = [];
        this.currentOrg = null;
        this.permissions = null;
        this.onAuthStateChange = null;
        
        // Development mode detection
        this.isDevelopmentMode = this.detectDevelopmentMode();
        
        // Google OAuth configuration
        this.googleClientId = ''; // Will be set from config
        this.googleClient = null;
        
        // Initialize on load
        this.init();
    }

    /**
     * Detect if we're in development mode
     */
    detectDevelopmentMode() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // Development mode: local file system or localhost
        const isLocalFile = protocol === 'file:';
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isDevMode = localStorage.getItem('mscc_dev_mode') === 'true';
        
        return isLocalFile || isLocalhost || isDevMode;
    }

    /**
     * Initialize the authentication system
     */
    async init() {
        try {
            // Load configuration
            await this.loadConfig();
            
            // Check for existing session first
            const sessionRestored = await this.restoreSession();
            if (sessionRestored) {
                return;
            }
            
            // In development mode or file:// protocol, offer mock authentication
            if (this.isDevelopmentMode) {
                console.log('Development mode detected - offering mock authentication');
                this.setupDevelopmentAuth();
                return;
            }
            
            // For GitHub Pages and production, use Portal API auth
            if (window.location.hostname.includes('github.io') || 
                window.location.protocol === 'https:') {
                this.setupPortalAuth();
                return;
            }
            
            // Fallback to Google OAuth for other cases
            await this.initGoogleAuth();
            
            console.log('Auth system initialized successfully');
        } catch (error) {
            console.error('Failed to initialize auth system:', error);
            // Fallback to development mode on any error
            this.setupDevelopmentAuth();
        }
    }

    /**
     * Load configuration from external source or environment
     */
    async loadConfig() {
        try {
            // In a real implementation, this would load from a secure config endpoint
            // For now, we'll use a placeholder
            this.googleClientId = 'your-google-oauth-client-id.googleusercontent.com';
            
            // TODO: Load from secure configuration endpoint
            // const response = await fetch('/api/config/auth');
            // const config = await response.json();
            // this.googleClientId = config.googleClientId;
        } catch (error) {
            console.error('Failed to load auth config:', error);
            throw new Error('Authentication configuration not available');
        }
    }

    /**
     * Setup Portal API authentication for GitHub Pages and production
     */
    setupPortalAuth() {
        const authContainer = document.getElementById('authContainer');
        if (!authContainer) return;

        authContainer.innerHTML = `
            <div class="auth-card">
                <div class="auth-header">
                    <h2>Sign in to MagenSec</h2>
                    <p>Access your security dashboard</p>
                </div>
                <div class="auth-form">
                    <div class="input-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" placeholder="Enter your email" required>
                    </div>
                    <div class="input-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" placeholder="Enter your password" required>
                    </div>
                    <button class="auth-btn primary" onclick="authManager.portalLogin()">
                        Sign In
                    </button>
                    <div class="auth-divider">
                        <span>or</span>
                    </div>
                    <button class="auth-btn secondary" onclick="authManager.setupDevelopmentAuth()">
                        Continue with Demo Mode
                    </button>
                </div>
                <div class="auth-footer">
                    <small>Secure authentication via MagenSec Portal API</small>
                </div>
            </div>
        `;
    }

    /**
     * Handle Portal API login
     */
    async portalLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            this.showAuthError('Please enter both email and password');
            return;
        }

        try {
            // Show loading state
            const button = document.querySelector('.auth-btn.primary');
            const originalText = button.textContent;
            button.textContent = 'Signing in...';
            button.disabled = true;

            // Use your existing Portal API endpoint
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                throw new Error('Authentication failed');
            }

            const authData = await response.json();
            
            // Set user data from Portal API response
            this.user = authData.user;
            this.organizations = authData.organizations || [];
            this.currentOrg = this.organizations[0] || { 
                id: 'default', 
                name: 'Personal', 
                type: 'individual',
                permissions: ['read:own_devices', 'manage:own_devices'] 
            };
            this.permissions = this.currentOrg.permissions;

            // Save session
            this.saveSession();

            // Hide auth container and show main app
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';

            // Notify auth state change
            if (this.onAuthStateChange) {
                this.onAuthStateChange(true);
            }

            console.log('Portal API login successful:', this.user);

        } catch (error) {
            console.error('Portal login failed:', error);
            this.showAuthError('Login failed. Please check your credentials.');
            
            // Reset button
            const button = document.querySelector('.auth-btn.primary');
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    /**
     * Setup development mode authentication with mock users
     */
    setupDevelopmentAuth() {
        // Show development auth options
        this.showDevelopmentAuthOptions();
    }

    /**
     * Show development authentication options
     */
    showDevelopmentAuthOptions() {
        const authContainer = document.getElementById('authContainer');
        if (!authContainer) return;

        authContainer.innerHTML = `
            <div class="auth-card">
                <div class="auth-header">
                    <h2>Development Mode</h2>
                    <p>Choose a test user to continue</p>
                </div>
                <div class="dev-auth-options">
                    <button class="auth-btn dev-auth-btn" onclick="authManager.mockLogin('individual')">
                        <div class="user-icon">👤</div>
                        <div class="user-info">
                            <strong>Sarah Johnson</strong>
                            <span>Individual User</span>
                        </div>
                    </button>
                    <button class="auth-btn dev-auth-btn" onclick="authManager.mockLogin('business')">
                        <div class="user-icon">💼</div>
                        <div class="user-info">
                            <strong>Mike Chen</strong>
                            <span>Business Admin</span>
                        </div>
                    </button>
                    <button class="auth-btn dev-auth-btn" onclick="authManager.mockLogin('admin')">
                        <div class="user-icon">🛡️</div>
                        <div class="user-info">
                            <strong>Dr. Emily Rodriguez</strong>
                            <span>Site Administrator</span>
                        </div>
                    </button>
                </div>
                <div class="dev-mode-note">
                    <small>💡 Development mode active - no real authentication required</small>
                </div>
            </div>
        `;
    }

    /**
     * Mock login for development mode
     */
    async mockLogin(userType) {
        const mockUsers = {
            individual: {
                id: 'dev-individual-001',
                email: 'sarah.johnson@email.com',
                name: 'Sarah Johnson',
                picture: 'https://via.placeholder.com/96/4CAF50/FFFFFF?text=SJ',
                given_name: 'Sarah',
                family_name: 'Johnson'
            },
            business: {
                id: 'dev-business-001',
                email: 'mike.chen@techstartup.com',
                name: 'Mike Chen',
                picture: 'https://via.placeholder.com/96/2196F3/FFFFFF?text=MC',
                given_name: 'Mike',
                family_name: 'Chen'
            },
            admin: {
                id: 'dev-admin-001',
                email: 'emily.rodriguez@megacorp.com',
                name: 'Dr. Emily Rodriguez',
                picture: 'https://via.placeholder.com/96/FF9800/FFFFFF?text=ER',
                given_name: 'Emily',
                family_name: 'Rodriguez'
            }
        };

        const mockOrganizations = {
            individual: [{
                id: 'dev-personal-001',
                name: 'Personal Devices',
                type: 'individual',
                permissions: ['read:own_devices', 'manage:own_devices']
            }],
            business: [{
                id: 'dev-business-001',
                name: 'TechStartup Inc.',
                type: 'business',
                permissions: ['read:org_devices', 'manage:org_devices', 'read:org_security', 'manage:org_billing']
            }],
            admin: [
                {
                    id: 'dev-admin-001',
                    name: 'MagenSec Global',
                    type: 'site-admin',
                    permissions: ['read:all', 'manage:all', 'admin:platform']
                },
                {
                    id: 'dev-business-001',
                    name: 'TechStartup Inc.',
                    type: 'business',
                    permissions: ['read:org_devices', 'manage:org_devices']
                }
            ]
        };

        this.user = mockUsers[userType];
        this.organizations = mockOrganizations[userType];
        this.currentOrg = this.organizations[0];
        this.permissions = this.currentOrg.permissions;

        // Save to session storage for persistence
        sessionStorage.setItem('mscc_dev_user', JSON.stringify(this.user));
        sessionStorage.setItem('mscc_dev_orgs', JSON.stringify(this.organizations));
        sessionStorage.setItem('mscc_dev_current_org', JSON.stringify(this.currentOrg));

        // Notify authentication state change
        if (this.onAuthStateChange) {
            this.onAuthStateChange(true);
        }

        // Hide auth container and show main app
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';

        console.log(`Development login successful as ${userType}:`, this.user);
    }

    /**
     * Initialize Google OAuth 2.0
     */
    async initGoogleAuth() {
        return new Promise((resolve, reject) => {
            // Load Google API script if not already loaded
            if (!window.google) {
                const script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.onload = () => this.setupGoogleAuth(resolve, reject);
                script.onerror = () => reject(new Error('Failed to load Google OAuth script'));
                document.head.appendChild(script);
            } else {
                this.setupGoogleAuth(resolve, reject);
            }
        });
    }

    /**
     * Setup Google OAuth client
     */
    setupGoogleAuth(resolve, reject) {
        try {
            google.accounts.id.initialize({
                client_id: this.googleClientId,
                callback: this.handleGoogleCallback.bind(this),
                auto_select: false,
                cancel_on_tap_outside: true
            });

            // Setup sign-in button
            const signInButton = document.getElementById('google-signin-btn');
            if (signInButton) {
                signInButton.addEventListener('click', this.signInWithGoogle.bind(this));
            }

            resolve();
        } catch (error) {
            reject(error);
        }
    }

    /**
     * Handle Google OAuth callback
     */
    async handleGoogleCallback(response) {
        try {
            this.showLoading(true);
            
            // Decode JWT token
            const userInfo = this.parseJWT(response.credential);
            
            // Validate and process user information
            await this.processUserAuth(userInfo);
            
        } catch (error) {
            console.error('Google auth callback error:', error);
            this.showAuthError('Authentication failed. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Parse JWT token
     */
    parseJWT(token) {
        try {
            const payload = token.split('.')[1];
            const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch (error) {
            throw new Error('Invalid token format');
        }
    }

    /**
     * Process user authentication and fetch organizations
     */
    async processUserAuth(userInfo) {
        try {
            // Create user object
            this.user = {
                id: userInfo.sub,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
                emailVerified: userInfo.email_verified
            };

            // Fetch user organizations and permissions
            await this.fetchUserOrganizations();
            
            // Save session
            this.saveSession();
            
            // Update UI
            this.updateAuthUI();
            
            // Notify auth state change
            if (this.onAuthStateChange) {
                this.onAuthStateChange(this.user, this.organizations);
            }
            
            console.log('User authenticated successfully:', this.user.email);
            
        } catch (error) {
            console.error('Failed to process user auth:', error);
            throw error;
        }
    }

    /**
     * Fetch user organizations and permissions from API
     */
    async fetchUserOrganizations() {
        try {
            // Mock data for now - replace with actual API call
            this.organizations = [
                {
                    id: 'personal',
                    name: 'Personal Devices',
                    type: 'individual',
                    permissions: ['read', 'manage_devices']
                }
            ];

            // Check if user has business/admin access
            const businessOrgs = await this.checkBusinessAccess();
            this.organizations = [...this.organizations, ...businessOrgs];

            // Set default organization
            if (this.organizations.length > 0) {
                this.currentOrg = this.organizations[0];
                this.permissions = this.calculatePermissions();
            }

            // TODO: Replace with actual API call
            /*
            const response = await fetch(`/api/users/${this.user.email}/organizations`, {
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch organizations: ${response.status}`);
            }
            
            const data = await response.json();
            this.organizations = data.organizations || [];
            */

        } catch (error) {
            console.error('Failed to fetch organizations:', error);
            // Default to personal access only
            this.organizations = [{
                id: 'personal',
                name: 'Personal Devices',
                type: 'individual',
                permissions: ['read', 'manage_devices']
            }];
        }
    }

    /**
     * Check for business organization access
     */
    async checkBusinessAccess() {
        try {
            // Mock business access check
            // In real implementation, this would check against user database
            const businessOrgs = [];
            
            // Check for admin emails or domain-based access
            if (this.isAdminEmail(this.user.email)) {
                businessOrgs.push({
                    id: 'site-admin',
                    name: 'Site Administration',
                    type: 'site-admin',
                    permissions: ['read', 'write', 'admin', 'manage_users', 'manage_organizations']
                });
            }
            
            // Check for business organization membership
            const businessMembership = await this.checkBusinessMembership();
            if (businessMembership) {
                businessOrgs.push(businessMembership);
            }
            
            return businessOrgs;
            
        } catch (error) {
            console.error('Failed to check business access:', error);
            return [];
        }
    }

    /**
     * Check if email has admin privileges
     */
    isAdminEmail(email) {
        const adminEmails = [
            'admin@magensec.com',
            'support@magensec.com'
            // Add more admin emails as needed
        ];
        return adminEmails.includes(email.toLowerCase());
    }

    /**
     * Check business organization membership
     */
    async checkBusinessMembership() {
        try {
            // TODO: Implement actual business membership check
            // This would query the organization database
            return null;
            
        } catch (error) {
            console.error('Failed to check business membership:', error);
            return null;
        }
    }

    /**
     * Calculate user permissions based on current organization
     */
    calculatePermissions() {
        if (!this.currentOrg) {
            return [];
        }
        
        return this.currentOrg.permissions || [];
    }

    /**
     * Sign in with Google
     */
    signInWithGoogle() {
        try {
            this.showLoading(true);
            google.accounts.id.prompt();
        } catch (error) {
            console.error('Google sign-in error:', error);
            this.showAuthError('Failed to initialize Google sign-in');
            this.showLoading(false);
        }
    }

    /**
     * Sign out user
     */
    async signOut() {
        try {
            // Clear session
            this.user = null;
            this.organizations = [];
            this.currentOrg = null;
            this.permissions = null;
            
            // Clear stored session
            localStorage.removeItem('mscc_session');
            sessionStorage.removeItem('mscc_session');
            
            // Update UI
            this.updateAuthUI();
            
            // Notify auth state change
            if (this.onAuthStateChange) {
                this.onAuthStateChange(null, []);
            }
            
            console.log('User signed out successfully');
            
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }

    /**
     * Switch to different organization
     */
    switchOrganization(orgId) {
        const org = this.organizations.find(o => o.id === orgId);
        if (org) {
            this.currentOrg = org;
            this.permissions = this.calculatePermissions();
            
            // Save updated session
            this.saveSession();
            
            // Update UI
            this.updateAuthUI();
            
            // Notify change
            if (this.onAuthStateChange) {
                this.onAuthStateChange(this.user, this.organizations);
            }
            
            console.log('Switched to organization:', org.name);
        }
    }

    /**
     * Check if user has specific permission
     */
    hasPermission(permission) {
        return this.permissions && this.permissions.includes(permission);
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.user !== null;
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Get current organization
     */
    getCurrentOrganization() {
        return this.currentOrg;
    }

    /**
     * Get user organizations
     */
    getOrganizations() {
        return this.organizations;
    }

    /**
     * Save session to storage
     */
    saveSession() {
        try {
            const sessionData = {
                user: this.user,
                organizations: this.organizations,
                currentOrg: this.currentOrg,
                timestamp: Date.now()
            };
            
            localStorage.setItem('mscc_session', JSON.stringify(sessionData));
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    /**
     * Restore session from storage
     */
    async restoreSession() {
        try {
            // In development mode, check for dev session first
            if (this.isDevelopmentMode) {
                const devUser = sessionStorage.getItem('mscc_dev_user');
                const devOrgs = sessionStorage.getItem('mscc_dev_orgs');
                const devCurrentOrg = sessionStorage.getItem('mscc_dev_current_org');
                
                if (devUser && devOrgs && devCurrentOrg) {
                    this.user = JSON.parse(devUser);
                    this.organizations = JSON.parse(devOrgs);
                    this.currentOrg = JSON.parse(devCurrentOrg);
                    this.permissions = this.currentOrg.permissions;
                    
                    // Hide auth container and show main app
                    document.getElementById('authContainer').style.display = 'none';
                    document.getElementById('mainApp').style.display = 'block';
                    
                    // Notify auth state change
                    if (this.onAuthStateChange) {
                        this.onAuthStateChange(true);
                    }
                    
                    console.log('Development session restored:', this.user);
                    return true;
                }
                return false;
            }
            
            const sessionData = localStorage.getItem('mscc_session');
            if (!sessionData) {
                return false;
            }
            
            const session = JSON.parse(sessionData);
            
            // Check if session is still valid (24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            if (Date.now() - session.timestamp > maxAge) {
                localStorage.removeItem('mscc_session');
                return false;
            }
            
            // Restore session data
            this.user = session.user;
            this.organizations = session.organizations;
            this.currentOrg = session.currentOrg;
            this.permissions = this.calculatePermissions();
            
            // Update UI
            this.updateAuthUI();
            
            // Notify auth state change
            if (this.onAuthStateChange) {
                this.onAuthStateChange(this.user, this.organizations);
            }
            
            console.log('Session restored for user:', this.user.email);
            return true;
            
        } catch (error) {
            console.error('Failed to restore session:', error);
            localStorage.removeItem('mscc_session');
            return false;
        }
    }

    /**
     * Update authentication UI
     */
    updateAuthUI() {
        const authContainer = document.getElementById('auth-container');
        const dashboardContainer = document.getElementById('dashboard-container');
        
        if (this.isAuthenticated()) {
            // Show dashboard, hide auth
            if (authContainer) authContainer.classList.add('hidden');
            if (dashboardContainer) dashboardContainer.classList.remove('hidden');
            
            // Update user profile in header
            this.updateUserProfile();
            
            // Update organization selector
            this.updateOrganizationSelector();
            
        } else {
            // Show auth, hide dashboard
            if (authContainer) authContainer.classList.remove('hidden');
            if (dashboardContainer) dashboardContainer.classList.add('hidden');
        }
    }

    /**
     * Update user profile display
     */
    updateUserProfile() {
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const userEmail = document.getElementById('user-email');
        
        if (userAvatar && this.user.picture) {
            userAvatar.src = this.user.picture;
            userAvatar.alt = this.user.name;
        }
        
        if (userName) {
            userName.textContent = this.user.name;
        }
        
        if (userEmail) {
            userEmail.textContent = this.user.email;
        }
    }

    /**
     * Update organization selector
     */
    updateOrganizationSelector() {
        const orgSelector = document.getElementById('org-selector');
        if (!orgSelector || this.organizations.length <= 1) {
            return;
        }
        
        orgSelector.innerHTML = '';
        this.organizations.forEach(org => {
            const option = document.createElement('option');
            option.value = org.id;
            option.textContent = org.name;
            option.selected = org.id === this.currentOrg?.id;
            orgSelector.appendChild(option);
        });
        
        orgSelector.addEventListener('change', (e) => {
            this.switchOrganization(e.target.value);
        });
    }

    /**
     * Show loading state
     */
    showLoading(show) {
        const signInBtn = document.getElementById('google-signin-btn');
        if (signInBtn) {
            if (show) {
                signInBtn.classList.add('loading');
                signInBtn.disabled = true;
            } else {
                signInBtn.classList.remove('loading');
                signInBtn.disabled = false;
            }
        }
    }

    /**
     * Show authentication error
     */
    showAuthError(message) {
        const statusContainer = document.getElementById('auth-status');
        if (statusContainer) {
            statusContainer.innerHTML = `
                <div class="auth-status error">
                    <strong>Authentication Error:</strong> ${message}
                </div>
            `;
            setTimeout(() => {
                statusContainer.innerHTML = '';
            }, 5000);
        }
    }

    /**
     * Show authentication success message
     */
    showAuthSuccess(message) {
        const statusContainer = document.getElementById('auth-status');
        if (statusContainer) {
            statusContainer.innerHTML = `
                <div class="auth-status success">
                    ${message}
                </div>
            `;
            setTimeout(() => {
                statusContainer.innerHTML = '';
            }, 3000);
        }
    }

    /**
     * Set auth state change callback
     */
    setAuthStateChangeCallback(callback) {
        this.onAuthStateChange = callback;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}
