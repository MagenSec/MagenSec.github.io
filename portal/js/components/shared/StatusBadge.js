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
 * @param {Object} device - Device object with lastHeartbeat and lastTelemetry
 * @returns {Object} Status config with text, color, icon, tooltip
 */
export function getConnectionStatus(device) {
    const lastHeartbeat = device.lastSeen || device.lastHeartbeat;
    const lastTelemetry = device.lastTelemetry;
    
    // Never connected or missing critical timestamps
    if (!lastHeartbeat || !lastTelemetry) {
        return { 
            status: 'Error', 
            color: 'bg-danger', 
            icon: '⚠️',
            tooltip: 'Device has not established connection. Contact Support if this persists for more than 6 hours.'
        };
    }
    
    const heartbeatMinutes = (Date.now() - new Date(lastHeartbeat).getTime()) / 60000;
    const telemetryMinutes = (Date.now() - new Date(lastTelemetry).getTime()) / 60000;
    const heartbeatFresh = heartbeatMinutes < 30;
    const telemetryFresh = telemetryMinutes < 30;
    
    // Heartbeat fresh but telemetry stale (upload issues)
    if (heartbeatFresh && !telemetryFresh) {
        return { 
            status: 'Error', 
            color: 'bg-danger', 
            icon: '⚠️',
            tooltip: 'Device is connected but telemetry uploads are failing. Contact Support if this persists for more than 6 hours.'
        };
    }
    
    // Telemetry fresh but heartbeat stale (unusual - connection issues)
    if (!heartbeatFresh && telemetryFresh) {
        return { 
            status: 'Error', 
            color: 'bg-danger', 
            icon: '⚠️',
            tooltip: 'Device connection is unstable. Contact Support if this persists for more than 6 hours.'
        };
    }
    
    // Both stale - device is offline
    if (!heartbeatFresh && !telemetryFresh) {
        return { 
            status: 'Offline', 
            color: 'bg-warning', 
            icon: '⊗',
            tooltip: `Device was last seen ${formatDuration(heartbeatMinutes)} ago. Check if the device is powered on and connected to the network.`
        };
    }
    
    // Both fresh - healthy
    return { 
        status: 'Online', 
        color: 'bg-success', 
        icon: '✓',
        tooltip: 'Device is online and reporting telemetry normally.'
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
            return { text: 'Online', color: 'bg-success', icon: '✓' };
        case 'offline':
            return { text: 'Offline', color: 'bg-warning', icon: '⊗' };
        case 'error':
            return { text: 'Error', color: 'bg-danger', icon: '⚠️' };
        default:
            return { text: 'Unknown', color: 'bg-secondary', icon: '?' };
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
    const hours = (Date.now() - new Date(lastSeen).getTime()) / 3600000;
    if (hours < 6) return animated ? 'status-dot-animated status-green' : 'status-green';
    if (hours < 24) return 'status-yellow';
    return 'status-red';
}
