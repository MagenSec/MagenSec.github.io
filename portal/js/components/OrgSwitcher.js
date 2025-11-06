/**
 * Organization Switcher Component
 * Dropdown to select between available organizations
 */

import { orgContext } from '../orgContext.js';

const { html } = window;

export function OrgSwitcher({ onOrgChange }) {
    const currentOrg = orgContext.getCurrentOrg();
    const availableOrgs = orgContext.getAvailableOrgs();
    const hasMultiple = orgContext.hasMultipleOrgs();

    // Don't show switcher if user only has one org
    if (!hasMultiple || availableOrgs.length <= 1) {
        return html`
            <div class="flex items-center gap-2 text-white">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span class="text-sm font-medium">${currentOrg?.name || 'Loading...'}</span>
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
                        ${org.name} ${org.type === 'Individual' ? '(Personal)' : `(${org.role})`}
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
