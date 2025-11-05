/**
 * Auth Module - Google OAuth + Session Management
 * No build step - pure vanilla JS with localStorage
 */

import { config } from './config.js';

export class Auth {
    constructor() {
        this.session = null;
        this.listeners = [];
        this.googleClientId = null;
        this.loadSession();
    }

    // Load session from localStorage
    loadSession() {
        try {
            const stored = localStorage.getItem(config.STORAGE_KEY);
            if (stored) {
                this.session = JSON.parse(stored);
                console.log('[Auth] Session loaded:', this.session.user?.email);
            }
        } catch (e) {
            console.error('[Auth] Failed to load session:', e);
        }
    }

    // Save session to localStorage
    saveSession(session) {
        this.session = session;
        localStorage.setItem(config.STORAGE_KEY, JSON.stringify(session));
        this.notifyListeners();
        console.log('[Auth] Session saved');
    }

    // Clear session
    clearSession() {
        this.session = null;
        localStorage.removeItem(config.STORAGE_KEY);
        this.notifyListeners();
        console.log('[Auth] Session cleared');
    }

    // Get OAuth configuration
    async getOAuthConfig() {
        const response = await fetch(`${config.API_BASE}/api/oauth/config`);
        const data = await response.json();
        
        if (data.success) {
            this.googleClientId = data.data.clientId;
            return data.data;
        }
        throw new Error(data.message || 'Failed to get OAuth config');
    }

    // Initiate Google OAuth (PKCE flow)
    async startOAuth() {
        const config = await this.getOAuthConfig();
        
        // Generate PKCE code verifier and challenge
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        
        // Determine redirect URI based on environment
        // Local: http://localhost:8080/portal/ or http://127.0.0.1:8080/portal/
        // GitHub Pages: https://magensec.github.io/portal/
        // Production: https://magensec.gigabits.co.in/portal/
        const redirectUri = window.location.origin + '/portal/';
        
        // Store for callback
        sessionStorage.setItem('oauth_code_verifier', codeVerifier);
        sessionStorage.setItem('oauth_state', this.generateState());
        sessionStorage.setItem('oauth_redirect_uri', redirectUri);
        
        console.log('[Auth] Starting OAuth with redirect:', redirectUri);
        
        // Build OAuth URL
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state: sessionStorage.getItem('oauth_state'),
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        
        // Redirect to Google
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }

    // Handle OAuth callback
    async handleCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        
        if (!code || !state) return false;
        
        // Verify state
        const storedState = sessionStorage.getItem('oauth_state');
        if (state !== storedState) {
            throw new Error('Invalid OAuth state');
        }
        
        // Get the redirect URI we used for the OAuth request
        const redirectUri = sessionStorage.getItem('oauth_redirect_uri') || (window.location.origin + '/portal/');
        
        console.log('[Auth] Handling callback with redirect:', redirectUri);
        
        // Exchange code for tokens using form data
        const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
        const formData = new URLSearchParams();
        formData.append('code', code);
        formData.append('redirectUri', redirectUri);
        formData.append('code_verifier', codeVerifier);
        formData.append('state', state);
        
        const response = await fetch(`${config.API_BASE}/api/oauth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        
        const data = await response.json();
        
        if (data.success) {
            this.saveSession(data.data);
            
            // Clean up
            sessionStorage.removeItem('oauth_code_verifier');
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_redirect_uri');
            
            // Remove query params
            window.history.replaceState({}, document.title, window.location.pathname);
            
            return true;
        }
        
        throw new Error(data.message || 'OAuth callback failed');
    }

    // Validate current session
    async validateSession() {
        if (!this.session?.sessionToken) return false;
        
        try {
            const response = await fetch(`${AUTH_CONFIG.API_BASE}/api/oauth/validate-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken: this.session.sessionToken })
            });
            
            const data = await response.json();
            return data.success;
        } catch (e) {
            console.error('[Auth] Session validation failed:', e);
            return false;
        }
    }

    // Logout
    logout() {
        this.clearSession();
        window.location.href = '/portal/';
    }

    // Check if authenticated
    isAuthenticated() {
        return !!this.session?.sessionToken;
    }

    // Get current user
    getUser() {
        return this.session?.user || null;
    }

    // Get session token
    getToken() {
        return this.session?.sessionToken || null;
    }

    // Subscribe to auth changes
    onChange(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this.session));
    }

    // PKCE helpers
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(new Uint8Array(hash));
    }

    generateState() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    base64URLEncode(buffer) {
        const base64 = btoa(String.fromCharCode(...buffer));
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
}

// Global instance
export const auth = new Auth();
