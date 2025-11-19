// Licenses page (Tabler table, actions)
// TODO: Wire to backend license list and admin actions
const { html, render } = window.htm;
function LicensesPage() {
  // TODO: Fetch licenses, handle create/rotate/disable
  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>Licenses</strong>
        <button class="btn btn-primary btn-sm">+ Create License</button> <!-- TODO: Wire to license modal -->
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-vcenter">
            <thead>
              <tr>
                <th>License Key</th>
                <th>Type</th>
                <th>Credits</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <!-- TODO: Render license rows -->
              <tr><td colspan="5"><EmptyState message="No licenses found" /></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
render(html`<LicensesPage />`, document.getElementById('page-root'));
