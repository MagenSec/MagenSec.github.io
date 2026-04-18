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

    analyzeNetworkRisk(ipAddresses, telemetryHistory, latestFields = null) {
        /**
         * SECURITY/COMPLIANCE USE CASES:
         * - Detect unusual network patterns (public-routable IPs, APIPA, gateway drift)
         * - Track network movement (included in timeline)
         * - Identify exposure posture using the richer network telemetry bag
         */
        const normalizedIps = Array.isArray(ipAddresses) ? ipAddresses : this.normalizeIpAddresses(ipAddresses);
        const exposure = this.extractExposureData(normalizedIps, latestFields);
        const result = {
            risk: 'Normal',
            label: 'Private network',
            badgeClass: 'bg-success-lt text-success',
            reason: 'Telemetry shows local/private connectivity with no major exposure indicators.',
            publicIpPresent: exposure.publicIpCount > 0,
            apipaPresent: exposure.apipaPresent,
            suspiciousPatterns: [],
            riskFactors: [],
            publicEgressHint: exposure.publicEgressHint,
            gatewayCount: exposure.gatewayCount,
            dnsSuffixes: exposure.dnsSuffixes
        };

        if (!normalizedIps || normalizedIps.length === 0) {
            result.label = 'No telemetry';
            result.badgeClass = 'bg-secondary-lt text-secondary';
            result.reason = 'No network telemetry was available for this device.';
            return result;
        }

        if (exposure.apipaPresent) {
            result.risk = 'High';
            result.label = 'Connectivity drift';
            result.badgeClass = 'bg-warning-lt text-warning';
            result.riskFactors.push('APIPA detected: Device likely had DHCP/connectivity issues');
        }

        if (exposure.publicIpCount > 0) {
            result.publicIpPresent = true;
            result.risk = exposure.vpnInterfaces > 0 ? 'Medium' : 'High';
            result.label = exposure.vpnInterfaces > 0 ? 'Routable via VPN' : 'Public-routable';
            result.badgeClass = exposure.vpnInterfaces > 0 ? 'bg-warning-lt text-warning' : 'bg-danger-lt text-danger';
            result.riskFactors.push(`Public-routable IPs observed: ${exposure.publicIpCount}`);
        } else if (exposure.vpnInterfaces > 0) {
            result.label = 'VPN protected';
            result.badgeClass = 'bg-success-lt text-success';
            result.reason = `Protected by ${exposure.vpnInterfaces} VPN interface${exposure.vpnInterfaces > 1 ? 's' : ''}.`;
        } else if (exposure.privateIpCount > 0) {
            result.label = 'Private network';
            result.badgeClass = 'bg-info-lt text-info';
            result.reason = `${exposure.privateIpCount} private IP${exposure.privateIpCount > 1 ? 's' : ''} observed.`;
        }

        if (exposure.gatewayCount === 0 && normalizedIps.length > 0) {
            result.riskFactors.push('No default gateway detected');
            if (result.risk === 'Normal') {
                result.risk = 'Medium';
                result.label = 'Gateway missing';
                result.badgeClass = 'bg-warning-lt text-warning';
            }
        }

        if (exposure.isMetered) {
            result.riskFactors.push('Metered connection in use');
        }

        // Check for rapid IP changes (security/troubleshooting indicator)
        if (telemetryHistory && telemetryHistory.length > 1) {
            const recentIps = new Set();
            const recentWindow = telemetryHistory.slice(0, 5);

            for (const entry of recentWindow) {
                const ips = this.parseStringArray(entry?.fields?.IPAddresses);
                ips.forEach(ip => recentIps.add(ip));
            }

            if (recentIps.size > 3) {
                result.suspiciousPatterns.push(`Rapid network changes: ${recentIps.size} different IPs in recent activity`);
            }
        }

        if (result.riskFactors.length > 0) {
            result.reason = result.riskFactors.join(' • ');
        }

        return result;
    }

    extractExposureData(ipAddresses, latestFields = null) {
        const rawExposure = latestFields?.NetworkExposureJson || latestFields?.networkExposureJson || latestFields?.NetworkExposure || latestFields?.networkExposure;
        let parsed = null;
        if (rawExposure && typeof rawExposure === 'string') {
            try { parsed = JSON.parse(rawExposure); } catch { /* ignore */ }
        } else if (rawExposure && typeof rawExposure === 'object') {
            parsed = rawExposure;
        }

        const gateways = this.parseStringArray(latestFields?.DefaultGateways || latestFields?.defaultGateways);
        const dnsSuffixes = this.parseStringArray(latestFields?.DnsSuffixes || latestFields?.dnsSuffixes);
        const publicEgressHint = latestFields?.PublicEgressHint || latestFields?.publicEgressHint || null;
        const proxyType = latestFields?.ProxyType || latestFields?.proxyType || 'None';

        return {
            publicIpCount: parsed?.PublicIpCount ?? parsed?.publicIpCount ?? ipAddresses.filter(ip => !this.isPrivateIp(ip)).length,
            privateIpCount: parsed?.PrivateIpCount ?? parsed?.privateIpCount ?? ipAddresses.filter(ip => this.isPrivateIp(ip)).length,
            vpnInterfaces: parsed?.VpnInterfaces ?? parsed?.vpnInterfaces ?? 0,
            wirelessInterfaces: parsed?.WirelessInterfaces ?? parsed?.wirelessInterfaces ?? 0,
            ethernetInterfaces: parsed?.EthernetInterfaces ?? parsed?.ethernetInterfaces ?? 0,
            gatewayCount: parsed?.GatewayCount ?? parsed?.gatewayCount ?? gateways.length,
            uniqueIpCount: parsed?.UniqueIpCount ?? parsed?.uniqueIpCount ?? ipAddresses.length,
            apipaPresent: parsed?.ApipaPresent ?? parsed?.apipaPresent ?? ipAddresses.some(ip => typeof ip === 'string' && ip.startsWith('169.254.')),
            isMetered: parsed?.IsMetered ?? parsed?.isMetered ?? latestFields?.IsMeteredConnection ?? latestFields?.isMeteredConnection ?? false,
            dnsSuffixes,
            gateways,
            publicEgressHint,
            proxyType
        };
    }

    parseStringArray(raw) {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            } catch { /* fallback */ }
            return raw.split(/[;,\s]+/).filter(Boolean);
        }
        return [];
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
