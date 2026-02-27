import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

const TERMINAL_STATUSES = new Set(['Completed', 'Failed', 'Unsupported', 'TimedOut', 'Cancelled']);
const DEVICE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEVICE_CACHE_PREFIX = 'response-actions-devices-v1';

const ACTION_CATALOG = [
    { type: 'Probe', label: 'Probe', icon: 'ti ti-radar-2', tooltip: 'Collect a comprehensive security posture snapshot from the device', enabled: true },
    { type: 'TriggerScan', label: 'Scan', icon: 'ti ti-shield-search', tooltip: 'Initiate a full system vulnerability and malware scan', enabled: true },
    { type: 'RefreshInventory', label: 'Inventory', icon: 'ti ti-refresh', tooltip: 'Force a refresh of the installed applications inventory', enabled: true },
    { type: 'CollectLogs', label: 'Logs', icon: 'ti ti-file-zip', tooltip: 'Securely collect and upload encrypted client diagnostic logs', enabled: true },
    { type: 'CheckUpdates', label: 'Updates', icon: 'ti ti-device-desktop-up', tooltip: 'Trigger a check for the latest OS and application updates', enabled: true },
    { type: 'ConfigureSecuritySettings', label: 'Config', icon: 'ti ti-adjustments', tooltip: 'Apply new security configuration settings (Requires structured payload)', enabled: false },
    { type: 'TriggerSecurityActions', label: 'Actions', icon: 'ti ti-bolt', tooltip: 'Execute specific security remediation actions (Requires structured payload)', enabled: false },
    { type: 'Isolate', label: 'Isolate', icon: 'ti ti-lock', tooltip: 'Isolate the device from the network (Not supported in user-session mode)', enabled: false },
    { type: 'RemoveIsolation', label: 'Unisolate', icon: 'ti ti-lock-open', tooltip: 'Restore network connectivity to the device (Not supported in user-session mode)', enabled: false }
];

function toMs(value) {
    if (!value) return null;
    const dt = new Date(value);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
}

function formatDateTime(value) {
    if (!value) return '—';
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return '—';
    return dt.toLocaleString();
}

function fromNow(value) {
    const whenMs = toMs(value);
    if (!whenMs) return '—';
    const deltaSec = Math.round((whenMs - Date.now()) / 1000);
    if (Math.abs(deltaSec) < 60) return deltaSec >= 0 ? 'in <1 min' : '<1 min ago';
    const absMin = Math.round(Math.abs(deltaSec) / 60);
    if (absMin < 60) return deltaSec >= 0 ? `in ${absMin} min` : `${absMin} min ago`;
    const absHr = Math.round(absMin / 60);
    return deltaSec >= 0 ? `in ${absHr} hr` : `${absHr} hr ago`;
}

function statusBadgeClass(status) {
    switch ((status || '').toLowerCase()) {
        case 'queued': return 'bg-secondary text-white';
        case 'delivered':
        case 'executing': return 'bg-primary text-white';
        case 'completed': return 'bg-success text-white';
        case 'failed': return 'bg-danger text-white';
        case 'unsupported': return 'bg-warning text-white';
        case 'timedout': return 'bg-danger text-white';
        case 'cancelled': return 'bg-dark text-white';
        default: return 'bg-secondary text-white';
    }
}

function shortText(value, max = 140) {
    if (!value) return '—';
    const text = String(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

function getResponseActionsQueryParam(name) {
    try {
        const hash = window.location.hash || '';
        const queryIndex = hash.indexOf('?');
        if (queryIndex < 0) return null;
        const qs = hash.slice(queryIndex + 1);
        const params = new URLSearchParams(qs);
        return params.get(name);
    } catch {
        return null;
    }
}

function getResponseActionsDeviceSelectionFromQuery() {
    const selected = [];

    const csv = getResponseActionsQueryParam('deviceIds');
    if (csv) {
        for (const raw of csv.split(',')) {
            const value = (raw || '').trim();
            if (value) {
                selected.push(value);
            }
        }
    }

    return Array.from(new Set(selected));
}

function getActionByType(type) {
    return ACTION_CATALOG.find(a => a.type === type) || ACTION_CATALOG[0];
}

function getDeviceCacheKey(orgId) {
    return `${DEVICE_CACHE_PREFIX}:${orgId}`;
}

function getDeviceConnectivity(device) {
    const state = (device?.state || '').toUpperCase();
    if (state === 'BLOCKED' || state === 'DELETED' || state === 'ERROR') {
        return 'error';
    }

    const lastHeartbeatMs = toMs(device?.lastHeartbeat);
    if (!lastHeartbeatMs) {
        return 'offline';
    }

    const staleMs = Date.now() - lastHeartbeatMs;
    if (staleMs > 24 * 60 * 60 * 1000) {
        return 'offline';
    }

    return 'online';
}

function getDeviceButtonClass(device, selected) {
    const connectivity = getDeviceConnectivity(device);
    let classes = '';
    
    if (selected) {
        classes += 'response-box-btn-selected ';
    }
    
    if (connectivity === 'online') classes += 'device-online';
    else if (connectivity === 'offline') classes += 'device-offline';
    else classes += 'device-error';
    
    return classes;
}

function getDeviceStateLabel(device) {
    const connectivity = getDeviceConnectivity(device);
    if (connectivity === 'online') return 'Online';
    if (connectivity === 'offline') return 'Offline';
    return 'Error';
}

export class ResponseActionsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            devices: [],
            commands: [],
            selectedCommandId: null,
            selectedCommandDetail: null,
            selectedDeviceIds: [],
            selectedActionType: null,
            parameterText: '',
            queueing: false,
            loadingDevices: false,
            refreshingDetail: false,
            nextCheckAt: null,
            pollTimerActive: false,
            isSiteAdmin: false,
            showAdvancedModal: false,
            showCommandDetailModal: false,
            showControlPanel: true,
            deviceCacheFromSWR: false
        };

        this.orgUnsubscribe = null;
        this.pollTimeoutId = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadPage());
        this.loadPage();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        this.clearPollTimer();
    }

    getCurrentOrgId() {
        return orgContext.getCurrentOrg()?.orgId || window.auth?.getUser?.()?.email || null;
    }

    applyDeepLinkSelection(devices) {
        const requestedIds = getResponseActionsDeviceSelectionFromQuery();
        if (requestedIds.length === 0) return;

        const knownIds = new Set((devices || []).map(d => d.id));
        const selectedIds = requestedIds.filter(id => knownIds.has(id));
        if (selectedIds.length > 0) {
            this.setState({ selectedDeviceIds: selectedIds });
        }
    }

    readDeviceCache(orgId) {
        try {
            const raw = localStorage.getItem(getDeviceCacheKey(orgId));
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            if (!parsed?.timestamp || !Array.isArray(parsed?.devices)) return null;
            if (Date.now() - parsed.timestamp > DEVICE_CACHE_TTL_MS) return null;
            return parsed.devices;
        } catch {
            return null;
        }
    }

    writeDeviceCache(orgId, devices) {
        try {
            localStorage.setItem(getDeviceCacheKey(orgId), JSON.stringify({
                timestamp: Date.now(),
                devices
            }));
        } catch {
            // no-op
        }
    }

    clearPollTimer() {
        if (this.pollTimeoutId) {
            clearTimeout(this.pollTimeoutId);
            this.pollTimeoutId = null;
        }
        if (this.state.pollTimerActive) {
            this.setState({ pollTimerActive: false });
        }
    }

    scheduleNextCheck(nextCheckAt) {
        this.clearPollTimer();
        const nextMs = toMs(nextCheckAt);
        if (!nextMs) {
            this.setState({ nextCheckAt: null });
            return;
        }

        const delay = Math.max(5000, nextMs - Date.now());
        this.setState({ nextCheckAt, pollTimerActive: true });
        this.pollTimeoutId = setTimeout(() => this.refreshForSelectedCommand(), delay);
    }

    async loadPage() {
        const orgId = this.getCurrentOrgId();
        if (!orgId) {
            this.setState({ loading: false, error: 'No organization selected' });
            return;
        }

        const isSiteAdmin = orgContext.isSiteAdmin();
        const cachedDevices = this.readDeviceCache(orgId);

        this.setState({
            loading: true,
            error: null,
            isSiteAdmin,
            devices: cachedDevices || [],
            deviceCacheFromSWR: !!cachedDevices,
            loadingDevices: true
        });

        try {
            await this.loadCommands();
            this.setState({ loading: false });

            await this.loadDevices({ skipCache: false, silent: true, source: 'warm' });

            this.loadDevices({ skipCache: true, silent: true, source: 'revalidate' }).catch(() => {});

            if (this.state.selectedCommandId) {
                await this.loadCommandDetail(this.state.selectedCommandId);
            }
        } catch (err) {
            this.setState({ loading: false, error: err?.message || 'Failed to load response actions' });
        }
    }

    normalizeDevices(rawDevices) {
        return (rawDevices || []).map(d => {
            const id = d.id || d.deviceId || d.rowKey || '';
            const name = d.name || d.deviceName || d.machineName || id;
            const state = (d.state || d.deviceState || 'Unknown').toString();
            return {
                id,
                name,
                state,
                isEnabled: d.isEnabled !== false,
                lastHeartbeat: d.lastHeartbeat || d.lastSeen || null
            };
        }).filter(d => !!d.id && d.isEnabled);
    }

    async loadDevices(options = {}) {
        const { skipCache = false, silent = false, source = 'default' } = options;
        const orgId = this.getCurrentOrgId();
        if (!silent) {
            this.setState({ loadingDevices: true });
        }

        try {
            const response = await api.getDevices(orgId, { view: 'targets', limit: 500 }, { skipCache });
            const list = response?.data?.devices || response?.data || [];
            const devices = this.normalizeDevices(list);

            if (devices.length > 0) {
                this.writeDeviceCache(orgId, devices);
            }

            this.applyDeepLinkSelection(devices);
            this.setState({
                devices,
                loadingDevices: false,
                deviceCacheFromSWR: source !== 'revalidate' && this.state.deviceCacheFromSWR
            });
        } catch (err) {
            this.setState({ loadingDevices: false });
            if (source === 'manual') {
                window.toast?.show?.(err?.message || 'Failed to refresh devices', 'error');
            }
            throw err;
        }
    }

    async loadCommands() {
        const orgId = this.getCurrentOrgId();
        const response = await api.getCommands(orgId, null, 50);
        const commands = response?.data || [];
        this.setState({ commands });
        return commands;
    }

    async loadCommandDetail(commandId, options = {}) {
        const orgId = this.getCurrentOrgId();
        if (!orgId || !commandId) return;

        this.setState({ refreshingDetail: !options.silent });
        try {
            const response = await api.getCommandDetail(orgId, commandId);
            if (!response?.success) {
                throw new Error(response?.message || 'Failed to load command detail');
            }

            const detail = response.data;
            this.setState({
                selectedCommandId: commandId,
                selectedCommandDetail: detail,
                refreshingDetail: false
            });

            const hasActiveDevices = (detail?.devices || []).some(d => !TERMINAL_STATUSES.has(d?.status));
            if (hasActiveDevices && detail?.nextCheckAt) {
                this.scheduleNextCheck(detail.nextCheckAt);
            } else {
                this.clearPollTimer();
                this.setState({ nextCheckAt: detail?.nextCheckAt || null });
            }
        } catch (err) {
            this.setState({ refreshingDetail: false });
            window.toast?.show?.(err?.message || 'Failed to load command detail', 'error');
        }
    }

    async refreshForSelectedCommand() {
        const commandId = this.state.selectedCommandId;
        if (!commandId) return;

        await this.loadCommands();
        await this.loadCommandDetail(commandId, { silent: true });
    }

    toggleDevice(deviceId) {
        const selected = new Set(this.state.selectedDeviceIds);
        if (selected.has(deviceId)) {
            selected.delete(deviceId);
        } else {
            selected.add(deviceId);
        }
        this.setState({ selectedDeviceIds: Array.from(selected) });
    }

    selectAllDevices() {
        const all = this.state.devices.map(d => d.id);
        this.setState({ selectedDeviceIds: all });
    }

    clearDeviceSelection() {
        this.setState({ selectedDeviceIds: [] });
    }

    parseParameters() {
        const text = (this.state.parameterText || '').trim();
        if (!text) return null;
        try {
            JSON.parse(text);
            return text;
        } catch {
            throw new Error('Parameters must be valid JSON');
        }
    }

    async queueCommand(useOrgFanout = false) {
        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        if (!this.state.selectedActionType) {
            window.toast?.show?.('Select one action before firing command', 'warning');
            return;
        }

        const action = getActionByType(this.state.selectedActionType);
        if (!action?.enabled) {
            window.toast?.show?.('Selected action is currently out of service', 'warning');
            return;
        }

        const selectedDeviceIds = this.state.selectedDeviceIds || [];
        if (!useOrgFanout && selectedDeviceIds.length === 0) {
            window.toast?.show?.('Select at least one target device', 'warning');
            return;
        }

        let parameters = null;
        try {
            parameters = this.state.isSiteAdmin ? this.parseParameters() : null;
        } catch (err) {
            window.toast?.show?.(err.message, 'error');
            return;
        }

        this.setState({ queueing: true });
        try {
            const result = await api.queueCommand(
                orgId,
                action.type,
                useOrgFanout ? null : selectedDeviceIds,
                parameters
            );

            if (!result?.success) {
                throw new Error(result?.message || 'Failed to queue command');
            }

            const commandId = result?.data?.commandId;
            const targetCount = result?.data?.targetCount ?? (useOrgFanout ? 0 : selectedDeviceIds.length);
            const pollHint = result?.data?.pollHint;

            this.setState({
                queueing: false,
                selectedDeviceIds: [],
                parameterText: '',
                selectedActionType: null
            });

            await this.loadCommands();
            if (commandId) {
                await this.loadCommandDetail(commandId);
            }

            const nextCheckText = pollHint?.nextCheckAt
                ? ` Next update ${fromNow(pollHint.nextCheckAt)}.`
                : '';
            window.toast?.show?.(`${action.type} queued for ${targetCount} device(s).${nextCheckText}`, 'success');

            if (pollHint?.nextCheckAt) {
                this.scheduleNextCheck(pollHint.nextCheckAt);
            }
        } catch (err) {
            this.setState({ queueing: false });
            window.toast?.show?.(err?.message || 'Failed to queue command', 'error');
        }
    }

    toggleAction(actionType) {
        const action = getActionByType(actionType);
        if (!action?.enabled) return;
        this.setState(prevState => ({
            selectedActionType: prevState.selectedActionType === actionType ? null : actionType
        }));
    }

    getSelectedAction() {
        if (!this.state.selectedActionType) return null;
        return getActionByType(this.state.selectedActionType);
    }

    queueForSelectedDevices() {
        const useOrgFanout = this.state.selectedDeviceIds.length === 0;
        this.queueCommand(useOrgFanout);
    }

    async refreshCommandsPanel() {
        await this.loadCommands();
        if (this.state.selectedCommandId) {
            await this.loadCommandDetail(this.state.selectedCommandId, { silent: true });
        }
    }

    async selectCommandForDetail(commandId) {
        await this.loadCommandDetail(commandId);
        this.setState({ showCommandDetailModal: true });
    }

    async cancelSelectedCommand() {
        const orgId = this.getCurrentOrgId();
        const commandId = this.state.selectedCommandId;
        if (!orgId || !commandId) return;

        try {
            const response = await api.cancelCommand(orgId, commandId);
            if (!response?.success) {
                throw new Error(response?.message || 'Failed to cancel command');
            }

            await this.loadCommands();
            await this.loadCommandDetail(commandId);
            window.toast?.show?.('Command cancelled', 'warning');
        } catch (err) {
            window.toast?.show?.(err?.message || 'Failed to cancel command', 'error');
        }
    }

    renderCommandSummary(cmd) {
        return html`
            <tr>
                <td>
                    <div class="fw-semibold">${cmd.commandType}</div>
                    <div class="text-muted small">${cmd.commandId}</div>
                </td>
                <td><span class="badge ${statusBadgeClass(cmd.status)}">${cmd.status}</span></td>
                <td>${cmd.completedDevices || 0}/${cmd.totalDevices || 0}</td>
                <td>${formatDateTime(cmd.queuedAt)}</td>
                <td>
                    ${cmd.nextCheckAt ? html`<div>${fromNow(cmd.nextCheckAt)}</div><div class="text-muted small">${formatDateTime(cmd.nextCheckAt)}</div>` : '—'}
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onClick=${() => this.selectCommandForDetail(cmd.commandId)}>Details</button>
                </td>
            </tr>
        `;
    }

    renderDeviceStatusRow(deviceStatus) {
        const diagnostic = deviceStatus?.diagnostic || '—';
        const result = shortText(deviceStatus?.result);
        const artifactUrl = deviceStatus?.artifactDownloadUrl;
        const retentionDays = deviceStatus?.artifactRetentionDays || 14;
        
        // Try to find device name from loaded devices
        const device = this.state.devices.find(d => d.id === deviceStatus.deviceId);
        const deviceName = device ? device.name : deviceStatus.deviceId;

        return html`
            <tr>
                <td class="fw-semibold">
                    <a href="#!/devices/${deviceStatus.deviceId}" title=${deviceStatus.deviceId} class="text-reset text-decoration-none">
                        ${deviceName}
                    </a>
                </td>
                <td><span class="badge ${statusBadgeClass(deviceStatus.status)}">${deviceStatus.status}</span></td>
                <td>${deviceStatus.isOffline ? html`<span class="badge bg-warning text-white">Offline</span>` : html`<span class="badge bg-success text-white">Online</span>`}</td>
                <td>${formatDateTime(deviceStatus.lastHeartbeat)}</td>
                <td>${formatDateTime(deviceStatus.expiresAt)}</td>
                <td>
                    ${deviceStatus.nextCheckAt ? html`<div>${fromNow(deviceStatus.nextCheckAt)}</div><div class="text-muted small">${formatDateTime(deviceStatus.nextCheckAt)}</div>` : '—'}
                </td>
                <td>${result}</td>
                <td>
                    ${artifactUrl
                        ? html`<a class="btn btn-sm btn-outline-primary" href=${artifactUrl} target="_blank" rel="noopener noreferrer">Download</a><div class="text-muted small">${retentionDays}d retention</div>`
                        : '—'}
                </td>
                <td class="text-muted">${diagnostic}</td>
            </tr>
        `;
    }

    renderAdvancedModal() {
        if (!this.state.showAdvancedModal) return null;
        return html`
            <div class="modal modal-blur fade show" style="display: block; background: rgba(0,0,0,0.5);" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Advanced Parameters</h5>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showAdvancedModal: false })}></button>
                        </div>
                        <div class="modal-body">
                            <label class="form-label">JSON Payload</label>
                            <textarea
                                class="form-control font-monospace bg-dark text-light border-secondary"
                                rows="6"
                                placeholder='{"key":"value"}'
                                value=${this.state.parameterText}
                                onInput=${(e) => this.setState({ parameterText: e.target.value })}
                            ></textarea>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" onClick=${() => this.setState({ showAdvancedModal: false })}>Done</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderCommandDetailModal() {
        if (!this.state.showCommandDetailModal) return null;
        const { selectedCommandDetail, refreshingDetail } = this.state;

        return html`
            <div class="modal modal-blur fade show" style="display: block; background: rgba(0,0,0,0.5);" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Command Detail</h5>
                            <div class="ms-auto d-flex align-items-center gap-2 me-3">
                                ${selectedCommandDetail?.overallStatus && html`<span class="badge ${statusBadgeClass(selectedCommandDetail.overallStatus)}">${selectedCommandDetail.overallStatus}</span>`}
                                <button class="btn btn-sm btn-outline-primary" disabled=${!this.state.selectedCommandId || refreshingDetail} onClick=${() => this.refreshForSelectedCommand()}>
                                    ${refreshingDetail ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <button class="btn btn-sm btn-outline-danger" disabled=${!this.state.selectedCommandId} onClick=${() => this.cancelSelectedCommand()}>Cancel</button>
                            </div>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showCommandDetailModal: false })}></button>
                        </div>
                        <div class="modal-body">
                            ${!selectedCommandDetail ? html`
                                <div class="text-muted">Loading command details...</div>
                            ` : html`
                                ${selectedCommandDetail.commandType === 'CollectLogs' ? html`
                                    <div class="alert alert-info" role="alert">
                                        Collected client logs are stored as encrypted artifacts and retained for 14 days before purge.
                                    </div>
                                ` : ''}
                                <div class="row mb-3">
                                    <div class="col-md-3"><span class="text-muted">Command:</span> ${selectedCommandDetail.commandType}</div>
                                    <div class="col-md-3"><span class="text-muted">Queued:</span> ${formatDateTime(selectedCommandDetail.queuedAt)}</div>
                                    <div class="col-md-3"><span class="text-muted">Offline:</span> ${selectedCommandDetail.offlineDevices || 0}</div>
                                    <div class="col-md-3"><span class="text-muted">Expired undelivered:</span> ${selectedCommandDetail.expiredUndeliveredDevices || 0}</div>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-vcenter">
                                        <thead>
                                            <tr>
                                                <th>Device</th>
                                                <th>Status</th>
                                                <th>Connectivity</th>
                                                <th>Last Heartbeat</th>
                                                <th>Expires</th>
                                                <th>Next Check</th>
                                                <th>Result</th>
                                                <th>Artifact</th>
                                                <th>Diagnostic</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${(selectedCommandDetail.devices || []).length === 0
                                                ? html`<tr><td colspan="9" class="text-muted">No per-device status available.</td></tr>`
                                                : (selectedCommandDetail.devices || []).map(d => this.renderDeviceStatusRow(d))}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        const {
            loading,
            error,
            devices,
            commands,
            selectedDeviceIds,
            selectedActionType,
            parameterText,
            queueing,
            loadingDevices,
            selectedCommandDetail,
            refreshingDetail,
            nextCheckAt,
            pollTimerActive,
            isSiteAdmin,
            showAdvancedModal,
            showCommandDetailModal,
            showControlPanel,
            deviceCacheFromSWR
        } = this.state;

        const selectedAction = selectedActionType ? getActionByType(selectedActionType) : null;

        if (loading) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 50vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error) {
            return html`<div class="container-xl mt-4"><div class="alert alert-danger">${error}</div></div>`;
        }

        return html`
            ${this.renderAdvancedModal()}
            ${this.renderCommandDetailModal()}
            <div class="page-header d-print-none mb-3">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <h2 class="page-title">Response Actions</h2>
                            <div class="text-muted">Fast command center with action controls and heartbeat-aware tracking.</div>
                        </div>
                        <div class="col-auto">
                            ${pollTimerActive && nextCheckAt ? html`<span class="badge bg-primary text-white">Next check ${fromNow(nextCheckAt)}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <div class="row row-cards">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header d-flex align-items-center justify-content-between">
                                    <h3 class="card-title">Control Panel</h3>
                                    <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.setState({ showControlPanel: !showControlPanel })}>
                                        ${showControlPanel ? 'Collapse' : 'Expand'}
                                    </button>
                                </div>
                                ${showControlPanel ? html`
                                <div class="card-body p-0">
                                    <div class="control-panel-container">
                                        <div class="row g-4">
                                            <div class="col-md-8">
                                                <!-- Actions Panel -->
                                                <div class="response-panel h-100">
                                                    <div class="response-panel-brand">ACTIONS</div>
                                                    <div class="response-grid">
                                                        ${ACTION_CATALOG.map(action => {
                                                            const selected = action.type === selectedActionType;
                                                            const buttonClass = selected
                                                                ? 'response-box-btn response-box-btn-selected'
                                                                : action.enabled
                                                                    ? 'response-box-btn'
                                                                    : 'response-box-btn response-box-btn-disabled';

                                                            return html`
                                                                <div class="response-grid-item">
                                                                    <button
                                                                        class=${buttonClass}
                                                                        title=${action.tooltip}
                                                                        disabled=${!action.enabled || queueing}
                                                                        onClick=${() => this.toggleAction(action.type)}>
                                                                        <div class="response-box-icon-wrap">
                                                                            <i class=${`${action.icon} response-box-icon`}></i>
                                                                        </div>
                                                                        <div class="response-box-label">${action.label}</div>
                                                                        ${!action.enabled ? html`<div class="response-tape-ribbon">Out of service</div>` : ''}
                                                                    </button>
                                                                </div>
                                                            `;
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="col-md-4 d-flex flex-column align-items-center justify-content-center">
                                                <div class="response-fire-btn-container w-100 h-100 d-flex flex-column align-items-center justify-content-center position-relative">
                                                    <div class="response-matrix-display mb-4 w-100 text-center">
                                                        <div>ACTION: ${selectedAction?.label || 'NONE'}</div>
                                                        <div>TARGET: ${selectedDeviceIds.length === 0 ? 'WHOLE ORG' : `${selectedDeviceIds.length} DEVICE(S)`}</div>
                                                    </div>
                                                    <button class="response-fire-btn" disabled=${queueing || !selectedAction?.enabled} onClick=${() => this.queueForSelectedDevices()}>
                                                        <div class="response-fire-btn-icon"><i class="ti ti-alert-triangle"></i></div>
                                                        <div class="response-fire-btn-label">${queueing ? 'Queueing...' : 'Fire'}</div>
                                                    </button>
                                                    ${isSiteAdmin ? html`
                                                        <button class="response-special-btn mt-4" onClick=${() => this.setState({ showAdvancedModal: true })}>
                                                            <i class="ti ti-lock me-1"></i> Advanced
                                                        </button>
                                                    ` : ''}
                                                </div>
                                            </div>

                                            <div class="col-12">
                                                <!-- Devices Panel -->
                                                <div class="response-panel">
                                                    <div class="response-panel-brand">
                                                        <span>DEVICES</span>
                                                        <div class="d-flex gap-2 align-items-center">
                                                            ${loadingDevices ? html`<span class="badge bg-primary text-white">Refreshing…</span>` : ''}
                                                            ${deviceCacheFromSWR ? html`<span class="badge bg-warning text-white">SWR cache</span>` : ''}
                                                            <button class="response-special-btn" onClick=${() => this.selectAllDevices()}>Select all</button>
                                                            <button class="response-special-btn" onClick=${() => this.clearDeviceSelection()}>Clear</button>
                                                            <button class="response-special-btn" onClick=${() => this.loadDevices({ skipCache: true, silent: false, source: 'manual' })}>Refresh</button>
                                                        </div>
                                                    </div>
                                                    <div class="response-grid">
                                                        ${devices.length === 0
                                                            ? html`<div class="col-12"><div class="alert alert-secondary mb-0">No devices available</div></div>`
                                                            : devices.map(device => html`
                                                                <div class="response-grid-item">
                                                                    <button
                                                                        class=${`${getDeviceButtonClass(device, selectedDeviceIds.includes(device.id))} response-box-btn`}
                                                                        title=${`${device.name} (${device.id}) • ${getDeviceStateLabel(device)}`}
                                                                        onClick=${() => this.toggleDevice(device.id)}>
                                                                        <div class="response-box-icon-wrap">
                                                                            <i class="ti ti-device-desktop response-box-icon"></i>
                                                                        </div>
                                                                        <div class="response-box-label text-truncate px-1">${device.name}</div>
                                                                    </button>
                                                                </div>
                                                            `)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                ` : html`<div class="card-body text-muted">Control panel is collapsed.</div>`}
                            </div>
                        </div>

                        <div class="col-12">
                            <div class="card mb-3">
                                <div class="card-header d-flex align-items-center justify-content-between">
                                    <h3 class="card-title mb-0">Command Monitor</h3>
                                    <div class="d-flex align-items-center gap-2">
                                        <button class="btn btn-sm btn-outline-primary" onClick=${() => this.refreshCommandsPanel()}>Refresh</button>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <div class="table-responsive">
                                        <table class="table card-table table-vcenter">
                                            <thead>
                                                <tr>
                                                    <th>Command</th>
                                                    <th>Status</th>
                                                    <th>Progress</th>
                                                    <th>Queued</th>
                                                    <th>Next Check</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${commands.length === 0
                                                    ? html`<tr><td colspan="6" class="text-muted">No queued commands yet.</td></tr>`
                                                    : commands.map(cmd => this.renderCommandSummary(cmd))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

export default ResponseActionsPage;
