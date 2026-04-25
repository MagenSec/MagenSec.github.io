/**
 * Devices Page - Preact + HTM with Tabler
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { config } from '@config';
import { PiiDecryption } from '@utils/piiDecryption.js';
import { getInstallerConfig, clearManifestCache, getCacheStatus } from '@utils/manifestCache.js';
import { getKevSet } from '@utils/kevCache.js';

// Shared components
import { StatusBadge, getConnectionStatus, StatusDot } from '@components/shared/StatusBadge.js';
import { SeverityBadge, RiskScoreBadge, GradeBadge } from '@components/shared/Badges.js';
import { LoadingSpinner, ErrorAlert, EmptyState, Card } from '@components/shared/CommonComponents.js';
import { getDonutChartConfig, getRadarChartConfig, getScatterChartConfig, renderChart, destroyChart, severityColors } from '@components/charts/ChartHelpers.js';
import { formatTimestamp, formatRelativeTime, formatNumber, formatPercent, roundPercent } from '@utils/dataHelpers.js';

// Utility modules (shared with device-detail)
import { formatDate } from '../device-detail/utils/DateUtils.js';
import { formatNetworkSpeed } from '../device-detail/utils/FormattingUtils.js';

// Service modules
import { DeviceStatsService } from './services/DeviceStatsService.js';
import { DeviceFilterService } from './services/DeviceFilterService.js';

// Component modules
import { renderBulkActionsBar } from './components/BulkActionsBar.js';
import { renderHealthStatus, renderRiskIndicator, renderPatchStatus, getStatusDotClass, getTrendIcon, getTrendClass, renderOfflineComplianceRisk } from './DeviceHealthRenderer.js';
import { CommandMonitor } from '@components/CommandMonitor.js';

class DevicesPage extends window.Component {
    constructor(props) {
        super(props);
        this.state = {
            devices: [],
            filteredDevices: [],
            loading: true,
            error: null,
            searchQuery: '',
            cveFilterSeverity: '',
            sortField: 'risk',
            sortAsc: false,
            showDeviceModal: false,
            selectedDevice: null,
            telemetryLoading: false,
            telemetryError: null,
            telemetryDetail: null,
            filteredDevices: [],
            enrichedScores: {},
            deviceSummaries: {},
            knownExploits: new Set(),
            deviceFilters: { license: 'active', connection: 'all', spec: 'all' },
            installers: { X64: {}, ARM64: {}, ENGINE: {} },
            manifestError: null,
            refreshingManifest: false,
            showDownloadModal: false,
            downloadTarget: null,
            appSort: { key: 'appName', direction: 'asc' },
            cveSort: { key: 'cveId', direction: 'asc' },
            activeInventoryTab: 'apps',
            inventoryLoading: false,
            inventoryError: null,
            appInventory: [],
            cveInventory: [],
            highlightedApp: null,
            highlightedCve: null,
            showRiskExplanationModal: false,
            riskExplanationDevice: null,
            isRefreshingInBackground: false,
            summarySignalState: 'idle',
            summarySignalMessage: null,
            filteredDevices: [],
            selectedDevices: []
        };
        this.KNOWN_EXPLOITS_CACHE = { data: null, loadedAt: null, TTL_HOURS: 24 };
        this.DEVICES_CACHE = {};

        this.riskChart = null;
        this.appsChart = null;
        this.cvesChart = null;
        this.riskChartEl = null;
        this.appsChartEl = null;
        this.cvesChartEl = null;

        this.summaryRefreshInFlight = false;
    }

    componentDidMount() {
        this.orgChangeUnsubscribe = orgContext.onChange(() => this.loadDevices(true));
        this._rewindUnsub = rewindContext.onChange(() => this.loadDevices(true));
        this.loadInstallerConfig();
        this.loadDevices();
        this.loadKnownExploitsAsync();
    }

    componentDidUpdate(prevProps, prevState) {
        // One-time per org-load toast when one or more devices are running an outdated client.
        // Surfaces the action without nagging on every re-render. Cleared when the org changes.
        try {
            const devicesChanged = prevState.devices !== this.state.devices;
            const installerLoaded = prevState.installers?.ENGINE?.VERSION !== this.state.installers?.ENGINE?.VERSION;
            if ((devicesChanged || installerLoaded) && Array.isArray(this.state.devices) && this.state.devices.length > 0) {
                const outdatedCount = this.state.devices.filter(d => d.clientVersion && this.isVersionOutdated(d.clientVersion)).length;
                const orgKey = orgContext.getCurrentOrg()?.orgId || 'none';
                const noticeKey = `outdated-clients-notice:${orgKey}`;
                if (outdatedCount > 0 && sessionStorage.getItem(noticeKey) !== '1') {
                    sessionStorage.setItem(noticeKey, '1');
                    const latest = this.state.installers?.ENGINE?.VERSION || '';
                    const msg = outdatedCount === 1
                        ? `1 device is running an outdated agent${latest ? ` (latest v${latest})` : ''}. Use Check Updates to push the new build.`
                        : `${outdatedCount} devices are running outdated agents${latest ? ` (latest v${latest})` : ''}. Use Check Updates to push the new build.`;
                    this.showToast(msg, 'warning');
                }
            }
        } catch (_) { /* non-fatal */ }

        const modalOpened = this.state.showDeviceModal && this.state.selectedDevice;
        const modalClosed = prevState.showDeviceModal && !this.state.showDeviceModal;

        if (modalOpened) {
            this.renderApexCharts();
        }

        if (modalClosed || (!this.state.selectedDevice && prevState.selectedDevice)) {
            this.destroyApexCharts();
        }

        const filteredNow = DeviceFilterService.getFilteredDevices(this.state.devices, this.state.searchQuery, this.state.deviceFilters, this.state.sortField, this.state.sortAsc, this.state.enrichedScores);
        const prevIds = (prevState.filteredDevices || []).map(d => d.id).join('|');
        const currIds = filteredNow.map(d => d.id).join('|');
        const summariesChanged = prevState.deviceSummaries !== this.state.deviceSummaries || prevState.enrichedScores !== this.state.enrichedScores;
        if (prevIds !== currIds) {
            this.setState({ filteredDevices: filteredNow }, () => {
                this.renderTableApexCharts();
            });
        } else if (summariesChanged) {
            this.renderTableApexCharts();
        }
    }

    toggleSelectDevice(deviceId) {
        this.setState(prev => {
            const selected = prev.selectedDevices.includes(deviceId)
                ? prev.selectedDevices.filter(id => id !== deviceId)
                : [...prev.selectedDevices, deviceId];
            return { selectedDevices: selected };
        });
    }

    toggleSelectAll() {
        const filtered = DeviceFilterService.getFilteredDevices(this.state.devices, this.state.searchQuery, this.state.deviceFilters, this.state.sortField, this.state.sortAsc, this.state.enrichedScores);
        const allSelected = filtered.length > 0 && filtered.every(d => this.state.selectedDevices.includes(d.id));
        this.setState({ selectedDevices: allSelected ? [] : filtered.map(d => d.id) });
    }

    clearSelection() {
        this.setState({ selectedDevices: [] });
    }

    async scanSelected() {
        const { selectedDevices } = this.state;
        if (selectedDevices.length === 0) return;
        
        const org = orgContext.getCurrentOrg();
        if (!org) return;

        try {
            this.setState({ bulkOperationInProgress: true });
            console.log('[DevicesPage] Bulk scan triggered for:', selectedDevices);
            
            const response = await api.post(`/api/v1/orgs/${org.orgId}/devices/bulk/scan`, {
                deviceIds: selectedDevices
            });

            if (response.success) {
                const { scannedCount, skippedDevices } = response.data;
                alert(`Scan triggered for ${scannedCount} device(s)` + 
                      (skippedDevices.length > 0 ? `. Failed: ${skippedDevices.length}` : ''));
                this.clearSelection();
            } else {
                alert(`Bulk scan failed: ${response.message}`);
            }
        } catch (err) {
            console.error('[DevicesPage] Bulk scan error:', err);
            alert(`Error triggering scan: ${err.message}`);
        } finally {
            this.setState({ bulkOperationInProgress: false });
        }
    }

    async blockSelected() {
        const { selectedDevices } = this.state;
        if (selectedDevices.length === 0) return;
        
        if (!confirm(`Block ${selectedDevices.length} device(s)? They will be removed from active monitoring.`)) {
            return;
        }

        const org = orgContext.getCurrentOrg();
        if (!org) return;

        try {
            this.setState({ bulkOperationInProgress: true });
            console.log('[DevicesPage] Bulk block triggered for:', selectedDevices);
            
            const response = await api.post(`/api/v1/orgs/${org.orgId}/devices/bulk/block`, {
                deviceIds: selectedDevices,
                deleteTelemetry: false
            });

            if (response.success) {
                const { blockedCount, failedDevices } = response.data;
                alert(`${blockedCount} device(s) blocked successfully` + 
                      (failedDevices.length > 0 ? `. Failed: ${failedDevices.length}` : ''));
                this.clearSelection();
                await this.loadDevices(); // Refresh list
            } else {
                alert(`Bulk block failed: ${response.message}`);
            }
        } catch (err) {
            console.error('[DevicesPage] Bulk block error:', err);
            alert(`Error blocking devices: ${err.message}`);
        } finally {
            this.setState({ bulkOperationInProgress: false });
        }
    }

    async exportSelected() {
        const { selectedDevices, devices } = this.state;
        if (selectedDevices.length === 0) return;
        
        const selected = devices.filter(d => selectedDevices.includes(d.id));
        const csv = this.devicesToCSV(selected);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `devices-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.clearSelection();
    }

    devicesToCSV(devices) {
        const headers = ['Device Name', 'State', 'Risk Score', 'Last Heartbeat', 'OS', 'License'];
        const rows = devices.map(d => [
            d.name,
            d.state,
            this.state.enrichedScores[d.id]?.riskScore || 'N/A',
            d.lastHeartbeat || 'Never',
            `${d.telemetry.osEdition || ''} ${d.telemetry.osVersion || ''}`.trim(),
            d.licenseKey || 'N/A'
        ]);
        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    getDeviceInitials(name) {
        if (!name) return '??';
        const words = name.split(/[\s-_]+/).filter(Boolean);
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getStatusDot(lastHeartbeat) {
        if (!lastHeartbeat) return 'status-red';
        const mins = (Date.now() - new Date(lastHeartbeat)) / 60000;
        if (mins < 60) return 'status-dot-animated status-green';    // Online
        if (mins < 1440) return 'status-azure';                      // Offline (recent)
        if (mins < 4320) return 'status-yellow';                     // Stale (1-3d)
        if (mins < 10080) return 'status-orange';                    // Dormant (3-7d)
        return 'status-red';                                         // Ghosted (>7d)
    }

    getStatusText(lastHeartbeat) {
        if (!lastHeartbeat) return 'Never seen';
        const mins = Math.floor((Date.now() - new Date(lastHeartbeat)) / 60000);
        if (mins < 60) return 'Online';
        const hours = Math.floor(mins / 60);
        if (mins < 1440) return `${hours}h ago`;
        const days = Math.floor(mins / 1440);
        if (mins < 4320) return `Stale (${days}d)`;
        if (mins < 10080) return `Dormant (${days}d)`;
        return `Ghosted (${days}d)`;
    }

    componentWillUnmount() {
        if (this.orgChangeUnsubscribe) this.orgChangeUnsubscribe();
        if (this._rewindUnsub) this._rewindUnsub();
        this.destroyApexCharts();
        this.destroyTableApexCharts();
    }

    // Modal rendering moved to render() method
    renderModal() {
        const { html } = window;
        if (!this.state.showDeviceModal || !this.state.selectedDevice) return null;
        return html`
                    <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
                        <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                            <div class="modal-content" style="z-index: 1056;">
                                <div class="modal-header">
                                    <h5 class="modal-title d-flex align-items-center gap-2 flex-wrap">
                                        <a href="#!/devices/${this.state.selectedDevice.id}" class="text-primary fw-600 text-decoration-none" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); window.location.hash = `#!/devices/${this.state.selectedDevice.id}`; }}>${this.state.selectedDevice.name}</a>
                                        ${this.state.selectedDevice.state ? window.html`<span class="badge ${this.getStateBadgeClass(this.state.selectedDevice.state)} text-white">${this.state.selectedDevice.state}</span>` : ''}
                                    </h5>
                                    <button type="button" class="btn-close" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); }}></button>
                                </div>
                                <div class="modal-body">
                                    ${this.state.telemetryLoading ? html`
                                        <div class="text-center py-4">
                                            <div class="spinner-border text-primary" role="status"></div>
                                            <div class="mt-3 text-muted">Loading telemetry...</div>
                                        </div>
                                    ` : this.state.telemetryError ? html`
                                        <div class="alert alert-danger">${this.state.telemetryError}</div>
                                    ` : this.state.telemetryDetail ? html`
                                        <!-- Registered | Last Seen | User row -->
                                        <div class="card mb-3">
                                            <div class="card-body py-2">
                                                <div class="row g-3 align-items-center text-center">
                                                    <div class="col-md-4">
                                                        <div class="text-muted small">Registered</div>
                                                        <div class="fw-bold">${this.state.selectedDevice.firstHeartbeat ? formatDate(this.state.selectedDevice.firstHeartbeat) : this.state.selectedDevice.firstSeen ? formatDate(this.state.selectedDevice.firstSeen) : this.state.selectedDevice.createdAt ? formatDate(this.state.selectedDevice.createdAt) : '—'}</div>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <div class="text-muted small">Last Seen</div>
                                                        <div class="fw-bold">${this.state.selectedDevice.lastHeartbeat ? formatDate(this.state.selectedDevice.lastHeartbeat) : this.state.telemetryDetail?.history?.[0]?.timestamp ? formatDate(this.state.telemetryDetail.history[0].timestamp) : 'Never'}</div>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <div class="text-muted small">User</div>
                                                        ${(() => {
                                                            const f = this.state.telemetryDetail?.history?.[0]?.fields || {};
                                                            const encoded = f.UserName || f.Username || f.userName || f.LoggedOnUser || f.CurrentUser || null;
                                                            if (!encoded) return html`<div class="fw-bold font-monospace small">N/A</div>`;
                                                            const username = PiiDecryption.decryptIfEncrypted(String(encoded));
                                                            return html`<div class="fw-bold">${username || 'N/A'}</div>`;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="row g-3 align-items-start">
                                            <div class="col-md-5">
                                                <h5>Current Specs</h5>
                                                <ul class="list-unstyled text-muted small mb-0">
                                                    <li><strong>OS:</strong> ${this.state.selectedDevice.telemetry?.osEdition || ''} ${this.state.selectedDevice.telemetry?.osVersion || ''} (${this.state.selectedDevice.telemetry?.osBuild || ''})</li>
                                                    <li><strong>CPU:</strong> ${this.state.selectedDevice.telemetry?.cpuName || ''} ${this.state.selectedDevice.telemetry?.cpuCores ? '('+this.state.selectedDevice.telemetry.cpuCores+' cores)' : ''}</li>
                                                    <li><strong>RAM:</strong> ${this.state.selectedDevice.telemetry?.totalRamMb ? Math.round(this.state.selectedDevice.telemetry.totalRamMb/1024)+' GB' : ''}</li>
                                                    <li><strong>Disk:</strong> ${this.state.selectedDevice.telemetry?.totalDiskGb ? this.state.selectedDevice.telemetry.totalDiskGb+' GB' : ''} ${this.state.selectedDevice.telemetry?.systemDiskMediaType || ''} ${this.state.selectedDevice.telemetry?.systemDiskBusType || ''}</li>
                                                    <li><strong>Network:</strong> ${this.state.selectedDevice.telemetry?.connectionType || ''} ${this.state.selectedDevice.telemetry?.networkSpeedMbps ? this.state.selectedDevice.telemetry.networkSpeedMbps+' Mbps' : ''}</li>
                                                    <li><strong>IP:</strong> ${(() => {
                                                        const raw = this.state.selectedDevice.telemetry?.ipAddresses || this.state.selectedDevice.telemetry?.IPAddresses;
                                                        const ips = Array.isArray(raw)
                                                            ? raw
                                                            : (typeof raw === 'string'
                                                                ? (() => {
                                                                    try {
                                                                        const parsed = JSON.parse(raw);
                                                                        if (Array.isArray(parsed)) return parsed;
                                                                    } catch (e) { /* fallback to delimiter split */ }
                                                                    return raw.split(/[;,\s]+/).filter(Boolean);
                                                                })()
                                                                : []);
                                                        if (!ips || ips.length === 0) return 'No IP';
                                                        const primary = ips[0];
                                                        const count = ips.length;
                                                        if (count > 1) {
                                                            return html`${primary} <span class="badge badge-sm bg-azure-lt text-azure ms-1">(+${count - 1})</span>`;
                                                        }
                                                        return primary;
                                                    })()}</li>
                                                </ul>
                                            </div>
                                            <div class="col-md-5">
                                                <h5>Security Status</h5>
                                                ${(() => {
                                                    const summary = this.state.deviceSummaries[this.state.selectedDevice.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
                                                    const displayScore = (this.state.enrichedScores[this.state.selectedDevice.id]?.score ?? summary.score ?? 0);
                                                    const scoreColor = displayScore >= 80 ? '#d63939' : displayScore >= 60 ? '#f59f00' : displayScore >= 40 ? '#fab005' : '#2fb344';
                                                    const totalCves = (summary.criticalCves || 0) + (summary.highCves || 0) + (summary.mediumCves || 0) + (summary.lowCves || 0);
                                                    return html`
                                                            <div class="d-flex flex-column gap-3">
                                                            <div class="d-flex align-items-start gap-3 flex-wrap" style="cursor: pointer;" onclick=${(e) => { e.preventDefault(); this.openRiskExplanationModal(this.state.selectedDevice); }} title="Click to see score breakdown">
                                                                                                <div style="width: 88px; height: 88px;" ref=${(el) => { this.riskChartEl = el; }}></div>
                                                                                                <div class="d-flex flex-column gap-1 align-items-start" style="min-width: 140px;">
                                                                                                    <div class="d-flex align-items-center gap-2">
                                                                                                        <span class="text-muted small">Risk Score:</span>
                                                                                                        <span class="badge ${summary.worstSeverity === 'CRITICAL' ? 'bg-danger-lt text-danger' : summary.worstSeverity === 'HIGH' ? 'bg-warning-lt text-warning' : summary.worstSeverity === 'MEDIUM' ? 'bg-secondary-lt text-secondary' : 'bg-success-lt text-success'}">${summary.worstSeverity}</span>
                                                                                                    </div>
                                                                                                    <div class="text-muted small">Click for details</div>
                                                                                                </div>
                                                                                            </div>
                                                            <div class="d-flex gap-4 justify-content-center">
                                                                <div class="text-center">
                                                                    <div style="width: 68px; height: 68px;" ref=${(el) => { this.appsChartEl = el; }}></div>
                                                                    <div class="text-muted small">Apps</div>
                                                                </div>
                                                                <div class="text-center">
                                                                    <div style="width: 68px; height: 68px;" ref=${(el) => { this.cvesChartEl = el; }}></div>
                                                                    <div class="text-muted small">CVEs</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `;
                                                })()}
                                            </div>
                                        </div>
                                        <div class="mt-3">
                                            <h5>Recent Changes</h5>
                                            ${this.state.telemetryDetail?.changes && this.state.telemetryDetail.changes.length > 0 ? html`
                                                <div class="timeline timeline-simple">
                                                    ${this.state.telemetryDetail.changes.slice(0,5).map(change => html`
                                                        <div class="timeline-event">
                                                            <div class="timeline-event-icon bg-warning-lt"></div>
                                                            <div class="timeline-event-content">
                                                                <div class="text-muted small">${formatDate(change.at)}</div>
                                                                <div class="text-sm">${Object.keys(change.delta).join(', ')}</div>
                                                            </div>
                                                        </div>
                                                    `)}
                                                </div>
                                            ` : html`<div class="text-muted small">No recent hardware changes</div>`}
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="modal-footer d-flex justify-content-between">
                                    <div class="text-muted small">Open full view for apps, risks, and timeline details.</div>
                                    <a class="btn btn-primary" href="#!/devices/${this.state.selectedDevice.id}" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); window.location.hash = `#!/devices/${this.state.selectedDevice.id}`; }}>
                                        Open Device Details
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
                `;
    }

    renderRiskExplanationModal() {
        const { html } = window;
        if (!this.state.showRiskExplanationModal || !this.state.riskExplanationDevice) return null;

        const device = this.state.riskExplanationDevice;
        const summary = this.state.deviceSummaries[device.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
        const enriched = this.state.enrichedScores[device.id] || { score: summary.score, constituents: summary.constituents || {} };
        const constituents = enriched.constituents || summary.constituents || {};
        const riskScore = Math.round(enriched.score || 0);
        // Health score = inverted risk (matches the number shown in the table column)
        const healthScore = Math.max(0, Math.min(100, 100 - riskScore));
        const healthColor = healthScore >= 75 ? 'success' : healthScore >= 50 ? 'warning' : 'danger';
        const exploitInfo = this.deriveKnownExploitInfo(constituents);
        const knownExploitCount = exploitInfo.count;
        const hasKnownExploit = exploitInfo.has;
        const derivedCvss = this.deriveCvss(constituents, summary);
        const networkExposure = this.deriveNetworkExposure(this.state.telemetryDetail);
        const cvssBadgeClass = derivedCvss !== null
            ? (derivedCvss >= 9 ? 'bg-danger-lt text-danger' : derivedCvss >= 7 ? 'bg-warning-lt text-warning' : derivedCvss >= 4 ? 'bg-info-lt text-info' : 'bg-success-lt text-success')
            : '';

        return html`
            <div class="modal modal-blur fade show" style="display: block; z-index: 2055;" tabindex="-1" role="dialog" aria-modal="true">
                <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                    <div class="modal-content" style="z-index: 2056;">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title">Security Score Analysis</h5>
                            <button type="button" class="btn-close" onclick=${() => this.closeRiskExplanationModal()}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-4">
                                <h5 class="text-muted">Security Score: <strong class="text-${healthColor}">${healthScore}</strong><span class="text-muted">/100</span></h5>
                                <div class="progress mb-3" style="height: 8px;">
                                    <div class="progress-bar bg-${healthColor}" style="width: ${Math.max(healthScore, 3)}%"></div>
                                </div>
                                <p class="text-muted small">
                                    Higher is better. This score reflects how well-protected this device is based on vulnerability exposure, exploit probability, and patch status.
                                </p>
                            </div>

                            <div class="mb-4">
                                <h5>What Contributes to This Risk?</h5>
                                <div class="list-group list-group-flush">
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Vulnerability Severity</div>
                                                <div class="text-muted small">Highest CVSS score from identified CVEs</div>
                                            </div>
                                            <div class="text-end">
                                                ${derivedCvss !== null ? html`
                                                    <span class="badge ${cvssBadgeClass}">
                                                        ${(derivedCvss).toFixed(1)}/10.0
                                                    </span>
                                                ` : html`<span class="text-muted">None detected</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Vulnerable Applications</div>
                                                <div class="text-muted small">Number of apps with known vulnerabilities</div>
                                            </div>
                                            <div class="text-end">
                                                ${summary.vulnerableApps ? html`<a href="#!/devices/${device.id}?tab=inventory" class="badge bg-warning-lt text-warning text-decoration-none">${summary.vulnerableApps} apps</a>` : html`<span class="text-muted">None found</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Total CVEs</div>
                                                <div class="text-muted small">All identified CVEs across apps</div>
                                            </div>
                                            <div class="text-end">
                                                ${summary.criticalCves + summary.highCves + summary.mediumCves + summary.lowCves > 0 ? html`
                                                    <div>
                                                        ${summary.criticalCves > 0 ? html`<span class="badge bg-danger-lt text-danger me-1">${summary.criticalCves} Critical</span>` : ''}
                                                        ${summary.highCves > 0 ? html`<span class="badge bg-orange-lt text-orange me-1">${summary.highCves} High</span>` : ''}
                                                        ${summary.mediumCves > 0 ? html`<span class="badge bg-yellow-lt text-yellow me-1">${summary.mediumCves} Medium</span>` : ''}
                                                        ${summary.lowCves > 0 ? html`<span class="badge bg-azure-lt text-azure me-1">${summary.lowCves} Low</span>` : ''}
                                                    </div>
                                                ` : html`<span class="text-muted">No CVEs</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Exploit Probability (EPSS)</div>
                                                <div class="text-muted small">Likelihood CVEs are actively exploited</div>
                                            </div>
                                            <div class="text-end">
                                                ${constituents.maxEpssStored ? html`
                                                    <span class="badge ${constituents.maxEpssStored > 0.5 ? 'bg-danger-lt text-danger' : constituents.maxEpssStored > 0.3 ? 'bg-warning-lt text-warning' : 'bg-info-lt text-info'}">
                                                        ${(constituents.maxEpssStored * 100).toFixed(0)}%
                                                    </span>
                                                ` : html`<span class="text-muted">Unknown</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Known Exploits</div>
                                                <div class="text-muted small">CVEs with publicly available exploits</div>
                                            </div>
                                            <div class="text-end">
                                                ${hasKnownExploit ? html`<span class="badge bg-danger-lt text-danger">${knownExploitCount > 0 ? `${knownExploitCount} exploit${knownExploitCount > 1 ? 's' : ''}` : '1+ Exploits'}</span>` : html`<span class="text-muted">None known</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Network Exposure</div>
                                                <div class="text-muted small">Device network configuration and IP type</div>
                                            </div>
                                            <div class="text-end">
                                                <span class="badge ${networkExposure.badgeClass}">${networkExposure.label}</span>
                                            </div>
                                        </div>
                                        ${networkExposure.reasons && networkExposure.reasons.length ? html`
                                            <div class="text-muted small mt-1">
                                                ${networkExposure.reasons.join(' • ')}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>

                            <div class="mb-4">
                                <h5>How to Improve This Score</h5>
                                <ol class="small">
                                    ${summary.vulnerableApps > 0 ? html`
                                        <li class="mb-2">
                                            <strong>Patch Vulnerable Applications</strong><br />
                                            <span class="text-muted">Update ${summary.vulnerableApps} application(s) to the latest versions. This is the most effective way to reduce risk.</span>
                                        </li>
                                    ` : ''}
                                    ${summary.criticalCves > 0 || summary.highCves > 0 ? html`
                                        <li class="mb-2">
                                            <strong>Prioritize Critical/High CVEs</strong><br />
                                            <span class="text-muted">Address the ${summary.criticalCves + summary.highCves} most severe vulnerabilities first.</span>
                                        </li>
                                    ` : ''}
                                    <li class="mb-2">
                                        <strong>Restrict Network Access</strong><br />
                                        <span class="text-muted">Limit exposure by using VPN, firewalls, or network segmentation to reduce attack surface.</span>
                                    </li>
                                    <li class="mb-2">
                                        <strong>Keep System Updated</strong><br />
                                        <span class="text-muted">Enable automatic Windows and application updates to receive patches quickly.</span>
                                    </li>
                                    <li class="mb-2">
                                        <strong>Monitor Device Activity</strong><br />
                                        <span class="text-muted">Review telemetry regularly and watch for unusual network or system behavior.</span>
                                    </li>
                                </ol>
                            </div>

                            <div class="alert alert-info small">
                                <strong>How it's calculated:</strong> The score starts at 100 (perfect) and is reduced by CVE severity (critical × 35, high × 20, medium × 10, low × 4), exploit probability (EPSS), and vulnerable app count. A score of ${healthScore} means ${riskScore} risk points deducted.
                            </div>
                        </div>
                        <div class="modal-footer d-flex justify-content-between align-items-center">
                            <button type="button" class="btn btn-secondary" onclick=${() => this.closeRiskExplanationModal()}>Close</button>
                            <a href="#!/devices/${device.id}" class="btn btn-primary" onclick=${(e) => { e.preventDefault(); this.closeRiskExplanationModal(); window.location.hash = `#!/devices/${device.id}`; }}>
                                View Details
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop fade show" style="z-index: 2054;"></div>
        `;
    }

    renderApexCharts() {
        if (!window.ApexCharts) {
            console.warn('[DevicesPage] ApexCharts not available');
            return;
        }

        if (!this.state.showDeviceModal || !this.state.selectedDevice) {
            return;
        }

        const deviceId = this.state.selectedDevice.id;
        const summary = this.state.deviceSummaries[deviceId] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
        const enrichedScore = this.state.enrichedScores[deviceId]?.score ?? summary.score ?? 0;
        const numericEnriched = Number(enrichedScore);
        const safeScore = Number.isFinite(numericEnriched) ? numericEnriched : 0;
        const displayScore = Math.max(0, Math.min(100, Math.round(safeScore)));
        const safeRadialSeries = [Number.isFinite(displayScore) ? displayScore : 0];
        const gradientStart = '#2fb344';
        const gradientEnd = '#d63939';
        // 100=best (green), 0=worst (red)
        const scoreColor = displayScore >= 80 ? gradientStart : displayScore >= 60 ? '#fab005' : displayScore >= 40 ? '#f59f00' : gradientEnd;

        if (this.riskChartEl && this.riskChartEl.getBoundingClientRect().width > 0) {
            destroyChart(this.riskChart);

                const riskOptions = {
                    chart: {
                        type: 'radialBar',
                        height: 62,
                        sparkline: { enabled: true }
                    },
                    colors: [gradientStart],
                    fill: {
                        type: 'gradient',
                        gradient: {
                            shade: 'light',
                            type: 'horizontal',
                            colorStops: [
                                { offset: 0, color: '#2fb344', opacity: 1 },
                                { offset: 33, color: '#f59f00', opacity: 1 },
                                { offset: 66, color: '#fab005', opacity: 1 },
                                { offset: 100, color: '#d63939', opacity: 1 }
                            ]
                        }
                    },
                    series: safeRadialSeries,
                    plotOptions: {
                        radialBar: {
                            startAngle: -130,
                            endAngle: 130,
                            hollow: { size: '44%' },
                            track: {
                                background: '#e9ecef',
                                strokeWidth: '88%'
                            },
                            dataLabels: {
                                name: { show: false },
                                value: {
                                    formatter: (val) => `${Math.round(val)}%`,
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    offsetY: 6
                                }
                            }
                        }
                    },
                    stroke: { lineCap: 'round' }
                };

            this.riskChart = new window.ApexCharts(this.riskChartEl, riskOptions);
            this.riskChart.render();
        }

        const totalApps = summary.apps || 0;
        const vulnApps = summary.vulnerableApps || 0;
        const healthyApps = Math.max(totalApps - vulnApps, 0);
        const appsSeries = totalApps > 0 ? [vulnApps, healthyApps] : [1];
        const appsLabels = totalApps > 0 ? ['Vulnerable', 'Healthy'] : ['No data'];
        const appsColors = totalApps > 0 ? ['#d63939', '#2fb344'] : ['#e9ecef'];
        const appsTotalLabel = totalApps > 0 ? `${vulnApps}/${totalApps}` : '0/0';

        if (this.appsChartEl && this.appsChartEl.getBoundingClientRect().width > 0) {
            destroyChart(this.appsChart);

            const appsOptions = {
                chart: {
                    type: 'pie',
                    height: 56,
                    sparkline: { enabled: true }
                },
                series: appsSeries,
                labels: appsLabels,
                colors: appsColors,
                legend: { show: false },
                dataLabels: {
                    enabled: true,
                    style: { fontSize: '10px', fontWeight: 400 },
                    dropShadow: { enabled: false },
                    formatter: (val, opts) => `${opts.w.globals.labels[opts.seriesIndex]} ${appsSeries[opts.seriesIndex] ?? 0}`
                },
                stroke: { width: 0 },
                plotOptions: { pie: { expandOnClick: false } },
                tooltip: { enabled: false }
            };

            this.appsChart = new window.ApexCharts(this.appsChartEl, appsOptions);
            this.appsChart.render();
        }

        const totalCves = (summary.criticalCves || 0) + (summary.highCves || 0) + (summary.mediumCves || 0) + (summary.lowCves || 0);
        const cveSeries = totalCves > 0 ? [summary.criticalCves || 0, summary.highCves || 0, summary.mediumCves || 0, summary.lowCves || 0] : [1];
        const cveLabels = totalCves > 0 ? ['Critical', 'High', 'Medium', 'Low'] : ['No CVEs'];
        const cveColors = totalCves > 0 ? ['#d63939', '#f59f00', '#fab005', '#74b816'] : ['#e9ecef'];

        if (this.cvesChartEl && this.cvesChartEl.getBoundingClientRect().width > 0) {
            destroyChart(this.cvesChart);

            const cveOptions = {
                chart: {
                    type: 'pie',
                    height: 56,
                    sparkline: { enabled: true }
                },
                series: cveSeries,
                labels: cveLabels,
                colors: cveColors,
                legend: { show: false },
                dataLabels: {
                    enabled: true,
                    style: { fontSize: '10px', fontWeight: 400 },
                    dropShadow: { enabled: false },
                    formatter: (val, opts) => `${opts.w.globals.labels[opts.seriesIndex]} ${cveSeries[opts.seriesIndex] ?? 0}`
                },
                stroke: { width: 0 },
                plotOptions: { pie: { expandOnClick: false } },
                tooltip: { enabled: false }
            };

            this.cvesChart = new window.ApexCharts(this.cvesChartEl, cveOptions);
            this.cvesChart.render();
        }
    }

    renderTableApexCharts() {
        // Table row gauges removed — risk score shown as plain number
    }

    destroyTableApexCharts() {
    }

    destroyApexCharts() {
        destroyChart(this.riskChart);
        this.riskChart = null;

        destroyChart(this.appsChart);
        this.appsChart = null;

        destroyChart(this.cvesChart);
        this.cvesChart = null;

        if (this.riskChartEl) this.riskChartEl.innerHTML = '';
        if (this.cvesChartEl) this.cvesChartEl.innerHTML = '';
    }

    enrichDeviceScore(summary) {
        const constituents = summary.constituents;
        const fallbackScore = Number.isFinite(Number(summary?.score)) ? Number(summary.score) : 0;
        const cveCount = Number(constituents?.cveCount ?? summary?.cves ?? 0);
        if (!constituents || cveCount === 0) {
            return { score: fallbackScore, constituents, enrichmentFactors: {} };
        }

        const normalizeUnitInterval = (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) return 0;
            if (numeric <= 1) return numeric;
            if (numeric <= 100) return numeric / 100;
            if (numeric <= 1000000000) return numeric / 1000000000;
            return 1;
        };
        
        // Base calculation: CVSS × EPSS (both normalized to 0-1). If the
        // enrichment inputs are missing, keep the trusted server score rather
        // than collapsing the device to an artificial zero-risk state.
        const maxCvssNormalized = normalizeUnitInterval(constituents.maxCvssNormalized);
        const maxEpssNormalized = normalizeUnitInterval(constituents.maxEpssStored);
        if (maxCvssNormalized <= 0 || maxEpssNormalized <= 0) {
            return {
                score: fallbackScore,
                constituents: {
                    ...constituents,
                    maxCvssNormalized,
                    maxEpssStored: maxEpssNormalized
                },
                enrichmentFactors: { usedFallbackScore: true }
            };
        }

        const riskFactor = maxCvssNormalized * maxEpssNormalized;
        
        // Check if any CVE is a known exploit (would need CVE details in summary for this)
        const hasKnownExploit = false; // Updated when we have CVE details
        const exploitFactor = hasKnownExploit ? 1.5 : 1.0;
        
        // Time decay: EPSS degrades over time
        const epssDate = new Date(constituents.epssDate);
        const daysSinceEpss = (Date.now() - epssDate) / (1000 * 60 * 60 * 24);
        const timeDecayFactor = Math.max(0.1, 1.0 - (daysSinceEpss / 365));
        
        // Final score with all factors
        const finalRisk = (
            riskFactor *
            (Number(constituents.exposureFactor) || 1) *
            (Number(constituents.privilegeFactor) || 1) *
            exploitFactor *
            timeDecayFactor
        ) * 100;
        
        const enrichedScore = Math.min(100, Math.max(0, Math.round(finalRisk * 100) / 100));
        
        return {
            score: enrichedScore,
            constituents: {
                ...constituents,
                maxCvssNormalized,
                maxEpssStored: maxEpssNormalized
            },
            enrichmentFactors: {
                hasKnownExploit,
                timeDecayFactor: Math.round(timeDecayFactor * 10000) / 10000,
                daysSinceEpss: Math.round(daysSinceEpss)
            }
        };
    }

    async loadKnownExploitsAsync() {
        try {
            const kevSet = await getKevSet();
            this.KNOWN_EXPLOITS_CACHE.data = kevSet;
            this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
            this.setState({ knownExploits: kevSet });
        } catch (error) {
            console.warn('[DevicesPage] Could not load known exploits:', error.message);
            const empty = new Set();
            this.KNOWN_EXPLOITS_CACHE.data = empty;
            this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
            this.setState({ knownExploits: empty });
        }
    }

    async loadInstallerConfig() {
        try {
            const manifestConfig = await getInstallerConfig();
            if (manifestConfig) {
                this.setState({ installers: manifestConfig, manifestError: null });
                console.log('[Devices] Loaded installer config from manifest cache:', manifestConfig);
            } else {
                // Local/dev fallback: use static installer config without surfacing an error state.
                this.setState({ installers: config.INSTALLERS || this.state.installers, manifestError: null });
            }
        } catch (error) {
            console.error('[Devices] Failed to load manifest config, using fallback:', error);
            this.setState({ installers: config.INSTALLERS || this.state.installers, manifestError: 'Installer metadata is temporarily unavailable. Using built-in download configuration.' });
        }
    }

    async reloadPageData() {
        try {
            this.setState({ refreshingManifest: true });
            
            // Clear manifest cache and reload from remote
            const manifestConfig = await getInstallerConfig(true);
            if (manifestConfig) {
                this.setState({ installers: manifestConfig });
            }
            
            // Reload device list
            await this.loadDevices(true);
            
            // Show success toast
            this.showToast('Page reloaded successfully', 'success');
        } catch (error) {
            console.error('[Devices] Failed to reload page data:', error);
            this.showToast('Failed to reload page data', 'danger');
        } finally {
            this.setState({ refreshingManifest: false });
        }
    }

    showToast(message, type = 'info') {
        if (!window.toast) {
            console.warn('[Devices] Toast not available:', message);
            return;
        }
        const toastType = type === 'danger' ? 'error' : type;
        window.toast[toastType](message);
    }

    openDownloadModal(arch) {
        const installer = arch === 'x64' ? this.state.installers.X64 : this.state.installers.ARM64;
        this.setState({
            showDownloadModal: true,
            downloadTarget: {
                name: installer.DISPLAY_NAME,
                url: installer.DOWNLOAD_URL,
                size: installer.FILE_SIZE_MB,
                arch: installer.ARCHITECTURE,
                warning: installer.WARNING
            }
        });
    }

    closeDownloadModal() {
        this.setState({
            showDownloadModal: false,
            downloadTarget: null
        });
    }

    confirmDownload() {
        if (this.state.downloadTarget) {
            // Create a hidden anchor element to trigger download
            const a = document.createElement('a');
            a.href = this.state.downloadTarget.url;
            a.download = '';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.closeDownloadModal();
        }
    }

    getCurrentOrgId() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.showToast('No organization selected', 'danger');
            return null;
        }
        return currentOrg.orgId;
    }

    async enableDevice(deviceId) {
        if (!confirm('Enable this device? The device must re-register (license validation + heartbeat) before it becomes ACTIVE again.')) return;

        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        try {
            // Use consolidated state endpoint
            const response = await api.updateDeviceState(orgId, deviceId, 'ENABLED', {
                reason: 'Admin enabled via Portal'
            });

            if (response.success) {
                this.optimisticSetDeviceState(deviceId, 'Enabled');
                await this.loadDevices(true);
                this.showToast('Device enabled. Re-registration required.', 'success');
            } else {
                throw new Error(response.message || 'Failed to enable device');
            }
        } catch (error) {
            console.error('[Devices] Enable failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async blockDevice(deviceId, deleteTelemetry = false) {
        const confirmMessage = deleteTelemetry
            ? 'Block this device and delete its telemetry? Device will remove license and terminate. Seat will be released. Telemetry deletion cannot be undone.'
            : 'Block this device? Device will remove license and terminate. Seat will be released.';

        if (!confirm(confirmMessage)) return;

        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        try {
            // Use consolidated state endpoint
            const response = await api.updateDeviceState(orgId, deviceId, 'BLOCKED', {
                deleteTelemetry,
                reason: deleteTelemetry 
                    ? 'Admin blocked device with telemetry deletion via Portal'
                    : 'Admin blocked device via Portal'
            });

            if (response.success) {
                this.optimisticSetDeviceState(deviceId, 'Blocked');
                await this.loadDevices(true);
                this.showToast(deleteTelemetry ? 'Device blocked. Seat released. Telemetry deleted.' : 'Device blocked successfully. Seat released.', 'success');
            } else {
                throw new Error(response.message || 'Failed to block device');
            }
        } catch (error) {
            console.error('[Devices] Block failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async deleteDevice(deviceId) {
        if (!confirm('Delete this device? All telemetry data will be removed. This cannot be undone.')) return;

        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        try {
            const response = await api.delete(`/api/v1/orgs/${orgId}/devices/${deviceId}`);

            if (response.success) {
                this.optimisticSetDeviceState(deviceId, 'Deleted');
                await this.loadDevices(true);
                this.showToast('Device deleted successfully. All data removed.', 'success');
            } else {
                throw new Error(response.message || 'Failed to delete device');
            }
        } catch (error) {
            console.error('[Devices] Delete failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    componentWillUnmount() {
        // Unsubscribe from org changes
        if (this.orgUnsubscribe) {
            this.orgUnsubscribe();
        }
    }

    tryGetCachedDevices(orgId) {
        try {
            const key = `devices_${orgId}`;
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { devices, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = 5 * 60 * 1000; // 5 minutes
            if (ageMs < TTL_MS) {
                console.log(`[DevicesPage] 📦 Cache HIT: ${devices.length} devices from localStorage`);
                return devices;
            }
            localStorage.removeItem(key);
        } catch (err) {
            console.warn('[DevicesPage] Cache read error:', err);
        }
        return null;
    }

    setCachedDevices(orgId, devices) {
        try {
            const key = `devices_${orgId}`;
            localStorage.setItem(key, JSON.stringify({
                devices,
                timestamp: Date.now()
            }));
        } catch (err) {
            console.warn('[DevicesPage] Cache write error:', err);
        }
    }

    getCachedSummaries(orgId) {
        try {
            const key = `device_summaries_${orgId}`;
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = 15 * 60 * 1000; // 15 minutes
            if (ageMs < TTL_MS) {
                console.log(`[DevicesPage] 📦 Summary cache HIT: ${Object.keys(data).length} summaries from localStorage`);
                return data;
            }
            localStorage.removeItem(key);
        } catch (err) {
            console.warn('[DevicesPage] Summary cache read error:', err);
        }
        return null;
    }

    setCachedSummaries(orgId, summaries) {
        try {
            const key = `device_summaries_${orgId}`;
            localStorage.setItem(key, JSON.stringify({
                data: summaries,
                timestamp: Date.now()
            }));
        } catch (err) {
            console.warn('[DevicesPage] Summary cache write error:', err);
        }
    }

    async enrichDeviceScoresAsync(devices, summaries) {
        // Enrich risk scores in background
        try {
            const enriched = {};
            for (const device of devices) {
                const summary = summaries[device.id];
                if (summary && summary.constituents) {
                    enriched[device.id] = this.enrichDeviceScore(summary);
                }
            }
            if (Object.keys(enriched).length > 0) {
                this.setState(prev => ({
                    enrichedScores: { ...prev.enrichedScores, ...enriched }
                }));
            }
        } catch (error) {
            console.warn('[DevicesPage] Error enriching scores:', error);
        }
    }

    async loadDevices(forceRefresh = false) {
        try {
            // Get current org from context
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                this.setState({ 
                    devices: [], 
                    loading: false,
                    isRefreshingInBackground: false,
                    error: 'No organization selected'
                });
                return;
            }

            // Try to load from cache immediately
            if (!forceRefresh) {
                const cached = this.tryGetCachedDevices(currentOrg.orgId);
                const cachedSummaries = this.getCachedSummaries(currentOrg.orgId) || {};
                if (cached) {
                    console.log('[DevicesPage] ⚡ Loading from cache immediately...');
                    this.setState({ devices: cached, loading: false, error: null, deviceSummaries: cachedSummaries, isRefreshingInBackground: false });
                    // Continue to background refresh (don't return)
                }
            }

            // Show loading state only if not using cache
            if (!this.state.devices || this.state.devices.length === 0) {
                this.setState({ loading: true, error: null });
            } else {
                // Already showing cached data; keep existing view stable while refreshing in the background
                this.setState({ isRefreshingInBackground: false });
            }

            // Step 1: Fast load with cached-summary (< 12s instead of 35s)
            const response = await api.getDevices(currentOrg.orgId, { include: 'cached-summary' }, { skipCache: forceRefresh });
            if (!response.success) {
                throw new Error(response.message || response.error || 'Failed to load devices');
            }
            
            // Transform API response to expected format
            const summariesFromApi = {};
            const devices = (response.data?.devices || []).map(device => {
                const summary = this.normalizeSummary(device.summary || device.Summary);

                // Mask license key - only show last 8 characters
                let maskedKey = null;
                if (device.licenseKey) {
                    const key = device.licenseKey;
                    maskedKey = key.length > 8 ? `****-****-${key.slice(-8)}` : key;
                }
                
                const t = device.telemetry || device.Telemetry || {};
                // Robust device name extraction with multiple fallbacks
                const rawName = (device.deviceName && device.deviceName.trim())
                    ? device.deviceName
                    : (device.DeviceName && device.DeviceName.trim())
                    ? device.DeviceName
                    : (t.hostname && String(t.hostname).trim())
                    ? t.hostname
                    : (t.Hostname && String(t.Hostname).trim())
                    ? t.Hostname
                    : device.deviceId;
                // Prefer Devices table name; if absent, use telemetry hostname (decoded if needed), else deviceId.
                // Try to decode if stored name is still encrypted (base64/PII); fall back to raw.
                const nameFromDeviceRaw = rawName && rawName.trim();
                const nameFromDevice = nameFromDeviceRaw ? (PiiDecryption.decryptIfEncrypted(nameFromDeviceRaw) || nameFromDeviceRaw) : null;
                const telemetryHostRaw = (t.hostname ?? t.Hostname ?? '').toString().trim();
                const telemetryHost = telemetryHostRaw || null;
                const telemetryDecoded = telemetryHost ? PiiDecryption.decryptIfEncrypted(telemetryHost) : null;
                const telemetryName = (telemetryDecoded && telemetryDecoded.trim()) || telemetryHost;
                const deviceName = nameFromDevice || telemetryName || device.deviceId;
                const mapped = {
                    id: device.DeviceId || device.deviceId,
                    name: deviceName,
                    state: (device.state || device.State || 'Unknown'),
                    lastHeartbeat: device.lastHeartbeat,
                    firstHeartbeat: device.firstHeartbeat || device.firstSeen || device.createdAt,
                    clientVersion: device.clientVersion,
                    licenseKey: maskedKey,
                    telemetry: {
                        osEdition: t.osEdition || t.OSEdition || t.oseEdition,
                        osVersion: t.osVersion || t.OSVersion,
                        osBuild: t.osBuild || t.OSBuild,
                        cpuArch: t.cpuArch || t.CPUArch,
                        cpuName: t.cpuName || t.CPUName,
                        cpuCores: t.cpuCores || t.CPUCores,
                        cpuGHz: t.cpuGHz || t.CPUGHz,
                        totalRamMb: t.totalRamMb || t.TotalRamMb,
                        totalDiskGb: t.totalDiskGb || t.TotalDiskGb,
                        connectionType: t.connectionType || t.ConnectionType,
                        networkSpeedMbps: t.networkSpeedMbps || t.NetworkSpeedMbps,
                        systemDiskMediaType: t.systemDiskMediaType || t.SystemDiskMediaType,
                        systemDiskBusType: t.systemDiskBusType || t.SystemDiskBusType,
                        timestamp: t.timestamp || t.Timestamp,
                        rowKey: t.rowKey || t.RowKey
                    },
                    // Calculate inactiveMinutes client-side
                    inactiveMinutes: device.lastHeartbeat ? Math.floor((Date.now() - new Date(device.lastHeartbeat).getTime()) / 60000) : null,
                    perfSessions: device.perfSessions || device.PerfSessions
                };

                if (summary) {
                    summariesFromApi[mapped.id] = summary;
                }
                return mapped;
            });

            this.setCachedDevices(currentOrg.orgId, devices);
            
            // Step 2: Try to enrich with cached summaries immediately
            const cachedSummaries = this.getCachedSummaries(currentOrg.orgId) || {};
            const hasCache = Object.keys(cachedSummaries).length > 0;
            
            this.setState(prev => {
                const updatedSelected = prev.selectedDevice ? devices.find(d => d.id === prev.selectedDevice.id) : null;
                const mergedSummaries = { ...prev.deviceSummaries, ...cachedSummaries, ...summariesFromApi };
                return {
                    devices,
                    loading: false,
                    isRefreshingInBackground: false,
                    deviceSummaries: mergedSummaries,
                    summarySignalState: Object.keys(mergedSummaries).length > 0 ? 'cached' : 'pending',
                    summarySignalMessage: null,
                    selectedDevice: updatedSelected || prev.selectedDevice
                };
            }, () => {
                const filteredNow = DeviceFilterService.getFilteredDevices(this.state.devices, this.state.searchQuery, this.state.deviceFilters, this.state.sortField, this.state.sortAsc, this.state.enrichedScores);
                this.setState({ filteredDevices: filteredNow }, () => this.renderTableApexCharts());
            });
            
            // Step 3: Background fetch with summary (don't wait, enrich silently)
            // Skip if forced refresh (already have fresh data) and no cache (nothing to update)
            const shouldRefreshSummariesInBackground = !forceRefresh || hasCache;
            if (shouldRefreshSummariesInBackground) {
                if (!forceRefresh) {
                    this.setState({ isRefreshingInBackground: true });
                }
                this.loadSummariesInBackground(currentOrg.orgId, devices);
            } else {
                this.setState({ isRefreshingInBackground: false });
            }
            
            // Background: Load known exploits and enrich risk scores
            this.loadKnownExploitsAsync();
            const allSummaries = { ...cachedSummaries, ...summariesFromApi };
            if (Object.keys(allSummaries).length > 0) {
                this.enrichDeviceScoresAsync(devices, allSummaries);
            }
        } catch (error) {
            console.error('[DevicesPage] Error loading devices:', error);
            this.setState({ error: error.message, loading: false, isRefreshingInBackground: false });
        }
    }

    async loadSummariesInBackground(orgId, devices) {
        if (this.summaryRefreshInFlight) {
            return;
        }

        this.summaryRefreshInFlight = true;
        try {
            console.log('[DevicesPage] 🔄 Background fetch: loading fresh summaries...');
            this.setState({ summarySignalState: 'refreshing', summarySignalMessage: null });
            
            // Wait a bit to let the UI settle first
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Fetch fresh summaries (skip cached, get real-time data)
            const response = await Promise.race([
                api.getDevices(orgId, { include: 'summary' }, { skipCache: true, skipDegradedHandling: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Background summary fetch timed out')), 12000))
            ]);
            
            if (!response.success || !response.data?.devices) {
                console.warn('[DevicesPage] Background summary fetch failed');
                return;
            }

            // Extract summaries from response
            const freshSummaries = {};
            response.data.devices.forEach(device => {
                const deviceId = device.DeviceId || device.deviceId;
                const summary = this.normalizeSummary(device.summary || device.Summary);
                if (summary && deviceId) {
                    freshSummaries[deviceId] = summary;
                }
            });

            // Step 4: Cache the fresh summaries
            this.setCachedSummaries(orgId, freshSummaries);

            // Update UI with fresh data (silent update)
            this.setState(prev => ({
                deviceSummaries: { ...prev.deviceSummaries, ...freshSummaries },
                isRefreshingInBackground: false,
                summarySignalState: 'ready',
                summarySignalMessage: null
            }), () => {
                // Re-render charts with new data
                this.renderTableApexCharts();
                // Re-enrich scores with fresh data
                this.enrichDeviceScoresAsync(devices, freshSummaries);
            });

            console.log(`[DevicesPage] ✅ Background fetch complete: ${Object.keys(freshSummaries).length} summaries cached`);
        } catch (err) {
            console.warn('[DevicesPage] Background summary fetch error:', err);
            this.setState({
                summarySignalState: 'stale',
                summarySignalMessage: 'Using last verified device signals while the live summary refresh is unavailable.'
            });
        } finally {
            this.summaryRefreshInFlight = false;
            this.setState({ isRefreshingInBackground: false });
        }
    }

    optimisticSetDeviceState(deviceId, newState) {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        this.setState(prev => {
            const updated = (prev.devices || []).map(d => (d.id === deviceId ? { ...d, state: newState } : d));
            this.setCachedDevices(currentOrg.orgId, updated);
            return { devices: updated };
        });
    }

    canEnableDevice(state) {
        // Any non-active state can be re-enabled (DISABLED, BLOCKED, DELETED).
        // BlockedReason is enforced server-side; UI just offers the menu item.
        const s = (state || '').toLowerCase();
        return s === 'blocked' || s === 'deleted' || s === 'disabled';
    }

    canBlockDevice(state) {
        // Active or disabled devices can be blocked. Already-blocked / deleted hide the option.
        const s = (state || '').toLowerCase();
        return s === 'active' || s === 'enabled' || s === 'inactive' || s === 'disabled';
    }

    /**
     * Reason a remote-agent command (Trigger Scan, Trigger Update, Collect Logs)
     * cannot be sent to a device, given its lifecycle state. Returns null when the
     * command is honored, or a short human-readable reason otherwise so the menu
     * item can be disabled with an explanatory tooltip rather than hidden.
     */
    getAgentCommandBlockReason(state) {
        const s = (state || '').toLowerCase();
        if (s === 'disabled') return 'Device is disabled — agent is muted and will not run remote commands. Enable the device first.';
        if (s === 'blocked')  return 'Device is blocked — agent has removed itself. Enable the device to allow remote commands.';
        if (s === 'deleted')  return 'Device has been deleted — no agent is available to receive commands.';
        return null;
    }

    /**
     * Reason a remote-agent command (Trigger Scan, Trigger Update, Collect Logs)
     * cannot be sent to a device, given its lifecycle state. Returns null when the
     * command is honored, or a short human-readable reason otherwise so the menu
     * item can be disabled with an explanatory tooltip rather than hidden.
     */
    getAgentCommandBlockReason(state) {
        const s = (state || '').toLowerCase();
        if (s === 'disabled') return 'Device is disabled — agent is muted and will not run remote commands. Enable the device first.';
        if (s === 'blocked')  return 'Device is blocked — agent has removed itself. Enable the device to allow remote commands.';
        if (s === 'deleted')  return 'Device has been deleted — no agent is available to receive commands.';
        return null;
    }

    computeSecuritySummary(cves) {
        const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 };
        for (const c of (cves || [])) {
            counts.total++;
            const sev = String(c.severity || '').toUpperCase();
            if (sev === 'CRITICAL') counts.critical++;
            else if (sev === 'HIGH') counts.high++;
            else if (sev === 'MEDIUM') counts.medium++;
            else if (sev === 'LOW') counts.low++;
            else counts.unknown++;
        }

        let badgeClass = 'bg-success-lt text-success';
        let label = 'Secure';
        if (counts.critical > 0) { badgeClass = 'bg-danger-lt text-danger'; label = 'Critical'; }
        else if (counts.high > 0) { badgeClass = 'bg-warning-lt text-warning'; label = 'High Risk'; }
        else if (counts.medium > 0) { badgeClass = 'bg-secondary-lt text-secondary'; label = 'Medium Risk'; }
        else if (counts.total > 0) { badgeClass = 'bg-primary-lt text-primary'; label = 'Low Risk'; }

        return { counts, badgeClass, label };
    }

    isPrivateIp(ip) {
        if (!ip) return false;
        const v4 = ip.split('.');
        if (v4.length === 4) {
            const [a, b] = v4.map(Number);
            if (a === 10) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
            if (a === 192 && b === 168) return true;
            if (a === 127) return true;
            return false;
        }
        // IPv6 unique local fc00::/7
        return ip.startsWith('fc') || ip.startsWith('Fd') || ip.startsWith('fd');
    }

    deriveNetworkExposure(telemetryDetail) {
        const fields = telemetryDetail?.history?.[0]?.fields || telemetryDetail?.latest?.fields || {};
        const rawExposure = fields.NetworkExposureJson || fields.networkExposureJson;
        const ipRaw = fields.IPAddresses || fields.ipAddresses;
        let parsed = null;
        if (rawExposure) {
            try { parsed = JSON.parse(rawExposure); } catch (e) { parsed = null; }
        }

        const ips = (() => {
            if (Array.isArray(ipRaw)) return ipRaw;
            if (typeof ipRaw === 'string') {
                try {
                    const parsedIps = JSON.parse(ipRaw);
                    if (Array.isArray(parsedIps)) return parsedIps;
                } catch (err) { /* fall back */ }
                return ipRaw.split(/[;,\s]+/).filter(Boolean);
            }
            return [];
        })();

        const exposure = {
            label: 'Unknown',
            badgeClass: 'bg-secondary-lt text-secondary',
            reasons: [],
            missingAdmin: [
                'Firewall status',
                'Inbound RDP/SMB exposure',
                'Endpoint protection status'
            ]
        };

        const hasAnyData = parsed !== null || (ips && ips.length > 0);
        if (!hasAnyData) {
            exposure.reasons.push('No network telemetry available');
            return exposure;
        }

        const data = parsed || {};
        const publicIpCount = data.PublicIpCount ?? data.publicIpCount ?? ips.filter(ip => !this.isPrivateIp(ip)).length;
        const privateIpCount = data.PrivateIpCount ?? data.privateIpCount ?? ips.filter(ip => this.isPrivateIp(ip)).length;
        const vpnInterfaces = data.VpnInterfaces ?? data.vpnInterfaces ?? 0;
        const wirelessInterfaces = data.WirelessInterfaces ?? data.wirelessInterfaces ?? 0;
        const ethernetInterfaces = data.EthernetInterfaces ?? data.ethernetInterfaces ?? 0;
        const apipaPresent = data.ApipaPresent ?? data.apipaPresent ?? false;
        const gatewayCount = data.GatewayCount ?? data.gatewayCount ?? null;
        const uniqueIpCount = data.UniqueIpCount ?? data.uniqueIpCount ?? ips.length;
        const isMetered = data.IsMetered ?? data.isMetered ?? fields.IsMeteredConnection ?? fields.isMeteredConnection;

        if (publicIpCount > 0) {
            exposure.label = 'High';
            exposure.badgeClass = 'bg-danger-lt text-danger';
            exposure.reasons.push('Public IP detected');
        } else if (vpnInterfaces > 0) {
            exposure.label = 'Lower';
            exposure.badgeClass = 'bg-success-lt text-success';
            exposure.reasons.push('VPN interface active');
        } else if (wirelessInterfaces > 0 && privateIpCount > 0) {
            exposure.label = 'Medium';
            exposure.badgeClass = 'bg-warning-lt text-warning';
            exposure.reasons.push('Wireless connection detected');
        } else if (ethernetInterfaces > 0) {
            exposure.label = 'Medium';
            exposure.badgeClass = 'bg-info-lt text-info';
            exposure.reasons.push('Wired connection detected');
        }

        if (apipaPresent) {
            exposure.reasons.push('APIPA detected (DHCP issues)');
        }

        if (isMetered) {
            exposure.reasons.push('Metered connection');
        }

        if (gatewayCount === 0) {
            exposure.reasons.push('No gateway (likely isolated)');
        }

        if (exposure.reasons.length === 0) {
            exposure.reasons.push('Standard private network detected');
            exposure.label = exposure.label === 'Unknown' ? 'Low' : exposure.label;
            exposure.badgeClass = exposure.badgeClass === 'bg-secondary-lt text-secondary' ? 'bg-success-lt text-success' : exposure.badgeClass;
        }

        // Add context on IP diversity if available
        if (uniqueIpCount > 3) {
            exposure.reasons.push('Multiple IPs observed (mobility)');
        }

        return exposure;
    }

    async openDeviceModal(device) {
        this.setState({
            showDeviceModal: true,
            selectedDevice: device,
            telemetryLoading: true,
            telemetryError: null,
            telemetryDetail: null,
            activeInventoryTab: 'apps',
            highlightedApp: null,
            highlightedCve: null
        });
        try {
            const currentOrg = orgContext.getCurrentOrg();
            // Load telemetry for recent changes timeline
            const resp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${device.id}/telemetry?historyLimit=50&lastDays=180`);
            if (!resp.success) throw new Error(resp.message || resp.error || 'Failed to load telemetry');
            this.setState({ telemetryDetail: resp.data, telemetryLoading: false });
            
            // OPTIMIZATION: Device summary is already available from GetDevices(include=summary)
            // No need to fetch device-specific apps/CVEs - use the summary for modal stats
            // The detailed inventory is available only in the full device details page
            // This saves 2 expensive API calls per modal open
        } catch (e) {
            console.error('[Devices] Telemetry load failed', e);
            this.setState({ telemetryError: e.message, telemetryLoading: false });
        }
    }

    closeDeviceModal() {
        this.setState({ showDeviceModal: false, selectedDevice: null, telemetryDetail: null, telemetryError: null });
    }

    openRiskExplanationModal(device) {
        this.setState({ showRiskExplanationModal: true, riskExplanationDevice: device });
    }

    closeRiskExplanationModal() {
        this.setState({ showRiskExplanationModal: false, riskExplanationDevice: null });
    }

    setSearchQuery(q) {
        this.setState({ searchQuery: q });
    }

    setSortField(field) {
        this.setState(prev => ({
            sortField: field,
            sortAsc: prev.sortField === field ? !prev.sortAsc : field === 'name'
        }));
    }

    // Compute enriched application inventory status and join CVE counts
    /**
     * Normalize app name for comparison by removing architecture suffix in parentheses
     * Examples:
     * - "Microsoft .NET AppHost Pack - 9.0.11 (x64)" → "Microsoft .NET AppHost Pack - 9.0.11"
     * - "Some App (x64_arm64)" → "Some App"
     * - "Simple App" → "Simple App"
     */
    normalizeAppName(appName) {
        if (!appName || typeof appName !== 'string') return '';
        // Remove anything in parentheses at the end (architecture suffixes)
        return appName.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().trim();
    }

    computeAppStatus(apps, cves = []) {
        // Group by appName+vendor
        const groups = {};
        for (const a of apps) {
            const key = `${this.normalizeAppName(a.appName)}|${(a.vendor||'').toLowerCase()}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        }
        const enriched = [];
        for (const key of Object.keys(groups)) {
            const list = groups[key].sort((x,y) => new Date(y.lastSeen||0) - new Date(x.lastSeen||0));
            const current = list[0];
            const previous = list.slice(1);
            let status = 'current'; // current | updated | uninstalled
            // Updated: previous exists with older version and lastSeen < current firstSeen or lastSeen < current lastSeen
            if (previous.length > 0) {
                const prevDifferentVersion = previous.find(p => (p.version||'') !== (current.version||''));
                if (prevDifferentVersion) {
                    const prevLast = new Date(prevDifferentVersion.lastSeen||0).getTime();
                    const currStart = new Date(current.firstSeen||current.lastSeen||0).getTime();
                    if (prevLast && currStart && prevLast < currStart) {
                        status = 'updated';
                    }
                }
            }
            // Uninstalled: app was installed but lastSeen older than current scan timestamp and not seen in current scan
            // Heuristic: if latest item flag isInstalled=false and an older item had isInstalled=true with lastSeen < latest scan
            const latestSeen = new Date(current.lastSeen||0).getTime();
            const prevInstalled = previous.find(p => p.isInstalled && new Date(p.lastSeen||0).getTime() < latestSeen);
            if (!current.isInstalled && prevInstalled) {
                status = 'uninstalled';
            }
            const normalizedCurrentAppName = this.normalizeAppName(current.appName);
            const relatedCves = cves.filter(c => this.normalizeAppName(c.appName) === normalizedCurrentAppName);
            const cveCount = relatedCves.length;
            const worstSeverity = relatedCves.reduce((acc, c) => Math.max(acc, this.severityWeight(c.severity)), 0);

            enriched.push({
                appName: current.appName,
                vendor: current.vendor,
                version: current.version,
                matchType: current.matchType,
                isInstalled: current.isInstalled,
                status,
                lastSeen: current.lastSeen,
                previousVersions: previous.map(p => ({ version: p.version, lastSeen: p.lastSeen })),
                cveCount,
                worstSeverity
            });
        }
        return enriched;
    }

    filterInventory(apps, q) {
        if (!q) return apps;
        const s = q.toLowerCase();
        return apps.filter(a => (a.appName||'').toLowerCase().includes(s) || (a.vendor||'').toLowerCase().includes(s));
    }

    formatLastSeen(lastHeartbeat) {
        if (!lastHeartbeat) {
            return 'Never';
        }

        const now = new Date();
        const then = new Date(lastHeartbeat);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    isVersionOutdated(deviceVersion) {
        if (!deviceVersion) return false;
        
        // Use cached installer version (or fallback to config)
        const latestVersion = this.state.installers.ENGINE.VERSION || config.INSTALLERS.ENGINE.VERSION;
        
        // Parse versions (format: major.minor.build)
        const parseVersion = (v) => {
            const parts = v.split('.').map(Number);
            return {
                major: parts[0] || 0,
                minor: parts[1] || 0,
                build: parts[2] || 0
            };
        };
        
        const device = parseVersion(deviceVersion);
        const latest = parseVersion(latestVersion);
        
        // Compare major.minor.build
        if (device.major < latest.major) return true;
        if (device.major === latest.major && device.minor < latest.minor) return true;
        if (device.major === latest.major && device.minor === latest.minor && device.build < latest.build) return true;
        
        return false;
    }

    // Builds a device object with .summary attached from state, mapping normalized summary fields
    // to the field names expected by renderRiskIndicator and renderPatchStatus.
    buildDeviceWithSummary(device) {
        const stateSummary = this.state.deviceSummaries[device.id] || {};
        const enriched = this.state.enrichedScores[device.id];
        return { ...device, summary: {
            appCount: stateSummary.apps || 0,
            vulnerableAppCount: stateSummary.vulnerableApps || 0,
            cveCount: stateSummary.cves || 0,
            criticalCveCount: stateSummary.criticalCves || 0,
            highCveCount: stateSummary.highCves || 0,
            mediumCveCount: stateSummary.mediumCves || 0,
            lowCveCount: stateSummary.lowCves || 0,
            score: enriched?.score ?? stateSummary.score ?? 0
        }};
    }

    // Returns a short OS label like "Win 11 Pro", "Win 10 Home", "Server 2022"
    getShortOsLabel(device) {
        const osText = device.telemetry?.osEdition || device.os || device.osEdition || '';
        if (!osText) return device.osProductType || device.osVersion || 'Unknown OS';
        const lower = osText.toLowerCase();
        if (lower.includes('windows 11')) {
            if (lower.includes('pro')) return 'Win 11 Pro';
            if (lower.includes('home')) return 'Win 11 Home';
            if (lower.includes('enterprise')) return 'Win 11 Ent';
            return 'Windows 11';
        }
        if (lower.includes('windows 10')) {
            if (lower.includes('pro')) return 'Win 10 Pro';
            if (lower.includes('home')) return 'Win 10 Home';
            if (lower.includes('enterprise')) return 'Win 10 Ent';
            return 'Windows 10';
        }
        if (lower.includes('server 2022')) return 'Server 2022';
        if (lower.includes('server 2019')) return 'Server 2019';
        if (lower.includes('server 2016')) return 'Server 2016';
        if (lower.includes('server')) return 'Windows Server';
        return osText.replace(/^Microsoft\s+/i, '').substring(0, 20);
    }

    // Returns the Tabler color token for the card-status-top ribbon (danger/warning/success/blue/null)
    getDeviceStatusColor(device, risk, summary) {
        const score = risk && Number.isFinite(risk.score) ? risk.score : null;
        const critHigh = summary ? (summary.criticalCves || 0) + (summary.highCves || 0) : 0;
        const isAgentOutdated = device.clientVersion && this.isVersionOutdated(device.clientVersion);
        const osText = (device.telemetry?.osEdition || device.os || '').toLowerCase();
        const isWin10 = osText.includes('windows 10');
        if (score !== null && score >= 70) return 'danger';
        if (critHigh > 5) return 'danger';
        if (score !== null && score >= 40) return 'warning';
        if (isAgentOutdated) return 'warning';
        if (isWin10) return 'blue';
        if (score !== null && score < 40) return 'success';
        return null;
    }

    // Returns alert badge descriptors: risk level, agent update, Win10 → Win11 upgrade
    getDeviceAlertBadges(device, risk, summary) {
        const badges = [];
        const score = risk && Number.isFinite(risk.score) ? risk.score : null;
        const isAgentOutdated = device.clientVersion && this.isVersionOutdated(device.clientVersion);
        const osText = (device.telemetry?.osEdition || device.os || '').toLowerCase();
        const isWin10 = osText.includes('windows 10');
        if (score !== null && score >= 70) badges.push({ color: 'danger', label: 'High Risk' });
        else if (score !== null && score >= 40) badges.push({ color: 'warning', label: 'Moderate Risk' });
        else if (score !== null && score < 40 && !isAgentOutdated && !isWin10) badges.push({ color: 'success', label: 'Healthy' });
        if (isAgentOutdated) badges.push({ color: 'warning', label: 'Agent Update' });
        if (isWin10) badges.push({ color: 'blue', label: 'Win10 → Win11' });
        return badges;
    }

    isDeviceInactive(device) {
        const state = device.state?.toLowerCase();

        // Non-active states are considered offline in the portal.
        if (state && state !== 'active') {
            return true;
        }

        // No heartbeat = offline
        if (!device.lastHeartbeat) {
            return true;
        }
        // Use calculated inactiveMinutes
        if (device.inactiveMinutes !== null && device.inactiveMinutes !== undefined) {
            // Active devices: Expected heartbeat every 5 minutes, flag as offline if >30 minutes
            if (state === 'active' && device.inactiveMinutes > 30) {
                return true;
            }
        }
        return false;
    }

    computeDeviceStats(devices) {
        const stats = {
            total: devices.length,
            active: 0,
            enabled: 0,
            blocked: 0,
            deleted: 0,
            online: 0,
            offline: 0
        };

        for (const d of devices) {
            const s = (d.state || '').toLowerCase();
            if (s === 'active') stats.active++;
            if (s === 'enabled') stats.enabled++;
            if (s === 'blocked') stats.blocked++;
            if (s === 'deleted') stats.deleted++;
            if (DeviceStatsService.isDeviceInactive(d)) stats.offline++; else stats.online++;
        }

        return stats;
    }

    setDeviceFilter(key, value) {
        this.setState(prev => ({
            deviceFilters: {
                ...prev.deviceFilters,
                [key]: value
            }
        }));
    }

    getFilteredDevices() {
        const { devices, searchQuery, deviceFilters } = this.state;
        const q = (searchQuery || '').trim().toLowerCase();

        const matchesSpec = (device) => {
            if (deviceFilters.spec === 'all') return true;
            const arch = (device.telemetry?.cpuArch || '').toLowerCase();
            if (deviceFilters.spec === 'arm64') return arch.includes('arm');
            if (deviceFilters.spec === 'x64') return arch.includes('x64') || arch.includes('amd64');
            return true;
        };

        const matchesLicense = (device) => {
            if (deviceFilters.license === 'all') return true;
            return (device.state || '').toLowerCase() === deviceFilters.license;
        };

        const matchesConnection = (device) => {
            if (deviceFilters.connection === 'all') return true;
            // Delegate to DeviceFilterService for consistent classification
            return DeviceFilterService.matchesConnection(device, deviceFilters.connection);
        };

        let list = devices
            .filter(d => matchesLicense(d) && matchesConnection(d) && matchesSpec(d))
            .filter(d => {
                if (!q) return true;
                const haystack = [
                    d.name,
                    d.id,
                    d.telemetry?.cpuName,
                    d.telemetry?.osEdition,
                    d.telemetry?.osVersion
                ].map(x => (x || '').toLowerCase());
                return haystack.some(h => h.includes(q));
            });

        // Apply sorting
        list.sort((a, b) => {
            let aVal, bVal;
            if (this.state.sortField === 'risk') {
                const aRisk = a.risk?.riskScore;
                const bRisk = b.risk?.riskScore;
                const aSummary = this.state.deviceSummaries[a.id] || { score: 0 };
                const bSummary = this.state.deviceSummaries[b.id] || { score: 0 };
                const aEnriched = this.state.enrichedScores[a.id];
                const bEnriched = this.state.enrichedScores[b.id];
                aVal = Number.isFinite(aRisk) ? aRisk : (aEnriched?.score !== undefined ? aEnriched.score : aSummary.score || 0);
                bVal = Number.isFinite(bRisk) ? bRisk : (bEnriched?.score !== undefined ? bEnriched.score : bSummary.score || 0);
            } else if (this.state.sortField === 'name') {
                aVal = (a.name || a.id || '').toLowerCase();
                bVal = (b.name || b.id || '').toLowerCase();
            }
            if (aVal < bVal) return this.state.sortAsc ? -1 : 1;
            if (aVal > bVal) return this.state.sortAsc ? 1 : -1;
            return 0;
        });

        return list;
    }

    formatNetworkSpeed(mbps) {
        const val = Number(mbps || 0);
        if (!val || isNaN(val)) return '';
        if (val >= 1000) {
            const gbps = Math.round((val / 1000) * 10) / 10; // 1 decimal
            return `@ ${gbps.toFixed(1)} Gbps`;
        }
        return `@ ${Math.round(val)} Mbps`;
    }

    formatAbsolute(dateValue) {
        if (!dateValue) return '—';
        const d = new Date(dateValue);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]}-${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
    }

    getStatusDot(lastSeen) {
        const mins = lastSeen ? (Date.now() - new Date(lastSeen)) / 60000 : 99999;
        if (mins < 60) return 'status-dot-animated status-green';
        if (mins < 1440) return 'status-azure';
        if (mins < 4320) return 'status-yellow';
        if (mins < 10080) return 'status-orange';
        return 'status-red';
    }

    getStatusText(lastSeen) {
        const mins = lastSeen ? Math.floor((Date.now() - new Date(lastSeen)) / 60000) : 99999;
        if (mins < 60) return 'Online';
        const hours = Math.floor(mins / 60);
        if (mins < 1440) return `${hours}h ago`;
        const days = Math.floor(mins / 1440);
        if (mins < 4320) return `Stale (${days}d)`;
        if (mins < 10080) return `Dormant (${days}d)`;
        if (mins < 99999) return `Ghosted (${days}d)`;
        return 'Never';
    }

    getDeviceInitials(deviceName) {
        if (!deviceName) return 'DV';
        const words = deviceName.split(/[-_\s]+/).filter(Boolean);
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return deviceName.substring(0, 2).toUpperCase();
    }

    severityLabelFromWeight(weight) {
        if (weight >= 3) return 'CRITICAL';
        if (weight >= 2) return 'HIGH';
        if (weight >= 1) return 'MEDIUM';
        if (weight > 0) return 'LOW';
        return 'LOW';
    }

    normalizeSummary(summary) {
        if (!summary) return null;
        const critical = summary.criticalCveCount ?? summary.critical ?? summary.criticalCves ?? 0;
        const high = summary.highCveCount ?? summary.high ?? summary.highCves ?? 0;
        const medium = summary.mediumCveCount ?? summary.medium ?? summary.mediumCves ?? 0;
        const low = summary.lowCveCount ?? summary.low ?? summary.lowCves ?? 0;
        const cveCount = summary.cveCount ?? (critical + high + medium + low);
        const vulnerableApps = summary.vulnerableAppCount ?? summary.appsWithCves ?? summary.appWithVulnCount ?? 0;
        const knownExploitCount = summary.knownExploitCount ?? summary.exploitedCveCount ?? summary.exploitCount ?? 0;
        const knownExploitIds = summary.knownExploitIds ?? summary.exploitedCveIds ?? [];
        const lastScanTime = summary.lastScanTime ?? summary.LastScanTime ?? null;
        const worstSeverity = (summary.highestRiskBucket || '').toUpperCase() ||
            (critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : medium > 0 ? 'MEDIUM' : low > 0 ? 'LOW' : 'LOW');
        const derivedWeight = this.severityWeight(worstSeverity);
        
        // Device summaries expose risk as 0-100 where higher = worse. Prefer the enriched
        // server score when present so the UI does not overstate device health.
        let baseScore = summary.enrichedRiskScore ?? summary.EnrichedRiskScore ?? summary.riskScore ?? summary.RiskScore;
        if (baseScore === undefined || baseScore === null) {
             baseScore = (critical * 35) + (high * 20) + (medium * 10) + (low * 4) + (vulnerableApps * 3);
        }

        const baseConstituents = summary.riskScoreConstituents || {};
        let cveIds = (summary.cveIds || summary.topCveIds || summary.recentCveIds || []).filter(Boolean);
        if ((!cveIds || cveIds.length === 0) && Array.isArray(summary.cves)) {
            cveIds = summary.cves
                .map(c => c?.cveId || c?.cveID)
                .filter(id => typeof id === 'string' && id.length > 0);
        }
        const maxCvssNormalized = summary.maxCvssNormalized ?? summary.maxCvss ?? summary.highestCvssNormalized ?? summary.highestCvss ?? baseConstituents.maxCvssNormalized ?? baseConstituents.maxCvss;
        
        // Fallback: If score is 0 but we have vulnerable apps/CVEs, calculate a heuristic score
        let finalScore = Math.min(100, Math.max(0, Math.round(baseScore ?? 0)));
        
        // Force a minimum score if there are vulnerabilities or high severity
        if (finalScore === 0) {
            if (vulnerableApps > 0 || cveCount > 0 || derivedWeight > 0) {
                const heuristicScore = (cveCount * 2) + (derivedWeight * 10) + (vulnerableApps * 5);
                finalScore = Math.min(100, Math.max(10, heuristicScore)); // Ensure at least 10 if vuln exists
            }
        }

        return {
            apps: summary.appCount ?? summary.apps ?? null,
            cves: cveCount ?? null,
            vulnerableApps,
            criticalCves: critical,
            highCves: high,
            mediumCves: medium,
            lowCves: low,
            worstSeverity,
            score: finalScore,
            lastScanTime,
            constituents: {
                ...baseConstituents,
                knownExploitCount,
                knownExploitIds,
                cveIds,
                maxCvssNormalized
            }
        };
    }

    getSecuritySignalMeta(device) {
        const summary = this.state.deviceSummaries[device.id];
        if (!summary) {
            return { available: false, stale: !!this.state.isRefreshingInBackground, lastScanTime: null, ageMinutes: null };
        }

        const lastScanTime = summary.lastScanTime || null;
        const scanTimestamp = lastScanTime ? new Date(lastScanTime).getTime() : NaN;
        const heartbeatTimestamp = device?.lastHeartbeat ? new Date(device.lastHeartbeat).getTime() : NaN;
        const ageMinutes = Number.isFinite(scanTimestamp)
            ? Math.max(0, Math.floor((Date.now() - scanTimestamp) / 60000))
            : null;
        const staleByAge = ageMinutes !== null && ageMinutes > 12 * 60;
        const staleVsHeartbeat = Number.isFinite(scanTimestamp)
            && Number.isFinite(heartbeatTimestamp)
            && (heartbeatTimestamp - scanTimestamp) > (90 * 60 * 1000);
        const hasSignal = [summary.apps, summary.cves, summary.vulnerableApps, summary.criticalCves, summary.highCves]
            .some(value => Number(value) > 0) || !!lastScanTime;

        return {
            available: hasSignal,
            stale: staleByAge || staleVsHeartbeat,
            lastScanTime,
            ageMinutes
        };
    }

    updateDeviceSummaryCache(deviceId, apps, cves) {
        // Filter out old uninstalled apps (older than 30 days)
        const activeApps = (apps || []).filter(app => {
            if (app.isInstalled === true) return true;
            if (app.lastSeen) {
                const daysSinceSeen = (Date.now() - new Date(app.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceSeen <= 30) return true;
            }
            return false;
        });

        // Filter out patched CVEs
        const activeCves = (cves || []).filter(c => c.isPatched !== true);

        let worstWeight = 0;
        let critical = 0, high = 0, medium = 0, low = 0;
        const appNamesWithCves = new Set();
        for (const c of activeCves) {
            const weight = this.severityWeight(c.severity);
            if (weight > worstWeight) worstWeight = weight;
            const sev = (c.severity || '').toUpperCase();
            if (sev === 'CRITICAL') critical++;
            else if (sev === 'HIGH') high++;
            else if (sev === 'MEDIUM') medium++;
            else if (sev === 'LOW') low++;
            if (c.appName) appNamesWithCves.add(this.normalizeAppName(c.appName));
        }

        const totalCves = activeCves.length;
        const appCount = activeApps.length;
        const vulnerableApps = activeApps.filter(a => a.appName && appNamesWithCves.has(this.normalizeAppName(a.appName))).length;
        const worstSev = this.severityLabelFromWeight(worstWeight);
        const score = Math.min(100, Math.max(0, totalCves * 2 + worstWeight * 10));

        this.setState(prev => ({
            deviceSummaries: {
                ...prev.deviceSummaries,
                [deviceId]: {
                    apps: appCount,
                    cves: totalCves,
                    vulnerableApps,
                    criticalCves: critical,
                    highCves: high,
                    mediumCves: medium,
                    lowCves: low,
                    worstSeverity: worstSev,
                    score
                }
            }
        }));
    }

    setInventoryTab(tab) {
        this.setState({ activeInventoryTab: tab });
    }

    toggleAppSort(key) {
        this.setState(prev => {
            const direction = prev.appSort.key === key && prev.appSort.direction === 'desc' ? 'asc' : 'desc';
            return { appSort: { key, direction } };
        });
    }

    toggleCveSort(key) {
        this.setState(prev => {
            const direction = prev.cveSort.key === key && prev.cveSort.direction === 'desc' ? 'asc' : 'desc';
            return { cveSort: { key, direction } };
        });
    }

    async queueDeviceAction(device, commandType) {
        const orgId = this.getCurrentOrgId();
        if (!orgId) return;
        try {
            const result = await api.queueCommand(orgId, commandType, [device.id]);
            if (result?.success) {
                this.showToast(`${commandType} queued for ${device.name || device.id}. Will execute on next device check-in.`, 'success');
            } else {
                this.showToast(result?.message || `Failed to queue ${commandType}`, 'danger');
            }
        } catch (err) {
            this.showToast(`Failed to queue command: ${err.message}`, 'danger');
        }
    }

    async queueOrgCommand(commandType) {
        const orgId = this.getCurrentOrgId();
        if (!orgId) { if (window.toast) window.toast.error('No organization selected'); return; }
        try {
            const result = await api.queueCommand(orgId, commandType, null);
            if (result?.success) {
                const count = result.data?.targetCount ?? 0;
                if (window.toast) window.toast.success(`${commandType} queued for ${count} device(s). Will execute on next check-in.`);
            } else {
                if (window.toast) window.toast.error(result?.message || `Failed to queue ${commandType}`);
            }
        } catch (err) {
            if (window.toast) window.toast.error(`Failed to queue command: ${err.message}`);
        }
    }

    openResponseActionsForDevice(device) {
        if (!device?.id) return;
        window.location.hash = `#!/response-actions?deviceIds=${encodeURIComponent(device.id)}`;
    }

    severityWeight(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 3;
        if (s === 'HIGH') return 2;
        if (s === 'MEDIUM') return 1;
        if (s === 'LOW') return 0.5;
        return 0;
    }

    cvssFromWorstSeverity(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 9.5;
        if (s === 'HIGH') return 8.0;
        if (s === 'MEDIUM') return 5.0;
        if (s === 'LOW') return 3.0;
        return null;
    }

    deriveCvss(constituents, summary) {
        const c = constituents || {};
        const s = summary || {};
        const candidates = [
            c.maxCvssNormalized,
            c.maxCvss,
            c.highestCvssNormalized,
            c.highestCvss,
            s.maxCvssNormalized,
            s.maxCvss,
            s.highestCvssNormalized,
            s.highestCvss,
            s.cvssMax,
            s.cvssHighest
        ].filter(v => Number.isFinite(v));

        let cvss = candidates.length > 0 ? candidates[0] : null;
        if (cvss !== null && cvss <= 1.5) {
            cvss = cvss * 10; // normalize 0-1 inputs to 0-10 scale
        }
        if (cvss !== null) {
            cvss = Math.max(0, Math.min(10, cvss));
        }
        if (cvss === null) {
            cvss = this.cvssFromWorstSeverity(s.worstSeverity);
        }
        return cvss;
    }

    deriveKnownExploitInfo(constituents) {
        const c = constituents || {};
        const explicitCount = Number(c.knownExploitCount);
        if (Number.isFinite(explicitCount) && explicitCount > 0) {
            return { count: explicitCount, has: true, ids: c.knownExploitIds || [] };
        }

        const explicitIds = Array.isArray(c.knownExploitIds) ? c.knownExploitIds : [];
        const cveIds = Array.isArray(c.cveIds) ? c.cveIds
            : Array.isArray(c.topCveIds) ? c.topCveIds
            : Array.isArray(c.cves) ? c.cves
            : Array.isArray(explicitIds) ? explicitIds
            : [];

        const knownExploits = this.state.knownExploits || new Set();
        if (knownExploits.size > 0 && cveIds.length > 0) {
            const matched = cveIds.filter(id => knownExploits.has(id));
            if (matched.length > 0) {
                return { count: matched.length, has: true, ids: matched };
            }
        }

        if (explicitIds.length > 0) {
            return { count: explicitIds.length, has: true, ids: explicitIds };
        }

        return { count: 0, has: false, ids: [] };
    }

    renderMatchBadge(matchType) {
        const normalize = (mt) => {
            if (typeof mt === 'number') return mt;
            const parsed = Number(mt);
            if (!Number.isNaN(parsed)) return parsed;
            const s = (mt || '').toString().toLowerCase();
            if (s === 'absolute' || s === 'exact') return 2;
            if (s === 'heuristic') return 1;
            return 0;
        };

        const value = normalize(matchType);
        if (value === 2) {
            return window.html`<span class="badge bg-danger-lt text-danger"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>Vulnerable</span>`;
        }
        if (value === 1) {
            return window.html`<span class="badge bg-warning-lt text-warning"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14l-2 10h-10z" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9.5 14h5" /></svg>AI Bot (med)</span>`;
        }
        return window.html`<span class="badge bg-success-lt text-success"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>Clean</span>`;
    }

    getStateBadgeClass(state) {
        switch (state?.toLowerCase()) {
            case 'active':
                return 'bg-success';
            case 'enabled':
                return 'bg-warning';
            case 'blocked':
                return 'bg-danger';
            case 'deleted':
                return 'bg-secondary';
            default:
                return 'bg-secondary';
        }
    }

    // Get connection status using exact health logic
    // Device connection status is now computed by shared component
    // Use: getConnectionStatus(device) imported from ../components/shared/StatusBadge.js
    // This method is kept for backward compatibility but delegates to shared function

    computeSecurityStats(devices) {
        const stats = {
            avgRisk: 0,
            criticalRiskCount: 0,
            highRiskCount: 0,
            vulnerableApps: 0,
            criticalCves: 0,
            online: 0,
            total: devices.length
        };

        let totalRisk = 0;
        let riskCount = 0;

        for (const d of devices) {
            const summary = this.state.deviceSummaries[d.id] || {};
            const enriched = this.state.enrichedScores[d.id];
            const score = enriched?.score !== undefined ? enriched.score : summary.score || 0;
            
            if (score > 0) {
                totalRisk += score;
                riskCount++;
            }
            
            // 100=best, 0=worst: low scores = high risk
            if (score < 40) stats.criticalRiskCount++;  // Poor/Very Poor
            else if (score < 60) stats.highRiskCount++; // Fair

            stats.vulnerableApps += (summary.vulnerableApps || 0);
            stats.criticalCves += (summary.criticalCves || 0);
            
            if (!DeviceStatsService.isDeviceInactive(d)) stats.online++;
        }

        stats.avgRisk = riskCount > 0 ? Math.round(totalRisk / riskCount) : 0;
        return stats;
    }

    renderBulkActionsBar() {
        const { html } = window;
        const { selectedDevices } = this.state;
        
        if (selectedDevices.length === 0) return null;
        
        return html`
            <div class="bulk-actions-bar">
                <div class="d-flex align-items-center">
                    <div class="me-auto">
                        <strong>${selectedDevices.length}</strong> device${selectedDevices.length > 1 ? 's' : ''} selected
                    </div>
                    <div class="btn-list">
                        <button class="btn btn-sm btn-primary" onclick=${() => this.scanSelected()} disabled=${orgContext.isReadOnly()} title=${orgContext.isReadOnly() ? 'Auditors cannot trigger scans' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                                <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                            </svg>
                            Scan All
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick=${() => this.exportSelected()}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                <polyline points="7 11 12 16 17 11" />
                                <line x1="12" y1="4" x2="12" y2="16" />
                            </svg>
                            Export
                        </button>
                        <button class="btn btn-sm btn-danger" onclick=${() => this.blockSelected()} disabled=${orgContext.isReadOnly()} title=${orgContext.isReadOnly() ? 'Auditors cannot block devices' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <circle cx="12" cy="12" r="9" />
                                <line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
                            </svg>
                            Block All
                        </button>
                        <button class="btn btn-sm btn-ghost-secondary" onclick=${() => this.clearSelection()}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ─── OS Distribution Helper ──────────────────────────────────────────────
    computeOsDistribution(devices) {
        const dist = { win11: 0, win10: 0, server: 0, other: 0 };
        for (const d of devices) {
            const os = (d.telemetry?.osEdition || d.os || '').toLowerCase();
            if (os.includes('windows 11')) dist.win11++;
            else if (os.includes('windows 10')) dist.win10++;
            else if (os.includes('server')) dist.server++;
            else dist.other++;
        }
        return dist;
    }

    // ─── Unified Dashboard KPIs ─────────────────────────────────────────────
    renderSecurityDashboard(stats) {
        const devices = this.state.filteredDevices?.length ? this.state.filteredDevices : (this.state.devices || []);
        return this.renderUnifiedKpis(stats, devices);
    }

    // ─── Unified KPI Strip (3 cards) ──────────────────────────────────────
    renderUnifiedKpis(stats, devices) {
        const { html } = window;

        // Visibility-based device counts (canonical model)
        let staleCount = 0, dormantCount = 0, ghostedCount = 0, errorCount = 0;
        for (const d of devices) {
            const connectivity = DeviceFilterService.getConnectivity(d);
            if (connectivity === 'stale') staleCount++;
            else if (connectivity === 'dormant') dormantCount++;
            else if (connectivity === 'ghosted') ghostedCount++;
            else if (connectivity === 'error') errorCount++;
        }
        const unreachable = staleCount + dormantCount + ghostedCount + errorCount;

        const signalMeta = devices.map(d => this.getSecuritySignalMeta(d));
        const verifiedSignalCount = signalMeta.filter(meta => meta.available && !meta.stale).length;
        const pendingSignalCount = signalMeta.filter(meta => !meta.available || meta.stale).length;

        const needActionCount = stats.criticalRiskCount + stats.highRiskCount;
        const hasVerifiedRiskSignal = verifiedSignalCount > 0;
        const healthScore = hasVerifiedRiskSignal ? Math.max(0, Math.min(100, 100 - (stats.avgRisk || 0))) : null;
        const healthGrade = healthScore === null ? '—' : healthScore >= 90 ? 'A' : healthScore >= 75 ? 'B' : healthScore >= 60 ? 'C' : healthScore >= 40 ? 'D' : 'F';
        const healthColor = healthScore === null ? 'secondary' : healthScore >= 75 ? 'success' : healthScore >= 50 ? 'warning' : 'danger';

        // Software totals for the fleet
        let totalApps = 0, totalVulnApps = 0;
        for (const d of devices) {
            const s = this.state.deviceSummaries[d.id];
            if (s) { totalApps += s.apps || 0; totalVulnApps += s.vulnerableApps || 0; }
        }

        return html`
        <div class="row row-cards mb-3">
            <!-- Card 1: Fleet Overview -->
            <div class="col-sm-6 col-lg-4">
                <div class="card card-sm h-100">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <span class="bg-blue text-white avatar rounded me-3">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 5m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/></svg>
                            </span>
                            <div>
                                <div class="d-flex align-items-baseline gap-2">
                                    <div class="h1 mb-0 fw-bold">${stats.total}</div>
                                    <span class="text-muted">devices</span>
                                </div>
                                <div class="d-flex gap-2 mt-1 flex-wrap">
                                    <span class="text-success d-flex align-items-center gap-1">
                                        <span class="status-dot status-dot-animated status-green"></span>
                                        ${stats.online} online
                                    </span>
                                    ${healthScore === null
                                        ? html`<span class="badge bg-secondary-lt text-secondary">Signal pending</span>`
                                        : html`<span class="badge bg-${healthColor}-lt text-${healthColor}">Grade ${healthGrade} · ${healthScore}%</span>`}
                                    ${totalApps > 0 ? html`<span class="text-muted small">${totalApps.toLocaleString()} apps</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Card 2: Active Threats -->
            <div class="col-sm-6 col-lg-4">
                <div class="card card-sm h-100${needActionCount > 0 ? ' border-danger' : ''}">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <span class="${needActionCount > 0 ? 'bg-danger' : 'bg-success'} text-white avatar rounded me-3">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.871l-8.106 -13.534a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/></svg>
                            </span>
                            <div>
                                <div class="d-flex align-items-baseline gap-2">
                                    <div class="h1 mb-0 fw-bold" title="Devices flagged Critical or High by the latest risk scoring run.">${needActionCount}</div>
                                    <span class="text-muted">device${needActionCount === 1 ? '' : 's'} need action</span>
                                </div>
                                <div class="mt-1">
                                    ${!hasVerifiedRiskSignal
                                        ? html`<span class="text-muted">Security signal pending</span>`
                                        : needActionCount > 0
                                            ? html`<span class="text-danger">${stats.criticalRiskCount} critical \u00b7 ${stats.highRiskCount} high risk</span>`
                                            : pendingSignalCount > 0
                                                ? html`<span class="text-muted">All verified devices healthy · ${pendingSignalCount} pending refresh</span>`
                                                : html`<span class="text-success">All verified devices healthy</span>`
                                    }
                                    ${this.state.summarySignalMessage
                                        ? html`<div class="text-warning small mt-1">${this.state.summarySignalMessage}</div>`
                                        : totalVulnApps > 0 ? html`<div class="text-warning small mt-1" title="Sum of vulnerable app instances across the fleet (one device + one app/version with an open CVE = one instance). Open the Apps page for distinct apps that need patching.">${totalVulnApps} vulnerable app instance${totalVulnApps === 1 ? '' : 's'} across fleet</div>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Card 3: Visibility -->
            <div class="col-sm-6 col-lg-4">
                <div class="card card-sm h-100">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <span class="${unreachable > 0 ? 'bg-warning' : 'bg-success'} text-white avatar rounded me-3">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 16.2a4.5 4.5 0 0 0 -2.7 -8.2a6 6 0 0 0 -11.7 2a4.5 4.5 0 0 0 -.3 9"/><path d="M3 3l18 18"/></svg>
                            </span>
                            <div>
                                <div class="d-flex align-items-baseline gap-2">
                                    <div class="h1 mb-0 fw-bold">${unreachable}</div>
                                    <span class="text-muted">unreachable</span>
                                </div>
                                <div class="mt-1">
                                    ${unreachable > 0
                                        ? html`<span class="d-flex gap-2 flex-wrap">
                                            ${staleCount > 0 ? html`<span class="text-warning">${staleCount} stale</span>` : ''}
                                            ${dormantCount > 0 ? html`<span class="text-orange">${dormantCount} dormant</span>` : ''}
                                            ${ghostedCount > 0 ? html`<span class="text-danger">${ghostedCount} ghosted</span>` : ''}
                                            ${errorCount > 0 ? html`<span class="text-danger">${errorCount} error</span>` : ''}
                                        </span>`
                                        : html`<span class="text-success">Entire fleet reporting</span>`
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    render() {
        const { html } = window;
        const { loading, devices, error, manifestError } = this.state;

        const filteredDevices = (this.state.filteredDevices && this.state.filteredDevices.length > 0) ? this.state.filteredDevices : DeviceFilterService.getFilteredDevices(this.state.devices, this.state.searchQuery, this.state.deviceFilters, this.state.sortField, this.state.sortAsc, this.state.enrichedScores);
        const stats = DeviceStatsService.computeDeviceStats(filteredDevices);
        const allStats = DeviceStatsService.computeDeviceStats(devices || []);
        const securityStats = DeviceStatsService.computeSecurityStats(filteredDevices, this.state.enrichedScores, this.state.deviceSummaries);

        return html`
            ${manifestError ? html`<div class="alert alert-warning mt-2">${manifestError}</div>` : null}
            
            <!-- Page Header -->
<div class="row align-items-center mb-0 mt-2 border-bottom pb-2">
    <div class="col">
        <h2 class="page-title mb-0 d-flex align-items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 5m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/></svg>
            Devices
        </h2>
    </div>
    <div class="col-auto ms-auto d-print-none d-flex align-items-center gap-2">
        ${window.FreshnessBadge ? html`<${window.FreshnessBadge} freshness=${this.state.freshness} refreshing=${this.state.isRefreshingInBackground} />` : (this.state.isRefreshingInBackground ? html`
            <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1" style="animation: pulse 1s infinite;">
                <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px; border-width: 2px;"></span>
                Refreshing...
            </span>
        ` : '')}
                <div class="d-flex gap-2">
                    ${!orgContext.isReadOnly() ? html`
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick=${() => this.queueOrgCommand('TriggerScan')} title="Trigger scan on all devices">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></svg>
                            Scan All
                        </button>
                        ${(() => {
                            const outdatedCount = (this.state.devices || []).filter(d => d.clientVersion && this.isVersionOutdated(d.clientVersion)).length;
                            const hasOutdated = outdatedCount > 0;
                            return html`<button type="button" class="btn btn-sm ${hasOutdated ? 'btn-warning update-glow' : 'btn-outline-secondary'} d-inline-flex align-items-center gap-1" onclick=${() => this.queueOrgCommand('CheckUpdates')} title=${hasOutdated ? `${outdatedCount} device${outdatedCount === 1 ? '' : 's'} running outdated agent — push update now` : 'Check for updates on all devices'}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                Check Updates
                                ${hasOutdated ? html`<span class="badge bg-white text-warning ms-1" style="font-size:10px;">${outdatedCount}</span>` : ''}
                            </button>`;
                        })()}
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick=${() => this.queueOrgCommand('RefreshInventory')} title="Refresh software inventory on all devices">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12a9 9 0 1 0 9 -9a9.75 9.75 0 0 0 -6.74 2.74" /><path d="M3 4v4h4" /></svg>
                            Refresh Inventory
                        </button>
                        <div class="vr mx-1"></div>
                    ` : ''}
                    <button 
                        class="btn btn-sm btn-outline-primary ${this.state.refreshingManifest ? 'disabled' : ''}" 
                        onclick=${() => this.reloadPageData()}
                        disabled=${this.state.refreshingManifest}>
                        ${this.state.refreshingManifest ? 
                            window.html`<span class="spinner-border spinner-border-sm me-2"></span>Reloading...` : 
                            window.html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg> Reload`
                        }
                    </button>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="16" /></svg>
                            Download Agent
                        </button>
                        <div class="dropdown-menu dropdown-menu-end">
                            <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); this.openDownloadModal('x64'); }}>
                                Windows x64 Installer
                                <span class="badge bg-blue-lt text-blue ms-auto">v${this.state.installers.X64.VERSION}</span>
                            </a>
                            <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); this.openDownloadModal('arm64'); }}>
                                Windows ARM64 Installer
                                <span class="badge bg-blue-lt text-blue ms-auto">v${this.state.installers.ARM64.VERSION}</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            </div>

            <!-- Security Dashboard -->
            ${this.renderSecurityDashboard(securityStats)}

            <!-- Devices List -->
                            <div class="d-flex gap-2 mb-3 align-items-center">
                                <div class="input-icon flex-grow-1">
                                    <span class="input-icon-addon">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                    </span>
                                    <input class="form-control" type="text" placeholder="Search by device, CPU, OS…" value=${this.state.searchQuery} onInput=${(e) => this.setSearchQuery(e.target.value)} />
                                </div>
                                <button class="btn btn-outline-secondary d-flex align-items-center gap-1" type="button" data-bs-toggle="offcanvas" data-bs-target="#deviceFiltersDrawer" aria-controls="deviceFiltersDrawer">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z"/></svg>
                                    Filters
                                    ${(this.state.deviceFilters.connection !== 'all' || this.state.deviceFilters.spec !== 'all' || this.state.deviceFilters.license !== 'all')
                                        ? html`<span class="badge bg-primary ms-1">${[this.state.deviceFilters.connection !== 'all', this.state.deviceFilters.spec !== 'all', this.state.deviceFilters.license !== 'all'].filter(Boolean).length}</span>`
                                        : ''}
                                </button>
                            </div>

                            <!-- Offcanvas Filter Drawer -->
                            <div class="offcanvas offcanvas-end" tabindex="-1" id="deviceFiltersDrawer" aria-labelledby="deviceFiltersDrawerLabel">
                                <div class="offcanvas-header">
                                    <h5 class="offcanvas-title" id="deviceFiltersDrawerLabel">Filter Devices</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                                </div>
                                <div class="offcanvas-body">
                                    <div class="mb-4">
                                        <label class="form-label">Connectivity</label>
                                        <select class="form-select" aria-label="Device connectivity filter" value=${this.state.deviceFilters.connection} onChange=${(e) => this.setDeviceFilter('connection', e.target.value)}>
                                            <option value="all" selected=${this.state.deviceFilters.connection === 'all'}>All</option>
                                            <option value="recent" selected=${this.state.deviceFilters.connection === 'recent'}>Recent (${'<'}24h)</option>
                                            <option value="recent-online" selected=${this.state.deviceFilters.connection === 'recent-online'}>Online (${'<'}1h)</option>
                                            <option value="recent-offline" selected=${this.state.deviceFilters.connection === 'recent-offline'}>Away (1-24h)</option>
                                            <option value="stale" selected=${this.state.deviceFilters.connection === 'stale'}>Stale (1-3d)</option>
                                            <option value="dormant" selected=${this.state.deviceFilters.connection === 'dormant'}>Dormant (3-7d)</option>
                                            <option value="ghosted" selected=${this.state.deviceFilters.connection === 'ghosted'}>Ghosted (${ '>' }7d)</option>
                                            <option value="error" selected=${this.state.deviceFilters.connection === 'error'}>Error</option>
                                        </select>
                                    </div>
                                    <div class="mb-4">
                                        <label class="form-label">Architecture</label>
                                        <select class="form-select" aria-label="Device architecture filter" value=${this.state.deviceFilters.spec} onChange=${(e) => this.setDeviceFilter('spec', e.target.value)}>
                                            <option value="all" selected=${this.state.deviceFilters.spec === 'all'}>Any Architecture</option>
                                            <option value="x64" selected=${this.state.deviceFilters.spec === 'x64'}>x64</option>
                                            <option value="arm64" selected=${this.state.deviceFilters.spec === 'arm64'}>ARM64</option>
                                        </select>
                                    </div>
                                    <div class="mb-4">
                                        <label class="form-label">Device State</label>
                                        <div class="d-grid gap-2">
                                            <span class="badge w-100 py-2 ${this.state.deviceFilters.license === 'active' ? 'bg-green text-white' : 'bg-green-lt text-green'}" style="cursor:pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'active' ? 'all' : 'active')}>
                                                Active (${allStats.active})
                                            </span>
                                            <span class="badge w-100 py-2 ${this.state.deviceFilters.license === 'enabled' ? 'bg-blue text-white' : 'bg-blue-lt text-blue'}" style="cursor:pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'enabled' ? 'all' : 'enabled')}>
                                                Enabled (${allStats.enabled})
                                            </span>
                                            <span class="badge w-100 py-2 ${this.state.deviceFilters.license === 'blocked' ? 'bg-red text-white' : 'bg-red-lt text-danger'}" style="cursor:pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'blocked' ? 'all' : 'blocked')}>
                                                Blocked (${allStats.blocked})
                                            </span>
                                            <span class="badge w-100 py-2 ${this.state.deviceFilters.license === 'deleted' ? 'bg-secondary text-white' : 'bg-secondary-lt text-secondary'}" style="cursor:pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'deleted' ? 'all' : 'deleted')}>
                                                Deleted (${allStats.deleted})
                                            </span>
                                        </div>
                                    </div>
                                    <button class="btn btn-ghost-secondary w-100" onclick=${() => { this.setDeviceFilter('connection','all'); this.setDeviceFilter('spec','all'); this.setDeviceFilter('license','all'); }}>
                                        Clear All Filters
                                    </button>
                                </div>
                            </div>

                            ${loading ? html`
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="text-center py-5">
                                                <div class="spinner-border text-primary" role="status"></div>
                                                <div class="mt-3 text-muted">Loading devices...</div>
                                            </div>
                                        </div>
                                    </div>
                            ` : error ? html`
                                <div class="card">
                                    <div class="empty">
                                        <div class="empty-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                        </div>
                                        <p class="empty-title">Error loading devices</p>
                                        <p class="empty-subtitle text-muted">${error}</p>
                                        <div class="empty-action">
                                            <button onclick=${() => this.loadDevices()} class="btn btn-primary">
                                                Try Again
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : filteredDevices.length === 0 ? html`
                                <div class="card">
                                    <div class="empty">
                                        <div class="empty-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                        </div>
                                        <p class="empty-title">No devices found</p>
                                        <p class="empty-subtitle text-muted">
                                            Get started by adding your first device to begin monitoring
                                        </p>
                                        <div class="empty-action">
                                            <button class="btn btn-primary">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                                Add Device
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : html`
                                ${renderBulkActionsBar(this)}
                                <div class="card">
                                    <div class="table-responsive">
                                        <table class="table table-vcenter card-table">
                                            <thead>
                                                <tr>
                                                    <th class="w-1">
                                                        <input 
                                                            type="checkbox" 
                                                            class="form-check-input m-0" 
                                                            checked=${filteredDevices.length > 0 && filteredDevices.every(d => this.state.selectedDevices.includes(d.id))}
                                                            onchange=${() => this.toggleSelectAll()}
                                                        />
                                                    </th>
                                                    <th style="cursor: pointer;" onclick=${() => this.setSortField('name')}>
                                                        <div class="d-flex align-items-center gap-1">
                                                            Device
                                                            ${this.state.sortField === 'name' ? html`
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                    ${this.state.sortAsc ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 15 12 9 18 15" />` : html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 9 12 15 18 9" />`}
                                                                </svg>
                                                            ` : ''}
                                                        </div>
                                                    </th>
                                                    <th style="width: 100px; cursor: pointer;" onclick=${() => this.setSortField('risk')} title="Click to sort by risk score (higher = more vulnerable)">
                                                        <div class="d-flex align-items-center justify-content-center gap-1">
                                                            Score
                                                            ${this.state.sortField === 'risk' ? html`
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                    ${this.state.sortAsc ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 15 12 9 18 15" />` : html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 9 12 15 18 9" />`}
                                                                </svg>
                                                            ` : ''}
                                                        </div>
                                                    </th>
                                                    <th>Threats</th>
                                                    <th>Software</th>
                                                    <th>Last Seen</th>
                                                    <th class="w-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${filteredDevices.map(device => html`
                                                    <tr key=${device.id}>
                                                        <td>
                                                            <input 
                                                                type="checkbox" 
                                                                class="form-check-input m-0" 
                                                                checked=${this.state.selectedDevices.includes(device.id)}
                                                                onchange=${() => this.toggleSelectDevice(device.id)}
                                                            />
                                                        </td>
                                                        ${(() => {
                                                            const summary = this.state.deviceSummaries[device.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0, lastScanTime: null };
                                                            const signalMeta = this.getSecuritySignalMeta(device);
                                                            const deviceWithSummary = this.buildDeviceWithSummary(device);
                                                            const health = renderHealthStatus(device);
                                                            const risk = renderRiskIndicator(deviceWithSummary);
                                                            const displayScore = Number.isFinite(risk.score) ? risk.score : 0;
                                                            const scoreValue = Math.max(0, Math.min(100, 100 - Math.round(displayScore)));
                                                            const scoreColor = scoreValue >= 75 ? 'success' : scoreValue >= 50 ? 'warning' : 'danger';
                                                            const isOutdated = device.clientVersion && this.isVersionOutdated(device.clientVersion);
                                                            const osEdition = device.telemetry?.osEdition || '';
                                                            const osVersion = device.telemetry?.osVersion || '';
                                                            const osLabel = osVersion ? `${osEdition} ${osVersion}`.trim() : (osEdition || 'Unknown OS');
                                                            const critHigh = (summary.criticalCves || 0) + (summary.highCves || 0);
                                                            const showSignalPending = (!signalMeta.available || signalMeta.stale)
                                                                && critHigh === 0
                                                                && (summary.vulnerableApps || 0) === 0;
                                                            return html`
                                                            <!-- Device Column -->
                                                            <td>
                                                                <div class="d-flex align-items-center">
                                                                    <span class="avatar avatar-sm me-3 bg-blue-lt flex-shrink-0">
                                                                        ${this.getDeviceInitials(device.name || device.id)}
                                                                    </span>
                                                                    <div class="min-width-0">
                                                                        <a href="#!/devices/${device.id}" class="text-reset fw-medium d-block text-truncate" style="max-width:220px;" title="${device.name || device.id}">${device.name || device.id}</a>
                                                                        <div class="text-muted small d-flex align-items-center gap-1">
                                                                            <span class="${getStatusDotClass(health.status)} me-1"></span>
                                                                            ${health.text} · ${osLabel}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <!-- Score Column -->
                                                            <td class="text-center" style="min-width: 80px;">
                                                                ${risk.score !== null && !showSignalPending ? html`
                                                                    <a href="#" onclick=${(e) => { e.preventDefault(); this.openRiskExplanationModal(device); }} style="text-decoration: none; cursor: pointer;">
                                                                        <div class="h2 mb-0 fw-bold text-${scoreColor}">${scoreValue}</div>
                                                                        <div class="progress progress-sm mt-1" style="height: 3px;">
                                                                            <div class="progress-bar bg-${scoreColor}" style="width: ${Math.min(scoreValue, 100)}%"></div>
                                                                        </div>
                                                                    </a>
                                                                ` : html`<span class="text-muted small">—</span>`}
                                                            </td>

                                                            <!-- Threats Column -->
                                                            <td>
                                                                ${showSignalPending ? html`
                                                                    <div class="d-flex flex-column gap-1">
                                                                        <span class="badge bg-secondary-lt text-secondary">Signal pending</span>
                                                                        <span class="text-muted small">
                                                                            ${signalMeta.lastScanTime
                                                                                ? `Last verified ${formatRelativeTime(signalMeta.lastScanTime)}`
                                                                                : (this.state.isRefreshingInBackground ? 'Verifying current exposure…' : 'Awaiting live security summary')}
                                                                        </span>
                                                                    </div>
                                                                ` : critHigh > 0 ? html`
                                                                    <div class="d-flex flex-column gap-1">
                                                                        <div class="d-flex align-items-center gap-1">
                                                                            ${summary.criticalCves > 0 ? html`<span class="badge bg-danger text-white">${summary.criticalCves} Critical</span>` : ''}
                                                                            ${summary.highCves > 0 ? html`<span class="badge bg-warning text-white">${summary.highCves} High</span>` : ''}
                                                                        </div>
                                                                        ${summary.vulnerableApps > 0 ? html`<span class="text-muted small">${summary.vulnerableApps} vuln apps</span>` : ''}
                                                                    </div>
                                                                ` : summary.vulnerableApps > 0 ? html`
                                                                    <span class="badge bg-warning-lt text-warning">${summary.vulnerableApps} vuln apps</span>
                                                                ` : html`<span class="text-success small">✓ Clean</span>`}
                                                            </td>

                                                            <!-- Software Column -->
                                                            <td>
                                                                <div class="fw-medium">${summary.apps || 0} apps</div>
                                                                ${(summary.vulnerableApps || 0) > 0 ? html`
                                                                    <span class="text-danger small">${summary.vulnerableApps} vulnerable</span>
                                                                ` : html`
                                                                    <span class="text-success small">Clean</span>
                                                                `}
                                                                ${isOutdated ? html`
                                                                    <span class="badge bg-warning-lt text-warning small ms-1" title="Agent update available">Outdated</span>
                                                                ` : ''}
                                                            </td>

                                                            <!-- Last Seen Column -->
                                                            <td>
                                                                <span class="text-muted small">${device.lastHeartbeat ? formatRelativeTime(device.lastHeartbeat) : 'Never'}</span>
                                                            </td>
                                                            `;
                                                        })()}
                                                        <td>
                                                            ${(() => {
                                                                const stateRaw = (device.state || '').toLowerCase();
                                                                const agentBlock = this.getAgentCommandBlockReason(device.state);
                                                                const agentDisabled = !!agentBlock;
                                                                const isOutdated = device.clientVersion && this.isVersionOutdated(device.clientVersion);
                                                                const canEnable = this.canEnableDevice(device.state);
                                                                const canBlock = this.canBlockDevice(device.state);
                                                                const isDeleted = stateRaw === 'deleted';
                                                                const isBusinessOrg = !orgContext.isIndividualUser();

                                                                // Helper: render a dropdown item that is either active or disabled with a tooltip.
                                                                const item = ({ disabled, onClick, title, className = '', icon, label, badge }) => {
                                                                    const cls = `dropdown-item${disabled ? ' disabled' : ''} ${className}`.trim();
                                                                    return html`
                                                                        <button type="button"
                                                                                class=${cls}
                                                                                disabled=${disabled || undefined}
                                                                                aria-disabled=${disabled ? 'true' : undefined}
                                                                                title=${title || ''}
                                                                                onclick=${disabled ? undefined : onClick}>
                                                                            ${icon}
                                                                            ${label}
                                                                            ${badge || ''}
                                                                        </button>`;
                                                                };

                                                                return html`
                                                                <div class="dropdown">
                                                                    <button class="btn btn-sm btn-secondary dropdown-toggle position-relative" type="button" data-bs-toggle="dropdown">
                                                                        Actions
                                                                        ${isOutdated && !agentDisabled ? html`
                                                                            <span class="badge bg-danger badge-notification badge-blink" style="position: absolute; top: -4px; right: -4px;"></span>
                                                                        ` : ''}
                                                                    </button>
                                                                    <div class="dropdown-menu dropdown-menu-end" style="min-width: 240px;">
                                                                        <!-- Investigate -->
                                                                        <div class="dropdown-header">Investigate</div>
                                                                        ${item({
                                                                            disabled: false,
                                                                            onClick: () => { window.location.hash = `#!/devices/${device.id}`; },
                                                                            icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="2" /><path d="M22 12a10 10 0 1 0 -20 0a10 10 0 0 0 20 0" /></svg>`,
                                                                            label: 'View Device'
                                                                        })}

                                                                        ${isBusinessOrg ? html`
                                                                            <div class="dropdown-divider"></div>
                                                                            <div class="dropdown-header">Operate ${agentDisabled ? html`<span class="text-muted small">(unavailable)</span>` : ''}</div>
                                                                            ${item({
                                                                                disabled: agentDisabled,
                                                                                onClick: () => this.queueDeviceAction(device, 'TriggerScan'),
                                                                                title: agentBlock || 'Run an on-demand security scan on this device',
                                                                                icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></svg>`,
                                                                                label: 'Trigger Scan'
                                                                            })}
                                                                            ${item({
                                                                                disabled: agentDisabled,
                                                                                onClick: () => this.queueDeviceAction(device, 'CheckUpdates'),
                                                                                title: agentBlock || 'Ask the agent to check for updates',
                                                                                className: !agentDisabled && isOutdated ? 'bg-warning-lt' : '',
                                                                                icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>`,
                                                                                label: 'Trigger Update',
                                                                                badge: !agentDisabled && isOutdated ? html`<span class="badge bg-danger ms-2">Update</span>` : ''
                                                                            })}
                                                                            ${item({
                                                                                disabled: agentDisabled,
                                                                                onClick: () => this.queueDeviceAction(device, 'CollectLogs'),
                                                                                title: agentBlock || 'Pull diagnostic logs from this device',
                                                                                icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></svg>`,
                                                                                label: 'Collect Logs'
                                                                            })}
                                                                        ` : ''}

                                                                        <div class="dropdown-divider"></div>
                                                                        <div class="dropdown-header">Lifecycle</div>
                                                                        ${item({
                                                                            disabled: !canEnable,
                                                                            onClick: () => this.enableDevice(device.id),
                                                                            title: canEnable ? 'Re-enable this device so the agent resumes telemetry' : 'Device is already active',
                                                                            className: canEnable ? 'text-success' : '',
                                                                            icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>`,
                                                                            label: 'Enable Device'
                                                                        })}
                                                                        ${item({
                                                                            disabled: !canBlock,
                                                                            onClick: () => this.blockDevice(device.id, false),
                                                                            title: canBlock ? 'Block device, keep telemetry data for analysis' : (stateRaw === 'blocked' ? 'Device is already blocked' : 'Device cannot be blocked from this state'),
                                                                            className: canBlock ? 'text-warning' : '',
                                                                            icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>`,
                                                                            label: 'Block (Retain Data)'
                                                                        })}
                                                                        ${item({
                                                                            disabled: !canBlock,
                                                                            onClick: () => this.blockDevice(device.id, true),
                                                                            title: canBlock ? 'Block device and permanently delete all telemetry data' : (stateRaw === 'blocked' ? 'Device is already blocked' : 'Device cannot be blocked from this state'),
                                                                            className: canBlock ? 'text-orange' : '',
                                                                            icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="9" y1="12" x2="15" y2="12" /></svg>`,
                                                                            label: 'Block (Purge Data)'
                                                                        })}
                                                                        ${item({
                                                                            disabled: isDeleted,
                                                                            onClick: () => this.deleteDevice(device.id),
                                                                            title: isDeleted ? 'Device is already deleted' : 'Delete device and purge all associated data',
                                                                            className: isDeleted ? '' : 'text-danger',
                                                                            icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>`,
                                                                            label: 'Delete Device'
                                                                        })}
                                                                    </div>
                                                                </div>`;
                                                            })()}
                                                        </td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `}

                <!-- Command Monitor -->
                <${CommandMonitor} orgId=${orgContext.getCurrentOrg()?.orgId} />

                <!-- Download Warning Modal -->
                ${this.state.showDownloadModal && this.state.downloadTarget ? window.html`
                    <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content" style="z-index: 1056;">
                                <div class="modal-header">
                                    <h5 class="modal-title">Download ${this.state.downloadTarget.name}</h5>
                                    <button type="button" class="btn-close" onclick=${(e) => { e.preventDefault(); this.closeDownloadModal(); }}></button>
                                </div>
                                <div class="modal-body">
                                    <div class="alert alert-warning mb-3">
                                        <div class="d-flex">
                                            <div>
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                    <path d="M12 9v2m0 4v.01" />
                                                    <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 class="alert-title">Security Notice</h4>
                                                <div class="text-muted">${this.state.downloadTarget.warning}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <strong>File:</strong> ${this.state.downloadTarget.name}<br/>
                                        <strong>Size:</strong> ${this.state.downloadTarget.size} MB<br/>
                                        <strong>Architecture:</strong> ${this.state.downloadTarget.arch}
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-link link-secondary" onclick=${(e) => { e.preventDefault(); this.closeDownloadModal(); }}>
                                        Cancel
                                    </button>
                                    <button type="button" class="btn btn-primary" onclick=${(e) => { e.preventDefault(); this.confirmDownload(); }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                            <polyline points="7 11 12 16 17 11" />
                                            <line x1="12" y1="4" x2="12" y2="16" />
                                        </svg>
                                        Continue Download
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
                ` : ''}

                ${this.renderRiskExplanationModal()}
        `;
    }
}

export default DevicesPage;




