/**
 * Phase 4.2.3: Adapter that synthesizes the legacy "unified dashboard" payload
 * from a /api/v1/orgs/{orgId}/pages/dashboard bundle envelope (composed atoms).
 *
 * Bundle envelope shape (input):
 *   { pageName, orgId, dateUtc, atoms: { '<wireName>': { wireName, scope, freshness, asOf, source, data: [rows] } },
 *     watermark, freshness, missingAtoms[], livePresent[], elapsedMs }
 *
 * Output: the same shape produced by GET /api/v1/orgs/{orgId}/dashboard?format=unified,
 * so downstream consumers (Dashboard.js, UnifiedDashboard.js) need no further changes.
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
    const trendRows = rowsOf('org-trends-daily');

    const fleetSource = fleetRows.length ? fleetRows
                       : (Array.isArray(org.deviceFleet) ? org.deviceFleet : []);

    const deviceHealth = fleetSource.map((d) => ({
        deviceId:     d.deviceId,
        deviceName:   d.deviceName,
        os:           d.os || null,
        status:       String(d.deviceState || d.connectivityState || '').toLowerCase(),
        lastSeen:     d.lastSeen || null,
        lastTelemetry: d.lastTelemetry || d.lastSeen || null,
        lastHeartbeat: d.lastHeartbeat || d.lastSeen || null,
        critical:     Number(d.criticalCount || 0),
        high:         Number(d.highCount || 0),
        medium:       Number(d.mediumCount || 0),
        low:          Number(d.lowCount || 0),
        kev:          Number(d.kevCount || 0),
        threats:      Number(d.criticalCount || 0) + Number(d.highCount || 0)
    }));

    const sev = sec.bySeverity || {};
    const totalFindings = Number(sec.totalFindings || 0);
    const criticalCount = Number(sev.critical ?? sev.Critical ?? 0);
    const highCount     = Number(sev.high     ?? sev.High     ?? 0);
    const mediumCount   = Number(sev.medium   ?? sev.Medium   ?? 0);
    const lowCount      = Number(sev.low      ?? sev.Low      ?? 0);

    const topActions = (Array.isArray(org.prioritizedActions) ? org.prioritizedActions : []).map((a) => ({
        title:           a.title || '',
        description:     a.description || '',
        urgency:         a.priority || '',
        deadlineText:    a.sla || '',
        actionUrl:       a.actionUrl || '#!/posture',
        affectedDevices: Array.isArray(a.affectedDevicesList)
                            ? a.affectedDevicesList
                            : (a.primaryDeviceId ? [a.primaryDeviceId] : []),
        affectedApps:    Array.isArray(a.affectedApps) ? a.affectedApps : []
    }));

    const standards = Array.isArray(comp.standards) ? comp.standards : [];
    const gapCount = standards.reduce((n, s) => n + Number(s?.gapCount || s?.nonCompliantCount || 0), 0);

    const totalDevices   = Number(org.deviceCount   || fleetSource.length || 0);
    const activeDevices  = Number(org.activeDevices || 0);
    const onlineDevices  = Number(org.onlineDevices || 0);
    const staleDevices   = Number(org.staleDevices  || 0);
    const offlineDevices = Number(org.offlineDevices || Math.max(0, totalDevices - activeDevices));

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
            topActions
        },
        itAdmin: {
            deviceHealth,
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
            apps:    { trackedCount: 0, vendorCount: 0 },
            cves:    { totalCount: totalFindings, criticalCount, highCount },
            license: { licenseType: 'Unknown', seatsTotal: 0, seatsUsed: 0, daysRemaining: 0, remainingCredits: 0, creditUtilization: 0 }
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
        reportCard:    null,
        billingNotice: null,
        healthScore:   Number(org.securityScore || 0),
        // Bundle observability — surfaced to consumers/console for debugging this pilot.
        _bundle: {
            freshness:    bundle.freshness,
            missingAtoms: bundle.missingAtoms,
            livePresent:  bundle.livePresent,
            watermark:    bundle.watermark,
            elapsedMs:    bundle.elapsedMs
        }
    };
}
