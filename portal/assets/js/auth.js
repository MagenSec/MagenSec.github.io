/**
 * MagenSec Portal Authentication Service
 * 
 * Handles OAuth authentication, session management, and user state
 * for the MagenSec security portal.
 */

class MagenSecAuth {
    setCurrentOrganization(orgId) {
        // Find org object if user has multiple orgs
        let orgObj = orgId;
        const user = this.getCurrentUser();
        if (user && Array.isArray(user.organizations)) {
            const found = user.organizations.find(o => o.id === orgId || o === orgId);
            if (found) orgObj = found;
        }
        this.organization = orgObj;
        localStorage.setItem('magensec_organization', JSON.stringify(orgObj));
        // Dispatch org change event for listeners
        window.dispatchEvent(new CustomEvent('magensec-org-changed', { detail: { orgId: orgId } }));
    }
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
            // Always get OAuth config from API to ensure correct redirect URI
            await this.getApiBase();
            
            // Construct base portal URL without hash fragments (OAuth doesn't support hash in redirect_uri)
            const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
            
            const response = await fetch(`${this.apiBase}/api/oauth/config?returnUrl=${encodeURIComponent(baseUrl)}`);
            if (!response.ok) {
                throw new Error('Failed to get OAuth config');
            }
                const configResponse = await response.json();
            
                // Extract data from API response envelope and map to expected format
                if (configResponse.success && configResponse.data) {
                    this.oauthConfig = {
                        googleClientId: configResponse.data.clientId,
                        redirectUri: configResponse.data.redirectUri,
                        scopes: configResponse.data.scopes,
                        responseType: 'code',
                        accessType: 'online'
                    };
                } else {
                    throw new Error('Invalid OAuth config response');
                }
            
        } catch (error) {
            console.error('Portal OAuth setup failed:', error);
            // For development or GitHub Pages
            if (this.isDevelopmentMode() || window.location.hostname.includes('github.io')) {
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
        if (!this.oauthConfig) {
            console.error('OAuth config not loaded');
            this.showError('Authentication not configured');
            return;
        }
        
        // Store the current route to restore after OAuth (avoid auth page)
        if (window.location.hash && window.location.hash !== '#/auth') {
            sessionStorage.setItem('oauth_return_route', window.location.hash);
        }
        
        // Build Google OAuth URL
        const state = this.generateState();
        sessionStorage.setItem('oauth_state', state);
        
        const params = new URLSearchParams({
            client_id: this.oauthConfig.googleClientId,
            redirect_uri: this.oauthConfig.redirectUri,
            response_type: this.oauthConfig.responseType || 'code',
            scope: this.oauthConfig.scopes ? this.oauthConfig.scopes.join(' ') : 'openid email profile',
            access_type: this.oauthConfig.accessType || 'online',
            state: state
        });
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        console.log('Redirecting to Google OAuth:', authUrl);
        window.location.href = authUrl;
    }
    
    generateState() {
        return btoa(Math.random().toString()).substr(10, 20);
    }
    
    handleOAuthCallbackIfPresent() {
        // Prevent duplicate processing - check if we already handled this callback
        if (sessionStorage.getItem('oauth_callback_processed')) {
            console.log('OAuth callback already processed, skipping');
            return;
        }
        
        // Check if this is an OAuth callback
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const token = urlParams.get('token');
        const error = urlParams.get('error');
        
        if (error) {
            console.error('OAuth error:', error);
            this.showError('Authentication failed: ' + error);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            return;
        }
        
        // Check for new token-based callback (from our fixed backend)
        if (token) {
            console.log('✅ Received session token from OAuth redirect');
            sessionStorage.setItem('oauth_callback_processed', 'true');
            this.handleTokenCallback(token);
            return;
        }
        
        // Check for traditional code-based callback (fallback)
        if (code && state) {
            // Mark as processed immediately to prevent duplicate calls
            sessionStorage.setItem('oauth_callback_processed', 'true');
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
            
            // Reconstruct the redirect URI that was used (same logic as setupGoogleAuth)
            const redirectUri = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
            formData.append('redirectUri', redirectUri);
            formData.append('source', 'portal');
            
            console.log('OAuth callback details:', {
                redirectUri: redirectUri,
                currentLocation: window.location.href,
                callbackUrl: callbackUrl
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
            
            // Store session data - extract from API response envelope
            if (result.success && result.data) {
                this.setAuthData(result.data);
            } else {
                throw new Error(result.message || 'Authentication failed');
            }
            
            // Hide login dialog - add small delay to ensure DOM is ready
            setTimeout(() => {
                this.hideLogin();
            }, 100);
            
            // Get the route user was trying to access before OAuth
            const returnRoute = sessionStorage.getItem('oauth_return_route');
            sessionStorage.removeItem('oauth_return_route');
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_callback_processed'); // Clean up processed flag
            
            // Clean up URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show success message and give time for UI to update
            console.log('✅ Authentication successful! Redirecting...');
            
            // Small delay to ensure authentication state is fully set
            setTimeout(() => {
                // Restore the original route or default to dashboard
                // Avoid redirecting back to auth page
                let targetRoute = returnRoute;
                if (!targetRoute || targetRoute === '#/auth' || targetRoute === '/auth') {
                    targetRoute = '#/dashboard';
                }
                
                if (window.MagenSecRouter) {
                    console.log('🔄 Using router navigation to:', targetRoute);
                    window.MagenSecRouter.navigate(targetRoute.replace('#', ''));
                } else {
                    console.log('🔄 Router not available, using hash navigation to:', targetRoute);
                    window.location.hash = targetRoute;
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
            
            // Hide login dialog - add small delay to ensure DOM is ready
            setTimeout(() => {
                this.hideLogin();
            }, 100);
            
            // Get the route user was trying to access before OAuth
            const returnRoute = sessionStorage.getItem('oauth_return_route');
            sessionStorage.removeItem('oauth_return_route');
            
            // Clean up URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show success message and redirect
            console.log('✅ Token authentication successful! Redirecting...');
            
            // Small delay to ensure authentication state is fully set
            setTimeout(() => {
                // Restore the original route or default to dashboard
                // Avoid redirecting back to auth page
                let targetRoute = returnRoute;
                if (!targetRoute || targetRoute === '#/auth' || targetRoute === '/auth') {
                    targetRoute = '#/dashboard';
                }
                
                if (window.MagenSecRouter) {
                    console.log('🔄 Using router navigation to:', targetRoute);
                    window.MagenSecRouter.navigate(targetRoute.replace('#', ''));
                } else {
                    console.log('🔄 Router not available, using hash navigation to:', targetRoute);
                    window.location.hash = targetRoute;
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
    
    setAuthData(data) {
        // Handle API response structure: { sessionToken, email, name, orgId, userType, maxDevices }
        this.token = data.sessionToken || data.SessionToken;
        
        // Build user object from API data
        this.user = {
            email: data.email || data.Email,
            name: data.name || data.Name,
            userType: data.userType || data.UserType || 'Individual',
            maxDevices: data.maxDevices || data.MaxDevices || 5,
            isNewUser: data.isNewUser || data.IsNewUser || false
        };
        
        // Build organization object from API data
        this.organization = {
            orgId: data.orgId || data.OrgId,
            name: data.orgName || data.OrgName || this.user.email // Default org name for personal orgs
        };
        
        // Calculate expiry (24 hours from now)
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        // Store in localStorage
        localStorage.setItem('magensec_session_token', this.token);
        localStorage.setItem('magensec_user', JSON.stringify(this.user));
        localStorage.setItem('magensec_organization', JSON.stringify(this.organization));
        localStorage.setItem('magensec_session_expires', expiresAt);
        
        console.log('Portal session data stored', {
            user: this.user,
            organization: this.organization,
            tokenLength: this.token?.length
        });
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

        // If overlay already present, don't add another
        if (document.getElementById('login-overlay')) {
            return;
        }

        const template = window.MagenSecTemplates?.loginDialog;
        if (!template) {
            console.error('Login dialog template not loaded');
            this.showError('Login interface not available');
            return;
        }

        document.body.insertAdjacentHTML('beforeend', template);

        const loginBtn = document.getElementById('portalGoogleLogin');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.startGoogleAuth());
        } else {
            console.warn('Login button not found in overlay');
        }
    }
    
    // Hide login UI after successful authentication
    hideLogin() {
        const tryRemove = (attempt = 1, maxAttempts = 10) => {
            const overlays = [
                ...document.querySelectorAll('#login-overlay'),
                ...document.querySelectorAll('[data-login-overlay]'),
                ...document.querySelectorAll('.fixed.inset-0.bg-gray-900')
            ];

            if (overlays.length > 0) {
                overlays.forEach(el => el.remove());
                this.ensureAppVisible();
                return true;
            }

            if (attempt < maxAttempts) {
                // Exponential-ish backoff (cap at 250ms)
                const delay = Math.min(25 * attempt, 250);
                setTimeout(() => tryRemove(attempt + 1, maxAttempts), delay);
            } else {
                console.warn('Login dialog not found for removal after retries');
                this.ensureAppVisible();
            }
            return false;
        };

        tryRemove();
    }

    ensureAppVisible() {
        if (!this.isAuthenticated()) return;
        const authContainer = document.getElementById('auth-container');
        if (authContainer) authContainer.style.display = 'none';
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.display = 'block';
    }
    
    // Super admin validation
    isSuperAdmin() {
        const superAdminEmail = window.MagenSecConfig?.superAdminEmail || 'talktomagensec@gmail.com';
        return this.user?.email === superAdminEmail;
    }
}

// Create global auth instance
window.MagenSecAuth = new MagenSecAuth();
window.MagenSecAuth = new MagenSecAuth();