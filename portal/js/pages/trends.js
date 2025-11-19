// Trends page (Tabler charts, filters)
// TODO: Wire to backend trend/telemetry data
const { html, render } = window.htm;
function TrendsPage() {
  // TODO: Fetch trend data, implement filters
  return html`
    <div class="row row-deck mb-4">
      <div class="col-md-6">
        <ChartRenderer charts={[]} /> <!-- TODO: Wire to risk trend data -->
      </div>
      <div class="col-md-6">
        <ChartRenderer charts={[]} /> <!-- TODO: Wire to device growth data -->
      </div>
    </div>
    <div class="card">
      <div class="card-header"><strong>Critical Threats</strong></div>
      <div class="card-body">
        <!-- TODO: List top threats -->
        <EmptyState message="No threat data" />
      </div>
    </div>
  `;
}
render(html`<TrendsPage />`, document.getElementById('page-root'));
