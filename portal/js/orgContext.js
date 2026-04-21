/**
 * Organization Context Manager
 * Handles org selection, switching, and persistence
 */

import { auth } from './auth.js';
import { api } from './api.js';
import { logger } from './config.js';

class OrgContext {
    constructor() {
        this.bannerDismissTtlMs = 24 * 60 * 60 * 1000;
        this.currentOrg = null;
        this.availableOrgs = [];
        this.listeners = [];
        this.loading = false;
        this.userDefaultOrgId = null;    // Backend-saved default org preference
        this.defaultOrgMissing = null;   // Set if saved default org is inaccessible
        
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
                const isPersonal = session.orgId === user.email;
                this.availableOrgs = [{
                    orgId: session.orgId,
                    name: isPersonal ? `${user.name || user.email}'s Organization` : session.orgId,
                    type: isPersonal ? 'Personal' : 'Business',
                    role: user.userType === 'SiteAdmin' ? 'SiteAdmin' : 'Owner',
                    deviceCount: 0,
                    totalSeats: user.maxDevices || 5
                }];
            }

            // Determine which org to select: saved -> backend default -> owner org -> first
            const savedOrgId = localStorage.getItem('selectedOrgId');
            const defaultOrgId = (this.availableOrgs.length > 0)
                ? (this.availableOrgs.find(o => o.role === 'Owner')?.orgId || this.availableOrgs[0].orgId)
                : null;
            const targetOrgId = savedOrgId || this.userDefaultOrgId || defaultOrgId || session.orgId || user.email;

            const found = this.availableOrgs.find(o => o.orgId === targetOrgId) || this.availableOrgs[0];
            if (found) {
                this.currentOrg = found;
                localStorage.setItem('selectedOrgId', found.orgId);
            }

            // Flag if the user's backend-saved default org is no longer accessible
            this.defaultOrgMissing = (this.userDefaultOrgId &&
                !this.availableOrgs.find(o => o.orgId === this.userDefaultOrgId))
                ? this.userDefaultOrgId : null;

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

            // Capture the user's backend-saved default org preference
            this.userDefaultOrgId = user?.defaultOrgId || null;
            
            // Map API response to availableOrgs format
            const mappedOrgs = orgs.map(org => ({
                orgId: org.orgId,
                name: org.name,
                type: org.type,
                role: org.role,
                deviceCount: org.deviceCount,
                totalSeats: org.totalSeats,
                ownerEmail: org.ownerEmail || null,
                isEnabled: org.isEnabled !== false,
                remainingCredits: org.remainingCredits ?? -1,
                totalCredits: org.totalCredits ?? -1,
                licenseType: org.licenseType || null,
                licenseTier: org.licenseTier || null,
                packageKey: org.packageKey || null,
                planKey: org.planKey || org.packageKey || org.licenseTier || null,
                addOns: Array.isArray(org.addOns) ? org.addOns : []
            }));

            // De-duplicate by orgId to avoid duplicate personal org entries
            const deduped = new Map();
            for (const org of mappedOrgs) {
                if (!deduped.has(org.orgId)) {
                    deduped.set(org.orgId, org);
                }
            }

            this.availableOrgs = Array.from(deduped.values());

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
     * @param {string} orgId - Organization ID to select
     * @param {Object} options - Options for selection
     * @param {boolean} options.reload - If true, perform full page reload. Default: false (component-level refresh via orgChanged event)
     * 
     * Pages should listen to the 'orgChanged' event to reload their data:
     *   window.addEventListener('orgChanged', (e) => {
     *       const org = e.detail;
     *       // Reload your component data here
     *       loadPageData(org.orgId);
     *   });
     */
    selectOrg(orgId, { reload = false } = {}) {
        const org = this.availableOrgs.find(o => o.orgId === orgId);
        if (!org) {
            logger.error('[OrgContext] Org not found:', orgId);
            return;
        }

        // Avoid unnecessary work when selecting the current org
        if (this.currentOrg?.orgId === org.orgId) {
            return;
        }

        this.currentOrg = org;
        localStorage.setItem('selectedOrgId', orgId);
        
        logger.info('[OrgContext] Org selected:', org);
        
        // Notify listeners (triggers component-level refresh)
        this.notifyListeners();

        // Optional full page reload; default is component-level refresh via listeners
        if (reload) {
            window.location.reload();
        }
    }

    /**
     * Trigger component refresh (data reload without page reload)
     * Call this when you need to refresh data for the current org
     * All listeners subscribed via onChange() and orgChanged event will be notified
     */
    refresh() {
        logger.info('[OrgContext] Triggering component refresh for:', this.currentOrg?.orgId);
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

    isReadOnly() {
        return this.getCurrentRole() === 'ReadOnly';
    }

    canWrite() {
        const role = this.getCurrentRole();
        return role === 'Owner' || role === 'ReadWrite';
    }

    /**
     * Whether this org can activate Time Warp (time-travel historical access).
     * Gated by the "rewind" add-on on the org's license. SiteAdmin always has Time Warp.
     */
    hasRewind() {
        if (this.isSiteAdmin()) return true;
        const addOns = this.currentOrg?.addOns;
        return Array.isArray(addOns) && addOns.some(a => a.toLowerCase() === 'rewind');
    }

    /**
     * Generic add-on check by key (case-insensitive).
     * SiteAdmin is treated as having all add-ons for preview purposes.
     */
    hasAddOn(key) {
        if (this.isSiteAdmin()) return true;
        const addOns = this.currentOrg?.addOns;
        return Array.isArray(addOns) && addOns.some(a => a.toLowerCase() === key.toLowerCase());
    }

    /**
     * Checks whether the org's actual license includes the given add-on key,
     * WITHOUT the SiteAdmin bypass. Use this to show informational banners to
     * SiteAdmins when they view an add-on page for an org that hasn't licensed it.
     */
    hasAddOnForOrg(key) {
        const addOns = this.currentOrg?.addOns;
        return Array.isArray(addOns) && addOns.some(a => a.toLowerCase() === key.toLowerCase());
    }

    hasPeerBenchmark()      { return this.hasAddOn('PeerBenchmark'); }
    hasHygieneCoach()       { return this.hasAddOn('HygieneCoach'); }
    hasInsuranceReadiness() { return this.hasAddOn('InsuranceReadiness'); }
    hasCompliancePlus()     { return this.hasAddOn('CompliancePlus'); }
    hasSupplyChainIntel()   { return this.hasAddOn('SupplyChainIntel'); }

    /**
     * Whether this org can access MAGI historical mode (Time Warp + AI analyst combo).
     * Requires both historical access and a non-ReadOnly role (ReadOnly has minimal AI quota).
     */
    hasMagi() {
        // All orgs with an active license get basic MAGI; historical MAGI requires Time Warp access.
        return !!this.currentOrg;
    }

    hasHistoricalMagi() {
        return this.hasRewind() && this.canWrite();
    }

    /**
     * Check if user is Individual User (Personal org type)
     */
    isIndividualUser() {
        return this.currentOrg?.type === 'Personal';
    }

    /**
     * Check if user is on an Education org
     */
    isEducationOrg() {
        return this.currentOrg?.type === 'Education';
    }

    /**
     * Check if org has Business-tier features
     * Education and Business orgs have multi-user features
     */
    hasBusinessFeatures() {
        const type = this.currentOrg?.type;
        return type === 'Business' || type === 'Education';
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
        // Update org status banner for current org
        this.updateOrgStatusBanner(this.currentOrg);

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
     * Show/hide the org status banner based on the selected org's state.
     * Handles: disabled org, expired license, expiring soon.
     */
    updateOrgStatusBanner(org) {
        const banner = document.getElementById('org-status-banner');
        const alertEl = document.getElementById('org-status-alert');
        if (!banner || !alertEl) return;

        if (!org) { banner.style.display = 'none'; return; }

        const isDisabled = org.isEnabled === false;
        // -1 means the server returned no license data (new org, fallback path, etc.).
        // Only show "expired" when we know credits existed (totalCredits > 0) and are now exhausted.
        const isExpired  = org.totalCredits > 0 && org.remainingCredits === 0;
        const totalSeats = org.totalSeats > 0 ? org.totalSeats : 5;
        const isExpiring = !isExpired && org.remainingCredits > 0 && org.remainingCredits <= (totalSeats * 7);

        // Icon SVG paths (Tabler icon style)
        const iconBan = `<svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <circle cx="12" cy="12" r="9" />
            <line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
        </svg>`;
        const iconAlertCircle = `<svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>`;
        const iconClock = `<svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 15" />
        </svg>`;

        const buildAlert = (colorClass, icon, title, detail) => `
            <div class="alert alert-important ${colorClass} alert-dismissible mb-0" role="alert">
                <div class="d-flex">
                    <div>${icon}</div>
                    <div class="ms-2">
                        <h4 class="alert-title">${title}</h4>
                        <div>${detail}</div>
                    </div>
                </div>
                <button type="button" class="btn-close" data-org-banner-dismiss="true" aria-label="close"></button>
            </div>`;

        const bindDismissHandler = (statusKey) => {
            const closeBtn = alertEl.querySelector('[data-org-banner-dismiss="true"]');
            if (!closeBtn) return;
            closeBtn.addEventListener('click', () => {
                this.markBannerDismissed(org.orgId, statusKey);
                banner.style.display = 'none';
            }, { once: true });
        };

        const shouldHideDismissed = (statusKey) => this.isBannerDismissed(org.orgId, statusKey);

        if (isDisabled) {
            if (shouldHideDismissed('disabled')) {
                banner.style.display = 'none';
                return;
            }
            alertEl.innerHTML = buildAlert(
                'alert-danger',
                iconBan,
                'Account Disabled',
                'This organization has been disabled. Contact <a href="mailto:support@magensec.com" class="text-reset fw-bold text-decoration-underline">support@magensec.com</a> to reinstate access.'
            );
            bindDismissHandler('disabled');
            banner.style.display = 'block';
        } else if (isExpired) {
            if (shouldHideDismissed('expired')) {
                banner.style.display = 'none';
                return;
            }
            alertEl.innerHTML = buildAlert(
                'alert-danger',
                iconAlertCircle,
                'License Expired',
                'Your MagenSec license has no remaining credits. <a href="#!/account" class="text-reset fw-bold text-decoration-underline">Renew now</a> to restore full access.'
            );
            bindDismissHandler('expired');
            banner.style.display = 'block';
        } else if (isExpiring) {
            if (shouldHideDismissed('expiring')) {
                banner.style.display = 'none';
                return;
            }
            const days = Math.floor(org.remainingCredits / (totalSeats || 1));
            alertEl.innerHTML = buildAlert(
                'alert-warning',
                iconClock,
                'License Expiring Soon',
                `Approximately ${days} day${days !== 1 ? 's' : ''} of credits remaining. <a href="#!/account" class="text-reset fw-bold text-decoration-underline">Renew now</a> to avoid interruption.`
            );
            bindDismissHandler('expiring');
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    }

    getBannerDismissKey(orgId, statusKey) {
        return `org_status_banner_dismissed:${orgId}:${statusKey}`;
    }

    isBannerDismissed(orgId, statusKey) {
        if (!orgId || !statusKey) return false;
        try {
            const key = this.getBannerDismissKey(orgId, statusKey);
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const dismissedAt = Number(raw);
            if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) {
                localStorage.removeItem(key);
                return false;
            }
            const expired = (Date.now() - dismissedAt) >= this.bannerDismissTtlMs;
            if (expired) {
                localStorage.removeItem(key);
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    markBannerDismissed(orgId, statusKey) {
        if (!orgId || !statusKey) return;
        try {
            localStorage.setItem(this.getBannerDismissKey(orgId, statusKey), String(Date.now()));
        } catch {
            // Best-effort persistence only.
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
