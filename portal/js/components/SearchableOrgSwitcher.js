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
            case 'Personal': return Icons.User({ size, color });
            default: return Icons.Building({ size, color });
        }
    }

    render() {
        const { currentOrg, availableOrgs, isOpen, searchQuery, filteredOrgs, selectedIndex } = this.state;

        // Single org - show name only (no dropdown)
        if (availableOrgs.length <= 1) {
            return html`
                <div class="d-flex align-items-center text-white">
                    ${this.getOrgTypeIcon(currentOrg?.type, 20, 'white')}
                    <span class="ms-2 fw-medium">${currentOrg?.name || 'Loading...'}</span>
                </div>
            `;
        }

        // Multiple orgs - show searchable dropdown
        return html`
            <div 
                class="dropdown"
                ref=${(el) => this.dropdownRef = el}
            >
                <!-- Current Org Button -->
                <button
                    onClick=${this.handleToggleDropdown}
                    onKeyDown=${this.handleKeyDown}
                    class="btn btn-primary btn-sm d-flex align-items-center"
                    aria-expanded=${isOpen}
                    aria-haspopup="listbox"
                >
                    ${this.getOrgTypeIcon(currentOrg?.type, 20, 'white')}
                    <span class="ms-2 d-flex align-items-center">
                        ${currentOrg?.name || 'Select Organization'}
                        ${currentOrg?.type && html`<span class="badge bg-light text-dark ms-2">${currentOrg.type}</span>`}
                    </span>
                    <${Icons.ChevronDown} 
                        size=${16} 
                        color="white" 
                        className=${"ms-2 " + (isOpen ? 'rotate-180' : '')}
                    />
                </button>

                <!-- Dropdown Menu -->
                ${isOpen && html`
                    <div class="dropdown-menu dropdown-menu-end show" style="width: 24rem; max-height: 500px; overflow-y: auto;">
                        <!-- Search Input -->
                        <div class="p-3 border-bottom">
                            <div class="input-icon">
                                <span class="input-icon-addon">
                                    <${Icons.Search} size=${20} color="currentColor" />
                                </span>
                                <input
                                    ref=${(el) => this.searchInputRef = el}
                                    type="text"
                                    value=${searchQuery}
                                    onInput=${this.handleSearchChange}
                                    onKeyDown=${this.handleKeyDown}
                                    placeholder="Search organizations..."
                                    class="form-control"
                                    aria-label="Search organizations"
                                />
                            </div>
                            <div class="text-muted small mt-2">
                                ${filteredOrgs.length} of ${availableOrgs.length} organizations
                            </div>
                        </div>

                        <!-- Org List -->
                        <div 
                            class="dropdown-menu-scrollable"
                            style="max-height: 400px; overflow-y: auto;"
                            role="listbox"
                        >
                            ${filteredOrgs.length === 0 ? html`
                                <div class="dropdown-item disabled text-center">
                                    <div class="text-muted">No organizations found</div>
                                    <div class="small text-muted mt-1">Try a different search term</div>
                                </div>
                            ` : filteredOrgs.map((org, index) => html`
                                <a
                                    key=${org.orgId}
                                    href="javascript:void(0)"
                                    onClick=${() => this.handleOrgSelect(org)}
                                    class="${
                                        'dropdown-item d-flex align-items-center ' +
                                        (org.orgId === currentOrg?.orgId ? 'active' : '') +
                                        (index === selectedIndex ? ' bg-light' : '')
                                    }"
                                    role="option"
                                    aria-selected=${org.orgId === currentOrg?.orgId}
                                >
                                    ${this.getOrgTypeIcon(org.type, 20, 'currentColor')}
                                    <div class="flex-fill ms-2">
                                        <div class="text-truncate">${org.name}</div>
                                        <div class="text-muted small d-flex align-items-center">
                                            <span>${org.orgId}</span>
                                            ${org.type && html`<span class="badge badge-sm bg-light text-dark ms-2">${org.type}</span>`}
                                            ${org.role && html`<span class="badge badge-sm bg-primary-lt text-dark ms-2">${org.role}</span>`}
                                        </div>
                                    </div>
                                    ${org.orgId === currentOrg?.orgId && html`
                                        <${Icons.Check} size=${18} color="#206bc4" />
                                    `}
                                </a>
                            `)}
                        </div>

                        <!-- Footer -->
                        <div class="dropdown-item disabled small text-muted text-center border-top">
                            Use ↑↓ arrows to navigate, Enter to select
                        </div>
                    </div>
                `}
            </div>
        `;
    }
}
