/**
 * Inventory Changelog Page - Software install/update/uninstall history
 *
 * Shows change events (Installed / Updated / Uninstalled) from the per-org
 * Inventory changelog rows (RowKey prefix "chg|").
 *
 * SWR caching: 15-minute TTL + background refresh on next visit.
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { SegmentedControl, CollapsibleSectionCard, resolveDeviceLabel } from '../../components/shared/CommonComponents.js';

const { html, Component } = window;

const CHANGE_BADGE = {
    Installed:   'bg-success text-white',
    Updated:     'bg-primary text-white',
    Uninstalled: 'bg-danger text-white',
};

function fmtDateTime(val) {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return '—'; }
}

function fmtDuration(start, end) {
    if (!start || !end) return '';
    try {
        const startDt = new Date(start);
        const endDt = new Date(end);
        const diffMs = Math.max(0, endDt.getTime() - startDt.getTime());
        const days = Math.floor(diffMs / 86_400_000);
        const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
        const mins = Math.floor((diffMs % 3_600_000) / 60_000);

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${Math.max(1, mins)}m`;
    } catch {
        return '';
    }
}

export class InventoryChangelogPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            events: [],
            total: 0,
            deviceFilter: '',
            changeTypeFilter: 'all',
            groupBy: 'application',
            expandedGroups: {},
            searchText: '',
            isRefreshingInBackground: false,
            effectiveNowUtc: null,
        };
        this._orgUnsub = null;
        this._rewindUnsub = null;
    }

    componentDidMount() {
        this._orgUnsub = orgContext.onChange(() => this.loadChangelog(true));
        this._rewindUnsub = rewindContext.onChange(() => this.loadChangelog(true));
        this.loadChangelog();
    }

    componentWillUnmount() {
        if (this._orgUnsub) this._orgUnsub();
        if (this._rewindUnsub) this._rewindUnsub();
    }

    // ── SWR helpers ────────────────────────────────────────────────────────────

    _cacheKey() {
        const org = orgContext.getCurrentOrg();
        const effectiveDate = api.getEffectiveDate?.() || 'current';
        return `inventory_changelog_${org?.orgId || 'default'}_${effectiveDate}`;
    }

    _getCache() {
        try {
            const raw = localStorage.getItem(this._cacheKey());
            if (!raw) return null;
            const { data, timestamp } = JSON.parse(raw);
            const isStale = Date.now() - timestamp >= 15 * 60 * 1000;
            return { data, isStale };
        } catch { return null; }
    }

    _setCache(data) {
        try {
            localStorage.setItem(this._cacheKey(), JSON.stringify({ data, timestamp: Date.now() }));
        } catch { /* storage full */ }
    }

    // ── Data loading ───────────────────────────────────────────────────────────

    async loadChangelog(forceRefresh = false) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        if (!forceRefresh) {
            const cached = this._getCache();
            if (cached) {
                this.setState({
                    events: cached.data.events || [],
                    total: cached.data.total || 0,
                    effectiveNowUtc: cached.data.effectiveNowUtc || null,
                    loading: false,
                    isRefreshingInBackground: true,
                    error: null
                });
                // Fall through for background refresh
            }
        }

        if (!this.state.events.length) {
            this.setState({ loading: true, error: null });
        }

        try {
            const params = { limit: 500 };
            if (this.state.deviceFilter) params.deviceId = this.state.deviceFilter;
            const resp = await api.getInventoryChangelog(orgId, params);

            if (!resp.success) throw new Error(resp.message || 'Failed to load changelog');

            const data = {
                events: resp.data?.events || [],
                total: resp.data?.total || 0,
                effectiveNowUtc: resp.data?.effectiveNowUtc || null,
            };
            this._setCache(data);
            this.setState({
                events: data.events,
                total: data.total,
                effectiveNowUtc: data.effectiveNowUtc,
                loading: false,
                isRefreshingInBackground: false,
                error: null,
            });
        } catch (err) {
            if (!this.state.events.length) {
                this.setState({ error: err.message, loading: false, isRefreshingInBackground: false });
            } else {
                this.setState({ isRefreshingInBackground: false });
            }
        }
    }

    // ── Filtering ─────────────────────────────────────────────────────────────

    getFiltered() {
        const { events, changeTypeFilter, searchText } = this.state;
        const search = searchText.toLowerCase();
        const filtered = events.filter(e => {
            if (changeTypeFilter !== 'all' && e.changeType !== changeTypeFilter) return false;
            if (search && !(
                (e.appName || '').toLowerCase().includes(search) ||
                (e.vendor || '').toLowerCase().includes(search) ||
                (e.deviceName || '').toLowerCase().includes(search) ||
                (e.deviceId || '').toLowerCase().includes(search)
            )) return false;
            return true;
        });

        return this.dedupeChangelogEvents(filtered);
    }

    getUniqueDevices() {
        const map = new Map();
        for (const e of this.state.events) {
            if (!e?.deviceId) continue;
            map.set(e.deviceId, e.deviceName || e.deviceId);
        }
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    }

    dedupeChangelogEvents(events) {
        const deduped = [];
        const seenExact = new Set();
        const activeInstallIndex = new Map();

        for (const event of events) {
            const exactKey = [
                event.changeType || '',
                event.deviceId || '',
                (event.vendor || '').toLowerCase(),
                (event.appName || '').toLowerCase(),
                event.version || '',
                event.nextVersion || event.previousVersion || '',
                event.eventTime || '',
                event.stateUpdatedOn || '',
                event.firstSeen || ''
            ].join('||');

            if (seenExact.has(exactKey)) continue;
            seenExact.add(exactKey);

            if (event.changeType === 'Installed' && !event.stateUpdatedOn) {
                const activeInstallKey = [
                    event.deviceId || '',
                    (event.vendor || '').toLowerCase(),
                    (event.appName || '').toLowerCase(),
                    event.version || ''
                ].join('||');

                if (activeInstallIndex.has(activeInstallKey)) {
                    const idx = activeInstallIndex.get(activeInstallKey);
                    const existing = deduped[idx];
                    const existingFirstSeen = new Date(existing.firstSeen || existing.eventTime || 0).getTime();
                    const candidateFirstSeen = new Date(event.firstSeen || event.eventTime || 0).getTime();
                    if (candidateFirstSeen > 0 && (existingFirstSeen <= 0 || candidateFirstSeen < existingFirstSeen)) {
                        deduped[idx] = { ...existing, firstSeen: event.firstSeen || existing.firstSeen };
                    }
                    continue;
                }

                activeInstallIndex.set(activeInstallKey, deduped.length);
            }

            deduped.push({ ...event });
        }

        const groupedByAppOnDevice = new Map();
        deduped.forEach((event, index) => {
            const groupKey = [
                event.deviceId || '',
                (event.vendor || '').toLowerCase(),
                (event.appName || '').toLowerCase()
            ].join('||');

            if (!groupedByAppOnDevice.has(groupKey)) {
                groupedByAppOnDevice.set(groupKey, []);
            }
            groupedByAppOnDevice.get(groupKey).push(index);
        });

        for (const indices of groupedByAppOnDevice.values()) {
            indices.sort((left, right) => {
                const leftTime = new Date(this._eventMoment(deduped[left]) || 0).getTime();
                const rightTime = new Date(this._eventMoment(deduped[right]) || 0).getTime();
                return leftTime - rightTime;
            });

            let lastActiveVersion = null;
            for (const idx of indices) {
                const event = deduped[idx];
                if (event.changeType === 'Uninstalled') {
                    lastActiveVersion = null;
                    continue;
                }

                if (event.changeType === 'Installed'
                    && lastActiveVersion
                    && event.version
                    && String(lastActiveVersion).toLowerCase() !== String(event.version).toLowerCase()) {
                    deduped[idx] = {
                        ...event,
                        changeType: 'Updated',
                        previousVersion: event.previousVersion || lastActiveVersion
                    };
                }

                if (deduped[idx].changeType === 'Updated') {
                    lastActiveVersion = deduped[idx].nextVersion || deduped[idx].version || lastActiveVersion;
                } else if (deduped[idx].changeType === 'Installed') {
                    lastActiveVersion = deduped[idx].version || lastActiveVersion;
                }
            }
        }

        return deduped;
    }

    _eventMoment(e) {
        return e.eventTime || e.stateUpdatedOn || e.firstSeen || null;
    }

    _dwellEndMoment(e) {
        return e.stateUpdatedOn || this.state.effectiveNowUtc || e.eventTime || e.firstSeen || null;
    }

    getSummaryStats() {
        const filtered = this.getFiltered();
        return {
            installs: filtered.filter(e => e.changeType === 'Installed').length,
            updates: filtered.filter(e => e.changeType === 'Updated').length,
            removals: filtered.filter(e => e.changeType === 'Uninstalled').length,
            devices: new Set(filtered.map(e => e.deviceId).filter(Boolean)).size,
            apps: new Set(filtered.map(e => `${e.vendor || 'Unknown vendor'}|${e.appName || 'Unknown app'}`)).size,
        };
    }

    getRecentActivityStats() {
        const filtered = this.getFiltered();
        const referenceNow = this.state.effectiveNowUtc ? new Date(this.state.effectiveNowUtc) : new Date();
        const referenceMs = referenceNow.getTime();
        const last24hCutoff = referenceMs - 86_400_000;
        const last7dCutoff = referenceMs - (7 * 86_400_000);

        const recent24h = filtered.filter(e => {
            const eventMs = new Date(this._eventMoment(e) || 0).getTime();
            return Number.isFinite(eventMs) && eventMs >= last24hCutoff;
        });
        const recent7d = filtered.filter(e => {
            const eventMs = new Date(this._eventMoment(e) || 0).getTime();
            return Number.isFinite(eventMs) && eventMs >= last7dCutoff;
        });

        return {
            recent24hCount: recent24h.length,
            recent7dCount: recent7d.length,
            recentDevices: new Set(recent7d.map(e => e.deviceId).filter(Boolean)).size,
            recentHighSignalChanges: recent7d.filter(e => e.changeType === 'Updated' || e.changeType === 'Uninstalled').length,
            signalUpdatedAt: this.state.effectiveNowUtc || referenceNow.toISOString(),
        };
    }

    getSortedEvents(events = this.getFiltered()) {
        return [...events].sort((left, right) => {
            const leftTime = new Date(this._eventMoment(left) || 0).getTime();
            const rightTime = new Date(this._eventMoment(right) || 0).getTime();
            return rightTime - leftTime;
        });
    }

    getChangedApps(events = this.getFiltered()) {
        const apps = new Map();
        for (const event of events) {
            const key = `${event.vendor || 'Unknown vendor'}|${event.appName || 'Unknown app'}`;
            if (!apps.has(key)) {
                apps.set(key, {
                    key,
                    vendor: event.vendor || 'Unknown vendor',
                    appName: event.appName || 'Unknown app',
                    installs: 0,
                    updates: 0,
                    removals: 0,
                    devices: new Set(),
                    latest: null,
                });
            }

            const item = apps.get(key);
            if (event.changeType === 'Installed') item.installs += 1;
            else if (event.changeType === 'Updated') item.updates += 1;
            else if (event.changeType === 'Uninstalled') item.removals += 1;
            if (event.deviceId) item.devices.add(event.deviceId);
            const eventTime = this._eventMoment(event);
            if (!item.latest || new Date(eventTime || 0).getTime() > new Date(item.latest || 0).getTime()) {
                item.latest = eventTime;
            }
        }

        return [...apps.values()]
            .map(item => ({ ...item, deviceCount: item.devices.size }))
            .sort((a, b) => {
                const riskRank = (b.removals + b.updates) - (a.removals + a.updates);
                if (riskRank !== 0) return riskRank;
                return new Date(b.latest || 0).getTime() - new Date(a.latest || 0).getTime();
            })
            .slice(0, 8);
    }

    getDeviceRollups(events = this.getFiltered()) {
        const devices = new Map();
        for (const event of events) {
            const key = event.deviceId || 'unknown-device';
            if (!devices.has(key)) {
                devices.set(key, {
                    key,
                    deviceId: event.deviceId || '',
                    deviceName: event.deviceName || event.deviceId || 'Unknown device',
                    installs: 0,
                    updates: 0,
                    removals: 0,
                    apps: new Set(),
                    latest: null,
                });
            }

            const item = devices.get(key);
            if (event.changeType === 'Installed') item.installs += 1;
            else if (event.changeType === 'Updated') item.updates += 1;
            else if (event.changeType === 'Uninstalled') item.removals += 1;
            if (event.appName) item.apps.add(event.appName);
            const eventTime = this._eventMoment(event);
            if (!item.latest || new Date(eventTime || 0).getTime() > new Date(item.latest || 0).getTime()) {
                item.latest = eventTime;
            }
        }

        return [...devices.values()]
            .map(item => ({ ...item, appCount: item.apps.size, total: item.installs + item.updates + item.removals }))
            .sort((a, b) => b.total - a.total || new Date(b.latest || 0).getTime() - new Date(a.latest || 0).getTime())
            .slice(0, 8);
    }

    versionText(event) {
        if (event.changeType === 'Updated') {
            const fromVersion = event.previousVersion || event.version || 'previous build';
            const toVersion = event.nextVersion || event.version || 'current build';
            return `${fromVersion} -> ${toVersion}`;
        }
        return event.version || event.nextVersion || 'version not reported';
    }

    changeMeaning(event) {
        if (event.changeType === 'Uninstalled') return 'Removed from this device; exposure should close if no other active install remains.';
        if (event.changeType === 'Updated') return 'Version changed; verify vulnerable versions were replaced.';
        return 'First observed on this device; inventory baseline expanded.';
    }

    renderChangedApps(apps) {
        return html`
            <div class="card h-100">
                <div class="card-header">
                    <h3 class="card-title">Changed applications</h3>
                </div>
                <div class="list-group list-group-flush">
                    ${apps.length ? apps.map(app => html`
                        <div class="list-group-item">
                            <div class="d-flex justify-content-between gap-3">
                                <div class="min-width-0">
                                    <div class="fw-semibold text-truncate">${app.appName}</div>
                                    <div class="text-muted small text-truncate">${app.vendor} · ${app.deviceCount} device${app.deviceCount === 1 ? '' : 's'} · latest ${fmtDateTime(app.latest)}</div>
                                </div>
                                <div class="d-flex gap-1 flex-wrap justify-content-end">
                                    ${app.installs ? html`<span class="badge bg-success text-white">${app.installs} installed</span>` : null}
                                    ${app.updates ? html`<span class="badge bg-primary text-white">${app.updates} updated</span>` : null}
                                    ${app.removals ? html`<span class="badge bg-danger text-white">${app.removals} removed</span>` : null}
                                </div>
                            </div>
                        </div>
                    `) : html`<div class="list-group-item text-muted">No applications match the current filters.</div>`}
                </div>
            </div>
        `;
    }

    renderDeviceRollups(devices) {
        return html`
            <div class="card h-100">
                <div class="card-header">
                    <h3 class="card-title">Devices with movement</h3>
                </div>
                <div class="list-group list-group-flush">
                    ${devices.length ? devices.map(device => html`
                        <a href=${device.deviceId ? `#!/devices/${device.deviceId}` : '#!/devices'} class="list-group-item list-group-item-action">
                            <div class="d-flex justify-content-between gap-3">
                                <div class="min-width-0">
                                    <div class="fw-semibold text-truncate">${device.deviceName}</div>
                                    <div class="text-muted small">${device.appCount} app${device.appCount === 1 ? '' : 's'} touched · latest ${fmtDateTime(device.latest)}</div>
                                </div>
                                <span class="badge bg-secondary text-white">${device.total}</span>
                            </div>
                        </a>
                    `) : html`<div class="list-group-item text-muted">No devices match the current filters.</div>`}
                </div>
            </div>
        `;
    }

    renderLedgerRows(events) {
        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Change ledger</h3>
                    <div class="card-actions text-muted small">Newest first</div>
                </div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table mb-0">
                        <thead>
                            <tr>
                                <th style="width:150px;">When</th>
                                <th style="width:112px;">Action</th>
                                <th>Application</th>
                                <th>Version</th>
                                <th>Device</th>
                                <th>Meaning</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${events.slice(0, 120).map((event, index) => html`
                                <tr key=${`${event.deviceId || 'device'}_${this._eventMoment(event) || index}_${event.appName || 'app'}`}>
                                    <td class="text-muted small" style="white-space:nowrap;">${fmtDateTime(this._eventMoment(event))}</td>
                                    <td><span class="badge ${CHANGE_BADGE[event.changeType] || 'bg-secondary text-white'}">${event.changeType || '?'}</span></td>
                                    <td>
                                        <div class="fw-medium">${event.appName || 'Unknown app'}</div>
                                        <div class="text-muted small">${event.vendor || 'Unknown vendor'}</div>
                                    </td>
                                    <td class="text-muted small"><code>${this.versionText(event)}</code></td>
                                    <td>
                                        <a href=${event.deviceId ? `#!/devices/${event.deviceId}` : '#!/devices'} class="text-reset small">
                                            ${event.deviceName || event.deviceId || 'Unknown device'}
                                        </a>
                                    </td>
                                    <td class="text-muted small">${this.changeMeaning(event)}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
                ${events.length > 120 ? html`<div class="card-footer text-muted small">Showing the newest 120 of ${events.length} matching events.</div>` : null}
            </div>
        `;
    }

    getGroupedEvents() {
        const filtered = this.getFiltered();
        const { groupBy } = this.state;
        const groups = {};

        filtered.forEach(e => {
            let key = '';
            let title = '';
            let subtitle = '';

            if (groupBy === 'device') {
                key = e.deviceId || 'Unknown device';
                title = resolveDeviceLabel(e.deviceId, { [e.deviceId]: e.deviceName || e.deviceId }, e.deviceName || 'Unknown device');
                subtitle = title !== (e.deviceId || '') ? `${e.deviceId} · Endpoint activity` : 'Endpoint activity';
            } else if (groupBy === 'vendor') {
                key = e.vendor || 'Unknown vendor';
                title = e.vendor || 'Unknown vendor';
                subtitle = 'Publisher rollout history';
            } else {
                key = `${e.appName || 'Unknown Application'}||${e.vendor || 'Unknown vendor'}`;
                title = e.appName || 'Unknown Application';
                subtitle = e.vendor || 'Unknown vendor';
            }

            if (!groups[key]) groups[key] = { key, title, subtitle, events: [] };
            groups[key].events.push(e);
        });

        return Object.values(groups)
            .map(section => {
                const sortedEvents = [...section.events].sort((a, b) => {
                    const left = new Date(this._eventMoment(a) || 0).getTime();
                    const right = new Date(this._eventMoment(b) || 0).getTime();
                    return right - left;
                });

                return {
                    ...section,
                    events: sortedEvents,
                    installs: sortedEvents.filter(e => e.changeType === 'Installed').length,
                    updates: sortedEvents.filter(e => e.changeType === 'Updated').length,
                    removals: sortedEvents.filter(e => e.changeType === 'Uninstalled').length,
                    deviceCount: new Set(sortedEvents.map(e => e.deviceId).filter(Boolean)).size || (groupBy === 'device' ? 1 : 0),
                    appCount: new Set(sortedEvents.map(e => e.appName).filter(Boolean)).size || (groupBy === 'application' ? 1 : 0),
                    newest: sortedEvents[0] ? this._eventMoment(sortedEvents[0]) : null,
                };
            })
            .sort((a, b) => {
                const left = new Date(a.newest || 0).getTime();
                const right = new Date(b.newest || 0).getTime();
                return right - left || b.events.length - a.events.length || a.title.localeCompare(b.title);
            });
    }

    renderTimelineItem(e, idx) {
        const tone = e.changeType === 'Installed' ? 'success' : e.changeType === 'Updated' ? 'primary' : 'danger';
        const eventMoment = this._eventMoment(e);
        const dwell = fmtDuration(e.firstSeen, this._dwellEndMoment(e));
        const fromVersion = e.changeType === 'Updated'
            ? (e.nextVersion ? (e.version || e.previousVersion || 'previous build') : (e.previousVersion || e.version || 'previous build'))
            : (e.version || 'current build');
        const toVersion = e.changeType === 'Updated'
            ? (e.nextVersion || e.version || 'current build')
            : (e.version || 'current build');

        return html`
            <div class="d-flex gap-3 ${idx < 9 ? 'mb-3' : ''}">
                <div class="text-muted small" style="min-width: 125px; white-space: nowrap;">
                    ${fmtDateTime(eventMoment)}
                </div>
                <div class="flex-fill border-start ps-3 position-relative">
                    <span class="position-absolute top-0 start-0 translate-middle rounded-circle bg-${tone}" style="width: 10px; height: 10px;"></span>
                    <div class="card card-sm">
                        <div class="card-body py-2">
                            <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                                <div>
                                    <div class="fw-semibold">${e.appName || 'Unknown app'}</div>
                                    <div class="text-muted small">
                                        ${e.vendor || 'Unknown vendor'}${e.deviceId ? ` · ${e.deviceName || e.deviceId}` : ''}
                                    </div>
                                </div>
                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                    <span class="badge ${CHANGE_BADGE[e.changeType] || 'bg-secondary text-white'}">
                                        ${e.changeType || '?'}
                                    </span>
                                    ${dwell ? html`<span class="badge bg-blue-lt text-blue">Present ~ ${dwell}</span>` : ''}
                                </div>
                            </div>
                            <div class="d-flex align-items-center gap-2 flex-wrap mt-2">
                                ${e.changeType === 'Updated' ? html`
                                    <code>${fromVersion}</code>
                                    <span class="text-muted">→</span>
                                    <code>${toVersion}</code>
                                    <span class="text-success small">Version shift detected</span>
                                ` : e.changeType === 'Uninstalled' ? html`
                                    <code>${e.version || 'removed build'}</code>
                                    <span class="text-muted small">Removed from this device</span>
                                ` : html`
                                    <code>${e.version || 'new build'}</code>
                                    <span class="text-muted small">First observed on this device</span>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    toggleExpandedGroup(key) {
        this.setState(prev => ({
            expandedGroups: {
                ...prev.expandedGroups,
                [key]: !prev.expandedGroups[key]
            }
        }));
    }

    renderTimelineSection(section) {
        const sectionKey = `changelog-${String(section.key || section.title || 'group')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'group'}`;
        const isOpen = !!this.state.expandedGroups[sectionKey];

        return html`
            <${CollapsibleSectionCard}
                title=${section.title}
                subtitle=${section.subtitle || ''}
                meta=${`${section.appCount} app${section.appCount === 1 ? '' : 's'} · ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'} · latest ${fmtDateTime(section.newest)}`}
                badges=${[
                    { text: `${section.installs} installs`, className: 'bg-success text-white' },
                    { text: `${section.updates} updates`, className: 'bg-primary text-white' },
                    { text: `${section.removals} removals`, className: 'bg-danger text-white' },
                    { text: isOpen ? 'Collapse' : 'Expand', className: 'bg-secondary-lt text-secondary' }
                ]}
                accent=${'primary'}
                isOpen=${isOpen}
                onToggle=${() => this.toggleExpandedGroup(sectionKey)}>
                ${section.events.slice(0, 10).map((e, idx) => this.renderTimelineItem(e, idx))}
                ${section.events.length > 10 ? html`
                    <div class="text-muted small mt-2">Showing the newest 10 of ${section.events.length} events in this timeline.</div>
                ` : ''}
            </${CollapsibleSectionCard}>
        `;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    render() {
        const { loading, error, events, isRefreshingInBackground,
                changeTypeFilter, searchText, deviceFilter, groupBy } = this.state;
        const filtered = this.getFiltered();
        const devices  = this.getUniqueDevices();
        const stats = this.getSummaryStats();
        const recentStats = this.getRecentActivityStats();
        const sortedEvents = this.getSortedEvents(filtered);
        const changedApps = this.getChangedApps(filtered);
        const deviceRollups = this.getDeviceRollups(filtered);
        const latestEvent = sortedEvents[0] || null;

        if (loading && !events.length) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height:60vh;">
                    <div class="spinner-border text-primary"></div>
                </div>
            `;
        }

        if (error && !events.length) {
            return html`
                <div class="alert alert-danger m-3">
                    <h4 class="alert-title">Error loading changelog</h4>
                    <div>${error}</div>
                    <button class="btn btn-sm btn-danger mt-2" onClick=${() => this.loadChangelog(true)}>Retry</button>
                </div>
            `;
        }

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Software Changelog</h2>
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:12px;height:12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <p class="page-subtitle mt-1 mb-0">
                                Install, update, and uninstall events across all devices
                                ${events.length > 0 ? html` · <span class="text-muted">${events.length} events loaded${this.state.total > events.length ? ` of ${this.state.total}` : ''}</span>` : ''}
                                ${rewindContext.isActive() ? html` · <span class="badge bg-azure-lt text-azure">As of ${api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">

                    <div class="row row-cards mb-3">
                        <div class="col-sm-6 col-lg-3">
                            <div class="card card-sm">
                                <div class="card-body">
                                    <div class="text-muted small text-uppercase">Installed</div>
                                    <div class="h2 mb-0">${stats.installs}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="card card-sm">
                                <div class="card-body">
                                    <div class="text-muted small text-uppercase">Updated</div>
                                    <div class="h2 mb-0">${stats.updates}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="card card-sm">
                                <div class="card-body">
                                    <div class="text-muted small text-uppercase">Removed</div>
                                    <div class="h2 mb-0">${stats.removals}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="card card-sm">
                                <div class="card-body">
                                    <div class="text-muted small text-uppercase">Last 24h</div>
                                    <div class="h2 mb-0">${recentStats.recent24hCount}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card mb-3 border-0 shadow-sm">
                        <div class="card-body d-flex flex-wrap justify-content-between gap-3 align-items-center">
                            <div>
                                <div class="text-muted text-uppercase fw-semibold small">What changed most recently</div>
                                <div class="h3 mb-1">${latestEvent ? `${latestEvent.changeType || 'Change'}: ${latestEvent.appName || 'Unknown app'}` : 'No movement yet'}</div>
                                <div class="text-muted small">
                                    ${latestEvent
                                        ? `${latestEvent.vendor || 'Unknown vendor'} on ${latestEvent.deviceName || latestEvent.deviceId || 'unknown device'} · ${fmtDateTime(this._eventMoment(latestEvent))}`
                                        : 'Install, update, and uninstall events will appear when devices report software changes.'}
                                </div>
                            </div>
                            <div class="d-flex gap-2 flex-wrap">
                                <span class="badge bg-primary text-white">${recentStats.recent7dCount} this week</span>
                                <span class="badge bg-warning text-white">${recentStats.recentHighSignalChanges} updates/removals</span>
                                <span class="badge bg-secondary-lt text-secondary">${stats.apps} apps touched</span>
                            </div>
                        </div>
                    </div>

                    <!-- Filters -->
                    <div class="card mb-3">
                        <div class="card-body py-3">
                            <div class="triage-filter-toolbar">
                                <div class="triage-filter-block">
                                    <div class="triage-filter-label">Change type</div>
                                    <${SegmentedControl}
                                        options=${[
                                            { id: 'all', label: 'All' },
                                            { id: 'Installed', label: 'Installed' },
                                            { id: 'Updated', label: 'Updated' },
                                            { id: 'Uninstalled', label: 'Removed' }
                                        ]}
                                        value=${changeTypeFilter}
                                        onChange=${value => this.setState({ changeTypeFilter: value })}
                                    />
                                </div>
                                <div class="triage-filter-block">
                                    <div class="triage-filter-label">Group by</div>
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
                                ${devices.length > 1 ? html`
                                    <div class="triage-filter-block">
                                        <div class="triage-filter-label">Device</div>
                                        <select class="form-select form-select-sm" style="min-width:200px;"
                                                value=${deviceFilter}
                                                onChange=${e => this.setState({ deviceFilter: e.target.value }, () => {
                                                    try { localStorage.removeItem(this._cacheKey()); } catch {}
                                                    this.loadChangelog(true);
                                                })}>
                                            <option value="">All devices</option>
                                            ${devices.map(device => html`<option value=${device.id}>${device.name}</option>`)}
                                        </select>
                                    </div>
                                ` : ''}
                                <div class="triage-filter-block grow">
                                    <div class="triage-filter-label">Search</div>
                                    <input type="search" class="form-control form-control-sm"
                                           placeholder="Search app, vendor, device…"
                                           value=${searchText}
                                           onInput=${e => this.setState({ searchText: e.target.value })} />
                                </div>
                                <div class="text-muted small align-self-end">
                                    ${filtered.length} event${filtered.length !== 1 ? 's' : ''}
                                </div>
                            </div>
                            <div class="text-muted small mt-2">
                                ${groupBy === 'application'
                                    ? 'Application mode highlights products with recent installs, updates, or removals.'
                                    : groupBy === 'vendor'
                                        ? 'Vendor mode highlights publisher rollout and removal patterns.'
                                        : 'Device mode highlights endpoints with the most software movement.'}
                            </div>
                        </div>
                    </div>

                    ${filtered.length === 0 ? html`
                        <div class="empty">
                            <div class="empty-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="4" rx="1" /><rect x="4" y="12" width="6" height="8" rx="1" /><path d="M14 14l4 4m0 -4l-4 4" /></svg>
                            </div>
                            <p class="empty-title">No changelog events</p>
                            <p class="empty-subtitle text-muted">
                                ${events.length > 0
                                    ? 'No events match your current filters.'
                                    : 'Install, update, and uninstall events will appear here once devices report software changes.'}
                            </p>
                        </div>
                    ` : html`
                        <div class="row row-cards mb-3">
                            <div class="col-lg-7">${this.renderChangedApps(changedApps)}</div>
                            <div class="col-lg-5">${this.renderDeviceRollups(deviceRollups)}</div>
                        </div>

                        ${this.renderLedgerRows(sortedEvents)}
                    `}
                </div>
            </div>
        `;
    }
}

export default InventoryChangelogPage;
