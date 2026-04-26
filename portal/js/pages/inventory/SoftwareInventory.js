/**
 * Software Inventory Page — 3-tab comprehensive view
 *
 * Tabs:
 *   1. All Software   — full catalogue with search, risk badge, freeware flag
 *   2. At Risk        — apps with CVEs, sorted by risk, expanded CVE details
 *   3. License Tracking — inline license management (add / edit / remove)
 *
 * Data sources:
 *   • api.getSoftwareInventory(orgId)  → {apps[{name,version,vendor,deviceCount,devices[],cveCount,riskScore,status,isFreeware,cves[]}]}
 *   • api.getAppLicenses(orgId)        → {licenses[{appKey,licenseType,expiryDate,notes,updatedAt,updatedBy}]}
 *
 * Caching: SWR (Stale-While-Revalidate) pattern using localStorage
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { getEffectiveMaxInputDate } from '../../utils/effectiveDate.js';
import { SegmentedControl } from '../../components/shared/CommonComponents.js';

const { html, Component } = window;

// ─── constants ──────────────────────────────────────────────────────────────

const RISK_ORDER = { Critical: 5, High: 4, Medium: 3, Low: 2, Unknown: 1, None: 0 };

const RISK_BADGE = {
    Critical: 'bg-danger text-white',
    High:     'bg-warning text-white',
    Medium:   'bg-info text-white',
    Low:      'bg-success text-white',
    Unknown:  'bg-secondary text-white',
    None:     'bg-secondary-lt text-secondary',
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
            groupBy: 'application',
            isRefreshing: false,
            expandedGroups: {},
            deepLinkFilter: null,
            // License editing state
            editingKey: null,      // appKey currently being edited
            editForm: {},          // { licenseType, expiryDate, notes }
            savingKey: null,       // appKey currently being saved
            saveError: null,
            detailsAppKey: null,
        };
        this._unsubOrg = null;
        this._rewindUnsub = null;
    }

    // ─── lifecycle ───────────────────────────────────────────────────────────

    async componentDidMount() {
        this._unsubOrg = orgContext.onChange(() => this.loadData(true));
        this._rewindUnsub = rewindContext.onChange(() => this.loadData(true));
        this._hashChangeHandler = () => this.applyDeepLinkFilterFromHash();
        window.addEventListener('hashchange', this._hashChangeHandler);
        this.applyDeepLinkFilterFromHash();
        await this.loadData();
    }

    componentWillUnmount() {
        if (this._unsubOrg) this._unsubOrg();
        if (this._rewindUnsub) this._rewindUnsub();
        if (this._hashChangeHandler) window.removeEventListener('hashchange', this._hashChangeHandler);
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

    parseDeepLinkFilterFromHash() {
        try {
            const hash = window.location.hash || '';
            const query = hash.includes('?') ? hash.split('?')[1] : '';
            const raw = new URLSearchParams(query).get('filter');
            if (!raw) return null;

            const parsed = { raw, apps: [], vendor: '', version: '' };
            raw.split('|').forEach(part => {
                const [key, ...rest] = String(part || '').split(':');
                const value = rest.join(':').trim();
                if (!value) return;
                const normalizedKey = key.trim().toLowerCase();
                if (normalizedKey === 'app') parsed.apps.push(value);
                else if (normalizedKey === 'vendor') parsed.vendor = value;
                else if (normalizedKey === 'version') parsed.version = value;
            });

            return parsed;
        } catch {
            return null;
        }
    }

    applyDeepLinkFilterFromHash() {
        const parsed = this.parseDeepLinkFilterFromHash();
        if (!parsed) return;

        const searchQuery = [parsed.apps[0], parsed.vendor, parsed.version].filter(Boolean).join(' ');
        this.setState(prev => {
            if (prev.deepLinkFilter?.raw === parsed.raw && prev.searchQuery === searchQuery) {
                return null;
            }
            return {
                deepLinkFilter: parsed,
                searchQuery,
                activeTab: 'atrisk'
            };
        });
    }

    // ─── data loading ────────────────────────────────────────────────────────

    async loadData(forceRefresh = false) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ error: 'No organisation selected', loading: false });
            return;
        }

        const rewindDate = api.getEffectiveDate();
        const cacheKey = rewindDate ? `sw_inventory_${orgId}_${rewindDate}` : `sw_inventory_${orgId}`;

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
            // getAppLicenses is a business-only feature; personal orgs return FORBIDDEN
            const isPersonal = orgContext.isIndividualUser();
            const [invRes, licRes] = await Promise.all([
                api.getSoftwareInventory(orgId, rewindDate ? { date: rewindDate } : {}),
                isPersonal ? Promise.resolve(null) : api.getAppLicenses(orgId),
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
        const deepLink = this.state.deepLinkFilter;
        let list = this.state.apps;

        if (deepLink) {
            list = list.filter(a => {
                const appName = a.name || '';
                const vendor = a.vendor || '';
                const version = a.version || '';

                const appMatch = !deepLink.apps.length || deepLink.apps.some(name => appName.toLowerCase().includes(name.toLowerCase()));
                const vendorMatch = !deepLink.vendor || vendor.toLowerCase().includes(deepLink.vendor.toLowerCase());
                const versionMatch = !deepLink.version || version.toLowerCase().includes(deepLink.version.toLowerCase());
                return appMatch && vendorMatch && versionMatch;
            });
        }

        if (q) {
            list = list.filter(a =>
                (a.name  || '').toLowerCase().includes(q) ||
                (a.vendor|| '').toLowerCase().includes(q) ||
                (a.version||'').toLowerCase().includes(q) ||
                (a.devices || []).some(d =>
                    (d.deviceName || '').toLowerCase().includes(q)
                    || (d.deviceId || '').toLowerCase().includes(q)
                )
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
        // "vuln" = app/version rows with at least one CVE. Two further numbers operators
        // care about: how many DISTINCT applications need attention (not just rows) and
        // how many devices that touches.
        const vuln     = apps.filter(a => (a.cveCount || 0) > 0).length;
        const vulnApps = new Set(
            apps.filter(a => (a.cveCount || 0) > 0).map(a => (a.name || '').toLowerCase()).filter(Boolean)
        ).size;
        const vulnDevices = new Set(
            apps.filter(a => (a.cveCount || 0) > 0)
                .flatMap(a => (a.devices || []).map(d => d?.deviceId || d?.deviceName || ''))
                .filter(Boolean)
        ).size;
        const freeware = apps.filter(a => a.isFreeware).length;
        const manuallyTracked = apps.filter(a => !!licenses[this._appKey(a)]).length;
        const licensed = manuallyTracked + freeware; // Freeware is auto-classified
        const unlicensed = Math.max(0, total - licensed);
        const deviceCoverage = new Set(
            apps.flatMap(a => (a.devices || []).map(d => d?.deviceId || d?.deviceName || '').filter(Boolean))
        ).size;
        return { total, vuln, vulnApps, vulnDevices, freeware, licensed, unlicensed, deviceCoverage };
    }

    _appKey(app) { return encodeURIComponent(app.name || ''); }

    _openDetails(app) {
        this.setState({ detailsAppKey: this._appKey(app) });
    }

    _closeDetails() {
        this.setState({ detailsAppKey: null });
    }

    _findAppByKey(appKey) {
        if (!appKey) return null;
        return this.state.apps.find(a => this._appKey(a) === appKey) || null;
    }

    _getVersionBreakdown(appName) {
        const target = (appName || '').toLowerCase();
        const rows = this.state.apps.filter(a => (a.name || '').toLowerCase() === target);
        return rows
            .map(a => ({
                version: a.version || 'Unknown',
                riskScore: a.riskScore || 'Unknown',
                cveCount: a.cveCount || 0,
                devices: Array.isArray(a.devices) ? a.devices : [],
            }))
            .sort((a, b) => (b.devices.length - a.devices.length));
    }

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
            { label: 'App Rows', value: kpis.total, cls: 'text-blue', bgCls: 'bg-blue-lt', hint: 'unique app + version records' },
            {
                label: 'Apps to Patch',
                value: kpis.vulnApps,
                cls: kpis.vulnApps > 0 ? 'text-danger' : 'text-success',
                bgCls: kpis.vulnApps > 0 ? 'bg-danger-lt' : 'bg-success-lt',
                hint: kpis.vulnApps > 0
                    ? `${kpis.vuln} version row${kpis.vuln === 1 ? '' : 's'} \u00b7 ${kpis.vulnDevices} device${kpis.vulnDevices === 1 ? '' : 's'} affected`
                    : 'no apps with open CVEs'
            },
            { label: 'Freeware', value: kpis.freeware, cls: 'text-success', bgCls: 'bg-success-lt', hint: 'clearly identified as free' },
            { label: 'Devices Reached', value: kpis.deviceCoverage, cls: 'text-azure', bgCls: 'bg-azure-lt', hint: 'endpoints represented here' },
        ];

        return html`
            <div class="row row-cards mb-3">
                ${cards.map(c => html`
                    <div class="col-6 col-sm-4 col-lg-3">
                        <div class="card card-sm h-100">
                            <div class="card-body d-flex align-items-center gap-3">
                                <span class="avatar avatar-rounded ${c.bgCls} ${c.cls}" style="width:2.5rem;height:2.5rem;font-size:1rem;font-weight:700;">
                                    ${c.value}
                                </span>
                                <div>
                                    <div class="fw-medium">${c.label}</div>
                                    <div class="text-muted small">${c.hint}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `)}
            </div>
            ${!orgContext.isIndividualUser() ? html`
                <div class="alert alert-info mb-3">
                    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                        <div>
                            <div class="fw-medium">License tracking</div>
                            <div class="text-muted small">
                                ${kpis.licensed} apps classified (${kpis.freeware} auto-detected as freeware, ${kpis.licensed - kpis.freeware} manually reviewed). ${kpis.unlicensed} remaining.
                            </div>
                        </div>
                        <div class="d-flex gap-2 flex-wrap">
                            <span class="badge bg-purple text-white">${kpis.licensed} classified</span>
                            <span class="badge bg-secondary-lt text-secondary">${kpis.unlicensed} unclassified</span>
                        </div>
                    </div>
                </div>
            ` : ''}`;
    }

    _renderRiskBadge(score) {
        const cls = RISK_BADGE[score] || 'bg-secondary text-white';
        return html`<span class="badge ${cls}">${score || 'N/A'}</span>`;
    }

    _renderSeverityBadge(sev) {
        const map = { Critical: 'bg-danger text-white', High: 'bg-warning text-white', Medium: 'bg-info text-white', Low: 'bg-success text-white', Unknown: 'bg-secondary text-white' };
        const cls = map[sev] || 'bg-secondary text-white';
        return html`<span class="badge ${cls}">${sev}</span>`;
    }

    _renderSortTh(label, col, extra = '') {
        return html`
            <th style="cursor:pointer;white-space:nowrap;${extra}" onClick=${() => this._sort(col)}>
                ${label} ${this._sortIcon(col)}
            </th>`;
    }

    _renderDeviceLinks(devices, maxVisible = 3) {
        if (!devices || devices.length === 0) {
            return html`<span class="text-muted small">No device attribution</span>`;
        }

        const visible = devices.slice(0, maxVisible);
        const remaining = Math.max(0, devices.length - visible.length);

        return html`
            <div class="d-flex flex-wrap gap-1">
                ${visible.map(device => html`
                    <a href=${`#!/devices/${device.deviceId}`} class="badge bg-blue-lt text-blue text-decoration-none">
                        ${device.deviceName || device.deviceId}
                    </a>
                `)}
                ${remaining > 0 ? html`<span class="badge bg-secondary-lt text-secondary">+${remaining} more</span>` : ''}
            </div>
        `;
    }

    _renderAppMeta(app, versionMeta) {
        const versionCount = versionMeta?.versions?.length || 1;
        const totalDevices = versionMeta?.totalDevices || (app.deviceCount ?? 0);
        const pct = totalDevices > 0 ? Math.round(((app.deviceCount ?? 0) / totalDevices) * 100) : 0;
        const cveLabel = (app.cveCount || 0) > 0
            ? html`<span class="badge bg-danger-lt text-danger">${app.cveCount} CVE${app.cveCount === 1 ? '' : 's'}</span>`
            : html`<span class="badge bg-success-lt text-success">No CVEs</span>`;

        return html`
            <div class="d-flex flex-wrap gap-1 mt-2">
                ${cveLabel}
                ${app.isFreeware ? html`<span class="badge bg-success-lt text-success">Free</span>` : ''}
                ${app.status ? html`<span class="badge bg-secondary-lt text-secondary">${app.status}</span>` : ''}
                <span class="badge bg-blue-lt text-blue">${pct}% coverage</span>
                ${versionCount > 1 ? html`<span class="badge bg-warning-lt text-warning">${versionCount} versions tracked</span>` : ''}
            </div>
        `;
    }

    _renderAppTableRows(apps, versionMap) {
        return apps.map(app => html`
            <tr class="apps-inventory-row">
                <td>
                    <div class="d-flex align-items-start gap-2">
                        <span class="avatar avatar-sm bg-blue-lt text-blue">
                            ${(app.name || '?')[0].toUpperCase()}
                        </span>
                        <div class="apps-inventory-appcell">
                            <div class="fw-medium text-reset">${app.name || '—'}</div>
                            <div class="text-muted small">${app.vendor || 'Unknown vendor'}</div>
                            ${this._renderAppMeta(app, versionMap[(app.name || '').toLowerCase()])}
                        </div>
                    </div>
                </td>
                <td>
                    <code class="apps-version-code">${app.version || '—'}</code>
                    ${app.updatedFromVersion ? html`
                        <div class="text-success small">↑ from ${app.updatedFromVersion}</div>
                    ` : ''}
                    ${(() => {
                        const vg = versionMap[(app.name || '').toLowerCase()];
                        if (!vg || vg.versions.length <= 1) return html``;
                        const pct = vg.totalDevices > 0 ? Math.round(((app.deviceCount ?? 0) / vg.totalDevices) * 100) : 0;
                        const barColor = app.riskScore === 'Critical' || app.riskScore === 'High' ? 'bg-danger' : app.riskScore === 'Medium' ? 'bg-warning' : 'bg-success';
                        return html`
                            <div class="d-flex align-items-center gap-1 mt-2" style="max-width: 180px;">
                                <div class="progress progress-sm flex-fill" style="height: 4px;" title="${pct}% of devices on v${app.version}">
                                    <div class="progress-bar ${barColor}" style="width: ${pct}%;"></div>
                                </div>
                                <span class="text-muted small">${pct}%</span>
                            </div>
                        `;
                    })()}
                </td>
                <td>
                    <div class="fw-semibold">${app.deviceCount ?? 0} device${(app.deviceCount ?? 0) === 1 ? '' : 's'}</div>
                    <div class="mt-2">${this._renderDeviceLinks(app.devices)}</div>
                </td>
                <td>
                    <div class="d-flex flex-column gap-2 align-items-start">
                        ${this._renderRiskBadge(app.riskScore)}
                        ${(app.cveCount || 0) > 0
                            ? html`<span class="text-danger small fw-medium">${app.cveCount} linked CVE${app.cveCount === 1 ? '' : 's'}</span>`
                            : html`<span class="text-muted small">No linked CVEs</span>`}
                    </div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onClick=${() => this._openDetails(app)}>
                        View
                    </button>
                </td>
            </tr>
        `);
    }

    _groupAppsBy(mode, apps) {
        if (mode === 'application') return [];

        const sections = {};
        if (mode === 'vendor') {
            apps.forEach(app => {
                const key = app.vendor || 'Unknown vendor';
                if (!sections[key]) sections[key] = { key, title: key, subtitle: 'Publisher view', apps: [] };
                sections[key].apps.push(app);
            });
        } else if (mode === 'device') {
            apps.forEach(app => {
                const deviceList = Array.isArray(app.devices) && app.devices.length
                    ? app.devices
                    : [{ deviceId: 'unattributed-device', deviceName: 'Unattributed device' }];

                deviceList.forEach(device => {
                    const key = device.deviceId || device.deviceName || 'unattributed-device';
                    if (!sections[key]) {
                        sections[key] = {
                            key,
                            title: device.deviceName || key,
                            subtitle: device.deviceName && device.deviceId && device.deviceName !== device.deviceId ? device.deviceId : '',
                            apps: []
                        };
                    }
                    sections[key].apps.push({ ...app, deviceCount: 1, devices: [device] });
                });
            });
        }

        return Object.values(sections)
            .map(section => {
                const deviceCount = new Set(
                    section.apps.flatMap(app => (app.devices || []).map(d => d?.deviceId || d?.deviceName || '').filter(Boolean))
                ).size || (mode === 'device' ? 1 : 0);
                const vulnerableCount = section.apps.filter(app => (app.cveCount || 0) > 0).length;
                return {
                    ...section,
                    appCount: section.apps.length,
                    vulnerableCount,
                    deviceCount,
                };
            })
            .sort((a, b) => b.vulnerableCount - a.vulnerableCount || b.appCount - a.appCount || a.title.localeCompare(b.title));
    }

    _collapseId(prefix, ...parts) {
        const slug = parts
            .filter(Boolean)
            .join('-')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
        return `${prefix}-${slug || 'group'}`;
    }

    _toggleGroup(groupKey) {
        this.setState(prev => ({
            expandedGroups: {
                ...prev.expandedGroups,
                [groupKey]: !prev.expandedGroups[groupKey]
            }
        }));
    }

    _renderGroupedInventorySections(sections, versionMap) {
        return html`
            ${sections.map(section => {
                const groupKey = this._collapseId('inventory-group', section.key, section.title);
                const isOpen = !!this.state.expandedGroups[groupKey];
                return html`
                    <div class="card mb-3">
                        <div class="card-header">
                            <button class="btn w-100 text-start border-0 bg-transparent shadow-none p-0"
                                    type="button"
                                    onClick=${() => this._toggleGroup(groupKey)}
                                    aria-expanded=${isOpen ? 'true' : 'false'}>
                                <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap w-100">
                                    <div class="flex-fill">
                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                            <span class="badge bg-blue-lt text-blue">${isOpen ? '−' : '+'}</span>
                                            <h3 class="card-title mb-0">${section.title}</h3>
                                            ${section.subtitle ? html`<span class="text-muted small">${section.subtitle}</span>` : ''}
                                        </div>
                                        <div class="text-muted small mt-1">
                                            ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'} represented
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2 flex-wrap align-items-center justify-content-end">
                                        <span class="badge bg-blue text-white">${section.appCount} rows</span>
                                        <span class="badge ${section.vulnerableCount > 0 ? 'bg-danger text-white' : 'bg-success text-white'}">
                                            ${section.vulnerableCount} at risk
                                        </span>
                                        <span class="badge bg-secondary-lt text-secondary">${isOpen ? 'Collapse' : 'Expand'}</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                        ${isOpen ? html`
                            <div class="table-responsive apps-inventory-table-wrap">
                                <table class="table table-vcenter card-table table-hover apps-inventory-table">
                                    <thead>
                                        <tr>
                                            ${this._renderSortTh('Application', 'name', 'min-width:240px')}
                                            ${this._renderSortTh('Version', 'version', 'min-width:150px')}
                                            ${this._renderSortTh('Devices', 'deviceCount', 'min-width:220px')}
                                            ${this._renderSortTh('Risk', 'riskScore', 'min-width:120px')}
                                            <th class="text-end" style="min-width:90px">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this._renderAppTableRows(section.apps, versionMap)}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                `;
            })}
        `;
    }

    _renderAtRiskCard(app) {
        // Per-card collapse: header is always visible, CVE table renders only on click.
        // Keying on `appKey` (encoded name) keeps state stable across re-renders even when
        // groupBy or sort changes.
        const cardKey = this._collapseId('risk-card', this._appKey(app));
        const isOpen = !!this.state.expandedGroups[cardKey];
        const hasCves = Array.isArray(app.cves) && app.cves.length > 0;
        return html`
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <button class="btn w-100 text-start border-0 bg-transparent shadow-none p-0"
                                type="button"
                                onClick=${() => this._toggleGroup(cardKey)}
                                aria-expanded=${isOpen ? 'true' : 'false'}>
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
                                <div class="ms-auto d-flex align-items-center gap-2">
                                    <span class="badge bg-danger text-white">${app.cveCount} CVE${app.cveCount !== 1 ? 's' : ''}</span>
                                    <span class="badge bg-secondary-lt text-secondary">${isOpen ? 'Collapse' : 'Expand'}</span>
                                </div>
                            </div>
                        </button>
                    </div>

                    ${isOpen ? html`
                        <div class="card-body py-2 border-bottom">
                            <div class="text-muted small mb-1">Affected devices</div>
                            ${this._renderDeviceLinks(app.devices, 12)}
                        </div>
                        ${hasCves ? html`
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
                    ` : ''}
                </div>
            </div>
        `;
    }

    // ─── All Software tab ────────────────────────────────────────────────────

    _renderAllTab() {
        const filtered = this._filteredApps();
        const { groupBy } = this.state;

        // Pre-compute version groups: how many versions exist per app name
        const versionMap = {};
        for (const app of this.state.apps) {
            const key = (app.name || '').toLowerCase();
            if (!versionMap[key]) versionMap[key] = { totalDevices: 0, versions: [] };
            versionMap[key].totalDevices += (app.deviceCount ?? 0);
            versionMap[key].versions.push({ version: app.version, devices: app.deviceCount ?? 0, risk: app.riskScore });
        }

        const groupedSections = this._groupAppsBy(groupBy, filtered);

        return html`
            <div class="card mb-3">
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
                    ${groupBy === 'application' ? html`
                        <div class="table-responsive apps-inventory-table-wrap">
                            <table class="table table-vcenter card-table table-hover apps-inventory-table">
                                <thead>
                                    <tr>
                                        ${this._renderSortTh('Application', 'name', 'min-width:240px')}
                                        ${this._renderSortTh('Version', 'version', 'min-width:150px')}
                                        ${this._renderSortTh('Devices', 'deviceCount', 'min-width:220px')}
                                        ${this._renderSortTh('Risk', 'riskScore', 'min-width:120px')}
                                        <th class="text-end" style="min-width:90px">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this._renderAppTableRows(filtered, versionMap)}
                                </tbody>
                            </table>
                        </div>
                    ` : html`
                        <div class="p-3">
                            ${this._renderGroupedInventorySections(groupedSections, versionMap)}
                        </div>
                    `}
                    <div class="card-footer d-flex align-items-center">
                        <p class="m-0 text-muted small">
                            Showing <strong>${filtered.length}</strong> of <strong>${this.state.apps.length}</strong> applications
                        </p>
                    </div>
                `}
            </div>`;
    }

    _renderDetailsDrawer() {
        const app = this._findAppByKey(this.state.detailsAppKey);
        const open = !!app;
        const versions = app ? this._getVersionBreakdown(app.name) : [];

        return html`
            <div
                class="apps-details-backdrop ${open ? 'show' : ''}"
                onClick=${() => this._closeDetails()}
            ></div>
            <aside class="apps-details-drawer ${open ? 'open' : ''}" aria-hidden=${open ? 'false' : 'true'}>
                ${app ? html`
                    <div class="apps-details-header">
                        <div>
                            <div class="text-muted small">Application details</div>
                            <h3 class="apps-details-title mb-1">${app.name || 'Unknown App'}</h3>
                            <div class="text-muted small">${app.vendor || 'Unknown vendor'}</div>
                        </div>
                        <button class="btn btn-sm btn-ghost-secondary" onClick=${() => this._closeDetails()}>Close</button>
                    </div>

                    <div class="apps-details-kpis">
                        <span class="badge bg-blue text-white">${versions.length} version${versions.length === 1 ? '' : 's'}</span>
                        <span class="badge bg-secondary text-white">
                            ${versions.reduce((sum, v) => sum + v.devices.length, 0)} device${versions.reduce((sum, v) => sum + v.devices.length, 0) === 1 ? '' : 's'}
                        </span>
                        ${this._renderRiskBadge(app.riskScore)}
                    </div>

                    <div class="apps-details-body">
                        ${versions.map(v => html`
                            <section class="card mb-2 apps-version-card">
                                <div class="card-body py-2">
                                    <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                                        <div>
                                            <div class="fw-semibold">v${v.version}</div>
                                            <div class="small text-muted">${v.devices.length} install location${v.devices.length === 1 ? '' : 's'}</div>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            ${this._renderRiskBadge(v.riskScore)}
                                            ${v.cveCount > 0
                                                ? html`<span class="badge bg-danger-lt text-danger">${v.cveCount} CVE${v.cveCount === 1 ? '' : 's'}</span>`
                                                : html`<span class="badge bg-success-lt text-success">No CVEs</span>`}
                                        </div>
                                    </div>
                                    <div class="apps-details-device-list mt-2">
                                        ${v.devices.length > 0
                                            ? v.devices.map(d => html`
                                                <a class="badge bg-blue-lt text-blue text-decoration-none" href=${`#!/devices/${d.deviceId}`}>
                                                    ${d.deviceName || d.deviceId}
                                                </a>
                                            `)
                                            : html`<span class="text-muted small">No device attribution</span>`}
                                    </div>
                                </div>
                            </section>
                        `)}
                    </div>
                ` : ''}
            </aside>
        `;
    }

    // ─── At Risk tab ─────────────────────────────────────────────────────────

    _renderAtRiskTab() {
        const atRisk = this._atRiskApps();
        const { groupBy } = this.state;

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

        if (groupBy === 'application') {
            return html`
                <div class="row row-cards">
                    ${atRisk.map(app => this._renderAtRiskCard(app))}
                </div>`;
        }

        const sections = this._groupAppsBy(groupBy, atRisk);
        return html`
            ${sections.map(section => {
                const groupKey = this._collapseId('risk-group', section.key, section.title);
                const isOpen = !!this.state.expandedGroups[groupKey];
                return html`
                    <div class="card mb-3">
                        <div class="card-header">
                            <button class="btn w-100 text-start border-0 bg-transparent shadow-none p-0"
                                    type="button"
                                    onClick=${() => this._toggleGroup(groupKey)}
                                    aria-expanded=${isOpen ? 'true' : 'false'}>
                                <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap w-100">
                                    <div class="flex-fill">
                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                            <span class="badge bg-danger-lt text-danger">${isOpen ? '−' : '+'}</span>
                                            <h3 class="card-title mb-0">${section.title}</h3>
                                            ${section.subtitle ? html`<span class="text-muted small">${section.subtitle}</span>` : ''}
                                        </div>
                                        <div class="text-muted small mt-1">
                                            ${section.appCount} risky app${section.appCount === 1 ? '' : 's'} · ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'} impacted
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2 flex-wrap align-items-center justify-content-end">
                                        <span class="badge bg-danger text-white">${section.vulnerableCount} CVE-bearing rows</span>
                                        <span class="badge bg-secondary-lt text-secondary">${isOpen ? 'Collapse' : 'Expand'}</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                        ${isOpen ? html`
                            <div class="card-body">
                                <div class="row row-cards">
                                    ${section.apps.map(app => this._renderAtRiskCard(app))}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            })}
        `;
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
                                                : app.isFreeware
                                                    ? html`<span class="badge bg-success-lt text-success">Freeware</span>`
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
                                            ${!orgContext.isReadOnly() ? html`
                                            <button class="btn btn-sm btn-ghost-primary me-1"
                                                    onClick=${() => this._startEdit(app)}>
                                                ${lic ? 'Edit' : 'Add'}
                                            </button>
                                            ${lic ? html`
                                                <button class="btn btn-sm btn-ghost-danger"
                                                        onClick=${() => this._deleteLicense(app)}>✕</button>
                                            ` : ''}
                                            ` : html`<span class="text-muted small" title="Auditors cannot edit licenses">View only</span>`}
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
        const { loading, error, activeTab, apps, isRefreshing, groupBy } = this.state;

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
            // At Risk badge counts DISTINCT apps (matches the dashboard's "apps with known
            // vulnerabilities" tile). The version-row count is shown inside each app card.
            { id: 'atrisk',   label: `At Risk`,       badge: kpis.vulnApps, badgeCls: kpis.vulnApps > 0 ? 'bg-danger text-white' : 'bg-success text-white' },
            ...(!orgContext.isIndividualUser() ? [{ id: 'licenses', label: `Licenses`, badge: kpis.licensed, badgeCls: 'bg-purple text-white' }] : []),
        ];

        return html`
            <!-- Page header -->
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Your Apps</h2>
                                ${isRefreshing ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;"></span>
                                        Refreshing…
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle mt-1 text-muted">
                                Unique app/version rows and device reach across your fleet${rewindContext.isActive() ? html` — as of ${getEffectiveMaxInputDate()}` : ''}
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

                    <!-- Tabs (primary navigation) -->
                    <ul class="nav nav-tabs mb-3">
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

                    <!-- Group-by controls (only for inventory/risk tabs) -->
                    ${activeTab !== 'licenses' ? html`
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <span class="text-muted small fw-medium">Group by</span>
                            <${SegmentedControl}
                                options=${[
                                    { id: 'application', label: 'Application' },
                                    { id: 'vendor', label: 'Vendor' },
                                    { id: 'device', label: 'Device' }
                                ]}
                                value=${groupBy}
                                onChange=${value => this.setState({ groupBy: value })}
                            />
                        </div>
                    ` : ''}

                    <!-- Tab content -->
                    ${activeTab === 'all'      ? this._renderAllTab()     : ''}
                    ${activeTab === 'atrisk'   ? this._renderAtRiskTab()  : ''}
                    ${activeTab === 'licenses' ? this._renderLicenseTab() : ''}
                </div>
            </div>
            ${this._renderDetailsDrawer()}
        `;
    }
}
