/**
 * Organization Switcher Component
 * Dropdown to select between available organizations
 */

import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class OrgSwitcher extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentOrg: orgContext.getCurrentOrg(),
            availableOrgs: orgContext.getAvailableOrgs()
        };
        this.unsubscribe = null;
    }
    
    componentDidMount() {
        // Subscribe to org context changes
        this.unsubscribe = orgContext.onChange((org) => {
            console.log('[OrgSwitcher] Org changed:', org);
            const newState = {
                currentOrg: orgContext.getCurrentOrg(),
                availableOrgs: orgContext.getAvailableOrgs()
            };
            console.log('[OrgSwitcher] New state:', newState);
            this.setState(newState);
        });
        
        // Also immediately check if orgs are already loaded
        const currentOrg = orgContext.getCurrentOrg();
        const availableOrgs = orgContext.getAvailableOrgs();
        console.log('[OrgSwitcher] Initial state on mount:', { currentOrg, availableOrgs });
        
        if (availableOrgs.length > 0) {
            this.setState({ currentOrg, availableOrgs });
        }
    }
    
    componentWillUnmount() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
    
    render({ onOrgChange }) {
        const { currentOrg, availableOrgs } = this.state;
        const hasMultiple = availableOrgs.length > 1;

        // If user only has one org, show it as plain text (no dropdown)
        if (!hasMultiple) {
            return html`
                <div class="flex items-center gap-2 text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span class="text-sm font-medium">
                        ${availableOrgs.length === 0 ? 'Loading...' : currentOrg?.name || availableOrgs[0]?.name || 'Personal Org'}
                    </span>
                </div>
            `;
        }

        const handleOrgChange = (e) => {
            const newOrgId = e.target.value;
            orgContext.selectOrg(newOrgId);
            
            if (onOrgChange) {
                onOrgChange(newOrgId);
            }
        };

        return html`
            <div class="relative">
                <label class="sr-only">Select Organization</label>
                <select
                    value=${currentOrg?.orgId || ''}
                    onchange=${handleOrgChange}
                    class="appearance-none bg-white/10 hover:bg-white/20 text-white rounded-lg pl-10 pr-10 py-2 text-sm font-medium transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                    ${availableOrgs.map(org => html`
                        <option value=${org.orgId} class="bg-gray-800 text-white">
                            ${org.name} ${org.type === 'Personal' ? '(Personal)' : `(${org.role})`}
                        </option>
                    `)}
                </select>
                <!-- Icon -->
                <div class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <!-- Dropdown Arrow -->
                <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        `;
    }
}
