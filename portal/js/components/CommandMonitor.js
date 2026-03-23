/**
 * CommandMonitor - Reusable command monitoring panel for Devices and DeviceDetail pages.
 * Shows recent commands filtered by allowed types and optionally by device.
 * Supports polling when active commands are in flight.
 *
 * Props:
 *   orgId        {string}    - organization ID (required)
 *   deviceId     {string}    - filter display to a single device (optional; null = all devices in org)
 *   allowedTypes {string[]}  - command types to show (default: TriggerScan, RefreshInventory, CollectLogs, CheckUpdates)
 */

import { api } from '@api';

const { html, Component } = window;

const TERMINAL_STATUSES = new Set(['Completed', 'Failed', 'Unsupported', 'TimedOut', 'Cancelled']);
const DEFAULT_ALLOWED_TYPES = ['TriggerScan', 'RefreshInventory', 'CollectLogs', 'CheckUpdates'];

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
        case 'partial': return 'bg-warning text-white';
        case 'failed': return 'bg-danger text-white';
        case 'unsupported': return 'bg-warning text-white';
        case 'timedout': return 'bg-danger text-white';
        case 'cancelled': return 'bg-dark text-white';
        default: return 'bg-secondary text-white';
    }
}

function getDisplayStatus(cmd) {
    const succeeded  = cmd.completedDevices || 0;
    const total      = cmd.totalDevices || 0;
    const baseStatus = (cmd.status || '');
    if (succeeded > 0 && succeeded < total) return 'Partial';
    return baseStatus;
}

function shortText(value, max = 140) {
    if (!value) return '—';
    const text = String(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

function parseCommandResult(resultText) {
    if (!resultText) return null;
    const text = String(resultText).trim();
    if (!text) return null;

    const segments = text.split('|').map(s => s.trim()).filter(Boolean);
    const map = {};
    let hasPairs = false;

    for (const segment of segments) {
        const idx = segment.indexOf('=');
        if (idx <= 0) continue;
        const key = segment.slice(0, idx).trim().toLowerCase();
        const value = segment.slice(idx + 1).trim();
        if (!key) continue;
        map[key] = value;
        hasPairs = true;
    }

    if (!hasPairs) {
        return { status: null, error: null, code: null, message: text, executedAt: null, raw: text };
    }

    return {
        status: map.status || null,
        error: map.error || null,
        code: map.code || null,
        message: map.message || null,
        executedAt: map.executedat || null,
        raw: text
    };
}

function renderCommandResult(resultText, explicitResultCode) {
    const parsed = parseCommandResult(resultText);
    if (!parsed) return '—';

    const code = explicitResultCode || parsed.code;
    const normalizedStatus = (parsed.status || '').toLowerCase();
    const statusClass = normalizedStatus === 'success'
        ? 'bg-success text-white'
        : normalizedStatus === 'failed' || normalizedStatus === 'unknown'
            ? 'bg-danger text-white'
            : normalizedStatus
                ? 'bg-secondary text-white'
                : null;

    return html`
        <div class="d-flex flex-column gap-1">
            ${parsed.status ? html`<div><span class="badge ${statusClass}">${parsed.status}</span></div>` : ''}
            ${code ? html`<div><span class="badge bg-warning text-white">${code}</span></div>` : ''}
            ${parsed.message ? html`<div class="text-muted">${shortText(parsed.message, 180)}</div>` : ''}
            ${parsed.error ? html`<div class="text-danger">${shortText(parsed.error, 220)}</div>` : ''}
            ${parsed.executedAt ? html`<div class="text-muted small">Executed ${formatDateTime(parsed.executedAt)}</div>` : ''}
            ${(!parsed.status && !parsed.code && !parsed.message && !parsed.error) ? html`<div class="text-muted">${shortText(parsed.raw, 240)}</div>` : ''}
        </div>
    `;
}

export class CommandMonitor extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            collapsed: true,
            commands: [],
            deviceNameMap: {},
            selectedCommandId: null,
            selectedCommandDetail: null,
            showDetailModal: false,
            refreshingDetail: false,
            showProbeDataModal: false,
            selectedProbeDeviceName: null,
            selectedProbePayload: null,
            nextCheckAt: null,
            pollTimerActive: false
        };
        this.pollTimeoutId = null;
    }

    componentDidMount() {
        if (this.props.orgId) {
            this.loadCommands();
            this.loadDeviceNames();
        }
    }

    componentDidUpdate(prevProps) {
        if (prevProps.orgId !== this.props.orgId) {
            this.clearPollTimer();
            this.setState({ commands: [], loading: true, selectedCommandId: null, selectedCommandDetail: null, deviceNameMap: {} });
            if (this.props.orgId) {
                this.loadCommands();
                this.loadDeviceNames();
            }
        }
    }

    componentWillUnmount() {
        this.clearPollTimer();
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

    async loadDeviceNames() {
        const { orgId } = this.props;
        if (!orgId) return;
        try {
            const response = await api.getDevices(orgId, { view: 'targets', limit: 1000 });
            const devices = response?.data?.devices || [];
            const map = {};
            devices.forEach(d => {
                const id = d?.id || d?.deviceId;
                const name = d?.name || d?.deviceName;
                if (id && name) map[id] = name;
            });
            this.setState({ deviceNameMap: map });
        } catch {
            // non-fatal — device IDs will be shown as fallback
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
        this.pollTimeoutId = setTimeout(async () => {
            await this.loadCommands();
            if (this.state.selectedCommandId) {
                await this.loadCommandDetail(this.state.selectedCommandId, { silent: true });
            }
        }, delay);
    }

    getFilteredCommands() {
        const allowedTypes = this.props.allowedTypes || DEFAULT_ALLOWED_TYPES;
        return this.state.commands.filter(cmd => allowedTypes.includes(cmd.commandType));
    }

    async loadCommands() {
        const { orgId, deviceId } = this.props;
        if (!orgId) return;

        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        this.setState({ loading: true });
        try {
            const response = await api.getCommands(orgId, deviceId || null, 50, since);
            this.setState({ commands: response?.data || [], loading: false });
        } catch (err) {
            this.setState({ loading: false });
            if (window.toast) window.toast.error(err?.message || 'Failed to load actions');
        }
    }

    async loadCommandDetail(commandId, options = {}) {
        const { orgId } = this.props;
        if (!orgId || !commandId) return;

        this.setState({ refreshingDetail: !options.silent });
        try {
            const response = await api.getCommandDetail(orgId, commandId);
            if (!response?.success) throw new Error(response?.message || 'Failed to load command detail');

            const detail = response.data;
            this.setState({ selectedCommandId: commandId, selectedCommandDetail: detail, refreshingDetail: false });

            const hasActiveDevices = (detail?.devices || []).some(d => !TERMINAL_STATUSES.has(d?.status));
            if (hasActiveDevices && detail?.nextCheckAt) {
                this.scheduleNextCheck(detail.nextCheckAt);
            } else {
                this.clearPollTimer();
                this.setState({ nextCheckAt: detail?.nextCheckAt || null });
            }
        } catch (err) {
            this.setState({ refreshingDetail: false });
            if (window.toast) window.toast.error(err?.message || 'Failed to load command detail');
        }
    }

    async selectCommandForDetail(commandId) {
        await this.loadCommandDetail(commandId);
        this.setState({ showDetailModal: true });
    }

    async cancelSelectedCommand() {
        const { orgId } = this.props;
        const { selectedCommandId } = this.state;
        if (!orgId || !selectedCommandId) return;

        try {
            const response = await api.cancelCommand(orgId, selectedCommandId);
            if (!response?.success) throw new Error(response?.message || 'Failed to cancel command');

            await this.loadCommands();
            await this.loadCommandDetail(selectedCommandId, { silent: true });
            if (window.toast) window.toast.warning('Command cancelled');
        } catch (err) {
            if (window.toast) window.toast.error(err?.message || 'Failed to cancel command');
        }
    }

    openProbeDataModal(deviceName, payloadText) {
        let formatted = payloadText;
        try { formatted = JSON.stringify(JSON.parse(payloadText), null, 2); } catch { formatted = String(payloadText || ''); }
        this.setState({ showProbeDataModal: true, selectedProbeDeviceName: deviceName, selectedProbePayload: formatted });
    }

    renderCommandSummary(cmd) {
        const displayStatus = getDisplayStatus(cmd);
        return html`
            <tr key=${cmd.commandId}>
                <td>
                    <div class="fw-semibold">${cmd.commandType}</div>
                </td>
                <td><span class="badge ${statusBadgeClass(displayStatus.toLowerCase())}">${displayStatus}</span></td>
                <td>${cmd.completedDevices || 0}/${cmd.totalDevices || 0}</td>
                <td>${formatDateTime(cmd.queuedAt)}</td>
                <td>
                    ${cmd.nextCheckAt
                        ? html`<div>${fromNow(cmd.nextCheckAt)}</div><div class="text-muted small">${formatDateTime(cmd.nextCheckAt)}</div>`
                        : '—'}
                </td>
                <td>
                    <button class="btn btn-sm btn-secondary" onClick=${() => this.selectCommandForDetail(cmd.commandId)}>Details</button>
                </td>
            </tr>
        `;
    }

    renderDeviceStatusRow(deviceStatus) {
        const result = renderCommandResult(deviceStatus?.result, deviceStatus?.resultCode);
        const artifactUrl = deviceStatus?.artifactDownloadUrl;
        const retentionDays = deviceStatus?.artifactRetentionDays || 14;
        const isProbe = (this.state.selectedCommandDetail?.commandType || '').toLowerCase() === 'probe';
        const hasProbePayload = isProbe && !!deviceStatus?.resultDataJson;
        const deviceId   = deviceStatus?.deviceId;
        const deviceName = (deviceId && this.state.deviceNameMap[deviceId]) || deviceId || '—';

        return html`
            <tr>
                <td class="fw-semibold">
                    <a href="#!/devices/${deviceId}" class="text-reset text-decoration-none" title=${deviceId}>
                        ${deviceName}
                    </a>
                </td>
                <td><span class="badge ${statusBadgeClass(deviceStatus.status)}">${deviceStatus.status}</span></td>
                <td>${formatDateTime(deviceStatus.lastHeartbeat)}</td>
                <td>${formatDateTime(deviceStatus.expiresAt)}</td>
                <td>
                    ${deviceStatus.nextCheckAt
                        ? html`<div>${fromNow(deviceStatus.nextCheckAt)}</div><div class="text-muted small">${formatDateTime(deviceStatus.nextCheckAt)}</div>`
                        : '—'}
                </td>
                <td>${result}</td>
                <td>
                    ${artifactUrl
                        ? html`<a class="btn btn-sm btn-outline-primary" href=${artifactUrl} target="_blank" rel="noopener noreferrer">Download</a><div class="text-muted small">${retentionDays}d retention</div>`
                        : hasProbePayload
                            ? html`<button class="btn btn-sm btn-outline-primary" onClick=${() => this.openProbeDataModal(deviceStatus.deviceId, deviceStatus?.resultDataJson)}>View Probe</button>`
                            : '—'}
                </td>
            </tr>
        `;
    }

    renderProbeDataModal() {
        if (!this.state.showProbeDataModal) return null;
        return html`
            <div class="modal modal-blur fade show" style="display: block; background: rgba(0,0,0,0.5);" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Probe Snapshot · ${this.state.selectedProbeDeviceName || 'Device'}</h5>
                            <button type="button" class="btn-close"
                                onClick=${() => this.setState({ showProbeDataModal: false, selectedProbeDeviceName: null, selectedProbePayload: null })}>
                            </button>
                        </div>
                        <div class="modal-body">
                            <pre class="bg-dark text-light p-3 rounded small" style="white-space: pre-wrap; word-break: break-word;">${this.state.selectedProbePayload || 'No probe payload available.'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderDetailModal() {
        if (!this.state.showDetailModal) return null;
        const { selectedCommandDetail, refreshingDetail, selectedCommandId } = this.state;

        // Partial status: some devices succeeded but not all
        const modalSucceeded = selectedCommandDetail?.completedDevices || 0;
        const modalTotal     = selectedCommandDetail?.totalDevices || 0;
        const modalStatus    = (modalSucceeded > 0 && modalSucceeded < modalTotal)
            ? 'Partial'
            : (selectedCommandDetail?.overallStatus || '');

        // When embedded in device-detail, filter rows to the specific device
        const filterDeviceId = this.props.deviceId || null;
        const modalDevices   = filterDeviceId
            ? (selectedCommandDetail?.devices || []).filter(d => d.deviceId === filterDeviceId)
            : (selectedCommandDetail?.devices || []);

        return html`
            <div class="modal modal-blur fade show" style="display: block; background: rgba(0,0,0,0.5);" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Action Detail</h5>
                            <div class="ms-auto d-flex align-items-center gap-2 me-3">
                                ${modalStatus && html`
                                    <span class="badge ${statusBadgeClass(modalStatus.toLowerCase())}">${modalStatus}</span>
                                `}
                                <button class="btn btn-sm btn-outline-primary"
                                    disabled=${!selectedCommandId || refreshingDetail}
                                    onClick=${() => this.loadCommandDetail(selectedCommandId, { silent: true })}>
                                    ${refreshingDetail ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <button class="btn btn-sm btn-outline-danger"
                                    disabled=${!selectedCommandId}
                                    onClick=${() => this.cancelSelectedCommand()}>
                                    Cancel
                                </button>
                            </div>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showDetailModal: false })}></button>
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
                                                <th>Last Heartbeat</th>
                                                <th>Expires</th>
                                                <th>Next Check</th>
                                                <th>Result</th>
                                                <th>Artifact</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${modalDevices.length === 0
                                                ? html`<tr><td colspan="7" class="text-muted">No per-device status available.</td></tr>`
                                                : modalDevices.map(d => this.renderDeviceStatusRow(d))}
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
        const { loading, pollTimerActive, collapsed } = this.state;
        const commands = this.getFilteredCommands();

        return html`
            ${this.renderDetailModal()}
            ${this.renderProbeDataModal()}
            <div class="card mb-3">
                <div class="card-header d-flex align-items-center justify-content-between"
                     style="cursor:pointer;"
                     onClick=${() => this.setState(s => ({ collapsed: !s.collapsed }))}>
                    <div class="d-flex align-items-center gap-2">
                        <h3 class="card-title mb-0">Actions History</h3>
                        ${!loading && commands.length > 0 ? html`
                            <span class="badge bg-secondary text-white">${commands.length}</span>
                        ` : null}
                        ${pollTimerActive ? html`
                            <span class="badge bg-primary-lt text-primary">Auto-refresh active</span>
                        ` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary"
                                onClick=${(e) => { e.stopPropagation(); this.loadCommands(); }}
                                disabled=${loading}>
                            ${loading ? 'Loading...' : 'Refresh'}
                        </button>
                        <i class=${`ti ti-chevron-${collapsed ? 'down' : 'up'} text-muted`}></i>
                    </div>
                </div>
                ${!collapsed ? html`
                    ${loading ? html`
                        <div class="card-body text-center py-4">
                            <div class="spinner-border spinner-border-sm text-primary"></div>
                            <span class="ms-2 text-muted">Loading actions...</span>
                        </div>
                    ` : html`
                        <div class="table-responsive">
                            <table class="table card-table table-vcenter">
                                <thead>
                                    <tr>
                                        <th>Action</th>
                                        <th>Status</th>
                                        <th>Progress</th>
                                        <th>Queued</th>
                                        <th>Next Check</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${commands.length === 0
                                        ? html`<tr><td colspan="6" class="text-muted text-center py-3">No actions in the last 14 days.</td></tr>`
                                        : commands.map(cmd => this.renderCommandSummary(cmd))}
                                </tbody>
                            </table>
                        </div>
                    `}
                ` : null}
            </div>
        `;
    }
}
