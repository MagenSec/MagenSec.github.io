// StatCard component (Tabler KPI card)
// TODO: Wire to stat props
const { html } = window.htm;
function StatCard({ icon, label, value, delta, color = 'primary' }) {
  return html`
    <div class="card card-sm card-status-top bg-${color}">
      <div class="card-body d-flex align-items-center">
        <span class="me-3"><i class="ti ti-${icon}"></i></span>
        <div>
          <div class="h3 mb-0">${value}</div>
          <div class="text-muted">${label}</div>
        </div>
        ${delta ? html`<span class="badge bg-${delta > 0 ? 'green' : 'red'} ms-auto">${delta > 0 ? '+' : ''}${delta}</span>` : null}
      </div>
    </div>
  `;
}
window.StatCard = StatCard;
