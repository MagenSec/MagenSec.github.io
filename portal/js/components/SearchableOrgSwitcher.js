/**
 * Searchable Organization Switcher Component
 * Custom dropdown with type icons, role badges, type-filter tabs, search, and row highlighting.
 * No build tools -- pure Preact + HTM.
 */

import { orgContext } from '../orgContext.js';
import { rewindContext } from '../rewindContext.js';

const { html, Component } = window;

const SEARCH_THRESHOLD = 6;
const PAGE_SIZE        = 8;

// -- Type icons (inline Tabler SVG) ------------------------------------------
const OrgTypeIcon = ({ type, size = 18, color = 'currentColor' }) => {
    switch (type) {
        case 'Personal':
            return html`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>`;
        case 'Education':
            return html`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 6 3 6 3s6-1 6-3v-5"/></svg>`;
        default: // Business
            return html`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12.01" y2="12"/></svg>`;
    }
};

// -- Role display names & badge colours --------------------------------------
const ROLE_MAP = {
    Owner:     { label: 'Owner',      cls: 'bg-blue'   },
    Admin:     { label: 'Owner',      cls: 'bg-blue'   },
    SiteAdmin: { label: 'Site Admin', cls: 'bg-purple' },
    ReadWrite: { label: 'Co-Admin',   cls: 'bg-green'  },
    ReadOnly:  { label: 'Auditor',    cls: 'bg-yellow' },
};

const RoleBadge = ({ role, small = false }) => {
    const { label, cls } = ROLE_MAP[role] || { label: role, cls: 'bg-secondary' };
    return html`<span class="badge ${cls} text-white" style="font-size:${small ? '0.6' : '0.65'}rem; letter-spacing:0.04em; padding:2px 7px; white-space:nowrap;">${label}</span>`;
};

// -- Type icon bubble colours -------------------------------------------------
const TYPE_BG    = { Personal: 'rgba(32,107,196,0.1)',   Business: 'rgba(100,100,120,0.08)', Education: 'rgba(47,179,68,0.1)'  };
const TYPE_COLOR = { Personal: '#206bc4',                Business: '#555',                   Education: '#2fb344'              };

// -- Filter tabs definition --------------------------------------------------
const ALL_TABS = ['All', 'Personal', 'Business', 'Education'];

export class SearchableOrgSwitcher extends Component {
    constructor(props) {
        super(props);
        const orgs = orgContext.getAvailableOrgs();
        this.state = {
            currentOrg:    orgContext.getCurrentOrg(),
            availableOrgs: orgs,
            searchQuery:   '',
            activeTab:     'All',
            isOpen:        false,
            page:          0,
            selectedIndex: -1,
        };
        this.unsubscribe    = null;
        this.dropdownRef    = null;
        this.searchInputRef = null;
    }

    componentDidMount() {
        this.unsubscribe = orgContext.onChange(() => {
            const orgs = orgContext.getAvailableOrgs();
            this.setState({ currentOrg: orgContext.getCurrentOrg(), availableOrgs: orgs });
        });
        document.addEventListener('click', this._onOutside);
    }

    componentWillUnmount() {
        if (this.unsubscribe) this.unsubscribe();
        document.removeEventListener('click', this._onOutside);
    }

    _onOutside = (e) => {
        if (this.dropdownRef && !this.dropdownRef.contains(e.target)) {
            this.setState({ isOpen: false, searchQuery: '', activeTab: 'All', page: 0, selectedIndex: -1 });
        }
    };

    _getFiltered = (query = this.state.searchQuery, tab = this.state.activeTab, orgs = this.state.availableOrgs) => {
        let list = tab === 'All' ? orgs : orgs.filter(o => o.type === tab);
        if (query?.trim()) {
            const q = query.toLowerCase();
            list = list.filter(o =>
                o.name.toLowerCase().includes(q) ||
                o.orgId.toLowerCase().includes(q)
            );
        }
        return list;
    };

    _toggle = (e) => {
        e.stopPropagation();
        const opening = !this.state.isOpen;
        this.setState({ isOpen: opening, searchQuery: '', activeTab: 'All', page: 0, selectedIndex: -1 });
        if (opening) setTimeout(() => this.searchInputRef?.focus(), 80);
    };

    _select = (org) => {
        if (org.orgId !== this.state.currentOrg?.orgId) {
            const prev = this.state.currentOrg?.orgId;
            if (prev) {
                try { for (const k of [...Object.keys(localStorage)]) { if (k.includes(prev)) localStorage.removeItem(k); } } catch (_) {}
            }
            // Always exit Time Warp when switching org — past data is org-scoped
            if (rewindContext.isActive()) rewindContext.deactivate();
            orgContext.selectOrg(org.orgId, { reload: true });
            return;
        }
        this.setState({ isOpen: false, searchQuery: '', page: 0, selectedIndex: -1 });
    };

    _onKey = (e) => {
        const { isOpen, selectedIndex } = this.state;
        const filtered = this._getFiltered();
        if (!isOpen) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggle(e); } return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ selectedIndex: Math.min(selectedIndex + 1, filtered.length - 1) }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ selectedIndex: Math.max(selectedIndex - 1, 0) }); }
        else if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); this._select(filtered[selectedIndex]); }
        else if (e.key === 'Escape') { e.preventDefault(); this.setState({ isOpen: false, searchQuery: '', page: 0, selectedIndex: -1 }); }
    };

    render() {
        const { currentOrg, availableOrgs, isOpen, searchQuery, activeTab, page, selectedIndex } = this.state;
        const needsSearch = availableOrgs.length > SEARCH_THRESHOLD;
        const filtered    = this._getFiltered(searchQuery, activeTab);
        const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
        const safePage    = Math.min(page, Math.max(0, totalPages - 1));
        const pageItems   = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

        // Compute which type tabs have orgs
        const typeCounts = ALL_TABS.reduce((acc, t) => {
            acc[t] = t === 'All' ? availableOrgs.length : availableOrgs.filter(o => o.type === t).length;
            return acc;
        }, {});
        const visibleTabs = ALL_TABS.filter(t => typeCounts[t] > 0);

        // Single org -- no dropdown
        if (availableOrgs.length <= 1) {
            return html`
                <div class="d-flex align-items-center gap-2" style="color:inherit; opacity:0.85;">
                    <${OrgTypeIcon} type=${currentOrg?.type} size=${18} />
                    <span class="fw-semibold" style="font-size:0.875rem;">${currentOrg?.name || 'Loading...'}</span>
                    ${currentOrg ? html`<${RoleBadge} role=${currentOrg.role} small />` : null}
                </div>
            `;
        }

        return html`
            <div class="dropdown" ref=${el => this.dropdownRef = el}>

                <!-- Trigger button -->
                <button
                    onClick=${this._toggle}
                    onKeyDown=${this._onKey}
                    class="btn btn-primary btn-sm d-flex align-items-center gap-2"
                    style="border-radius:8px; padding:5px 10px; max-width:280px;"
                    aria-expanded=${isOpen}
                    aria-haspopup="listbox"
                >
                    <${OrgTypeIcon} type=${currentOrg?.type} size=${18} color="white" />
                    <span class="text-truncate" style="max-width:160px; font-size:0.875rem;">
                        ${currentOrg?.name || 'Select Organization'}
                    </span>
                    ${currentOrg?.role ? html`<${RoleBadge} role=${currentOrg.role} small />` : null}
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8; flex-shrink:0; transition:transform 0.18s; transform:${isOpen ? 'rotate(180deg)' : 'rotate(0)'}"><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                <!-- Dropdown panel -->
                ${isOpen ? html`
                    <div
                        class="dropdown-menu show org-switcher-panel"
                        style="
                            display:block; min-width:300px; max-width:380px;
                            border-radius:12px; overflow:hidden;
                            box-shadow:0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
                            padding:0; animation:orgDropIn 0.18s cubic-bezier(0.34,1.4,0.64,1);
                        "
                        role="listbox"
                    >
                        <!-- Header: search + type filter tabs -->
                        <div style="padding:10px 10px 0; border-bottom:1px solid var(--tblr-border-color,#e6e7e9);">

                            ${needsSearch ? html`
                                <div style="position:relative; margin-bottom:8px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);opacity:0.45;pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                    <input
                                        ref=${el => this.searchInputRef = el}
                                        type="search"
                                        placeholder="Search organizations..."
                                        value=${searchQuery}
                                        onInput=${e => { this.setState({ searchQuery: e.target.value, page: 0, selectedIndex: 0 }); }}
                                        onKeyDown=${this._onKey}
                                        class="form-control form-control-sm"
                                        style="padding-left:30px; border-radius:7px;"
                                        aria-label="Search organizations"
                                    />
                                </div>
                            ` : null}

                            <!-- Type filter tabs (only tabs with orgs are shown) -->
                            ${visibleTabs.length > 1 ? html`
                                <div style="display:flex; gap:4px; padding-bottom:6px;">
                                    ${visibleTabs.map(tab => {
                                        const active = tab === activeTab;
                                        return html`
                                            <button
                                                key=${tab}
                                                onClick=${e => { e.stopPropagation(); this.setState({ activeTab: tab, page: 0, selectedIndex: -1 }); }}
                                                style="
                                                    flex:1; padding:4px 6px; border-radius:6px; font-size:0.68rem; font-weight:700;
                                                    letter-spacing:0.04em; white-space:nowrap; cursor:pointer;
                                                    border:1.5px solid ${active ? 'var(--tblr-primary,#206bc4)' : 'var(--tblr-border-color,#e2e8f0)'};
                                                    background:${active ? 'var(--tblr-primary,#206bc4)' : 'transparent'};
                                                    color:${active ? '#fff' : 'var(--tblr-muted,#64748b)'};
                                                    transition:all 0.13s;
                                                "
                                            >${tab} ${typeCounts[tab] > 0 && tab !== 'All' ? html`<span style="opacity:0.75;">(${typeCounts[tab]})</span>` : ''}</button>
                                        `;
                                    })}
                                </div>
                                <div class="text-muted" style="font-size:0.65rem; padding:0 2px 6px;">
                                    ${filtered.length} of ${availableOrgs.length} organization${availableOrgs.length !== 1 ? 's' : ''}
                                </div>
                            ` : html`
                                <div style="padding:4px 2px 8px; font-size:0.65rem; font-weight:700; letter-spacing:0.07em; color:var(--tblr-muted,#888); text-transform:uppercase;">Your Organizations</div>
                            `}
                        </div>

                        <!-- Org list -->
                        <div style="max-height:300px; overflow-y:auto; padding:4px 6px 6px;">
                            ${pageItems.length === 0 ? html`
                                <div class="text-center text-muted py-3" style="font-size:0.82rem;">No organizations found</div>
                            ` : pageItems.map((org, idx) => {
                                const globalIdx  = safePage * PAGE_SIZE + idx;
                                const isCurrent  = org.orgId === currentOrg?.orgId;
                                const isKeyboard = globalIdx === selectedIndex;
                                const iconColor  = TYPE_COLOR[org.type] || '#555';
                                const iconBg     = TYPE_BG[org.type]    || 'rgba(100,100,120,0.08)';
                                const seats      = org.totalSeats > 0
                                    ? `${org.deviceCount ?? 0} / ${org.totalSeats} devices`
                                    : null;

                                // Row background: current org gets a distinct blue tint
                                const rowBg = isCurrent
                                    ? 'rgba(32,107,196,0.10)'
                                    : isKeyboard
                                    ? 'var(--tblr-bg-surface-secondary,#f4f6fa)'
                                    : 'transparent';

                                return html`
                                    <button
                                        key=${org.orgId}
                                        onClick=${() => this._select(org)}
                                        style="
                                            display:flex; align-items:center; gap:10px;
                                            width:100%; padding:7px 8px;
                                            border:none; text-align:left; cursor:pointer;
                                            border-radius:8px;
                                            background:${rowBg};
                                            transition:background 0.1s;
                                            ${isCurrent ? 'outline:2px solid rgba(32,107,196,0.20); outline-offset:-1px;' : ''}
                                        "
                                        onMouseEnter=${e => { e.currentTarget.style.background = isCurrent ? 'rgba(32,107,196,0.14)' : 'var(--tblr-bg-surface-secondary,#f4f6fa)'; }}
                                        onMouseLeave=${e => { e.currentTarget.style.background = rowBg; }}
                                        role="option"
                                        aria-selected=${isCurrent}
                                    >
                                        <!-- Type icon bubble -->
                                        <span style="
                                            width:32px; height:32px; border-radius:8px; flex-shrink:0;
                                            display:flex; align-items:center; justify-content:center;
                                            background:${iconBg}; color:${iconColor};
                                        "><${OrgTypeIcon} type=${org.type} size=${17} color=${iconColor} /></span>

                                        <!-- Name + subtitle -->
                                        <span style="flex:1; min-width:0;">
                                            <span style="display:flex; align-items:center; gap:5px;">
                                                <span style="font-weight:${isCurrent ? 700 : 500}; font-size:0.875rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:${isCurrent ? 'var(--tblr-primary,#206bc4)' : 'inherit'};">
                                                    ${org.name}
                                                </span>
                                                ${isCurrent ? html`<span style="font-size:0.6rem; font-weight:700; letter-spacing:0.05em; color:var(--tblr-primary,#206bc4); background:rgba(32,107,196,0.12); border-radius:4px; padding:1px 5px; white-space:nowrap;">ACTIVE</span>` : null}
                                            </span>
                                            ${seats ? html`<span style="display:block; font-size:0.7rem; color:var(--tblr-muted,#888); margin-top:1px;">${seats}</span>` : null}
                                        </span>

                                        <!-- Role badge -->
                                        <span style="flex-shrink:0;">
                                            <${RoleBadge} role=${org.role} small />
                                        </span>
                                    </button>
                                `;
                            })}
                        </div>

                        <!-- Pagination -->
                        ${totalPages > 1 ? html`
                            <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 12px; border-top:1px solid var(--tblr-border-color,#e6e7e9);">
                                <button
                                    onClick=${e => { e.stopPropagation(); if (safePage > 0) this.setState({ page: safePage - 1, selectedIndex: -1 }); }}
                                    disabled=${safePage === 0}
                                    style="background:none; border:none; cursor:${safePage === 0 ? 'not-allowed' : 'pointer'}; opacity:${safePage === 0 ? 0.35 : 1}; font-size:0.75rem; color:var(--tblr-primary,#206bc4); padding:2px 6px;"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                                    Prev
                                </button>
                                <span style="font-size:0.68rem; color:var(--tblr-muted,#888);">Page ${safePage + 1} of ${totalPages}</span>
                                <button
                                    onClick=${e => { e.stopPropagation(); if (safePage < totalPages - 1) this.setState({ page: safePage + 1, selectedIndex: -1 }); }}
                                    disabled=${safePage >= totalPages - 1}
                                    style="background:none; border:none; cursor:${safePage >= totalPages - 1 ? 'not-allowed' : 'pointer'}; opacity:${safePage >= totalPages - 1 ? 0.35 : 1}; font-size:0.75rem; color:var(--tblr-primary,#206bc4); padding:2px 6px;"
                                >
                                    Next
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                </button>
                            </div>
                        ` : html`
                            ${needsSearch ? html`
                                <div style="padding:5px 12px; border-top:1px solid var(--tblr-border-color,#e6e7e9); font-size:0.65rem; color:var(--tblr-muted,#888); text-align:center;">
                                    Up/Down navigate &nbsp;&#xB7;&nbsp; Enter select &nbsp;&#xB7;&nbsp; Esc close
                                </div>
                            ` : null}
                        `}
                    </div>
                ` : null}
            </div>

            <style>
                @keyframes orgDropIn {
                    from { opacity:0; transform:translateY(-8px) scale(0.97); }
                    to   { opacity:1; transform:translateY(0)    scale(1);    }
                }
                .org-switcher-panel .dropdown-menu { border:none; }
            </style>
        `;
    }
}
