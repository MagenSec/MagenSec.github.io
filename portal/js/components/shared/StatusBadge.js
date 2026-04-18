/**
 * Reusable status badge component for device health states
 * @param {Object} props
 * @param {string} props.status - Online, Offline, Error, or Unknown
 * @param {boolean} props.showIcon - Whether to show icon
 * @param {string} props.size - sm, md, lg
 * @param {boolean} props.showTooltip - Whether to show tooltip
 * @param {string} props.tooltip - Custom tooltip text
 */
export function StatusBadge({ status, showIcon = true, size = 'md', showTooltip = true, tooltip = null }) {
    const { html } = window;
    const config = getStatusConfig(status);
    const sizeClass = size === 'sm' ? 'badge-sm' : '';
    const tooltipText = tooltip || config.tooltip;
    
    if (showTooltip && tooltipText) {
        return html`
            <span class="badge ${config.color} ${sizeClass}" 
                  title="${tooltipText}" 
                  data-bs-toggle="tooltip"
                  style="cursor: help;">
                ${showIcon ? html`${config.icon} ` : ''}
                ${config.text}
            </span>
        `;
    }
    
    return html`
        <span class="badge ${config.color} ${sizeClass}">
            ${showIcon ? html`${config.icon} ` : ''}
            ${config.text}
        </span>
    `;
}

/**
 * Get connection status configuration
 * Trusts device.health object from API (status, reason, heartbeatMinutes, telemetryMinutes)
 * @param {Object} device - Device object with health property
 * @returns {Object} Status config with status, color, icon, tooltip
 */
export function getConnectionStatus(device) {
    if (!device) {
        return {
            status: 'Unknown',
            color: 'bg-secondary-lt text-secondary',
            icon: '?',
            tooltip: 'Device information unavailable.'
        };
    }

    if (!device.health) {
        const derived = deriveStatusFromDeviceFields(device);
        if (derived) {
            return derived;
        }

        return {
            status: 'Unknown',
            color: 'bg-secondary-lt text-secondary',
            icon: '?',
            tooltip: 'Device health information unavailable.'
        };
    }

    const health = device.health;
    const healthStatus = (health.status || 'unknown').toLowerCase();
    const reason = health.reason || 'Device health error.';
    
    // Map backend health.status to UI display config
    const statusMap = {
        'online': {
            status: 'Online',
            color: 'bg-success-lt text-success',
            icon: '✓',
            tooltip: 'Device is online and reporting telemetry normally.'
        },
        'offline': {
            status: 'Offline',
            color: 'bg-info-lt text-info',
            icon: '⊗',
            tooltip: `Device is offline. Last seen ${formatDuration(health.heartbeatMinutes)} ago.`
        },
        'stale': {
            status: 'Stale',
            color: 'bg-warning-lt text-warning',
            icon: '⊗',
            tooltip: `Device is stale. Last seen ${formatDuration(health.heartbeatMinutes)} ago.`
        },
        'dormant': {
            status: 'Dormant',
            color: 'bg-orange-lt text-orange',
            icon: '⊗',
            tooltip: `Device is dormant. Last seen ${formatDuration(health.heartbeatMinutes)} ago.`
        },
        'ghosted': {
            status: 'Ghosted',
            color: 'bg-danger-lt text-danger',
            icon: '⊗',
            tooltip: `Device is ghosted. Last seen ${formatDuration(health.heartbeatMinutes)} ago.`
        },
        'error': {
            status: 'Error',
            color: 'bg-danger-lt text-danger',
            icon: '⚠️',
            tooltip: reason
        },
        'unknown': {
            status: 'Unknown',
            color: 'bg-secondary-lt text-secondary',
            icon: '?',
            tooltip: 'Device status is unknown.'
        }
    };

    return statusMap[healthStatus] || statusMap['unknown'];
}

function deriveStatusFromDeviceFields(device) {
    const explicitStatus = String(device?.status || '').toLowerCase();
    if (explicitStatus === 'online' || explicitStatus === 'active') {
        return {
            status: 'Online',
            color: 'bg-success-lt text-success',
            icon: '✓',
            tooltip: 'Device is online and reporting telemetry normally.'
        };
    }

    if (explicitStatus === 'offline' || explicitStatus === 'stale' || explicitStatus === 'dormant') {
        return {
            status: explicitStatus === 'stale' ? 'Stale' : explicitStatus === 'dormant' ? 'Dormant' : 'Offline',
            color: explicitStatus === 'dormant' ? 'bg-orange-lt text-orange' : 'bg-warning-lt text-warning',
            icon: '⊗',
            tooltip: 'Device is offline based on latest status telemetry.'
        };
    }

    if (explicitStatus === 'ghosted') {
        return {
            status: 'Ghosted',
            color: 'bg-danger-lt text-danger',
            icon: '⊗',
            tooltip: 'Device has not been seen for more than 7 days.'
        };
    }

    if (explicitStatus === 'error' || explicitStatus === 'blocked' || explicitStatus === 'disabled') {
        return {
            status: 'Error',
            color: 'bg-danger-lt text-danger',
            icon: '⚠️',
            tooltip: 'Device is disabled or blocked.'
        };
    }

    const state = String(device?.state || device?.deviceState || '').toUpperCase();
    const isEnabled = device?.isEnabled !== false;
    const lastHeartbeat = device?.lastHeartbeat || device?.lastSeen;
    const heartbeatMs = lastHeartbeat ? new Date(lastHeartbeat).getTime() : null;
    const nowMs = Date.now();

    if (!isEnabled || state === 'BLOCKED' || state === 'DELETED') {
        return {
            status: 'Error',
            color: 'bg-danger-lt text-danger',
            icon: '⚠️',
            tooltip: 'Device is disabled or blocked.'
        };
    }

    if (!heartbeatMs || Number.isNaN(heartbeatMs)) {
        return {
            status: 'Offline',
            color: 'bg-warning-lt text-warning',
            icon: '⊗',
            tooltip: 'No heartbeat received yet.'
        };
    }

    const heartbeatMinutes = (nowMs - heartbeatMs) / 60000;
    if (heartbeatMinutes <= 60) {
        return {
            status: 'Online',
            color: 'bg-success-lt text-success',
            icon: '✓',
            tooltip: 'Device heartbeat is current.'
        };
    }

    if (heartbeatMinutes <= 1440) {
        return {
            status: 'Offline',
            color: 'bg-info-lt text-info',
            icon: '⊗',
            tooltip: `Device is offline. Last seen ${formatDuration(heartbeatMinutes)} ago.`
        };
    }

    if (heartbeatMinutes <= 4320) {
        return {
            status: 'Stale',
            color: 'bg-warning-lt text-warning',
            icon: '⊗',
            tooltip: `Device is stale. Last seen ${formatDuration(heartbeatMinutes)} ago.`
        };
    }

    if (heartbeatMinutes <= 10080) {
        return {
            status: 'Dormant',
            color: 'bg-orange-lt text-orange',
            icon: '⊗',
            tooltip: `Device is dormant. Last seen ${formatDuration(heartbeatMinutes)} ago.`
        };
    }

    return {
        status: 'Ghosted',
        color: 'bg-danger-lt text-danger',
        icon: '⊗',
        tooltip: `Device is ghosted. Last seen ${formatDuration(heartbeatMinutes)} ago.`
    };
}

function formatDuration(minutes) {
    if (minutes < 60) return `${Math.floor(minutes)} minutes`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
    return `${Math.floor(minutes / 1440)} days`;
}

function getStatusConfig(status) {
    const normalized = (status || '').toLowerCase();
    
    switch (normalized) {
        case 'online':
            return { text: 'Online', color: 'bg-success-lt text-success', icon: '✓' };
        case 'offline':
            return { text: 'Offline', color: 'bg-info-lt text-info', icon: '⊗' };
        case 'stale':
            return { text: 'Stale', color: 'bg-warning-lt text-warning', icon: '⊗' };
        case 'dormant':
            return { text: 'Dormant', color: 'bg-orange-lt text-orange', icon: '⊗' };
        case 'ghosted':
            return { text: 'Ghosted', color: 'bg-danger-lt text-danger', icon: '⊗' };
        case 'error':
            return { text: 'Error', color: 'bg-danger-lt text-danger', icon: '⚠️' };
        default:
            return { text: 'Unknown', color: 'bg-secondary-lt text-secondary', icon: '?' };
    }
}

/**
 * Status dot component for inline status indicators
 * @param {Object} props
 * @param {Date|string} props.lastSeen - Last heartbeat timestamp
 * @param {boolean} props.animated - Whether to animate the dot
 */
export function StatusDot({ lastSeen, animated = true }) {
    const dotClass = getStatusDotClass(lastSeen, animated);
    return html`<span class="status-dot ${dotClass}"></span>`;
}

function getStatusDotClass(lastSeen, animated) {
    if (!lastSeen) return 'status-red';
    const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    if (mins < 60) return animated ? 'status-dot-animated status-green' : 'status-green';
    if (mins < 1440) return 'status-azure';     // Offline (recent)
    if (mins < 4320) return 'status-yellow';    // Stale
    if (mins < 10080) return 'status-orange';   // Dormant
    return 'status-red';                        // Ghosted
}
