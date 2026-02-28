/**
 * Software Inventory Page — 3-tab comprehensive view
 *
 * Tabs:
 *   1. All Software   — full catalogue with search, risk badge, freeware flag
 *   2. At Risk        — apps with CVEs, sorted by risk, expanded CVE details
 *   3. License Tracking — inline license management (add / edit / remove)
 *
 * Data sources:
 *   • api.getSoftwareInventory(orgId)  → {apps[{name,version,vendor,deviceCount,cveCount,riskScore,status,isFreeware,cves[]}]}
 *   • api.getAppLicenses(orgId)        → {licenses[{appKey,licenseType,expiryDate,notes,updatedAt,updatedBy}]}
 *
 * Caching: SWR (Stale-While-Revalidate) pattern using localStorage
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

// ─── constants ──────────────────────────────────────────────────────────────

const RISK_ORDER = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const RISK_BADGE = {
    Critical: 'bg-danger text-white',
    High:     'bg-warning text-white',
    Medium:   'bg-info text-white',
    Low:      'bg-success text-white',
};

const LICENSE_TYPES = ['Commercial', 'Open Source', 'Freeware', 'Trial', 'Subscription', 'Enterprise', 'OEM', 'Unknown'];

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconRefresh = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/>
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>
    </svg>`;

const IconSearch = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/>
        <path d="M21 21l-6 -6"/>
    </svg>`;

const IconPackage = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/>
        <line x1="12" y1="12" x2="20" y2="7.5"/>
        <line x1="12" y1="12" x2="12" y2="21"/>
        <line x1="12" y1="12" x2="4" y2="7.5"/>
    </svg>`;

const IconShieldOff = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/>
        <line x1="3" y1="3" x2="21" y2="21"/>
    </svg>`;

const IconLicense = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <polyline points="3 10 21 10"/>
        <line x1="7" y1="15" x2="7" y2="15.01"/>
        <line x1="11" y1="15" x2="13" y2="15"/>
    </svg>`;

// ─── main component ──────────────────────────────────────────────────────────

export class SoftwareInventoryPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            apps: [],
            licenses: {},          // keyed by appKey
            loading: true,
            error: null,
            activeTab: 'all',      // 'all' | 'atrisk' | 'licenses'
            searchQuery: '',
            sortCol: 'deviceCount',
            sortDir: 'desc',
            isRefreshing: false,
            // License editing state
            editingKey: null,      // appKey currently being edited
            editForm: {},          // { licenseType, expiryDate, notes }
            savingKey: null,       // appKey currently being saved
            saveError: null,
        };
        this._unsubOrg = null;
    }

    // ─── lifecycle ───────────────────────────────────────────────────────────

    async componentDidMount() {
        this._unsubOrg = orgContext.onChange(() => this.loadData(true));
        await this.loadData();
    }

    componentWillUnmount() {
        if (this._unsubOrg) this._unsubOrg();
    }

    // ─── caching helpers ─────────────────────────────────────────────────────

    _readCache(key, ttlMin = 15) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            const stale = (Date.now() - ts) >= ttlMin * 60_000;
            return { data, stale };
        } catch { return null; }
    }

    _writeCache(key, data) {
        try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore quota */ }
    }

    // ─── data loading ────────────────────────────────────────────────────────

    async loadData(forceRefresh = false) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ error: 'No organisation selected', loading: false });
            return;
        }

        const cacheKey = `sw_inventory_${orgId}`;

        // Step 1 — serve from cache immediately (SWR pattern)
        if (!forceRefresh) {
            const cached = this._readCache(cacheKey);
            if (cached) {
                this.setState({
                    apps: cached.data.apps || [],
                    licenses: cached.data.licenses || {},
                    loading: false,
                    isRefreshing: cached.stale,
                    error: null,
                });
                if (!cached.stale) return;   // fresh — no background fetch needed
            }
        }

        if (!this.state.apps.length) this.setState({ loading: true, error: null });

        try {
            // Step 2 — parallel fetch both endpoints
            const [invRes, licRes] = await Promise.all([
                api.getSoftwareInventory(orgId),
                api.getAppLicenses(orgId),
            ]);

            const apps = invRes?.data?.apps ?? invRes?.data ?? [];
            const licenseArr = licRes?.data?.licenses ?? licRes?.data ?? [];

            // Convert license array to map keyed by appKey for O(1) lookup
            const licenses = {};
            for (const lic of licenseArr) {
                if (lic.appKey) licenses[lic.appKey] = lic;
            }

            const payload = { apps, licenses };
            this._writeCache(cacheKey, payload);

            this.setState({ apps, licenses, loading: false, isRefreshing: false, error: null });
        } catch (err) {
            console.error('[SoftwareInventory] loadData failed:', err);
            if (!this.state.apps.length) {
                this.setState({ error: err.message || 'Failed to load inventory', loading: false, isRefreshing: false });
            } else {
                this.setState({ isRefreshing: false });
            }
        }
    }

    // ─── derived data helpers ────────────────────────────────────────────────

    _filteredApps() {
        const q = this.state.searchQuery.trim().toLowerCase();
        let list = this.state.apps;

        if (q) {
            list = list.filter(a =>
                (a.name  || '').toLowerCase().includes(q) ||
                (a.vendor|| '').toLowerCase().includes(q) ||
                (a.version||'').toLowerCase().includes(q)
            );
        }

        const { sortCol, sortDir } = this.state;
        list = [...list].sort((a, b) => {
            let av = a[sortCol] ?? '';
            let bv = b[sortCol] ?? '';
            if (sortCol === 'riskScore') {
                av = RISK_ORDER[a.riskScore] ?? 0;
                bv = RISK_ORDER[b.riskScore] ?? 0;
            }
            if (typeof av === 'string') av = av.toLowerCase();
            if (typeof bv === 'string') bv = bv.toLowerCase();
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return list;
    }

    _atRiskApps() {
        return this.state.apps
            .filter(a => (a.cveCount || 0) > 0)
            .sort((a, b) => (RISK_ORDER[b.riskScore] ?? 0) - (RISK_ORDER[a.riskScore] ?? 0));
    }

    _kpis() {
        const { apps, licenses } = this.state;
        const total    = apps.length;
        const vuln     = apps.filter(a => (a.cveCount || 0) > 0).length;
        const freeware = apps.filter(a => a.isFreeware).length;
        const licensed = Object.keys(licenses).length;
        const unlicensed = apps.filter(a => !licenses[encodeURIComponent(a.name || '')]).length;
        return { total, vuln, freeware, licensed, unlicensed };
    }

    _appKey(app) { return encodeURIComponent(app.name || ''); }

    // ─── sort helpers ────────────────────────────────────────────────────────

    _sort(col) {
        const { sortCol, sortDir } = this.state;
        this.setState({
            sortCol: col,
            sortDir: (sortCol === col && sortDir === 'desc') ? 'asc' : 'desc',
        });
    }

    _sortIcon(col) {
        if (this.state.sortCol !== col) return html`<span class="text-muted ms-1" style="opacity:.35">↕</span>`;
        return html`<span class="text-primary ms-1">${this.state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
    }

    // ─── license editing ─────────────────────────────────────────────────────

    _startEdit(app) {
        const key = this._appKey(app);
        const existing = this.state.licenses[key] || {};
        this.setState({
            editingKey: key,
            saveError: null,
            editForm: {
                licenseType: existing.licenseType || 'Unknown',
                expiryDate:  existing.expiryDate ? existing.expiryDate.split('T')[0] : '',
                notes:       existing.notes || '',
            },
        });
    }

    _cancelEdit() { this.setState({ editingKey: null }); }

    async _saveEdit(app) {
        const key = this._appKey(app);
        const { editForm } = this.state;
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;

        this.setState({ savingKey: key, saveError: null });
        try {
            const payload = {
                licenseType: editForm.licenseType,
                expiryDate:  editForm.expiryDate ? new Date(editForm.expiryDate).toISOString() : null,
                notes:       editForm.notes || null,
            };
            const res = await api.setAppLicense(org.orgId, app.name, payload);
            if (!res?.success) throw new Error(res?.message || 'Failed to save');

            // Merge updated license into local state
            const licenses = { ...this.state.licenses, [key]: { appKey: key, ...payload, updatedAt: new Date().toISOString() } };
            this._writeCache(`sw_inventory_${org.orgId}`, { apps: this.state.apps, licenses });
            this.setState({ licenses, editingKey: null, savingKey: null });
        } catch (err) {
            this.setState({ savingKey: null, saveError: err.message });
        }
    }

    async _deleteLicense(app) {
        const key = this._appKey(app);
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        if (!confirm(`Remove license record for "${app.name}"?`)) return;

        try {
            await api.deleteAppLicense(org.orgId, app.name);
            const licenses = { ...this.state.licenses };
            delete licenses[key];
            this.setState({ licenses });
        } catch (err) {
            alert(`Delete failed: ${err.message}`);
        }
    }

    // ─── render helpers ──────────────────────────────────────────────────────

    _renderKpiStrip(kpis) {
        const cards = [
            { label: 'Total Apps',      value: kpis.total,      cls: 'text-blue',    bgCls: 'bg-blue-lt' },
            { label: 'Vulnerable',      value: kpis.vuln,       cls: 'text-danger',  bgCls: 'bg-danger-lt' },
            { label: 'Freeware',        value: kpis.freeware,   cls: 'text-success', bgCls: 'bg-success-lt' },
            { label: 'Licensed',        value: kpis.licensed,   cls: 'text-purple',  bgCls: 'bg-purple-lt' },
            { label: 'Unlicensed',      value: kpis.unlicensed, cls: 'text-orange',  bgCls: 'bg-orange-lt' },
        ];

        return html`
            <div class="row row-cards mb-3">
                ${cards.map(c => html`
                    <div class="col-6 col-sm-4 col-lg">
                        <div class="card card-sm">
                            <div class="card-body d-flex align-items-center gap-3">
                                <span class="avatar avatar-rounded ${c.bgCls} ${c.cls}" style="width:2.5rem;height:2.5rem;font-size:1rem;font-weight:700;">
                                    ${c.value}
                                </span>
                                <div>
                                    <div class="fw-medium">${c.label}</div>
                                    <div class="text-muted small">apps</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `)}
            </div>`;
    }

    _renderRiskBadge(score) {
        const cls = RISK_BADGE[score] || 'bg-secondary text-white';
        return html`<span class="badge ${cls}">${score || 'N/A'}</span>`;
    }

    _renderSeverityBadge(sev) {
        const map = { Critical: 'bg-danger text-white', High: 'bg-warning text-white', Medium: 'bg-info text-white', Low: 'bg-success text-white' };
        const cls = map[sev] || 'bg-secondary text-white';
        return html`<span class="badge ${cls}">${sev}</span>`;
    }

    _renderSortTh(label, col, extra = '') {
        return html`
            <th style="cursor:pointer;white-space:nowrap;${extra}" onClick=${() => this._sort(col)}>
                ${label} ${this._sortIcon(col)}
            </th>`;
    }

    // ─── All Software tab ────────────────────────────────────────────────────

    _renderAllTab() {
        const filtered = this._filteredApps();

        return html`
            <div class="card">
                <div class="card-body border-bottom py-3">
                    <div class="input-group">
                        <span class="input-group-text"><${IconSearch} /></span>
                        <input type="text" class="form-control"
                               placeholder="Search by name, vendor or version…"
                               value=${this.state.searchQuery}
                               onInput=${e => this.setState({ searchQuery: e.target.value })} />
                        ${this.state.searchQuery && html`
                            <button class="btn btn-outline-secondary" type="button"
                                    onClick=${() => this.setState({ searchQuery: '' })}>✕</button>
                        `}
                    </div>
                </div>

                ${filtered.length === 0 ? html`
                    <div class="empty py-5">
                        <div class="empty-icon text-muted"><${IconPackage} /></div>
                        <p class="empty-title">No applications found</p>
                        <p class="empty-subtitle text-muted">
                            ${this.state.searchQuery ? `No results for "${this.state.searchQuery}"` : 'No apps reported yet'}
                        </p>
                    </div>
                ` : html`
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table table-hover">
                            <thead>
                                <tr>
                                    ${this._renderSortTh('Name',     'name',        'min-width:200px')}
                                    ${this._renderSortTh('Vendor',   'vendor')}
                                    ${this._renderSortTh('Version',  'version')}
                                    ${this._renderSortTh('Devices',  'deviceCount')}
                                    ${this._renderSortTh('Risk',     'riskScore')}
                                    ${this._renderSortTh('CVEs',     'cveCount')}
                                    <th>Flags</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.map(app => html`
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <span class="avatar avatar-sm bg-blue-lt text-blue">
                                                    ${(app.name || '?')[0].toUpperCase()}
                                                </span>
                                                <span class="fw-medium text-reset">${app.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td class="text-muted">${app.vendor || '—'}</td>
                                        <td>
                                            <code class="text-muted small">${app.version || '—'}</code>
                                            ${app.updatedFromVersion ? html`
                                                <div class="text-success small">↑ from ${app.updatedFromVersion}</div>
                                            ` : ''}
                                        </td>
                                        <td class="text-center">${app.deviceCount ?? 0}</td>
                                        <td>${this._renderRiskBadge(app.riskScore)}</td>
                                        <td class="text-center">
                                            ${(app.cveCount || 0) > 0
                                                ? html`<span class="badge bg-danger text-white">${app.cveCount}</span>`
                                                : html`<span class="text-muted">—</span>`}
                                        </td>
                                        <td>
                                            ${app.isFreeware ? html`
                                                <span class="badge bg-success-lt text-success me-1" title="Free / Open Source">Free</span>
                                            ` : ''}
                                        </td>
                                        <td>
                                            ${app.status ? html`
                                                <span class="badge bg-secondary-lt text-secondary">${app.status}</span>
                                            ` : html`<span class="text-muted">—</span>`}
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                    <div class="card-footer d-flex align-items-center">
                        <p class="m-0 text-muted small">
                            Showing <strong>${filtered.length}</strong> of <strong>${this.state.apps.length}</strong> applications
                        </p>
                    </div>
                `}
            </div>`;
    }

    // ─── At Risk tab ─────────────────────────────────────────────────────────

    _renderAtRiskTab() {
        const atRisk = this._atRiskApps();

        if (atRisk.length === 0) {
            return html`
                <div class="card">
                    <div class="empty py-5">
                        <div class="empty-icon text-success"><${IconShieldOff} /></div>
                        <p class="empty-title text-success">No vulnerable applications</p>
                        <p class="empty-subtitle text-muted">All installed applications are clean — no CVEs detected.</p>
                    </div>
                </div>`;
        }

        return html`
            <div class="row row-cards">
                ${atRisk.map(app => html`
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <div class="d-flex align-items-center gap-3 w-100">
                                    <span class="avatar bg-danger-lt text-danger">
                                        ${(app.name || '?')[0].toUpperCase()}
                                    </span>
                                    <div class="flex-fill">
                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                            <h4 class="card-title mb-0">${app.name}</h4>
                                            ${this._renderRiskBadge(app.riskScore)}
                                            ${app.isFreeware ? html`<span class="badge bg-success-lt text-success">Free</span>` : ''}
                                        </div>
                                        <div class="text-muted small mt-1">
                                            ${app.vendor || 'Unknown vendor'} · v${app.version || 'N/A'} · ${app.deviceCount ?? 0} device${(app.deviceCount ?? 0) !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                    <div class="ms-auto">
                                        <span class="badge bg-danger text-white">${app.cveCount} CVE${app.cveCount !== 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            </div>

                            ${app.cves && app.cves.length > 0 ? html`
                                <div class="table-responsive">
                                    <table class="table table-sm table-vcenter mb-0">
                                        <thead class="bg-light">
                                            <tr>
                                                <th>CVE ID</th>
                                                <th>Severity</th>
                                                <th>CVSS Score</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${app.cves.map(cve => html`
                                                <tr>
                                                    <td>
                                                        <a href="#!/cves?cveId=${encodeURIComponent(cve.id)}" class="fw-medium">
                                                            ${cve.id}
                                                        </a>
                                                    </td>
                                                    <td>${this._renderSeverityBadge(cve.severity)}</td>
                                                    <td>
                                                        <span class="fw-medium">${(cve.score || 0).toFixed(1)}</span>
                                                        <div class="progress progress-sm mt-1" style="width:80px">
                                                            <div class="progress-bar ${cve.score >= 9 ? 'bg-danger' : cve.score >= 7 ? 'bg-warning' : cve.score >= 4 ? 'bg-info' : 'bg-success'}"
                                                                 style="width:${Math.min(100, (cve.score / 10) * 100).toFixed(0)}%">
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `)}
                                        </tbody>
                                    </table>
                                </div>
                            ` : html`
                                <div class="card-body text-muted small">
                                    CVE details not yet enriched for this application.
                                </div>
                            `}
                        </div>
                    </div>
                `)}
            </div>`;
    }

    // ─── License Tracking tab ────────────────────────────────────────────────

    _renderLicenseTab() {
        const { apps, licenses, editingKey, editForm, savingKey, saveError } = this.state;

        if (apps.length === 0) {
            return html`
                <div class="card">
                    <div class="empty py-5">
                        <div class="empty-icon text-muted"><${IconLicense} /></div>
                        <p class="empty-title">No applications loaded</p>
                        <p class="empty-subtitle text-muted">Load the inventory first by refreshing the page.</p>
                    </div>
                </div>`;
        }

        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">License Registry</h3>
                    <div class="card-options text-muted small">
                        ${Object.keys(licenses).length} of ${apps.length} applications tracked
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table">
                        <thead>
                            <tr>
                                <th style="min-width:200px">Application</th>
                                <th>Vendor</th>
                                <th>License Type</th>
                                <th>Expires</th>
                                <th>Notes</th>
                                <th>Last Updated</th>
                                <th class="w-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${apps.map(app => {
                                const key  = this._appKey(app);
                                const lic  = licenses[key];
                                const isEditing = editingKey === key;

                                if (isEditing) {
                                    return html`
                                        <tr class="table-active">
                                            <td>
                                                <div class="d-flex align-items-center gap-2">
                                                    <span class="avatar avatar-sm bg-purple-lt text-purple">
                                                        ${(app.name || '?')[0].toUpperCase()}
                                                    </span>
                                                    <span class="fw-medium">${app.name}</span>
                                                </div>
                                            </td>
                                            <td class="text-muted">${app.vendor || '—'}</td>
                                            <td>
                                                <select class="form-select form-select-sm"
                                                        style="min-width:130px"
                                                        value=${editForm.licenseType}
                                                        onChange=${e => this.setState({ editForm: { ...editForm, licenseType: e.target.value } })}>
                                                    ${LICENSE_TYPES.map(t => html`
                                                        <option value=${t} selected=${editForm.licenseType === t}>${t}</option>
                                                    `)}
                                                </select>
                                            </td>
                                            <td>
                                                <input type="date" class="form-control form-control-sm"
                                                       style="min-width:140px"
                                                       value=${editForm.expiryDate}
                                                       onChange=${e => this.setState({ editForm: { ...editForm, expiryDate: e.target.value } })} />
                                            </td>
                                            <td colspan="2">
                                                <input type="text" class="form-control form-control-sm"
                                                       placeholder="Optional notes…"
                                                       value=${editForm.notes}
                                                       onInput=${e => this.setState({ editForm: { ...editForm, notes: e.target.value } })} />
                                                ${saveError ? html`<div class="text-danger small mt-1">${saveError}</div>` : ''}
                                            </td>
                                            <td class="text-end" style="white-space:nowrap">
                                                <button class="btn btn-sm btn-primary me-1"
                                                        disabled=${savingKey === key}
                                                        onClick=${() => this._saveEdit(app)}>
                                                    ${savingKey === key
                                                        ? html`<span class="spinner-border spinner-border-sm me-1"></span>Saving…`
                                                        : 'Save'}
                                                </button>
                                                <button class="btn btn-sm btn-ghost-secondary"
                                                        onClick=${() => this._cancelEdit()}>Cancel</button>
                                            </td>
                                        </tr>`;
                                }

                                return html`
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <span class="avatar avatar-sm ${lic ? 'bg-purple-lt text-purple' : 'bg-secondary-lt text-secondary'}">
                                                    ${(app.name || '?')[0].toUpperCase()}
                                                </span>
                                                <div>
                                                    <span class="fw-medium">${app.name}</span>
                                                    ${app.isFreeware ? html`
                                                        <span class="badge bg-success-lt text-success ms-1 small">Free</span>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </td>
                                        <td class="text-muted">${app.vendor || '—'}</td>
                                        <td>
                                            ${lic
                                                ? html`<span class="badge bg-purple-lt text-purple">${lic.licenseType}</span>`
                                                : html`<span class="text-muted fst-italic small">Not tracked</span>`}
                                        </td>
                                        <td>
                                            ${lic?.expiryDate
                                                ? (() => {
                                                    const d = new Date(lic.expiryDate);
                                                    const daysLeft = Math.ceil((d - Date.now()) / 86_400_000);
                                                    const cls = daysLeft < 0 ? 'text-danger' : daysLeft < 30 ? 'text-warning' : 'text-muted';
                                                    return html`<span class="${cls}">${d.toLocaleDateString()} ${daysLeft < 0 ? '(expired)' : daysLeft < 30 ? `(${daysLeft}d left)` : ''}</span>`;
                                                  })()
                                                : html`<span class="text-muted">—</span>`}
                                        </td>
                                        <td class="text-muted small" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                            ${lic?.notes || '—'}
                                        </td>
                                        <td class="text-muted small">
                                            ${lic?.updatedAt ? new Date(lic.updatedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td class="text-end" style="white-space:nowrap">
                                            <button class="btn btn-sm btn-ghost-primary me-1"
                                                    onClick=${() => this._startEdit(app)}>
                                                ${lic ? 'Edit' : 'Add'}
                                            </button>
                                            ${lic ? html`
                                                <button class="btn btn-sm btn-ghost-danger"
                                                        onClick=${() => this._deleteLicense(app)}>✕</button>
                                            ` : ''}
                                        </td>
                                    </tr>`;
                            })}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    // ─── main render ─────────────────────────────────────────────────────────

    render() {
        const { loading, error, activeTab, apps, isRefreshing } = this.state;

        // Full-screen loading state
        if (loading && !apps.length) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height:60vh;">
                    <div class="text-center">
                        <div class="spinner-border text-primary mb-3"></div>
                        <p class="text-muted">Loading software inventory…</p>
                    </div>
                </div>`;
        }

        // Error state (only if no cached data to fall back on)
        if (error && !apps.length) {
            return html`
                <div class="container-xl mt-4">
                    <div class="alert alert-danger">
                        <h4 class="alert-title">Failed to load inventory</h4>
                        <div class="text-muted">${error}</div>
                        <button class="btn btn-sm btn-danger mt-2" onClick=${() => this.loadData(true)}>Retry</button>
                    </div>
                </div>`;
        }

        const kpis = this._kpis();

        const TABS = [
            { id: 'all',      label: `All Software`,  badge: kpis.total,    badgeCls: 'bg-blue text-white' },
            { id: 'atrisk',   label: `At Risk`,       badge: kpis.vuln,     badgeCls: kpis.vuln > 0 ? 'bg-danger text-white' : 'bg-success text-white' },
            { id: 'licenses', label: `Licenses`,      badge: kpis.licensed, badgeCls: 'bg-purple text-white' },
        ];

        return html`
            <!-- Page header -->
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Software Inventory</h2>
                                ${isRefreshing ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;"></span>
                                        Refreshing…
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle mt-1 text-muted">
                                Installed applications across all managed devices
                            </div>
                        </div>
                        <div class="col-auto d-flex gap-2">
                            <button class="btn btn-secondary" onClick=${() => this.loadData(true)}>
                                <${IconRefresh} /> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <!-- KPI strip -->
                    ${this._renderKpiStrip(kpis)}

                    <!-- Tabs -->
                    <div class="card mb-3">
                        <div class="card-header p-0">
                            <ul class="nav nav-tabs card-header-tabs px-4">
                                ${TABS.map(t => html`
                                    <li class="nav-item">
                                        <a href="#" class="nav-link ${activeTab === t.id ? 'active' : ''} d-flex align-items-center gap-2"
                                           onClick=${e => { e.preventDefault(); this.setState({ activeTab: t.id }); }}>
                                            ${t.label}
                                            <span class="badge ${t.badgeCls} ms-1">${t.badge}</span>
                                        </a>
                                    </li>
                                `)}
                            </ul>
                        </div>
                    </div>

                    <!-- Tab content -->
                    ${activeTab === 'all'      ? this._renderAllTab()     : ''}
                    ${activeTab === 'atrisk'   ? this._renderAtRiskTab()  : ''}
                    ${activeTab === 'licenses' ? this._renderLicenseTab() : ''}
                </div>
            </div>`;
    }
}
