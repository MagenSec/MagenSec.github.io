// MagenSec Portal Authentication Service
// Portal OAuth implementation for secure authentication

class MagenSecAuth {
    constructor() {
        this.config = window.MagenSecConfig;
        this.oauthConfig = null;
        this.apiBase = null;
        this.user = null;
        this.token = null;
        this.organization = null;
        this.isInitialized = false;
        
        // Check for OAuth callback first
        this.handleOAuthCallbackIfPresent();
    }
    
    // ======================
    // Initialization
    // ======================
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            // Resolve API base
            await this.getApiBase();
            console.log('Portal API base resolved to:', this.apiBase);
            
            // Set up Google OAuth
            await this.setupGoogleAuth();
            
            // Check for existing session
            await this.checkExistingSession();
            
            this.isInitialized = true;
        } catch (error) {
            console.error('Portal auth initialization failed:', error);
            throw error;
        }
    }
    
    async getApiBase() {
        if (this.apiBase) return this.apiBase;
        
        // Use the API resolver from config
        if (window.apiResolver) {
            this.apiBase = await window.apiResolver.resolveApiBase();
        } else {
            this.apiBase = this.config.api.base;
        }
        
        return this.apiBase;
    }
    
    async setupGoogleAuth() {
        try {
            // Use OAuth config from portal config
            if (this.config.oauth && this.config.oauth.clientId) {
                this.oauthConfig = {
                    googleClientId: this.config.oauth.clientId,
                    redirectUri: this.config.oauth.redirectUri,
                    responseType: this.config.oauth.responseType,
                    scopes: this.config.oauth.scopes,
                    accessType: this.config.oauth.accessType
                };
                console.log('Using OAuth config from portal config');
            } else {
                // Fallback to API endpoint
                const response = await fetch(`${this.apiBase}/api/oauth/config`);
                if (!response.ok) {
                    throw new Error('Failed to get OAuth config');
                }
                this.oauthConfig = await response.json();
                console.log('Using OAuth config from API');
            }
            
            console.log('Portal OAuth setup complete');
            
        } catch (error) {
            console.error('Portal OAuth setup failed:', error);
            // For development or GitHub Pages
            if (this.isDevelopmentMode() || window.location.hostname.includes('github.io')) {
                console.log('OAuth setup failed, but allowing for static hosting');
                return;
            }
            throw new Error('Authentication service unavailable. Please try again later.');
        }
    }
    
    isDevelopmentMode() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.protocol === 'file:' ||
               localStorage.getItem('portal_dev_mode') === 'true';
    }
    
    // ======================
    // OAuth Flow
    // ======================
    
    startGoogleAuth() {
        console.log('Starting Google OAuth flow...');
        
        // Use the simplified OAuth flow with return URL (like admin pages)
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.href = `${this.apiBase}/api/auth/oauth?returnUrl=${returnUrl}`;
    }
    
    generateState() {
        return btoa(Math.random().toString()).substr(10, 20);
    }
    
    handleOAuthCallbackIfPresent() {
        // Check if this is an OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const token = urlParams.get('token');
        const error = urlParams.get('error');
        
        if (error) {
            console.error('OAuth error:', error);
            this.showError('Authentication failed: ' + error);
            return;
        }
        
        // Check for new token-based callback (from our fixed backend)
        if (token) {
            console.log('✅ Received session token from OAuth redirect');
            this.handleTokenCallback(token);
            return;
        }
        
        // Check for traditional code-based callback (fallback)
        if (code && state) {
            // This is an OAuth callback
            this.handleOAuthCallback(code, state);
            return;
        }
    }
    
    async handleOAuthCallback(code, state) {
        try {
            console.log('Handling OAuth callback...');
            
            // Verify state
            const storedState = sessionStorage.getItem('oauth_state');
            if (state !== storedState) {
                throw new Error('Invalid OAuth state');
            }
            
            // Ensure API base is resolved
            await this.getApiBase();
            
            console.log('OAuth callback started:', { code: code.substring(0, 10) + '...', state });
            console.log('Resolved API Base:', this.apiBase);
            
            // Use the OAuth endpoint we configured in Cloud API
            const callbackUrl = `${this.apiBase}/api/oauth/callback`;
            console.log('Calling OAuth callback URL:', callbackUrl);
            
            // Use fetch with form data
            const formData = new FormData();
            formData.append('code', code);
            formData.append('state', state);
            const redirectUri = this.config.oauth.redirectUri;
            formData.append('redirectUri', redirectUri);
            formData.append('source', 'portal');
            
            console.log('OAuth callback details:', {
                redirectUri,
                currentLocation: window.location.href,
                configRedirectUri: this.config.oauth.redirectUri
            });
            
            console.log('Sending OAuth callback request...');
            
            const response = await fetch(callbackUrl, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('OAuth callback successful:', result);
            
            // Store session data
            this.setAuthData(result);
            
            // Clean up URL parameters
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            
            // Show success message and give time for UI to update
            console.log('✅ Authentication successful! Redirecting to dashboard...');
            
            // Small delay to ensure authentication state is fully set
            setTimeout(() => {
                if (window.MagenSecRouter) {
                    console.log('🔄 Using router navigation to dashboard');
                    window.MagenSecRouter.navigate('/dashboard');
                } else {
                    console.log('🔄 Router not available, using hash navigation');
                    window.location.hash = '#/dashboard';
                }
            }, 100);
            
        } catch (error) {
            console.error('OAuth callback failed:', error);
            this.showError('Authentication failed. Please try again.');
            
            // Clean up URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    
    async handleTokenCallback(token) {
        try {
            console.log('Handling token callback with session token');
            
            // Ensure API base is resolved
            await this.getApiBase();
            
            // Verify the session token with the backend
            const verifyUrl = `${this.apiBase}/api/oauth/verify`;
            console.log('Verifying session token at:', verifyUrl);
            
            const response = await fetch(verifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionToken: token })
            });
            
            if (!response.ok) {
                throw new Error(`Token verification failed: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.isValid) {
                throw new Error('Invalid session token');
            }
            
            console.log('✅ Session token verified successfully');
            
            // Create auth result object in expected format
            const authResult = {
                sessionToken: token,
                user: result.user,
                organization: result.organization,
                expiresAt: result.expiresAt
            };
            
            // Store session data
            this.setAuthData(authResult);
            
            // Clean up URL parameters
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            
            // Show success message and redirect
            console.log('✅ Token authentication successful! Redirecting to dashboard...');
            
            // Small delay to ensure authentication state is fully set
            setTimeout(() => {
                if (window.MagenSecRouter) {
                    console.log('🔄 Using router navigation to dashboard');
                    window.MagenSecRouter.navigate('/dashboard');
                } else {
                    console.log('🔄 Router not available, using hash navigation');
                    window.location.hash = '#/dashboard';
                }
            }, 100);
            
        } catch (error) {
            console.error('Token callback failed:', error);
            this.showError('Authentication failed. Please try again.');
            
            // Clean up URL parameters and redirect to auth
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.hash = '#/auth';
        }
    }

    // ======================
    // Session Management
    // ======================
    
    setAuthData(authResult) {
        // Store session token and user info
        this.token = authResult.sessionToken;
        this.user = authResult.user;
        this.organization = authResult.organization;
        
        localStorage.setItem('magensec_session_token', authResult.sessionToken);
        localStorage.setItem('magensec_user', JSON.stringify(authResult.user));
        localStorage.setItem('magensec_organization', JSON.stringify(authResult.organization));
        localStorage.setItem('magensec_session_expires', authResult.expiresAt);
        
        console.log('Portal session data stored');
    }
    
    async checkExistingSession() {
        const token = localStorage.getItem('magensec_session_token');
        if (!token) return false;
        
        try {
            const response = await fetch(`${this.apiBase}/api/oauth/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionToken: token })
            });
            
            if (response.ok) {
                const session = await response.json();
                if (session.isValid) {
                    // Restore session data
                    this.token = token;
                    this.user = JSON.parse(localStorage.getItem('magensec_user') || '{}');
                    this.organization = JSON.parse(localStorage.getItem('magensec_organization') || '{}');
                    
                    console.log('Portal session restored');
                    return true;
                }
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }
        
        // Clear invalid session
        this.logout(false);
        return false;
    }
    
    // ======================
    // Authentication Status
    // ======================
    
    isAuthenticated() {
        return !!(this.token && this.user);
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
    
    async getValidToken() {
        // For now, just return the token
        // Future: implement token refresh logic if needed
        return this.token;
    }
    
    // ======================
    // Logout
    // ======================
    
    async logout(redirect = true) {
        try {
            // Call logout API if we have a token
            if (this.token && this.apiBase) {
                await fetch(`${this.apiBase}/api/oauth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ sessionToken: this.token })
                });
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
        }
        
        // Clear local data
        this.token = null;
        this.user = null;
        this.organization = null;
        
        localStorage.removeItem('magensec_session_token');
        localStorage.removeItem('magensec_user');
        localStorage.removeItem('magensec_organization');
        localStorage.removeItem('magensec_session_expires');
        sessionStorage.removeItem('oauth_state');
        
        console.log('Portal session cleared');
        
        if (redirect) {
            // Redirect to login
            window.location.href = '/portal/';
        }
    }
    
    // ======================
    // UI Helpers
    // ======================
    
    showError(message) {
        console.error('Auth error:', message);
        
        // Try to show in UI if available
        if (window.MagenSecUI && window.MagenSecUI.showNotification) {
            window.MagenSecUI.showNotification(message, 'error');
        } else {
            // Fallback to alert
            alert('Authentication Error: ' + message);
        }
    }
    
    // ======================
    // Public API
    // ======================
    
    // Show login UI (to be called by the app when user needs to authenticate)
    async showLogin() {
        // Ensure we're initialized first
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (!this.oauthConfig) {
            this.showError('Authentication not configured');
            return;
        }
        
        // Create login UI
        const loginHtml = `
            <div class="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
                    <div class="text-center mb-8">
                        <h1 class="text-3xl font-bold text-gray-900 mb-2">MagenSec Portal</h1>
                        <p class="text-gray-600">Sign in to access your security dashboard</p>
                    </div>
                    
                    <button id="portalGoogleLogin" 
                            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center space-x-2">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>Sign in with Google</span>
                    </button>
                    
                    <p class="text-xs text-gray-500 text-center mt-6">
                        Secure authentication powered by Google OAuth 2.0
                    </p>
                </div>
            </div>
        `;
        
        // Add to page
        document.body.insertAdjacentHTML('beforeend', loginHtml);
        
        // Add click handler
        document.getElementById('portalGoogleLogin').addEventListener('click', () => {
            this.startGoogleAuth();
        });
    }
}

// Create global auth instance
window.MagenSecAuth = new MagenSecAuth();