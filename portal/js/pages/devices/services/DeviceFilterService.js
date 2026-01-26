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
     * Check if device matches license filter
     */
    static matchesLicense(device, filter) {
        if (filter === 'all') return true;
        const state = (device.state || '').toLowerCase();
        if (filter === 'active') return state === 'active';
        return true;
    }

    /**
     * Check if device matches connection filter
     */
    static matchesConnection(device, filter) {
        if (filter === 'all') return true;
        const inactive = this.isDeviceInactive(device);
        if (filter === 'online') return !inactive;
        if (filter === 'offline') return inactive;
        return true;
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
        const state = device.state?.toLowerCase();
        if (state && state !== 'active') return true;
        if (!device.lastHeartbeat) return true;
        if (device.inactiveMinutes !== null && device.inactiveMinutes !== undefined) {
            return device.inactiveMinutes >= 60;
        }
        return false;
    }
}
