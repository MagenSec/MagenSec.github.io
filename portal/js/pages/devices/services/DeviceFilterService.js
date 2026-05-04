/**
 * DeviceFilterService - Device filtering and sorting logic
 * 
 * Handles all device filtering, searching, and sorting operations.
 */

export class DeviceFilterService {
    /**
     * Filter devices based on search query and filters
     */
    static getFilteredDevices(devices, searchQuery, deviceFilters, sortField, sortAsc, enrichedScores) {
        const q = (searchQuery || '').trim().toLowerCase();

        let list = devices
            .filter(d => this.matchesLicense(d, deviceFilters.license))
            .filter(d => this.matchesConnection(d, deviceFilters.connection))
            .filter(d => this.matchesSpec(d, deviceFilters.spec))
            .filter(d => {
                if (!q) return true;
                const name = (d.name || d.deviceName || '').toLowerCase();
                const id = (d.id || d.deviceId || '').toLowerCase();
                const os = (d.telemetry?.osEdition || '').toLowerCase();
                const version = (d.telemetry?.osVersion || '').toLowerCase();
                const ip = (d.telemetry?.ipAddresses || '').toLowerCase();
                const license = (d.licenseKey || '').toLowerCase();

                return name.includes(q) || id.includes(q) || os.includes(q) || 
                       version.includes(q) || ip.includes(q) || license.includes(q);
            });

        // Apply sorting
        list.sort((a, b) => this.sortDevices(a, b, sortField, sortAsc, enrichedScores));

        return list;
    }

    /**
     * Check if device matches license/state filter
     */
    static matchesLicense(device, filter) {
        if (filter === 'all') return true;
        const state = (device.state || '').toLowerCase();
        return state === filter;
    }

    /**
     * Check if device matches connection/connectivity filter
     */
    static matchesConnection(device, filter) {
        if (filter === 'all') return true;
        const connectivity = this.getConnectivity(device);
        // 'recent' matches both recent-online and recent-offline
        if (filter === 'recent') return connectivity === 'recent-online' || connectivity === 'recent-offline';
        if (filter === 'recent-online') return connectivity === 'recent-online';
        if (filter === 'recent-offline') return connectivity === 'recent-offline';
        if (filter === 'error') return connectivity === 'error';
        return connectivity === filter;
    }

    /**
     * Classify device visibility state using canonical model:
    * recent-online (<60m), recent-offline (60m-24h), stale (1-3d), dormant (3-7d), ghosted (>=7d/no heartbeat), error
     * Aligned with DevicePostureStateModel and DeviceStateClassifier thresholds
     */
    static getConnectivity(device) {
        const lower = value => String(value || '').toLowerCase();
        const health = device.health || device.Health || {};
        const status = lower(device.status || device.Status || health.status || health.Status);
        const visibilityState = lower(device.visibilityState || device.VisibilityState || health.visibilityState || health.VisibilityState);
        const telemetryState = lower(device.telemetryState || device.TelemetryState || health.telemetryState || health.TelemetryState);
        const connectivityState = lower(device.connectivityState || device.ConnectivityState || health.connectivityState || health.ConnectivityState);

        if (status === 'error' || telemetryState === 'error') return 'error';
        if (visibilityState === 'ghosted' || status === 'ghosted') return 'ghosted';
        if (visibilityState === 'dormant' || status === 'dormant') return 'dormant';
        if (visibilityState === 'stale' || status === 'stale') return 'stale';
        if (visibilityState === 'recent' || visibilityState === 'online' || status === 'online') {
            return connectivityState === 'offline' ? 'recent-offline' : 'recent-online';
        }

        const state = device.state?.toLowerCase();
        if (state === 'blocked') return 'error';
        if (!device.lastHeartbeat) return 'ghosted';
        const mins = device.inactiveMinutes;
        if (mins === null || mins === undefined) return 'ghosted';
        if (mins >= 10080) return 'ghosted';   // >= 7 days
        if (mins >= 4320) return 'dormant';    // >= 3 days
        if (mins >= 1440) return 'stale';      // >= 1 day
        if (mins >= 60) return 'recent-offline'; // >= 1 hour
        return 'recent-online';                // < 1 hour
    }

    /**
     * Check if device matches spec filter (architecture)
     */
    static matchesSpec(device, filter) {
        if (filter === 'all') return true;
        // Check device.architecture, telemetry fields, or CPUArch
        const arch = (
            device.architecture || 
            device.telemetry?.architecture || 
            device.telemetry?.Architecture ||
            device.telemetry?.cpuArch ||
            device.telemetry?.CPUArch ||
            ''
        ).toLowerCase();
        if (filter === 'x64') return arch.includes('x64') || arch.includes('amd64') || arch === 'x86_64';
        if (filter === 'arm64') return arch.includes('arm64') || arch.includes('arm');
        return true;
    }

    /**
     * Sort devices
     */
    static sortDevices(a, b, sortField, sortAsc, enrichedScores) {
        let valA, valB;

        switch (sortField) {
            case 'name':
                valA = (a.name || a.deviceName || '').toLowerCase();
                valB = (b.name || b.deviceName || '').toLowerCase();
                break;
            case 'risk':
                valA = enrichedScores[a.id]?.score ?? 0;
                valB = enrichedScores[b.id]?.score ?? 0;
                break;
            case 'lastSeen':
                valA = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0;
                valB = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0;
                break;
            case 'state':
                valA = (a.state || '').toLowerCase();
                valB = (b.state || '').toLowerCase();
                break;
            default:
                return 0;
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    }

    /**
     * Check if device is inactive (helper)
     */
    static isDeviceInactive(device) {
        const lower = value => String(value || '').toLowerCase();
        const health = device.health || device.Health || {};
        const status = lower(device.status || device.Status || health.status || health.Status);
        const visibilityState = lower(device.visibilityState || device.VisibilityState || health.visibilityState || health.VisibilityState);
        const telemetryState = lower(device.telemetryState || device.TelemetryState || health.telemetryState || health.TelemetryState);
        const connectivityState = lower(device.connectivityState || device.ConnectivityState || health.connectivityState || health.ConnectivityState);

        if (status === 'error' || telemetryState === 'error') return true;
        if (visibilityState === 'ghosted' || visibilityState === 'dormant' || visibilityState === 'stale') return true;
        if (visibilityState === 'recent' || visibilityState === 'online' || status === 'online') {
            return connectivityState === 'offline';
        }

        const state = device.state?.toLowerCase();
        if (state && state !== 'active') return true;
        if (!device.lastHeartbeat) return true;
        if (device.inactiveMinutes !== null && device.inactiveMinutes !== undefined) {
            return device.inactiveMinutes >= 60;
        }
        return false;
    }
}
