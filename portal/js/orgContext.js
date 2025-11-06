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
        if (this.loading) return;
        
        try {
            this.loading = true;
            const user = auth.getUser();
            
            if (!user) {
                logger.debug('[OrgContext] No user, skipping initialization. Auth session:', auth.session);
                return;
            }

            logger.debug('[OrgContext] Initializing for user:', user.email);

            // TODO: Replace with real API call when /api/users/me/orgs is implemented
            // For now, use mock data based on user email
            await this.loadMockOrgs(user);
            
            // If no org selected, select the first one
            if (!this.currentOrg && this.availableOrgs.length > 0) {
                this.selectOrg(this.availableOrgs[0].orgId);
            }
            
            logger.debug('[OrgContext] Initialized:', {
                currentOrg: this.currentOrg,
                availableOrgs: this.availableOrgs.length
            });
            
            // Notify listeners that orgs are loaded (even if already notified by selectOrg)
            // This ensures components that subscribe after initialization still get the data
            this.notifyListeners();
            
        } catch (error) {
            logger.error('[OrgContext] Initialization failed:', error);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Mock org loading (replace with real API)
     */
    async loadMockOrgs(user) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Mock data based on user type
        if (user.email === 'talktomagensec@gmail.com') {
            // Super User: Access to all orgs (including test orgs)
            this.availableOrgs = [
                { orgId: 'TEST-GIGA-BITS', name: 'Test Organization - Gigabits', type: 'Business', role: 'SuperUser' },
                { orgId: 'DEMO-MAGE-NSEC', name: 'Demo Organization - MagenSec', type: 'Business', role: 'SuperUser' },
                { orgId: user.email, name: 'Personal Org', type: 'Individual', role: 'Owner' }
            ];
        } else if (user.email.includes('admin') || user.email.includes('business')) {
            // Business Admin: Multiple orgs
            this.availableOrgs = [
                { orgId: 'ORG-001', name: 'Acme Corporation', type: 'Business', role: 'Owner' },
                { orgId: 'ORG-002', name: 'Tech Startup Inc', type: 'Business', role: 'ReadWrite' },
                { orgId: user.email, name: 'Personal Org', type: 'Individual', role: 'Owner' }
            ];
        } else {
            // Individual User: Only personal org
            this.availableOrgs = [
                { orgId: user.email, name: 'Personal Org', type: 'Individual', role: 'Owner' }
            ];
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
        return this.currentOrg?.type === 'Individual';
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
        return user?.roles?.includes('SiteAdmin') || this.currentOrg?.role === 'SiteAdmin';
    }

    /**
     * Check if user is Super User
     */
    isSuperUser() {
        const user = auth.getUser();
        return user?.email === 'talktomagensec@gmail.com' || this.currentOrg?.role === 'SuperUser';
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
