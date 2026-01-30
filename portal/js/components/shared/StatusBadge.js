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
    if (!device || !device.health) {
        return { 
            status: 'Error', 
            color: 'bg-danger-lt text-danger', 
            icon: '⚠️',
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
            color: 'bg-warning-lt text-warning',
            icon: '⊗',
            tooltip: `Device is offline. Last seen ${formatDuration(health.heartbeatMinutes)} ago.`
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
            return { text: 'Offline', color: 'bg-warning-lt text-warning', icon: '⊗' };
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
    const hours = (Date.now() - new Date(lastSeen).getTime()) / 3600000;
    if (hours < 6) return animated ? 'status-dot-animated status-green' : 'status-green';
    if (hours < 24) return 'status-yellow';
    return 'status-red';
}
