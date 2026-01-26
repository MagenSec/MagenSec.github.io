/**
 * Site Admin - Licenses Tab Component
 * Manage business licenses
 */

export class LicensesTab {
    render(licenses, state, handlers) {
        const { html } = window;

        return html`
            <div class="tab-pane" id="licenses">
                <div class="card-body">
                    <h4 class="card-title">License Management</h4>
                    
                    <div class="mb-3">
                        <button class="btn btn-primary" onclick=${() => handlers.showLicenseModal()}>
                            <svg class="icon">+</svg>
                            Issue License
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-vcenter table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>License Key</th>
                                    <th>Organization</th>
                                    <th>Type</th>
                                    <th>Seats</th>
                                    <th>Status</th>
                                    <th>Expires</th>
                                    <th style="width: 100px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${licenses && licenses.length > 0
                                    ? licenses.map(lic => html`
                                        <tr>
                                            <td><code>${lic.key}</code></td>
                                            <td>${lic.orgName}</td>
                                            <td><span class="badge bg-primary">${lic.type}</span></td>
                                            <td>${lic.seats}</td>
                                            <td>
                                                ${lic.active
                                                    ? html`<span class="badge bg-success">Active</span>`
                                                    : html`<span class="badge bg-danger">Inactive</span>`
                                                }
                                            </td>
                                            <td>${handlers.formatDate(lic.expiresAt)}</td>
                                            <td>
                                                <div class="btn-group btn-group-sm">
                                                    <button class="btn btn-outline-secondary" onclick=${() => handlers.editLicense(lic)}>
                                                        Edit
                                                    </button>
                                                    <button class="btn btn-outline-danger" onclick=${() => handlers.revokeLicense(lic)}>
                                                        Revoke
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `)
                                    : html`<tr><td colspan="7" class="text-center text-muted">No licenses found</td></tr>`
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}
