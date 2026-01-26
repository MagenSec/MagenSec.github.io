/**
 * Site Admin - Users Tab Component
 * Manage user accounts and permissions
 */

export class UsersTab {
    render(users, state, handlers) {
        const { html } = window;

        return html`
            <div class="tab-pane active" id="users">
                <div class="card-body">
                    <h4 class="card-title">User Management</h4>
                    
                    <div class="mb-3">
                        <button class="btn btn-primary" onclick=${() => handlers.showUserModal()}>
                            <svg class="icon">+</svg>
                            Add User
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-vcenter table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Organization</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th style="width: 100px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users && users.length > 0 
                                    ? users.map(user => html`
                                        <tr>
                                            <td>${user.email}</td>
                                            <td><span class="badge bg-primary">${user.role || 'User'}</span></td>
                                            <td>${user.orgName || 'N/A'}</td>
                                            <td>
                                                ${user.active 
                                                    ? html`<span class="badge bg-success">Active</span>`
                                                    : html`<span class="badge bg-secondary">Inactive</span>`
                                                }
                                            </td>
                                            <td>${handlers.formatDate(user.createdAt)}</td>
                                            <td>
                                                <div class="btn-group btn-group-sm">
                                                    <button class="btn btn-outline-secondary" onclick=${() => handlers.editUser(user)}>
                                                        Edit
                                                    </button>
                                                    <button class="btn btn-outline-danger" onclick=${() => handlers.deleteUser(user)}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `)
                                    : html`<tr><td colspan="6" class="text-center text-muted">No users found</td></tr>`
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}
