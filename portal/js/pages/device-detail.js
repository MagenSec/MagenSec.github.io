/**
 * Device Detail Page - Full device dashboard with perf, inventory, risks, and timeline
 * Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { config } from '../config.js';
import { PiiDecryption } from '../utils/piiDecryption.js';

export class DeviceDetailPage extends window.Component {
    constructor(props) {
        super(props);
        const rawDeviceId = props.params?.deviceId || (window.location.hash.match(/\/devices\/([^/?]+)/) || [])[1];
        const deviceId = rawDeviceId ? decodeURIComponent(rawDeviceId) : null;
        
        this.state = {
            deviceId,
            loading: true,
            device: null,
            error: null,
            telemetryDetail: null,
            appInventory: [],
            cveInventory: [],
            telemetryHistory: [],
            activeTab: 'specs', // specs | inventory | risks | timeline | perf
            searchQuery: '',
            cveFilterSeverity: null, // filter CVEs by severity
            perfData: null, // Perf chart data if available
            timeline: [] // Event timeline
        };
    }

    componentDidMount() {
        this.loadDeviceData();
    }

    normalizeState(state) {
        if (!state) return 'UNKNOWN';
        return String(state).toUpperCase();
    }

    getStateBadgeClass(state) {
        const s = this.normalizeState(state);
        switch (s) {
            case 'ACTIVE':
                return 'bg-success';
            case 'ENABLED':
                return 'bg-primary';
            case 'BLOCKED':
                return 'bg-danger';
            case 'DELETED':
                return 'bg-secondary';
            default:
                return 'bg-secondary';
        }
    }

    async loadDeviceData() {
        try {
            this.setState({ loading: true, error: null });
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                throw new Error('No organization selected');
            }

            if (!this.state.deviceId) {
                throw new Error('Invalid device id');
            }

            // Get device details
            const deviceResp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}`);
            if (!deviceResp.success) {
                throw new Error(deviceResp.message || 'Failed to load device');
            }

            // Decrypt PII fields from device
            const decryptedDevice = {
                ...deviceResp.data,
                DeviceName: PiiDecryption.decryptIfEncrypted(deviceResp.data.DeviceName || deviceResp.data.deviceName || ''),
                deviceName: PiiDecryption.decryptIfEncrypted(deviceResp.data.DeviceName || deviceResp.data.deviceName || '')
            };

            // Get telemetry history and diffs
            const telemetryResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/telemetry?historyLimit=100&lastDays=365`
            );
            const telemetryData = telemetryResp.success ? telemetryResp.data : null;

            // Get app inventory and decrypt fields
            const appsResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/apps?limit=1000`
            );
            const appList = appsResp.success 
                ? (appsResp.data?.apps || appsResp.data || []).map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || ''),
                    version: x.applicationVersion || x.ApplicationVersion,
                    matchType: x.matchType || x.MatchType,
                    isInstalled: x.isInstalled ?? x.IsInstalled,
                    lastSeen: x.lastSeen || x.LastSeen,
                    firstSeen: x.firstSeen || x.FirstSeen
                }))
                : [];

            // Get CVEs and decrypt fields
            const cvesResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/cves?limit=1000`
            );
            const cveList = cvesResp.success
                ? (cvesResp.data?.cves || cvesResp.data || []).map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || ''),
                    cveId: x.cveId || x.CveId,
                    severity: x.severity || x.Severity,
                    epss: x.epss || x.EPSS,
                    score: x.score || x.Score,
                    lastSeen: x.lastSeen || x.LastSeen
                }))
                : [];

            // Build timeline from telemetry changes
            const timeline = this.buildTimeline(telemetryData);

            this.setState({
                device: decryptedDevice,
                telemetryDetail: telemetryData,
                appInventory: appList,
                cveInventory: cveList,
                telemetryHistory: telemetryData?.history || [],
                timeline,
                loading: false
            });
        } catch (error) {
            console.error('[DeviceDetail] Error loading device:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    buildTimeline(telemetryData) {
        if (!telemetryData || !telemetryData.history) return [];
        
        const timeline = [];
        const changes = telemetryData.changes || [];
        
        // Add change events
        changes.forEach(change => {
            timeline.push({
                type: 'change',
                timestamp: new Date(change.at),
                title: 'Hardware/System Change Detected',
                description: Object.keys(change.delta).join(', '),
                severity: 'info',
                fields: change.delta
            });
        });

        // Add telemetry snapshots as events
        (telemetryData.history || []).slice(0, 20).forEach((snapshot, idx) => {
            if (idx === 0) {
                timeline.push({
                    type: 'telemetry',
                    timestamp: new Date(snapshot.timestamp),
                    title: 'Current Snapshot',
                    description: `OS: ${snapshot.fields.OSEdition || ''} | CPU: ${snapshot.fields.CPUName || ''} | RAM: ${snapshot.fields.TotalRAMMB ? Math.round(snapshot.fields.TotalRAMMB / 1024) + ' GB' : ''}`,
                    severity: 'success',
                    snapshot
                });
            }
        });

        // Sort by timestamp descending (most recent first)
        timeline.sort((a, b) => b.timestamp - a.timestamp);
        return timeline;
    }

    computeAppStatus(apps) {
        return apps.map(app => {
            let status = 'current';
            if (app.matchType === 'absolute' || app.matchType === 'Absolute') {
                // Check if appears uninstalled based on lastSeen
                if (app.lastSeen) {
                    const daysSinceLastSeen = (Date.now() - new Date(app.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceLastSeen > 30 && !app.isInstalled) {
                        status = 'uninstalled';
                    }
                }
            }
            // Check if version suggests update available (heuristic)
            if (app.matchType === 'heuristic' || app.matchType === 'Heuristic') {
                status = 'updated'; // Was updated/re-detected
            }
            return { ...app, status };
        });
    }

    filterApps(apps, q) {
        if (!q || q.trim() === '') return apps;
        const lq = q.toLowerCase();
        return apps.filter(a => 
            (a.appName && a.appName.toLowerCase().includes(lq)) ||
            (a.vendor && a.vendor.toLowerCase().includes(lq)) ||
            (a.version && a.version.toLowerCase().includes(lq))
        );
    }

    getCvesByApp(appName) {
        return this.state.cveInventory.filter(c => c.appName === appName);
    }

    getSeverityColor(severity) {
        switch (severity?.toUpperCase?.()) {
            case 'CRITICAL': return 'bg-danger-lt';
            case 'HIGH': return 'bg-warning-lt';
            case 'MEDIUM': return 'bg-secondary-lt';
            case 'LOW': return 'bg-info-lt';
            default: return 'bg-muted';
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString();
    }

    render() {
        const { html } = window;
        const { loading, device, error, activeTab, searchQuery, cveFilterSeverity } = this.state;

        if (loading) {
            return html`
                <div class="page-wrapper">
                    <div class="page-body">
                        <div class="container-xl">
                            <div class="text-center py-5">
                                <div class="spinner-border spinner-border-lg" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                                <p class="text-muted mt-3">Loading device details...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="page-wrapper">
                    <div class="page-body">
                        <div class="container-xl">
                            <div class="alert alert-danger mt-3">
                                <strong>Error:</strong> ${error}
                            </div>
                            <a href="#!/devices" class="btn btn-secondary">Back to Devices</a>
                        </div>
                    </div>
                </div>
            `;
        }

        if (!device) {
            return html`
                <div class="page-wrapper">
                    <div class="page-body">
                        <div class="container-xl">
                            <div class="alert alert-warning mt-3">
                                Device not found
                            </div>
                            <a href="#!/devices" class="btn btn-secondary">Back to Devices</a>
                        </div>
                    </div>
                </div>
            `;
        }

        const enrichedApps = this.computeAppStatus(this.state.appInventory);
        const filteredApps = this.filterApps(enrichedApps, searchQuery);
        const criticalCves = this.state.cveInventory.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical');
        const highCves = this.state.cveInventory.filter(c => c.severity === 'HIGH' || c.severity === 'High');

        return html`
            <div class="page-wrapper">
                <div class="page-body">
                    <div class="container-xl">
                        <!-- Header -->
                        <div class="page-header d-print-none">
                            <div class="row align-items-center">
                                <div class="col">
                                    <a href="#!/devices" class="btn btn-ghost-primary me-3">← Back</a>
                                    <h2 class="page-title d-inline-block">${device.DeviceName || device.deviceName || device.DeviceId || device.deviceId}</h2>
                                    <span class="badge ${this.getStateBadgeClass(device.State || device.state)} ms-2">${this.normalizeState(device.State || device.state)}</span>
                                </div>
                                <div class="col-auto">
                                    ${device.LastHeartbeat ? html`
                                        <div class="text-muted small">
                                            Last heartbeat: ${this.formatDate(device.LastHeartbeat)}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Metrics Row -->
                        <div class="row row-cards mb-3">
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small font-weight-medium">Security Status</div>
                                        <div class="mt-2">
                                            ${criticalCves.length > 0 ? html`
                                                <span class="badge bg-danger-lt me-2">${criticalCves.length} Critical CVEs</span>
                                            ` : ''}
                                            ${highCves.length > 0 ? html`
                                                <span class="badge bg-warning-lt">${highCves.length} High CVEs</span>
                                            ` : html`
                                                <span class="badge bg-success-lt">No Critical Issues</span>
                                            `}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small font-weight-medium">Applications</div>
                                        <div class="mt-2">
                                            <span class="h4">${enrichedApps.length}</span>
                                            <div class="text-muted small">${enrichedApps.filter(a => a.status === 'updated').length} updated</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small font-weight-medium">Vulnerabilities</div>
                                        <div class="mt-2">
                                            <span class="h4">${this.state.cveInventory.length}</span>
                                            <div class="text-muted small">Total CVEs</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small font-weight-medium">First Seen</div>
                                        <div class="mt-2">
                                            <div class="text-muted small">${device.FirstHeartbeat ? this.formatDate(device.FirstHeartbeat) : 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Tabs -->
                        <div class="card">
                            <div class="card-header border-bottom-0">
                                <ul class="nav nav-tabs card-header-tabs" role="tablist">
                                    <li class="nav-item">
                                        <a class="nav-link ${activeTab === 'specs' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'specs' }); }} role="tab">
                                            Specs
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link ${activeTab === 'inventory' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'inventory' }); }} role="tab">
                                            Applications (${enrichedApps.length})
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link ${activeTab === 'risks' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'risks' }); }} role="tab">
                                            Risks & CVEs (${this.state.cveInventory.length})
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link ${activeTab === 'timeline' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'timeline' }); }} role="tab">
                                            Timeline (${this.state.timeline.length})
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div class="card-body">
                                <!-- Specs Tab -->
                                ${activeTab === 'specs' ? this.renderSpecsTab() : ''}
                                
                                <!-- Inventory Tab -->
                                ${activeTab === 'inventory' ? this.renderInventoryTab(enrichedApps, filteredApps) : ''}
                                
                                <!-- Risks Tab -->
                                ${activeTab === 'risks' ? this.renderRisksTab() : ''}
                                
                                <!-- Timeline Tab -->
                                ${activeTab === 'timeline' ? this.renderTimelineTab() : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSpecsTab() {
        const { html } = window;
        const { device, telemetryDetail } = this.state;
        const t = device?.Telemetry || {};

        return html`
            <div class="row">
                <div class="col-md-6">
                    <h6>Hardware</h6>
                    <dl class="row text-sm">
                        <dt class="col-sm-4">CPU</dt>
                        <dd class="col-sm-8">${t.CPUName || ''} (${t.CPUCores || '?'} cores)</dd>
                        
                        <dt class="col-sm-4">RAM</dt>
                        <dd class="col-sm-8">${t.TotalRamMb ? Math.round(t.TotalRamMb / 1024) + ' GB' : 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Disk</dt>
                        <dd class="col-sm-8">${t.TotalDiskGb || 'N/A'} GB (${t.SystemDiskMediaType || 'N/A'}) ${t.SystemDiskBusType || ''}</dd>
                        
                        <dt class="col-sm-4">Network</dt>
                        <dd class="col-sm-8">${t.ConnectionType || 'N/A'} ${t.NetworkSpeedMbps ? '@ ' + t.NetworkSpeedMbps + ' Mbps' : ''}</dd>
                        
                        <dt class="col-sm-4">GPU</dt>
                        <dd class="col-sm-8">${t.GPUName || 'N/A'} ${t.GpuRamMB ? '(' + t.GpuRamMB + ' MB)' : ''}</dd>
                    </dl>
                </div>
                <div class="col-md-6">
                    <h6>Operating System</h6>
                    <dl class="row text-sm">
                        <dt class="col-sm-4">Edition</dt>
                        <dd class="col-sm-8">${t.OSEdition || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Version</dt>
                        <dd class="col-sm-8">${t.OSVersion || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Build</dt>
                        <dd class="col-sm-8">${t.OSBuild || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Architecture</dt>
                        <dd class="col-sm-8">${t.CPUArch || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Last Updated</dt>
                        <dd class="col-sm-8">${t.Timestamp ? this.formatDate(t.Timestamp) : 'N/A'}</dd>
                    </dl>
                </div>
            </div>
            ${telemetryDetail && telemetryDetail.changes && telemetryDetail.changes.length > 0 ? html`
                <div class="mt-4">
                    <h6>Recent Hardware Changes</h6>
                    <div class="timeline timeline-simple">
                        ${telemetryDetail.changes.slice(0, 10).map(change => html`
                            <div class="timeline-event">
                                <div class="timeline-event-icon bg-yellow-lt">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                                </div>
                                <div class="timeline-event-content">
                                    <div class="text-muted small">${this.formatDate(change.at)}</div>
                                    <div class="text-sm"><strong>${Object.keys(change.delta).length} fields changed</strong></div>
                                    <div class="mt-2">
                                        ${Object.keys(change.delta).map(k => html`
                                            <span class="badge bg-secondary-lt me-2">${k}</span>
                                        `)}
                                    </div>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            ` : ''}
        `;
    }

    renderInventoryTab(enrichedApps, filteredApps) {
        const { html } = window;
        
        return html`
            <div class="mb-3">
                <div class="input-group">
                    <span class="input-group-text">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                    </span>
                    <input class="form-control" type="text" placeholder="Search applications..." value=${this.state.searchQuery} onInput=${(e) => this.setState({ searchQuery: e.target.value })} />
                </div>
            </div>
            <div class="row row-cards mb-3">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">Total Applications</div>
                            <div class="h3">${enrichedApps.length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">Updated</div>
                            <div class="h3 text-warning">${enrichedApps.filter(a => a.status === 'updated').length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">Uninstalled</div>
                            <div class="h3 text-danger">${enrichedApps.filter(a => a.status === 'uninstalled').length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">With CVEs</div>
                            <div class="h3 text-info">${enrichedApps.filter(a => this.getCvesByApp(a.appName).length > 0).length}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Application</th>
                            <th>Vendor</th>
                            <th>Version</th>
                            <th>Status</th>
                            <th>Match Type</th>
                            <th>CVEs</th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredApps.map(app => {
                            const cves = this.getCvesByApp(app.appName);
                            return html`
                                <tr>
                                    <td class="font-weight-medium">${app.appName}</td>
                                    <td>${app.vendor || '—'}</td>
                                    <td><code class="text-sm">${app.version || '—'}</code></td>
                                    <td>
                                        ${app.status === 'updated' ? html`<span class="badge bg-warning-lt">Updated</span>` : 
                                          app.status === 'uninstalled' ? html`<span class="badge bg-danger-lt">Uninstalled</span>` : 
                                          html`<span class="badge bg-success-lt">Current</span>`}
                                    </td>
                                    <td>
                                        ${app.matchType === 'absolute' ? html`<span class="badge bg-primary-lt">Exact</span>` :
                                          app.matchType === 'heuristic' ? html`<span class="badge bg-cyan-lt">Heuristic</span>` :
                                          html`<span class="badge bg-muted">None</span>`}
                                    </td>
                                    <td>
                                        ${cves.length > 0 ? html`
                                            <span class="badge ${cves.some(c => c.severity === 'CRITICAL' || c.severity === 'Critical') ? 'bg-danger-lt' : cves.some(c => c.severity === 'HIGH' || c.severity === 'High') ? 'bg-warning-lt' : 'bg-secondary-lt'}">
                                                ${cves.length} CVEs
                                            </span>
                                        ` : html`<span class="text-muted">—</span>`}
                                    </td>
                                    <td class="text-muted small">${app.lastSeen ? new Date(app.lastSeen).toLocaleDateString() : '—'}</td>
                                </tr>
                            `;
                        })}
                    </tbody>
                </table>
                ${filteredApps.length === 0 && this.state.searchQuery ? html`
                    <div class="text-center text-muted py-5">
                        No applications match your search
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderRisksTab() {
        const { html } = window;
        
        const criticalCves = this.state.cveInventory.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical');
        const highCves = this.state.cveInventory.filter(c => c.severity === 'HIGH' || c.severity === 'High');
        const mediumCves = this.state.cveInventory.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium');
        const lowCves = this.state.cveInventory.filter(c => c.severity === 'LOW' || c.severity === 'Low');

        return html`
            <div class="row row-cards mb-3">
                <div class="col-md-3">
                    <div class="card border-danger-lt">
                        <div class="card-body text-center">
                            <div class="text-muted small">Critical</div>
                            <div class="h3 text-danger">${criticalCves.length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-warning-lt">
                        <div class="card-body text-center">
                            <div class="text-muted small">High</div>
                            <div class="h3 text-warning">${highCves.length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-secondary-lt">
                        <div class="card-body text-center">
                            <div class="text-muted small">Medium</div>
                            <div class="h3 text-secondary">${mediumCves.length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card border-info-lt">
                        <div class="card-body text-center">
                            <div class="text-muted small">Low</div>
                            <div class="h3 text-info">${lowCves.length}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>CVE ID</th>
                            <th>Affected Application</th>
                            <th>Vendor</th>
                            <th>Severity</th>
                            <th>EPSS Score</th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.state.cveInventory.map(cve => html`
                            <tr>
                                <td>
                                    <a href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" rel="noopener" class="font-monospace text-primary">
                                        ${cve.cveId}
                                    </a>
                                </td>
                                <td class="font-weight-medium">${cve.appName}</td>
                                <td>${cve.vendor || '—'}</td>
                                <td>
                                    <span class="badge ${this.getSeverityColor(cve.severity)} text-white">
                                        ${(cve.severity || 'Unknown').toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    ${cve.epss ? html`
                                        <span class="font-weight-medium">${Number(cve.epss).toFixed(2)}</span>
                                    ` : html`
                                        <span class="text-muted">—</span>
                                    `}
                                </td>
                                <td class="text-muted small">${cve.lastSeen ? new Date(cve.lastSeen).toLocaleDateString() : '—'}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
                ${this.state.cveInventory.length === 0 ? html`
                    <div class="text-center text-muted py-5">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg mb-2 opacity-50" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                        <p>No known vulnerabilities detected</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderTimelineTab() {
        const { html } = window;
        
        return html`
            <div class="timeline timeline-simple">
                ${this.state.timeline.length > 0 ? this.state.timeline.map(event => html`
                    <div class="timeline-event">
                        <div class="timeline-event-icon ${event.severity === 'success' ? 'bg-success-lt' : event.severity === 'warning' ? 'bg-warning-lt' : event.severity === 'danger' ? 'bg-danger-lt' : 'bg-blue-lt'}">
                            ${event.type === 'change' ? html`
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3" /><line x1="12" y1="12" x2="20" y2="7.5" /><line x1="12" y1="12" x2="12" y2="21" /><line x1="12" y1="12" x2="4" y2="7.5" /></svg>
                            ` : html`
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                            `}
                        </div>
                        <div class="timeline-event-content">
                            <div class="text-muted small">${this.formatDate(event.timestamp)}</div>
                            <div class="text-sm font-weight-medium">${event.title}</div>
                            <div class="text-muted small mt-1">${event.description}</div>
                            ${event.fields ? html`
                                <div class="mt-2">
                                    ${Object.entries(event.fields).map(([k, v]) => html`
                                        <div class="text-sm"><strong>${k}:</strong> ${v}</div>
                                    `)}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `) : html`
                    <div class="text-center text-muted py-5">
                        No timeline events yet
                    </div>
                `}
            </div>
        `;
    }
}
