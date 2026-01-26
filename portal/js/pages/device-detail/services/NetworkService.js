/**
 * Network analysis service - IP detection, mobile device detection, risk analysis
 */

export class NetworkService {
    constructor() {}

    detectMobileDevice(telemetryHistory) {
        /**
         * INVENTORY USE CASE: Identify mobile vs stationary devices
         * Mobile devices have multiple unique IPs over time (roaming between networks)
         * Stationary devices have stable IPs
         */
        if (!telemetryHistory || !Array.isArray(telemetryHistory)) {
            return {
                isMobile: false,
                uniqueIpCount: 0,
                stationaryThreshold: 3,
                category: 'Stationary Device',
                confidence: 1.0
            };
        }

        const uniqueIps = new Set();
        const stationaryThreshold = 3;

        for (const entry of telemetryHistory) {
            const ips = entry?.fields?.IPAddresses;
            if (Array.isArray(ips)) {
                ips.forEach(ip => uniqueIps.add(ip));
            } else if (typeof ips === 'string') {
                // Handle string format
                try {
                    const parsed = JSON.parse(ips);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(ip => uniqueIps.add(ip));
                    }
                } catch {
                    ips.split(/[;,\s]+/).filter(Boolean).forEach(ip => uniqueIps.add(ip));
                }
            }
        }

        const uniqueCount = uniqueIps.size;
        const isMobile = uniqueCount > stationaryThreshold;
        const confidence = isMobile
            ? Math.min(1.0, (uniqueCount - stationaryThreshold) / 10)
            : 1.0;

        return {
            isMobile,
            uniqueIpCount: uniqueCount,
            stationaryThreshold,
            category: isMobile ? 'Mobile Device' : 'Stationary Device',
            confidence
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
            risk: 'Normal',
            reason: '',
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

        // Set overall risk level and reason
        if (result.riskFactors.length > 0) {
            result.risk = result.apipaPresent ? 'High' : 'Medium';
            result.reason = result.riskFactors[0];
        }

        return result;
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

    normalizeIpAddresses(ipRaw) {
        if (Array.isArray(ipRaw)) return ipRaw;
        if (typeof ipRaw === 'string') {
            try {
                const parsed = JSON.parse(ipRaw);
                if (Array.isArray(parsed)) return parsed;
            } catch (err) { /* fall through to delimiter split */ }
            return ipRaw.split(/[;,\s]+/).filter(Boolean);
        }
        return [];
    }
}
