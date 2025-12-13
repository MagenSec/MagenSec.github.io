/**
 * Devices Page - Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { config } from '../config.js';
import { PiiDecryption } from '../utils/piiDecryption.js';
import { getInstallerConfig, clearManifestCache, getCacheStatus } from '../utils/manifestCache.js';

export class DevicesPage extends window.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            devices: [],
            error: null,
            installers: config.INSTALLERS, // Fallback to hardcoded config
            refreshingManifest: false,
            showDownloadModal: false,
            downloadTarget: null, // { name, url, size, arch }
            manifestError: null,
            showDeviceModal: false,
            telemetryLoading: false,
            telemetryError: null,
            telemetryDetail: null,
            selectedDevice: null,
            searchQuery: '',
            inventoryLoading: false,
            inventoryError: null,
            appInventory: [],
            cveInventory: []
        };
        this.orgUnsubscribe = null;
    }

    getDevicesCacheKey(orgId) {
        return `ms_devices_cache_${orgId}`;
    }

    tryGetCachedDevices(orgId) {
        try {
            const raw = localStorage.getItem(this.getDevicesCacheKey(orgId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.ts || !Array.isArray(parsed.devices)) return null;

            // Use server cache hint as a guideline; keep local cache for up to 5 minutes.
            if (Date.now() - parsed.ts > 5 * 60 * 1000) return null;
            return parsed.devices;
        } catch {
            return null;
        }
    }

    setCachedDevices(orgId, devices) {
        try {
            localStorage.setItem(this.getDevicesCacheKey(orgId), JSON.stringify({ ts: Date.now(), devices }));
        } catch {
            // Best-effort caching
        }
    }

    componentDidMount() {
        // Subscribe to org changes to reload devices when user switches orgs
        this.orgUnsubscribe = orgContext.onChange(() => {
            this.loadDevices(false);
        });
        
        // Load installer config from manifest cache
        this.loadInstallerConfig();
        
        this.loadDevices(false);
    }

    async loadInstallerConfig() {
        try {
            const manifestConfig = await getInstallerConfig();
            if (manifestConfig) {
                this.setState({ installers: manifestConfig, manifestError: null });
                console.log('[Devices] Loaded installer config from manifest cache:', manifestConfig);
            } else {
                this.setState({ manifestError: 'Failed to load installer manifest. Please try again later or contact support.' });
            }
        } catch (error) {
            console.error('[Devices] Failed to load manifest config, using fallback:', error);
            this.setState({ manifestError: 'Failed to load installer manifest due to network or server error.' });
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
            const response = await api.put(`/api/v1/orgs/${orgId}/devices/${deviceId}/enable`);

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
            const url = `/api/v1/orgs/${orgId}/devices/${deviceId}/block?deleteTelemetry=${deleteTelemetry ? 'true' : 'false'}`;
            const response = await api.put(url);

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

    async loadDevices(forceRefresh = false) {
        try {
            // Get current org from context
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                this.setState({ 
                    devices: [], 
                    loading: false,
                    error: 'No organization selected'
                });
                return;
            }

            if (!forceRefresh) {
                const cached = this.tryGetCachedDevices(currentOrg.orgId);
                if (cached) {
                    this.setState({ devices: cached, loading: false, error: null });
                    return;
                }
            }

            this.setState({ loading: true, error: null });

            // Call real API
            const response = await api.getDevices(currentOrg.orgId, { skipCache: forceRefresh });
            if (!response.success) {
                throw new Error(response.message || response.error || 'Failed to load devices');
            }
            
            // Transform API response to expected format
            const devices = (response.data?.devices || []).map(device => {
                // Mask license key - only show last 8 characters
                let maskedKey = null;
                if (device.licenseKey) {
                    const key = device.licenseKey;
                    maskedKey = key.length > 8 ? `****-****-${key.slice(-8)}` : key;
                }
                
                const t = device.telemetry || {};
                // Robust device name extraction with multiple fallbacks
                const encryptedName = (device.deviceName && device.deviceName.trim()) 
                    ? device.deviceName 
                    : (device.DeviceName && device.DeviceName.trim()) 
                    ? device.DeviceName 
                    : (t.hostname && String(t.hostname).trim())
                    ? t.hostname
                    : (t.Hostname && String(t.Hostname).trim())
                    ? t.Hostname
                    : device.deviceId;
                // Decrypt PII field
                const deviceName = PiiDecryption.decrypt(encryptedName);
                return {
                    id: device.DeviceId || device.deviceId,
                    name: deviceName,
                    state: device.state || 'Unknown',
                    lastHeartbeat: device.lastHeartbeat,
                    firstHeartbeat: device.firstHeartbeat,
                    clientVersion: device.clientVersion,
                    licenseKey: maskedKey,
                    telemetry: {
                        osEdition: t.oseEdition || t.OSEdition,
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
                    inactiveMinutes: device.lastHeartbeat ? Math.floor((Date.now() - new Date(device.lastHeartbeat).getTime()) / 60000) : null
                };
            });

            this.setCachedDevices(currentOrg.orgId, devices);
            this.setState({ devices, loading: false });
        } catch (error) {
            console.error('[DevicesPage] Error loading devices:', error);
            this.setState({ error: error.message, loading: false });
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
        const s = (state || '').toLowerCase();
        return s === 'blocked' || s === 'deleted';
    }

    canBlockDevice(state) {
        const s = (state || '').toLowerCase();
        return s === 'active' || s === 'enabled';
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

        let badgeClass = 'bg-success-lt';
        let label = 'Secure';
        if (counts.critical > 0) { badgeClass = 'bg-danger-lt'; label = 'Critical'; }
        else if (counts.high > 0) { badgeClass = 'bg-warning-lt'; label = 'High Risk'; }
        else if (counts.medium > 0) { badgeClass = 'bg-secondary-lt'; label = 'Medium Risk'; }
        else if (counts.total > 0) { badgeClass = 'bg-primary-lt'; label = 'Low Risk'; }

        return { counts, badgeClass, label };
    }

    async openDeviceModal(device) {
        this.setState({ showDeviceModal: true, selectedDevice: device, telemetryLoading: true, telemetryError: null, telemetryDetail: null, inventoryLoading: true, inventoryError: null, appInventory: [], cveInventory: [] });
        try {
            const currentOrg = orgContext.getCurrentOrg();
            const resp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${device.id}/telemetry?historyLimit=50&lastDays=180`);
            if (!resp.success) throw new Error(resp.message || resp.error || 'Failed to load telemetry');
            this.setState({ telemetryDetail: resp.data, telemetryLoading: false });
            // Load app inventory and CVEs (org-scoped)
            const appsResp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${device.id}/apps?limit=500`);
            const cvesResp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${device.id}/cves?limit=500`);
            const appList = (appsResp.success ? (appsResp.data?.apps || appsResp.data || []) : []).map(x => ({
                appName: x.appName || x.AppName,
                vendor: x.vendor || x.AppVendor,
                version: x.applicationVersion || x.ApplicationVersion,
                matchType: x.matchType || x.MatchType, // absolute | heuristic | none
                isInstalled: x.isInstalled ?? x.IsInstalled,
                lastSeen: x.lastSeen || x.LastSeen,
                firstSeen: x.firstSeen || x.FirstSeen
            }));
            const cveList = (cvesResp.success ? (cvesResp.data?.cves || cvesResp.data || []) : []).map(x => ({
                appName: x.appName || x.AppName,
                vendor: x.vendor || x.AppVendor,
                cveId: x.cveId || x.CveId,
                severity: x.severity || x.Severity,
                epss: x.epss || x.EPSS,
                score: x.score || x.Score,
                lastSeen: x.lastSeen || x.LastSeen
            }));
            this.setState({ appInventory: appList, cveInventory: cveList, inventoryLoading: false });
        } catch (e) {
            console.error('[Devices] Telemetry load failed', e);
            this.setState({ telemetryError: e.message, telemetryLoading: false, inventoryError: e.message, inventoryLoading: false });
        }
    }

    closeDeviceModal() {
        this.setState({ showDeviceModal: false, selectedDevice: null, telemetryDetail: null, telemetryError: null });
    }

    setSearchQuery(q) {
        this.setState({ searchQuery: q });
    }

    // Compute enriched application inventory status
    computeAppStatus(apps) {
        // Group by appName+vendor
        const groups = {};
        for (const a of apps) {
            const key = `${(a.appName||'').toLowerCase()}|${(a.vendor||'').toLowerCase()}`;
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
            enriched.push({
                appName: current.appName,
                vendor: current.vendor,
                version: current.version,
                matchType: current.matchType,
                isInstalled: current.isInstalled,
                status,
                lastSeen: current.lastSeen,
                previousVersions: previous.map(p => ({ version: p.version, lastSeen: p.lastSeen }))
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

    render() {
        const { html } = window;
        const { loading, devices, error, manifestError } = this.state;

        return html`
            ${manifestError ? html`<div class="alert alert-danger mt-2">${manifestError}</div>` : null}
            <!-- Installer Download Tiles -->
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 class="mb-0">Client Installers</h3>
                                <button 
                                    class="btn btn-sm btn-outline-primary ${this.state.refreshingManifest ? 'disabled' : ''}" 
                                    onclick=${() => this.reloadPageData()}
                                    disabled=${this.state.refreshingManifest}>
                                    ${this.state.refreshingManifest ? 
                                        window.html`<span class="spinner-border spinner-border-sm me-2"></span>Reloading...` : 
                                        window.html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                                            <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                                        </svg>
                                        Reload`
                                    }
                                </button>
                            </div>
                            <div class="row row-cards mb-3">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-lg bg-primary-lt">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <rect x="4" y="4" width="6" height="6" rx="1" />
                                                            <rect x="14" y="4" width="6" height="6" rx="1" />
                                                            <rect x="4" y="14" width="6" height="6" rx="1" />
                                                            <rect x="14" y="14" width="6" height="6" rx="1" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${this.state.installers.X64.DISPLAY_NAME}</h3>
                                                    <div class="text-muted small">${this.state.installers.X64.DESCRIPTION}</div>
                                                    <div class="mt-2">
                                                        <span class="badge bg-blue-lt me-2">v${this.state.installers.X64.VERSION}</span>
                                                        <span class="badge bg-secondary-lt">${this.state.installers.X64.FILE_SIZE_MB} MB</span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <button class="btn btn-primary" onclick=${() => this.openDownloadModal('x64')}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                                            <polyline points="7 11 12 16 17 11" />
                                                            <line x1="12" y1="4" x2="12" y2="16" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-lg bg-cyan-lt">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <rect x="4" y="4" width="6" height="6" rx="1" />
                                                            <rect x="14" y="4" width="6" height="6" rx="1" />
                                                            <rect x="4" y="14" width="6" height="6" rx="1" />
                                                            <rect x="14" y="14" width="6" height="6" rx="1" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${this.state.installers.ARM64.DISPLAY_NAME}</h3>
                                                    <div class="text-muted small">${this.state.installers.ARM64.DESCRIPTION}</div>
                                                    <div class="mt-2">
                                                        <span class="badge bg-blue-lt me-2">v${this.state.installers.ARM64.VERSION}</span>
                                                        <span class="badge bg-secondary-lt">${this.state.installers.ARM64.FILE_SIZE_MB} MB</span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <button class="btn btn-primary" onclick=${() => this.openDownloadModal('arm64')}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                                            <polyline points="7 11 12 16 17 11" />
                                                            <line x1="12" y1="4" x2="12" y2="16" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Devices List -->
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
                            ` : devices.length === 0 ? html`
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
                                <div class="card">
                                    <div class="table-responsive">
                                        <table class="table table-vcenter card-table">
                                            <thead>
                                                <tr>
                                                    <th>Device</th>
                                                    <th>License Status</th>
                                                    <th>Connection Status</th>
                                                    <th>Specs</th>
                                                    <th class="w-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${devices.map(device => html`
                                                    <tr>
                                                        <td>
                                                            <div class="d-flex py-1 align-items-center">
                                                                <span class="avatar me-2">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                                                </span>
                                                                <div class="flex-fill">
                                                                    <a href="#!/devices/${device.id}" class="font-weight-medium text-decoration-none text-reset" style="cursor: pointer;"><span class="text-primary fw-600">${device.name || device.id}</span></a>
                                                                    <div class="text-muted small">${device.id}</div>
                                                                    ${device.clientVersion ? html`
                                                                        <div class="text-muted small">Version: ${device.clientVersion}</div>
                                                                    ` : ''}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span class="badge ${this.getStateBadgeClass(device.state)} text-white">
                                                                ${device.state}
                                                            </span>
                                                            ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? html`
                                                                <span class="badge bg-warning-lt ms-1" title="Update available: v${config.INSTALLERS.ENGINE.VERSION}">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                        <circle cx="12" cy="12" r="9" />
                                                                        <line x1="12" y1="8" x2="12" y2="12" />
                                                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                                                    </svg>
                                                                    Update Available
                                                                </span>
                                                            ` : ''}
                                                        </td>
                                                        <td>
                                                            <div class="text-muted">${this.formatLastSeen(device.lastHeartbeat)}</div>
                                                            ${device.firstHeartbeat ? html`
                                                                <div class="text-muted small">First seen: ${this.formatLastSeen(device.firstHeartbeat)}</div>
                                                            ` : ''}
                                                            ${this.isDeviceInactive(device) ? html`
                                                                <span class="badge bg-danger-lt mt-1">Offline</span>
                                                            ` : html`
                                                                <span class="badge bg-success-lt mt-1">Online</span>
                                                            `}
                                                        </td>
                                                        <td>
                                                            ${device.telemetry ? html`
                                                                <div class="text-muted small">
                                                                    <span class="me-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <rect x="7" y="7" width="10" height="10" rx="2" />
                                                                            <rect x="10" y="10" width="4" height="4" rx="1" />
                                                                            <path d="M3 10h2" />
                                                                            <path d="M3 14h2" />
                                                                            <path d="M19 10h2" />
                                                                            <path d="M19 14h2" />
                                                                            <path d="M10 3v2" />
                                                                            <path d="M14 3v2" />
                                                                            <path d="M10 19v2" />
                                                                            <path d="M14 19v2" />
                                                                        </svg>
                                                                        ${device.telemetry.cpuName || device.telemetry.cpuArch || ''}
                                                                    </span>
                                                                    <span class="me-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <rect x="3" y="7" width="18" height="10" rx="2" />
                                                                            <path d="M6 7v10" />
                                                                            <path d="M10 7v10" />
                                                                            <path d="M14 7v10" />
                                                                            <path d="M18 7v10" />
                                                                        </svg>
                                                                        ${device.telemetry.totalRamMb ? Math.round(device.telemetry.totalRamMb/1024) + ' GB' : ''}
                                                                    </span>
                                                                    <span class="me-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <rect x="4" y="6" width="16" height="12" rx="2" />
                                                                            <path d="M4 10h16" />
                                                                            <circle cx="16" cy="14" r="1" />
                                                                        </svg>
                                                                        ${device.telemetry.totalDiskGb ? device.telemetry.totalDiskGb + ' GB' : ''}
                                                                    </span>
                                                                    <span class="me-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <path d="M2 9.5a15 15 0 0 1 20 0" />
                                                                            <path d="M5 13a10 10 0 0 1 14 0" />
                                                                            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
                                                                            <circle cx="12" cy="20" r="1" />
                                                                        </svg>
                                                                        ${device.telemetry.connectionType || ''}
                                                                    </span>
                                                                </div>
                                                            ` : html`<span class="text-muted small">No telemetry yet</span>`}
                                                        </td>
                                                        <td>
                                                            <div class="dropdown">
                                                                <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                                                    Actions
                                                                </button>
                                                                <div class="dropdown-menu dropdown-menu-end">
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.openDeviceModal(device)}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="2" /><path d="M22 12a10 10 0 1 0 -20 0a10 10 0 0 0 20 0" /></svg>
                                                                        View Details
                                                                    </button>
                                                                    ${this.canEnableDevice(device.state) ? html`
                                                                        <button type="button" class="dropdown-item text-success" onclick=${() => this.enableDevice(device.id)}>
                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                                            Enable Device
                                                                        </button>
                                                                    ` : ''}
                                                                    ${this.canBlockDevice(device.state) ? html`
                                                                        <button type="button" class="dropdown-item text-warning" onclick=${() => this.blockDevice(device.id, false)}>
                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                                                            Block Device
                                                                        </button>
                                                                        <button type="button" class="dropdown-item text-warning" onclick=${() => this.blockDevice(device.id, true)}>
                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                                                            Block + Delete Telemetry
                                                                        </button>
                                                                        <div class="dropdown-divider"></div>
                                                                    ` : ''}
                                                                    <button type="button" class="dropdown-item text-danger" onclick=${() => this.deleteDevice(device.id)}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                                                                        Delete Device
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `}

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

                ${this.state.showDeviceModal && this.state.selectedDevice ? window.html`
                    <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
                        <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                            <div class="modal-content" style="z-index: 1056;">
                                <div class="modal-header">
                                    <h5 class="modal-title">${this.state.selectedDevice.name}</h5>
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
                                        <div class="mb-3">
                                            <div class="input-group">
                                                <span class="input-group-text">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                                </span>
                                                <input class="form-control" type="text" placeholder="Search apps or vendors" value=${this.state.searchQuery} onInput=${(e) => this.setSearchQuery(e.target.value)} />
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6">
                                                <h6>Current Specs</h6>
                                                <ul class="list-unstyled text-muted small">
                                                    <li><strong>OS:</strong> ${this.state.selectedDevice.telemetry?.osEdition || ''} ${this.state.selectedDevice.telemetry?.osVersion || ''} (${this.state.selectedDevice.telemetry?.osBuild || ''})</li>
                                                    <li><strong>CPU:</strong> ${this.state.selectedDevice.telemetry?.cpuName || ''} ${this.state.selectedDevice.telemetry?.cpuCores ? '('+this.state.selectedDevice.telemetry.cpuCores+' cores)' : ''}</li>
                                                    <li><strong>RAM:</strong> ${this.state.selectedDevice.telemetry?.totalRamMb ? Math.round(this.state.selectedDevice.telemetry.totalRamMb/1024)+' GB' : ''}</li>
                                                    <li><strong>Disk:</strong> ${this.state.selectedDevice.telemetry?.totalDiskGb ? this.state.selectedDevice.telemetry.totalDiskGb+' GB' : ''} ${this.state.selectedDevice.telemetry?.systemDiskMediaType || ''} ${this.state.selectedDevice.telemetry?.systemDiskBusType || ''}</li>
                                                    <li><strong>Network:</strong> ${this.state.selectedDevice.telemetry?.connectionType || ''} ${this.state.selectedDevice.telemetry?.networkSpeedMbps ? this.state.selectedDevice.telemetry.networkSpeedMbps+' Mbps' : ''}</li>
                                                </ul>
                                            </div>
                                            <div class="col-md-6">
                                                <h6>Security Status</h6>
                                                ${(() => {
                                                    const summary = this.computeSecuritySummary(this.state.cveInventory);
                                                    return html`
                                                        <div class="mb-2">
                                                            <span class="badge ${summary.badgeClass}">${summary.label}</span>
                                                            <span class="text-muted ms-2">${summary.counts.total} CVEs</span>
                                                        </div>
                                                        <div class="text-muted small">
                                                            <span class="me-2">Critical: ${summary.counts.critical}</span>
                                                            <span class="me-2">High: ${summary.counts.high}</span>
                                                            <span class="me-2">Medium: ${summary.counts.medium}</span>
                                                            <span class="me-2">Low: ${summary.counts.low}</span>
                                                        </div>
                                                    `;
                                                })()}

                                                <h6 class="mt-3">Recent Changes</h6>
                                                ${this.state.telemetryDetail.changes && this.state.telemetryDetail.changes.length > 0 ? html`
                                                    <ul class="list-unstyled text-muted small">
                                                        ${this.state.telemetryDetail.changes.map(change => html`
                                                            <li class="mb-2">
                                                                <div><strong>${new Date(change.at).toLocaleString()}</strong></div>
                                                                <div>
                                                                    ${Object.keys(change.delta).map(k => html`<span class="badge bg-secondary-lt me-2">${k}</span>`)}
                                                                </div>
                                                            </li>
                                                        `)}
                                                    </ul>
                                                ` : html`<div class="text-muted">No significant changes detected</div>`}
                                            </div>
                                        </div>
                                        <div class="mt-4">
                                            <h6>Application Inventory</h6>
                                            ${this.state.inventoryLoading ? html`
                                                <div class="text-muted">Loading application inventory...</div>
                                            ` : this.state.inventoryError ? html`
                                                <div class="alert alert-danger">${this.state.inventoryError}</div>
                                            ` : (() => {
                                                const enriched = this.computeAppStatus(this.state.appInventory);
                                                const filtered = this.filterInventory(enriched, this.state.searchQuery);
                                                return html`
                                                    <div class="table-responsive">
                                                        <table class="table table-sm">
                                                            <thead>
                                                                <tr>
                                                                    <th>App</th>
                                                                    <th>Vendor</th>
                                                                    <th>Version</th>
                                                                    <th>Status</th>
                                                                    <th>Match</th>
                                                                    <th>Last Seen</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                ${filtered.map(a => html`
                                                                    <tr>
                                                                        <td>${a.appName}</td>
                                                                        <td>${a.vendor}</td>
                                                                        <td>${a.version}</td>
                                                                        <td>
                                                                            ${a.status === 'updated' ? html`<span class="badge bg-success-lt">Updated</span>` : a.status === 'uninstalled' ? html`<span class="badge bg-warning-lt">Uninstalled</span>` : html`<span class="badge bg-secondary-lt">Current</span>`}
                                                                        </td>
                                                                        <td>
                                                                            ${a.matchType === 'absolute' ? html`<span class="badge bg-primary-lt">Exact</span>` : a.matchType === 'heuristic' ? html`<span class="badge bg-cyan-lt">Heuristic</span>` : html`<span class="badge bg-muted">None</span>`}
                                                                        </td>
                                                                        <td>${a.lastSeen ? new Date(a.lastSeen).toLocaleString() : ''}</td>
                                                                    </tr>
                                                                `)}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                `;
                                            })()}
                                        </div>
                                        <div class="mt-4">
                                            <h6>Vulnerabilities (CVEs)</h6>
                                            ${this.state.cveInventory && this.state.cveInventory.length > 0 ? html`
                                                <div class="table-responsive">
                                                    <table class="table table-sm">
                                                        <thead>
                                                            <tr>
                                                                <th>App</th>
                                                                <th>Vendor</th>
                                                                <th>CVE</th>
                                                                <th>Severity</th>
                                                                <th>EPSS</th>
                                                                <th>Last Seen</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            ${this.state.cveInventory.map(c => html`
                                                                <tr>
                                                                    <td>${c.appName}</td>
                                                                    <td>${c.vendor}</td>
                                                                    <td><a href="https://nvd.nist.gov/vuln/detail/${c.cveId}" target="_blank" rel="noopener">${c.cveId}</a></td>
                                                                    <td>
                                                                        ${c.severity === 'CRITICAL' ? html`<span class="badge bg-danger-lt">Critical</span>` : c.severity === 'HIGH' ? html`<span class="badge bg-warning-lt">High</span>` : c.severity === 'MEDIUM' ? html`<span class="badge bg-secondary-lt">Medium</span>` : html`<span class="badge bg-muted">Low</span>`}
                                                                    </td>
                                                                    <td>${c.epss ? Number(c.epss).toFixed(2) : (c.score ?? '')}</td>
                                                                    <td>${c.lastSeen ? new Date(c.lastSeen).toLocaleString() : ''}</td>
                                                                </tr>
                                                            `)}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ` : html`<div class="text-muted">No known vulnerabilities for this device</div>`}
                                        </div>
                                        <div class="mt-3">
                                            <h6>Telemetry History</h6>
                                            <div class="table-responsive">
                                                <table class="table table-sm">
                                                    <thead>
                                                        <tr>
                                                            <th>Timestamp</th>
                                                            <th>OS</th>
                                                            <th>CPU</th>
                                                            <th>RAM</th>
                                                            <th>Disk</th>
                                                            <th>Network</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${this.state.telemetryDetail.history.map(s => html`
                                                            <tr>
                                                                <td>${new Date(s.timestamp).toLocaleString()}</td>
                                                                <td>${s.fields.OSEdition || ''} ${s.fields.OSVersion || ''} (${s.fields.FeaturePackVersion || ''})</td>
                                                                <td>${s.fields.CPUName || ''} ${s.fields.CPUCores ? '('+s.fields.CPUCores+' cores)' : ''}</td>
                                                                <td>${s.fields.TotalRAMMB ? Math.round(Number(s.fields.TotalRAMMB)/1024)+' GB' : ''}</td>
                                                                <td>${s.fields.SystemDriveSizeGB ? s.fields.SystemDriveSizeGB+' GB' : ''}</td>
                                                                <td>${s.fields.ConnectionType || ''} ${s.fields.NetworkSpeedMbps ? s.fields.NetworkSpeedMbps+' Mbps' : ''}</td>
                                                            </tr>
                                                        `)}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ` : html`<div class="text-muted">No telemetry</div>`}
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-link link-secondary" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); }}>
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
                ` : ''}
        `;
    }
}
