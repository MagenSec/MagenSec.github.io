/**
 * RiskAnalysisService - Risk scoring and analysis utilities
 */

export class RiskAnalysisService {
    /**
     * Derive CVSS score from constituents and summary
     */
    static deriveCvss(constituents, summary) {
        const c = constituents || {};
        const s = summary || {};
        const candidates = [
            c.maxCvssNormalized,
            c.maxCvss,
            c.highestCvssNormalized,
            c.highestCvss,
            s.maxCvssNormalized,
            s.maxCvss,
            s.highestCvssNormalized,
            s.highestCvss,
            s.cvssMax,
            s.cvssHighest
        ].filter(v => Number.isFinite(v));

        let cvss = candidates.length > 0 ? candidates[0] : null;
        if (cvss !== null && cvss <= 1.5) {
            cvss = cvss * 10; // Denormalize if needed
        }
        if (cvss !== null) {
            return Math.min(10, Math.max(0, cvss));
        }
        if (cvss === null) {
            return this.cvssFromWorstSeverity(s.worstSeverity);
        }
        return cvss;
    }

    /**
     * Derive known exploit info from constituents
     */
    static deriveKnownExploitInfo(constituents, knownExploitsSet) {
        const c = constituents || {};
        const explicitCount = Number(c.knownExploitCount);
        if (Number.isFinite(explicitCount) && explicitCount > 0) {
            return { count: explicitCount, has: true, ids: c.knownExploitIds || [] };
        }

        const explicitIds = Array.isArray(c.knownExploitIds) ? c.knownExploitIds : [];
        const cveIds = Array.isArray(c.cveIds) ? c.cveIds
            : Array.isArray(c.topCveIds) ? c.topCveIds
            : Array.isArray(c.cves) ? c.cves
            : Array.isArray(explicitIds) ? explicitIds
            : [];

        const knownExploits = knownExploitsSet || new Set();
        if (knownExploits.size > 0 && cveIds.length > 0) {
            const matchingExploits = cveIds.filter(id => knownExploits.has(id));
            if (matchingExploits.length > 0) {
                return { count: matchingExploits.length, has: true, ids: matchingExploits };
            }
        }

        if (explicitIds.length > 0) {
            return { count: explicitIds.length, has: true, ids: explicitIds };
        }

        return { count: 0, has: false, ids: [] };
    }

    /**
     * Derive network exposure from telemetry
     */
    static deriveNetworkExposure(telemetryDetail) {
        const fields = telemetryDetail?.history?.[0]?.fields || telemetryDetail?.latest?.fields || {};
        const rawExposure = fields.NetworkExposureJson || fields.networkExposureJson;
        const ipRaw = fields.IPAddresses || fields.ipAddresses;
        let parsed = null;
        if (rawExposure) {
            try { parsed = JSON.parse(rawExposure); } catch { /* ignore */ }
        }

        const ips = (() => {
            if (Array.isArray(ipRaw)) return ipRaw;
            if (typeof ipRaw === 'string') {
                try {
                    const p = JSON.parse(ipRaw);
                    if (Array.isArray(p)) return p;
                } catch { /* fallback */ }
                return ipRaw.split(/[;,\s]+/).filter(Boolean);
            }
            return [];
        })();

        const exposure = {
            label: 'Unknown',
            badgeClass: 'bg-secondary-lt',
            reasons: [],
            missingAdmin: [
                'Firewall status',
                'Inbound RDP/SMB exposure',
                'Endpoint protection status'
            ]
        };

        const hasAnyData = parsed !== null || (ips && ips.length > 0);
        if (!hasAnyData) {
            exposure.label = 'No Data';
            return exposure;
        }

        const data = parsed || {};
        const publicIpCount = data.PublicIpCount ?? data.publicIpCount ?? ips.filter(ip => !this.isPrivateIp(ip)).length;
        const privateIpCount = data.PrivateIpCount ?? data.privateIpCount ?? ips.filter(ip => this.isPrivateIp(ip)).length;
        const vpnInterfaces = data.VpnInterfaces ?? data.vpnInterfaces ?? 0;
        const wirelessInterfaces = data.WirelessInterfaces ?? data.wirelessInterfaces ?? 0;
        const ethernetInterfaces = data.EthernetInterfaces ?? data.ethernetInterfaces ?? 0;
        const apipaPresent = data.ApipaPresent ?? data.apipaPresent ?? false;
        const gatewayCount = data.GatewayCount ?? data.gatewayCount ?? null;
        const uniqueIpCount = data.UniqueIpCount ?? data.uniqueIpCount ?? ips.length;
        const isMetered = data.IsMetered ?? data.isMetered ?? fields.IsMeteredConnection ?? fields.isMeteredConnection;

        if (publicIpCount > 0) {
            exposure.label = 'Public Internet';
            exposure.badgeClass = 'bg-danger-lt';
            exposure.reasons.push(`${publicIpCount} public IP${publicIpCount > 1 ? 's' : ''}`);
        } else if (vpnInterfaces > 0) {
            exposure.label = 'VPN Protected';
            exposure.badgeClass = 'bg-success-lt';
            exposure.reasons.push(`${vpnInterfaces} VPN interface${vpnInterfaces > 1 ? 's' : ''}`);
        } else if (privateIpCount > 0) {
            exposure.label = 'Private Network';
            exposure.badgeClass = 'bg-info-lt';
            exposure.reasons.push(`${privateIpCount} private IP${privateIpCount > 1 ? 's' : ''}`);
            if (wirelessInterfaces > 0) {
                exposure.reasons.push(`${wirelessInterfaces} Wi-Fi`);
            }
            if (ethernetInterfaces > 0) {
                exposure.reasons.push(`${ethernetInterfaces} Ethernet`);
            }
        }

        if (apipaPresent) {
            exposure.reasons.push('APIPA detected (no DHCP)');
        }

        if (isMetered) {
            exposure.reasons.push('Metered connection');
        }

        if (gatewayCount === 0) {
            exposure.reasons.push('No gateway configured');
        }

        if (exposure.reasons.length === 0) {
            exposure.label = 'Limited Data';
            exposure.badgeClass = 'bg-secondary-lt';
            exposure.reasons.push('Partial network data available');
        }

        // Add context on IP diversity if available
        if (uniqueIpCount > 3) {
            exposure.reasons.push(`${uniqueIpCount} unique IPs (multi-homed)`);
        }

        return exposure;
    }

    /**
     * Check if IP is private
     */
    static isPrivateIp(ip) {
        if (!ip) return false;
        const v4 = ip.split('.');
        if (v4.length === 4) {
            const first = parseInt(v4[0], 10);
            if (first === 10) return true;
            if (first === 172 && parseInt(v4[1], 10) >= 16 && parseInt(v4[1], 10) <= 31) return true;
            if (first === 192 && parseInt(v4[1], 10) === 168) return true;
            return false;
        }
        // IPv6 unique local fc00::/7
        return ip.startsWith('fc') || ip.startsWith('Fd') || ip.startsWith('fd');
    }

    /**
     * Convert severity to CVSS estimate (helper)
     */
    static cvssFromWorstSeverity(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 9.5;
        if (s === 'HIGH') return 7.5;
        if (s === 'MEDIUM') return 5.0;
        if (s === 'LOW') return 2.5;
        return null;
    }
}
