/**
 * DeviceStatsService - Device statistics calculations
 * 
 * Handles computation of device and security statistics for dashboard cards.
 */

export class DeviceStatsService {
    /**
     * Compute device state statistics
     */
    static computeDeviceStats(devices) {
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
            const state = (d.state || '').toLowerCase();
            if (state === 'active') stats.active++;
            else if (state === 'enabled') stats.enabled++;
            else if (state === 'blocked') stats.blocked++;
            else if (state === 'deleted') stats.deleted++;

            // Online/offline based on inactivity
            if (this.isDeviceInactive(d)) {
                stats.offline++;
            } else {
                stats.online++;
            }
        }

        return stats;
    }

    /**
     * Compute security statistics for dashboard
     */
    static computeSecurityStats(devices, enrichedScores, deviceSummaries) {
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
            // Online count
            if (!this.isDeviceInactive(d)) {
                stats.online++;
            }

            // Risk scoring
            const enriched = enrichedScores[d.id];
            const score = enriched?.score ?? 0;
            if (Number.isFinite(score) && score > 0) {
                totalRisk += score;
                riskCount++;

                // High/Critical risk devices
                if (score >= 70) stats.criticalRiskCount++;
                else if (score >= 50) stats.highRiskCount++;
            }

            // CVE and app counts
            const summary = deviceSummaries[d.id];
            if (summary) {
                stats.vulnerableApps += summary.vulnerableApps || 0;
                stats.criticalCves += summary.criticalCves || 0;
            }
        }

        stats.avgRisk = riskCount > 0 ? Math.round(totalRisk / riskCount) : 0;
        return stats;
    }

    /**
     * Check if device is inactive (offline)
     */
    static isDeviceInactive(device) {
        const state = device.state?.toLowerCase();

        // Non-active states are considered offline
        if (state && state !== 'active') {
            return true;
        }

        // No heartbeat = offline
        if (!device.lastHeartbeat) {
            return true;
        }

        // Use calculated inactiveMinutes
        if (device.inactiveMinutes !== null && device.inactiveMinutes !== undefined) {
            // 60 minutes = offline threshold
            return device.inactiveMinutes >= 60;
        }

        return false;
    }
}
