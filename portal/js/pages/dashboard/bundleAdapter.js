/**
 * Phase 4.2.3: Adapter that synthesizes the legacy "unified dashboard" payload
 * from a /api/v1/orgs/{orgId}/pages/dashboard bundle envelope (composed atoms).
 *
 * Bundle envelope shape (input):
 *   { pageName, orgId, dateUtc, atoms: { '<wireName>': { wireName, scope, freshness, asOf, source, data: [rows] } },
 *     evidence, watermark, freshness, missingAtoms[], livePresent[], elapsedMs }
 *
 * Output: the same shape produced by GET /api/v1/orgs/{orgId}/dashboard?format=unified,
 * so UnifiedDashboard.js can keep using the established dashboard payload shape.
 *
 * License & add-on details that are not yet surfaced as cooked atoms remain at neutral
 * defaults; UnifiedDashboard.js subsequently calls hydrateDashboardStats() which fills
 * those gaps from devices + inventory APIs.
 */
export function bundleToUnifiedPayload(bundle) {
    if (!bundle || !bundle.atoms) return {};

    const firstRow = (name) => {
        const a = bundle.atoms[name];
        if (!a || !a.data) return null;
        return Array.isArray(a.data) ? (a.data[0] || null) : a.data;
    };
    const rowsOf = (name) => {
        const a = bundle.atoms[name];
        return (a && Array.isArray(a.data)) ? a.data : [];
    };

    const org       = firstRow('org-snapshot')        || {};
    const sec       = firstRow('security-snapshot')   || {};
    const comp      = firstRow('compliance-snapshot') || {};
    const audit     = firstRow('audit-snapshot')      || {};
    const hygiene   = firstRow('addon-hygiene')       || {};
    const insurance = firstRow('addon-insurance')     || {};
    const fleetRows = rowsOf('device-fleet');
    const contextRows = rowsOf('device-context-facts');
    const trendRows = rowsOf('org-trends-daily');

    const fleetSource = fleetRows.length ? fleetRows
                       : (Array.isArray(org.deviceFleet) ? org.deviceFleet : []);
    const deviceNameById = new Map();

    const normalize = (value) => String(value || '').trim().toLowerCase();
    const readField = (obj, ...keys) => {
        if (!obj || typeof obj !== 'object') return undefined;
        for (const key of keys) {
            if (obj[key] !== undefined && obj[key] !== null) return obj[key];
            const found = Object.keys(obj).find(k => String(k).toLowerCase() === String(key).toLowerCase());
            if (found && obj[found] !== undefined && obj[found] !== null) return obj[found];
        }
        return undefined;
    };
    const normalizeImpact = (value) => {
        const impact = String(value || '').trim().toUpperCase();
        return ['HBI', 'MBI', 'LBI'].includes(impact) ? impact : 'UNCLASSIFIED';
    };
    const impactRank = (impact) => ({ HBI: 3, MBI: 2, LBI: 1, UNCLASSIFIED: 0 }[normalizeImpact(impact)] || 0);
    const parseLabels = (value) => {
        if (Array.isArray(value)) return value.map(String).filter(Boolean);
        if (!value || typeof value !== 'string') return [];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    };
    const parseJsonObject = (value) => {
        if (!value) return {};
        if (typeof value === 'object') return value;
        if (typeof value !== 'string') return {};
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    };
    const parseDateMs = (value) => {
        if (!value) return null;
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? ms : null;
    };
    const minutesSince = (value) => {
        const ms = parseDateMs(value);
        return ms === null ? null : Math.max(0, Math.floor((Date.now() - ms) / 60000));
    };
    const deriveVisibility = (device) => {
        const health = device.health || device.Health || {};
        const explicit = normalize(health.visibilityState || device.visibilityState || device.VisibilityState || health.status || device.status || device.Status);
        if (explicit === 'recent' || explicit === 'healthy') return 'online';
        if (explicit === 'online' || explicit === 'stale' || explicit === 'dormant' || explicit === 'ghosted') return explicit;
        if (explicit === 'offline') return 'ghosted';

        const inactive = Number(device.inactiveMinutes ?? device.InactiveMinutes);
        const ageMinutes = Number.isFinite(inactive) ? inactive : minutesSince(device.lastHeartbeat || device.LastHeartbeat || device.lastSeen || device.LastSeen);
        if (ageMinutes === null) return 'ghosted';
        if (ageMinutes >= 10080) return 'ghosted';
        if (ageMinutes >= 4320) return 'dormant';
        if (ageMinutes >= 1440) return 'stale';
        return 'online';
    };
    const deriveTelemetryState = (device) => {
        const health = device.health || device.Health || {};
        const explicit = normalize(health.telemetryState || device.telemetryState || device.TelemetryState);
        if (explicit) return explicit;

        const heartbeatAge = minutesSince(device.lastHeartbeat || device.LastHeartbeat || device.lastSeen || device.LastSeen);
        const telemetryAge = minutesSince(device.lastTelemetry || device.LastTelemetry || device.lastSeen || device.LastSeen);
        if (heartbeatAge !== null && telemetryAge !== null && heartbeatAge < 1440 && telemetryAge < 1440 && Math.abs(heartbeatAge - telemetryAge) > 30) {
            return 'error';
        }

        return 'healthy';
    };
    const deriveConnectivity = (device) => {
        const health = device.health || device.Health || {};
        const explicit = normalize(health.connectivityState || device.connectivityState || device.ConnectivityState);
        if (explicit) return explicit;

        const inactive = Number(device.inactiveMinutes ?? device.InactiveMinutes);
        const ageMinutes = Number.isFinite(inactive) ? inactive : minutesSince(device.lastHeartbeat || device.LastHeartbeat || device.lastSeen || device.LastSeen);
        return ageMinutes !== null && ageMinutes < 60 ? 'online' : 'offline';
    };

    const contextByDeviceId = new Map();
    contextRows.forEach((row) => {
        const id = readField(row, 'deviceId', 'DeviceId');
        if (!id) return;
        const context = {
            deviceId: String(id),
            businessImpact: normalizeImpact(readField(row, 'businessImpact', 'BusinessImpact')),
            assignedLabels: parseLabels(readField(row, 'assignedLabelsJson', 'AssignedLabelsJson', 'assignedLabels')),
            notes: readField(row, 'notes', 'Notes') || '',
            observedContext: parseJsonObject(readField(row, 'observedContextJson', 'ObservedContextJson')),
            derivedRisk: parseJsonObject(readField(row, 'derivedRiskJson', 'DerivedRiskJson')),
            source: readField(row, 'source', 'Source') || readField(row, 'blobPath', 'BlobPath') || 'atom'
        };
        contextByDeviceId.set(context.deviceId, context);
    });
    const strongestImpact = (items) => items.reduce((winner, item) => impactRank(item?.businessImpact) > impactRank(winner) ? item.businessImpact : winner, 'UNCLASSIFIED');
    const countImpacts = (items) => items.reduce((counts, item) => {
        const impact = normalizeImpact(item?.businessImpact);
        if (impact === 'HBI') counts.hbiDeviceCount += 1;
        else if (impact === 'MBI') counts.mbiDeviceCount += 1;
        else if (impact === 'LBI') counts.lbiDeviceCount += 1;
        else counts.unclassifiedDeviceCount += 1;
        return counts;
    }, { hbiDeviceCount: 0, mbiDeviceCount: 0, lbiDeviceCount: 0, unclassifiedDeviceCount: 0 });

    fleetSource.forEach((d) => {
        const id = d.deviceId || d.DeviceId;
        const name = d.deviceName || d.DeviceName || id;
        if (id) deviceNameById.set(String(id), name);
    });

    const deviceHealth = fleetSource.map((d) => {
        const deviceId = d.deviceId || d.DeviceId;
        const context = contextByDeviceId.get(String(deviceId || ''));
        return ({
        deviceId,
        deviceName:   d.deviceName || d.DeviceName,
        os:           d.os || d.Os || null,
        status:       deriveVisibility(d),
        visibilityState: deriveVisibility(d),
        telemetryState: deriveTelemetryState(d),
        connectivityState: deriveConnectivity(d),
        lastSeen:     d.lastSeen || d.LastSeen || null,
        lastTelemetry: d.lastTelemetry || d.LastTelemetry || d.lastSeen || d.LastSeen || null,
        lastHeartbeat: d.lastHeartbeat || d.LastHeartbeat || d.lastSeen || d.LastSeen || null,
        businessImpact: context?.businessImpact || 'UNCLASSIFIED',
        assignedLabels: context?.assignedLabels || [],
        critical:     Number(d.criticalCount || d.CriticalCount || 0),
        high:         Number(d.highCount || d.HighCount || 0),
        medium:       Number(d.mediumCount || d.MediumCount || 0),
        low:          Number(d.lowCount || d.LowCount || 0),
        kev:          Number(d.kevCount || d.KevCount || 0),
        threats:      Number(d.criticalCount || d.CriticalCount || 0) + Number(d.highCount || d.HighCount || 0)
        });
    });

    const sev = sec.bySeverity || {};
    const totalFindings = Number(sec.totalFindings || 0);
    const criticalCount = Number(sev.critical ?? sev.Critical ?? 0);
    const highCount     = Number(sev.high     ?? sev.High     ?? 0);
    const mediumCount   = Number(sev.medium   ?? sev.Medium   ?? 0);
    const lowCount      = Number(sev.low      ?? sev.Low      ?? 0);

    const topActions = (Array.isArray(org.prioritizedActions) ? org.prioritizedActions : []).map((a) => {
        const affectedDevices = Array.isArray(a.affectedDevicesList)
            ? a.affectedDevicesList
            : (a.primaryDeviceId ? [a.primaryDeviceId] : []);
        const affectedContexts = affectedDevices.map((device) => {
            const id = typeof device === 'string' ? device : (device.deviceId || device.DeviceId || '');
            return contextByDeviceId.get(String(id));
        }).filter(Boolean);
        const contextCounts = countImpacts(affectedContexts);
        const businessImpact = normalizeImpact(a.businessImpact || strongestImpact(affectedContexts));
        const fallbackReason = businessImpact === 'HBI'
            ? `Touches ${contextCounts.hbiDeviceCount || 1} high-business-impact device${(contextCounts.hbiDeviceCount || 1) === 1 ? '' : 's'}.`
            : businessImpact === 'MBI'
                ? `Touches ${contextCounts.mbiDeviceCount || 1} medium-business-impact device${(contextCounts.mbiDeviceCount || 1) === 1 ? '' : 's'}.`
                : businessImpact === 'LBI'
                    ? 'Currently scoped to low-business-impact devices.'
                    : 'Label device business impact to rank this fix.';
        const affectedDeviceNames = affectedDevices.map((device) => {
            const id = typeof device === 'string' ? device : (device.deviceId || device.DeviceId || '');
            const name = typeof device === 'string'
                ? deviceNameById.get(String(device))
                : (device.deviceName || device.DeviceName || deviceNameById.get(String(id)));
            return name || id;
        }).filter(Boolean);
        const primaryDeviceId = a.primaryDeviceId || (typeof affectedDevices[0] === 'string'
            ? affectedDevices[0]
            : (affectedDevices[0]?.deviceId || affectedDevices[0]?.DeviceId || null));

        return {
            title:               a.title || '',
            description:         a.description || '',
            urgency:             a.priority || '',
            deadlineText:        a.sla || '',
            actionUrl:           a.actionUrl || '#!/posture',
            affectedDevices,
            affectedDeviceNames,
            primaryDeviceId,
            primaryDeviceName:   a.primaryDeviceName || (primaryDeviceId ? deviceNameById.get(String(primaryDeviceId)) : null) || affectedDeviceNames[0] || null,
            deviceCount:         Number(a.affectedDevices || affectedDeviceNames.length || affectedDevices.length || 0),
            affectedApps:        Array.isArray(a.affectedApps) ? a.affectedApps : [],
            businessImpact,
            businessImpactReason: a.businessImpactReason || fallbackReason,
            businessImpactMultiplier: Number(a.businessImpactMultiplier || 1),
            hbiDeviceCount: Number(a.hbiDeviceCount ?? contextCounts.hbiDeviceCount ?? 0),
            mbiDeviceCount: Number(a.mbiDeviceCount ?? contextCounts.mbiDeviceCount ?? 0),
            lbiDeviceCount: Number(a.lbiDeviceCount ?? contextCounts.lbiDeviceCount ?? 0),
            unclassifiedDeviceCount: Number(a.unclassifiedDeviceCount ?? contextCounts.unclassifiedDeviceCount ?? 0),
            contextCaveat: a.contextCaveat || (contextCounts.unclassifiedDeviceCount > 0 ? `${contextCounts.unclassifiedDeviceCount} affected device${contextCounts.unclassifiedDeviceCount === 1 ? '' : 's'} still need a business-impact label.` : ''),
            pathDerivedImpact: a.pathDerivedImpact || '',
            pathRiskReason: a.pathRiskReason || '',
            derivedRiskReason: a.derivedRiskReason || '',
            observedContextCaveat: a.observedContextCaveat || '',
            insuranceCaveat: a.insuranceCaveat || '',
            fixQueueReason: a.fixQueueReason || '',
            reportContextSummary: a.reportContextSummary || ''
        };
    });

    const standards = Array.isArray(comp.standards) ? comp.standards : [];
    const gapCount = standards.reduce((n, s) => n + Number(s?.gapCount || s?.nonCompliantCount || 0), 0);

    const fleetTotal = fleetSource.length;
    const totalDevices   = fleetTotal > 0 ? fleetTotal : Number(org.deviceCount || 0);
    const onlineDevices  = fleetTotal > 0 ? deviceHealth.filter(d => d.status === 'online').length : Number(org.onlineDevices || 0);
    const staleDevices   = fleetTotal > 0 ? deviceHealth.filter(d => d.status === 'stale').length : Number(org.staleDevices || 0);
    const dormantDevices = fleetTotal > 0 ? deviceHealth.filter(d => d.status === 'dormant').length : 0;
    const ghostDevices   = fleetTotal > 0 ? deviceHealth.filter(d => d.status === 'ghosted').length : Number(org.offlineDevices || 0);
    const errorDevices   = fleetTotal > 0 ? deviceHealth.filter(d => d.telemetryState === 'error').length : 0;
    const actionableDevices = Math.max(0, dormantDevices + ghostDevices + errorDevices);
    const activeDevices  = fleetTotal > 0 ? Math.max(0, totalDevices - actionableDevices) : Number(org.activeDevices || 0);
    const offlineDevices = fleetTotal > 0 ? actionableDevices : Number(org.offlineDevices || Math.max(0, totalDevices - activeDevices));
    const coverage = {
        total: totalDevices,
        healthy: Math.max(0, totalDevices - actionableDevices),
        online: onlineDevices,
        stale: staleDevices,
        dormant: dormantDevices,
        ghost: ghostDevices,
        error: errorDevices,
        offline: offlineDevices,
        unreachable: Math.max(0, staleDevices + offlineDevices)
    };

    const evidence = bundle.evidence || bundle.Evidence || null;
    const contextCounts = countImpacts([...contextByDeviceId.values()]);
    const businessImpactSummary = {
        ...contextCounts,
        labelledDeviceCount: Math.max(0, contextCounts.hbiDeviceCount + contextCounts.mbiDeviceCount + contextCounts.lbiDeviceCount),
        unclassifiedDeviceCount: Math.max(0, contextCounts.unclassifiedDeviceCount),
        missingImpactLabelCount: Math.max(0, totalDevices - contextByDeviceId.size + contextCounts.unclassifiedDeviceCount),
        totalContextRows: contextByDeviceId.size,
        totalDevices,
        topActionImpact: topActions[0]?.businessImpact || 'UNCLASSIFIED',
        topActionReason: topActions[0]?.businessImpactReason || '',
        isLiveContext: contextRows.some(row => String(readField(row, 'source', 'Source') || '').toLowerCase() === 'live')
    };

    return {
        // Marker fields trigger isUnified=true in toLegacyDashboardPayload.
        businessOwner: {
            complianceCard: {
                percent:  Number(comp.overallScore || 0),
                gapCount
            },
            // License atom not yet in dashboard bundle — neutral defaults.
            // UnifiedDashboard.hydrateDashboardStats fills the rest from devices/inventory APIs.
            licenseCard: {
                status: 'Unknown',
                utilizationPercent: 0,
                daysRemaining: 0,
                remainingCredits: 0,
                creditUtilization: 0
            },
            topActions,
            businessImpact: businessImpactSummary
        },
        itAdmin: {
            deviceHealth,
            coverage,
            inventory: {
                totalDevices,
                totalApps: 0,
                vendors: 0,
                uniqueAppCount: 0
            }
        },
        securityPro: {
            threatIntel: {
                criticalCveCount: criticalCount,
                highCveCount: highCount,
                mediumCveCount: mediumCount,
                lowCveCount: lowCount,
                totalCveCount: totalFindings,
                exploitCount: Array.isArray(sec.top20Cves) ? sec.top20Cves.filter(c => c.isKev || c.IsKev).length : 0,
                activeExploitCount: Array.isArray(sec.top20Cves) ? sec.top20Cves.filter(c => c.isKev || c.IsKev).length : 0
            },
            // Pass through high-signal vulnerability rollups so the security tab can show them.
            totalFindings,
            bySeverity: sev,
            top20Cves: Array.isArray(sec.top20Cves) ? sec.top20Cves : [],
            top20Devices: Array.isArray(sec.top20Devices) ? sec.top20Devices : [],
            top20AppRisks: Array.isArray(sec.top20AppRisks) ? sec.top20AppRisks : []
        },
        quickStats: {
            devices: {
                totalCount:   totalDevices,
                activeCount:  activeDevices,
                onlineCount:  onlineDevices,
                offlineCount: offlineDevices,
                staleCount:   staleDevices
            },
            coverage,
            apps:    { trackedCount: 0, vendorCount: 0 },
            cves:    { totalCount: totalFindings, criticalCount, highCount },
            license: { licenseType: 'Unknown', seatsTotal: 0, seatsUsed: 0, daysRemaining: 0, remainingCredits: 0, creditUtilization: 0 },
            businessImpact: businessImpactSummary
        },
        cyberHygiene: {
            score:      Number(hygiene?.hygieneScoreTrend?.current ?? org.hygieneScore ?? 0),
            grade:      org.hygieneGrade || 'N/A',
            compliance: Number(comp.overallScore || 0)
        },
        securityScore: {
            score:             Number(org.securityScore || 0),
            grade:             org.grade || 'N/A',
            compliancePercent: Number(comp.overallScore || 0)
        },
        recentDevices: deviceHealth,
        aiContext:     { recentDevices: deviceHealth },
        snapshots:     trendRows,
        velocitySnapshots: trendRows,
        aiTrends:      { dailyHistory: trendRows },
        generatedAt:   org.generatedAt || bundle.watermark || new Date().toISOString(),
        freshness:     bundle.freshness || null,
        evidence,
        reportCard:    null,
        billingNotice: null,
        healthScore:   Number(org.securityScore || 0),
        // Bundle observability — surfaced to consumers/console for debugging this pilot.
        _bundle: {
            freshness:    bundle.freshness,
            missingAtoms: bundle.missingAtoms,
            livePresent:  bundle.livePresent,
            evidence,
            watermark:    bundle.watermark,
            elapsedMs:    bundle.elapsedMs
        }
    };
}
