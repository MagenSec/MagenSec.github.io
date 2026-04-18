/**
 * Organization Switcher Component
 * Custom dropdown with type icons, role badges, and search for large org lists.
 */

import { orgContext } from '../orgContext.js';

const { html, Component } = window;

// ── Type icons (Tabler SVG, 18×18, stroke-based) ─────────────────────────────
const ICONS = {
    Personal: html`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>`,
    Business: html`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>`,
    Education: html`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 6 3 6 3s6-1 6-3v-5"/></svg>`,
};
const DEFAULT_ICON = ICONS.Business;

// ── Role badge colours ────────────────────────────────────────────────────────
function roleBadge(role) {
    const map = {
        Owner:     { label: 'Owner',    cls: 'bg-blue'   },
        SiteAdmin: { label: 'Admin',    cls: 'bg-purple' },
        ReadWrite: { label: 'Co-Admin', cls: 'bg-green'  },
        ReadOnly:  { label: 'Auditor',  cls: 'bg-yellow' },
        Admin:     { label: 'Owner',    cls: 'bg-blue'   },
    };
    const { label, cls } = map[role] || { label: role, cls: 'bg-secondary' };
    return html`<span class="badge ${cls} text-white" style="font-size:0.62rem; letter-spacing:0.04em; padding:2px 6px;">${label}</span>`;
}

// ── Org list item ─────────────────────────────────────────────────────────────
function OrgItem({ org, isCurrent, onSelect }) {
    const icon = ICONS[org.type] || DEFAULT_ICON;
    const seats = org.totalSeats > 0 ? `${org.deviceCount ?? 0} / ${org.totalSeats} devices` : null;
    return html`
        <button
            onClick=${() => onSelect(org.orgId)}
            style="
                display:flex; align-items:center; gap:10px;
                width:100%; padding:8px 12px;
                border:none; background:none; text-align:left; cursor:pointer;
                border-radius:6px;
                background: ${isCurrent ? 'rgba(var(--tblr-primary-rgb, 32,107,196),0.1)' : 'transparent'};
                transition: background 0.12s;
            "
            onMouseEnter=${e => { if (!isCurrent) e.currentTarget.style.background = 'var(--tblr-bg-surface-secondary, #f4f6fa)'; }}
            onMouseLeave=${e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
        >
            <!-- Type icon -->
            <span style="
                width:32px; height:32px; border-radius:8px; flex-shrink:0;
                display:flex; align-items:center; justify-content:center;
                background: ${org.type === 'Personal' ? 'rgba(32,107,196,0.12)' : org.type === 'Education' ? 'rgba(47,179,68,0.12)' : 'rgba(100,100,120,0.1)'};
                color: ${org.type === 'Personal' ? '#2066c4' : org.type === 'Education' ? '#2fb344' : '#666'};
            ">${icon}</span>

            <!-- Name + seats -->
            <span style="flex:1; min-width:0;">
                <span style="display:block; font-weight:${isCurrent ? 700 : 500}; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${org.name}</span>
                ${seats ? html`<span style="display:block; font-size:0.72rem; color:var(--tblr-muted, #888); margin-top:1px;">${seats}</span>` : null}
            </span>

            <!-- Role badge + current checkmark -->
            <span style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                ${roleBadge(org.role)}
                ${isCurrent ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2066c4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : null}
            </span>
        </button>
    `;
}

// ── Main component ────────────────────────────────────────────────────────────
export class OrgSwitcher extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentOrg:    orgContext.getCurrentOrg(),
            availableOrgs: orgContext.getAvailableOrgs(),
            open:          false,
            query:         '',
        };
        this.unsubscribe  = null;
        this.wrapperRef   = null;
        this._onOutside   = this._onOutside.bind(this);
    }

    componentDidMount() {
        this.unsubscribe = orgContext.onChange(() => {
            this.setState({
                currentOrg:    orgContext.getCurrentOrg(),
                availableOrgs: orgContext.getAvailableOrgs(),
            });
        });
        const orgs = orgContext.getAvailableOrgs();
        if (orgs.length > 0) this.setState({ availableOrgs: orgs, currentOrg: orgContext.getCurrentOrg() });
        document.addEventListener('click', this._onOutside, true);
    }

    componentWillUnmount() {
        if (this.unsubscribe) this.unsubscribe();
        document.removeEventListener('click', this._onOutside, true);
    }

    _onOutside(e) {
        if (this.state.open && this.wrapperRef && !this.wrapperRef.contains(e.target)) {
            this.setState({ open: false, query: '' });
        }
    }

    _select(orgId) {
        orgContext.selectOrg(orgId);
        this.setState({ open: false, query: '' });
        if (this.props.onOrgChange) this.props.onOrgChange(orgId);
    }

    render() {
        const { currentOrg, availableOrgs, open, query } = this.state;
        const SEARCH_THRESHOLD = 6;
        const needsSearch = availableOrgs.length > SEARCH_THRESHOLD;

        const filtered = query.trim()
            ? availableOrgs.filter(o => o.name.toLowerCase().includes(query.toLowerCase()) || o.orgId.toLowerCase().includes(query.toLowerCase()))
            : availableOrgs;

        const currentIcon = ICONS[currentOrg?.type] || DEFAULT_ICON;
        const displayName = currentOrg?.name || (availableOrgs[0]?.name) || 'Loading…';

        return html`
            <div ref=${el => this.wrapperRef = el} style="position:relative; display:inline-flex; align-items:center;">

                <!-- ── Trigger button ── -->
                <button
                    onClick=${() => this.setState({ open: !open, query: '' })}
                    aria-haspopup="listbox"
                    aria-expanded=${open}
                    style="
                        display:flex; align-items:center; gap:7px;
                        background: rgba(255,255,255,0.12);
                        border: 1.5px solid rgba(255,255,255,0.22);
                        border-radius: 10px;
                        color: inherit;
                        padding: 5px 10px 5px 8px;
                        cursor: pointer;
                        font-size: 0.875rem;
                        font-weight: 600;
                        max-width: 260px;
                        transition: background 0.15s, border-color 0.15s;
                        white-space: nowrap;
                        ${open ? 'background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.4);' : ''}
                    "
                    onMouseEnter=${e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                    onMouseLeave=${e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                >
                    <!-- Type icon -->
                    <span style="opacity:0.85; display:flex; align-items:center; flex-shrink:0;">${currentIcon}</span>

                    <!-- Org name -->
                    <span style="overflow:hidden; text-overflow:ellipsis; max-width:160px;">${displayName}</span>

                    <!-- Role badge -->
                    ${currentOrg ? roleBadge(currentOrg.role) : null}

                    <!-- Chevron -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7; flex-shrink:0; transition:transform 0.18s; transform:${open ? 'rotate(180deg)' : 'rotate(0)'}"><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                <!-- ── Dropdown panel ── -->
                ${open ? html`
                    <div
                        role="listbox"
                        style="
                            position:absolute; top:calc(100% + 6px); left:0;
                            min-width:280px; max-width:340px;
                            background:var(--tblr-bg-surface, #fff);
                            border:1px solid var(--tblr-border-color, #e6e7e9);
                            border-radius:12px;
                            box-shadow:0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
                            z-index:1085;
                            overflow:hidden;
                            animation:orgDropIn 0.18s cubic-bezier(0.34,1.4,0.64,1);
                        "
                    >
                        ${needsSearch ? html`
                            <div style="padding:10px 10px 6px;">
                                <div style="position:relative;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute; left:9px; top:50%; transform:translateY(-50%); opacity:0.45;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                    <input
                                        type="search"
                                        placeholder="Search organizations…"
                                        value=${query}
                                        onInput=${e => this.setState({ query: e.target.value })}
                                        autoFocus
                                        style="
                                            width:100%; padding:6px 10px 6px 30px;
                                            border:1px solid var(--tblr-border-color, #e6e7e9);
                                            border-radius:7px;
                                            font-size:0.82rem;
                                            outline:none;
                                            background:var(--tblr-bg-surface-secondary, #f4f6fa);
                                            color:inherit;
                                        "
                                    />
                                </div>
                            </div>
                        ` : html`<div style="padding:8px 12px 4px; font-size:0.68rem; font-weight:700; letter-spacing:0.07em; color:var(--tblr-muted,#888); text-transform:uppercase;">Your Organizations</div>`}

                        <div style="max-height:${needsSearch ? '260px' : '320px'}; overflow-y:auto; padding:4px 6px 8px;">
                            ${filtered.length === 0
                                ? html`<div style="padding:16px; text-align:center; color:var(--tblr-muted,#888); font-size:0.82rem;">No organizations found</div>`
                                : filtered.map(org => html`<${OrgItem}
                                    key=${org.orgId}
                                    org=${org}
                                    isCurrent=${org.orgId === currentOrg?.orgId}
                                    onSelect=${id => this._select(id)}
                                />`)}
                        </div>
                    </div>
                ` : null}
            </div>

            <style>
                @keyframes orgDropIn {
                    from { opacity:0; transform:translateY(-8px) scale(0.97); }
                    to   { opacity:1; transform:translateY(0)    scale(1);    }
                }
            </style>
        `;
    }
}
