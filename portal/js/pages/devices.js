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
            deviceFilters: {
                license: 'all',
                connection: 'all',
                spec: 'all'
            },
            deviceSummaries: {}, // cached per-device app/cve counts and score
            inventoryLoading: false,
            inventoryError: null,
            appInventory: [],
            cveInventory: [],
            activeInventoryTab: 'apps',
            highlightedApp: null,
            highlightedCve: null,
            appSort: { key: 'cveCount', direction: 'desc' },
            cveSort: { key: 'severity', direction: 'desc' },
            knownExploits: null,
            exploitsLoadingError: null,
            enrichedScores: {}
        };
        this.orgUnsubscribe = null;
        this.KNOWN_EXPLOITS_CACHE = { data: null, loadedAt: null, TTL_HOURS: 24 };
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
        
        // Try multiple sources for known exploits (fallback chain)
        // Primary: MagenSec's own repository (updated hourly via GitHub Actions)
        const sources = [
            {
                url: 'https://raw.githubusercontent.com/MagenSec/MagenSec.github.io/main/diag/known_exploited_vulnerabilities.json',
                parser: (data) => {
                    // Expected format: { vulnerabilities: [ { cveID, ... }, ... ] }
                    if (data.vulnerabilities && Array.isArray(data.vulnerabilities)) {
                        return new Set(data.vulnerabilities
                            .map(v => v.cveID || v.cveId)
                            .filter(id => id && typeof id === 'string'));
                    }
                    // Fallback: if data itself is an array
                    if (Array.isArray(data)) {
                        return new Set(data
                            .map(v => typeof v === 'string' ? v : (v.cveID || v.cveId))
                            .filter(id => id && typeof id === 'string'));
                    }
                    return null;
                }
            }
        ];
        
        let cveIds = new Set();
        let success = false;
        
        for (const source of sources) {
            try {
                const response = await fetch(source.url, { 
                    cache: 'reload',
                    timeout: 5000
                });
                
                if (!response.ok) {
                    console.debug(`[Devices] Known exploits source ${source.url} returned ${response.status}`);
                    continue;
                }
                
                const data = await response.json();
                const parsed = source.parser(data);
                
                if (parsed && parsed.size > 0) {
                    cveIds = parsed;
                    success = true;
                    console.log(`[Devices] Loaded ${cveIds.size} known exploits from ${source.url}`);
                    break;
                }
            } catch (error) {
                console.debug(`[Devices] Failed to load from ${source.url}:`, error.message);
                continue;
            }
        }
        
        if (success) {
            // Cache for 24 hours
            this.KNOWN_EXPLOITS_CACHE.data = cveIds;
            this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
            this.setState({ knownExploits: cveIds, exploitsLoadingError: null });
        } else {
            // Graceful fallback: use empty set, show warning in console only
            // Device risk scores will use Cloud API baseline without known exploit enrichment
            console.warn('[Devices] Could not load known exploits from any source. Using baseline scores only.');
            this.KNOWN_EXPLOITS_CACHE.data = new Set();
            this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
            this.setState({ knownExploits: new Set(), exploitsLoadingError: 'Using baseline risk scores (known exploits unavailable)' });
        }
    }
    
    // Enrich device scores with risk calculation
    async enrichDeviceScoresAsync(devices, summariesFromApi) {
        const enrichedScores = {};
        
        for (const device of devices) {
            const summary = summariesFromApi[device.id];
            if (summary) {
                const enriched = this.recalculateRiskScore(summary);
                enrichedScores[device.id] = enriched;
            }
        }
        
        this.setState({ enrichedScores });
    }
    
    // Recalculate risk score using Hybrid Model with constituents from API
    recalculateRiskScore(summary) {
        if (!summary || summary.score === undefined) {
            return { score: 0, constituents: null, enrichmentFactors: {} };
        }
        
        // API now provides riskScoreConstituents; use them for client-side calculation
        const constituents = summary.constituents;
        if (!constituents || constituents.cveCount === 0) {
            return { score: summary.score, constituents, enrichmentFactors: {} };
        }
        
        // Base calculation: CVSS × EPSS
        let riskFactor = constituents.maxCvssNormalized * constituents.maxEpssStored;
        
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
            const response = await api.getDevices(currentOrg.orgId, { include: 'summary' }, { skipCache: forceRefresh });
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
                const mapped = {
                    id: device.DeviceId || device.deviceId,
                    name: deviceName,
                    state: (device.state || device.State || 'Unknown'),
                    lastHeartbeat: device.lastHeartbeat,
                    firstHeartbeat: device.firstHeartbeat || device.firstSeen || device.createdAt,
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

                if (summary) {
                    summariesFromApi[mapped.id] = summary;
                }
                return mapped;
            });

            this.setCachedDevices(currentOrg.orgId, devices);
            this.setState(prev => ({ devices, loading: false, deviceSummaries: { ...prev.deviceSummaries, ...summariesFromApi } }));
            
            // Background: Load known exploits and enrich risk scores
            this.loadKnownExploitsAsync();
            this.enrichDeviceScoresAsync(devices, summariesFromApi);
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
        return s === 'active' || s === 'enabled' || s === 'inactive';
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
        this.setState({
            showDeviceModal: true,
            selectedDevice: device,
            telemetryLoading: true,
            telemetryError: null,
            telemetryDetail: null,
            inventoryLoading: true,
            inventoryError: null,
            appInventory: [],
            cveInventory: [],
            activeInventoryTab: 'apps',
            highlightedApp: null,
            highlightedCve: null
        });
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
            this.updateDeviceSummaryCache(device.id, appList, cveList);
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

    // Compute enriched application inventory status and join CVE counts
    computeAppStatus(apps, cves = []) {
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
            const relatedCves = cves.filter(c => (c.appName||'').toLowerCase() === (current.appName||'').toLowerCase());
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
            if (this.isDeviceInactive(d)) stats.offline++; else stats.online++;
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
            const offline = this.isDeviceInactive(device);
            return deviceFilters.connection === 'online' ? !offline : offline;
        };

        return devices
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
    }

    formatAbsolute(dateValue) {
        if (!dateValue) return '—';
        const d = new Date(dateValue);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
        const worstSeverity = (summary.highestRiskBucket || '').toUpperCase() ||
            (summary.criticalCveCount > 0 ? 'CRITICAL' : summary.highCveCount > 0 ? 'HIGH' : summary.mediumCveCount > 0 ? 'MEDIUM' : summary.lowCveCount > 0 ? 'LOW' : 'LOW');
        const derivedWeight = this.severityWeight(worstSeverity);
        const baseScore = summary.riskScore ?? ((summary.cveCount ?? 0) * 2 + derivedWeight * 10);
        return {
            apps: summary.appCount ?? null,
            cves: summary.cveCount ?? null,
            worstSeverity,
            score: Math.min(100, Math.max(0, Math.round(baseScore ?? 0))),
            constituents: summary.riskScoreConstituents || null
        };
    }

    updateDeviceSummaryCache(deviceId, apps, cves) {
        let worstWeight = 0;
        for (const c of cves || []) {
            const weight = this.severityWeight(c.severity);
            if (weight > worstWeight) worstWeight = weight;
        }

        const totalCves = (cves || []).length;
        const appCount = (apps || []).length;
        const worstSev = this.severityLabelFromWeight(worstWeight);
        const score = Math.min(100, Math.max(0, totalCves * 2 + worstWeight * 10));

        this.setState(prev => ({
            deviceSummaries: {
                ...prev.deviceSummaries,
                [deviceId]: {
                    apps: appCount,
                    cves: totalCves,
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

    queueDeviceAction(device, action) {
        // Placeholder for IPC/heartbeat queued commands
        this.showToast(`${action} queued for ${device.name || device.id}`, 'info');
    }

    severityWeight(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 3;
        if (s === 'HIGH') return 2;
        if (s === 'MEDIUM') return 1;
        if (s === 'LOW') return 0.5;
        return 0;
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
            return window.html`<span class="badge bg-danger-lt"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>Vulnerable</span>`;
        }
        if (value === 1) {
            return window.html`<span class="badge bg-warning-lt"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14l-2 10h-10z" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9.5 14h5" /></svg>AI Bot (med)</span>`;
        }
        return window.html`<span class="badge bg-success-lt"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>Clean</span>`;
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

        const filteredDevices = this.getFilteredDevices();
        const stats = this.computeDeviceStats(filteredDevices);

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
                            <div class="card mb-3">
                                <div class="card-body">
                                    <div class="row g-3 align-items-center mb-2">
                                        <div class="col-md-4">
                                            <label class="form-label">Search</label>
                                            <div class="input-icon">
                                                <span class="input-icon-addon">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                                </span>
                                                <input class="form-control" type="text" placeholder="Search by device, CPU, OS" value=${this.state.searchQuery} onInput=${(e) => this.setSearchQuery(e.target.value)} />
                                            </div>
                                        </div>
                                        <div class="col-md-2">
                                            <label class="form-label">License State</label>
                                            <select class="form-select" value=${this.state.deviceFilters.license} onChange=${(e) => this.setDeviceFilter('license', e.target.value)}>
                                                <option value="all">All</option>
                                                <option value="active">Active</option>
                                                <option value="enabled">Enabled</option>
                                                <option value="blocked">Blocked</option>
                                                <option value="deleted">Deleted</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2">
                                            <label class="form-label">Connection</label>
                                            <select class="form-select" value=${this.state.deviceFilters.connection} onChange=${(e) => this.setDeviceFilter('connection', e.target.value)}>
                                                <option value="all">All</option>
                                                <option value="online">Online</option>
                                                <option value="offline">Offline</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2">
                                            <label class="form-label">Spec</label>
                                            <select class="form-select" value=${this.state.deviceFilters.spec} onChange=${(e) => this.setDeviceFilter('spec', e.target.value)}>
                                                <option value="all">Any</option>
                                                <option value="x64">x64</option>
                                                <option value="arm64">ARM64</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 text-end">
                                            <div class="text-muted small">${stats.total} devices · ${stats.active + stats.enabled} licensed · ${stats.online} online</div>
                                            <div class="progress progress-sm">
                                                <div class="progress-bar bg-success" style=${{ width: stats.total ? `${(stats.online / stats.total) * 100}%` : '0%' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="d-flex flex-wrap gap-2">
                                        <span class="badge bg-green-lt">Active ${stats.active}</span>
                                        <span class="badge bg-blue-lt">Enabled ${stats.enabled}</span>
                                        <span class="badge bg-yellow-lt">Offline ${stats.offline}</span>
                                        <span class="badge bg-red-lt">Blocked ${stats.blocked}</span>
                                        <span class="badge bg-secondary-lt">Deleted ${stats.deleted}</span>
                                    </div>
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
                                <div class="card">
                                    <div class="table-responsive">
                                        <table class="table table-vcenter card-table">
                                            <thead>
                                                <tr>
                                                    <th>Device</th>
                                                    <th>License Status</th>
                                                    <th>Connection</th>
                                                    <th>Specs</th>
                                                    <th class="w-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${filteredDevices.map(device => html`
                                                    <tr>
                                                        ${(() => {
                                                            const summary = this.state.deviceSummaries[device.id] || { apps: 0, cves: 0, worstSeverity: 'LOW', score: 0 };
                                                            const enriched = this.state.enrichedScores[device.id];
                                                            const displayScore = enriched?.score !== undefined ? enriched.score : summary.score || 0;
                                                            const isEnriched = enriched && enriched.score !== (summary.score || 0);
                                                            const scoreColor = displayScore >= 80 ? '#d63939' : displayScore >= 60 ? '#f59f00' : displayScore >= 40 ? '#fab005' : '#2fb344';
                                                            const severityBadge = summary.worstSeverity === 'CRITICAL' ? 'bg-danger-lt' : summary.worstSeverity === 'HIGH' ? 'bg-warning-lt' : summary.worstSeverity === 'MEDIUM' ? 'bg-secondary-lt' : 'bg-green-lt';
                                                            const avatarClass = displayScore >= 80 ? 'bg-danger-lt' : displayScore >= 60 ? 'bg-warning-lt' : displayScore >= 40 ? 'bg-info-lt' : 'bg-success-lt';
                                                            return html`
                                                            <td>
                                                                <div class="d-flex py-1 align-items-start">
                                                                    <span class="avatar me-2 ${avatarClass}">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                                                    </span>
                                                                    <div class="flex-fill">
                                                                        <div>
                                                                            <a href="#!/devices/${device.id}" class="font-weight-medium text-decoration-none text-reset" style="cursor: pointer;"><span class="text-primary fw-600">${device.name || device.id}</span></a>
                                                                        </div>
                                                                        ${device.clientVersion ? html`
                                                                            <div class="text-muted small">Version: ${device.clientVersion}</div>
                                                                        ` : ''}
                                                                        <div class="mt-2">
                                                                            <div class="d-flex gap-2">
                                                                                <div class="flex-fill">
                                                                                    <!-- Risk Meter Gauge -->
                                                                                    <div class="text-center">
                                                                                        <div style="position: relative; display: inline-block;">
                                                                                            <svg width="50" height="50" viewBox="0 0 50 50" class="mb-1">
                                                                                                <circle cx="25" cy="25" r="20" fill="none" stroke="#e9ecef" stroke-width="5"/>
                                                                                                <circle cx="25" cy="25" r="20" fill="none" 
                                                                                                    stroke="${scoreColor}" 
                                                                                                    stroke-width="5" 
                                                                                                    stroke-dasharray="${(displayScore / 100 * 125.66).toFixed(2)} 125.66" 
                                                                                                    stroke-linecap="round" 
                                                                                                    transform="rotate(-90 25 25)"/>
                                                                                                <text x="25" y="28" text-anchor="middle" font-size="12" font-weight="bold" fill="${scoreColor}">${displayScore}</text>
                                                                                            </svg>
                                                                                            ${isEnriched ? html`<span class="badge bg-success-lt" style="position: absolute; top: -5px; right: -5px; font-size: 9px;">✓</span>` : ''}
                                                                                        </div>
                                                                                        <div class="text-muted small"><span class="badge ${severityBadge}">${summary.worstSeverity}</span></div>
                                                                                    </div>
                                                                                </div>
                                                                                <div class="flex-fill">
                                                                                    <!-- Apps/CVEs Charts Column -->
                                                                                    <div class="d-flex flex-column gap-2">
                                                                                        <div class="text-center">
                                                                                            <svg width="40" height="40" viewBox="0 0 40 40">
                                                                                                ${(() => {
                                                                                                    // Count apps with CVEs, not total CVEs
                                                                                                    const appsWithCves = this.state.appInventory ? 
                                                                                                        this.state.appInventory.filter(app => 
                                                                                                            this.state.cveInventory && this.state.cveInventory.some(cve => 
                                                                                                                (cve.appName || '').toLowerCase() === (app.appName || '').toLowerCase()
                                                                                                            )
                                                                                                        ).length : 0;
                                                                                                    const totalApps = summary.apps || 1;
                                                                                                    const vulnerable = appsWithCves;
                                                                                                    const angle = (vulnerable / totalApps) * 360;
                                                                                                    const largeArc = angle > 180 ? 1 : 0;
                                                                                                    const x = 20 + 16 * Math.cos((angle - 90) * Math.PI / 180);
                                                                                                    const y = 20 + 16 * Math.sin((angle - 90) * Math.PI / 180);
                                                                                                    return html`
                                                                                                        <circle cx="20" cy="20" r="16" fill="#2fb344"/>
                                                                                                        ${vulnerable > 0 ? html`<path d="M 20 20 L 20 4 A 16 16 0 ${largeArc} 1 ${x} ${y} Z" fill="#d63939"/>` : ''}
                                                                                                        <text x="20" y="24" text-anchor="middle" font-size="10" font-weight="bold" fill="white">${vulnerable}/${totalApps}</text>
                                                                                                    `;
                                                                                                })()}
                                                                                            </svg>
                                                                                            <a href="#" class="text-reset small d-block" onclick=${(e) => { e.preventDefault(); this.openDeviceModal(device); this.setInventoryTab('apps'); }}>
                                                                                                Apps
                                                                                            </a>
                                                                                        </div>
                                                                                        <div class="text-center">
                                                                                            <svg width="40" height="40" viewBox="0 0 40 40">
                                                                                                ${(() => {
                                                                                                    // CVE severity distribution
                                                                                                    const criticalCount = this.state.cveInventory ? this.state.cveInventory.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL').length : 0;
                                                                                                    const highCount = this.state.cveInventory ? this.state.cveInventory.filter(c => (c.severity || '').toUpperCase() === 'HIGH').length : 0;
                                                                                                    const mediumCount = this.state.cveInventory ? this.state.cveInventory.filter(c => (c.severity || '').toUpperCase() === 'MEDIUM').length : 0;
                                                                                                    const lowCount = this.state.cveInventory ? this.state.cveInventory.filter(c => (c.severity || '').toUpperCase() === 'LOW').length : 0;
                                                                                                    const totalCves = criticalCount + highCount + mediumCount + lowCount;
                                                                                                    
                                                                                                    if (totalCves === 0) {
                                                                                                        return html`
                                                                                                            <circle cx="20" cy="20" r="16" fill="#2fb344"/>
                                                                                                            <text x="20" y="24" text-anchor="middle" font-size="10" font-weight="bold" fill="white">0</text>
                                                                                                        `;
                                                                                                    }
                                                                                                    
                                                                                                    let currentAngle = 0;
                                                                                                    const slices = [];
                                                                                                    
                                                                                                    const addSlice = (count, color) => {
                                                                                                        if (count === 0) return;
                                                                                                        const angle = (count / totalCves) * 360;
                                                                                                        const largeArc = angle > 180 ? 1 : 0;
                                                                                                        const startX = 20 + 16 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                                                        const startY = 20 + 16 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                                                        currentAngle += angle;
                                                                                                        const endX = 20 + 16 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                                                        const endY = 20 + 16 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                                                        slices.push(html`<path d="M 20 20 L ${startX} ${startY} A 16 16 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}"/>`);
                                                                                                    };
                                                                                                    
                                                                                                    addSlice(criticalCount, '#d63939');
                                                                                                    addSlice(highCount, '#f59f00');
                                                                                                    addSlice(mediumCount, '#fab005');
                                                                                                    addSlice(lowCount, '#74b816');
                                                                                                    
                                                                                                    return html`
                                                                                                        ${slices}
                                                                                                        <text x="20" y="24" text-anchor="middle" font-size="10" font-weight="bold" fill="white">${totalCves}</text>
                                                                                                    `;
                                                                                                })()}
                                                                                            </svg>
                                                                                            <a href="#" class="text-reset small d-block" onclick=${(e) => { e.preventDefault(); this.openDeviceModal(device); this.setInventoryTab('cves'); }}>
                                                                                                CVEs
                                                                                            </a>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            `;
                                                        })()}
                                                        <td>
                                                            <div class="d-flex flex-column align-items-start gap-1">
                                                                <span class="badge ${this.getStateBadgeClass(device.state)} text-white">${device.state}</span>
                                                                ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? html`
                                                                    <span class="badge bg-warning-lt" title="Update available: v${config.INSTALLERS.ENGINE.VERSION}">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <circle cx="12" cy="12" r="9" />
                                                                            <line x1="12" y1="8" x2="12" y2="12" />
                                                                            <line x1="12" y1="16" x2="12.01" y2="16" />
                                                                        </svg>
                                                                        Update Available
                                                                    </span>
                                                                ` : ''}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div class="text-muted">${this.formatLastSeen(device.lastHeartbeat)}</div>
                                                            ${this.isDeviceInactive(device) ? html`
                                                                <span class="badge bg-danger-lt mt-1">Offline</span>
                                                            ` : html`
                                                                <span class="badge bg-success-lt mt-1">Online</span>
                                                            `}
                                                            ${device.firstHeartbeat ? html`
                                                                <div class="text-muted small">Registered ${this.formatAbsolute(device.firstHeartbeat)}</div>
                                                            ` : ''}
                                                        </td>
                                                        <td>
                                                            ${device.telemetry ? html`
                                                                <div class="text-muted small">
                                                                    <div class="mb-1">
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
                                                                    </div>
                                                                    <div class="mb-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <rect x="3" y="7" width="18" height="10" rx="2" />
                                                                            <path d="M6 7v10" />
                                                                            <path d="M10 7v10" />
                                                                            <path d="M14 7v10" />
                                                                            <path d="M18 7v10" />
                                                                        </svg>
                                                                        ${device.telemetry.totalRamMb ? Math.round(device.telemetry.totalRamMb/1024) + ' GB' : ''}
                                                                    </div>
                                                                    <div class="mb-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <ellipse cx="12" cy="6" rx="8" ry="3"/>
                                                                            <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
                                                                            <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
                                                                        </svg>
                                                                        ${device.telemetry.totalDiskGb ? device.telemetry.totalDiskGb + ' GB' : ''}
                                                                    </div>
                                                                    <div>
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
                                                                    <div class="dropdown-header">Device lifecycle</div>
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
                                                                    ` : ''}
                                                                    <div class="dropdown-divider"></div>
                                                                    <div class="dropdown-header">Response actions</div>
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.queueDeviceAction(device, 'On-demand scan')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></svg>
                                                                        Trigger Scan
                                                                    </button>
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.queueDeviceAction(device, 'Force update')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                                                        Trigger Update
                                                                    </button>
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.queueDeviceAction(device, 'Send message')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 8l9 4l9 -4l-9 -4z" /><path d="M3 8l0 8l9 4l9 -4l0 -8" /><path d="M3 16l9 4l9 -4" /><path d="M12 12l9 -4" /></svg>
                                                                        Send Message
                                                                    </button>
                                                                    <div class="dropdown-divider"></div>
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
                                    <h5 class="modal-title d-flex align-items-center gap-2 flex-wrap">
                                        <span>${this.state.selectedDevice.name}</span>
                                        ${this.state.selectedDevice.state ? window.html`<span class="badge ${this.getStateBadgeClass(this.state.selectedDevice.state)} text-white">${this.state.selectedDevice.state}</span>` : ''}
                                        ${this.state.selectedDevice.licenseKey ? window.html`<span class="badge bg-blue-lt">${this.state.selectedDevice.licenseKey}</span>` : ''}
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
                                        <div class="d-flex flex-wrap gap-3 text-muted small mb-2">
                                            ${(() => {
                                                const firstSeen = this.state.selectedDevice.firstHeartbeat || this.state.selectedDevice.firstSeen || this.state.selectedDevice.createdAt;
                                                const lastSeen = this.state.selectedDevice.lastHeartbeat || this.state.telemetryDetail?.history?.[0]?.timestamp;
                                                return html`
                                                    <div><strong>Last Seen:</strong> ${lastSeen ? this.formatAbsolute(lastSeen) : 'Never'}</div>
                                                    <div><strong>Registered:</strong> ${firstSeen ? this.formatAbsolute(firstSeen) : '—'}</div>
                                                    ${this.state.selectedDevice.licenseKey ? html`<div><strong>License:</strong> ${this.state.selectedDevice.licenseKey}</div>` : ''}
                                                `;
                                            })()}
                                        </div>
                                        <div class="mb-3">
                                            <div class="input-group">
                                                <span class="input-group-text">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                                </span>
                                                <input class="form-control" type="text" placeholder="Search apps, vendors, CVEs" value=${this.state.searchQuery} onInput=${(e) => this.setSearchQuery(e.target.value)} />
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
                                                    const deviceSummary = this.state.deviceSummaries[this.state.selectedDevice.id] || { apps: 0, cves: 0, worstSeverity: 'LOW', score: 0 };
                                                    const vulnerableApps = Math.min(summary.counts.total, deviceSummary.apps || 0);
                                                    const totalApps = deviceSummary.apps || 1;
                                                    return html`
                                                        <div class="d-flex gap-3 mb-3">
                                                            <!-- Risk Gauge -->
                                                            <div class="text-center">
                                                                ${(() => {
                                                                    const enriched = this.state.enrichedScores[this.state.selectedDevice.id];
                                                                    const displayScore = enriched?.score !== undefined ? enriched.score : deviceSummary.score || 0;
                                                                    const scoreColor = displayScore >= 80 ? '#d63939' : displayScore >= 60 ? '#f59f00' : displayScore >= 40 ? '#0054a6' : '#2fb344';
                                                                    const scoreLabel = displayScore >= 80 ? 'CRITICAL' : displayScore >= 60 ? 'HIGH' : displayScore >= 40 ? 'MEDIUM' : 'LOW';
                                                                    const baseScore = deviceSummary.score || 0;
                                                                    const isEnriched = enriched && enriched.score !== baseScore;
                                                                    
                                                                    // Build tooltip with constituents
                                                                    let tooltipText = `Risk Score: ${displayScore}\\n\\n`;
                                                                    if (enriched?.constituents) {
                                                                        const c = enriched.constituents;
                                                                        tooltipText += `Baseline Score: ${baseScore}\\n`;
                                                                        if (c.maxCvssNormalized !== undefined) tooltipText += `Max CVSS: ${c.maxCvssNormalized}\\n`;
                                                                        if (c.maxEpssStored !== undefined) tooltipText += `Max EPSS: ${c.maxEpssStored}\\n`;
                                                                        if (c.cveCount !== undefined) tooltipText += `CVE Count: ${c.cveCount}\\n`;
                                                                        if (enriched.enrichmentFactors?.timeDecay !== undefined) tooltipText += `Time Decay: ${(enriched.enrichmentFactors.timeDecay * 100).toFixed(0)}%\\n`;
                                                                        if (enriched.enrichmentFactors?.exploitFactor !== undefined) tooltipText += `Exploit Factor: ${enriched.enrichmentFactors.exploitFactor.toFixed(2)}x\\n`;
                                                                    } else if (deviceSummary.worstSeverity) {
                                                                        tooltipText += `Severity: ${deviceSummary.worstSeverity}\\n`;
                                                                        tooltipText += `(Waiting for enrichment...)`;
                                                                    }
                                                                    
                                                                    return html`
                                                                        <div style="position: relative;" title="${tooltipText}">
                                                                            <svg width="80" height="80" viewBox="0 0 80 80">
                                                                                <circle cx="40" cy="40" r="32" fill="none" stroke="#e9ecef" stroke-width="8"/>
                                                                                <circle cx="40" cy="40" r="32" fill="none" 
                                                                                    stroke="${scoreColor}" 
                                                                                    stroke-width="8" 
                                                                                    stroke-dasharray="${(displayScore / 100 * 201.06).toFixed(2)} 201.06" 
                                                                                    stroke-linecap="round" 
                                                                                    transform="rotate(-90 40 40)"/>
                                                                                <text x="40" y="46" text-anchor="middle" font-size="20" font-weight="bold" fill="${scoreColor}">${displayScore}</text>
                                                                            </svg>
                                                                            ${isEnriched ? html`<span class="badge bg-success-lt" style="position: absolute; top: 0; right: 0; font-size: 10px;">Updated</span>` : ''}
                                                                        </div>
                                                                    `;
                                                                })()}
                                                                <div class="text-muted small mt-1">Risk Score</div>
                                                                <span class="badge ${summary.badgeClass}">${summary.label}</span>
                                                            </div>
                                                            <!-- App Vulnerability Pie -->
                                                            <div class="text-center">
                                                                <svg width="80" height="80" viewBox="0 0 80 80">
                                                                    ${(() => {
                                                                        const angle = (vulnerableApps / totalApps) * 360;
                                                                        const largeArc = angle > 180 ? 1 : 0;
                                                                        const x = 40 + 32 * Math.cos((angle - 90) * Math.PI / 180);
                                                                        const y = 40 + 32 * Math.sin((angle - 90) * Math.PI / 180);
                                                                        return html`
                                                                            <circle cx="40" cy="40" r="32" fill="#2fb344"/>
                                                                            ${vulnerableApps > 0 ? html`<path d="M 40 40 L 40 8 A 32 32 0 ${largeArc} 1 ${x} ${y} Z" fill="#d63939"/>` : ''}
                                                                            <text x="40" y="46" text-anchor="middle" font-size="16" font-weight="bold" fill="white">${vulnerableApps}/${totalApps}</text>
                                                                        `;
                                                                    })()}
                                                                </svg>
                                                                <div class="text-muted small mt-1">Vulnerable Apps</div>
                                                            </div>
                                                            <!-- CVE Distribution Pie -->
                                                            <div class="text-center">
                                                                <svg width="80" height="80" viewBox="0 0 80 80">
                                                                    ${(() => {
                                                                        const total = summary.counts.total || 1;
                                                                        const critical = summary.counts.critical || 0;
                                                                        const high = summary.counts.high || 0;
                                                                        const medium = summary.counts.medium || 0;
                                                                        const low = summary.counts.low || 0;
                                                                        
                                                                        let currentAngle = 0;
                                                                        const slices = [];
                                                                        
                                                                        const addSlice = (count, color) => {
                                                                            if (count === 0) return;
                                                                            const angle = (count / total) * 360;
                                                                            const largeArc = angle > 180 ? 1 : 0;
                                                                            const startX = 40 + 32 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                            const startY = 40 + 32 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                            currentAngle += angle;
                                                                            const endX = 40 + 32 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                            const endY = 40 + 32 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                            slices.push(html`<path d="M 40 40 L ${startX} ${startY} A 32 32 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}"/>`);
                                                                        };
                                                                        
                                                                        if (total === 0) {
                                                                            slices.push(html`<circle cx="40" cy="40" r="32" fill="#2fb344"/>`);
                                                                        } else {
                                                                            addSlice(critical, '#d63939');
                                                                            addSlice(high, '#f59f00');
                                                                            addSlice(medium, '#fab005');
                                                                            addSlice(low, '#74b816');
                                                                        }
                                                                        
                                                                        return html`
                                                                            ${slices}
                                                                            <text x="40" y="46" text-anchor="middle" font-size="16" font-weight="bold" fill="white">${total}</text>
                                                                        `;
                                                                    })()}
                                                                </svg>
                                                                <div class="text-muted small mt-1">CVE Distribution</div>
                                                            </div>
                                                        </div>
                                                        <div class="text-muted small">
                                                            <div><span class="badge bg-danger-lt me-1"></span>Critical: ${summary.counts.critical}</div>
                                                            <div><span class="badge bg-warning-lt me-1"></span>High: ${summary.counts.high}</div>
                                                            <div><span class="badge bg-yellow-lt me-1"></span>Medium: ${summary.counts.medium}</div>
                                                            <div><span class="badge bg-success-lt me-1"></span>Low: ${summary.counts.low}</div>
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

                                        <div class="mt-3">
                                            <ul class="nav nav-tabs" role="tablist">
                                                <li class="nav-item"><a class="nav-link ${this.state.activeInventoryTab === 'apps' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setInventoryTab('apps'); }}>Applications (${this.state.appInventory.length})</a></li>
                                                <li class="nav-item"><a class="nav-link ${this.state.activeInventoryTab === 'cves' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setInventoryTab('cves'); }}>Risks / CVEs (${this.state.cveInventory.length})</a></li>
                                                <li class="nav-item"><a class="nav-link ${this.state.activeInventoryTab === 'timeline' ? 'active' : ''}" href="#" onclick=${(e) => { e.preventDefault(); this.setInventoryTab('timeline'); }}>Timeline</a></li>
                                            </ul>
                                            <div class="pt-3">
                                                ${this.state.inventoryLoading ? html`<div class="text-muted">Loading inventory...</div>` : this.state.inventoryError ? html`<div class="alert alert-danger">${this.state.inventoryError}</div>` : ''}

                                                ${(!this.state.inventoryLoading && this.state.activeInventoryTab === 'apps') ? (() => {
                                                    const enriched = this.computeAppStatus(this.state.appInventory, this.state.cveInventory);
                                                    const filtered = this.filterInventory(enriched, this.state.searchQuery);
                                                    const sorted = [...filtered].sort((a,b) => {
                                                        const dir = this.state.appSort.direction === 'asc' ? 1 : -1;
                                                        if (this.state.appSort.key === 'cveCount') return (a.cveCount - b.cveCount) * dir;
                                                        if (this.state.appSort.key === 'severity') return (a.worstSeverity - b.worstSeverity) * dir;
                                                        if (this.state.appSort.key === 'lastSeen') return (new Date(a.lastSeen||0) - new Date(b.lastSeen||0)) * dir;
                                                        return (a.appName || '').localeCompare(b.appName || '') * dir;
                                                    });
                                                    return html`
                                                        <div class="table-responsive">
                                                            <table class="table table-sm">
                                                                <thead>
                                                                    <tr>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleAppSort('name'); }}>App</a></th>
                                                                        <th>Vendor</th>
                                                                        <th>Version</th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleAppSort('severity'); }}>Risk / Match</a></th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleAppSort('cveCount'); }}>CVEs</a></th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleAppSort('lastSeen'); }}>Last Seen</a></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${sorted.map(a => html`
                                                                        <tr class="${this.state.highlightedApp === a.appName ? 'table-active' : ''}">
                                                                            <td>${a.appName}</td>
                                                                            <td>${a.vendor}</td>
                                                                            <td>${a.version}</td>
                                                                            <td>
                                                                                <div class="d-flex align-items-center gap-2">
                                                                                    ${a.worstSeverity >= 3 ? html`<span class="badge bg-danger-lt">Critical</span>` : a.worstSeverity >= 2 ? html`<span class="badge bg-warning-lt">High</span>` : a.worstSeverity >= 1 ? html`<span class="badge bg-yellow-lt">Medium</span>` : a.worstSeverity > 0 ? html`<span class="badge bg-info-lt">Low</span>` : html`<span class="badge bg-success-lt">Clean</span>`}
                                                                                    ${(() => {
                                                                                        const normalize = (mt) => {
                                                                                            if (typeof mt === 'number') return mt;
                                                                                            const parsed = Number(mt);
                                                                                            if (!Number.isNaN(parsed)) return parsed;
                                                                                            const s = (mt || '').toString().toLowerCase();
                                                                                            if (s === 'absolute' || s === 'exact') return 2;
                                                                                            if (s === 'heuristic') return 1;
                                                                                            return 0;
                                                                                        };
                                                                                        const value = normalize(a.matchType);
                                                                                        if (value === 2) {
                                                                                            return html`<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm text-danger" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" title="Exact Match"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>`;
                                                                                        }
                                                                                        if (value === 1) {
                                                                                            return html`<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm text-warning" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" title="AI Match (Heuristic)"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14l-2 10h-10z" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9.5 14h5" /></svg>`;
                                                                                        }
                                                                                        return html`<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm text-success" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" title="Clean"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>`;
                                                                                    })()}
                                                                                </div>
                                                                            </td>
                                                                            <td>
                                                                                <a href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeInventoryTab: 'cves', highlightedApp: a.appName }); }}>
                                                                                    ${a.cveCount}
                                                                                </a>
                                                                            </td>
                                                                            <td>${a.lastSeen ? new Date(a.lastSeen).toLocaleString() : ''}</td>
                                                                        </tr>
                                                                    `)}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    `;
                                                })() : ''}

                                                ${(!this.state.inventoryLoading && this.state.activeInventoryTab === 'cves') ? (() => {
                                                    const sortedCves = [...(this.state.cveInventory || [])].sort((a,b) => {
                                                        const dir = this.state.cveSort.direction === 'asc' ? 1 : -1;
                                                        if (this.state.cveSort.key === 'severity') return (this.severityWeight(a.severity) - this.severityWeight(b.severity)) * dir;
                                                        if (this.state.cveSort.key === 'epss') return ((Number(a.epss) || Number(a.EPSS) || 0) - (Number(b.epss) || Number(b.EPSS) || 0)) * dir;
                                                        if (this.state.cveSort.key === 'lastSeen') return (new Date(a.lastSeen||0) - new Date(b.lastSeen||0)) * dir;
                                                        return (a.cveId || '').localeCompare(b.cveId || '') * dir;
                                                    });
                                                    return html`
                                                        <div class="table-responsive">
                                                            <table class="table table-sm">
                                                                <thead>
                                                                    <tr>
                                                                        <th>App</th>
                                                                        <th>Vendor</th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleCveSort('id'); }}>CVE</a></th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleCveSort('severity'); }}>Severity</a></th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleCveSort('epss'); }}>EPSS</a></th>
                                                                        <th><a href="#" onclick=${(e) => { e.preventDefault(); this.toggleCveSort('lastSeen'); }}>Last Seen</a></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${sortedCves.map(c => {
                                                                        const isKnownExploit = this.state.knownExploits && this.state.knownExploits.has(c.cveId);
                                                                        return html`
                                                                        <tr class="${(this.state.highlightedCve === c.cveId || this.state.highlightedApp === c.appName) ? 'table-active' : ''}">
                                                                            <td><a href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeInventoryTab: 'apps', highlightedApp: c.appName, highlightedCve: c.cveId }); }}>${c.appName}</a></td>
                                                                            <td>${c.vendor}</td>
                                                                            <td>
                                                                                <div class="d-flex align-items-center gap-2">
                                                                                    <a href="https://nvd.nist.gov/vuln/detail/${c.cveId}" target="_blank" rel="noopener" onclick=${() => this.setState({ highlightedCve: c.cveId })}>
                                                                                        ${c.cveId}
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm ms-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                                            <path d="M11 7h-5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-5" />
                                                                                            <line x1="10" y1="14" x2="20" y2="4" />
                                                                                            <polyline points="15 4 20 4 20 9" />
                                                                                        </svg>
                                                                                    </a>
                                                                                    ${isKnownExploit ? html`
                                                                                        <span class="badge bg-danger text-white" style="font-size: 0.65rem; padding: 0.2rem 0.4rem;" title="Active exploitation detected in the wild">
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                                                                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                                                            </svg>
                                                                                            KEV
                                                                                        </span>
                                                                                    ` : ''}
                                                                                </div>
                                                                            </td>
                                                                            <td>${c.severity === 'CRITICAL' ? html`<span class="badge bg-danger-lt">Critical</span>` : c.severity === 'HIGH' ? html`<span class="badge bg-warning-lt">High</span>` : c.severity === 'MEDIUM' ? html`<span class="badge bg-secondary-lt">Medium</span>` : html`<span class="badge bg-muted">Low</span>`}</td>
                                                                            <td>
                                                                                ${(() => {
                                                                                    const epss = Number(c.epss || c.EPSS || c.score || 0);
                                                                                    return html`
                                                                                        <div class="d-flex align-items-center">
                                                                                            <div class="progress flex-fill" style="height:6px;">
                                                                                                <div class="progress-bar bg-${epss >= 0.7 ? 'danger' : epss >= 0.4 ? 'warning' : 'success'}" style=${{ width: `${Math.min(100, epss * 100).toFixed(0)}%` }}></div>
                                                                                            </div>
                                                                                            <span class="text-muted small ms-2">${epss ? epss.toFixed(2) : '0.00'}</span>
                                                                                        </div>
                                                                                    `;
                                                                                })()}
                                                                            </td>
                                                                            <td>${c.severity === 'CRITICAL' ? html`<span class="badge bg-danger-lt">Critical</span>` : c.severity === 'HIGH' ? html`<span class="badge bg-warning-lt">High</span>` : c.severity === 'MEDIUM' ? html`<span class="badge bg-secondary-lt">Medium</span>` : html`<span class="badge bg-muted">Low</span>`}</td>
                                                                            <td>
                                                                                ${(() => {
                                                                                    const epss = Number(c.epss || c.EPSS || c.score || 0);
                                                                                    return html`
                                                                                        <div class="d-flex align-items-center">
                                                                                            <div class="progress flex-fill" style="height:6px;">
                                                                                                <div class="progress-bar bg-${epss >= 0.7 ? 'danger' : epss >= 0.4 ? 'warning' : 'success'}" style=${{ width: `${Math.min(100, epss * 100).toFixed(0)}%` }}></div>
                                                                                            </div>
                                                                                            <span class="text-muted small ms-2">${epss ? epss.toFixed(2) : '0.00'}</span>
                                                                                        </div>
                                                                                    `;
                                                                                })()}
                                                                            </td>
                                                                            <td>${c.lastSeen ? new Date(c.lastSeen).toLocaleString() : ''}</td>
                                                                        </tr>
                                                                    `;
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    `;
                                                })() : ''}

                                                ${this.state.activeInventoryTab === 'timeline' ? html`
                                                    <div class="card">
                                                        <div class="card-body">
                                                            <ul class="timeline">
                                                                ${(() => {
                                                                    const firstSeen = this.state.selectedDevice.firstHeartbeat || this.state.selectedDevice.firstSeen || this.state.selectedDevice.createdAt;
                                                                    const lastSeen = this.state.selectedDevice.lastHeartbeat || this.state.telemetryDetail?.history?.[0]?.timestamp;
                                                                    const changes = this.state.telemetryDetail?.changes || [];
                                                                    
                                                                    const events = [];
                                                                    
                                                                    if (firstSeen) {
                                                                        events.push({
                                                                            date: new Date(firstSeen),
                                                                            icon: 'plus',
                                                                            color: 'green',
                                                                            title: 'Device Registered',
                                                                            description: `First seen on ${this.formatAbsolute(firstSeen)}`
                                                                        });
                                                                    }
                                                                    
                                                                    changes.forEach(change => {
                                                                        const delta = change.delta || {};
                                                                        const keys = Object.keys(delta);
                                                                        if (keys.length > 0) {
                                                                            // Format delta values properly, handle objects
                                                                            const formatValue = (v) => {
                                                                                if (v === null || v === undefined) return 'N/A';
                                                                                if (typeof v === 'object') return JSON.stringify(v);
                                                                                return String(v);
                                                                            };
                                                                            const description = keys.map(k => `${k}: ${formatValue(delta[k])}`).join(', ');
                                                                            events.push({
                                                                                date: new Date(change.at),
                                                                                icon: 'settings',
                                                                                color: 'blue',
                                                                                title: 'Hardware Change',
                                                                                description
                                                                            });
                                                                        }
                                                                    });
                                                                    
                                                                    if (lastSeen) {
                                                                        events.push({
                                                                            date: new Date(lastSeen),
                                                                            icon: 'clock',
                                                                            color: 'gray',
                                                                            title: 'Last Activity',
                                                                            description: `Last seen on ${this.formatAbsolute(lastSeen)}`
                                                                        });
                                                                    }
                                                                    
                                                                    events.sort((a, b) => b.date - a.date);
                                                                    
                                                                    return events.map(event => html`
                                                                        <li class="timeline-event">
                                                                            <div class="timeline-event-icon bg-${event.color}-lt">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                                    ${event.icon === 'plus' ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />` : ''}
                                                                                    ${event.icon === 'settings' ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><circle cx="12" cy="12" r="3" />` : ''}
                                                                                    ${event.icon === 'clock' ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />` : ''}
                                                                                </svg>
                                                                            </div>
                                                                            <div class="card timeline-event-card">
                                                                                <div class="card-body">
                                                                                    <div class="text-muted float-end">${event.date.toLocaleString()}</div>
                                                                                    <h4>${event.title}</h4>
                                                                                    <p class="text-muted">${event.description}</p>
                                                                                </div>
                                                                            </div>
                                                                        </li>
                                                                    `);
                                                                })()}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                ` : ''}
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
