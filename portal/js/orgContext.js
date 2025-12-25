/**
 * Organization Context Manager
 * Handles org selection, switching, and persistence
 */

import { auth } from './auth.js';
import { api } from './api.js';
import { logger } from './config.js';

class OrgContext {
    constructor() {
        this.currentOrg = null;
        this.availableOrgs = [];
        this.listeners = [];
        this.loading = false;
        
        // Load selected org from localStorage
        const savedOrgId = localStorage.getItem('selectedOrgId');
        if (savedOrgId) {
            this.currentOrg = { orgId: savedOrgId };
        }
    }

    /**
     * Initialize org context after login
     */
    async initialize() {
        // Guard against concurrent initialization
        if (this.loading) {
            logger.debug('[OrgContext] Already loading, waiting for existing initialization');
            // Wait for existing initialization to complete
            if (this.initPromise) {
                return this.initPromise;
            }
            return;
        }
        
        try {
            this.loading = true;
            this.initPromise = this._doInitialize();
            await this.initPromise;
        } finally {
            this.loading = false;
            this.initPromise = null;
        }
    }

    async _doInitialize() {
        try {
            const user = auth.getUser();
            const session = auth.getSession();
            
            if (!user || !session) {
                logger.debug('[OrgContext] No user/session, skipping initialization');
                return;
            }

            logger.debug('[OrgContext] Initializing for user:', user.email);

            // Prefer API source of truth to get org names and roles
            try {
                await this.loadOrgsFromAPI();
            } catch (apiErr) {
                logger.warn('[OrgContext] Falling back to session-only org due to API error');
                this.availableOrgs = [{
                    orgId: session.orgId,
                    name: session.orgId === user.email ? `${user.name || user.email}'s Organization` : session.orgId,
                    type: user.userType === 'Individual' ? 'Personal' : 'Business',
                    role: user.userType === 'SiteAdmin' ? 'SiteAdmin' : (user.userType === 'BusinessAdmin' ? 'Owner' : 'ReadOnly'),
                    deviceCount: 0,
                    totalSeats: user.maxDevices || 5
                }];
            }

            // Determine which org to select: saved -> default from API -> first
            const savedOrgId = localStorage.getItem('selectedOrgId');
            const defaultOrgId = (this.availableOrgs.length > 0)
                ? (this.availableOrgs.find(o => o.role === 'Owner')?.orgId || this.availableOrgs[0].orgId)
                : null;
            const targetOrgId = savedOrgId || defaultOrgId || session.orgId || user.email;

            const found = this.availableOrgs.find(o => o.orgId === targetOrgId) || this.availableOrgs[0];
            if (found) {
                this.currentOrg = found;
                localStorage.setItem('selectedOrgId', found.orgId);
            }

            logger.debug('[OrgContext] Initialized:', {
                currentOrg: this.currentOrg,
                availableOrgs: this.availableOrgs.length
            });

            // Notify listeners that orgs are loaded
            this.notifyListeners();
            
        } catch (error) {
            logger.error('[OrgContext] Initialization failed:', error);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Load organizations from API
     */
    async loadOrgsFromAPI() {
        try {
            logger.debug('[OrgContext] Loading orgs from API...');
            
            // Call GET /api/users/me
            const response = await api.get('/api/v1/users/me');
            
            if (!response.success || !response.data) {
                throw new Error('Invalid API response');
            }
            
            const { user, orgs } = response.data;
            
            // Map API response to availableOrgs format
            this.availableOrgs = orgs.map(org => ({
                orgId: org.orgId,
                name: org.name,
                type: org.type,
                role: org.role,
                deviceCount: org.deviceCount,
                totalSeats: org.totalSeats
            }));

            // If API returns no orgs for some reason, create a personal fallback from user
            if (this.availableOrgs.length === 0 && user?.defaultOrgId) {
                this.availableOrgs = [{
                    orgId: user.defaultOrgId,
                    name: user.displayName ? `${user.displayName}'s Organization` : user.defaultOrgId,
                    type: user.userType === 'Individual' ? 'Personal' : 'Business',
                    role: user.userType === 'SiteAdmin' ? 'SiteAdmin' : (user.userType === 'BusinessAdmin' ? 'Owner' : 'ReadOnly'),
                    deviceCount: 0,
                    totalSeats: 0
                }];
            }
            
            logger.info('[OrgContext] Loaded', this.availableOrgs.length, 'organizations from API');
            
        } catch (error) {
            logger.error('[OrgContext] Failed to load orgs from API:', error);
            
            // Fallback to empty array (user can retry)
            this.availableOrgs = [];
            throw error;
        }
    }

    /**
     * Select an organization
     */
    selectOrg(orgId) {
        const org = this.availableOrgs.find(o => o.orgId === orgId);
        if (!org) {
            logger.error('[OrgContext] Org not found:', orgId);
            return;
        }

        this.currentOrg = org;
        localStorage.setItem('selectedOrgId', orgId);
        
        logger.info('[OrgContext] Org selected:', org);
        
        // Notify listeners
        this.notifyListeners();
    }

    /**
     * Get current organization
     */
    getCurrentOrg() {
        return this.currentOrg;
    }

    /**
     * Get available organizations
     */
    getAvailableOrgs() {
        return this.availableOrgs;
    }

    /**
     * Check if user has multiple orgs
     */
    hasMultipleOrgs() {
        return this.availableOrgs.length > 1;
    }

    /**
     * Get user's role in current org
     */
    getCurrentRole() {
        return this.currentOrg?.role || 'ReadOnly';
    }

    /**
     * Check if user is Individual User
     */
    isIndividualUser() {
        return this.currentOrg?.type === 'Personal' || this.currentOrg?.type === 'Individual';
    }

    /**
     * Check if user is Business Admin
     */
    isBusinessAdmin() {
        return this.currentOrg?.type === 'Business' && 
               (this.currentOrg?.role === 'Owner' || this.currentOrg?.role === 'ReadWrite');
    }

    /**
     * Check if user is Site Admin
     */
    isSiteAdmin() {
        const user = auth.getUser();
        // Check userType from API response (stored in user object after login)
        return user?.userType === 'SiteAdmin' || this.currentOrg?.role === 'SiteAdmin';
    }

    /**
     * Check if user is Super User (Site Admin)
     */
    isSuperUser() {
        const user = auth.getUser();
        // Super User is same as Site Admin in our system
        return user?.userType === 'SiteAdmin' || this.currentOrg?.role === 'SiteAdmin';
    }

    /**
     * Subscribe to org changes
     */
    onChange(callback) {
        this.listeners.push(callback);
        
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Notify all listeners of org change
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.currentOrg);
            } catch (error) {
                logger.error('[OrgContext] Listener error:', error);
            }
        });

        // Broadcast a global event for pages to react to org changes
        try {
            const evt = new CustomEvent('orgChanged', { detail: this.currentOrg });
            window.dispatchEvent(evt);
        } catch (error) {
            logger.error('[OrgContext] Failed to dispatch orgChanged event:', error);
        }
    }

    /**
     * Clear org context (on logout)
     */
    clear() {
        this.currentOrg = null;
        this.availableOrgs = [];
        localStorage.removeItem('selectedOrgId');
        this.notifyListeners();
        logger.info('[OrgContext] Cleared');
    }
}

// Create singleton instance
export const orgContext = new OrgContext();

// Auto-initialize when user logs in
auth.onChange((session) => {
    if (session) {
        orgContext.initialize();
    } else {
        orgContext.clear();
    }
});
