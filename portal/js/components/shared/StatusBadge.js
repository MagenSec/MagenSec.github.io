/**
 * Reusable status badge component for device health states
 * @param {Object} props
 * @param {string} props.status - Online, Offline, Error, or Unknown
 * @param {boolean} props.showIcon - Whether to show icon
 * @param {string} props.size - sm, md, lg
 */
export function StatusBadge({ status, showIcon = true, size = 'md' }) {
    const { html } = window;
    const config = getStatusConfig(status);
    const sizeClass = size === 'sm' ? 'badge-sm' : '';
    
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
 * @returns {Object} Status config with text, color, icon
 */
export function getConnectionStatus(device) {
    const lastSeen = device.lastSeen || device.lastHeartbeat;
    const lastTelemetry = device.lastTelemetry;
    
    if (!lastSeen || !lastTelemetry) {
        return { status: 'Error', color: 'bg-danger', icon: '⚠️' };
    }
    
    const heartbeatMinutes = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    const telemetryMinutes = (Date.now() - new Date(lastTelemetry).getTime()) / 60000;
    const heartbeatFresh = heartbeatMinutes < 30;
    const telemetryFresh = telemetryMinutes < 30;
    
    if (heartbeatFresh && !telemetryFresh) {
        return { status: 'Error', color: 'bg-danger', icon: '⚠️' };
    }
    
    if (!heartbeatFresh && telemetryFresh) {
        return { status: 'Error', color: 'bg-danger', icon: '⚠️' };
    }
    
    if (!heartbeatFresh && !telemetryFresh) {
        return { status: 'Offline', color: 'bg-warning', icon: '⊗' };
    }
    
    return { status: 'Online', color: 'bg-success', icon: '✓' };
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
