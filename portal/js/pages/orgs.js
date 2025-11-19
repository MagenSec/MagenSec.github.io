// Organizations page (Tabler table, CRUD)
// TODO: Wire to backend org list and admin actions
const { html, render } = window.htm;
function OrgsPage() {
  // TODO: Fetch orgs, handle CRUD
  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>Organizations</strong>
        <button class="btn btn-primary btn-sm">+ Add Organization</button> <!-- TODO: Wire to org modal -->
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-vcenter">
            <thead>
              <tr>
                <th>Org Name</th>
                <th>Owner</th>
                <th>Credits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <!-- TODO: Render org rows -->
              <tr><td colspan="4"><EmptyState message="No organizations found" /></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
render(html`<OrgsPage />`, document.getElementById('page-root'));
