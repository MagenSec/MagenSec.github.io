// Members page (Tabler table, role badges, actions)
// TODO: Wire to backend org members and role management
const { html, render } = window.htm;
function MembersPage() {
  // TODO: Fetch members, handle role changes
  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>Org Members</strong>
        <button class="btn btn-primary btn-sm">+ Invite Member</button> <!-- TODO: Wire to invite modal -->
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-vcenter">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Added At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <!-- TODO: Render member rows -->
              <tr><td colspan="4"><EmptyState message="No members found" /></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
render(html`<MembersPage />`, document.getElementById('page-root'));
