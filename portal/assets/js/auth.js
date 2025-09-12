// MagenSec Hub Authentication Service
class MagenSecAuth {
    constructor() {
        this.config = window.MagenSecConfig.auth;
        this.user = null;
        this.token = null;
        this.refreshToken = null;
        this.organization = null;
        this.tokenExpiryTime = null;
        this.refreshTimer = null;
        this.logoutTimer = null;
        
        // Initialize from stored data
        this.initializeFromStorage();
        
        // Setup auto-refresh
        this.setupTokenRefresh();
        
        // Setup Google OAuth if configured
        this.initializeGoogleAuth();
    }
    
    // ======================
    // Initialization
    // ======================
    
    async initialize() {
        // This method is called by the app.js to initialize the auth service
        // Most initialization is already done in constructor, but this provides
        // a promise-based interface for the app initialization flow
        return Promise.resolve();
    }
    
    initializeFromStorage() {
        try {
            // Load stored authentication data
            const storedToken = localStorage.getItem(this.config.tokenKey);
            const storedRefresh = localStorage.getItem(this.config.refreshKey);
            const storedUser = localStorage.getItem(this.config.userKey);
            
            if (storedToken && storedUser) {
                this.token = storedToken;
                this.refreshToken = storedRefresh;
                this.user = JSON.parse(storedUser);
                
                // Validate token expiry
                const payload = this.parseJWTPayload(this.token);
                if (payload && payload.exp) {
                    this.tokenExpiryTime = payload.exp * 1000; // Convert to milliseconds
                    
                    // Check if token is still valid
                    if (Date.now() >= this.tokenExpiryTime) {
                        this.logout(false); // Silent logout
                        return;
                    }
                    
                    // Extract organization info
                    this.organization = payload.org || payload.organizationId;
                }
            }
        } catch (error) {
            console.error('Error initializing auth from storage:', error);
            this.logout(false);
        }
    }
    
    async initializeGoogleAuth() {
        if (!window.google || !this.config.googleClientId) return;
        
        try {
            await new Promise((resolve) => {
                google.accounts.id.initialize({
                    client_id: this.config.googleClientId,
                    callback: this.handleGoogleSignIn.bind(this),
                    auto_select: false,
                    cancel_on_tap_outside: false
                });
                resolve();
            });
        } catch (error) {
            console.error('Failed to initialize Google Auth:', error);
        }
    }
    
    // ======================
    // Authentication Status
    // ======================
    
    isAuthenticated() {
        return !!(this.token && this.user && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime);
    }
    
    getCurrentUser() {
        return this.user;
    }
    
    getCurrentOrganization() {
        return this.organization;
    }
    
    getUserRole() {
        return this.user?.role || 'viewer';
    }
    
    hasPermission(permission) {
        const role = this.getUserRole();
        const permissions = {
            'admin': ['view', 'edit', 'delete', 'manage', 'configure'],
            'manager': ['view', 'edit', 'manage'],
            'operator': ['view', 'edit'],
            'viewer': ['view']
        };
        
        return permissions[role]?.includes(permission) || false;
    }
    
    // ======================
    // Token Management
    // ======================
    
    async getValidToken() {
        if (!this.token || !this.tokenExpiryTime) {
            return null;
        }
        
        // Check if token needs refresh (5 minutes before expiry)
        const now = Date.now();
        const refreshThreshold = this.tokenExpiryTime - this.config.refreshThreshold;
        
        if (now >= refreshThreshold) {
            await this.refreshTokenIfNeeded();
        }
        
        return this.token;
    }
    
    async refreshTokenIfNeeded() {
        if (!this.refreshToken) {
            this.logout();
            return;
        }
        
        try {
            const response = await fetch(`${window.MagenSecConfig.api.base}/oauth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refreshToken: this.refreshToken
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.setAuthData(data);
            } else {
                throw new Error('Token refresh failed');
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.logout();
        }
    }
    
    setupTokenRefresh() {
        // Clear existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        if (!this.tokenExpiryTime) return;
        
        // Set timer to refresh token before expiry
        const now = Date.now();
        const refreshTime = this.tokenExpiryTime - this.config.refreshThreshold;
        const timeUntilRefresh = Math.max(0, refreshTime - now);
        
        this.refreshTimer = setTimeout(() => {
            this.refreshTokenIfNeeded();
        }, timeUntilRefresh);
        
        // Setup logout warning
        const logoutWarningTime = this.tokenExpiryTime - this.config.autoLogoutWarning;
        const timeUntilWarning = Math.max(0, logoutWarningTime - now);
        
        if (timeUntilWarning > 0) {
            setTimeout(() => {
                this.showLogoutWarning();
            }, timeUntilWarning);
        }
    }
    
    // ======================
    // Authentication Actions
    // ======================
    
    async signInWithGoogle() {
        return new Promise((resolve, reject) => {
            if (!window.google) {
                reject(new Error('Google Auth not loaded'));
                return;
            }
            
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    // Fallback to manual sign-in
                    this.showGoogleSignInButton();
                }
            });
        });
    }
    
    showGoogleSignInButton() {
        const authContent = document.getElementById('auth-content');
        if (!authContent) return;
        
        authContent.innerHTML = `
            <div class="space-y-4">
                <div class="text-center">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Sign in to continue</h3>
                    <div id="google-signin-button"></div>
                </div>
                
                <div class="mt-6 text-center text-sm text-gray-500">
                    <p>Secure enterprise security management</p>
                    <p class="mt-1">✓ SOC2 Compliant ✓ GDPR Ready ✓ Zero Trust</p>
                </div>
            </div>
        `;
        
        // Render Google Sign-In button
        if (window.google && this.config.googleClientId) {
            google.accounts.id.renderButton(
                document.getElementById('google-signin-button'),
                {
                    theme: 'outline',
                    size: 'large',
                    type: 'standard',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left'
                }
            );
        }
    }
    
    async handleGoogleSignIn(response) {
        try {
            // Show loading
            window.MagenSecUI.showLoading('Signing you in...');
            
            // Send the credential to our backend
            const authResponse = await fetch(`${window.MagenSecConfig.api.base}/oauth/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    credential: response.credential,
                    clientId: this.config.googleClientId
                })
            });
            
            if (authResponse.ok) {
                const authData = await authResponse.json();
                this.setAuthData(authData);
                
                // Redirect to dashboard
                window.MagenSecRouter.navigate('/dashboard');
                window.MagenSecUI.showToast('Welcome back!', 'success');
            } else {
                const error = await authResponse.json();
                throw new Error(error.message || 'Authentication failed');
            }
        } catch (error) {
            console.error('Google sign-in error:', error);
            window.MagenSecUI.showToast('Sign-in failed. Please try again.', 'error');
        } finally {
            window.MagenSecUI.hideLoading();
        }
    }
    
    setAuthData(authData) {
        // Store authentication data
        this.token = authData.accessToken || authData.token;
        this.refreshToken = authData.refreshToken;
        this.user = authData.user;
        
        // Parse token for expiry and organization
        const payload = this.parseJWTPayload(this.token);
        if (payload) {
            this.tokenExpiryTime = payload.exp * 1000;
            this.organization = payload.org || payload.organizationId;
        }
        
        // Store in localStorage
        localStorage.setItem(this.config.tokenKey, this.token);
        if (this.refreshToken) {
            localStorage.setItem(this.config.refreshKey, this.refreshToken);
        }
        localStorage.setItem(this.config.userKey, JSON.stringify(this.user));
        
        // Setup auto-refresh
        this.setupTokenRefresh();
        
        // Update UI
        this.updateUserDisplay();
    }
    
    logout(showMessage = true) {
        // Clear stored data
        localStorage.removeItem(this.config.tokenKey);
        localStorage.removeItem(this.config.refreshKey);
        localStorage.removeItem(this.config.userKey);
        
        // Clear instance data
        this.token = null;
        this.refreshToken = null;
        this.user = null;
        this.organization = null;
        this.tokenExpiryTime = null;
        
        // Clear timers
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.logoutTimer) {
            clearTimeout(this.logoutTimer);
            this.logoutTimer = null;
        }
        
        // Show message
        if (showMessage) {
            window.MagenSecUI.showToast('You have been signed out', 'info');
        }
        
        // Redirect to auth
        window.MagenSecRouter.navigate('/auth');
    }
    
    // ======================
    // Utility Methods
    // ======================
    
    parseJWTPayload(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload));
        } catch (error) {
            console.error('Error parsing JWT:', error);
            return null;
        }
    }
    
    updateUserDisplay() {
        const userNameElement = document.getElementById('user-name');
        const userAvatarElement = document.getElementById('user-avatar');
        
        if (this.user && userNameElement) {
            userNameElement.textContent = this.user.name || this.user.email || 'User';
            
            if (userAvatarElement) {
                const name = this.user.name || this.user.email || 'User';
                userAvatarElement.src = this.user.avatar || 
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3B82F6&color=fff`;
            }
        }
    }
    
    showLogoutWarning() {
        const warningMinutes = Math.floor(this.config.autoLogoutWarning / 60000);
        
        window.MagenSecUI.showConfirmation(
            'Session Expiring',
            `Your session will expire in ${warningMinutes} minutes. Do you want to extend it?`,
            'Extend Session',
            'Sign Out'
        ).then((extend) => {
            if (extend) {
                this.refreshTokenIfNeeded();
            } else {
                this.logout();
            }
        });
    }
    
    // ======================
    // Route Guards
    // ======================
    
    requireAuth(callback) {
        if (this.isAuthenticated()) {
            callback();
        } else {
            window.MagenSecRouter.navigate('/auth');
        }
    }
    
    requirePermission(permission, callback, fallback = null) {
        if (this.hasPermission(permission)) {
            callback();
        } else if (fallback) {
            fallback();
        } else {
            window.MagenSecUI.showToast('You do not have permission to perform this action', 'error');
        }
    }
}

// Initialize global authentication service
window.MagenSecAuth = new MagenSecAuth();

// Auto-check authentication status on page load
document.addEventListener('DOMContentLoaded', () => {
    if (window.MagenSecAuth.isAuthenticated()) {
        // User is authenticated, initialize app
        window.MagenSecAuth.updateUserDisplay();
    }
});
