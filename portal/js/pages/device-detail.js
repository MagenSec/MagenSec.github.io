/**
 * Device Detail Page - Full device dashboard with perf, inventory, risks, and timeline
 * Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { config } from '../config.js';
import { PiiDecryption } from '../utils/piiDecryption.js';
import { getKevSet } from '../utils/kevCache.js';

export class DeviceDetailPage extends window.Component {
    constructor(props) {
        super(props);
        const rawDeviceId = props.params?.deviceId || (window.location.hash.match(/\/devices\/([^/?]+)/) || [])[1];
        const deviceId = rawDeviceId ? decodeURIComponent(rawDeviceId) : null;

        this.perfCharts = {};

        this.state = {
            deviceId,
            loading: true,
            device: null,
            deviceSummary: null,
            error: null,
            telemetryDetail: null,
            telemetryHistory: [],
            appInventory: [],
            cveInventory: [],
            mitigatedCveInventory: [],
            installers: null,
            timeline: [],
            knownExploits: null,
            exploitsLoadingError: null,
            enrichedScore: null,
            activeTab: 'riskAssessment',
            searchQuery: '',
            cveFilterSeverity: null,
            cveFilterApp: null,
            appSortKey: 'appName',
            appSortDir: 'asc',
            appStatusFilter: 'installed',
            appSummary: null,
            appViewMode: 'vendor',
            expandedVendors: new Set(),
            expandedApps: new Set(),
            deviceSessions: null,
            sessionTab: 'specs',
            sessionExpanded: false,
            sessionLoading: false,
            sessionError: null,
            showAllIps: false,
            showMitigatedCves: false,
            perfData: null,
            perfBucket: '6h',
            perfRangeDays: 7,
            perfLoading: false,
            perfError: null
        };
    }

    componentDidMount() {
        this.loadDeviceData();
    }

    componentDidUpdate(prevProps, prevState) {
        const deviceChanged = prevState.device !== this.state.device;
        const appsChanged = prevState.appInventory !== this.state.appInventory;
        const cvesChanged = prevState.cveInventory !== this.state.cveInventory;
        const summaryChanged = prevState.deviceSummary !== this.state.deviceSummary || prevState.enrichedScore !== this.state.enrichedScore;
        const activeTabChanged = prevState.activeTab !== this.state.activeTab;
        const perfChanged = prevState.perfData !== this.state.perfData;
        const perfFilterChanged = prevState.perfBucket !== this.state.perfBucket || prevState.perfRangeDays !== this.state.perfRangeDays;
        const sessionsChanged = prevState.deviceSessions !== this.state.deviceSessions;
        const sessionTabChanged = prevState.sessionTab !== this.state.sessionTab;
        const sessionExpandedChanged = prevState.sessionExpanded !== this.state.sessionExpanded;
        const perfTabActive = this.state.sessionExpanded && this.state.sessionTab === 'perf';
        const perfTabEntered = perfTabActive && (!prevState.sessionExpanded || prevState.sessionTab !== 'perf');
        if (deviceChanged || appsChanged || cvesChanged || summaryChanged || activeTabChanged) {
            this.renderDetailCharts();
        }
        if (sessionsChanged && this.state.sessionExpanded) {
            this.renderSessionChart();
        }
        if ((sessionTabChanged || sessionExpandedChanged) && this.state.sessionExpanded) {
            this.renderSessionChart();
        }
        if (perfTabEntered && !this.state.perfLoading && !this.state.perfData) {
            this.loadPerfData(this.state.perfBucket, this.state.perfRangeDays);
        }
        if (perfTabActive && (perfChanged || perfFilterChanged || perfTabEntered)) {
            this.renderPerfCharts();
        }
        if ((prevState.sessionTab === 'perf' && this.state.sessionTab !== 'perf') || (prevState.sessionExpanded && !this.state.sessionExpanded)) {
            this.destroyPerfCharts();
        }
    }

    componentWillUnmount() {
        this.destroyDetailCharts();
        this.destroyPerfCharts();
        this.destroySessionChart();
    }

    // Load known exploits via shared KEV cache (local diag first, then GitHub)
    async loadKnownExploitsAsync() {
        try {
            const kevSet = await getKevSet();
            this.setState({ knownExploits: kevSet, exploitsLoadingError: null });
        } catch (error) {
            console.warn('[DeviceDetail] Could not load known exploits:', error.message);
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

    getVersionSessions(summary) {
        if (!summary) return [];
        const candidates = [
            summary.monitoringSessions,
            summary.MonitoringSessions,
            summary.VersionSessions,
            summary.versionSessions,
            summary.Sessions,
            summary.sessions,
            summary.clientVersionSessions,
            summary.ClientVersionSessions
        ];
        const picked = candidates.find((c) => Array.isArray(c) && c.length > 0);
        return Array.isArray(picked) ? picked : [];
    }

    getMonitoringSessions(summary) {
        if (!summary) return [];
        const candidates = [summary.monitoringSessions, summary.MonitoringSessions];
        const picked = candidates.find((c) => Array.isArray(c) && c.length > 0);
        return Array.isArray(picked) ? picked : [];
    }

    getPidSessions(summary) {
        if (!summary) return [];
        const candidates = [summary.pidSessions, summary.PidSessions, summary.sessionsPid, summary.SessionsPid];
        const picked = candidates.find((c) => Array.isArray(c) && c.length > 0);
        return Array.isArray(picked) ? picked : [];
    }

    formatMonitoringLabel(seg) {
        const clientVersion = seg?.clientVersion || seg?.ClientVersion;
        return clientVersion ? `v${clientVersion}` : 'Monitoring';
    }

    calculateRiskScore(device) {
        const fromInventory = () => {
            const cves = this.state?.cveInventory || [];
            if (!Array.isArray(cves) || cves.length === 0) return 0;
            return this.scoreFromCves(cves);
        };

        if (!device || !device.Summary) return fromInventory();

        const summary = typeof device.Summary === 'string' ? JSON.parse(device.Summary) : device.Summary;
        const normalized = this.normalizeSummary(summary);
        const score = normalized?.score ?? 0;

        // If summary shows zero but we have CVEs in inventory, fall back to inventory-based score
        if (!score) {
            return fromInventory();
        }

        return score;
    }

    scoreFromCves(cves) {
        const counts = cves.reduce((acc, c) => {
            const s = String(c.severity || '').toUpperCase();
            if (s === 'CRITICAL') acc.crit += 1;
            else if (s === 'HIGH') acc.high += 1;
            else if (s === 'MEDIUM') acc.med += 1;
            else if (s) acc.low += 1;
            return acc;
        }, { crit: 0, high: 0, med: 0, low: 0 });

        const total = counts.crit + counts.high + counts.med + counts.low;
        const worstWeight = counts.crit > 0 ? this.severityWeight('CRITICAL')
            : counts.high > 0 ? this.severityWeight('HIGH')
            : counts.med > 0 ? this.severityWeight('MEDIUM')
            : counts.low > 0 ? this.severityWeight('LOW')
            : 0;

        return Math.min(100, Math.max(0, total * 2 + worstWeight * 10));
    }

    getRiskScoreValue(summary, deviceFallbackScore = 0) {
        // Normalize various summary shapes to a sane numeric risk score
        const raw = summary
            ? (summary.score ?? summary.riskScore ?? summary.riskScoreNormalized ?? summary.risk ?? 0)
            : deviceFallbackScore;
        const n = Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    }

    getStateBadgeClass(state) {
        const s = this.normalizeState(state);
        switch (s) {
            case 'ACTIVE':
                return 'bg-success';
            case 'DISABLED':
                return 'bg-warning';
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
        switch (s) {
            case 'ACTIVE':
                return 'Active';
            case 'ENABLED':
                return 'Enabled';
            case 'INACTIVE':
                return 'Inactive';
            case 'DISABLED':
                return 'Disabled';
            case 'BLOCKED':
                return 'Blocked';
            case 'DELETED':
                return 'Deleted';
            case 'UNKNOWN':
                return 'Unknown';
            default:
                return s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Unknown';
        }
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

    severityLabelFromWeight(weight) {
        if (weight >= 3) return 'CRITICAL';
        if (weight >= 2) return 'HIGH';
        if (weight >= 1) return 'MEDIUM';
        return 'LOW';
    }

    normalizeSummary(summary) {
        if (!summary) return null;

        const critical = summary.criticalCveCount ?? summary.critical ?? summary.criticalCves ?? 0;
        const high = summary.highCveCount ?? summary.high ?? summary.highCves ?? 0;
        const medium = summary.mediumCveCount ?? summary.medium ?? summary.mediumCves ?? 0;
        const low = summary.lowCveCount ?? summary.low ?? summary.lowCves ?? 0;
        const cveCount = summary.totalCveCount ?? summary.cveCount ?? summary.cves ?? (critical + high + medium + low);
        const vulnerableApps = summary.vulnerableAppCount ?? summary.vulnerableApps ?? null;

        const knownExploitCount = summary.knownExploitCount ?? summary.exploitedCveCount ?? summary.exploitCount ?? 0;
        const knownExploitIds = summary.knownExploitIds ?? summary.exploitedCveIds ?? [];

        const worstSeverity = (summary.highestRiskBucket || '').toUpperCase()
            || (critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : medium > 0 ? 'MEDIUM' : low > 0 ? 'LOW' : 'LOW');
        const derivedWeight = this.severityWeight(worstSeverity);

        const baseScore = summary.riskScore
            ?? summary.score
            ?? summary.riskScoreNormalized
            ?? summary.risk
            ?? (cveCount ? (cveCount * 2 + derivedWeight * 10) : 0);

        const baseConstituents = summary.riskScoreConstituents || summary.constituents || {};
        let cveIds = (summary.cveIds || summary.topCveIds || summary.recentCveIds || []).filter(Boolean);
        if ((!cveIds || cveIds.length === 0) && Array.isArray(summary.cves)) {
            cveIds = summary.cves
                .map(c => c?.cveId || c?.cveID)
                .filter(id => typeof id === 'string' && id.length > 0);
        }

        const maxCvssNormalized = summary.maxCvssNormalized
            ?? summary.maxCvss
            ?? summary.highestCvssNormalized
            ?? summary.highestCvss
            ?? baseConstituents.maxCvssNormalized
            ?? baseConstituents.maxCvss;

        return {
            apps: summary.appCount ?? summary.apps ?? null,
            cves: cveCount ?? null,
            vulnerableApps,
            criticalCves: critical,
            highCves: high,
            mediumCves: medium,
            lowCves: low,
            worstSeverity,
            score: Math.min(100, Math.max(0, Math.round(baseScore ?? 0))),
            constituents: {
                ...baseConstituents,
                knownExploitCount,
                knownExploitIds,
                cveIds,
                maxCvssNormalized,
                cveCount
            }
        };
    }

    async loadDeviceData() {
        try {
            this.setState({ loading: true, error: null, perfLoading: false, perfError: null, perfData: null });
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                throw new Error('No organization selected');
            }

            if (!this.state.deviceId) {
                throw new Error('Invalid device id');
            }

            // USE UNIFIED DEVICE DETAIL ENDPOINT (reduces 4 API calls → 1 call)
            // Fetch device + telemetry + apps + cves in single call
            const detailResp = await api.getDeviceDetailUnified(currentOrg.orgId, this.state.deviceId, {
                include: 'telemetry,apps,cves',
                telemetryHistoryDays: 365,
                telemetryHistoryLimit: 100,
                appLimit: 1000,
                cveLimit: 500
            });

            if (!detailResp.success) {
                throw new Error(detailResp.message || 'Failed to load device detail');
            }

            const { device: deviceData, telemetry: telemetryData, apps: appsData, cves: cvesData } = detailResp.data;

            // Decrypt PII fields from device
            const decryptedDevice = {
                ...deviceData,
                DeviceName: PiiDecryption.decryptIfEncrypted(deviceData.DeviceName || deviceData.deviceName || ''),
                deviceName: PiiDecryption.decryptIfEncrypted(deviceData.DeviceName || deviceData.deviceName || ''),
                // Ensure FirstHeartbeat is available for Registered date display
                FirstHeartbeat: deviceData.FirstHeartbeat || deviceData.firstHeartbeat || deviceData.RegisteredAt || deviceData.registeredAt
            };

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

            // Decrypt app inventory fields
            const appPayload = appsData?.items || appsData || [];
            const normalizedApps = this.computeAppStatus(appPayload);
            const backendSummary = appsData?.summary || {};
            const computedSummary = {
                total: normalizedApps.length,
                installed: normalizedApps.filter(a => (a.status || '').toLowerCase() === 'installed').length,
                updated: normalizedApps.filter(a => (a.status || '').toLowerCase() === 'updated').length,
                uninstalled: normalizedApps.filter(a => (a.status || '').toLowerCase() === 'uninstalled').length
            };
            const appSummary = {
                total: backendSummary.total ?? backendSummary.appCount ?? backendSummary.count ?? computedSummary.total,
                installed: backendSummary.installed ?? backendSummary.installedCount ?? computedSummary.installed,
                updated: backendSummary.updated ?? backendSummary.updatedCount ?? computedSummary.updated,
                uninstalled: backendSummary.uninstalled ?? backendSummary.uninstalledCount ?? computedSummary.uninstalled
            };
            const appList = appPayload.map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || x.appVendor || ''),
                    version: x.applicationVersion || x.ApplicationVersion,
                    matchType: x.matchType || x.MatchType,
                    isInstalled: x.isInstalled ?? x.IsInstalled,
                    lastSeen: x.lastSeen || x.LastSeen,
                    firstSeen: x.firstSeen || x.FirstSeen
                }));

            // Process CVE data from unified response
            const cvePayload = cvesData?.items || cvesData?.cves || cvesData || [];
            const mitigatedCvePayload = cvesData?.mitigatedCves || [];
                
            const cveList = cvePayload.map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || x.appVendor || ''),
                    cveId: x.cveId || x.CveId,
                    severity: x.severity || x.Severity,
                    epss: x.epssProbability || x.epss || x.EPSS,
                    score: x.cvssScore || x.score || x.Score || x.cvss,
                    lastSeen: x.lastDetected || x.lastSeen || x.LastSeen,
                    appStatus: x.appStatus || 'installed',
                    appRowKey: x.appRowKey || x.rowKey || ''
                }));
                
            const mitigatedCveList = mitigatedCvePayload.map(x => ({
                    appName: PiiDecryption.decryptIfEncrypted(x.appName || x.AppName || ''),
                    vendor: PiiDecryption.decryptIfEncrypted(x.vendor || x.AppVendor || x.appVendor || ''),
                    cveId: x.cveId || x.CveId,
                    severity: x.severity || x.Severity,
                    epss: x.epssProbability || x.epss || x.EPSS,
                    score: x.cvssScore || x.score || x.Score || x.cvss,
                    lastSeen: x.lastDetected || x.lastSeen || x.LastSeen,
                    appStatus: x.appStatus || 'updated',
                    appRowKey: x.appRowKey || x.rowKey || ''
                }));

            // Build timeline from telemetry changes
            const timeline = this.buildTimeline(telemetryData);

            // Extract device summary for risk scoring
            const summary = decryptedDevice.summary || decryptedDevice.Summary;
            let deviceSummary = null;
            if (summary) {
                const summaryData = typeof summary === 'string' ? JSON.parse(summary) : summary;
                deviceSummary = this.normalizeSummary(summaryData);
            }

            // Deduplicate CVEs by cveId + appRowKey (prevent duplicate entries)
            const uniqueCves = Array.from(
                new Map(cveList.map(c => [`${c.cveId}|${c.appRowKey}`, c])).values()
            );
            const uniqueMitigatedCves = Array.from(
                new Map(mitigatedCveList.map(c => [`${c.cveId}|${c.appRowKey}`, c])).values()
            );

            this.setState({
                device: decryptedDevice,
                telemetryDetail: telemetryData,
                appInventory: appList,
                appSummary,
                cveInventory: uniqueCves,
                mitigatedCveInventory: uniqueMitigatedCves,
                telemetryHistory: telemetryData?.history || [],
                timeline,
                deviceSummary,
                deviceSessions: null,
                loading: false,
                showAllIps: false,
                appStatusFilter: 'installed'
            });
            this.destroySessionChart();
            
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

    async loadPerfData(bucket, rangeDays) {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ perfError: 'No organization selected', perfData: null, perfLoading: false });
            return;
        }

        if (!this.state.deviceId) {
            this.setState({ perfError: 'Invalid device id', perfData: null, perfLoading: false });
            return;
        }

        const endUtc = new Date();
        const startUtc = new Date(endUtc.getTime() - (Number(rangeDays) || 1) * 24 * 60 * 60 * 1000);

        this.setState({ perfLoading: true, perfError: null });
        try {
            const perfResp = await api.get(
                `/api/v1/orgs/${currentOrg.orgId}/devices/${this.state.deviceId}/perf`,
                {
                    bucket: bucket || '1h',
                    startUtc: startUtc.toISOString(),
                    endUtc: endUtc.toISOString()
                }
            );

            if (perfResp.success && perfResp.data) {
                const perfData = this.normalizePerfAggregation(perfResp.data);
                this.setState({ perfData, perfError: null, perfLoading: false });
            } else {
                this.setState({
                    perfError: perfResp.message || perfResp.error || 'Failed to load performance data',
                    perfData: null,
                    perfLoading: false
                });
            }
        } catch (err) {
            console.warn('[DeviceDetail] Perf aggregation failed:', err);
            this.setState({ perfError: err.message || 'Failed to load performance data', perfData: null, perfLoading: false });
        }
    }

    // Normalize backend perf aggregation payload into a stable, camelCase structure the charts expect
    normalizePerfAggregation(raw) {
        const toNumber = (val, fallback = null) => {
            const n = Number(val);
            return Number.isFinite(n) ? n : fallback;
        };

        const toIso = (val) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'number' && Number.isFinite(val)) return new Date(val).toISOString();
            const d = new Date(val);
            return Number.isFinite(d.getTime()) ? d.toISOString() : null;
        };

        const norm = {
            orgId: raw?.orgId || raw?.OrgId || null,
            deviceId: raw?.deviceId || raw?.DeviceId || null,
            bucketMinutes: toNumber(raw?.bucketMinutes ?? raw?.BucketMinutes, 360),
            startUtc: toIso(raw?.startUtc || raw?.StartUtc),
            endUtc: toIso(raw?.endUtc || raw?.EndUtc),
            computedUtc: toIso(raw?.computedUtc || raw?.ComputedUtc),
            sampleCount: toNumber(raw?.sampleCount ?? raw?.SampleCount, 0),
            status: raw?.status || raw?.Status || null,
            fromCache: Boolean(raw?.fromCache ?? raw?.FromCache),
            isFresh: Boolean(raw?.isFresh ?? raw?.IsFresh),
            points: []
        };

        const rawPoints = Array.isArray(raw?.points)
            ? raw.points
            : Array.isArray(raw?.Points)
                ? raw.Points
                : [];

        norm.points = rawPoints
            .map((p) => {
                const bucket = p.bucketStartUtc || p.BucketStartUtc || p.timestamp || p.Timestamp || p.startUtc || p.StartUtc;
                const bucketIso = toIso(bucket);
                return {
                    bucketStartUtc: bucketIso,
                    bucketUtc: bucketIso,
                    startUtc: bucketIso,
                    samples: toNumber(p.samples ?? p.Samples ?? p.sampleCount ?? p.SampleCount, 0),
                    cpuAvg: toNumber(p.cpuAvg ?? p.CpuAvg),
                    memoryAvg: toNumber(p.memoryAvg ?? p.MemoryAvg),
                    memoryAvgMb: toNumber(p.memoryAvgMb ?? p.MemoryAvgMb),
                    diskTotalMbAvg: toNumber(p.diskTotalMbAvg ?? p.diskAvg ?? p.DiskAvg ?? p.DiskTotalMbAvg),
                    diskAppMbAvg: toNumber(p.diskAppMbAvg ?? p.DiskAppMbAvg),
                    diskIntelMbAvg: toNumber(p.diskIntelMbAvg ?? p.DiskIntelMbAvg),
                    networkMbpsAvg: toNumber(p.networkMbpsAvg ?? p.networkAvg ?? p.NetworkAvg ?? p.networkMbps ?? p.NetworkMbps),
                    networkBytesSent: toNumber(p.networkBytesSent ?? p.NetworkBytesSent),
                    networkBytesReceived: toNumber(p.networkBytesReceived ?? p.NetworkBytesReceived),
                    networkRequests: toNumber(p.networkRequests ?? p.NetworkRequests),
                    networkFailures: toNumber(p.networkFailures ?? p.NetworkFailures)
                };
            })
            .filter((p) => p.bucketStartUtc)
            .sort((a, b) => new Date(a.bucketStartUtc).getTime() - new Date(b.bucketStartUtc).getTime());

        if (!norm.sampleCount) {
            norm.sampleCount = norm.points.reduce((sum, p) => sum + (toNumber(p.samples, 0) || 0), 0);
        }

        return norm;
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
        // Group by appName to ensure only the newest version shows as installed
        const groups = new Map();
        const normalizeDate = (d) => {
            const dt = d ? new Date(d) : null;
            return dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : 0;
        };

        for (const app of apps) {
            const key = (app.appName || '').toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(app);
        }

        const result = [];

        groups.forEach((entries) => {
            // Sort newest first by firstSeen then lastSeen
            const sorted = entries.slice().sort((a, b) => {
                const aFirst = normalizeDate(a.firstSeen || a.FirstSeen);
                const bFirst = normalizeDate(b.firstSeen || b.FirstSeen);
                if (bFirst !== aFirst) return bFirst - aFirst;
                const aLast = normalizeDate(a.lastSeen || a.LastSeen);
                const bLast = normalizeDate(b.lastSeen || b.LastSeen);
                return bLast - aLast;
            });

            sorted.forEach((app, idx) => {
                // Prefer backend-provided status, fall back to local heuristics
                let status = (app.status || app.Status || '').toString().toLowerCase();

                if (!status) {
                    status = 'installed';
                    if (app.matchType === 'absolute' || app.matchType === 'Absolute') {
                        if (app.lastSeen) {
                            const daysSinceLastSeen = (Date.now() - new Date(app.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
                            if (daysSinceLastSeen > 30 && app.isInstalled === false) {
                                status = 'uninstalled';
                            }
                        }
                    }
                    if (app.matchType === 'heuristic' || app.matchType === 'Heuristic') {
                        status = 'updated';
                    }
                }

                // Normalize to expected values
                if (status !== 'updated' && status !== 'uninstalled') {
                    status = 'installed';
                }

                // Any non-latest version in the group should be marked uninstalled/updated
                if (idx > 0) {
                    status = 'uninstalled';
                }

                result.push({ ...app, status });
            });
        });

        return result;
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

    getCvesByApp(appRowKey) {
        // CVEs are linked to apps via appRowKey field extracted from CVE RowKey
        if (!appRowKey) return [];
        return this.state.cveInventory.filter(c => 
            c.appRowKey && c.appRowKey === appRowKey
        );
    }

    getSeverityStyles(severity) {
        const styles = {
            CRITICAL: { fill: 'bg-danger text-white', outline: 'btn-outline-danger' },
            HIGH: { fill: 'bg-orange text-white', outline: 'btn-outline-orange' },
            MEDIUM: { fill: 'bg-yellow text-dark', outline: 'btn-outline-yellow' },
            LOW: { fill: 'bg-lime text-dark', outline: 'btn-outline-lime' },
            CLEAN: { fill: 'bg-secondary text-white', outline: 'btn-outline-secondary' }
        };

        const key = severity?.toUpperCase?.() || 'CLEAN';
        return styles[key] || styles.CLEAN;
    }

    getSeverityColor(severity) {
        return this.getSeverityStyles(severity).fill;
    }

    getSeverityOutlineClass(severity) {
        return this.getSeverityStyles(severity).outline;
    }

    classifyDetectionSource(cve) {
        const source = (cve?.detectionMethod || cve?.howFound || cve?.source || cve?.detectedBy || '').toString().toLowerCase();
        if (source.includes('ai') || source.includes('heur')) return 'ai';
        return 'db';
    }

    getDetectionBuckets(cves = []) {
        const buckets = { db: { count: 0, highest: null }, ai: { count: 0, highest: null } };
        (cves || []).forEach((cve) => {
            const key = this.classifyDetectionSource(cve);
            const sev = (cve?.severity || '').toUpperCase();
            const bucket = buckets[key] || buckets.db;
            bucket.count += 1;
            const currentWeight = this.severityWeight(bucket.highest);
            if (this.severityWeight(sev) > currentWeight) {
                bucket.highest = sev;
            }
            buckets[key] = bucket;
        });
        return buckets;
    }

    renderDetectionButtons(buckets, options = {}) {
        const { html } = window;
        const size = options.size === 'sm' ? 'sm' : 'md';
        const onClick = options.onClick;
        const showLabels = options.showLabels !== false;
        const keys = ['db', 'ai'];

        const iconFor = (key) => key === 'db'
            ? html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.657 3.582 3 8 3s8 -1.343 8 -3v-6" /><path d="M4 12v6c0 1.657 3.582 3 8 3s8 -1.343 8 -3v-6" /></svg>`
            : html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 9a3 3 0 0 1 6 0v1a3 3 0 0 1 0 6v1a3 3 0 0 1 -6 0v-1a3 3 0 0 1 0 -6z" /><path d="M9 12v1" /><path d="M12 7v1" /><path d="M15 12v1" /><path d="M12 17v1" /></svg>`;

        const labelFor = (key) => key === 'db' ? 'Database matches' : 'AI heuristic matches';
        const tooltipFor = (key) => key === 'db'
            ? 'Database match: high confidence signatures from advisories'
            : 'AI heuristic: behavior-based confidence';

        return html`
            <div class="d-flex flex-wrap gap-2">
                ${keys.map(key => {
                    const data = buckets?.[key] || { count: 0, highest: null };
                    const outlineClass = this.getSeverityOutlineClass(data.highest);
                    const badgeClass = this.getSeverityColor(data.highest);
                    return html`
                        <button class="btn ${outlineClass} ${size === 'sm' ? 'btn-sm' : ''} d-flex align-items-center gap-2" title=${tooltipFor(key)} onclick=${(e) => { e.preventDefault(); if (onClick) onClick(key); }}>
                            ${iconFor(key)}
                            ${showLabels ? html`<span>${labelFor(key)}</span>` : ''}
                            <span class="badge ${badgeClass}">${data.count || 0}</span>
                        </button>
                    `;
                })}
            </div>
        `;
    }

    scrollToCveTable() {
        const el = document.getElementById('cve-table');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    scrollToAppsTable() {
        const el = document.getElementById('apps-table');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Filter CVEs based on app installation status for accurate risk scoring
    getActiveApps() {
        return this.state.appInventory.filter(app => {
            const status = (app.status || '').toLowerCase();
            // Keep installed and updated apps (updated = upgraded but still has CVE coverage)
            return status === 'installed' || status === 'updated';
        });
    }

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

    getActiveCves() {
        const activeAppNames = new Set(
            this.getActiveApps().map(app => this.normalizeAppName(app.appName))
        );
        return this.state.cveInventory.filter(cve => {
            const cveAppName = this.normalizeAppName(cve.appName);
            return activeAppNames.has(cveAppName);
        });
    }

    getMitigatedCves() {
        // Prefer API-provided mitigated CVEs (from backend computation with AppStatus)
        if (this.state.mitigatedCveInventory && this.state.mitigatedCveInventory.length > 0) {
            return this.state.mitigatedCveInventory;
        }
        
        // Fallback to client-side computation for backward compatibility
        const activeAppNames = new Set(
            this.getActiveApps().map(app => this.normalizeAppName(app.appName))
        );
        return this.state.cveInventory.filter(cve => {
            const cveAppName = this.normalizeAppName(cve.appName);
            return !activeAppNames.has(cveAppName);
        });
    }

    getMitigationStats() {
        const mitigated = this.getMitigatedCves();
        const uninstalledApps = this.state.appInventory.filter(app => 
            (app.status || '').toLowerCase() === 'uninstalled'
        );
        
        const bySeverity = {
            critical: mitigated.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL').length,
            high: mitigated.filter(c => (c.severity || '').toUpperCase() === 'HIGH').length,
            medium: mitigated.filter(c => (c.severity || '').toUpperCase() === 'MEDIUM').length,
            low: mitigated.filter(c => (c.severity || '').toUpperCase() === 'LOW').length
        };

        return {
            totalMitigated: mitigated.length,
            mitigatedApps: uninstalledApps.length,
            bySeverity,
            mitigatedCves: mitigated
        };
    }

    // Derive last scan time from app telemetry when heartbeat doesn't have it
    deriveLastScanTime() {
        const heartbeatScan = this.state.telemetryDetail?.latest?.fields?.LastScanEnd 
            || this.state.telemetryDetail?.latest?.fields?.LastScanStart;
        
        if (heartbeatScan) {
            return new Date(heartbeatScan);
        }

        // Fallback: Use median of recent app LastSeen timestamps (top 5 most recent)
        const appTimestamps = this.state.appInventory
            .map(app => app.lastSeen || app.LastSeen)
            .filter(ts => ts && !isNaN(new Date(ts).getTime()))
            .map(ts => new Date(ts).getTime())
            .sort((a, b) => b - a)
            .slice(0, 5);

        if (appTimestamps.length === 0) return null;

        // Return median to avoid outliers
        const mid = Math.floor(appTimestamps.length / 2);
        return new Date(appTimestamps[mid]);
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

    formatNetworkSpeed(mbps) {
        const val = Number(mbps || 0);
        if (!val || isNaN(val)) return '';
        if (val >= 1000) {
            const gbps = Math.round((val / 1000) * 10) / 10;
            return `@ ${gbps.toFixed(1)} Gbps`;
        }
        return `@ ${Math.round(val)} Mbps`;
    }

    formatBytesHuman(bytes) {
        const n = Number(bytes) || 0;
        const abs = Math.abs(n);
        if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
        if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
        if (abs >= 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${Math.round(n)} B`;
    }

    formatIPAddresses(ipArray, mode = 'primary') {
        if (!ipArray || !Array.isArray(ipArray) || ipArray.length === 0) {
            return mode === 'primary' ? 'No IP' : [];
        }
        
        if (mode === 'primary') {
            // Primary IP only; "Show all" control reveals the full list
            return ipArray[0];
        }
        
        // Full list mode
        return ipArray;
    }

    escapeHtml(value) {
        const s = value === null || value === undefined ? '' : String(value);
        return s
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    buildDeviceReportModel() {
        const currentOrg = orgContext.getCurrentOrg();
        const device = this.state.device || {};
        const telemetryDetail = this.state.telemetryDetail || {};
        const latestFields = telemetryDetail?.latest?.fields || {};

        const telemetry = device?.telemetry || device?.Telemetry;
        const ipRaw = telemetry?.ipAddresses || telemetry?.IPAddresses || latestFields.IPAddresses || latestFields.ipAddresses;
        const ipAddresses = (() => {
            if (Array.isArray(ipRaw)) return ipRaw;
            if (typeof ipRaw === 'string') {
                try {
                    const parsed = JSON.parse(ipRaw);
                    if (Array.isArray(parsed)) return parsed;
                } catch (err) { /* fall through */ }
                return ipRaw.split(/[;\,\s]+/).filter(Boolean);
            }
            return [];
        })();

        const mobileStatus = this.detectMobileDevice(telemetryDetail?.history);
        const networkRisk = this.analyzeNetworkRisk(ipAddresses, telemetryDetail?.history);

        const cves = Array.isArray(this.state.cveInventory) ? this.state.cveInventory : [];
        const apps = Array.isArray(this.state.appInventory) ? this.state.appInventory : [];

        const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
        for (const cve of cves) {
            const sev = String(cve?.severity || '').toUpperCase();
            if (sev === 'CRITICAL') bySeverity.CRITICAL++;
            else if (sev === 'HIGH') bySeverity.HIGH++;
            else if (sev === 'MEDIUM') bySeverity.MEDIUM++;
            else if (sev === 'LOW') bySeverity.LOW++;
            else bySeverity.UNKNOWN++;
        }

        const knownExploitCount = this.state.knownExploits
            ? cves.filter(c => this.state.knownExploits.has(c.cveId)).length
            : 0;

        const updateAvailable = (() => {
            const dv = device.ClientVersion || device.clientVersion;
            return dv && this.isVersionOutdated(dv);
        })();

        const nowIso = new Date().toISOString();

        // Top vulnerable apps (by CVE count, then worst severity)
        const appToCves = new Map();
        for (const cve of cves) {
            const name = (cve?.appName || '').toString().trim();
            if (!name) continue;
            if (!appToCves.has(name)) appToCves.set(name, []);
            appToCves.get(name).push(cve);
        }
        const topApps = Array.from(appToCves.entries())
            .map(([appName, list]) => {
                const worst = Math.max(...list.map(x => this.severityWeight(x?.severity)), 0);
                const worstSeverity = this.severityLabelFromWeight(worst);
                return {
                    appName,
                    cveCount: list.length,
                    worstSeverity
                };
            })
            .sort((a, b) => (b.cveCount - a.cveCount) || (this.severityWeight(b.worstSeverity) - this.severityWeight(a.worstSeverity)) || a.appName.localeCompare(b.appName))
            .slice(0, 15);

        // Top CVEs (by severity weight, then id)
        const topCves = cves
            .slice()
            .sort((a, b) => {
                const aw = this.severityWeight(a?.severity);
                const bw = this.severityWeight(b?.severity);
                if (bw !== aw) return bw - aw;
                return String(a?.cveId || '').localeCompare(String(b?.cveId || ''));
            })
            .slice(0, 25)
            .map(c => ({
                cveId: c.cveId,
                severity: c.severity,
                appName: c.appName,
                isPatched: c.isPatched
            }));

        const summaryScore = this.getRiskScoreValue(this.state.deviceSummary, this.calculateRiskScore(device));

        const recommendations = [];
        if (updateAvailable) {
            recommendations.push(`Update device client to v${config.INSTALLERS.ENGINE.VERSION}.`);
        }
        if ((device.State || device.state || '').toString().toUpperCase() !== 'ACTIVE') {
            recommendations.push('Validate license/device state and re-register if needed.');
        }
        if (networkRisk?.publicIpPresent) {
            recommendations.push('Reduce network exposure: avoid public IPs where possible; enforce firewalling/VPN.')
        }
        if (networkRisk?.apipaPresent) {
            recommendations.push('Investigate network misconfiguration (APIPA addresses detected).');
        }
        if (knownExploitCount > 0) {
            recommendations.push('Prioritize remediation for CVEs with known public exploitation.');
        }
        if (bySeverity.CRITICAL > 0) {
            recommendations.push('Prioritize patching for CRITICAL vulnerabilities.');
        }
        if (cves.length === 0) {
            recommendations.push('No CVEs detected in current inventory. Continue monitoring.');
        }

        return {
            reportType: 'DeviceSecurityReport',
            reportVersion: 1,
            generatedAtUtc: nowIso,
            org: {
                orgId: currentOrg?.orgId || null,
                name: currentOrg?.name || null
            },
            device: {
                deviceId: device.DeviceId || device.deviceId || null,
                deviceName: device.DeviceName || device.deviceName || null,
                state: device.State || device.state || null,
                clientVersion: device.ClientVersion || device.clientVersion || null,
                firstHeartbeat: device.FirstHeartbeat || device.firstHeartbeat || null,
                lastHeartbeat: device.LastHeartbeat || device.lastHeartbeat || null
            },
            telemetry: {
                latestTimestamp: telemetryDetail?.latest?.timestamp || null,
                currentUser: (() => {
                    const encoded = latestFields.UserName || latestFields.Username || latestFields.userName || latestFields.LoggedOnUser || latestFields.CurrentUser || null;
                    const u = encoded ? PiiDecryption.decryptIfEncrypted(String(encoded)) : null;
                    return u ? String(u) : null;
                })(),
                ipAddresses,
                mobile: mobileStatus?.isMobile || false,
                uniqueIpCount: mobileStatus?.uniqueIpCount || 0,
                publicIpPresent: !!networkRisk?.publicIpPresent,
                apipaPresent: !!networkRisk?.apipaPresent,
                hardware: {
                    cpuName: latestFields.CPUName || null,
                    cpuCores: latestFields.CPUCores || null,
                    cpuArch: latestFields.CPUArch || null,
                    totalRamMb: latestFields.TotalRAMMB || null,
                    systemDriveSizeGb: latestFields.SystemDriveSizeGB || latestFields.TotalDiskGb || null,
                    systemDiskMediaType: latestFields.SystemDiskMediaType || null,
                    systemDiskBusType: latestFields.SystemDiskBusType || null,
                    gpuName: latestFields.GPUName || null
                },
                os: {
                    edition: latestFields.OSEdition || null,
                    version: latestFields.OSVersion || null,
                    build: latestFields.FeaturePackVersion || latestFields.OSBuild || null
                }
            },
            inventory: {
                appsTotal: apps.length,
                cvesTotal: cves.length,
                cvesBySeverity: bySeverity,
                knownExploitCount,
                topVulnerableApps: topApps,
                topCves
            },
            risk: {
                riskScore: summaryScore,
                model: 'PortalSummaryScore'
            },
            sessions: this.state.deviceSessions || null,
            timeline: Array.isArray(this.state.timeline) ? this.state.timeline.slice(0, 20) : [],
            perf: this.state.perfData || null,
            recommendations
        };
    }

    generateDeviceReportHtml(model) {
        const titleDevice = model?.device?.deviceName || model?.device?.deviceId || 'Device';
        const safeTitle = this.escapeHtml(titleDevice);
        const safeOrg = this.escapeHtml(model?.org?.name || model?.org?.orgId || '');
        const safeGenerated = this.escapeHtml(model?.generatedAtUtc || '');
        const safeState = this.escapeHtml(model?.device?.state || '');
        const safeVersion = this.escapeHtml(model?.device?.clientVersion || '');
        const safeRisk = this.escapeHtml(model?.risk?.riskScore ?? '');

        const ipList = Array.isArray(model?.telemetry?.ipAddresses) ? model.telemetry.ipAddresses : [];
        const topApps = Array.isArray(model?.inventory?.topVulnerableApps) ? model.inventory.topVulnerableApps : [];
        const topCves = Array.isArray(model?.inventory?.topCves) ? model.inventory.topCves : [];
        const recommendations = Array.isArray(model?.recommendations) ? model.recommendations : [];
        const timeline = Array.isArray(model?.timeline) ? model.timeline : [];

        const jsonBlock = this.escapeHtml(JSON.stringify(model, null, 2));

        const c = model?.inventory?.cvesBySeverity || {};

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MagenSec Device Security Report - ${safeTitle}</title>
  <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    h2 { margin: 24px 0 10px; font-size: 16px; }
        .muted { font-size: 12px; opacity: 0.75; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }
        .card { border: 1px solid; border-radius: 8px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
        th { font-weight: 600; }
    ul { margin: 8px 0 0 18px; }
        pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; padding: 10px; border: 1px solid; border-radius: 8px; }
    @media print { body { margin: 0.5in; } .no-print { display:none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 10px;">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>

  <h1>Device Security Report</h1>
  <div class="muted">Generated (UTC): ${safeGenerated}</div>
  <div class="muted">Organization: ${safeOrg}</div>

  <h2>Executive Summary</h2>
  <div class="card">
    <div class="grid">
      <div><strong>Device</strong><div>${safeTitle}</div></div>
      <div><strong>State</strong><div>${safeState}</div></div>
      <div><strong>Client Version</strong><div>${safeVersion}</div></div>
      <div><strong>Risk Score</strong><div>${safeRisk} / 100</div></div>
      <div><strong>CVEs</strong><div>${this.escapeHtml(model?.inventory?.cvesTotal ?? 0)}</div></div>
      <div><strong>Known Exploits</strong><div>${this.escapeHtml(model?.inventory?.knownExploitCount ?? 0)}</div></div>
    </div>
  </div>

  <h2>Vulnerability Summary</h2>
  <div class="card">
    <div class="grid">
      <div><strong>Critical</strong><div>${this.escapeHtml(c.CRITICAL ?? 0)}</div></div>
      <div><strong>High</strong><div>${this.escapeHtml(c.HIGH ?? 0)}</div></div>
      <div><strong>Medium</strong><div>${this.escapeHtml(c.MEDIUM ?? 0)}</div></div>
      <div><strong>Low</strong><div>${this.escapeHtml(c.LOW ?? 0)}</div></div>
    </div>
  </div>

  <h2>Top Vulnerable Software</h2>
  <table>
    <thead><tr><th>Application</th><th>CVEs</th><th>Worst Severity</th></tr></thead>
    <tbody>
      ${topApps.length ? topApps.map(a => `<tr><td>${this.escapeHtml(a.appName)}</td><td>${this.escapeHtml(a.cveCount)}</td><td>${this.escapeHtml(a.worstSeverity)}</td></tr>`).join('') : `<tr><td colspan="3">No vulnerable applications detected in current inventory.</td></tr>`}
    </tbody>
  </table>

  <h2>Top CVEs</h2>
  <table>
    <thead><tr><th>CVE</th><th>Severity</th><th>Application</th><th>Patched</th></tr></thead>
    <tbody>
      ${topCves.length ? topCves.map(cve => `<tr><td>${this.escapeHtml(cve.cveId || '')}</td><td>${this.escapeHtml(cve.severity || '')}</td><td>${this.escapeHtml(cve.appName || '')}</td><td>${this.escapeHtml(cve.isPatched === true ? 'Yes' : 'No')}</td></tr>`).join('') : `<tr><td colspan="4">No CVEs available.</td></tr>`}
    </tbody>
  </table>

  <h2>Network & Telemetry Snapshot</h2>
  <div class="card">
    <div class="grid">
      <div><strong>Last Telemetry</strong><div>${this.escapeHtml(model?.telemetry?.latestTimestamp || 'N/A')}</div></div>
      <div><strong>Current User</strong><div>${this.escapeHtml(model?.telemetry?.currentUser || 'N/A')}</div></div>
      <div><strong>Exposure</strong><div>${this.escapeHtml(model?.telemetry?.publicIpPresent ? 'Internet-exposed' : 'Private')}</div></div>
      <div><strong>Mobility</strong><div>${this.escapeHtml(model?.telemetry?.mobile ? 'Mobile' : 'Stationary')}</div></div>
    </div>
    <div style="margin-top:10px;"><strong>IP Addresses</strong><div class="muted">${ipList.length ? ipList.map(ip => this.escapeHtml(ip)).join(', ') : 'N/A'}</div></div>
  </div>

  <h2>Recommendations</h2>
  <div class="card">
    ${recommendations.length ? `<ul>${recommendations.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}</ul>` : `<div class="muted">No recommendations generated.</div>`}
  </div>

  <h2>Timeline (Recent)</h2>
  <table>
    <thead><tr><th>Time (UTC)</th><th>Event</th><th>Details</th></tr></thead>
    <tbody>
      ${timeline.length ? timeline.map(ev => `<tr><td>${this.escapeHtml(ev.timestampUtc || ev.timestamp || '')}</td><td>${this.escapeHtml(ev.title || ev.type || '')}</td><td>${this.escapeHtml(ev.description || '')}</td></tr>`).join('') : `<tr><td colspan="3">No timeline events available.</td></tr>`}
    </tbody>
  </table>

  <h2>Appendix: Raw Report Data (JSON)</h2>
  <pre>${jsonBlock}</pre>
</body>
</html>`;
    }

        generateDeviceReportPrintableHtml(model) {
                const titleDevice = model?.device?.deviceName || model?.device?.deviceId || 'Device';
                const safeTitle = this.escapeHtml(titleDevice);
                const safeOrg = this.escapeHtml(model?.org?.name || model?.org?.orgId || '');
                const safeGenerated = this.escapeHtml(model?.generatedAtUtc || '');
                const safeState = this.escapeHtml(model?.device?.state || '');
                const safeVersion = this.escapeHtml(model?.device?.clientVersion || '');
                const safeDeviceId = this.escapeHtml(model?.device?.deviceId || '');

                const riskScore = Number(model?.risk?.riskScore ?? 0);
                const safeRisk = this.escapeHtml(Number.isFinite(riskScore) ? Math.max(0, Math.min(100, riskScore)) : 0);

                const c = model?.inventory?.cvesBySeverity || {};
                const crit = Number(c.CRITICAL ?? 0) || 0;
                const high = Number(c.HIGH ?? 0) || 0;
                const med = Number(c.MEDIUM ?? 0) || 0;
                const low = Number(c.LOW ?? 0) || 0;
                const totalCves = Number(model?.inventory?.cvesTotal ?? (crit + high + med + low)) || 0;
                const knownExploitCount = Number(model?.inventory?.knownExploitCount ?? 0) || 0;

                const topApps = (Array.isArray(model?.inventory?.topVulnerableApps) ? model.inventory.topVulnerableApps : []).slice(0, 5);
                const topCves = (Array.isArray(model?.inventory?.topCves) ? model.inventory.topCves : []).slice(0, 6);
                const recommendations = (Array.isArray(model?.recommendations) ? model.recommendations : []).slice(0, 5);
                const timeline = Array.isArray(model?.timeline) ? model.timeline.slice(0, 6) : [];

                const summaryPoints = [];
                if (knownExploitCount > 0) summaryPoints.push(`${knownExploitCount} CVEs with known exploits`);
                if (crit + high > 0) summaryPoints.push(`${crit + high} critical/high CVEs`);
                if (totalCves > 0) summaryPoints.push(`${totalCves} total CVEs on device`);
                if ((model?.network?.publicIpPresent) === true) summaryPoints.push('Device is internet-exposed');
                if (summaryPoints.length === 0) summaryPoints.push('No immediate blocking risks detected.');

                const modelJsonForScript = this.escapeHtml(JSON.stringify(model));
                const sevTotal = Math.max(1, crit + high + med + low);
                const pct = (n) => Math.round((Math.max(0, Number(n) || 0) / sevTotal) * 100);

                return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MagenSec Device Security Report - ${safeTitle}</title>

    <!-- Tabler CSS (same as portal) -->
    <link href="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta20/dist/css/tabler.min.css" rel="stylesheet" crossorigin="anonymous" integrity="sha384-GgnF119bh9fxkKuWHRQYSgEe1rSp5jB0EJ2W8eMf8mjowfwhZP2H1u8n8xJUW3FQ">
    <link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css" rel="stylesheet" crossorigin="anonymous" integrity="sha384-PwEnNZvp50/uDLtKrd1s2D4Xe/y+fCVtEigigjik/PgHlDXUF1uJ32m7guk/XWYV">

    <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.45.0" crossorigin="anonymous" integrity="sha384-AMGf6SjYWuydruLCEKIx7wNrplae/LWMqStBYe5zhISiQeyuogc8OLM2QzJIreuY"></script>

    <style>
        @media print {
            .d-print-none { display: none !important; }
            a[href]:after { content: ""; }
        }
        body { background: #f8fafc; }
        .report-hero { background: linear-gradient(135deg, #0b7285, #1c7ed6); color: #fff; border-radius: 12px; padding: 20px; }
        .report-hero h1 { color: #fff; }
        .report-chart { min-height: 260px; }
        .kpi-card { border: 1px solid #e9ecef; border-radius: 10px; padding: 16px; background: #fff; }
        .kpi-label { font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: #868e96; }
        .kpi-value { font-size: 22px; font-weight: 700; }
    </style>
</head>
<body>
    <div class="page">
        <div class="page-wrapper">
            <div class="page-body">
                <div class="container-xl">
                    <div class="d-print-none mb-3 d-flex gap-2">
                        <button class="btn btn-primary" onclick="window.print()">
                            <i class="ti ti-printer"></i>
                            Print / Save as PDF
                        </button>
                        <a class="btn btn-secondary" href="#" onclick="window.close(); return false;">Close</a>
                    </div>

                    <div class="report-hero mb-4">
                        <div class="row g-3 align-items-center">
                            <div class="col-md-8">
                                <div class="text-uppercase fw-bold small" style="opacity:0.85">Device Security Report</div>
                                <h1 class="mb-1">${safeTitle}</h1>
                                <div class="d-flex flex-wrap gap-2 mb-2">
                                    <span class="badge bg-white text-dark">Org: ${safeOrg || '—'}</span>
                                    <span class="badge bg-white text-dark">Device ID: ${safeDeviceId || '—'}</span>
                                    <span class="badge bg-white text-dark">State: ${safeState || '—'}</span>
                                    <span class="badge bg-white text-dark">Client: ${safeVersion || '—'}</span>
                                </div>
                                <div class="text-white-75">Generated (UTC): ${safeGenerated}</div>
                                <div class="mt-3">
                                    ${summaryPoints.map(p => `<div class="d-flex align-items-center gap-2"><span class="badge bg-white text-dark" style="width:10px;height:10px;border-radius:50%;"></span><span>${this.escapeHtml(p)}</span></div>`).join('')}
                                </div>
                            </div>
                            <div class="col-md-4 text-md-end">
                                <div class="kpi-card" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color:#fff;">
                                    <div class="kpi-label" style="color: #dbe4ff;">Risk Score</div>
                                    <div class="kpi-value">${safeRisk} / 100</div>
                                    <div class="text-white-75" style="font-size: 12px;">Higher score = greater urgency</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row row-cards mb-3">
                        <div class="col-sm-6 col-lg-3">
                            <div class="kpi-card">
                                <div class="kpi-label">Total CVEs</div>
                                <div class="kpi-value">${this.escapeHtml(totalCves)}</div>
                                <div class="text-muted">${crit + high} critical/high · ${med} medium · ${low} low</div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="kpi-card">
                                <div class="kpi-label">Known Exploits</div>
                                <div class="kpi-value text-danger">${this.escapeHtml(knownExploitCount)}</div>
                                <div class="text-muted">KEV / exploited in the wild</div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="kpi-card">
                                <div class="kpi-label">Exposure</div>
                                <div class="kpi-value">${model?.network?.publicIpPresent ? 'Internet' : 'Private'}</div>
                                <div class="text-muted">${model?.network?.apipaPresent ? 'APIPA detected' : 'Network healthy'}</div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="kpi-card">
                                <div class="kpi-label">Heartbeat / Telemetry</div>
                                <div class="kpi-value">${this.escapeHtml(model?.telemetry?.lastHeartbeat || 'N/A')}</div>
                                <div class="text-muted">Last telemetry: ${this.escapeHtml(model?.telemetry?.lastTelemetry || 'N/A')}</div>
                            </div>
                        </div>
                    </div>

                    <div class="row row-deck row-cards mb-4">
                        <div class="col-12 col-lg-6">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Risk gauge</h3>
                                </div>
                                <div class="card-body">
                                    <div id="report-risk-chart" class="report-chart"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-12 col-lg-6">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">CVE severity mix</h3>
                                </div>
                                <div class="card-body">
                                    <div id="report-severity-chart" class="report-chart"></div>
                                    <div class="mt-4">
                                        <div class="d-flex justify-content-between"><span class="text-muted">Critical</span><span class="text-muted">${this.escapeHtml(crit)} (${pct(crit)}%)</span></div>
                                        <div class="progress mb-2"><div class="progress-bar bg-danger" style="width:${pct(crit)}%"></div></div>
                                        <div class="d-flex justify-content-between"><span class="text-muted">High</span><span class="text-muted">${this.escapeHtml(high)} (${pct(high)}%)</span></div>
                                        <div class="progress mb-2"><div class="progress-bar bg-orange" style="width:${pct(high)}%"></div></div>
                                        <div class="d-flex justify-content-between"><span class="text-muted">Medium</span><span class="text-muted">${this.escapeHtml(med)} (${pct(med)}%)</span></div>
                                        <div class="progress mb-2"><div class="progress-bar bg-yellow" style="width:${pct(med)}%"></div></div>
                                        <div class="d-flex justify-content-between"><span class="text-muted">Low</span><span class="text-muted">${this.escapeHtml(low)} (${pct(low)}%)</span></div>
                                        <div class="progress"><div class="progress-bar bg-lime" style="width:${pct(low)}%"></div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row row-cards mb-4">
                        <div class="col-12 col-lg-6">
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">Priority actions (do first)</h3></div>
                                <div class="card-body">
                                    ${recommendations.length ? `<ol class="mb-0">${recommendations.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}</ol>` : `<div class="text-muted">No explicit recommendations were generated. Focus on patching critical/high CVEs and internet-exposed software first.</div>`}
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-lg-6">
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">Exposure & posture</h3></div>
                                <div class="card-body">
                                    <ul class="mb-0">
                                        <li>${model?.network?.publicIpPresent ? '<span class="text-danger">Internet-exposed</span>' : 'Private network detected'}</li>
                                        <li>${model?.network?.apipaPresent ? '<span class="text-danger">APIPA detected (DHCP issue)</span>' : 'No APIPA addresses observed'}</li>
                                        <li>${model?.network?.mobile ? 'Roaming device (multiple networks observed)' : 'Stationary network profile'}</li>
                                        <li>Client version: ${safeVersion || 'N/A'}</li>
                                        <li>State: ${safeState || 'N/A'}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row row-cards mb-4">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Top vulnerable software</h3>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-vcenter card-table">
                                        <thead>
                                            <tr><th>Application</th><th>CVEs</th><th>Worst severity</th></tr>
                                        </thead>
                                        <tbody>
                                            ${topApps.length ? topApps.map(a => `
                                                <tr>
                                                    <td>${this.escapeHtml(a.appName)}</td>
                                                    <td>${this.escapeHtml(a.cveCount)}</td>
                                                    <td><span class="badge bg-secondary-lt">${this.escapeHtml(a.worstSeverity)}</span></td>
                                                </tr>
                                            `).join('') : `
                                                <tr><td colspan="3" class="text-muted">No vulnerable applications detected in current inventory.</td></tr>
                                            `}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row row-cards mb-4">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Top CVEs</h3>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-vcenter card-table">
                                        <thead>
                                            <tr><th>CVE</th><th>Severity</th><th>Application</th><th>Patched</th></tr>
                                        </thead>
                                        <tbody>
                                            ${topCves.length ? topCves.map(cve => `
                                                <tr>
                                                    <td>${this.escapeHtml(cve.cveId || '')}</td>
                                                    <td>${this.escapeHtml(cve.severity || '')}</td>
                                                    <td>${this.escapeHtml(cve.appName || '')}</td>
                                                    <td>${this.escapeHtml(cve.isPatched === true ? 'Yes' : 'No')}</td>
                                                </tr>
                                            `).join('') : `
                                                <tr><td colspan="4" class="text-muted">No CVEs available.</td></tr>
                                            `}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row row-cards mb-4">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header"><h3 class="card-title">Timeline (recent)</h3></div>
                                <div class="card-body">
                                    ${timeline.length ? `<ul class="mb-0">${timeline.map(ev => `<li><span class="text-muted">${this.escapeHtml(ev.timestampUtc || ev.timestamp || '')}</span> — ${this.escapeHtml(ev.title || ev.type || '')}</li>`).join('')}</ul>` : `<div class="text-muted">No timeline events available.</div>`}
                                </div>
                            </div>
                        </div>
                    </div>

                    <script id="report-model" type="application/json">${modelJsonForScript}</script>
                    <script>
                        (function () {
                            const modelText = document.getElementById('report-model')?.textContent || '{}';
                            let model = {};
                            try { model = JSON.parse(modelText); } catch (e) { model = {}; }

                            const risk = Number(model?.risk?.riskScore ?? 0);
                            const c = model?.inventory?.cvesBySeverity || {};
                            const crit = Number(c.CRITICAL ?? 0) || 0;
                            const high = Number(c.HIGH ?? 0) || 0;
                            const med = Number(c.MEDIUM ?? 0) || 0;
                            const low = Number(c.LOW ?? 0) || 0;

                            if (window.ApexCharts) {
                                const riskChart = new window.ApexCharts(document.querySelector('#report-risk-chart'), {
                                    chart: { type: 'radialBar', height: 260, sparkline: { enabled: true } },
                                    series: [Math.max(0, Math.min(100, Number.isFinite(risk) ? risk : 0))],
                                    labels: ['Risk'],
                                    plotOptions: { radialBar: { hollow: { size: '70%' }, dataLabels: { name: { show: true }, value: { show: true } } } }
                                });
                                riskChart.render();

                                const sevChart = new window.ApexCharts(document.querySelector('#report-severity-chart'), {
                                    chart: { type: 'donut', height: 260 },
                                    series: [crit, high, med, low],
                                    labels: ['Critical', 'High', 'Medium', 'Low'],
                                    legend: { position: 'bottom' },
                                    dataLabels: { enabled: true }
                                });
                                sevChart.render();
                            }
                        })();
                    </script>

                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
        }

    downloadDeviceReport(e) {
        if (e && e.preventDefault) e.preventDefault();
        const model = this.buildDeviceReportModel();
        const html = this.generateDeviceReportHtml(model);

        const deviceId = (model?.device?.deviceId || 'device').toString();
        const safe = deviceId.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `MagenSec-DeviceReport-${safe}-${timestamp}.html`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Best-effort revoke
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    printDeviceReport(e) {
        if (e && e.preventDefault) e.preventDefault();
        const model = this.buildDeviceReportModel();
        const html = this.generateDeviceReportPrintableHtml(model);

        const w = window.open('', '_blank');
        if (!w) {
            alert('Popup blocked. Please allow popups for this site to generate the PDF report.');
            return;
        }

        w.document.open();
        w.document.write(html);
        w.document.close();

        // Best-effort auto-open print dialog after a short delay.
        // Browser security policies may ignore this; user can still click the button.
        setTimeout(() => {
            try { w.focus(); w.print(); } catch (err) { /* ignore */ }
        }, 900);
    }

    detectMobileDevice(telemetryHistory) {
        /**
         * INVENTORY USE CASE: Identify mobile vs stationary devices
         * Mobile devices have multiple unique IPs over time (roaming between networks)
         * Stationary devices have stable IPs
         */
        if (!telemetryHistory || !Array.isArray(telemetryHistory)) {
            return { isMobile: false, uniqueIpCount: 0, stationaryThreshold: 3 };
        }

        const uniqueIps = new Set();
        const stationaryThreshold = 3;

        for (const entry of telemetryHistory) {
            const ips = entry?.fields?.IPAddresses;
            if (Array.isArray(ips)) {
                ips.forEach(ip => uniqueIps.add(ip));
            }
        }

        return {
            isMobile: uniqueIps.size > stationaryThreshold,
            uniqueIpCount: uniqueIps.size,
            stationaryThreshold: stationaryThreshold
        };
    }

    analyzeNetworkRisk(ipAddresses, telemetryHistory) {
        /**
         * SECURITY/COMPLIANCE USE CASES:
         * - Detect unusual network patterns (public IP, APIPA)
         * - Track network movement (included in timeline)
         * - Identify network exposure risks
         */
        const result = {
            publicIpPresent: false,
            apipaPresent: false,
            suspiciousPatterns: [],
            riskFactors: []
        };

        if (!ipAddresses || !Array.isArray(ipAddresses)) {
            return result;
        }

        // Check current IPs for public/APIPA ranges
        for (const ip of ipAddresses) {
            if (typeof ip !== 'string') continue;

            // APIPA: 169.254.x.x (Windows uses this when DHCP fails)
            if (ip.startsWith('169.254.')) {
                result.apipaPresent = true;
                if (!result.riskFactors.includes('APIPA detected: Device has network connectivity issues')) {
                    result.riskFactors.push('APIPA detected: Device has network connectivity issues');
                }
            }

            // Public IP ranges (not private, not loopback, not link-local)
            if (!this.isPrivateIp(ip) && !ip.startsWith('127.') && !ip.startsWith('169.254.')) {
                result.publicIpPresent = true;
                if (!result.riskFactors.includes('Public IP detected: Device may be exposed to internet risks')) {
                    result.riskFactors.push('Public IP detected: Device may be exposed to internet risks');
                }
            }
        }

        // Check for rapid IP changes (security/troubleshooting indicator)
        if (telemetryHistory && telemetryHistory.length > 1) {
            const recentIps = new Set();
            const recentWindow = telemetryHistory.slice(0, 5); // Last 5 telemetry entries

            for (const entry of recentWindow) {
                const ips = entry?.fields?.IPAddresses;
                if (Array.isArray(ips)) {
                    ips.forEach(ip => recentIps.add(ip));
                }
            }

            // More than 3 IP changes in last 5 telemetry points = unusual network movement
            if (recentIps.size > 3) {
                result.suspiciousPatterns.push(`Rapid network changes: ${recentIps.size} different IPs in recent activity`);
            }
        }

        return result;
    }

    /**
     * Block device from device detail page
     * @param {boolean} deleteTelemetry - Whether to delete telemetry data
     */
    async blockDevice(deleteTelemetry = false) {
        const { device } = this.state;
        if (!device) {
            console.error('[DeviceDetail] Cannot block: device not loaded');
            return;
        }

        const deviceId = device.DeviceId || device.deviceId;
        const deviceName = device.DeviceName || device.deviceName || deviceId;
        const currentOrg = orgContext.getCurrentOrg();
        
        if (!currentOrg || !currentOrg.orgId) {
            console.error('[DeviceDetail] Cannot block: no org context');
            alert('Error: Organization context not available');
            return;
        }

        const confirmMessage = deleteTelemetry
            ? `Block device "${deviceName}" and delete its telemetry?\n\nDevice will remove license and terminate. Seat will be released.\nTelemetry deletion cannot be undone.`
            : `Block device "${deviceName}"?\n\nDevice will remove license and terminate. Seat will be released.`;

        if (!confirm(confirmMessage)) {
            console.info('[DeviceDetail] Block device cancelled by user');
            return;
        }

        console.info('[DeviceDetail] Blocking device:', { deviceId, deviceName, deleteTelemetry, orgId: currentOrg.orgId });

        try {
            const response = await api.updateDeviceState(currentOrg.orgId, deviceId, 'BLOCKED', {
                deleteTelemetry,
                reason: deleteTelemetry 
                    ? 'Admin blocked device with telemetry deletion via Device Detail page'
                    : 'Admin blocked device via Device Detail page'
            });

            console.info('[DeviceDetail] Block device response:', response);

            if (response.success) {
                // Update local state optimistically
                this.setState({
                    device: {
                        ...this.state.device,
                        DeviceState: 'BLOCKED',
                        State: 'BLOCKED',
                        state: 'BLOCKED'
                    }
                });

                alert(deleteTelemetry 
                    ? 'Device blocked successfully. Seat released. Telemetry deleted.' 
                    : 'Device blocked successfully. Seat released.');
                
                // BUG FIX #1: Redirect to devices list so user sees updated badge immediately
                setTimeout(() => {
                    route('/#!/devices');
                }, 1000);
            } else {
                throw new Error(response.message || response.error || 'Failed to block device');
            }
        } catch (error) {
            console.error('[DeviceDetail] Block device failed:', error);
            alert(`Failed to block device: ${error.message}`);
        }
    }

    /**
     * Enable (resurrect) blocked device from device detail page
     */
    async enableDevice() {
        const { device } = this.state;
        if (!device) {
            console.error('[DeviceDetail] Cannot enable: device not loaded');
            return;
        }

        const deviceId = device.DeviceId || device.deviceId;
        const deviceName = device.DeviceName || device.deviceName || deviceId;
        const currentOrg = orgContext.getCurrentOrg();
        
        if (!currentOrg || !currentOrg.orgId) {
            console.error('[DeviceDetail] Cannot enable: no org context');
            alert('Error: Organization context not available');
            return;
        }

        const confirmMessage = `Enable device "${deviceName}"?\n\nDevice must re-register (license validation + heartbeat) before becoming ACTIVE again.`;

        if (!confirm(confirmMessage)) {
            console.info('[DeviceDetail] Enable device cancelled by user');
            return;
        }

        console.info('[DeviceDetail] Enabling device:', { deviceId, deviceName, orgId: currentOrg.orgId });

        try {
            const response = await api.updateDeviceState(currentOrg.orgId, deviceId, 'ENABLED', {
                reason: 'Admin enabled via Device Detail page'
            });

            console.info('[DeviceDetail] Enable device response:', response);

            if (response.success) {
                // Update local state optimistically
                this.setState({
                    device: {
                        ...this.state.device,
                        DeviceState: 'ENABLED',
                        State: 'ENABLED',
                        state: 'ENABLED'
                    }
                });

                alert('Device enabled successfully. Re-registration required.');
                
                // Reload device data to get fresh state
                await this.loadDeviceData();
            } else {
                throw new Error(response.message || response.error || 'Failed to enable device');
            }
        } catch (error) {
            console.error('[DeviceDetail] Enable device failed:', error);
            alert(`Failed to enable device: ${error.message}`);
        }
    }

    isPrivateIp(ip) {
        /**
         * Check if IP is in private ranges per RFC 1918
         * 10.0.0.0 to 10.255.255.255
         * 172.16.0.0 to 172.31.255.255
         * 192.168.0.0 to 192.168.255.255
         */
        if (!ip || typeof ip !== 'string') return false;

        const parts = ip.split('.').map(p => parseInt(p, 10));
        if (parts.length !== 4) return false;

        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;

        return false;
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
        const statusFilter = this.state.appStatusFilter || 'installed';
        const statusFilteredApps = enrichedApps.filter(app => {
            const status = (app.status || '').toLowerCase();
            if (statusFilter === 'all') return true;
            return status === statusFilter;
        });
        let filteredApps = this.filterApps(statusFilteredApps, searchQuery);
        // Apply sorting for Applications tab
        filteredApps = filteredApps.slice().sort((a,b) => {
            if (this.state.appSortKey === 'appName') {
                const r = String(a.appName||'').localeCompare(String(b.appName||''));
                return this.state.appSortDir === 'asc' ? r : -r;
            }
            if (this.state.appSortKey === 'severity') {
                const aw = Math.max(...this.getCvesByApp(a.appRowKey).map(c => this.severityWeight(c.severity)), 0);
                const bw = Math.max(...this.getCvesByApp(b.appRowKey).map(c => this.severityWeight(c.severity)), 0);
                const r = aw - bw;
                return this.state.appSortDir === 'asc' ? r : -r;
            }
            if (this.state.appSortKey === 'cveCount') {
                const ac = this.getCvesByApp(a.appRowKey).length;
                const bc = this.getCvesByApp(b.appRowKey).length;
                const r = ac - bc;
                return this.state.appSortDir === 'asc' ? r : -r;
            }
            return 0;
        });
        // Use active CVEs only (excluding uninstalled/updated apps) for risk display
        const activeCves = this.getActiveCves();
        const mitigationStats = this.getMitigationStats();
        const criticalCves = activeCves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical');
        const highCves = activeCves.filter(c => c.severity === 'HIGH' || c.severity === 'High');

        const riskScoreRaw = this.getRiskScoreValue(this.state.deviceSummary, this.calculateRiskScore(device))
            ?? 0;
        const riskScore = (() => {
            const n = Number(riskScoreRaw);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(100, Math.round(n)));
        })();
        const worstSeverity = (this.state.deviceSummary?.worstSeverity || '').toUpperCase()
            || (criticalCves.length > 0 ? 'CRITICAL' : highCves.length > 0 ? 'HIGH' : activeCves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length > 0 ? 'MEDIUM' : activeCves.length > 0 ? 'LOW' : 'CLEAN');
        const knownExploitCount = this.state.knownExploits ? activeCves.filter(c => this.state.knownExploits.has(c.cveId)).length : 0;
        const latestFields = this.state.telemetryDetail?.latest?.fields || {};
        const ipRaw = latestFields.IPAddresses || latestFields.ipAddresses;
        const ipList = Array.isArray(ipRaw) ? ipRaw : typeof ipRaw === 'string' ? ipRaw.split(/[;\s,]+/).filter(Boolean) : [];
        const mobileStatus = this.detectMobileDevice(this.state.telemetryDetail?.history);
        const networkRisk = this.analyzeNetworkRisk(ipList, this.state.telemetryDetail?.history);
        const recentChangeCount = this.state.telemetryDetail?.changes?.length || 0;
        const lastHeartbeat = device.LastHeartbeat || device.lastHeartbeat;
        const telemetryTimestamp = this.state.telemetryDetail?.latest?.timestamp;
        const updateAvailable = (() => {
            const dv = device.ClientVersion || device.clientVersion;
            return dv && this.isVersionOutdated(dv);
        })();
        const actionBadges = [
            updateAvailable ? {
                color: 'bg-warning-lt',
                label: 'Update available',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l4 4h-3v4h-2v-4h-3z" /><path d="M12 20a8 8 0 0 0 0 -16" /></svg>`
            } : null,
            knownExploitCount > 0 ? {
                color: 'bg-danger-lt',
                label: `${knownExploitCount} known exploit${knownExploitCount > 1 ? 's' : ''}`,
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>`
            } : null,
            networkRisk?.publicIpPresent ? {
                color: 'bg-warning-lt',
                label: 'Internet-exposed',
                icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a9 9 0 0 0 0 18" /><path d="M12 3a9 9 0 0 1 0 18" /><path d="M3 12h18" /><path d="M12 3c-1.333 2.667-2 5.333-2 8s.667 5.333 2 8" /><path d="M12 3c1.333 2.667 2 5.333 2 8s-.667 5.333-2 8" /></svg>`
            } : null
        ].filter(Boolean);
        const sessionSummary = this.state.deviceSessions;
        const monitoringSessions = this.getMonitoringSessions(sessionSummary);
        const versionSessions = monitoringSessions.length > 0 ? monitoringSessions : this.getVersionSessions(sessionSummary);
        const sessionWindowText = sessionSummary
            ? `Window ${sessionSummary.startUtc || sessionSummary.StartUtc ? this.formatDate(sessionSummary.startUtc || sessionSummary.StartUtc) : 'N/A'} – ${sessionSummary.endUtc || sessionSummary.EndUtc ? this.formatDate(sessionSummary.endUtc || sessionSummary.EndUtc) : 'N/A'}`
            : 'No monitoring history yet';
        const hasVersionSessions = Array.isArray(versionSessions) && versionSessions.length > 0;
        const sessionTabs = [
            { key: 'specs', label: 'Specs', hasData: true },
            { key: 'version', label: 'Coverage', hasData: hasVersionSessions },
            { key: 'perf', label: 'Performance', hasData: !!this.state.perfData },
            { key: 'timeline', label: 'Timeline', hasData: this.state.timeline?.length > 0 }
        ];
        const sessionIcon = (key) => {
            switch (key) {
                case 'version':
                    return html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l7 3v6c0 3.5 -2.5 6.5 -7 9c-4.5 -2.5 -7 -5.5 -7 -9v-6z" /><path d="M9 12l2 2l4 -4" /></svg>`;
                case 'perf':
                default:
                    return html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 19l16 0" /><path d="M4 15l4 -6l4 2l4 -5l4 4" /><path d="M4 12l3 -4l4 2l5 -6l4 4" /></svg>`;
            }
        };
        const handleSessionTabClick = (key) => {
            this.setState({ sessionTab: key, sessionExpanded: true }, () => {
                if (key === 'version') this.renderSessionChart();
                if (key === 'pid') this.renderPidSessionChart();
                if (key === 'perf') this.renderPerfCharts();
            });
        };

        return html`
            <div class="page-wrapper">
                <div class="page-body">
                    <div class="container-xl">
                        <!-- Header with Action Ribbon -->
                        <div class="page-header d-print-none">
                            <div class="row g-2 align-items-center">
                                <div class="col">
                                    <div class="page-pretitle">
                                        <a href="#!/devices" class="text-muted">← Devices</a>
                                    </div>
                                    <h2 class="page-title">
                                        <span class="avatar avatar-sm me-2 bg-blue-lt">
                                            ${(() => {
                                                const name = device.DeviceName || device.deviceName || device.DeviceId || device.deviceId || '';
                                                return name.substring(0, 2).toUpperCase();
                                            })()}
                                        </span>
                                        ${device.DeviceName || device.deviceName || device.DeviceId || device.deviceId}
                                    </h2>
                                    <div class="page-subtitle">
                                        <div class="row">
                                            <div class="col-auto">
                                                ${(() => {
                                                    const last = device.LastHeartbeat || device.lastHeartbeat;
                                                    if (!last) return html`<span class="status-dot status-red me-1"></span>Offline`;
                                                    const mins = Math.floor((Date.now() - new Date(last).getTime())/60000);
                                                    const isActive = String(device.State||'').toUpperCase()==='ACTIVE';
                                                    if (mins <= 30 && isActive) {
                                                        return html`<span class="status-dot status-dot-animated status-green me-1"></span>Online`;
                                                    } else if (mins <= 360) {
                                                        return html`<span class="status-dot status-yellow me-1"></span>${mins < 60 ? mins + 'm ago' : Math.floor(mins/60) + 'h ago'}`;
                                                    } else {
                                                        return html`<span class="status-dot status-red me-1"></span>Offline`;
                                                    }
                                                })()}
                                            </div>
                                            <div class="col-auto">
                                                Last scan: ${(() => {
                                                    const ts = this.state.telemetryDetail?.latest?.timestamp || device.LastHeartbeat || device.lastHeartbeat;
                                                    return ts ? this.formatDate(ts) : 'N/A';
                                                })()}
                                            </div>
                                            <div class="col-auto">
                                                ${(() => {
                                                    const f = this.state.telemetryDetail?.latest?.fields || {};
                                                    const os = f.OSVersion || f.osVersion || f.OS || device.OS || device.os || 'Windows';
                                                    return os;
                                                })()}
                                            </div>
                                            ${(() => {
                                                const f = this.state.telemetryDetail?.latest?.fields || {};
                                                const ipRaw = f.IPAddresses || f.ipAddresses;
                                                const ipList = Array.isArray(ipRaw) ? ipRaw : typeof ipRaw === 'string' ? ipRaw.split(/[;\s,]+/).filter(Boolean) : [];
                                                const primaryIp = ipList[0];
                                                return primaryIp ? html`<div class="col-auto">${primaryIp}</div>` : '';
                                            })()}
                                        </div>
                                    </div>
                                </div>
                                <div class="col-auto ms-auto d-print-none">
                                    <div class="btn-list">
                                        <button class="btn btn-primary" title="Generate a device security report and save as PDF" onclick=${(e) => this.printDeviceReport(e)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M12 17v-6" /><path d="M9.5 14.5l2.5 2.5l2.5 -2.5" /></svg>
                                            Save as PDF
                                        </button>
                                        <button class="btn" title="Trigger Windows Update (coming soon)" onclick=${(e) => { e.preventDefault(); console.info('Windows Update trigger requested'); }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5.5l7 -1.5v8l-7 .5z" /><path d="M20 4l-7 1.5v7.5l7 -.5z" /><path d="M4 15l7 .5v5l-7 -1.5z" /><path d="M20 13l-7 .5v6.5l7 -1.5z" /></svg>
                                            Patch Now
                                        </button>
                                        <div class="dropdown">
                                            <button class="btn dropdown-toggle" data-bs-toggle="dropdown">
                                                More Actions
                                            </button>
                                            <div class="dropdown-menu dropdown-menu-end">
                                                <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'inventory' }); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" /><path d="M16 5l3 3" /></svg>
                                                    View Applications
                                                </a>
                                                <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'risks' }); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>
                                                    View Vulnerabilities
                                                </a>
                                                <a class="dropdown-item ${updateAvailable ? '' : 'disabled'}" href="#" onclick=${(e) => { e.preventDefault(); if (updateAvailable) console.info('Update client requested'); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 9a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M7 14l-3 3l-1 -1" /><path d="M9 13l2 2l4 -4" /></svg>
                                                    Update Client
                                                </a>
                                                <div class="dropdown-divider"></div>
                                                <a class="dropdown-item text-danger" href="#" onclick=${(e) => { e.preventDefault(); this.blockDevice(false); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M5.7 5.7l12.6 12.6" /></svg>
                                                    Block Device
                                                </a>
                                                <a class="dropdown-item text-danger" href="#" onclick=${(e) => { e.preventDefault(); this.blockDevice(true); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 6l3 18h12l3 -18h-18" /><path d="M8 6v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" /></svg>
                                                    Block + Delete Telemetry
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Metrics Row -->
                        <div class="row row-cards mb-3">
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-body">
                                        ${actionBadges.length ? html`
                                            <div class="d-flex flex-wrap gap-2 mb-3">
                                                ${actionBadges.map(b => html`
                                                    <span class="badge ${b.color} d-inline-flex align-items-center gap-2" style="font-size: 12px;" title=${b.title || b.label}>
                                                        ${b.icon}
                                                        <span>${b.label}</span>
                                                    </span>
                                                `)}
                                            </div>
                                        ` : ''}
                                        <div class="row g-3 align-items-center">
                                            <div class="col-md-3">
                                                <div class="text-muted small font-weight-medium">Registered</div>
                                                <div class="fw-bold">${device.FirstHeartbeat ? this.formatDate(device.FirstHeartbeat) : device.firstSeen ? this.formatDate(device.firstSeen) : device.createdAt ? this.formatDate(device.createdAt) : 'N/A'}</div>
                                            </div>
                                            <div class="col-md-3">
                                                <div class="text-muted small font-weight-medium">Last Seen</div>
                                                ${(() => {
                                                    const lastSeen = this.state.telemetryDetail?.latest?.timestamp 
                                                        || device.LastHeartbeat || device.lastHeartbeat 
                                                        || device.LastSeen || device.lastSeen;
                                                    return html`<div class="fw-bold">${lastSeen ? this.formatDate(lastSeen) : 'N/A'}</div>`;
                                                })()}
                                            </div>
                                            <div class="col-md-3">
                                                <div class="text-muted small font-weight-medium">User</div>
                                                ${(() => {
                                                    const f = this.state.telemetryDetail?.latest?.fields || {};
                                                    const encoded = f.UserName || f.Username || f.userName || f.LoggedOnUser || f.CurrentUser || null;
                                                    const u = encoded ? PiiDecryption.decryptIfEncrypted(String(encoded)) : null;
                                                    return html`<div class="fw-bold">${u ? String(u) : 'N/A'}</div>`;
                                                })()}
                                            </div>
                                            <div class="col-md-3">
                                                <div class="text-muted small font-weight-medium">Exposure</div>
                                                <div class="d-flex align-items-center gap-2">
                                                    <span class="badge ${networkRisk.publicIpPresent ? 'bg-warning-lt' : 'bg-success-lt'}">${networkRisk.publicIpPresent ? 'Internet-exposed' : 'Private'}</span>
                                                    ${networkRisk.apipaPresent ? html`<span class="badge bg-danger-lt">APIPA</span>` : ''}
                                                    ${mobileStatus.isMobile ? html`<span class="badge bg-info-lt">Mobile (${mobileStatus.uniqueIpCount})</span>` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- Donut row: apps, CVEs, client version -->
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="row g-3 align-items-center">
                                            <div class="col-md-4">
                                                ${(() => {
                                                    const totalApps = enrichedApps.length || 0;
                                                    const vulnerableApps = this.state.appInventory.filter(app => this.state.cveInventory.some(cve => cve.appName && app.appName && cve.appName.toLowerCase() === app.appName.toLowerCase())).length;
                                                    const cleanApps = Math.max(0, totalApps - vulnerableApps);
                                                    const radius = 34;
                                                    const circumference = 2 * Math.PI * radius;
                                                    const vulnPct = totalApps > 0 ? vulnerableApps / totalApps : 0;
                                                    const vulnOffset = circumference * (1 - vulnPct);
                                                    return html`
                                                        <div class="d-flex align-items-center gap-3" style="cursor: pointer;" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'inventory' }, () => this.scrollToAppsTable && this.scrollToAppsTable()); }} title="View applications with CVEs">
                                                            <div ref=${(el) => { this.detailAppsChartEl = el; }} style="min-height: 120px; width: 120px;"></div>
                                                            <div>
                                                                <div class="fw-semibold">Apps With CVEs</div>
                                                                <div class="text-muted small">${vulnerableApps} vulnerable · ${cleanApps} clean</div>
                                                            </div>
                                                        </div>
                                                    `;
                                                })()}
                                            </div>
                                            <div class="col-md-4">
                                                ${(() => {
                                                    const totalCves = this.state.cveInventory.length;
                                                    const counts = {
                                                        crit: criticalCves.length,
                                                        high: highCves.length,
                                                        med: this.state.cveInventory.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length,
                                                        low: this.state.cveInventory.filter(c => c.severity === 'LOW' || c.severity === 'Low').length
                                                    };
                                                    const radius = 34;
                                                    const circumference = 2 * Math.PI * radius;
                                                    const slices = [];
                                                    let offset = 0;
                                                    const pushSlice = (count, color) => {
                                                        if (!count || totalCves === 0) return;
                                                        const pct = count / totalCves;
                                                        const length = pct * circumference;
                                                        slices.push({ length, color, offset });
                                                        offset += length;
                                                    };
                                                    pushSlice(counts.crit, '#d63939');
                                                    pushSlice(counts.high, '#f59f00');
                                                    pushSlice(counts.med, '#fab005');
                                                    pushSlice(counts.low, '#74b816');

                                                    return html`
                                                        <div class="d-flex align-items-center gap-3" style="cursor: pointer;" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'risks', cveFilterApp: null }, () => this.scrollToCveTable && this.scrollToCveTable()); }} title="View CVEs">
                                                            <div ref=${(el) => { this.detailCvesChartEl = el; }} style="min-height: 120px; width: 120px;"></div>
                                                            <div>
                                                                <div class="fw-semibold">CVE Mix</div>
                                                                <div class="text-muted small">${counts.crit} critical · ${counts.high} high · ${counts.med} med · ${counts.low} low</div>
                                                            </div>
                                                        </div>
                                                    `;
                                                })()}
                                            </div>
                                            <div class="col-md-4">
                                                ${(() => {
                                                    const dv = device.ClientVersion || device.clientVersion || this.state.deviceSummary?.clientVersion;
                                                    const latest = (this.state.installers?.ENGINE?.VERSION) || config.INSTALLERS.ENGINE.VERSION;
                                                    const updateAvailable = dv ? this.isVersionOutdated(dv) : false;
                                                    const postureLabel = dv ? (updateAvailable ? 'Behind latest' : 'Up to date') : 'Unknown';
                                                    const postureClass = updateAvailable ? 'text-warning' : 'text-success';
                                                    return html`
                                                        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                                            <div>
                                                                <div class="fw-semibold">Client Version</div>
                                                                <div class="d-flex align-items-center gap-2">
                                                                    <span class="badge ${updateAvailable ? 'bg-warning-lt' : 'bg-success-lt'}">${dv ? `v${dv}` : 'Unknown'}</span>
                                                                    ${updateAvailable ? html`<span class="badge bg-azure-lt">v${latest} available</span>` : ''}
                                                                </div>
                                                                <div class="text-muted small ${postureClass}">${postureLabel}${dv ? ` vs v${latest}` : ''}</div>
                                                            </div>
                                                            <div class="dropdown">
                                                                <button class="btn btn-primary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                                                    Queue action
                                                                    ${updateAvailable ? html`<span class="badge bg-warning text-dark ms-1">Update</span>` : ''}
                                                                </button>
                                                                <div class="dropdown-menu dropdown-menu-end">
                                                                    <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Queue: Update client to latest'); }}>
                                                                        Queue client update to v${latest}
                                                                    </a>
                                                                    <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Queue: Restart client'); }}>
                                                                        Restart client service
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Highlights Row -->
                        <div class="row row-cards mb-3">
                            <div class="col-md-3">
                                <div class="card card-sm h-100">
                                    <div class="card-body">
                                        <div class="text-muted small">Risk posture</div>
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div class="h3 mb-0">${riskScore}</div>
                                            <span class="badge ${this.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                                        </div>
                                        <div class="text-muted small mt-1">Baseline risk score (0–100, not a percentage). Worst severity across ${this.state.cveInventory.length} CVEs.</div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card card-sm h-100">
                                    <div class="card-body">
                                        <div class="text-muted small">Known exploits</div>
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div class="h3 mb-0">${knownExploitCount}</div>
                                            ${knownExploitCount > 0 ? html`<span class="badge bg-danger-lt">Action required</span>` : html`<span class="badge bg-success-lt">None</span>`}
                                        </div>
                                        <div class="text-muted small mt-1">KEV-mapped vulnerabilities on this device</div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card card-sm h-100">
                                    <div class="card-body">
                                        <div class="text-muted small">Network signals</div>
                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                            ${networkRisk.publicIpPresent ? html`<span class="badge bg-warning-lt">Public IP</span>` : html`<span class="badge bg-success-lt">Private only</span>`}
                                            ${networkRisk.apipaPresent ? html`<span class="badge bg-danger-lt">APIPA</span>` : ''}
                                            ${networkRisk.suspiciousPatterns.length > 0 ? html`<span class="badge bg-yellow-lt">${networkRisk.suspiciousPatterns.length} alerts</span>` : html`<span class="badge bg-azure-lt">Stable</span>`}
                                        </div>
                                        <div class="text-muted small mt-1">${ipList.length || '0'} IPs observed; ${mobileStatus.isMobile ? 'roaming detected' : 'stationary'}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card card-sm h-100">
                                    <div class="card-body">
                                        <div class="text-muted small">Activity</div>
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div class="h3 mb-0">${recentChangeCount}</div>
                                            <span class="badge bg-blue-lt">Changes</span>
                                        </div>
                                        <div class="text-muted small mt-1">Recent hardware/system changes tracked</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Client Version & PID Timelines -->
                        <div class="row row-cards mb-3">
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                                        <div>
                                            <div class="card-title mb-0">Monitoring & Coverage History</div>
                                            <div class="text-muted small">${sessionWindowText || 'No coverage history yet'}</div>
                                        </div>
                                        <button class="btn btn-sm btn-outline-primary" onclick=${(e) => { e.preventDefault(); this.toggleSessionCollapse(); }}>
                                            ${this.state.sessionExpanded ? 'Hide coverage' : 'Show coverage'}
                                        </button>
                                    </div>
                                    ${this.state.sessionExpanded ? html`
                                        <div class="card-body">
                                            ${this.state.sessionLoading ? html`<div class="text-muted">Loading client session history…</div>` : ''}
                                            ${!this.state.sessionLoading ? html`
                                                <ul class="nav nav-tabs nav-fill mb-3" role="tablist">
                                                    ${sessionTabs.map(tab => html`
                                                        <li class="nav-item" role="presentation">
                                                            <a class="nav-link ${this.state.sessionTab === tab.key ? 'active' : ''}" href="#" role="tab" onclick=${(e) => { e.preventDefault(); handleSessionTabClick(tab.key); }}>
                                                                <span class="d-flex align-items-center justify-content-center gap-2">
                                                                    ${sessionIcon(tab.key)}
                                                                    <span>${tab.label}</span>
                                                                </span>
                                                            </a>
                                                        </li>
                                                    `)}
                                                </ul>
                                                <div class="text-muted small mb-3">${sessionWindowText}</div>
                                                <div class="tab-content">
                                                    ${this.state.sessionTab === 'version' ? html`
                                                        <div class="tab-pane active show">
                                                            <div class="text-muted small mb-1">Coverage timeline</div>
                                                            <div ref=${(el) => { this.sessionChartEl = el; }} style="min-height: 240px;"></div>
                                                            ${!hasVersionSessions ? html`<div class="text-muted small">No monitoring sessions in this window.</div>` : ''}
                                                        </div>
                                                    ` : ''}
                                                    ${this.state.sessionTab === 'perf' ? html`
                                                        <div class="tab-pane active show">
                                                            <div class="text-muted small mb-2">Performance timeline</div>
                                                            ${this.renderPerfTab(true)}
                                                        </div>
                                                    ` : ''}
                                                    ${this.state.sessionTab === 'specs' ? html`
                                                        <div class="tab-pane active show">
                                                            ${this.renderSpecsTab()}
                                                        </div>
                                                    ` : ''}
                                                    ${this.state.sessionTab === 'timeline' ? html`
                                                        <div class="tab-pane active show">
                                                            ${this.renderTimelineTab()}
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            ` : ''}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Tabs -->
                        <div class="card">
                            <div class="card-header border-bottom-0">
                                ${(() => {
                                    const tabClass = (key) => {
                                        const isActive = activeTab === key;
                                        if (key === 'riskAssessment') return `nav-link rounded-pill fw-semibold ${isActive ? 'active bg-danger text-white shadow-sm' : 'border border-danger text-danger bg-transparent'}`;
                                        if (key === 'inventory') return `nav-link rounded-pill fw-semibold ${isActive ? 'active bg-primary text-white shadow-sm' : 'border border-primary text-primary bg-transparent'}`;
                                        if (key === 'telemetry') return `nav-link rounded-pill fw-semibold ${isActive ? 'active bg-info text-white shadow-sm' : 'border border-info text-info bg-transparent'}`;
                                        return `nav-link rounded-pill fw-semibold ${isActive ? 'active bg-warning text-dark shadow-sm' : 'border border-warning text-warning bg-transparent'}`;
                                    };

                                    const telemetryHistoryLength = this.state.telemetryHistory?.length || 0;

                                    return html`
                                        <ul class="nav nav-pills nav-fill card-header-tabs" role="tablist">
                                            <li class="nav-item">
                                                <a class=${tabClass('riskAssessment')} href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'riskAssessment' }); }} role="tab">
                                                    <span class="d-flex align-items-center justify-content-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l7 3v6c0 3.5 -2.5 6.5 -7 9c-4.5 -2.5 -7 -5.5 -7 -9v-6z" /><path d="M10 12l2 2l4 -4" /></svg>
                                                        <span>Risk</span>
                                                    </span>
                                                </a>
                                            </li>
                                            <li class="nav-item">
                                                <a class=${tabClass('inventory')} href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'inventory' }); }} role="tab">
                                                    <span class="d-flex align-items-center justify-content-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
                                                        <span>Applications</span>
                                                        <span class="badge bg-primary-lt text-primary">${enrichedApps.length}</span>
                                                    </span>
                                                </a>
                                            </li>
                                            <li class="nav-item">
                                                <a class=${tabClass('telemetry')} href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'telemetry' }); }} role="tab">
                                                    <span class="d-flex align-items-center justify-content-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3" /><line x1="12" y1="12" x2="20" y2="7.5" /><line x1="12" y1="12" x2="12" y2="21" /><line x1="12" y1="12" x2="4" y2="7.5" /></svg>
                                                        <span>Telemetry</span>
                                                        ${telemetryHistoryLength > 0 ? html`<span class="badge bg-info-lt text-info">${telemetryHistoryLength}</span>` : ''}
                                                    </span>
                                                </a>
                                            </li>
                                            <li class="nav-item">
                                                <a class=${tabClass('risks')} href="#" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'risks' }); }} role="tab">
                                                    <span class="d-flex align-items-center justify-content-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M11 3l2 0l1 7l-4 0z" /><path d="M10 14l4 -2l4 2l-4 7z" /><path d="M5 14l4 -2l0 5l-4 2z" /></svg>
                                                        <span>CVEs</span>
                                                        <span class="badge ${this.getSeverityColor(worstSeverity)}">${this.state.cveInventory.length}</span>
                                                    </span>
                                                </a>
                                            </li>
                                        </ul>
                                    `;
                                })()}
                            </div>
                            <div class="card-body">
                                <!-- Risk Assessment Tab -->
                                ${activeTab === 'riskAssessment' ? this.renderRiskAssessment() : ''}
                                
                                <!-- Inventory Tab -->
                                ${activeTab === 'inventory' ? this.renderInventoryTab(enrichedApps, filteredApps) : ''}
                                
                                <!-- Telemetry Tab -->
                                ${activeTab === 'telemetry' ? this.renderTelemetryTab() : ''}
                                
                                <!-- CVEs Tab -->
                                ${activeTab === 'risks' ? this.renderRisksTab() : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderPerfTab(embedded = false) {
        const { html } = window;
        const perf = this.state.perfData;
        const { perfBucket, perfRangeDays, perfLoading } = this.state;

        if (this.state.perfError) {
            return html`<div class="alert alert-warning">${this.state.perfError}</div>`;
        }

        if (perfLoading && !perf) {
            return html`<div class="text-muted">Loading performance timeline…</div>`;
        }

        if (!perf) {
            return html`<div class="text-muted">No performance data loaded yet.</div>`;
        }

        const points = perf.points || [];
        if (points.length === 0) {
            return html`<div class="alert alert-info">No performance telemetry available for this window.</div>`;
        }

        const fmtRange = (val) => val ? new Date(val).toLocaleString() : 'N/A';
        const latestPoint = points[points.length - 1];
        const pct = (v) => Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : 'N/A';
        const mb = (v) => Number.isFinite(Number(v)) ? `${Math.round(Number(v))} MB` : 'N/A';
        const mbps = (v) => Number.isFinite(Number(v)) ? `${Math.round(Number(v))} Mbps` : 'N/A';

        const cpuPercentiles = this.calculatePercentiles(points.map(p => p.cpuAvg ?? p.CpuAvg));
        const memPercentiles = this.calculatePercentiles(points.map(p => p.memoryAvg ?? p.MemoryAvg));
        const memMbPercentiles = this.calculatePercentiles(points.map(p => p.memoryAvgMb ?? p.MemoryAvgMb));
        const diskPercentiles = this.calculatePercentiles(points.map(p => p.diskTotalMbAvg ?? p.diskAvg ?? p.DiskAvg));
        const netPercentiles = this.calculatePercentiles(points.map(p => p.networkMbpsAvg ?? p.networkAvg ?? p.NetworkAvg));

        const bucketOptions = [
            { label: '1h buckets', value: '1h' },
            { label: '6h buckets', value: '6h' },
            { label: '1d buckets', value: '1d' }
        ];

        const rangeOptions = [
            { label: '24h', value: 1 },
            { label: '3 days', value: 3 },
            { label: '7 days', value: 7 },
            { label: '14 days', value: 14 },
            { label: '30 days', value: 30 }
        ];

        const onBucketChange = (e) => {
            const value = e.target.value;
            this.setState({ perfBucket: value }, () => this.loadPerfData(value, this.state.perfRangeDays));
        };

        const onRangeChange = (e) => {
            const value = Number(e.target.value) || 7;
            this.setState({ perfRangeDays: value }, () => this.loadPerfData(this.state.perfBucket, value));
        };

        const percentileBadge = (label, val, formatter) => html`
            <span class="badge bg-light text-body fw-normal border">${label}: ${val !== null && val !== undefined ? formatter(val) : '—'}</span>
        `;

        const headerContent = html`
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
                <div>
                    <div class="fw-bold">Performance (bucketed)</div>
                    <div class="text-muted small">
                        Window: ${fmtRange(perf.startUtc)} – ${fmtRange(perf.endUtc)} • Bucket ${perf.bucketMinutes}m • Computed ${fmtRange(perf.computedUtc)}
                    </div>
                    <div class="text-muted small">${points.length} points • ${perf.sampleCount || 0} samples${perf.fromCache ? ' • cached' : ''}${perf.isFresh ? ' • fresh' : ''}</div>
                </div>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <label class="form-label m-0 text-muted small">Bucket</label>
                    <select class="form-select form-select-sm" value=${perfBucket} onchange=${onBucketChange} disabled=${perfLoading}>
                        ${bucketOptions.map(opt => html`<option value=${opt.value} selected=${perfBucket === opt.value}>${opt.label}</option>`)}
                    </select>
                    <label class="form-label m-0 text-muted small">Range</label>
                    <select class="form-select form-select-sm" value=${perfRangeDays} onchange=${onRangeChange} disabled=${perfLoading}>
                        ${rangeOptions.map(opt => html`<option value=${opt.value} selected=${Number(perfRangeDays) === Number(opt.value)}>${opt.label}</option>`)}
                    </select>
                    ${perfLoading ? html`<div class="spinner-border spinner-border-sm text-primary" role="status"></div>` : ''}
                </div>
            </div>
        `;

        const chartGrid = html`
            <div class="row g-3">
                <div class="col-12 col-lg-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="fw-bold">CPU</div>
                                <div class="d-flex gap-1 flex-wrap">
                                    ${percentileBadge('P50', cpuPercentiles?.p50, pct)}
                                    ${percentileBadge('P90', cpuPercentiles?.p90, pct)}
                                    ${percentileBadge('P95', cpuPercentiles?.p95, pct)}
                                </div>
                            </div>
                            <div ref=${(el) => { this.perfCpuEl = el; }} style="min-height: 220px;"></div>
                            <div class="text-muted small mt-2">Latest: ${pct(latestPoint?.cpuAvg)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="fw-bold">Memory</div>
                                <div class="d-flex gap-1 flex-wrap">
                                    ${percentileBadge('P50', memPercentiles?.p50, pct)}
                                    ${percentileBadge('P90', memPercentiles?.p90, pct)}
                                    ${percentileBadge('P95', memPercentiles?.p95, pct)}
                                </div>
                            </div>
                            <div ref=${(el) => { this.perfMemEl = el; }} style="min-height: 220px;"></div>
                            <div class="text-muted small mt-2">Latest: ${pct(latestPoint?.memoryAvg)} (${mb(latestPoint?.memoryAvgMb)} used)</div>
                            <div class="text-muted small">RAM percent is relative to reported device RAM; MB line shows working set.</div>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="fw-bold">DB Footprint</div>
                                <div class="d-flex gap-1 flex-wrap">
                                    ${percentileBadge('P50', diskPercentiles?.p50, mb)}
                                    ${percentileBadge('P90', diskPercentiles?.p90, mb)}
                                    ${percentileBadge('P95', diskPercentiles?.p95, mb)}
                                </div>
                            </div>
                            <div ref=${(el) => { this.perfDiskEl = el; }} style="min-height: 220px;"></div>
                            <div class="text-muted small mt-2">Latest total: ${mb(latestPoint?.diskTotalMbAvg)} (App ${mb(latestPoint?.diskAppMbAvg)}, Intel ${mb(latestPoint?.diskIntelMbAvg)})</div>
                        </div>
                    </div>
                </div>
                <div class="col-12 col-lg-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="fw-bold">Network</div>
                                <div class="d-flex gap-1 flex-wrap">
                                    ${percentileBadge('P50', netPercentiles?.p50, mbps)}
                                    ${percentileBadge('P90', netPercentiles?.p90, mbps)}
                                    ${percentileBadge('P95', netPercentiles?.p95, mbps)}
                                </div>
                            </div>
                            <div ref=${(el) => { this.perfNetEl = el; }} style="min-height: 220px;"></div>
                            <div class="text-muted small mt-2">Latest: ${mbps(latestPoint?.networkMbpsAvg)} • Sent ${this.formatBytesHuman(latestPoint?.networkBytesSent)} • Recv ${this.formatBytesHuman(latestPoint?.networkBytesReceived)} • Requests ${Math.round(latestPoint?.networkRequests || 0)} • Failures ${Math.round(latestPoint?.networkFailures || 0)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (embedded) {
            return html`
                <div class="d-flex flex-column gap-3">
                    ${headerContent}
                    ${chartGrid}
                </div>
            `;
        }

        return html`
            <div class="row row-cards">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            ${headerContent}
                        </div>
                        <div class="card-body">
                            ${chartGrid}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSpecsTab() {
        const { html } = window;
        const { device, telemetryDetail, showAllIps } = this.state;
        const fields = telemetryDetail?.latest?.fields || {};
        const telemetry = device?.telemetry || device?.Telemetry;

        // Normalize IP addresses to an array for downstream consumers
        const ipRaw = telemetry?.ipAddresses || telemetry?.IPAddresses || fields.IPAddresses;
        const ipAddresses = (() => {
            if (Array.isArray(ipRaw)) return ipRaw;
            if (typeof ipRaw === 'string') {
                try {
                    const parsed = JSON.parse(ipRaw);
                    if (Array.isArray(parsed)) return parsed;
                } catch (err) { /* fall through to delimiter split */ }
                return ipRaw.split(/[;,\s]+/).filter(Boolean);
            }
            return [];
        })();
        const mobileStatus = this.detectMobileDevice(telemetryDetail?.history);
        const networkRisk = this.analyzeNetworkRisk(ipAddresses, telemetryDetail?.history);
        const hasExtraIps = Array.isArray(ipAddresses) && ipAddresses.length > 1;
        const toggleAllIps = (e) => {
            e.preventDefault();
            this.setState({ showAllIps: !showAllIps });
        };

        return html`
            <div class="row">
                <div class="col-md-5">
                    <h5>Hardware</h5>
                    <dl class="row text-sm">
                        <dt class="col-sm-4">CPU</dt>
                        <dd class="col-sm-8">${fields.CPUName || ''} (${fields.CPUCores || '?'} cores)</dd>
                        
                        <dt class="col-sm-4">Architecture</dt>
                        <dd class="col-sm-8">${fields.CPUArch || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">RAM</dt>
                        <dd class="col-sm-8">${fields.TotalRAMMB ? Math.round(Number(fields.TotalRAMMB) / 1024) + ' GB' : 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Disk</dt>
                        <dd class="col-sm-8">${fields.SystemDriveSizeGB || fields.TotalDiskGb || 'N/A'} GB (${fields.SystemDiskMediaType || 'N/A'}) ${fields.SystemDiskBusType || ''}</dd>
                        
                        <dt class="col-sm-4">Network</dt>
                        <dd class="col-sm-8">${fields.ConnectionType || 'N/A'} ${fields.NetworkSpeedMbps ? this.formatNetworkSpeed(fields.NetworkSpeedMbps) : ''}</dd>
                        
                        <dt class="col-sm-4">GPU</dt>
                        <dd class="col-sm-8">${fields.GPUName || 'N/A'} ${fields.GpuRamMB ? '(' + fields.GpuRamMB + ' MB)' : ''}</dd>
                    </dl>
                </div>
                <div class="col-md-5">
                    <h5>Operating System</h5>
                    <dl class="row text-sm">
                        <dt class="col-sm-4">Edition</dt>
                        <dd class="col-sm-8">${fields.OSEdition || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Version</dt>
                        <dd class="col-sm-8">${fields.OSVersion || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">Build</dt>
                        <dd class="col-sm-8">${fields.FeaturePackVersion || fields.OSBuild || 'N/A'}</dd>
                        
                        <dt class="col-sm-4">IP Address</dt>
                        <dd class="col-sm-8">
                            <div class="d-flex align-items-center gap-2 flex-wrap">
                                <span>${this.formatIPAddresses(ipAddresses, 'primary')}</span>
                                ${mobileStatus.isMobile ? html`<span class="badge badge-sm bg-info-lt">Mobile</span>` : html`<span class="badge badge-sm bg-success-lt">Stationary</span>`}
                                ${networkRisk.publicIpPresent ? html`<span class="badge badge-sm bg-warning-lt" title="Device has public IP(s)">Public IP</span>` : ''}
                                ${networkRisk.apipaPresent ? html`<span class="badge badge-sm bg-danger-lt" title="Device has APIPA address (network issue indicator)">APIPA</span>` : ''}
                                ${hasExtraIps ? html`
                                    <button class="btn btn-link btn-sm px-0" onclick=${toggleAllIps} aria-expanded=${showAllIps}>
                                        ${showAllIps ? 'Hide all IPs' : `Show all (${ipAddresses.length})`}
                                    </button>
                                ` : ''}
                            </div>
                            ${hasExtraIps && showAllIps ? html`
                                <div class="card card-sm bg-light border mt-2">
                                    <div class="card-body py-2 px-3">
                                        <div class="d-flex flex-wrap gap-1">
                                            ${this.formatIPAddresses(ipAddresses, 'full').map(ip => html`
                                                <span class="badge badge-sm bg-azure-lt me-1 mb-1">${ip}</span>
                                            `)}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </dd>
                        
                        <dt class="col-sm-4">Last Updated</dt>
                        <dd class="col-sm-8">${telemetryDetail?.latest?.timestamp ? this.formatDate(telemetryDetail.latest.timestamp) : 'N/A'}</dd>
                    </dl>
                </div>
            </div>
        `;
    }

    renderInventoryTab(enrichedApps, filteredApps) {
        const { html } = window;
        const { appViewMode } = this.state;
        const detectionBuckets = this.getDetectionBuckets(this.state.cveInventory);
        const goToCves = () => this.setState({ activeTab: 'risks' }, () => this.scrollToCveTable());
        const appSummary = this.state.appSummary || {
            total: enrichedApps.length,
            installed: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'installed').length,
            updated: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'updated').length,
            uninstalled: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'uninstalled').length
        };
        const statusFilter = this.state.appStatusFilter || 'installed';
        
        return html`
            <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
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
            <div class="mb-3 d-flex flex-wrap gap-2">
                <button class="btn btn-sm ${statusFilter === 'installed' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => this.setState({ appStatusFilter: 'installed' })}>
                    Installed <span class="badge bg-white text-primary ms-1">${appSummary.installed ?? 0}</span>
                </button>
                <button class="btn btn-sm ${statusFilter === 'updated' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => this.setState({ appStatusFilter: 'updated' })}>
                    Updated <span class="badge bg-white text-primary ms-1">${appSummary.updated ?? 0}</span>
                </button>
                <button class="btn btn-sm ${statusFilter === 'uninstalled' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => this.setState({ appStatusFilter: 'uninstalled' })}>
                    Uninstalled <span class="badge bg-white text-primary ms-1">${appSummary.uninstalled ?? 0}</span>
                </button>
                <button class="btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => this.setState({ appStatusFilter: 'all' })}>
                    All <span class="badge bg-white text-primary ms-1">${appSummary.total ?? enrichedApps.length}</span>
                </button>
            </div>
            <div class="row row-cards mb-3">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">Total Applications</div>
                            <div class="h3">${appSummary.total ?? enrichedApps.length}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">Updated</div>
                            <div class="h3"><span class="badge bg-warning-lt text-dark">${appSummary.updated ?? enrichedApps.filter(a => a.status === 'updated').length}</span></div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">Uninstalled</div>
                            <div class="h3"><span class="badge bg-success-lt text-dark">${appSummary.uninstalled ?? enrichedApps.filter(a => a.status === 'uninstalled').length}</span></div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="text-muted small">With CVEs</div>
                            <div class="h3 text-info">${enrichedApps.filter(a => this.getCvesByApp(a.appRowKey).length > 0).length}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="text-muted small">Findings confidence</div>
                        <span class="text-muted small">Opens CVE list</span>
                    </div>
                    ${this.renderDetectionButtons(detectionBuckets, { onClick: goToCves })}
                    <div class="text-muted small mt-2">Database matches = high confidence signatures; AI matches = heuristic assessments.</div>
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
                    const vendorCves = vendorApps.reduce((sum, app) => sum.concat(this.getCvesByApp(app.appRowKey)), []);
                    const totalCves = vendorCves.length;
                    const vendorDetection = this.getDetectionBuckets(vendorCves);

                    return html`
                        <div class="accordion-item">
                            <h2 class="accordion-header">
                                <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" onclick=${() => this.toggleVendor(vendorName)}>
                                    <div class="d-flex justify-content-between align-items-center w-100 pe-3">
                                        <span class="fw-bold">${vendorName}</span>
                                        <div class="d-flex gap-2 align-items-center flex-wrap justify-content-end">
                                            <span class="badge bg-secondary-lt">${vendorApps.length} apps</span>
                                            ${totalCves > 0 ? html`<span class="badge ${this.getSeverityColor(this.severityLabelFromWeight(Math.max(...vendorCves.map(c => this.severityWeight(c.severity || '')), 0)))}">${totalCves} CVEs</span>` : ''}
                                            ${this.renderDetectionButtons(vendorDetection, {
                                                size: 'sm',
                                                showLabels: false,
                                                onClick: () => this.setState({ activeTab: 'risks', cveFilterApp: null }, () => this.scrollToCveTable())
                                            })}
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
                                        const cves = this.getCvesByApp(latestVersion.appRowKey);
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
                                                            <span class="badge ${this.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                                                        ` : ''}
                                                        ${cves.length > 0 ? html`
                                                            <a href="#" class="badge ${this.getSeverityColor(worstSeverity)}" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); this.setState({ cveFilterApp: appGroup.appName, activeTab: 'risks' }, () => this.scrollToCveTable()); }}>
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

    renderDetailCharts() {
        if (!window.ApexCharts) {
            console.warn('[DeviceDetail] ApexCharts not available');
            return;
        }

        if (!this.state.device) return;

        const summary = this.state.deviceSummary;
        const enriched = this.state.enrichedScore;
        const baseScore = summary ? this.getRiskScoreValue(summary, this.calculateRiskScore(this.state.device)) : this.calculateRiskScore(this.state.device);
        const scoreRaw = enriched && enriched.score !== undefined ? enriched.score : baseScore;
        const scoreNum = Number(scoreRaw);
        const score = Number.isFinite(scoreNum) ? scoreNum : 0;
        const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

        // Use active CVEs for chart rendering (excludes uninstalled apps)
        const activeCves = this.getActiveCves();
        const criticalCves = activeCves.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL');
        const highCves = activeCves.filter(c => (c.severity || '').toUpperCase() === 'HIGH');
        const mediumCves = activeCves.filter(c => (c.severity || '').toUpperCase() === 'MEDIUM');
        const worstSeverity = criticalCves.length > 0 ? 'CRITICAL' : highCves.length > 0 ? 'HIGH' : mediumCves.length > 0 ? 'MEDIUM' : activeCves.length > 0 ? 'LOW' : 'CLEAN';
        const gradientStart = '#2fb344';

        if (this.detailRiskChartEl) {
            if (this.detailRiskChart) this.detailRiskChart.destroy();
            const riskOptions = {
                chart: {
                    type: 'radialBar',
                    height: 120,
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
                series: [clampedScore],
                plotOptions: {
                    radialBar: {
                        startAngle: -130,
                        endAngle: 130,
                        hollow: { size: '55%' },
                        track: { background: '#e9ecef', strokeWidth: '90%' },
                        dataLabels: {
                            name: { show: false },
                            value: { formatter: (val) => `${Math.round(val)}%`, fontSize: '18px', fontWeight: 700, offsetY: 6 }
                        }
                    }
                },
                stroke: { lineCap: 'round' }
            };
            this.detailRiskChart = new window.ApexCharts(this.detailRiskChartEl, riskOptions);
            this.detailRiskChart.render();
        }

        const safeNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        const vulnerableApps = this.state.appInventory.filter(app => this.state.cveInventory.some(cve => cve.appName && app.appName && cve.appName.toLowerCase() === app.appName.toLowerCase())).length;
        const totalApps = this.state.appInventory.length;
        const healthyApps = Math.max(totalApps - vulnerableApps, 0);
        const appsSeries = totalApps > 0 ? [safeNum(vulnerableApps), safeNum(healthyApps)] : [1];
        const appsLabels = totalApps > 0 ? ['Vulnerable', 'Healthy'] : ['No data'];
        const appsColors = totalApps > 0 ? ['#d63939', '#2fb344'] : ['#e9ecef'];
        const appsTotalLabel = totalApps > 0 ? `${vulnerableApps}/${totalApps}` : '0/0';

        if (this.detailAppsChartEl) {
            if (this.detailAppsChart) this.detailAppsChart.destroy();
            const appsOptions = {
                chart: { type: 'donut', height: 95, sparkline: { enabled: true } },
                series: appsSeries,
                labels: appsLabels,
                colors: appsColors,
                legend: { show: false },
                dataLabels: { enabled: false },
                stroke: { width: 0 },
                plotOptions: {
                    pie: {
                        donut: {
                            size: '70%',
                            labels: { show: true, name: { show: false }, value: { show: false }, total: { show: true, label: '', formatter: () => appsTotalLabel } }
                        }
                    }
                }
            };
            this.detailAppsChart = new window.ApexCharts(this.detailAppsChartEl, appsOptions);
            this.detailAppsChart.render();
        }

        const critCount = safeNum(criticalCves.length);
        const highCount = safeNum(highCves.length);
        const mediumCount = safeNum(mediumCves.length);
        const lowCount = safeNum(this.state.cveInventory.filter(c => (c.severity || '').toUpperCase() === 'LOW').length);
        const totalCves = safeNum(this.state.cveInventory.length);
        const cveSeries = totalCves > 0 ? [critCount, highCount, mediumCount, lowCount] : [1];
        const cveLabels = totalCves > 0 ? ['Critical', 'High', 'Medium', 'Low'] : ['No CVEs'];
        const cveColors = totalCves > 0 ? ['#d63939', '#f59f00', '#fab005', '#74b816'] : ['#e9ecef'];

        if (this.detailCvesChartEl) {
            if (this.detailCvesChart) this.detailCvesChart.destroy();
            const cveOptions = {
                chart: { type: 'donut', height: 95, sparkline: { enabled: true } },
                series: cveSeries,
                labels: cveLabels,
                colors: cveColors,
                legend: { show: false },
                dataLabels: { enabled: false },
                stroke: { width: 0 },
                plotOptions: {
                    pie: {
                        donut: {
                            size: '70%',
                            labels: { show: true, name: { show: false }, value: { show: false }, total: { show: true, label: '', formatter: () => `${totalCves}` } }
                        }
                    }
                }
            };
            this.detailCvesChart = new window.ApexCharts(this.detailCvesChartEl, cveOptions);
            this.detailCvesChart.render();
        }
    }

    calculatePercentiles(values) {
        const nums = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        if (nums.length === 0) return null;

        const pick = (p) => {
            const idx = Math.max(0, Math.min(nums.length - 1, Math.floor(p * (nums.length - 1))));
            return nums[idx];
        };

        return {
            p50: pick(0.5),
            p90: pick(0.9),
            p95: pick(0.95),
            max: nums[nums.length - 1],
            latest: nums[nums.length - 1]
        };
    }
    
    destroyPidSessionChart(message = '') {
        if (this.pidSessionChart && typeof this.pidSessionChart.destroy === 'function') {
            this.pidSessionChart.destroy();
            this.pidSessionChart = null;
        }

        if (this.pidSessionChartEl) {
            this.pidSessionChartEl.innerHTML = message ? `<div class="text-muted small">${message}</div>` : '';
        }
    }

    renderSessionChart() {
        if (!this.state.sessionExpanded || this.state.sessionTab !== 'version') {
            this.destroySessionChart('', false);
            return;
        }

        const sessions = this.state.deviceSessions;
        const monitoringSessions = this.getMonitoringSessions(sessions);
        const combinedSessions = Array.isArray(monitoringSessions) && monitoringSessions.length > 0
            ? monitoringSessions
            : this.getVersionSessions(sessions);

        if (!window.ApexCharts) {
            this.destroySessionChart('Monitoring sessions unavailable (charts not loaded).');
            return;
        }

        if (!Array.isArray(combinedSessions) || combinedSessions.length === 0) {
            this.destroySessionChart('No monitoring sessions in this window.');
            return;
        }

        const toTimestamp = (value) => {
            const ts = new Date(value).getTime();
            return Number.isFinite(ts) ? ts : NaN;
        };

        const now = Date.now();
        const normalizeSeg = (seg) => {
            const startTs = toTimestamp(seg.StartUtc ?? seg.startUtc ?? seg.start);
            const endCandidate = toTimestamp(seg.EndUtc ?? seg.endUtc ?? seg.end);
            const sysStartTs = toTimestamp(seg.SystemStartUtc ?? seg.systemStartUtc);
            if (!Number.isFinite(startTs)) return null;

            const closedEnd = Number.isFinite(endCandidate) ? endCandidate : startTs;
            const endTs = (seg.IsOpen || seg.isOpen) ? now : closedEnd;
            const finalEnd = Number.isFinite(endTs) ? Math.max(startTs, endTs) : startTs;
            const safeEnd = Number.isFinite(finalEnd) ? Math.max(startTs + 1, finalEnd) : startTs + 1;
            if (!Number.isFinite(safeEnd)) return null;

            const glitches = Array.isArray(seg.Glitches) ? seg.Glitches : Array.isArray(seg.glitches) ? seg.glitches : [];
            const samples = seg.Samples ?? seg.samples ?? 0;
            return {
                label: this.formatMonitoringLabel(seg),
                startTs,
                endTs: safeEnd,
                systemStartTs: Number.isFinite(sysStartTs) ? sysStartTs : null,
                glitches,
                samples
            };
        };

        const normalized = combinedSessions
            .map(normalizeSeg)
            .filter(Boolean)
            .sort((a, b) => a.startTs - b.startTs);

        const monitoringData = normalized.map(seg => ({ x: 'Monitoring', y: [seg.startTs, seg.endTs], glitches: seg.glitches, samples: seg.samples, versionLabel: seg.label }));

        const hasInvalid = monitoringData.some(d => !Number.isFinite(d.y?.[0]) || !Number.isFinite(d.y?.[1]));
        if (hasInvalid) {
            console.warn('[DeviceDetail] Skipping monitoring session chart due to invalid timestamps', { monitoringData });
            this.destroySessionChart('Monitoring session history unavailable (invalid timestamps).');
            return;
        }

        if (monitoringData.length === 0) {
            this.destroySessionChart('No monitoring sessions in this window.');
            return;
        }

        const systemSeries = [];
        const offlineSeries = [];
        const noCoverageSeries = [];
        normalized.forEach((seg, idx) => {
            const sysStart = seg.systemStartTs ?? seg.startTs;
            systemSeries.push({ x: 'System', y: [sysStart, seg.endTs] });

            if (Number.isFinite(sysStart) && sysStart < seg.startTs) {
                noCoverageSeries.push({ x: 'System', y: [sysStart, seg.startTs] });
            }

            const next = normalized[idx + 1];
            const nextStart = next ? (next.systemStartTs ?? next.startTs) : null;
            if (Number.isFinite(nextStart) && seg.endTs < nextStart) {
                offlineSeries.push({ x: 'System', y: [seg.endTs, nextStart] });
            }
        });

        if (this.sessionChart) {
            this.sessionChart.destroy();
            this.sessionChart = null;
        }

        if (this.sessionChartEl) {
            this.sessionChartEl.innerHTML = '';
        }

        const options = {
            chart: {
                type: 'rangeBar',
                height: 260,
                toolbar: { show: false }
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: '70%',
                    rangeBarGroupRows: true
                }
            },
            series: [
                ...(offlineSeries.length ? [{ name: 'Offline', data: offlineSeries, color: '#868e96' }] : []),
                ...(systemSeries.length ? [{ name: 'System Up', data: systemSeries, color: '#1c7ed6' }] : []),
                ...(noCoverageSeries.length ? [{ name: 'No Coverage', data: noCoverageSeries, color: '#f03e3e' }] : []),
                { name: 'Monitoring', data: monitoringData, color: '#2f9e44' }
            ],
            colors: ['#868e96', '#1c7ed6', '#f03e3e', '#2f9e44'],
            fill: { opacity: [0.65, 0.75, 0.85, 1] },
            legend: { show: true, position: 'top' },
            dataLabels: {
                enabled: true,
                formatter: (_val, opts) => {
                    const series = opts.w?.config?.series?.[opts.seriesIndex];
                    const point = series?.data?.[opts.dataPointIndex];
                    if (series?.name === 'Monitoring') {
                        return point?.versionLabel || 'Monitoring';
                    }
                    return series?.name || '';
                },
                style: { colors: ['#fff'], fontSize: '11px' }
            },
            xaxis: {
                type: 'datetime',
                labels: { datetimeFormatter: { hour: 'MMM dd HH:mm', day: 'MMM dd' } }
            },
            yaxis: {
                categories: ['Monitoring', 'System'],
                reversed: true,
                labels: { style: { fontSize: '11px' } }
            },
            grid: { strokeDashArray: 4 },
            tooltip: {
                custom: ({ seriesIndex, dataPointIndex, w }) => {
                    const series = w?.config?.series?.[seriesIndex];
                    const seg = series?.data?.[dataPointIndex];
                    if (!seg) return '';
                    const fmt = (v) => new Date(v).toLocaleString();
                    const glitches = Array.isArray(seg.glitches) ? seg.glitches : [];
                    const glitchCount = glitches.length;
                    const samples = Number(seg.samples) || 0;
                    const glitchDetails = series?.name === 'Monitoring' && glitchCount > 0 ? `<div class="text-muted small">Glitches: ${glitchCount}</div>` : '';
                    const sampleDetails = series?.name === 'Monitoring' ? `<div class="text-muted small">Samples: ${samples}</div>` : '';
                    const offlineNote = series?.name === 'Offline' ? '<div class="text-muted small">System state unknown or powering off; monitoring not running.</div>' : '';
                    const noCoverageNote = series?.name === 'No Coverage' ? '<div class="text-muted small">System up but monitoring inactive.</div>' : '';
                    return `
                        <div class="apex-tooltip p-2">
                            <div><strong>${series?.name || ''}</strong>${seg.versionLabel && series?.name === 'Monitoring' ? ` · ${seg.versionLabel}` : ''}</div>
                            <div class="text-muted small">${fmt(seg.y[0])} – ${fmt(seg.y[1])}</div>
                            ${sampleDetails}
                            ${glitchDetails}
                            ${offlineNote}
                            ${noCoverageNote}
                        </div>`;
                }
            }
        };

        this.sessionChart = new window.ApexCharts(this.sessionChartEl, options);
        this.sessionChart.render();
    }

    renderPidSessionChart() {
        if (!this.state.sessionExpanded || this.state.sessionTab !== 'pid') {
            this.destroyPidSessionChart();
            return;
        }

        const sessions = this.state.deviceSessions;
        const pidSessionsRaw = this.getPidSessions(sessions);
        const pidSessions = Array.isArray(pidSessionsRaw)
            ? pidSessionsRaw.filter(seg => seg && (seg.Pid || seg.pid || seg.Label || seg.label))
            : [];

        if (!window.ApexCharts) {
            this.destroyPidSessionChart('PID session history unavailable (charts not loaded).');
            return;
        }

        if (!Array.isArray(pidSessions) || pidSessions.length === 0) {
            this.destroyPidSessionChart('No PID session history in this window.');
            return;
        }

        const toTimestamp = (value) => {
            const ts = new Date(value).getTime();
            return Number.isFinite(ts) ? ts : NaN;
        };

        const now = Date.now();
        const mapSegments = (segments, labelResolver) => segments
            .map(seg => {
                const label = labelResolver(seg) || 'PID';
                const startTs = toTimestamp(seg.StartUtc ?? seg.startUtc ?? seg.start);
                const endCandidate = toTimestamp(seg.EndUtc ?? seg.endUtc ?? seg.end);
                if (!Number.isFinite(startTs)) return null;

                const closedEnd = Number.isFinite(endCandidate) ? endCandidate : startTs;
                const endTs = (seg.IsOpen || seg.isOpen) ? now : closedEnd;
                const finalEnd = Number.isFinite(endTs) ? Math.max(startTs, endTs) : startTs;
                const safeEnd = Number.isFinite(finalEnd) ? Math.max(startTs + 1, finalEnd) : startTs + 1;

                if (!Number.isFinite(safeEnd)) return null;

                return { x: label, y: [startTs, safeEnd] };
            })
            .filter(seg => seg && Number.isFinite(seg.y?.[0]) && Number.isFinite(seg.y?.[1]))
            .sort((a, b) => a.y[0] - b.y[0]);

        const pidData = mapSegments(pidSessions, (seg) => seg.Pid || seg.pid || seg.Label || seg.label)
            .map((seg, idx) => ({ ...seg, x: `Session ${idx + 1}` }));

        const hasInvalid = pidData.some(d => !Number.isFinite(d.y?.[0]) || !Number.isFinite(d.y?.[1]));
        if (hasInvalid) {
            console.warn('[DeviceDetail] Skipping PID session chart due to invalid timestamps', { pidData });
            this.destroyPidSessionChart('PID session history unavailable (invalid timestamps).');
            return;
        }

        if (pidData.length === 0) {
            this.destroyPidSessionChart('No PID session history in this window.');
            return;
        }

        if (this.pidSessionChart) {
            this.pidSessionChart.destroy();
            this.pidSessionChart = null;
        }

        if (this.pidSessionChartEl) {
            this.pidSessionChartEl.innerHTML = '';
        }

        const options = {
            chart: {
                type: 'rangeBar',
                height: 220,
                toolbar: { show: false }
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: '70%'
                }
            },
            series: [{ name: 'PID', data: pidData }],
            colors: ['#0ca678'],
            legend: { show: false },
            dataLabels: { enabled: false },
            xaxis: {
                type: 'datetime',
                labels: { datetimeFormatter: { hour: 'MMM dd HH:mm', day: 'MMM dd' } }
            },
            yaxis: { labels: { style: { fontSize: '11px' } } },
            grid: { strokeDashArray: 4 },
            tooltip: {
                custom: ({ seriesIndex, dataPointIndex, w }) => {
                    const series = w?.config?.series?.[seriesIndex];
                    const seg = series?.data?.[dataPointIndex];
                    if (!seg) return '';
                    const fmt = (v) => new Date(v).toLocaleString();
                    return `
                        <div class="apex-tooltip p-2">
                            <div><strong>${seg.x || ''}</strong></div>
                            <div class="text-muted small">${fmt(seg.y[0])} – ${fmt(seg.y[1])}</div>
                        </div>`;
                }
            }
        };

        this.pidSessionChart = new window.ApexCharts(this.pidSessionChartEl, options);
        this.pidSessionChart.render();
    }

    renderPerfCharts() {
        if (!window.ApexCharts) {
            console.warn('[DeviceDetail] ApexCharts not available for perf charts');
            return;
        }

        if (!this.state.sessionExpanded || this.state.sessionTab !== 'perf') {
            this.destroyPerfCharts();
            return;
        }

        const perf = this.state.perfData;
        const rawPoints = Array.isArray(perf?.points) ? perf.points : [];

        const coerceTs = (p) => {
            const candidate = p.timestamp ?? p.bucketStartUtc ?? p.BucketStartUtc ?? p.bucketUtc ?? p.BucketUtc ?? p.startUtc ?? p.StartUtc;
            if (Number.isFinite(candidate)) return candidate;
            const ts = new Date(candidate).getTime();
            return Number.isFinite(ts) ? ts : NaN;
        };

        const validPoints = rawPoints
            .map((p) => ({ ...p, __ts: coerceTs(p) }))
            .filter((p) => Number.isFinite(p.__ts));

        if (!perf || validPoints.length === 0) {
            this.destroyPerfCharts();
            return;
        }

        const clampPct = (val) => {
            const n = Number(val);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(100, Math.round(n)));
        };

        const numeric = (val) => {
            const n = Number(val);
            return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
        };

        const points = validPoints
            .map(p => ({
                ts: p.__ts,
                cpu: clampPct(p.cpuAvg ?? p.CpuAvg),
                memPct: clampPct(p.memoryAvg ?? p.MemoryAvg),
                memMb: numeric(p.memoryAvgMb ?? p.MemoryAvgMb),
                diskTotal: numeric(p.diskTotalMbAvg ?? p.diskAvg ?? p.DiskAvg),
                diskApp: numeric(p.diskAppMbAvg ?? p.DiskAppMbAvg),
                diskIntel: numeric(p.diskIntelMbAvg ?? p.DiskIntelMbAvg),
                netMbps: numeric(p.networkMbpsAvg ?? p.networkAvg ?? p.NetworkAvg),
                netSentBytes: numeric(p.networkBytesSent ?? p.NetworkBytesSent ?? 0),
                netRecvBytes: numeric(p.networkBytesReceived ?? p.NetworkBytesReceived ?? 0),
                netRequests: numeric(p.networkRequests ?? p.NetworkRequests),
                netFailures: numeric(p.networkFailures ?? p.NetworkFailures)
            }))
            .filter(p => Number.isFinite(p.ts)
                && Number.isFinite(p.cpu)
                && Number.isFinite(p.memPct)
                && Number.isFinite(p.memMb)
                && Number.isFinite(p.diskTotal)
                && Number.isFinite(p.diskApp)
                && Number.isFinite(p.diskIntel)
                && Number.isFinite(p.netMbps)
                && Number.isFinite(p.netSentBytes)
                && Number.isFinite(p.netRecvBytes)
                && Number.isFinite(p.netRequests)
                && Number.isFinite(p.netFailures))
            .sort((a, b) => a.ts - b.ts);

        if (points.length === 0) {
            this.destroyPerfCharts();
            return;
        }

        const buildAnnotations = (percentiles, formatter) => {
            if (!percentiles) return [];
            const lines = [];
            const addLine = (value, label, color) => {
                if (!Number.isFinite(value)) return;
                lines.push({
                    y: value,
                    borderColor: color,
                    strokeDashArray: 4,
                    label: {
                        borderColor: color,
                        style: { color: '#000', background: '#fff' },
                        text: `${label} ${formatter(value)}`
                    }
                });
            };
            addLine(percentiles.p50, 'P50', '#868e96');
            addLine(percentiles.p90, 'P90', '#fab005');
            addLine(percentiles.p95, 'P95', '#d63939');
            return lines;
        };

        const chartConfigs = [
            {
                key: 'cpu',
                el: 'perfCpuEl',
                series: [
                    { name: 'CPU %', data: points.map(p => [p.ts, p.cpu]) }
                ],
                colors: ['#206bc4'],
                yaxis: [{ min: 0, max: 100, labels: { formatter: (val) => `${Math.round(val)}%` }, title: { text: 'CPU (%)' } }],
                tooltipFormatter: (val) => `${Math.round(val)}%`,
                annotations: buildAnnotations(this.calculatePercentiles(points.map(p => p.cpu)), (v) => `${Math.round(v)}%`)
            },
            {
                key: 'mem',
                el: 'perfMemEl',
                series: [
                    { name: 'Memory %', data: points.map(p => [p.ts, p.memPct]) },
                    { name: 'Memory MB', data: points.map(p => [p.ts, p.memMb]) }
                ],
                colors: ['#0ca678', '#15aabf'],
                yaxis: [
                    { min: 0, max: 100, labels: { formatter: (val) => `${Math.round(val)}%` }, title: { text: 'Memory (%)' } },
                    { opposite: true, labels: { formatter: (val) => `${Math.round(val)} MB` }, title: { text: 'Working Set (MB)' } }
                ],
                tooltipFormatter: (val, opts) => opts.seriesIndex === 0 ? `${Math.round(val)}%` : `${Math.round(val)} MB`,
                annotations: buildAnnotations(this.calculatePercentiles(points.map(p => p.memPct)), (v) => `${Math.round(v)}%`)
            },
            {
                key: 'disk',
                el: 'perfDiskEl',
                series: [
                    { name: 'Total MB', data: points.map(p => [p.ts, p.diskTotal]) },
                    { name: 'App DB MB', data: points.map(p => [p.ts, p.diskApp]) },
                    { name: 'Intel DB MB', data: points.map(p => [p.ts, p.diskIntel]) }
                ],
                colors: ['#fab005', '#ffa94d', '#ffd43b'],
                yaxis: [{ min: 0, labels: { formatter: (val) => `${Math.round(val)} MB` }, title: { text: 'DB Size (MB)' } }],
                tooltipFormatter: (val) => `${Math.round(val)} MB`,
                annotations: buildAnnotations(this.calculatePercentiles(points.map(p => p.diskTotal)), (v) => `${Math.round(v)} MB`)
            },
            {
                key: 'net',
                el: 'perfNetEl',
                series: [
                    { name: 'Throughput Mbps', type: 'area', data: points.map(p => [p.ts, p.netMbps]) },
                    { name: 'Requests', type: 'column', data: points.map(p => [p.ts, p.netRequests]) },
                    { name: 'Failures', type: 'column', data: points.map(p => [p.ts, p.netFailures]) }
                ],
                colors: ['#a34ee3', '#2fb344', '#d63939'],
                yaxis: [
                    { labels: { formatter: (val) => `${Math.round(val)} Mbps` }, title: { text: 'Network (Mbps)' } },
                    { opposite: true, labels: { formatter: (val) => `${Math.round(val)}` }, title: { text: 'Requests / Failures' } }
                ],
                tooltipFormatter: (val, opts) => {
                    if (opts.seriesIndex === 0) return `${Math.round(val)} Mbps`;
                    const point = points[opts.dataPointIndex] || {};
                    const sent = this.formatBytesHuman(point.netSentBytes);
                    const recv = this.formatBytesHuman(point.netRecvBytes);
                    if (opts.seriesIndex === 1) return `${Math.round(val)} requests (sent ${sent}, recv ${recv})`;
                    return `${Math.round(val)} failures (sent ${sent}, recv ${recv})`;
                },
                annotations: buildAnnotations(this.calculatePercentiles(points.map(p => p.netMbps)), (v) => `${Math.round(v)} Mbps`)
            }
        ];

        chartConfigs.forEach(cfg => {
            const el = this[cfg.el];
            if (!el) return;

            const seriesData = (cfg.series || []).map((s) => ({
                name: s.name,
                type: s.type || 'area',
                data: s.data.filter(([ts, val]) => Number.isFinite(ts) && Number.isFinite(val))
            })).filter(s => s.data.length > 0);

            const hasInvalid = seriesData.some(s => s.data.some(([ts, val]) => !Number.isFinite(ts) || !Number.isFinite(val)));
            if (hasInvalid || seriesData.length === 0) {
                console.warn('[DeviceDetail] Skipping perf chart due to invalid series', cfg.key);
                if (this.perfCharts[cfg.key]) {
                    this.perfCharts[cfg.key].destroy();
                    this.perfCharts[cfg.key] = null;
                }
                return;
            }

            if (seriesData.length === 0) {
                if (this.perfCharts[cfg.key]) {
                    this.perfCharts[cfg.key].destroy();
                    this.perfCharts[cfg.key] = null;
                }
                return;
            }

            if (this.perfCharts[cfg.key]) {
                this.perfCharts[cfg.key].destroy();
                this.perfCharts[cfg.key] = null;
            }

            const options = {
                chart: {
                    height: 220,
                    toolbar: { show: false },
                    animations: { enabled: true },
                    stacked: cfg.key === 'disk'
                },
                colors: cfg.colors,
                stroke: { curve: 'straight', width: 2 },
                fill: {
                    type: 'gradient',
                    gradient: {
                        shadeIntensity: 0.6,
                        opacityFrom: 0.35,
                        opacityTo: 0.05
                    }
                },
                dataLabels: { enabled: false },
                legend: { show: true },
                xaxis: {
                    type: 'datetime',
                    labels: { datetimeUTC: false }
                },
                yaxis: cfg.yaxis,
                tooltip: {
                    shared: false,
                    x: { format: 'MMM dd, HH:mm' },
                    y: { formatter: cfg.tooltipFormatter }
                },
                annotations: { yaxis: cfg.annotations },
                series: seriesData
            };

            this.perfCharts[cfg.key] = new window.ApexCharts(el, options);
            this.perfCharts[cfg.key].render();
        });
    }

    destroyDetailCharts() {
        if (this.detailRiskChart) { this.detailRiskChart.destroy(); this.detailRiskChart = null; }
        if (this.detailAppsChart) { this.detailAppsChart.destroy(); this.detailAppsChart = null; }
        if (this.detailCvesChart) { this.detailCvesChart.destroy(); this.detailCvesChart = null; }
        if (this.detailRiskChartEl) this.detailRiskChartEl.innerHTML = '';
        if (this.detailAppsChartEl) this.detailAppsChartEl.innerHTML = '';
        if (this.detailCvesChartEl) this.detailCvesChartEl.innerHTML = '';
    }

    destroyPerfCharts() {
        if (this.perfCharts) {
            Object.keys(this.perfCharts).forEach(key => {
                const chart = this.perfCharts[key];
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
                this.perfCharts[key] = null;
            });
        }

        ['perfCpuEl', 'perfMemEl', 'perfDiskEl', 'perfNetEl'].forEach(ref => {
            if (this[ref]) {
                this[ref].innerHTML = '';
            }
        });
    }

    destroySessionChart(message = '', destroyPidToo = true) {
        if (this.sessionChart && typeof this.sessionChart.destroy === 'function') {
            this.sessionChart.destroy();
            this.sessionChart = null;
        }

        if (this.sessionChartEl) {
            this.sessionChartEl.innerHTML = message ? `<div class="text-muted small">${message}</div>` : '';
        }

        // Also clear PID chart to keep both timelines in sync when requested
        if (destroyPidToo) {
            this.destroyPidSessionChart();
        }
    }

    async loadSessionTimeline(force = false) {
        if (this.state.sessionLoading) return;
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ sessionError: 'No organization selected', sessionLoading: false });
            return;
        }
        if (!this.state.deviceId) {
            this.setState({ sessionError: 'Invalid device id', sessionLoading: false });
            return;
        }

        this.setState({ sessionLoading: true, sessionError: null });
        try {
            const resp = await api.getDeviceSessions(
                currentOrg.orgId,
                this.state.deviceId,
                { bucket: '6h', forceRefresh: force || !this.state.deviceSessions },
                { skipCache: true }
            );
            if (resp?.success) {
                this.setState({ deviceSessions: resp.data });
            } else {
                this.setState({ sessionError: resp?.message || 'Failed to load session timeline' });
            }
        } catch (err) {
            console.warn('[DeviceDetail] Session fetch failed', err);
            this.setState({ sessionError: err?.message || 'Failed to load session timeline' });
        } finally {
            this.setState({ sessionLoading: false }, () => {
                if (this.state.sessionExpanded && this.state.deviceSessions) {
                    this.renderSessionChart();
                }
            });
        }
    }

    toggleSessionCollapse() {
        const next = !this.state.sessionExpanded;
        this.setState({ sessionExpanded: next, sessionTab: next ? 'specs' : this.state.sessionTab }, () => {
            if (this.state.sessionExpanded) {
                this.loadSessionTimeline();
            } else {
                this.destroySessionChart();
            }
        });
    }

    renderFlatListView(filteredApps) {
        const { html } = window;
        
        return html`
            <div class="table-responsive">
                <table class="table table-sm table-hover" id="apps-table">
                    <thead>
                        <tr>
                            <th>Application</th>
                            <th>Vendor</th>
                            <th>Version</th>
                            <th>Status</th>
                            <th>
                                <a href="#" onclick=${(e)=>{e.preventDefault(); this.setState({ appSortKey: this.state.appSortKey==='severity' ? 'cveCount' : 'severity', appSortDir: this.state.appSortDir==='desc' ? 'asc':'desc' });}} class="text-reset text-decoration-none">Risk & CVEs</a>
                            </th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredApps.map(app => {
                            const cves = this.getCvesByApp(app.appRowKey);
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
                                                                                ${app.status === 'updated' ? html`<span class="badge bg-warning-lt text-dark">Updated${app.updatedFromVersion ? ` from v${app.updatedFromVersion}` : ''}</span>` : 
                                                                                    app.status === 'uninstalled' ? html`<span class="badge bg-success-lt text-dark">Uninstalled</span>` : 
                                                                                    html`<span class="badge bg-blue-lt text-dark">Installed</span>`}
                                    </td>
                                    <td>
                                        ${cves.length > 0 ? html`
                                            <button class=${`btn btn-sm ${this.getSeverityOutlineClass(worstSeverity)} d-inline-flex align-items-center gap-2`}
                                                onclick=${(e) => { e.preventDefault(); this.setState({ cveFilterApp: app.appName, activeTab: 'risks' }, () => this.scrollToCveTable()); }}
                                                title="View CVEs for this application">
                                                ${app.matchType === 'absolute' ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 L12 3 L21 12 Z"/></svg>` : ''}
                                                ${app.matchType === 'heuristic' ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l3 4.5l-3 4.5h-6l-3 -4.5z"/><path d="M9 4v9"/><path d="M15 4v9"/></svg>` : ''}
                                                <span class="fw-semibold">${worstSeverity}</span>
                                                <span class=${`badge ${this.getSeverityColor(worstSeverity)}`}>${cves.length} CVE${cves.length > 1 ? 's' : ''}</span>
                                            </button>
                                            <div class="text-muted small mt-1">
                                                ${cves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical').length > 0 ? html`<span class="badge badge-sm bg-danger me-1">${cves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical').length} Critical</span>` : ''}
                                                ${cves.filter(c => c.severity === 'HIGH' || c.severity === 'High').length > 0 ? html`<span class="badge badge-sm bg-warning me-1">${cves.filter(c => c.severity === 'HIGH' || c.severity === 'High').length} High</span>` : ''}
                                                ${cves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length > 0 ? html`<span class="badge badge-sm bg-info me-1">${cves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length} Med</span>` : ''}
                                                ${cves.filter(c => c.severity === 'LOW' || c.severity === 'Low').length > 0 ? html`<span class="badge badge-sm bg-success-lt">${cves.filter(c => c.severity === 'LOW' || c.severity === 'Low').length} Low</span>` : ''}
                                            </div>
                                        ` : html`
                                            <span class="badge bg-success-lt">No CVEs</span>
                                        `}
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

    renderTelemetryTab() {
        const { html } = window;
        
        const telemetryData = this.state.telemetryDetail;
        const telemetryHistory = this.state.telemetryHistory || [];
        const changes = telemetryData?.changes || [];
        
        if (!telemetryData || (!telemetryHistory.length && !changes.length)) {
            return html`
                <div class="alert alert-info">
                    <svg class="icon me-2" width="20" height="20"><path stroke="currentColor" stroke-width="2" fill="none" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"/><path d="M12 7v5"/><circle cx="12" cy="16" r="1"/></svg>
                    No telemetry history available
                </div>
            `;
        }
        
        // Build timeline from history and changes
        const timeline = [];
        
        // Add history snapshots
        (telemetryHistory || []).forEach((snapshot, idx) => {
            timeline.push({
                type: 'snapshot',
                timestamp: snapshot.timestamp || snapshot.Timestamp,
                snapshot: snapshot,
                index: idx
            });
        });
        
        // Add field-level changes
        (changes || []).forEach((change, idx) => {
            timeline.push({
                type: 'change',
                timestamp: change.timestamp,
                field: change.fieldName,
                oldValue: change.oldValue,
                newValue: change.newValue,
                index: idx
            });
        });
        
        // Sort by timestamp descending (newest first)
        timeline.sort((a, b) => {
            const aTime = new Date(a.timestamp || 0).getTime();
            const bTime = new Date(b.timestamp || 0).getTime();
            return bTime - aTime;
        });
        
        const formatDate = (dateStr) => {
            try {
                return new Date(dateStr).toLocaleString();
            } catch {
                return dateStr;
            }
        };
        
        const formatValue = (val) => {
            if (typeof val === 'boolean') return val ? 'Yes' : 'No';
            if (!val) return '—';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val).substring(0, 100);
        };
        
        return html`
            <div class="telemetry-timeline">
                <div class="mb-3">
                    <div class="text-muted small">
                        <strong>${telemetryHistory.length}</strong> telemetry snapshots · 
                        <strong>${changes.length}</strong> field changes detected
                    </div>
                </div>
                
                <div class="timeline-container">
                    ${timeline.slice(0, 50).map((item, idx) => {
                        if (item.type === 'snapshot') {
                            const snapshot = item.snapshot;
                            const fields = snapshot.fields || snapshot || {};
                            const timestamp = snapshot.timestamp || snapshot.Timestamp || new Date().toISOString();
                            
                            return html`
                                <div class="timeline-item mb-3" key=${idx}>
                                    <div class="timeline-marker">
                                        <div class="timeline-dot" style="background: #4299e1;"></div>
                                    </div>
                                    <div class="timeline-content">
                                        <div class="card">
                                            <div class="card-header py-2">
                                                <div class="d-flex align-items-center justify-content-between">
                                                    <div class="small">
                                                        <strong>Telemetry Snapshot</strong>
                                                        <div class="text-muted">${formatDate(timestamp)}</div>
                                                    </div>
                                                    <span class="badge bg-info-lt text-info">Snapshot</span>
                                                </div>
                                            </div>
                                            <div class="card-body py-2">
                                                <div class="row g-2 small">
                                                    ${Object.entries(fields).slice(0, 6).map(([key, val]) => html`
                                                        <div class="col-6">
                                                            <div class="text-muted">${key}</div>
                                                            <div class="font-weight-medium text-truncate" title=${String(val)}>
                                                                ${formatValue(val)}
                                                            </div>
                                                        </div>
                                                    `)}
                                                </div>
                                                ${Object.keys(fields).length > 6 ? html`
                                                    <div class="mt-2 text-muted small">
                                                        +${Object.keys(fields).length - 6} more fields
                                                    </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        } else if (item.type === 'change') {
                            const severity = item.newValue === 'Critical' || item.newValue === 'High' ? 'danger' : 'info';
                            
                            return html`
                                <div class="timeline-item mb-3" key=${idx}>
                                    <div class="timeline-marker">
                                        <div class="timeline-dot" style="background: #f76707;"></div>
                                    </div>
                                    <div class="timeline-content">
                                        <div class="card border-${severity}">
                                            <div class="card-header py-2">
                                                <div class="d-flex align-items-center justify-content-between">
                                                    <div class="small">
                                                        <strong>${item.field}</strong>
                                                        <div class="text-muted">${formatDate(item.timestamp)}</div>
                                                    </div>
                                                    <span class="badge bg-warning-lt text-warning">Change</span>
                                                </div>
                                            </div>
                                            <div class="card-body py-2">
                                                <div class="row g-2 small">
                                                    <div class="col-6">
                                                        <div class="text-muted">From</div>
                                                        <div class="font-weight-medium text-truncate text-danger" title=${String(item.oldValue)}>
                                                            ${formatValue(item.oldValue)}
                                                        </div>
                                                    </div>
                                                    <div class="col-6">
                                                        <div class="text-muted">To</div>
                                                        <div class="font-weight-medium text-truncate text-success" title=${String(item.newValue)}>
                                                            ${formatValue(item.newValue)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    })}
                </div>
                
                ${timeline.length > 50 ? html`
                    <div class="alert alert-info small mt-3">
                        Showing first 50 items of ${timeline.length} total
                    </div>
                ` : ''}
            </div>
            
            <style>
                .timeline-container {
                    position: relative;
                    padding-left: 20px;
                }
                
                .timeline-item {
                    position: relative;
                    padding-left: 20px;
                }
                
                .timeline-item::before {
                    content: '';
                    position: absolute;
                    left: -3px;
                    top: 30px;
                    bottom: -30px;
                    width: 1px;
                    background: #e0e0e0;
                }
                
                .timeline-item:last-child::before {
                    display: none;
                }
                
                .timeline-marker {
                    position: absolute;
                    left: -10px;
                    top: 5px;
                }
                
                .timeline-dot {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 0 0 2px #e0e0e0;
                }
            </style>
        `;
    }

    renderRiskAssessment() {
        const { html } = window;

        const { activeApps, activeCves } = this.getActiveAppsAndCves();
        const critical = activeCves.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL');
        const high = activeCves.filter(c => (c.severity || '').toUpperCase() === 'HIGH');
        const medium = activeCves.filter(c => (c.severity || '').toUpperCase() === 'MEDIUM');
        const low = activeCves.filter(c => (c.severity || '').toUpperCase() === 'LOW');
        const worstSeverity = this.getWorstSeverity?.(activeCves) || (critical.length ? 'CRITICAL' : high.length ? 'HIGH' : medium.length ? 'MEDIUM' : low.length ? 'LOW' : 'CLEAN');
        const riskScoreValue = (() => {
            const raw = this.getRiskScoreValue(this.state.deviceSummary, this.calculateRiskScore(this.state.device));
            const n = Number(raw);
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(100, Math.round(n)));
        })();
        const knownExploitCount = this.state.knownExploits ? activeCves.filter(c => this.state.knownExploits.has(c.cveId)).length : 0;
        const vulnerableApps = (() => {
            const set = new Set();
            activeCves.forEach(c => { if (c.appName) set.add(c.appName); });
            return set.size;
        })();
        const maxEpss = activeCves.reduce((max, c) => Math.max(max, Number(c.epss || 0)), 0);
        const epssBadge = maxEpss >= 0.5 ? 'bg-danger-lt' : maxEpss >= 0.3 ? 'bg-warning-lt' : maxEpss > 0 ? 'bg-info-lt' : 'bg-secondary-lt';

        const latestFields = this.state.telemetryDetail?.latest?.fields || {};
        const ipRaw = latestFields.IPAddresses || latestFields.ipAddresses;
        const ipList = Array.isArray(ipRaw) ? ipRaw : typeof ipRaw === 'string' ? ipRaw.split(/[;\s,]+/).filter(Boolean) : [];
        const networkRisk = this.analyzeNetworkRisk(ipList, this.state.telemetryDetail?.history);

        const progressClass = riskScoreValue >= 80 ? 'bg-danger' : riskScoreValue >= 60 ? 'bg-warning' : riskScoreValue >= 40 ? 'bg-warning' : 'bg-success';

        const postureScore = this.state.enrichedScore?.score ?? riskScoreValue;
        const postureLabel = postureScore >= 80 ? 'Critical' : postureScore >= 60 ? 'Elevated' : postureScore >= 40 ? 'Watch' : postureScore >= 20 ? 'Stable' : 'Secure';
        const riskPercentBase = (() => {
            const enrichedRaw = this.state.enrichedScore?.score;
            const summaryRaw = this.state.deviceSummary?.score;
            const raw = enrichedRaw !== undefined ? enrichedRaw : summaryRaw || 0;
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        })();
        const riskPercent = Math.max(0, Math.min(100, Math.round(riskPercentBase)));
        const postureBadge = postureScore >= 80 ? 'bg-danger' : postureScore >= 60 ? 'bg-warning' : postureScore >= 40 ? 'bg-warning' : postureScore >= 20 ? 'bg-info' : 'bg-success';
        const riskPercentBadge = riskPercent >= 80 ? 'bg-danger' : riskPercent >= 60 ? 'bg-warning' : riskPercent >= 40 ? 'bg-warning' : riskPercent >= 20 ? 'bg-info' : 'bg-success';
        const postureCopy = postureScore >= 80
            ? 'Active exploitability and exposure signals present; isolate and patch immediately.'
            : postureScore >= 60
                ? 'High exploitability or internet exposure; prioritize remediation and segmentation.'
                : postureScore >= 40
                    ? 'Exploitable issues exist with moderate exposure; schedule remediation soon.'
                    : postureScore >= 20
                        ? 'Mostly resilient with some findings; keep patching cadence steady.'
                        : 'Strong resilience and minimal exposure; continue monitoring.';
        const riskPercentCopy = 'Same calculation as the Devices list gauge: enriched score when present, otherwise the summary score.';
        return html`
            <div class="row row-cards">
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="text-muted small">Security posture (0-100)</div>
                                <span class="badge ${postureBadge}">${postureLabel}</span>
                            </div>
                            <div class="d-flex align-items-center gap-3 mb-3">
                                <div class="display-4 fw-bold mb-0">${Math.round(postureScore)}</div>
                                <div class="small text-muted">Exposure-adjusted resilience: EPSS + known exploits + network exposure + severity + time decay.</div>
                            </div>
                            <div ref=${(el) => { this.detailRiskChartEl = el; }} style="min-height: 120px;"></div>
                            <div class="text-muted small">${postureCopy}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <div class="text-muted small">Risk % (Devices list)</div>
                                <span class="badge ${this.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                            </div>
                            <div class="d-flex align-items-center gap-3 mb-3">
                                <div class="display-4 fw-bold mb-0">${riskPercent}%</div>
                                <div class="small text-muted">Normalized severity/volume score used on the Devices page for cross-device comparison.</div>
                            </div>
                            <div class="progress mb-2" style="height: 8px;">
                                <div class="progress-bar ${riskPercentBadge}" style="width: ${Math.min(100, Math.max(0, riskPercent))}%"></div>
                            </div>
                            <div class="text-muted small">${riskPercentCopy}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row row-cards mt-3">
                <div class="col-md-3 col-sm-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small mb-1">Known exploits</div>
                            <div class="d-flex align-items-baseline gap-2">
                                <div class="h3 mb-0">${knownExploitCount}</div>
                                ${knownExploitCount > 0 ? html`<span class="badge bg-danger-lt">Active</span>` : html`<span class="badge bg-secondary-lt">None</span>`}
                            </div>
                            <div class="text-muted small">CVEs with public exploits detected on this device.</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small mb-1">Exploit probability (max EPSS)</div>
                            <div class="d-flex align-items-baseline gap-2">
                                <div class="h3 mb-0">${(maxEpss * 100).toFixed(1)}%</div>
                                <span class="badge ${epssBadge}">${maxEpss >= 0.5 ? 'Very High' : maxEpss >= 0.3 ? 'High' : maxEpss > 0 ? 'Elevated' : 'Low'}</span>
                            </div>
                            <div class="text-muted small">Highest EPSS among active CVEs.</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small mb-1">Vulnerable applications</div>
                            <div class="d-flex align-items-baseline gap-2">
                                <div class="h3 mb-0">${vulnerableApps}</div>
                                ${vulnerableApps > 0 ? html`<span class="badge bg-warning-lt">Patch needed</span>` : html`<span class="badge bg-success-lt">Clean</span>`}
                            </div>
                            <div class="text-muted small">Unique apps with unpatched CVEs.</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-sm-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small mb-1">Network exposure</div>
                            <div class="d-flex align-items-baseline gap-2">
                                <div class="h3 mb-0">${networkRisk?.publicIpPresent ? 'Public' : networkRisk?.apipaPresent ? 'APIPA' : 'Limited'}</div>
                                <span class="badge ${networkRisk?.publicIpPresent ? 'bg-danger-lt' : networkRisk?.apipaPresent ? 'bg-warning-lt' : 'bg-secondary-lt'}">${networkRisk?.publicIpPresent ? 'Internet-exposed' : networkRisk?.apipaPresent ? 'Internal only' : 'Low signal'}</span>
                            </div>
                            <div class="text-muted small">Exposure derived from latest IP signals.</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row row-cards mt-3">
                <div class="col-md-6">
                    <div class="card h-100">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <div class="card-title mb-0">What Drives This Posture</div>
                            </div>
                        <div class="list-group list-group-flush">
                            <div class="list-group-item d-flex justify-content-between align-items-start">
                                <div>
                                    <div class="text-sm fw-bold">Vulnerability Severity</div>
                                    <div class="text-muted small">Highest CVE severity detected</div>
                                </div>
                                <span class="badge ${this.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                            </div>
                            <div class="list-group-item d-flex justify-content-between align-items-start">
                                <div>
                                    <div class="text-sm fw-bold">Total CVEs</div>
                                    <div class="text-muted small">Active, unpatched CVEs across installed apps</div>
                                    <div class="d-flex flex-wrap gap-1 mt-2">
                                        <span class="badge ${this.getSeverityColor('CRITICAL')}">${critical.length} Critical</span>
                                        <span class="badge ${this.getSeverityColor('HIGH')}">${high.length} High</span>
                                        <span class="badge ${this.getSeverityColor('MEDIUM')}">${medium.length} Medium</span>
                                        <span class="badge ${this.getSeverityColor('LOW')}">${low.length} Low</span>
                                    </div>
                                </div>
                                <span class="badge bg-secondary-lt text-white">${activeCves.length}</span>
                            </div>
                            <div class="list-group-item d-flex justify-content-between align-items-start">
                                <div>
                                    <div class="text-sm fw-bold">Known Exploits</div>
                                    <div class="text-muted small">CVEs with public exploits detected</div>
                                </div>
                                ${knownExploitCount > 0 ? html`<span class="badge bg-danger-lt text-white">${knownExploitCount} exploit${knownExploitCount > 1 ? 's' : ''}</span>` : html`<span class="text-muted">None known</span>`}
                            </div>
                            <div class="list-group-item d-flex justify-content-between align-items-start">
                                <div>
                                    <div class="text-sm fw-bold">Network Exposure</div>
                                    <div class="text-muted small">Public or APIPA signals from device IPs</div>
                                </div>
                                <span class="badge ${networkRisk?.publicIpPresent ? 'bg-danger-lt' : networkRisk?.apipaPresent ? 'bg-warning-lt' : 'bg-secondary-lt'} text-white">
                                    ${networkRisk?.publicIpPresent ? 'Public IP seen' : networkRisk?.apipaPresent ? 'APIPA detected' : 'Limited signals'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div class="card-title mb-0">Next Steps</div>
                            <span class="badge bg-primary-lt text-primary">Guided actions</span>
                        </div>
                        <div class="card-body">
                            <ol class="small mb-3">
                                ${vulnerableApps > 0 ? html`<li class="mb-2">Patch ${vulnerableApps} vulnerable application${vulnerableApps > 1 ? 's' : ''} to reduce exposure fastest.</li>` : html`<li class="mb-2">Keep applications updated; no vulnerable apps detected.</li>`}
                                ${(critical.length + high.length) > 0 ? html`<li class="mb-2">Prioritize the ${critical.length + high.length} Critical/High CVEs first.</li>` : html`<li class="mb-2">No Critical/High CVEs detected right now.</li>`}
                                <li class="mb-2">Review network exposure (public/APIPA IPs) and ensure firewall/VPN coverage.</li>
                            </ol>
                            <div class="d-flex flex-wrap gap-2">
                                <button class="btn btn-primary" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'inventory' }); }}>
                                    Go to Applications
                                </button>
                                <button class="btn btn-outline-primary" onclick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'risks' }); }}>
                                    Go to CVEs
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRisksTab() {
        const { html } = window;
        
        // Get only active apps (not old uninstalled) and unpatched CVEs
        const { activeApps, activeCves } = this.getActiveAppsAndCves();
        
        // Get mitigation stats for AI/posture engines
        const mitigationStats = this.getMitigationStats();
        
        // Filter by selected app if cross-linked from Inventory tab
        let filteredCves = this.state.cveFilterApp 
            ? activeCves.filter(c => c.appName && c.appName.toLowerCase() === this.state.cveFilterApp.toLowerCase())
            : activeCves;
        
        const weightSeverity = (sev) => this.severityWeight(sev || '');
        filteredCves = filteredCves.slice().sort((a, b) => {
            const knownA = this.state.knownExploits && this.state.knownExploits.has(a.cveId) ? 1 : 0;
            const knownB = this.state.knownExploits && this.state.knownExploits.has(b.cveId) ? 1 : 0;
            if (knownA !== knownB) return knownB - knownA; // known exploits first
            const sevDiff = weightSeverity(b.severity) - weightSeverity(a.severity);
            if (sevDiff !== 0) return sevDiff;
            return (b.epss || 0) - (a.epss || 0);
        });

        const criticalCves = filteredCves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical');
        const highCves = filteredCves.filter(c => c.severity === 'HIGH' || c.severity === 'High');
        const mediumCves = filteredCves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium');
        const lowCves = filteredCves.filter(c => c.severity === 'LOW' || c.severity === 'Low');
        const highestWeight = filteredCves.length > 0 ? Math.max(...filteredCves.map(c => this.severityWeight(c.severity || '')), 0) : 0;
        const highestSeverity = filteredCves.length > 0 ? this.severityLabelFromWeight(highestWeight) : 'CLEAN';
        const severityBtnClass = this.getSeverityOutlineClass(highestSeverity);
        const severityBadgeClass = this.getSeverityColor(highestSeverity);

        return html`
            ${this.state.cveFilterApp ? html`
                <div class="alert alert-info mb-3" style="position: relative;">
                    <span>Filtering CVEs for <strong>${this.state.cveFilterApp}</strong></span>
                    <button class="btn-close" onclick=${() => this.setState({ cveFilterApp: null })} style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%);"></button>
                </div>
            ` : ''}
            <div class="mb-3 d-flex flex-wrap gap-2 align-items-center">
                <button class=${`btn ${severityBtnClass} d-inline-flex align-items-center gap-2`} onclick=${(e) => { e.preventDefault(); this.scrollToCveTable(); }}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l7 3v6c0 3.5 -2.5 6.5 -7 9c-4.5 -2.5 -7 -5.5 -7 -9v-6z" /><path d="M10 12l2 2l4 -4" /></svg>
                    <span>${highestSeverity}</span>
                    <span class=${`badge ${severityBadgeClass}`}>${filteredCves.length}</span>
                </button>
            </div>

            <!-- Mitigated Vulnerabilities Section -->
            ${mitigationStats.totalMitigated > 0 ? html`
                <div class="card bg-success-lt mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h3 class="card-title text-success mb-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l7 3v6c0 3.5 -2.5 6.5 -7 9c-4.5 -2.5 -7 -5.5 -7 -9v-6z" /><path d="M9 12l2 2l4 -4" /></svg>
                                    ${mitigationStats.totalMitigated} Vulnerabilities Mitigated
                                </h3>
                                <div class="text-muted small">Through ${mitigationStats.mitigatedApps} app updates/removals</div>
                                <div class="mt-2 d-flex flex-wrap gap-1">
                                    ${mitigationStats.bySeverity.critical > 0 ? html`<span class="badge bg-danger">${mitigationStats.bySeverity.critical} Critical</span>` : ''}
                                    ${mitigationStats.bySeverity.high > 0 ? html`<span class="badge bg-warning">${mitigationStats.bySeverity.high} High</span>` : ''}
                                    ${mitigationStats.bySeverity.medium > 0 ? html`<span class="badge bg-yellow">${mitigationStats.bySeverity.medium} Medium</span>` : ''}
                                    ${mitigationStats.bySeverity.low > 0 ? html`<span class="badge bg-info">${mitigationStats.bySeverity.low} Low</span>` : ''}
                                </div>
                            </div>
                            <button class="btn btn-sm btn-ghost-success" onclick=${() => this.setState({ showMitigatedCves: !this.state.showMitigatedCves })}>
                                ${this.state.showMitigatedCves ? 'Hide' : 'Show'} Details
                            </button>
                        </div>
                        ${this.state.showMitigatedCves ? html`
                            <div class="mt-3 table-responsive">
                                <table class="table table-sm table-hover bg-white">
                                    <thead>
                                        <tr>
                                            <th>CVE ID</th>
                                            <th>Affected Application</th>
                                            <th>Severity</th>
                                            <th>Mitigated Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${mitigationStats.mitigatedCves.map(cve => html`
                                            <tr>
                                                <td>
                                                    <a href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" class="text-decoration-none">
                                                        ${cve.cveId}
                                                    </a>
                                                </td>
                                                <td>${cve.appName}</td>
                                                <td><span class="badge ${this.getSeverityColor(cve.severity)}">${(cve.severity || 'Unknown').toUpperCase()}</span></td>
                                                <td class="text-muted small">${cve.lastSeen ? new Date(cve.lastSeen).toLocaleDateString() : '—'}</td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

            <div class="table-responsive">
                <table class="table table-sm table-hover" id="cve-table">
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
                                        <div class="d-flex align-items-center gap-1 flex-wrap">
                                            <span class="badge ${this.getSeverityColor(cve.severity)}">
                                                ${(() => {
                                                    const sev = (cve.severity || 'Unknown').toUpperCase();
                                                    const icon = sev === 'CRITICAL' ? '⚠️' : sev === 'HIGH' ? '🔴' : sev === 'MEDIUM' ? '🟡' : '🔵';
                                                    return icon + ' ' + sev;
                                                })()}
                                            </span>
                                            ${isKnownExploit ? html`
                                                <span class="badge bg-red-lt" title="Exploit available in public repositories">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>
                                                    Exploit
                                                </span>
                                            ` : ''}
                                        </div>
                                    </td>
                                    <td>
                                        ${cve.epss ? html`
                                            <div class="d-flex align-items-center gap-2">
                                                <span class="badge ${Number(cve.epss) > 0.5 ? 'bg-danger-lt' : Number(cve.epss) > 0.2 ? 'bg-warning-lt' : 'bg-success-lt'}">
                                                    ${(Number(cve.epss) * 100).toFixed(1)}%
                                                </span>
                                                ${cve.score ? html`<span class="text-muted small">CVSS ${Number(cve.score).toFixed(1)}</span>` : ''}
                                            </div>
                                        ` : html`<span class="text-muted">—</span>`}
                                    </td>
                                    <td>
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="text-muted small">${cve.lastSeen ? new Date(cve.lastSeen).toLocaleDateString() : '—'}</span>
                                            <div class="dropdown">
                                                <button class="btn btn-sm btn-ghost-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /><circle cx="12" cy="5" r="1" /></svg>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a class="dropdown-item" href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" rel="noopener">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="2" /><path d="M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7" /></svg>
                                                        View in NVD
                                                    </a>
                                                    <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Mark false positive:', cve.cveId); }}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                        Mark False Positive
                                                    </a>
                                                    <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Assign for review:', cve.cveId); }}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 11l2 2l4 -4" /></svg>
                                                        Assign for Review
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
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
