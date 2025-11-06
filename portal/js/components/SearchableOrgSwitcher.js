/**
 * Searchable Organization Switcher Component
 * Handles thousands of orgs with instant client-side search
 * No build tools - pure Preact + HTM
 */

import { auth } from '../auth.js';
import { orgContext } from '../orgContext.js';
import { logger } from '../config.js';
import { Icons } from './Icons.js';

const { html, Component } = window;

export class SearchableOrgSwitcher extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentOrg: orgContext.getCurrentOrg(),
            availableOrgs: orgContext.getAvailableOrgs(),
            searchQuery: '',
            isOpen: false,
            filteredOrgs: orgContext.getAvailableOrgs(),
            selectedIndex: -1
        };
        
        this.unsubscribe = null;
        this.dropdownRef = null;
        this.searchInputRef = null;
    }

    componentDidMount() {
        // Subscribe to org context changes
        this.unsubscribe = orgContext.onChange(() => {
            const availableOrgs = orgContext.getAvailableOrgs();
            this.setState({ 
                currentOrg: orgContext.getCurrentOrg(),
                availableOrgs: availableOrgs,
                filteredOrgs: this.filterOrgs(this.state.searchQuery, availableOrgs)
            });
            logger.debug('[SearchableOrgSwitcher] Org context updated:', availableOrgs.length, 'orgs');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', this.handleClickOutside);
        
        logger.debug('[SearchableOrgSwitcher] Mounted with', this.state.availableOrgs.length, 'orgs');
    }

    componentWillUnmount() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        document.removeEventListener('click', this.handleClickOutside);
    }

    handleClickOutside = (e) => {
        if (this.dropdownRef && !this.dropdownRef.contains(e.target)) {
            this.setState({ isOpen: false, searchQuery: '', selectedIndex: -1 });
        }
    }

    filterOrgs = (query, orgs = this.state.availableOrgs) => {
        if (!query || query.trim() === '') {
            return orgs;
        }

        const lowerQuery = query.toLowerCase();
        return orgs.filter(org => 
            org.name.toLowerCase().includes(lowerQuery) ||
            org.orgId.toLowerCase().includes(lowerQuery) ||
            (org.type && org.type.toLowerCase().includes(lowerQuery))
        );
    }

    handleSearchChange = (e) => {
        const query = e.target.value;
        const filtered = this.filterOrgs(query);
        this.setState({ 
            searchQuery: query,
            filteredOrgs: filtered,
            selectedIndex: filtered.length > 0 ? 0 : -1
        });
    }

    handleToggleDropdown = (e) => {
        e.stopPropagation();
        const newIsOpen = !this.state.isOpen;
        this.setState({ 
            isOpen: newIsOpen,
            searchQuery: '',
            filteredOrgs: this.state.availableOrgs,
            selectedIndex: -1
        });

        // Focus search input when opening
        if (newIsOpen) {
            setTimeout(() => {
                if (this.searchInputRef) {
                    this.searchInputRef.focus();
                }
            }, 100);
        }
    }

    handleOrgSelect = (org) => {
        if (org.orgId !== this.state.currentOrg?.orgId) {
            logger.info('[SearchableOrgSwitcher] Switching to org:', org.orgId);
            orgContext.selectOrg(org.orgId);
            if (this.props.onOrgChange) {
                this.props.onOrgChange(org);
            }
        }
        this.setState({ 
            isOpen: false, 
            searchQuery: '',
            selectedIndex: -1
        });
    }

    handleKeyDown = (e) => {
        const { filteredOrgs, selectedIndex, isOpen } = this.state;

        if (!isOpen) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.handleToggleDropdown(e);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.setState({ 
                    selectedIndex: Math.min(selectedIndex + 1, filteredOrgs.length - 1)
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.setState({ 
                    selectedIndex: Math.max(selectedIndex - 1, 0)
                });
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < filteredOrgs.length) {
                    this.handleOrgSelect(filteredOrgs[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.setState({ 
                    isOpen: false, 
                    searchQuery: '',
                    selectedIndex: -1
                });
                break;
        }
    }

    getOrgTypeIcon = (type, size = 20, color = 'currentColor') => {
        switch (type) {
            case 'Business': return Icons.Building({ size, color });
            case 'Individual': return Icons.User({ size, color });
            default: return Icons.Building({ size, color });
        }
    }

    render() {
        const { currentOrg, availableOrgs, isOpen, searchQuery, filteredOrgs, selectedIndex } = this.state;

        // Single org - show name only (no dropdown)
        if (availableOrgs.length <= 1) {
            return html`
                <div class="flex items-center space-x-2 text-white">
                    ${this.getOrgTypeIcon(currentOrg?.type, 20, 'white')}
                    <span class="font-medium">${currentOrg?.name || 'Loading...'}</span>
                </div>
            `;
        }

        // Multiple orgs - show searchable dropdown
        return html`
            <div 
                class="relative"
                ref=${(el) => this.dropdownRef = el}
            >
                <!-- Current Org Button -->
                <button
                    onClick=${this.handleToggleDropdown}
                    onKeyDown=${this.handleKeyDown}
                    class="flex items-center space-x-2 px-4 py-2 bg-blue-800 hover:bg-blue-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                    aria-expanded=${isOpen}
                    aria-haspopup="listbox"
                >
                    ${this.getOrgTypeIcon(currentOrg?.type, 20, 'white')}
                    <span class="font-medium">${currentOrg?.name || 'Select Organization'}</span>
                    <${Icons.ChevronDown} 
                        size=${16} 
                        color="white" 
                        className=${"transition-transform " + (isOpen ? 'rotate-180' : '')}
                    />
                </button>

                <!-- Dropdown Menu -->
                ${isOpen && html`
                    <div class="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl z-50 border border-gray-200">
                        <!-- Search Input -->
                        <div class="p-3 border-b border-gray-200">
                            <div class="relative">
                                <input
                                    ref=${(el) => this.searchInputRef = el}
                                    type="text"
                                    value=${searchQuery}
                                    onInput=${this.handleSearchChange}
                                    onKeyDown=${this.handleKeyDown}
                                    placeholder="Search organizations..."
                                    class="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    aria-label="Search organizations"
                                />
                                <div class="absolute left-3 top-2.5 text-gray-400">
                                    <${Icons.Search} size=${20} color="currentColor" />
                                </div>
                            </div>
                            <div class="mt-2 text-xs text-gray-500">
                                ${filteredOrgs.length} of ${availableOrgs.length} organizations
                            </div>
                        </div>

                        <!-- Org List -->
                        <div 
                            class="max-h-96 overflow-y-auto"
                            role="listbox"
                        >
                            ${filteredOrgs.length === 0 ? html`
                                <div class="p-4 text-center text-gray-500">
                                    <p class="text-sm">No organizations found</p>
                                    <p class="text-xs mt-1">Try a different search term</p>
                                </div>
                            ` : filteredOrgs.map((org, index) => html`
                                <button
                                    key=${org.orgId}
                                    onClick=${() => this.handleOrgSelect(org)}
                                    class="${
                                        'w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center space-x-3 ' +
                                        (org.orgId === currentOrg?.orgId ? 'bg-blue-100 font-medium' : '') +
                                        (index === selectedIndex ? ' bg-gray-100' : '')
                                    }"
                                    role="option"
                                    aria-selected=${org.orgId === currentOrg?.orgId}
                                >
                                    ${this.getOrgTypeIcon(org.type, 24, 'currentColor')}
                                    <div class="flex-1 min-w-0">
                                        <div class="font-medium text-gray-900 truncate">${org.name}</div>
                                        <div class="text-xs text-gray-500 flex items-center space-x-2">
                                            <span>${org.orgId}</span>
                                            ${org.role && html`
                                                <span class="px-2 py-0.5 bg-gray-200 rounded text-xs">${org.role}</span>
                                            `}
                                        </div>
                                    </div>
                                    ${org.orgId === currentOrg?.orgId && html`
                                        <${Icons.Check} size=${20} color="#2563eb" />
                                    `}
                                </button>
                            `)}
                        </div>

                        <!-- Footer -->
                        <div class="p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                            <div class="text-xs text-gray-600 text-center">
                                Use ↑↓ arrows to navigate, Enter to select
                            </div>
                        </div>
                    </div>
                `}
            </div>
        `;
    }
}
