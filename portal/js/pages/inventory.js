// Inventory page (Tabler table, filters)
// TODO: Wire to backend software inventory data
const { html, render } = window.htm;
function InventoryPage() {
  // TODO: Fetch inventory, implement filters
  return html`
    <div class="card">
      <div class="card-header"><strong>Software Inventory</strong></div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-vcenter">
            <thead>
              <tr>
                <th>Product</th>
                <th>Version</th>
                <th>Devices</th>
                <th>Vendor</th>
              </tr>
            </thead>
            <tbody>
              <!-- TODO: Render inventory rows -->
              <tr><td colspan="4"><EmptyState message="No inventory data" /></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
render(html`<InventoryPage />`, document.getElementById('page-root'));
