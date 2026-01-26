/**
 * SiteAdmin - Devices Tab
 * Device management for site administrators
 */

export class DevicesTab {
    render(devices, state, handlers) {
        const { html } = window;

        if (!devices || devices.length === 0) {
            return html`
                <div class="empty">
                    <div class="empty-title">No devices</div>
                    <p class="empty-subtitle text-muted">No devices in the system</p>
                </div>
            `;
        }

        return html`
            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter table-mobile-md card-table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Device Name</th>
                                <th>Organization</th>
                                <th>Owner</th>
                                <th>Status</th>
                                <th>Last Seen</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${devices.map(device => html`
                                <tr>
                                    <td>${device.name}</td>
                                    <td>${device.organizationName}</td>
                                    <td>${device.ownerEmail}</td>
                                    <td>
                                        <span class="badge bg-${device.status === 'active' ? 'success' : 'secondary'}">
                                            ${device.status}
                                        </span>
                                    </td>
                                    <td>${this.formatDate(device.lastSeen)}</td>
                                    <td class="text-end">
                                        <div class="dropdown">
                                            <button class="btn btn-sm align-text-top" data-bs-toggle="dropdown">
                                                Actions
                                            </button>
                                            <div class="dropdown-menu dropdown-menu-end">
                                                <a class="dropdown-item" href="#" 
                                                   onclick=${() => handlers.editDevice(device.id)}>
                                                    Edit
                                                </a>
                                                <a class="dropdown-item" href="#" 
                                                   onclick=${() => handlers.viewDeviceDetails(device.id)}>
                                                    View Details
                                                </a>
                                                ${device.status === 'active' ? html`
                                                    <a class="dropdown-item" href="#" 
                                                       onclick=${() => handlers.disableDevice(device.id)}>
                                                        Disable
                                                    </a>
                                                ` : html`
                                                    <a class="dropdown-item" href="#" 
                                                       onclick=${() => handlers.enableDevice(device.id)}>
                                                        Enable
                                                    </a>
                                                `}
                                                <div class="dropdown-divider"></div>
                                                <a class="dropdown-item text-danger" href="#" 
                                                   onclick=${() => handlers.deleteDevice(device.id)}>
                                                    Delete
                                                </a>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}
