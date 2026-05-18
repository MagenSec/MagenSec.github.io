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
import { FilterToolbar, PaginationBar, PortalDataGrid, SortableHeader } from '../../components/shared/DataControls.js';

const { html, Component } = window;

const CHANGE_BADGE = {
    Installed:   'bg-success text-white',
    Updated:     'bg-primary text-white',
    Uninstalled: 'bg-danger text-white',
};

const CHANGE_TONE = {
    Installed: 'success',
    Updated: 'primary',
    Uninstalled: 'danger',
};

const DAY_MS = 86_400_000;

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

function compareVersions(left, right) {
    const leftParts = String(left || '').match(/\d+/g)?.map(Number) || [];
    const rightParts = String(right || '').match(/\d+/g)?.map(Number) || [];
    if (!leftParts.length || !rightParts.length) return 0;

    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = leftParts[index] || 0;
        const rightValue = rightParts[index] || 0;
        if (leftValue > rightValue) return 1;
        if (leftValue < rightValue) return -1;
    }
    return 0;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
}

export class InventoryChangelogPage extends Component {
    constructor(props) {
        super(props);
        const cached = this._getCache();
        const cachedEvents = cached?.data?.events || [];
        this.state = {
            loading: cachedEvents.length === 0,
            error: null,
            events: cachedEvents,
            total: cached?.data?.total || 0,
            deviceFilter: '',
            changeTypeFilter: 'all',
            groupBy: 'application',
            sortField: 'when',
            sortAsc: false,
            page: 1,
            pageSize: 25,
            selectedEventKey: '',
            expandedGroups: {},
            searchText: '',
            magiBrief: '',
            magiBriefLoading: false,
            magiBriefError: null,
            magiBriefGeneratedAt: null,
            magiBriefCached: false,
            magiBriefModalOpen: false,
            exportStatus: null,
            isRefreshingInBackground: cachedEvents.length > 0 && cached?.isStale,
            effectiveNowUtc: cached?.data?.effectiveNowUtc || null,
        };
        this._orgUnsub = null;
        this._rewindUnsub = null;
        this._isMounted = false;
        this._loadFrame = null;
    }

    componentDidMount() {
        this._isMounted = true;
        this._orgUnsub = orgContext.onChange(() => this.loadChangelog(true));
        this._rewindUnsub = rewindContext.onChange(() => this.loadChangelog(true));
        this._loadFrame = requestAnimationFrame(() => {
            this._loadFrame = null;
            if (this._isMounted && this._isActiveRoute()) {
                this.loadChangelog();
            }
        });
    }

    componentWillUnmount() {
        this._isMounted = false;
        if (this._loadFrame !== null) {
            cancelAnimationFrame(this._loadFrame);
            this._loadFrame = null;
        }
        if (this._orgUnsub) this._orgUnsub();
        if (this._rewindUnsub) this._rewindUnsub();
    }

    _isActiveRoute() {
        return (window.location.hash || '').startsWith('#!/changelog');
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

    _magiBriefCacheKey(context) {
        const org = orgContext.getCurrentOrg();
        const effectiveDate = api.getEffectiveDate?.() || 'current';
        const signature = [
            context?.summary?.totalEvents || 0,
            context?.summary?.installs || 0,
            context?.summary?.updates || 0,
            context?.summary?.removals || 0,
            context?.signals?.map(signal => signal.key).join('-') || 'steady'
        ].join('_');
        return `inventory_changelog_magi_${org?.orgId || 'default'}_${effectiveDate}_${signature}`;
    }

    _getMagiBriefCache(context) {
        try {
            const raw = localStorage.getItem(this._magiBriefCacheKey(context));
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (!cached?.answer) return null;
            if (Date.now() - Number(cached.timestamp || 0) > 6 * 60 * 60 * 1000) return null;
            return cached;
        } catch { return null; }
    }

    _setMagiBriefCache(context, answer) {
        try {
            localStorage.setItem(this._magiBriefCacheKey(context), JSON.stringify({ answer, timestamp: Date.now() }));
        } catch { /* storage full */ }
    }

    renderMarkdown(text, className = 'markdown magi-response') {
        const content = String(text || '');
        let rendered = content ? escapeHtml(content).replace(/\n/g, '<br>') : '';
        if (window.marked && window.DOMPurify) {
            const raw = window.marked.parse(content, { breaks: true, gfm: true });
            rendered = window.DOMPurify.sanitize(raw);
            rendered = rendered.replace(/<table>/g, '<table class="table table-vcenter">');
        }
        return html`<div class=${className} dangerouslySetInnerHTML=${{ __html: rendered }}></div>`;
    }

    briefPreview(text) {
        const plain = String(text || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/[`*_#>\[\]()]/g, '')
            .replace(/^\s*[-+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
        return plain.length > 220 ? `${plain.slice(0, 220)}...` : plain;
    }

    // ── Data loading ───────────────────────────────────────────────────────────

    async loadChangelog(forceRefresh = false) {
        if (!this._isMounted || !this._isActiveRoute()) return;
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        let hasCachedEvents = false;
        if (!forceRefresh) {
            const cached = this._getCache();
            if (cached) {
                const cachedEvents = cached.data.events || [];
                hasCachedEvents = cachedEvents.length > 0;
                this.setState({
                    events: cachedEvents,
                    total: cached.data.total || 0,
                    effectiveNowUtc: cached.data.effectiveNowUtc || null,
                    loading: false,
                    isRefreshingInBackground: cached.isStale,
                    error: null
                });
                if (!cached.isStale) return;
            }
        }

        if (!hasCachedEvents && !this.state.events.length) {
            this.setState({ loading: true, error: null });
        }

        try {
            const params = { limit: 500 };
            if (this.state.deviceFilter) params.deviceId = this.state.deviceFilter;
            const resp = await api.getInventoryChangelog(orgId, params);
            if (!this._isMounted || !this._isActiveRoute()) return;

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
            if (!this._isMounted || !this._isActiveRoute()) return;
            if (!this.state.events.length) {
                this.setState({ error: err.message, loading: false, isRefreshingInBackground: false });
            } else {
                this.setState({ isRefreshingInBackground: false });
            }
        }
    }

    // ── Filtering ─────────────────────────────────────────────────────────────

    getFiltered() {
        const { events, changeTypeFilter, searchText, deviceFilter } = this.state;
        const search = searchText.toLowerCase();
        const filtered = events.filter(e => {
            if (changeTypeFilter !== 'all' && e.changeType !== changeTypeFilter) return false;
            if (deviceFilter && e.deviceId !== deviceFilter) return false;
            if (search && !(
                (e.appName || '').toLowerCase().includes(search) ||
                (e.vendor || '').toLowerCase().includes(search) ||
                (e.deviceName || '').toLowerCase().includes(search) ||
                (e.deviceId || '').toLowerCase().includes(search) ||
                (e.changeType || '').toLowerCase().includes(search) ||
                this.versionText(e).toLowerCase().includes(search) ||
                this.changeMeaning(e).toLowerCase().includes(search)
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
        const seenLifecycle = new Map();

        for (const event of events) {
            const lifecycleKey = [
                event.changeType || '',
                event.status || '',
                event.appStatus || '',
                event.deviceId || '',
                (event.vendor || '').toLowerCase(),
                (event.appName || '').toLowerCase(),
                event.version || '',
                event.nextVersion || event.previousVersion || ''
            ].join('||');

            if (seenLifecycle.has(lifecycleKey)) {
                const idx = seenLifecycle.get(lifecycleKey);
                const existing = deduped[idx];
                deduped[idx] = {
                    ...existing,
                    firstSeen: this._earliestMoment(existing.firstSeen, event.firstSeen),
                    lastSeen: this._latestMoment(existing.lastSeen, event.lastSeen),
                    stateUpdatedOn: this._latestMoment(existing.stateUpdatedOn, event.stateUpdatedOn),
                    remediatedOn: this._latestMoment(existing.remediatedOn, event.remediatedOn)
                };
                continue;
            }
            seenLifecycle.set(lifecycleKey, deduped.length);

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
            let lastRemovedVersion = null;
            let lastRemovedAt = 0;
            for (const idx of indices) {
                const event = deduped[idx];
                const eventAt = new Date(this._eventMoment(event) || 0).getTime();
                if (event.changeType === 'Uninstalled') {
                    lastRemovedVersion = event.version || lastActiveVersion || lastRemovedVersion;
                    lastRemovedAt = Number.isFinite(eventAt) ? eventAt : 0;
                    lastActiveVersion = null;
                    continue;
                }

                const recentlyRemovedVersion = lastRemovedVersion && lastRemovedAt && Number.isFinite(eventAt) && eventAt - lastRemovedAt <= DAY_MS
                    ? lastRemovedVersion
                    : null;
                const previousVersion = lastActiveVersion || recentlyRemovedVersion;
                if (event.changeType === 'Installed'
                    && previousVersion
                    && event.version
                    && String(previousVersion).toLowerCase() !== String(event.version).toLowerCase()) {
                    deduped[idx] = {
                        ...event,
                        changeType: 'Updated',
                        previousVersion: event.previousVersion || previousVersion
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

    _earliestMoment(left, right) {
        const leftTime = new Date(left || 0).getTime();
        const rightTime = new Date(right || 0).getTime();
        if (!Number.isFinite(leftTime) || leftTime <= 0) return right || left;
        if (!Number.isFinite(rightTime) || rightTime <= 0) return left || right;
        return leftTime <= rightTime ? left : right;
    }

    _latestMoment(left, right) {
        const leftTime = new Date(left || 0).getTime();
        const rightTime = new Date(right || 0).getTime();
        if (!Number.isFinite(leftTime) || leftTime <= 0) return right || left;
        if (!Number.isFinite(rightTime) || rightTime <= 0) return left || right;
        return leftTime >= rightTime ? left : right;
    }

    _eventMoment(e) {
        return e.eventTime || e.stateUpdatedOn || e.firstSeen || null;
    }

    _dwellEndMoment(e) {
        return e.stateUpdatedOn || e.lastSeen || this.state.effectiveNowUtc || e.eventTime || e.firstSeen || null;
    }

    eventLifecycle(event) {
        const changedAt = this._eventMoment(event);
        const lastSeenAt = event.lastSeen || event.stateUpdatedOn || changedAt || null;
        return {
            changedAt,
            firstSeenAt: event.firstSeen || null,
            installedAt: event.firstSeen || null,
            lastSeenAt,
            lastSeenSource: event.lastSeen ? 'LastSeen' : event.stateUpdatedOn ? 'StateUpdatedOn' : changedAt ? 'ChangeEventTime' : null,
            stateUpdatedAt: event.stateUpdatedOn || null,
            observedUntil: this._dwellEndMoment(event),
            observedFor: fmtDuration(event.firstSeen, this._dwellEndMoment(event)) || null,
            previousVersion: event.previousVersion || null,
            version: event.version || null,
            nextVersion: event.nextVersion || null,
        };
    }

    _setPagedState(update) {
        this.setState({ ...update, page: 1 });
    }

    _eventKey(event, index = 0) {
        return [
            event.deviceId || 'device',
            this._eventMoment(event) || index,
            event.changeType || 'change',
            event.appName || 'app',
            event.version || event.nextVersion || event.previousVersion || ''
        ].join('|');
    }

    _paginateRows(rows) {
        const pageSize = Number(this.state.pageSize) || 25;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const page = Math.min(Math.max(1, Number(this.state.page) || 1), totalPages);
        const start = (page - 1) * pageSize;
        return { page, pageSize, rows: rows.slice(start, start + pageSize), total: rows.length };
    }

    _sort(field) {
        const { sortField, sortAsc } = this.state;
        this._setPagedState({
            sortField: field,
            sortAsc: sortField === field ? !sortAsc : field !== 'when'
        });
    }

    _sortValue(event, field) {
        if (field === 'when') return new Date(this._eventMoment(event) || 0).getTime();
        if (field === 'action') return event.changeType || '';
        if (field === 'app') return event.appName || '';
        if (field === 'vendor') return event.vendor || '';
        if (field === 'version') return this.versionText(event);
        if (field === 'device') return event.deviceName || event.deviceId || '';
        return '';
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
            possibleDowngrades: filtered.filter(event => this.isPossibleDowngrade(event)).length,
            signalUpdatedAt: this.state.effectiveNowUtc || referenceNow.toISOString(),
        };
    }

    getSortedEvents(events = this.getFiltered()) {
        const { sortField, sortAsc } = this.state;
        return [...events].sort((left, right) => {
            let leftValue = this._sortValue(left, sortField);
            let rightValue = this._sortValue(right, sortField);
            if (typeof leftValue === 'string') leftValue = leftValue.toLowerCase();
            if (typeof rightValue === 'string') rightValue = rightValue.toLowerCase();
            const compare = leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0;
            return sortAsc ? compare : -compare;
        });
    }

    getChangedApps(events = this.getFiltered(), limit = 8) {
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
                    installedAt: null,
                    firstSeenAt: null,
                    lastSeenAt: null,
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
            if (event.changeType === 'Installed' && eventTime && (!item.installedAt || new Date(eventTime).getTime() < new Date(item.installedAt).getTime())) {
                item.installedAt = eventTime;
            }
            if (event.firstSeen && (!item.firstSeenAt || new Date(event.firstSeen).getTime() < new Date(item.firstSeenAt).getTime())) {
                item.firstSeenAt = event.firstSeen;
            }
            const lastSeen = event.lastSeen || event.stateUpdatedOn || eventTime;
            if (lastSeen && (!item.lastSeenAt || new Date(lastSeen).getTime() > new Date(item.lastSeenAt).getTime())) {
                item.lastSeenAt = lastSeen;
            }
        }

        const sorted = [...apps.values()]
            .map(item => ({ ...item, deviceCount: item.devices.size }))
            .sort((a, b) => {
                const riskRank = ((b.updates * 2) + b.removals) - ((a.updates * 2) + a.removals);
                if (riskRank !== 0) return riskRank;
                return new Date(b.latest || 0).getTime() - new Date(a.latest || 0).getTime();
            });
        return limit > 0 ? sorted.slice(0, limit) : sorted;
    }

    getDeviceRollups(events = this.getFiltered(), limit = 8) {
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

        const sorted = [...devices.values()]
            .map(item => ({ ...item, appCount: item.apps.size, total: item.installs + item.updates + item.removals }))
            .sort((a, b) => b.total - a.total || new Date(b.latest || 0).getTime() - new Date(a.latest || 0).getTime())
        return limit > 0 ? sorted.slice(0, limit) : sorted;
    }

    percentile(values, percentileValue) {
        const sorted = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
        if (!sorted.length) return 0;
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
        return sorted[index];
    }

    getCalibratedThresholds(changedApps, deviceRollups) {
        const removalCounts = changedApps.map(app => app.removals);
        const updateCounts = changedApps.map(app => app.updates);
        const updateDeviceCounts = changedApps.filter(app => app.updates > 0).map(app => app.deviceCount);
        const deviceTotals = deviceRollups.map(device => device.total);

        return {
            removalConcentration: Math.max(3, Math.ceil(this.percentile(removalCounts, 80))),
            updateWave: Math.max(3, Math.ceil(this.percentile(updateCounts, 80))),
            updateWaveDevices: Math.max(2, Math.ceil(this.percentile(updateDeviceCounts, 60))),
            deviceBurst: Math.max(10, Math.ceil(this.percentile(deviceTotals, 80))),
        };
    }

    getAttentionSignals(events, changedApps, deviceRollups, thresholds = this.getCalibratedThresholds(changedApps, deviceRollups)) {
        const signals = [];
        const downgrades = events.filter(event => this.isPossibleDowngrade(event));
        if (downgrades.length) {
            const first = downgrades[0];
            const { fromVersion, toVersion } = this.updateVersionPair(first);
            signals.push({
                key: 'downgrades',
                tone: 'danger',
                icon: 'ti-arrow-down-right',
                title: `${downgrades.length} possible downgrade${downgrades.length === 1 ? '' : 's'}`,
                detail: `${first.appName || 'Unknown app'} moved ${fromVersion || 'previous build'} → ${toVersion || 'current build'} on ${first.deviceName || first.deviceId || 'a device'}.`,
                badge: 'Rollback signal',
                actionLabel: 'Review updates',
                action: () => this.focusRelatedChanges(first, { changeTypeFilter: 'Updated', searchText: first.appName || first.vendor || '' })
            });
        }

        const updateWave = changedApps.find(app => app.updates >= thresholds.updateWave && app.deviceCount >= thresholds.updateWaveDevices);
        if (updateWave) {
            signals.push({
                key: 'update-wave',
                tone: 'primary',
                icon: 'ti-refresh',
                title: `${updateWave.updates} updates for ${updateWave.appName}`,
                detail: `${updateWave.vendor} update activity reached ${updateWave.deviceCount} devices.`,
                badge: 'Patch wave',
                actionLabel: 'Show updates',
                action: () => this._setPagedState({ changeTypeFilter: 'Updated', searchText: updateWave.appName })
            });
        }

        const removalHeavy = changedApps.find(app => app.removals >= thresholds.removalConcentration && app.removals >= Math.max(2, app.installs + app.updates));
        if (removalHeavy) {
            signals.push({
                key: 'removal-heavy',
                tone: 'warning',
                icon: 'ti-trash',
                title: `${removalHeavy.removals} removals for ${removalHeavy.appName}`,
                detail: `${removalHeavy.vendor} changed across ${removalHeavy.deviceCount} device${removalHeavy.deviceCount === 1 ? '' : 's'}.`,
                badge: 'Removal concentration',
                actionLabel: 'Show removals',
                action: () => this._setPagedState({ changeTypeFilter: 'Uninstalled', searchText: removalHeavy.appName })
            });
        }

        const deviceBurst = deviceRollups.find(device => device.total >= thresholds.deviceBurst);
        if (deviceBurst) {
            signals.push({
                key: 'device-burst',
                tone: 'info',
                icon: 'ti-device-desktop-analytics',
                title: `${deviceBurst.total} changes on ${deviceBurst.deviceName}`,
                detail: `${deviceBurst.appCount} applications moved on the same endpoint.`,
                badge: 'Device concentration',
                actionLabel: 'Scope device',
                action: () => this.setState({ deviceFilter: deviceBurst.deviceId, page: 1 }, () => this.loadChangelog(true))
            });
        }

        if (!signals.length) {
            signals.push({
                key: 'steady',
                tone: 'success',
                icon: 'ti-circle-check',
                title: 'No unusual software movement',
                detail: 'No downgrade, removal-concentration, or device-burst signals match the current filters.',
                badge: 'Steady',
                actionLabel: '',
                action: null
            });
        }

        return signals.slice(0, 4);
    }

    getMovementDays(events) {
        const reference = this.state.effectiveNowUtc ? new Date(this.state.effectiveNowUtc) : new Date();
        const endOfReferenceDay = new Date(reference);
        endOfReferenceDay.setHours(23, 59, 59, 999);
        const days = Array.from({ length: 7 }).map((_, offset) => {
            const dayStart = new Date(endOfReferenceDay.getTime() - ((6 - offset) * DAY_MS));
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart.getTime() + DAY_MS);
            return {
                key: dayStart.toISOString().slice(0, 10),
                label: dayStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                installs: 0,
                updates: 0,
                removals: 0,
                total: 0,
                start: dayStart,
                end: dayEnd,
            };
        });

        for (const event of events) {
            const eventMs = new Date(this._eventMoment(event) || 0).getTime();
            const day = days.find(item => eventMs >= item.start.getTime() && eventMs < item.end.getTime());
            if (!day) continue;
            if (event.changeType === 'Installed') day.installs += 1;
            else if (event.changeType === 'Updated') day.updates += 1;
            else if (event.changeType === 'Uninstalled') day.removals += 1;
            day.total += 1;
        }

        return days;
    }

    buildEvidencePacket({ filtered, sortedEvents, stats, recentStats, changedApps, deviceRollups, attentionSignals, movementDays, thresholds, selectedEvent }) {
        const org = orgContext.getCurrentOrg();
        return {
            generatedAtUtc: new Date().toISOString(),
            orgId: org?.orgId || null,
            orgName: org?.name || org?.displayName || null,
            effectiveDate: api.getEffectiveDate?.() || null,
            effectiveNowUtc: this.state.effectiveNowUtc || null,
            filters: {
                changeType: this.state.changeTypeFilter,
                deviceId: this.state.deviceFilter || null,
                search: this.state.searchText || null,
                groupBy: this.state.groupBy,
            },
            calibration: thresholds,
            summary: {
                totalEvents: filtered.length,
                installs: stats.installs,
                updates: stats.updates,
                removals: stats.removals,
                devices: stats.devices,
                apps: stats.apps,
                last24h: recentStats.recent24hCount,
                possibleDowngrades: recentStats.possibleDowngrades,
            },
            signals: attentionSignals.map(signal => ({
                key: signal.key,
                title: signal.title,
                detail: signal.detail,
                badge: signal.badge,
                tone: signal.tone,
            })),
            movementDays: movementDays.map(day => ({
                date: day.key,
                installs: day.installs,
                updates: day.updates,
                removals: day.removals,
                total: day.total,
            })),
            changedApplications: changedApps.slice(0, 12).map(app => ({
                appName: app.appName,
                vendor: app.vendor,
                installs: app.installs,
                updates: app.updates,
                removals: app.removals,
                deviceCount: app.deviceCount,
                latest: app.latest,
                installedAt: app.installedAt,
                firstSeenAt: app.firstSeenAt,
                lastSeenAt: app.lastSeenAt,
            })),
            devicesWithMovement: deviceRollups.slice(0, 12).map(device => ({
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                total: device.total,
                appCount: device.appCount,
                installs: device.installs,
                updates: device.updates,
                removals: device.removals,
                latest: device.latest,
            })),
            selectedEvent: selectedEvent ? {
                when: this._eventMoment(selectedEvent),
                action: selectedEvent.changeType,
                appName: selectedEvent.appName,
                vendor: selectedEvent.vendor,
                version: this.versionText(selectedEvent),
                deviceId: selectedEvent.deviceId,
                deviceName: selectedEvent.deviceName,
                signal: this.isPossibleDowngrade(selectedEvent) ? 'Possible rollback' : 'Normal movement',
                meaning: this.changeMeaning(selectedEvent),
                lifecycle: this.eventLifecycle(selectedEvent),
            } : null,
            sampleEvents: sortedEvents.slice(0, 50).map(event => {
                const lifecycle = this.eventLifecycle(event);
                return {
                    when: lifecycle.changedAt,
                    action: event.changeType,
                    appName: event.appName,
                    vendor: event.vendor,
                    version: this.versionText(event),
                    deviceId: event.deviceId,
                    deviceName: event.deviceName,
                    possibleRollback: this.isPossibleDowngrade(event),
                    meaning: this.changeMeaning(event),
                    firstSeenAt: lifecycle.firstSeenAt,
                    installedAt: lifecycle.installedAt,
                    lastSeenAt: lifecycle.lastSeenAt,
                    lastSeenSource: lifecycle.lastSeenSource,
                    stateUpdatedAt: lifecycle.stateUpdatedAt,
                    nextVersion: lifecycle.nextVersion,
                    lifecycle,
                };
            }),
        };
    }

    downloadEvidencePacket(packet) {
        try {
            const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
            const orgId = packet?.orgId || 'org';
            const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `software-changelog-packet-${orgId}-${stamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            this.setState({ exportStatus: 'Downloaded change packet' });
            setTimeout(() => this._isMounted && this.setState({ exportStatus: null }), 3000);
        } catch (err) {
            this.setState({ exportStatus: err?.message || 'Export failed' });
        }
    }

    async askMagiBrief(packet) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ magiBriefError: 'No organization selected' });
            return;
        }

        const cached = this._getMagiBriefCache(packet);
        if (cached?.answer) {
            this.setState({
                magiBrief: cached.answer,
                magiBriefError: null,
                magiBriefLoading: false,
                magiBriefGeneratedAt: cached.timestamp,
                magiBriefCached: true,
                magiBriefModalOpen: true,
            });
            return;
        }

        this.setState({ magiBriefLoading: true, magiBriefError: null, magiBriefCached: false, magiBriefModalOpen: true });
        try {
            const question = [
                'Prepare an operator movement brief for this software changelog.',
                'Focus on what changed, which signals need review, what can be ignored, and the next 3 actions.',
                'Be concise and use the supplied evidence packet only.'
            ].join(' ');
            const response = await api.askAIAnalyst(orgId, {
                question,
                responseMode: 'brief',
                context: {
                    source: 'inventory-changelog',
                    route: '#!/changelog',
                    packet,
                },
                ...(rewindContext.isActive() ? { asOfDate: rewindContext.getDate() } : {})
            });
            const answer = response?.data?.answer || response?.answer || response?.data?.response || response?.response;
            if (!answer) throw new Error(response?.message || 'No MAGI brief returned');
            this._setMagiBriefCache(packet, answer);
            this.setState({
                magiBrief: answer,
                magiBriefLoading: false,
                magiBriefGeneratedAt: Date.now(),
                magiBriefCached: false,
                magiBriefModalOpen: true,
            });
        } catch (err) {
            this.setState({
                magiBriefLoading: false,
                magiBriefError: err?.message || 'MAGI brief failed',
                magiBriefModalOpen: true,
            });
        }
    }

    versionText(event) {
        if (event.changeType === 'Updated') {
            const fromVersion = event.previousVersion || event.version || 'previous build';
            const toVersion = event.nextVersion || event.version || 'current build';
            return `${fromVersion} -> ${toVersion}`;
        }
        return event.version || event.nextVersion || 'version not reported';
    }

    updateVersionPair(event) {
        if (event?.changeType !== 'Updated') return { fromVersion: '', toVersion: '' };
        const fromVersion = event.previousVersion || (event.nextVersion ? event.version : '') || event.version || '';
        const toVersion = event.nextVersion || event.version || '';
        return { fromVersion, toVersion };
    }

    isPossibleDowngrade(event) {
        const { fromVersion, toVersion } = this.updateVersionPair(event);
        return event?.changeType === 'Updated' && compareVersions(fromVersion, toVersion) > 0;
    }

    changeMeaning(event) {
        if (this.isPossibleDowngrade(event)) return 'Version moved backward; confirm rollback was intentional and not failed update drift.';
        if (event.changeType === 'Uninstalled' && ['cloud-reconciled-uninstall', 'hardresync-uninstalled'].includes(String(event.appStatus || '').toLowerCase())) {
            return 'Inventory reconciliation closed this install; exposure should close if no active install remains.';
        }
        if (event.changeType === 'Uninstalled') return 'Removed from this device; exposure should close if no other active install remains.';
        if (event.changeType === 'Updated') return 'Version changed; verify vulnerable versions were replaced.';
        return 'First observed on this device; inventory baseline expanded.';
    }

    softwareHref(subject) {
        const appName = subject?.appName || '';
        const vendor = subject?.vendor || '';
        const version = subject?.changeType === 'Updated'
            ? this.updateVersionPair(subject).toVersion
            : (subject?.version || subject?.nextVersion || '');
        const filterParts = [
            appName ? `app:${appName}` : '',
            vendor ? `vendor:${vendor}` : '',
            version ? `version:${version}` : ''
        ].filter(Boolean);
        return filterParts.length
            ? `#!/apps?tab=all&filter=${encodeURIComponent(filterParts.join('|'))}`
            : '#!/apps?tab=all';
    }

    focusRelatedChanges(event, extra = {}) {
        this._setPagedState({
            changeTypeFilter: extra.changeTypeFilter || 'all',
            searchText: extra.searchText ?? [event?.appName, event?.vendor].filter(Boolean).join(' '),
            selectedEventKey: this._eventKey(event),
        });
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
                                <div class="d-flex gap-1 flex-wrap justify-content-end align-items-center">
                                    ${app.installs ? html`<span class="badge bg-success text-white">${app.installs} installed</span>` : null}
                                    ${app.updates ? html`<span class="badge bg-primary text-white">${app.updates} updated</span>` : null}
                                    ${app.removals ? html`<span class="badge bg-danger text-white">${app.removals} removed</span>` : null}
                                    <a class="btn btn-sm btn-ghost-secondary" href=${this.softwareHref(app)} title="Open in Software">Open</a>
                                </div>
                            </div>
                        </div>
                    `) : html`<div class="list-group-item text-muted">No applications match the current filters.</div>`}
                </div>
            </div>
        `;
    }

    renderAttentionQueue(signals, thresholds) {
        return html`
            <div class="card h-100 changelog-attention-card">
                <div class="card-header">
                    <h3 class="card-title">Needs attention</h3>
                    <div class="card-actions text-muted small">Thresholds: ${thresholds.removalConcentration} removals · ${thresholds.updateWave} updates · ${thresholds.deviceBurst} device events</div>
                </div>
                <div class="list-group list-group-flush">
                    ${signals.map(signal => html`
                        <div class="list-group-item">
                            <div class="d-flex gap-3 align-items-start">
                                <span class=${`avatar avatar-sm bg-${signal.tone}-lt text-${signal.tone} flex-shrink-0`}>
                                    <i class=${`ti ${signal.icon}`}></i>
                                </span>
                                <div class="flex-fill min-width-0">
                                    <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                                        <div class="min-width-0">
                                            <div class="fw-semibold text-truncate">${signal.title}</div>
                                            <div class="text-muted small">${signal.detail}</div>
                                        </div>
                                        <span class=${`badge bg-${signal.tone}-lt text-${signal.tone}`}>${signal.badge}</span>
                                    </div>
                                    ${signal.action ? html`
                                        <button class=${`btn btn-sm btn-outline-${signal.tone} mt-2`} type="button" onClick=${signal.action}>
                                            ${signal.actionLabel}
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    renderMagiBriefPanel(packet) {
        const { magiBrief, magiBriefLoading, magiBriefError, magiBriefGeneratedAt, magiBriefCached } = this.state;
        const generatedLabel = magiBriefGeneratedAt ? fmtDateTime(magiBriefGeneratedAt) : '';

        return html`
            <div class="card mb-3 changelog-magi-card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title mb-1">Officer MAGI movement brief</h3>
                        <div class="text-muted small">${packet.summary.totalEvents} events · ${packet.signals.length} signal${packet.signals.length === 1 ? '' : 's'} · ${packet.summary.apps} apps</div>
                    </div>
                    <div class="card-actions d-flex gap-2 flex-wrap">
                        ${magiBriefCached ? html`<span class="badge bg-success-lt text-success align-self-center">Cached</span>` : ''}
                        ${generatedLabel ? html`<span class="badge bg-secondary-lt text-secondary align-self-center">${generatedLabel}</span>` : ''}
                        ${magiBrief ? html`
                            <button class="btn btn-sm btn-outline-primary" type="button" onClick=${() => this.setState({ magiBriefModalOpen: true })}>
                                <i class="ti ti-file-text me-1"></i>Read brief
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-primary" type="button" disabled=${magiBriefLoading} onClick=${() => this.askMagiBrief(packet)}>
                            ${magiBriefLoading ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-sparkles me-1"></i>`}
                            ${magiBrief ? 'Refresh brief' : 'Generate brief'}
                        </button>
                    </div>
                </div>
                ${(magiBrief || magiBriefLoading || magiBriefError) ? html`
                    <div class="card-body">
                        ${magiBriefLoading ? html`<div class="text-muted d-flex align-items-center gap-2"><span class="spinner-border spinner-border-sm"></span>Preparing movement brief...</div>` : ''}
                        ${magiBriefError ? html`<div class="alert alert-warning mb-0">${magiBriefError}</div>` : ''}
                        ${magiBrief ? html`
                            <div class="d-flex align-items-start gap-3">
                                <span class="avatar avatar-sm bg-purple-lt text-purple flex-shrink-0"><i class="ti ti-sparkles"></i></span>
                                <div class="min-width-0">
                                    <div class="fw-semibold mb-1">Movement brief ready</div>
                                    <div class="text-muted small">${this.briefPreview(magiBrief)}</div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderMagiBriefModal(packet) {
        const { magiBrief, magiBriefLoading, magiBriefError, magiBriefGeneratedAt, magiBriefCached, magiBriefModalOpen } = this.state;
        if (!magiBriefModalOpen) return null;

        return html`
            <div class="modal modal-blur show d-block changelog-magi-modal" tabIndex="-1" role="dialog" style="background:rgba(15,23,42,0.55);" onClick=${event => {
                if (event.target.classList.contains('modal')) this.setState({ magiBriefModalOpen: false });
            }}>
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document" onClick=${event => event.stopPropagation()}>
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <div>
                                <div class="text-uppercase text-muted small fw-semibold">Officer MAGI</div>
                                <h5 class="modal-title">Software movement brief</h5>
                                <div class="text-muted small">
                                    ${packet.summary.totalEvents} events · ${packet.summary.apps} apps · ${packet.summary.devices} devices
                                    ${magiBriefGeneratedAt ? html` · ${fmtDateTime(magiBriefGeneratedAt)}` : ''}
                                    ${magiBriefCached ? html` · cached` : ''}
                                </div>
                            </div>
                            <button type="button" class="btn-close" aria-label="Close" onClick=${() => this.setState({ magiBriefModalOpen: false })}></button>
                        </div>
                        <div class="modal-body">
                            ${magiBriefLoading ? html`
                                <div class="d-flex align-items-center gap-2 text-muted py-4">
                                    <span class="spinner-border spinner-border-sm"></span>
                                    Preparing movement brief...
                                </div>
                            ` : ''}
                            ${magiBriefError ? html`<div class="alert alert-warning">${magiBriefError}</div>` : ''}
                            ${magiBrief ? this.renderMarkdown(magiBrief, 'markdown magi-response changelog-magi-markdown') : ''}
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline-secondary" type="button" onClick=${() => this.downloadEvidencePacket(packet)}>
                                <i class="ti ti-download me-1"></i>Export packet
                            </button>
                            <button class="btn btn-primary" type="button" disabled=${magiBriefLoading} onClick=${() => this.askMagiBrief(packet)}>
                                ${magiBriefLoading ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-sparkles me-1"></i>`}
                                Refresh brief
                            </button>
                            <button class="btn" type="button" onClick=${() => this.setState({ magiBriefModalOpen: false })}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderMovementHistogram(days) {
        const maxTotal = Math.max(1, ...days.map(day => day.total));
        const total = days.reduce((sum, day) => sum + day.total, 0);

        return html`
            <div class="card h-100 changelog-movement-card">
                <div class="card-header">
                    <h3 class="card-title">Movement over 7 days</h3>
                    <div class="card-actions text-muted small">${total} event${total === 1 ? '' : 's'}</div>
                </div>
                <div class="card-body">
                    <div class="changelog-movement-bars" role="img" aria-label="Seven day software movement by install update and removal counts">
                        ${days.map(day => {
                            const barHeight = Math.max(6, Math.round((day.total / maxTotal) * 100));
                            const installHeight = day.total ? Math.max(3, Math.round((day.installs / day.total) * barHeight)) : 0;
                            const updateHeight = day.total ? Math.max(3, Math.round((day.updates / day.total) * barHeight)) : 0;
                            const removalHeight = day.total ? Math.max(3, Math.round((day.removals / day.total) * barHeight)) : 0;
                            return html`
                                <div class="changelog-movement-day">
                                    <div class="changelog-bar-stack" title=${`${day.label}: ${day.total} changes`}>
                                        ${day.total ? html`
                                            ${day.removals ? html`<span class="changelog-bar-segment changelog-bar-removals" style=${`height:${removalHeight}%;`}></span>` : ''}
                                            ${day.updates ? html`<span class="changelog-bar-segment changelog-bar-updates" style=${`height:${updateHeight}%;`}></span>` : ''}
                                            ${day.installs ? html`<span class="changelog-bar-segment changelog-bar-installs" style=${`height:${installHeight}%;`}></span>` : ''}
                                        ` : html`<span class="changelog-bar-empty"></span>`}
                                    </div>
                                    <div class="text-muted small text-center mt-2">${day.label}</div>
                                    <div class="fw-semibold text-center small">${day.total}</div>
                                </div>
                            `;
                        })}
                    </div>
                    <div class="d-flex gap-2 flex-wrap mt-3">
                        <span class="badge bg-success text-white">Installed</span>
                        <span class="badge bg-primary text-white">Updated</span>
                        <span class="badge bg-danger text-white">Removed</span>
                    </div>
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

    renderLedgerRows(events, totalEvents) {
        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Change ledger</h3>
                    <div class="card-actions text-muted small">${totalEvents} matching event${totalEvents === 1 ? '' : 's'}</div>
                </div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table mb-0">
                        <thead>
                            <tr>
                                <${SortableHeader} label="When" field="when" sortField=${this.state.sortField} sortAsc=${this.state.sortAsc} onSort=${field => this._sort(field)} style="width:150px;" />
                                <${SortableHeader} label="Action" field="action" sortField=${this.state.sortField} sortAsc=${this.state.sortAsc} onSort=${field => this._sort(field)} style="width:112px;" />
                                <${SortableHeader} label="Application" field="app" sortField=${this.state.sortField} sortAsc=${this.state.sortAsc} onSort=${field => this._sort(field)} />
                                <${SortableHeader} label="Version" field="version" sortField=${this.state.sortField} sortAsc=${this.state.sortAsc} onSort=${field => this._sort(field)} />
                                <${SortableHeader} label="Device" field="device" sortField=${this.state.sortField} sortAsc=${this.state.sortAsc} onSort=${field => this._sort(field)} />
                                <th>Meaning</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${events.map((event, index) => {
                                const key = this._eventKey(event, index);
                                const possibleDowngrade = this.isPossibleDowngrade(event);
                                return html`
                                <tr key=${key}
                                    class=${`${this.state.selectedEventKey === key ? 'table-active' : ''} ${possibleDowngrade ? 'changelog-row-attention' : ''}`.trim()}
                                    style="cursor:pointer;"
                                    onClick=${() => this.setState({ selectedEventKey: key })}>
                                    <td class="text-muted small" style="white-space:nowrap;">${fmtDateTime(this._eventMoment(event))}</td>
                                    <td><span class="badge ${CHANGE_BADGE[event.changeType] || 'bg-secondary text-white'}">${event.changeType || '?'}</span></td>
                                    <td>
                                        <div class="fw-medium">${event.appName || 'Unknown app'}</div>
                                        <div class="text-muted small">${event.vendor || 'Unknown vendor'}</div>
                                    </td>
                                    <td class="text-muted small">
                                        <code>${this.versionText(event)}</code>
                                        ${possibleDowngrade ? html`<span class="badge bg-danger-lt text-danger ms-1">Rollback?</span>` : ''}
                                    </td>
                                    <td>
                                        <a href=${event.deviceId ? `#!/devices/${event.deviceId}` : '#!/devices'} class="text-reset small">
                                            ${event.deviceName || event.deviceId || 'Unknown device'}
                                        </a>
                                    </td>
                                    <td class=${possibleDowngrade ? 'small text-danger' : 'text-muted small'}>${this.changeMeaning(event)}</td>
                                </tr>
                            `;})}
                        </tbody>
                    </table>
                </div>
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
        const pagedEvents = this._paginateRows(sortedEvents);
        const allChangedApps = this.getChangedApps(filtered, 0);
        const allDeviceRollups = this.getDeviceRollups(filtered, 0);
        const changedApps = allChangedApps.slice(0, 8);
        const deviceRollups = allDeviceRollups.slice(0, 8);
        const thresholds = this.getCalibratedThresholds(allChangedApps, allDeviceRollups);
        const attentionSignals = this.getAttentionSignals(filtered, allChangedApps, allDeviceRollups, thresholds);
        const movementDays = this.getMovementDays(filtered);
        const latestEvent = sortedEvents[0] || null;
        const selectedEvent = sortedEvents.find((event, index) => this._eventKey(event, index) === this.state.selectedEventKey) || latestEvent;
        const evidencePacket = this.buildEvidencePacket({
            filtered,
            sortedEvents,
            stats,
            recentStats,
            changedApps: allChangedApps,
            deviceRollups: allDeviceRollups,
            attentionSignals,
            movementDays,
            thresholds,
            selectedEvent,
        });
        const activeFilters = [
            changeTypeFilter !== 'all' ? changeTypeFilter : null,
            deviceFilter ? 'Device scoped' : null,
            searchText ? `Search: ${searchText}` : null,
            groupBy !== 'application' ? `Grouped by ${groupBy}` : null
        ].filter(Boolean);
        const isInitialLoading = loading && !events.length;

        if (error && !events.length) {
            return html`
                <div class="inventory-changelog-page" key="changelog-error">
                    <div class="alert alert-danger m-3">
                        <h4 class="alert-title">Error loading changelog</h4>
                        <div>${error}</div>
                        <button class="btn btn-sm btn-danger mt-2" onClick=${() => this.loadChangelog(true)}>Retry</button>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="inventory-changelog-page" key="changelog-loaded">
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Software Changelog</h2>
                                ${(isRefreshingInBackground || isInitialLoading) ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:12px;height:12px;"></span>
                                        ${isInitialLoading ? 'Loading...' : 'Refreshing...'}
                                    </span>
                                ` : ''}
                            </div>
                            <p class="page-subtitle mt-1 mb-0">
                                Install, update, and uninstall events across all devices
                                ${events.length > 0 ? html` · <span class="text-muted">${events.length} events loaded${this.state.total > events.length ? ` of ${this.state.total}` : ''}</span>` : ''}
                                ${rewindContext.isActive() ? html` · <span class="badge bg-azure-lt text-azure">As of ${api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
                            </p>
                        </div>
                        <div class="col-auto d-print-none">
                            <div class="btn-list">
                                <button class="btn btn-primary" type="button" disabled=${this.state.magiBriefLoading || isInitialLoading || filtered.length === 0} onClick=${() => this.askMagiBrief(evidencePacket)}>
                                    ${this.state.magiBriefLoading ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-sparkles me-1"></i>`}
                                    Ask MAGI
                                </button>
                                <button class="btn btn-outline-secondary" type="button" disabled=${isInitialLoading || filtered.length === 0} onClick=${() => this.downloadEvidencePacket(evidencePacket)}>
                                    <i class="ti ti-download me-1"></i>Export packet
                                </button>
                                <button class="btn btn-outline-secondary" type="button" disabled=${isRefreshingInBackground || isInitialLoading} onClick=${() => this.loadChangelog(true)}>
                                    <i class="ti ti-refresh me-1"></i>Refresh
                                </button>
                            </div>
                            ${this.state.exportStatus ? html`<div class="text-muted small mt-1 text-end">${this.state.exportStatus}</div>` : ''}
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
                                ${recentStats.possibleDowngrades ? html`<span class="badge bg-danger text-white">${recentStats.possibleDowngrades} rollback signals</span>` : ''}
                                <span class="badge bg-secondary-lt text-secondary">${stats.apps} apps touched</span>
                            </div>
                        </div>
                    </div>

                    <${FilterToolbar}
                        resultCount=${filtered.length}
                        totalCount=${events.length}
                        activeFilters=${activeFilters}
                        onClear=${() => this._setPagedState({ changeTypeFilter: 'all', searchText: '', deviceFilter: '', groupBy: 'application' })}>
                                <div class="triage-filter-block">
                                    <label class="form-label small text-muted mb-1">Change type</label>
                                    <${SegmentedControl}
                                        options=${[
                                            { id: 'all', label: 'All' },
                                            { id: 'Installed', label: 'Installed' },
                                            { id: 'Updated', label: 'Updated' },
                                            { id: 'Uninstalled', label: 'Removed' }
                                        ]}
                                        value=${changeTypeFilter}
                                        onChange=${value => this._setPagedState({ changeTypeFilter: value })}
                                    />
                                </div>
                                <div class="triage-filter-block">
                                    <label class="form-label small text-muted mb-1">Group by</label>
                                    <${SegmentedControl}
                                        options=${[
                                            { id: 'application', label: 'Application' },
                                            { id: 'vendor', label: 'Vendor' },
                                            { id: 'device', label: 'Device' }
                                        ]}
                                        value=${groupBy}
                                        onChange=${value => this._setPagedState({ groupBy: value })}
                                    />
                                </div>
                                ${devices.length > 1 ? html`
                                    <div class="triage-filter-block">
                                        <label class="form-label small text-muted mb-1">Device</label>
                                        <select class="form-select form-select-sm" style="min-width:200px;"
                                                value=${deviceFilter}
                                                onChange=${e => this.setState({ deviceFilter: e.target.value, page: 1 }, () => {
                                                    try { localStorage.removeItem(this._cacheKey()); } catch {}
                                                    this.loadChangelog(true);
                                                })}>
                                            <option value="">All devices</option>
                                            ${devices.map(device => html`<option value=${device.id}>${device.name}</option>`)}
                                        </select>
                                    </div>
                                ` : ''}
                                <div class="triage-filter-block grow">
                                    <label class="form-label small text-muted mb-1">Search</label>
                                    <input type="search" class="form-control form-control-sm"
                                           placeholder="Search app, vendor, device…"
                                           value=${searchText}
                                           onInput=${e => this._setPagedState({ searchText: e.target.value })} />
                                </div>
                    </${FilterToolbar}>

                    ${isInitialLoading ? html`
                        <div class="changelog-results" key="changelog-results-loading">
                            <div class="card">
                                <div class="card-body text-center py-5">
                                    <div class="spinner-border text-primary mb-3"></div>
                                    <div class="text-muted">Loading changelog events...</div>
                                </div>
                            </div>
                        </div>
                    ` : filtered.length === 0 ? html`
                        <div class="changelog-results" key="changelog-results-empty">
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
                        </div>
                    ` : html`
                        <div class="changelog-results" key="changelog-results-data">
                        ${this.renderMagiBriefPanel(evidencePacket)}

                        <div class="row row-cards mb-3">
                            <div class="col-lg-7">${this.renderAttentionQueue(attentionSignals, thresholds)}</div>
                            <div class="col-lg-5">${this.renderMovementHistogram(movementDays)}</div>
                        </div>

                        <div class="row row-cards mb-3">
                            <div class="col-lg-7">${this.renderChangedApps(changedApps)}</div>
                            <div class="col-lg-5">${this.renderDeviceRollups(deviceRollups)}</div>
                        </div>

                        ${selectedEvent ? html`
                            <div class="mb-3">
                                <${PortalDataGrid}
                                    title="Selected event"
                                    actions=${html`
                                        <div class="d-flex gap-2 flex-wrap">
                                            <button class="btn btn-sm btn-outline-secondary" type="button" onClick=${() => this.focusRelatedChanges(selectedEvent)}>
                                                <i class="ti ti-filter me-1"></i>Related changes
                                            </button>
                                            <a class="btn btn-sm btn-outline-primary" href=${this.softwareHref(selectedEvent)}>
                                                <i class="ti ti-packages me-1"></i>Open software
                                            </a>
                                            <a class="btn btn-sm btn-outline-secondary" href=${selectedEvent.deviceId ? `#!/devices/${selectedEvent.deviceId}` : '#!/devices'}>
                                                <i class="ti ti-device-desktop me-1"></i>Open device
                                            </a>
                                        </div>
                                    `}
                                    items=${[
                                        { label: 'When', value: fmtDateTime(this._eventMoment(selectedEvent)) },
                                        { label: 'Action', value: html`<span class=${`badge ${CHANGE_BADGE[selectedEvent.changeType] || 'bg-secondary text-white'}`}>${selectedEvent.changeType || '?'}</span>` },
                                        { label: 'Application', value: selectedEvent.appName || 'Unknown app' },
                                        { label: 'Vendor', value: selectedEvent.vendor || 'Unknown vendor' },
                                        { label: 'Version', value: html`<code>${this.versionText(selectedEvent)}</code>` },
                                        { label: 'Device', value: selectedEvent.deviceName || selectedEvent.deviceId || 'Unknown device' },
                                        { label: 'Signal', value: this.isPossibleDowngrade(selectedEvent) ? html`<span class="badge bg-danger-lt text-danger">Possible rollback</span>` : html`<span class="badge bg-secondary-lt text-secondary">Normal movement</span>` },
                                        { label: 'First seen / installed', value: selectedEvent.firstSeen ? fmtDateTime(selectedEvent.firstSeen) : '—' },
                                        { label: 'Last seen', value: selectedEvent.lastSeen ? fmtDateTime(selectedEvent.lastSeen) : '—' },
                                        { label: 'Observed', value: fmtDuration(selectedEvent.firstSeen, this._dwellEndMoment(selectedEvent)) || '—' },
                                        { label: 'Meaning', value: this.changeMeaning(selectedEvent) }
                                    ]}
                                />
                            </div>
                        ` : ''}

                        ${this.renderLedgerRows(pagedEvents.rows, sortedEvents.length)}
                        <div class="card mt-3">
                            <${PaginationBar}
                                page=${pagedEvents.page}
                                pageSize=${pagedEvents.pageSize}
                                total=${pagedEvents.total}
                                itemLabel="events"
                                onPageChange=${page => this.setState({ page })}
                                onPageSizeChange=${pageSize => this.setState({ pageSize, page: 1 })}
                            />
                        </div>
                        </div>
                    `}
                </div>
            </div>
            ${this.renderMagiBriefModal(evidencePacket)}
            </div>
        `;
    }
}

export default InventoryChangelogPage;
