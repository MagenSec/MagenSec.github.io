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
            appViewMode: 'vendor', // 'vendor' | 'flat'
            expandedVendors: new Set(),
            expandedApps: new Set(),
            searchQuery: '',
            cveFilterSeverity: null, // filter CVEs by severity
            cveFilterApp: null, // cross-link filter from Inventory tab
            perfData: null, // Perf chart data if available
            timeline: [], // Event timeline
            knownExploits: null,
            exploitsLoadingError: null,
            enrichedScore: null,
            deviceSummary: null,
            appSortKey: 'appName', // appName | severity | cveCount
            appSortDir: 'asc'
        };
        this.KNOWN_EXPLOITS_CACHE = { data: null, loadedAt: null, TTL_HOURS: 24 };
    }

    componentDidMount() {
        this.loadDeviceData();
    }

    // Load known exploits from reliable sources (with caching)
    async loadKnownExploitsAsync() {
        // Check cache freshness
        if (this.KNOWN_EXPLOITS_CACHE.data && this.KNOWN_EXPLOITS_CACHE.loadedAt) {
            const ageHours = (Date.now() - this.KNOWN_EXPLOITS_CACHE.loadedAt) / (1000 * 60 * 60);
            if (ageHours < this.KNOWN_EXPLOITS_CACHE.TTL_HOURS) {
                this.setState({ knownExploits: this.KNOWN_EXPLOITS_CACHE.data });
                return;
            }
        }
        
        // Try to load from MagenSec's hourly-updated repository
        const url = 'https://raw.githubusercontent.com/MagenSec/MagenSec.github.io/main/diag/known_exploited_vulnerabilities.json';
        
        try {
            const response = await fetch(url, { cache: 'reload', timeout: 5000 });
            
            if (!response.ok) {
                console.debug(`[DeviceDetail] Known exploits source returned ${response.status}`);
                throw new Error('Failed to load');
            }
            
            const data = await response.json();
            let cveIds = new Set();
            
            // Expected format: { vulnerabilities: [{ cveID, ... }, ...] }
            if (data.vulnerabilities && Array.isArray(data.vulnerabilities)) {
                cveIds = new Set(data.vulnerabilities
                    .map(v => v.cveID || v.cveId)
                    .filter(id => id && typeof id === 'string'));
            } else if (Array.isArray(data)) {
                cveIds = new Set(data
                    .map(v => typeof v === 'string' ? v : (v.cveID || v.cveId))
                    .filter(id => id && typeof id === 'string'));
            }
            
            if (cveIds.size > 0) {
                console.log(`[DeviceDetail] Loaded ${cveIds.size} known exploits`);
                this.KNOWN_EXPLOITS_CACHE.data = cveIds;
                this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
                this.setState({ knownExploits: cveIds, exploitsLoadingError: null });
            } else {
                throw new Error('No CVEs parsed');
            }
        } catch (error) {
            console.warn('[DeviceDetail] Could not load known exploits:', error.message);
            // Graceful fallback: use empty set
            this.KNOWN_EXPLOITS_CACHE.data = new Set();
            this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
            this.setState({ knownExploits: new Set(), exploitsLoadingError: 'Using baseline risk scores (known exploits unavailable)' });
        }
    }
    
    // Recalculate risk score using Hybrid Model with constituents from API
    recalculateRiskScore(summary) {
        if (!summary || summary.score === undefined) {
            return { score: 0, constituents: null, enrichmentFactors: {} };
        }
        
        const constituents = summary.constituents || summary.riskScoreConstituents;
        if (!constituents || constituents.cveCount === 0) {
            return { score: summary.score, constituents, enrichmentFactors: {} };
        }
        
        // Base calculation: CVSS × EPSS
        let riskFactor = constituents.maxCvssNormalized * constituents.maxEpssStored;
        
        // Check if any CVE is a known exploit
        const hasKnownExploit = this.state.knownExploits && this.state.cveInventory.some(cve => 
            this.state.knownExploits.has(cve.cveId)
        );
        const exploitFactor = hasKnownExploit ? 1.5 : 1.0;
        
        // Time decay: EPSS degrades over time
        const epssDate = new Date(constituents.epssDate);
        const daysSinceEpss = (Date.now() - epssDate) / (1000 * 60 * 60 * 24);
        const timeDecayFactor = Math.max(0.1, 1.0 - (daysSinceEpss / 365));
        
        // Final score with all factors
        const finalRisk = (
            riskFactor *
            constituents.exposureFactor *
            constituents.privilegeFactor *
            exploitFactor *
            timeDecayFactor
        ) * 100;
        
        const enrichedScore = Math.round(finalRisk * 100) / 100;
        
        return {
            score: enrichedScore,
            constituents,
            enrichmentFactors: {
                hasKnownExploit,
                timeDecayFactor: Math.round(timeDecayFactor * 10000) / 10000,
                daysSinceEpss: Math.round(daysSinceEpss)
            }
        };
    }

    normalizeState(state) {
        if (!state) return 'UNKNOWN';
        return String(state).toUpperCase();
    }

    calculateRiskScore(device) {
        if (!device || !device.Summary) return 0;
        const summary = typeof device.Summary === 'string' ? JSON.parse(device.Summary) : device.Summary;
        const criticalCves = summary.criticalCveCount || 0;
        const highCves = summary.highCveCount || 0;
        const mediumCves = summary.mediumCveCount || 0;
        const lowCves = summary.lowCveCount || 0;
        const score = Math.min(100, criticalCves * 20 + highCves * 10 + mediumCves * 5 + lowCves * 2);
        return score;
    }

    getStateBadgeClass(state) {
        const s = this.normalizeState(state);
        switch (s) {
            case 'ACTIVE':
                return 'bg-success';
            case 'ENABLED':
            case 'INACTIVE':
                return 'bg-primary';
            case 'BLOCKED':
                return 'bg-danger';
            case 'DELETED':
                return 'bg-secondary';
            default:
                return 'bg-secondary';
        }
    }

    getStateDisplay(state) {
        const s = this.normalizeState(state);
        if (s === 'INACTIVE') return 'ENABLED';
        return s;
    }

    // Compare device client version against latest installer manifest
    isVersionOutdated(deviceVersion) {
        if (!deviceVersion) return false;
        const latestVersion = (this.state.installers?.ENGINE?.VERSION) || config.INSTALLERS.ENGINE.VERSION;
        const parse = (v) => {
            const parts = String(v).split('.').map(Number);
            return { major: parts[0]||0, minor: parts[1]||0, build: parts[2]||0 };
        };
        const a = parse(deviceVersion);
        const b = parse(latestVersion);
        if (a.major < b.major) return true;
        if (a.major === b.major && a.minor < b.minor) return true;
        if (a.major === b.major && a.minor === b.minor && a.build < b.build) return true;
        return false;
    }

    severityWeight(sev) {
        const s = String(sev||'').toUpperCase();
        if (s === 'CRITICAL') return 3;
        if (s === 'HIGH') return 2;
        if (s === 'MEDIUM') return 1;
        if (s === 'LOW') return 0.5;
        return 0;
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

            // Get device details with summary
            const deviceResp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}?include=summary`);
            if (!deviceResp.success) {
                throw new Error(deviceResp.message || 'Failed to load device');
            }

            // Decrypt PII fields from device
            const decryptedDevice = {
                ...deviceResp.data,
                DeviceName: PiiDecryption.decryptIfEncrypted(deviceResp.data.DeviceName || deviceResp.data.deviceName || ''),
                deviceName: PiiDecryption.decryptIfEncrypted(deviceResp.data.DeviceName || deviceResp.data.deviceName || ''),
                // Ensure FirstHeartbeat is available for Registered date display
                FirstHeartbeat: deviceResp.data.FirstHeartbeat || deviceResp.data.firstHeartbeat || deviceResp.data.RegisteredAt || deviceResp.data.registeredAt
            };

            // Get telemetry history and diffs
            const telemetryResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/telemetry?historyLimit=100&lastDays=365`
            );
            const telemetryData = telemetryResp.success ? telemetryResp.data : null;

            // If device name is missing (or equals deviceId), infer from telemetry hostname
            const inferredHostname = telemetryData?.latest?.fields?.Hostname
                || telemetryData?.latest?.fields?.hostname
                || telemetryData?.latest?.fields?.MachineName
                || telemetryData?.latest?.fields?.machineName
                || telemetryData?.latest?.fields?.ComputerName
                || telemetryData?.latest?.fields?.computerName
                || null;

            if (inferredHostname) {
                const inferred = PiiDecryption.decryptIfEncrypted(String(inferredHostname));
                const currentName = decryptedDevice.DeviceName || decryptedDevice.deviceName;
                const trimmed = (currentName || '').trim();
                if (!trimmed || trimmed === this.state.deviceId) {
                    decryptedDevice.DeviceName = inferred;
                    decryptedDevice.deviceName = inferred;
                }
            }

            // Get app inventory and decrypt fields
            const appsResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/apps?limit=1000`
            );
            const appPayload = appsResp.success 
                ? (appsResp.data?.items || appsResp.data?.apps || appsResp.data?.list || appsResp.data || [])
                : [];
            const appList = appPayload.map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || ''),
                    version: x.applicationVersion || x.ApplicationVersion,
                    matchType: x.matchType || x.MatchType,
                    isInstalled: x.isInstalled ?? x.IsInstalled,
                    lastSeen: x.lastSeen || x.LastSeen,
                    firstSeen: x.firstSeen || x.FirstSeen
                }));

            // Get CVEs and decrypt fields
            const cvesResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/cves?limit=1000`
            );
            const cvePayload = cvesResp.success 
                ? (cvesResp.data?.items || cvesResp.data?.cves || cvesResp.data?.list || cvesResp.data || [])
                : [];
            const cveList = cvePayload.map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || ''),
                    cveId: x.cveId || x.CveId,
                    severity: x.severity || x.Severity,
                    epss: x.epss || x.EPSS,
                    score: x.score || x.Score,
                    lastSeen: x.lastSeen || x.LastSeen
                }));

            // Build timeline from telemetry changes
            const timeline = this.buildTimeline(telemetryData);

            // Extract device summary for risk scoring
            const summary = decryptedDevice.summary || decryptedDevice.Summary;
            let deviceSummary = null;
            if (summary) {
                const summaryData = typeof summary === 'string' ? JSON.parse(summary) : summary;
                deviceSummary = {
                    apps: summaryData.appCount ?? null,
                    cves: summaryData.cveCount ?? null,
                    score: summaryData.riskScore ?? 0,
                    constituents: summaryData.riskScoreConstituents || null
                };
            }

            this.setState({
                device: decryptedDevice,
                telemetryDetail: telemetryData,
                appInventory: appList,
                cveInventory: cveList,
                telemetryHistory: telemetryData?.history || [],
                timeline,
                deviceSummary,
                loading: false
            });
            
            // Background: Load known exploits and enrich risk score
            this.loadKnownExploitsAsync().then(() => {
                if (deviceSummary) {
                    const enriched = this.recalculateRiskScore(deviceSummary);
                    this.setState({ enrichedScore: enriched });
                }
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

    // Filter out uninstalled and patched vulnerabilities from risk calculations
    getActiveAppsAndCves() {
        // Keep only installed apps or apps still showing in current telemetry
        const activeApps = this.state.appInventory.filter(app => {
            // Keep if installed
            if (app.isInstalled === true) return true;
            // Keep if lastSeen is recent (within 30 days)
            if (app.lastSeen) {
                const daysSinceSeen = (Date.now() - new Date(app.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceSeen <= 30) return true;
            }
            return false;
        });

        // Keep only unpatched CVEs
        const activeCves = this.state.cveInventory.filter(cve => {
            // Exclude if marked as patched
            if (cve.isPatched === true) return false;
            // Keep all others
            return true;
        });

        return { activeApps, activeCves };
    }

    // Collapse apps with same name/vendor into latest entry with older versions as timeline
    collapseAppsByNameVendor(apps) {
        const grouped = {};
        
        apps.forEach(app => {
            const key = `${(app.appName || '').toLowerCase()}|${(app.vendor || '').toLowerCase()}`;
            if (!grouped[key]) {
                grouped[key] = { latest: app, older: [] };
            } else {
                // Determine which is latest based on lastSeen
                const currentLastSeen = new Date(grouped[key].latest.lastSeen || 0).getTime();
                const newLastSeen = new Date(app.lastSeen || 0).getTime();
                
                if (newLastSeen > currentLastSeen) {
                    grouped[key].older.push(grouped[key].latest);
                    grouped[key].latest = app;
                } else {
                    grouped[key].older.push(app);
                }
            }
        });

        return Object.values(grouped);
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
    }

    toggleVendor(vendorName) {
        const expanded = new Set(this.state.expandedVendors);
        if (expanded.has(vendorName)) {
            expanded.delete(vendorName);
        } else {
            expanded.add(vendorName);
        }
        this.setState({ expandedVendors: expanded });
    }

    toggleAppVersions(appKey) {
        const expanded = new Set(this.state.expandedApps);
        if (expanded.has(appKey)) {
            expanded.delete(appKey);
        } else {
            expanded.add(appKey);
        }
        this.setState({ expandedApps: expanded });
    }

    groupAppsByVendor(apps) {
        const vendors = {};
        for (const app of apps) {
            const vendor = app.vendor || 'Unknown Vendor';
            if (!vendors[vendor]) vendors[vendor] = [];
            vendors[vendor].push(app);
        }
        return vendors;
    }

    groupAppVersions(apps) {
        // Group by appName, return array of groups with versions sorted by date
        const groups = {};
        for (const app of apps) {
            const key = app.appName.toLowerCase();
            if (!groups[key]) groups[key] = { appName: app.appName, vendor: app.vendor, versions: [] };
            groups[key].versions.push(app);
        }
        // Sort versions by firstSeen descending (newest first)
        Object.values(groups).forEach(group => {
            group.versions.sort((a, b) => new Date(b.firstSeen || 0) - new Date(a.firstSeen || 0));
        });
        return Object.values(groups);
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
        let filteredApps = this.filterApps(enrichedApps, searchQuery);
        // Apply sorting for Applications tab
        filteredApps = filteredApps.slice().sort((a,b) => {
            if (this.state.appSortKey === 'appName') {
                const r = String(a.appName||'').localeCompare(String(b.appName||''));
                return this.state.appSortDir === 'asc' ? r : -r;
            }
            if (this.state.appSortKey === 'severity') {
                const aw = Math.max(...this.getCvesByApp(a.appName).map(c => this.severityWeight(c.severity)), 0);
                const bw = Math.max(...this.getCvesByApp(b.appName).map(c => this.severityWeight(c.severity)), 0);
                const r = aw - bw;
                return this.state.appSortDir === 'asc' ? r : -r;
            }
            if (this.state.appSortKey === 'cveCount') {
                const ac = this.getCvesByApp(a.appName).length;
                const bc = this.getCvesByApp(b.appName).length;
                const r = ac - bc;
                return this.state.appSortDir === 'asc' ? r : -r;
            }
            return 0;
        });
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
                                    <span class="badge ${this.getStateBadgeClass(device.State || device.state)} ms-2" title="License state; Active/Enabled denotes license status. Online/offline shown separately.">${this.getStateDisplay(device.State || device.state)}</span>
                                    ${(() => {
                                        const dv = device.ClientVersion || device.clientVersion;
                                        return dv && this.isVersionOutdated(dv) ? window.html`<span class="badge bg-warning-lt ms-2" title="Update available to v${config.INSTALLERS.ENGINE.VERSION}">Update Available</span>` : '';
                                    })()}
                                </div>
                                <div class="col-auto">
                                    <div class="btn-list mb-2">
                                        <button class="btn btn-primary" disabled title="Coming soon - Device action queue">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M7 14l-3 3l-1 -1" /><path d="M9 13l2 2l4 -4" /></svg>
                                            Update Client
                                        </button>
                                        <button class="btn btn-outline-primary" disabled title="Coming soon - App management">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/><line x1="12" y1="12" x2="20" y2="7.5"/><line x1="12" y1="12" x2="12" y2="21"/><line x1="12" y1="12" x2="4" y2="7.5"/></svg>
                                            Uninstall App
                                        </button>
                                    </div>
                                    ${device.LastHeartbeat ? html`
                                        <div class="text-muted small">
                                            Last heartbeat: ${this.formatDate(device.LastHeartbeat)}
                                        </div>
                                        ${(() => {
                                            const last = device.LastHeartbeat;
                                            if (!last) return '';
                                            const mins = Math.floor((Date.now() - new Date(last).getTime())/60000);
                                            const online = mins <= 30 && String(device.State||'').toUpperCase()==='ACTIVE';
                                            return html`<span class="badge ${online?'bg-success-lt':'bg-danger-lt'} mt-1">${online?'Online':'Offline'}</span>`;
                                        })()}
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Metrics Row -->
                        <div class="row row-cards mb-3">
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body d-flex align-items-center gap-3">
                                        <!-- Risk Gauge -->
                                        <div style="flex-shrink: 0;">
                                            ${(() => {
                                                const enriched = this.state.enrichedScore;
                                                const summary = this.state.deviceSummary;
                                                const score = enriched ? enriched.score : summary ? summary.score : this.calculateRiskScore(device);
                                                const isEnriched = enriched && enriched.score !== (summary ? summary.score : this.calculateRiskScore(device));
                                                
                                                const worstSeverity = criticalCves.length > 0 ? 'CRITICAL' : highCves.length > 0 ? 'HIGH' : this.state.cveInventory.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length > 0 ? 'MEDIUM' : this.state.cveInventory.length > 0 ? 'LOW' : 'CLEAN';
                                                const gaugeColor = worstSeverity === 'CRITICAL' ? '#d63939' : worstSeverity === 'HIGH' ? '#f59f00' : worstSeverity === 'MEDIUM' ? '#fab005' : '#2fb344';
                                                const angle = (score / 100) * 270;
                                                const radian = (angle - 135) * (Math.PI / 180);
                                                const cx = 25, cy = 25, r = 20;
                                                const x = cx + r * Math.cos(radian);
                                                const y = cy + r * Math.sin(radian);
                                                
                                                // Build tooltip text with constituents
                                                let tooltipText = `Risk Score: ${score}`;
                                                if (enriched && enriched.constituents) {
                                                    const c = enriched.constituents;
                                                    const e = enriched.enrichmentFactors;
                                                    tooltipText = `Risk Score: ${score} (Enriched)\n` +
                                                        `Baseline: ${summary ? summary.score : 0}\n` +
                                                        `Max CVSS: ${(c.maxCvssNormalized * 10).toFixed(1)}\n` +
                                                        `Max EPSS: ${(c.maxEpssStored * 100).toFixed(1)}%\n` +
                                                        `CVE Count: ${c.cveCount}\n` +
                                                        `Time Decay: ${(e.timeDecayFactor * 100).toFixed(1)}% (${e.daysSinceEpss} days)\n` +
                                                        `Exploit Factor: ${e.hasKnownExploit ? '1.5\u00d7 (Known Exploit!)' : '1.0\u00d7'}`;
                                                }
                                                
                                                return html`
                                                    <div title="${tooltipText}" style="cursor: help; position: relative;">
                                                        <svg width="50" height="50" viewBox="0 0 50 50">
                                                            <circle cx="25" cy="25" r="20" fill="none" stroke="#e6e7e9" stroke-width="3"/>
                                                            <path d="M 25 25 L 45 25 A 20 20 0 ${angle > 180 ? 1 : 0} 1 ${x} ${y}" fill="none" stroke="${gaugeColor}" stroke-width="3" stroke-linecap="round"/>
                                                            <text x="25" y="28" text-anchor="middle" font-size="10" fill="#666">${Math.round(score)}</text>
                                                        </svg>
                                                        ${isEnriched ? html`
                                                            <span style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; background: #2fb344; border-radius: 50%; border: 2px solid white; font-size: 8px; color: white; display: flex; align-items: center; justify-content: center;">✓</span>
                                                        ` : ''}
                                                    </div>
                                                `;
                                            })()}
                                        </div>
                                        <!-- Stacked Charts -->
                                        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                                            <!-- App Vulnerability Pie -->
                                            <div class="d-flex align-items-center gap-2">
                                                ${(() => {
                                                    const totalApps = enrichedApps.length || 0;
                                                    const vulnerableApps = this.state.appInventory.filter(app => this.state.cveInventory.some(cve => cve.appName && app.appName && cve.appName.toLowerCase() === app.appName.toLowerCase())).length;
                                                    const cleanApps = totalApps - vulnerableApps;
                                                    const vulnAngle = totalApps > 0 ? (vulnerableApps / totalApps) * 360 : 0;
                                                    const vulnRad = (vulnAngle - 90) * (Math.PI / 180);
                                                    const vx = 20 + 16 * Math.cos(vulnRad);
                                                    const vy = 20 + 16 * Math.sin(vulnRad);
                                                    return html`
                                                        <svg width="40" height="40" viewBox="0 0 40 40">
                                                            <circle cx="20" cy="20" r="16" fill="${vulnerableApps > 0 ? '#d63939' : '#2fb344'}"/>
                                                            ${cleanApps > 0 ? html`
                                                                <path d="M 20 20 L 20 4 A 16 16 0 ${vulnAngle > 180 ? 1 : 0} 1 ${vx} ${vy} Z" fill="#2fb344"/>
                                                            ` : ''}
                                                        </svg>
                                                        <div style="font-size: 11px;">
                                                            <strong>${vulnerableApps}</strong>/${totalApps} apps vulnerable
                                                        </div>
                                                    `;
                                                })()}
                                            </div>
                                            <!-- CVE Distribution Pie -->
                                            <div class="d-flex align-items-center gap-2">
                                                ${(() => {
                                                    const totalCves = this.state.cveInventory.length;
                                                    const critCount = criticalCves.length;
                                                    const highCount = highCves.length;
                                                    const mediumCount = this.state.cveInventory.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length;
                                                    const lowCount = this.state.cveInventory.filter(c => c.severity === 'LOW' || c.severity === 'Low').length;
                                                    
                                                    if (totalCves === 0) {
                                                        return html`
                                                            <svg width="40" height="40" viewBox="0 0 40 40">
                                                                <circle cx="20" cy="20" r="16" fill="#2fb344"/>
                                                            </svg>
                                                            <div style="font-size: 11px;"><strong>0</strong> CVEs</div>
                                                        `;
                                                    }
                                                    
                                                    const addSlice = (startAngle, count, color) => {
                                                        if (count === 0) return { path: '', endAngle: startAngle };
                                                        const angle = (count / totalCves) * 360;
                                                        const endAngle = startAngle + angle;
                                                        const startRad = (startAngle - 90) * (Math.PI / 180);
                                                        const endRad = (endAngle - 90) * (Math.PI / 180);
                                                        const x1 = 20 + 16 * Math.cos(startRad);
                                                        const y1 = 20 + 16 * Math.sin(startRad);
                                                        const x2 = 20 + 16 * Math.cos(endRad);
                                                        const y2 = 20 + 16 * Math.sin(endRad);
                                                        const largeArc = angle > 180 ? 1 : 0;
                                                        return {
                                                            path: html`<path d="M 20 20 L ${x1} ${y1} A 16 16 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}"/>`,
                                                            endAngle
                                                        };
                                                    };
                                                    
                                                    let currentAngle = 0;
                                                    const slices = [];
                                                    const slice1 = addSlice(currentAngle, critCount, '#d63939'); slices.push(slice1.path); currentAngle = slice1.endAngle;
                                                    const slice2 = addSlice(currentAngle, highCount, '#f59f00'); slices.push(slice2.path); currentAngle = slice2.endAngle;
                                                    const slice3 = addSlice(currentAngle, mediumCount, '#fab005'); slices.push(slice3.path); currentAngle = slice3.endAngle;
                                                    const slice4 = addSlice(currentAngle, lowCount, '#74b816'); slices.push(slice4.path);
                                                    
                                                    return html`
                                                        <svg width="40" height="40" viewBox="0 0 40 40">
                                                            ${slices}
                                                        </svg>
                                                        <div style="font-size: 11px;"><strong>${totalCves}</strong> CVEs</div>
                                                    `;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small font-weight-medium">Registered</div>
                                        <div class="mt-2">
                                            <div class="text-muted small">${device.FirstHeartbeat ? this.formatDate(device.FirstHeartbeat) : device.firstSeen ? this.formatDate(device.firstSeen) : device.createdAt ? this.formatDate(device.createdAt) : 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small font-weight-medium">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>
                                            Logged-In User
                                        </div>
                                        <div class="mt-2">
                                            ${(() => {
                                                const f = this.state.telemetryDetail?.latest?.fields || {};
                                                const encoded = f.UserName || f.Username || f.userName || f.LoggedOnUser || f.CurrentUser || null;
                                                const u = encoded ? PiiDecryption.decryptIfEncrypted(String(encoded)) : null;
                                                return html`<div class="text-muted small font-monospace">${u ? String(u) : 'N/A'}</div>`;
                                            })()}
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
        const fields = telemetryDetail?.latest?.fields || {};

        return html`
            <div class="row">
                <div class="col-md-6">
                    <h6>Hardware</h6>
                    <dl class="row text-sm">
                        <dt class="col-sm-4">CPU</dt>
                        <dd class="col-sm-8">${fields.CPUName || ''} (${fields.CPUCores || '?'} cores)</dd>
                        
                        <dt class="col-sm-4">RAM</dt>
                        <dd class="col-sm-8">${fields.TotalRAMMB ? Math.round(Number(fields.TotalRAMMB) / 1024) + ' GB' : 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Disk</dt>
                        <dd class="col-sm-8">${fields.SystemDriveSizeGB || fields.TotalDiskGb || 'N/A'} GB (${fields.SystemDiskMediaType || 'N/A'}) ${fields.SystemDiskBusType || ''}</dd>
                        
                        <dt class="col-sm-4">Network</dt>
                        <dd class="col-sm-8">${fields.ConnectionType || 'N/A'} ${fields.NetworkSpeedMbps ? '@ ' + fields.NetworkSpeedMbps + ' Mbps' : ''}</dd>
                        
                        <dt class="col-sm-4">GPU</dt>
                        <dd class="col-sm-8">${fields.GPUName || 'N/A'} ${fields.GpuRamMB ? '(' + fields.GpuRamMB + ' MB)' : ''}</dd>
                    </dl>
                </div>
                <div class="col-md-6">
                    <h6>Operating System</h6>
                    <dl class="row text-sm">
                        <dt class="col-sm-4">Edition</dt>
                        <dd class="col-sm-8">${fields.OSEdition || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Version</dt>
                        <dd class="col-sm-8">${fields.OSVersion || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Build</dt>
                        <dd class="col-sm-8">${fields.FeaturePackVersion || fields.OSBuild || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Architecture</dt>
                        <dd class="col-sm-8">${fields.CPUArch || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Last Updated</dt>
                        <dd class="col-sm-8">${telemetryDetail?.latest?.timestamp ? this.formatDate(telemetryDetail.latest.timestamp) : 'N/A'}</dd>
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
                                        ${Object.keys(change.delta).map(k => {
                                            const formatValue = (v) => {
                                                if (v === null || v === undefined) return 'null';
                                                if (typeof v === 'object') {
                                                    // Avoid circular references from virtual DOM elements
                                                    if (v && (v.__k || v.__)) return '[Virtual DOM Element]';
                                                    try {
                                                        return JSON.stringify(v);
                                                    } catch (e) {
                                                        return '[Complex Object]';
                                                    }
                                                }
                                                return String(v);
                                            };
                                            const deltaVal = change.delta[k];
                                            const showArrow = deltaVal && typeof deltaVal === 'object' && (deltaVal.from !== undefined || deltaVal.to !== undefined);
                                            return html`
                                                <div class="mb-1 d-flex align-items-center gap-2">
                                                    <span class="badge bg-secondary-lt">${k}</span>
                                                    ${showArrow ? html`
                                                        <span class="text-muted">${formatValue(deltaVal.from)}</span>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-narrow-right" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="5" y1="12" x2="19" y2="12" /><line x1="15" y1="16" x2="19" y2="12" /><line x1="15" y1="8" x2="19" y2="12" /></svg>
                                                        <span class="fw-medium">${formatValue(deltaVal.to)}</span>
                                                    ` : html`<span>${formatValue(deltaVal)}</span>`}
                                                </div>
                                            `;
                                        })}
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
        const { appViewMode } = this.state;
        
        return html`
            <div class="mb-3 d-flex justify-content-between align-items-center">
                <div class="input-group" style="max-width: 400px;">
                    <span class="input-group-text">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                    </span>
                    <input class="form-control" type="text" placeholder="Search applications..." value=${this.state.searchQuery} onInput=${(e) => this.setState({ searchQuery: e.target.value })} />
                </div>
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm ${appViewMode === 'vendor' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => this.setState({ appViewMode: 'vendor' })}>
                        Group by Vendor
                    </button>
                    <button type="button" class="btn btn-sm ${appViewMode === 'flat' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => this.setState({ appViewMode: 'flat' })}>
                        Flat List
                    </button>
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
            ${appViewMode === 'vendor' ? this.renderVendorGroupedView(filteredApps) : this.renderFlatListView(filteredApps)}
        `;
    }

    renderVendorGroupedView(apps) {
        const { html } = window;
        const vendorGroups = this.groupAppsByVendor(apps);
        const vendorNames = Object.keys(vendorGroups).sort();

        return html`
            <div class="accordion" id="vendorAccordion">
                ${vendorNames.map(vendorName => {
                    const vendorApps = vendorGroups[vendorName];
                    const isExpanded = this.state.expandedVendors.has(vendorName);
                    const appGroups = this.groupAppVersions(vendorApps);
                    const totalCves = vendorApps.reduce((sum, app) => sum + this.getCvesByApp(app.appName).length, 0);

                    return html`
                        <div class="accordion-item">
                            <h2 class="accordion-header">
                                <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" onclick=${() => this.toggleVendor(vendorName)}>
                                    <div class="d-flex justify-content-between align-items-center w-100 pe-3">
                                        <span class="fw-bold">${vendorName}</span>
                                        <div class="d-flex gap-3 align-items-center">
                                            <span class="badge bg-secondary-lt">${vendorApps.length} apps</span>
                                            ${totalCves > 0 ? html`<span class="badge bg-danger-lt">${totalCves} CVEs</span>` : ''}
                                        </div>
                                    </div>
                                </button>
                            </h2>
                            <div class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" data-bs-parent="#vendorAccordion">
                                <div class="accordion-body p-0">
                                    ${appGroups.map(appGroup => {
                                        const latestVersion = appGroup.versions[0];
                                        const hasMultipleVersions = appGroup.versions.length > 1;
                                        const appKey = appGroup.appName.toLowerCase();
                                        const isVersionsExpanded = this.state.expandedApps.has(appKey);
                                        const cves = this.getCvesByApp(appGroup.appName);
                                        const worstSeverity = cves.some(c => c.severity === 'CRITICAL') ? 'CRITICAL' : 
                                                             cves.some(c => c.severity === 'HIGH') ? 'HIGH' : 
                                                             cves.some(c => c.severity === 'MEDIUM') ? 'MEDIUM' : 
                                                             cves.length > 0 ? 'LOW' : 'CLEAN';

                                        return html`
                                            <div class="border-bottom">
                                                <div class="d-flex align-items-center p-3 gap-3" style="cursor: pointer;" onclick=${() => hasMultipleVersions && this.toggleAppVersions(appKey)}>
                                                    ${latestVersion.isInstalled === false ? html`
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #ff7d00;" title="Running from disk">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M5 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1"/>
                                                            <path d="M9 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4"/>
                                                            <path d="M5 8h8"/>
                                                            <path d="M5 16h8"/>
                                                        </svg>
                                                    ` : html`
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #2fb344;" title="Installed">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/>
                                                            <line x1="12" y1="12" x2="20" y2="7.5"/>
                                                            <line x1="12" y1="12" x2="12" y2="21"/>
                                                            <line x1="12" y1="12" x2="4" y2="7.5"/>
                                                        </svg>
                                                    `}
                                                    <div class="flex-fill">
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${hasMultipleVersions ? html`
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${isVersionsExpanded ? '90deg' : '0deg'}); transition: transform 0.2s;">
                                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                    <polyline points="9 6 15 12 9 18" />
                                                                </svg>
                                                            ` : ''}
                                                            <span class="fw-medium">${appGroup.appName}</span>
                                                            ${hasMultipleVersions ? html`<span class="badge bg-blue-lt">${appGroup.versions.length} versions</span>` : ''}
                                                        </div>
                                                        <div class="text-muted small">v${latestVersion.version || '—'} • ${this.formatDate(latestVersion.lastSeen)}</div>
                                                    </div>
                                                    <div class="d-flex gap-2 align-items-center">
                                                        ${worstSeverity !== 'CLEAN' ? html`
                                                            <span class="badge ${
                                                              worstSeverity === 'CRITICAL' ? 'bg-danger' : 
                                                              worstSeverity === 'HIGH' ? 'bg-warning' : 
                                                              worstSeverity === 'MEDIUM' ? 'bg-secondary' : 
                                                              'bg-info'
                                                            } text-white">${worstSeverity}</span>
                                                        ` : ''}
                                                        ${cves.length > 0 ? html`
                                                            <a href="#" class="badge bg-danger text-white" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); this.setState({ cveFilterApp: appGroup.appName, activeTab: 'risks' }); }}>
                                                                ${cves.length} CVEs
                                                            </a>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                                ${hasMultipleVersions && isVersionsExpanded ? html`
                                                    <div class="ps-5 pe-3 pb-3">
                                                        <div class="timeline timeline-simple">
                                                            ${appGroup.versions.map((version, idx) => html`
                                                                <div class="timeline-event ${idx === 0 ? 'timeline-event-latest' : ''}">
                                                                    <div class="timeline-event-icon ${idx === 0 ? 'bg-primary' : 'bg-secondary'}"></div>
                                                                    <div class="card card-sm">
                                                                        <div class="card-body">
                                                                            <div class="row align-items-center">
                                                                                <div class="col">
                                                                                    <div class="fw-medium">v${version.version || 'Unknown'}</div>
                                                                                    <div class="text-muted small">
                                                                                        ${this.formatDate(version.firstSeen)} 
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-narrow-right mx-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="5" y1="12" x2="19" y2="12" /><line x1="15" y1="16" x2="19" y2="12" /><line x1="15" y1="8" x2="19" y2="12" /></svg>
                                                                                        ${this.formatDate(version.lastSeen)}
                                                                                    </div>
                                                                                </div>
                                                                                <div class="col-auto">
                                                                                    ${version.isInstalled ? html`<span class="badge bg-success-lt">Installed</span>` : html`<span class="badge bg-warning-lt">Disk</span>`}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            `)}
                                                        </div>
                                                    </div>
                                                ` : ''}
                                            </div>
                                        `;
                                    })}
                                </div>
                            </div>
                        </div>
                    `;
                })}
            </div>
            ${vendorNames.length === 0 && this.state.searchQuery ? html`
                <div class="text-center text-muted py-5">
                    No applications match your search
                </div>
            ` : ''}
        `;
    }

    renderFlatListView(filteredApps) {
        const { html } = window;
        
        return html`
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Application</th>
                            <th>Vendor</th>
                            <th>Version</th>
                            <th>Status</th>
                            <th>
                                <a href="#" onclick=${(e)=>{e.preventDefault(); this.setState({ appSortKey: 'severity', appSortDir: this.state.appSortKey==='severity' && this.state.appSortDir==='desc' ? 'asc':'desc' });}} class="text-reset text-decoration-none">Risk / Match</a>
                            </th>
                            <th>
                                <a href="#" onclick=${(e)=>{e.preventDefault(); this.setState({ appSortKey: 'cveCount', appSortDir: this.state.appSortKey==='cveCount' && this.state.appSortDir==='desc' ? 'asc':'desc' });}} class="text-reset text-decoration-none">CVEs</a>
                            </th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredApps.map(app => {
                            const cves = this.getCvesByApp(app.appName);
                            const worstSeverity = cves.some(c => c.severity === 'CRITICAL' || c.severity === 'Critical') ? 'CRITICAL' : 
                                                 cves.some(c => c.severity === 'HIGH' || c.severity === 'High') ? 'HIGH' : 
                                                 cves.some(c => c.severity === 'MEDIUM' || c.severity === 'Medium') ? 'MEDIUM' : 
                                                 cves.length > 0 ? 'LOW' : 'CLEAN';
                            const daysInstalled = app.firstSeen ? Math.round((Date.now() - new Date(app.firstSeen).getTime()) / (1000 * 60 * 60 * 24)) : null;
                            const isFiltered = this.state.cveFilterApp === app.appName;
                            return html`
                                <tr style="cursor: pointer; transition: background 0.15s;" onclick=${() => this.setState({ cveFilterApp: isFiltered ? null : app.appName, activeTab: 'risks' })} title="Click to filter CVEs by this app">
                                    <td class="font-weight-medium d-flex align-items-center gap-2">
                                        ${app.isInstalled === false ? html`
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #ff7d00;" title="Running from disk (not installed)">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                <path d="M5 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1"/>
                                                <path d="M9 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4"/>
                                                <path d="M5 8h8"/>
                                                <path d="M5 16h8"/>
                                            </svg>
                                        ` : html`
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #2fb344;" title="Installed application">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/>
                                                <line x1="12" y1="12" x2="20" y2="7.5"/>
                                                <line x1="12" y1="12" x2="12" y2="21"/>
                                                <line x1="12" y1="12" x2="4" y2="7.5"/>
                                            </svg>
                                        `}
                                        ${app.appName}${isFiltered ? ' ⚡' : ''}
                                    </td>
                                    <td>${app.vendor || '—'}</td>
                                    <td><code class="text-sm">${app.version || '—'}</code></td>
                                    <td>
                                        ${app.status === 'updated' ? html`<span class="badge bg-warning-lt">Updated</span>` : 
                                          app.status === 'uninstalled' ? html`<span class="badge bg-danger-lt">Uninstalled</span>` : 
                                          html`<span class="badge bg-success-lt">Current</span>`}
                                    </td>
                                    <td>
                                        ${worstSeverity === 'CLEAN' ? '' : html`
                                            <span class="badge ${
                                              worstSeverity === 'CRITICAL' ? 'bg-danger' : 
                                              worstSeverity === 'HIGH' ? 'bg-warning' : 
                                              worstSeverity === 'MEDIUM' ? 'bg-secondary' : 
                                              'bg-info'
                                            } text-white d-inline-flex align-items-center gap-1" title="${worstSeverity} severity${app.matchType === 'absolute' ? ' - Exact Match' : app.matchType === 'heuristic' ? ' - Heuristic' : ''}">
                                                ${worstSeverity}
                                                ${app.matchType === 'absolute' ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;"><path d="M3 12 L12 3 L21 12 Z"/></svg>` : 
                                                app.matchType === 'heuristic' ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>` : ''}
                                            </span>
                                        `}
                                    </td>
                                    <td>
                                        ${cves.length > 0 ? html`
                                            <a href="#" class="text-reset text-decoration-none" onclick=${(e) => { e.preventDefault(); this.setState({ cveFilterApp: app.appName, activeTab: 'risks' }); }} title="Show CVEs for this application">
                                                <span class="badge ${cves.some(c => c.severity === 'CRITICAL' || c.severity === 'Critical') ? 'bg-danger' : cves.some(c => c.severity === 'HIGH' || c.severity === 'High') ? 'bg-warning' : 'bg-secondary'} text-white">
                                                    ${cves.length}
                                                </span>
                                            </a>
                                        ` : html`<span class="text-muted">—</span>`}
                                    </td>
                                    <td class="text-muted small">
                                        ${app.lastSeen ? html`<div>${this.formatDate(app.lastSeen)}</div>` : '—'}
                                        ${daysInstalled !== null ? html`<div style="font-size: 10px; color: #999;">${daysInstalled}d</div>` : ''}
                                    </td>
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
        
        // Get only active apps (not old uninstalled) and unpatched CVEs
        const { activeApps, activeCves } = this.getActiveAppsAndCves();
        
        // Filter by selected app if cross-linked from Inventory tab
        let filteredCves = this.state.cveFilterApp 
            ? activeCves.filter(c => c.appName && c.appName.toLowerCase() === this.state.cveFilterApp.toLowerCase())
            : activeCves;
        
        const criticalCves = filteredCves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical');
        const highCves = filteredCves.filter(c => c.severity === 'HIGH' || c.severity === 'High');
        const mediumCves = filteredCves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium');
        const lowCves = filteredCves.filter(c => c.severity === 'LOW' || c.severity === 'Low');

        return html`
            ${this.state.cveFilterApp ? html`
                <div class="alert alert-info mb-3" style="position: relative;">
                    <span>Filtering CVEs for <strong>${this.state.cveFilterApp}</strong></span>
                    <button class="btn-close" onclick=${() => this.setState({ cveFilterApp: null })} style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%);"></button>
                </div>
            ` : ''}
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
                        ${filteredCves.map(cve => {
                            const isKnownExploit = this.state.knownExploits && this.state.knownExploits.has(cve.cveId);
                            return html`
                                <tr>
                                    <td>
                                        <a href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" rel="noopener" class="font-monospace text-primary d-inline-flex align-items-center gap-1">
                                            ${cve.cveId}
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                        </a>
                                        ${isKnownExploit ? html`
                                            <span class="badge bg-danger-lt ms-2" title="Active exploitation detected in the wild">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                                Known Exploit
                                            </span>
                                        ` : ''}
                                    </td>
                                    <td class="font-weight-medium">
                                        <a href="#" class="text-reset text-decoration-none d-inline-flex align-items-center gap-1" title="View application in Inventory tab"
                                           onclick=${(e)=>{e.preventDefault(); this.setState({ activeTab: 'inventory', searchQuery: cve.appName });}}>
                                           <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                                           ${cve.appName}
                                        </a>
                                    </td>
                                    <td>${cve.vendor || '—'}</td>
                                    <td>
                                        <span class="badge ${this.getSeverityColor(cve.severity)} text-white">
                                            ${(cve.severity || 'Unknown').toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        ${cve.epss ? html`<span class="font-weight-medium">${Number(cve.epss).toFixed(2)}</span>` : html`<span class="text-muted">—</span>`}
                                        ${cve.score ? html`<span class="badge bg-blue-lt ms-2">${Number(cve.score).toFixed(1)}</span>` : ''}
                                    </td>
                                    <td class="text-muted small">${cve.lastSeen ? new Date(cve.lastSeen).toLocaleDateString() : '—'}</td>
                                </tr>
                            `;
                        })}
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
