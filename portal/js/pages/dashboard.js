// Dashboard page (Tabler cards, KPIs, alerts)
// TODO: Wire to backend stats and alerts
const { html, render } = window.htm;
function DashboardPage() {
  // TODO: Fetch stats, alerts, org context
  return html`
    <div class="row row-deck mb-4">
      <div class="col-md-3"><StatCard icon="shield-lock" label="Risk Score" value="--" color="red" /></div>
      <div class="col-md-3"><StatCard icon="devices" label="Devices" value="--" color="blue" /></div>
      <div class="col-md-3"><StatCard icon="key" label="License" value="--" color="yellow" /></div>
      <div class="col-md-3"><StatCard icon="activity" label="Alerts" value="--" color="orange" /></div>
    </div>
    <div class="row">
      <div class="col-md-8">
        <ChartRenderer charts={[]} /> <!-- TODO: Wire to trend data -->
      </div>
      <div class="col-md-4">
        <div class="card">
          <div class="card-header"><strong>Recent Alerts</strong></div>
          <div class="card-body">
            <!-- TODO: List alerts -->
            <EmptyState message="No alerts" />
          </div>
        </div>
      </div>
    </div>
  `;
}
render(html`<DashboardPage />`, document.getElementById('page-root'));
