// EmptyState component for 404/empty dashboard
const html = window.html || (window.htm && window.preact ? window.htm.bind(window.preact.h) : null);
function EmptyState({ message = 'No data available', actionLabel, onAction }) {
  return html`
    <div class="card text-center">
      <div class="card-body">
        <i class="ti ti-alert-circle h1 text-muted"></i>
        <div class="h4 mt-2">${message}</div>
        ${actionLabel ? html`<button class="btn btn-primary mt-3" onClick=${onAction}>${actionLabel}</button>` : null}
      </div>
    </div>
  `;
}
window.EmptyState = EmptyState;
