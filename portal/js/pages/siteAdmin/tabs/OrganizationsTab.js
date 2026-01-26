/**
 * Site Admin - Organizations Tab Component
 * Manage organizations and their settings
 */

export class OrganizationsTab {
    render(organizations, state, handlers) {
        const { html } = window;

        return html`
            <div class="tab-pane" id="organizations">
                <div class="card-body">
                    <h4 class="card-title">Organizations</h4>
                    
                    <div class="mb-3">
                        <button class="btn btn-primary" onclick=${() => handlers.showOrgModal()}>
                            <svg class="icon">+</svg>
                            Create Organization
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-vcenter table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Organization Name</th>
                                    <th>Type</th>
                                    <th>Users</th>
                                    <th>Devices</th>
                                    <th>Created</th>
                                    <th style="width: 100px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${organizations && organizations.length > 0
                                    ? organizations.map(org => html`
                                        <tr>
                                            <td><strong>${org.name}</strong></td>
                                            <td><span class="badge bg-info">${org.type || 'Business'}</span></td>
                                            <td><span class="badge bg-light">${org.userCount || 0}</span></td>
                                            <td><span class="badge bg-light">${org.deviceCount || 0}</span></td>
                                            <td>${handlers.formatDate(org.createdAt)}</td>
                                            <td>
                                                <div class="btn-group btn-group-sm">
                                                    <button class="btn btn-outline-secondary" onclick=${() => handlers.editOrg(org)}>
                                                        Edit
                                                    </button>
                                                    <button class="btn btn-outline-danger" onclick=${() => handlers.deleteOrg(org)}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `)
                                    : html`<tr><td colspan="6" class="text-center text-muted">No organizations found</td></tr>`
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}
