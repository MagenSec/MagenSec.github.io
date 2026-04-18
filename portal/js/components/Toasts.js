// Toasts region (Tabler toasts skeleton)
// TODO: Wire to notification state
const { html } = window.htm;
function Toasts({ toasts = [] }) {
  return html`
    <div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 1080;">
      ${toasts.map(t => html`
        <div class="toast show" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="toast-header">
            <i class="ti ti-${t.icon || 'info-circle'} me-2"></i>
            <strong class="me-auto">${t.title || 'Notification'}</strong>
            <small>${t.time || ''}</small>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
          <div class="toast-body">${t.message}</div>
        </div>
      `)}
    </div>
  `;
}
window.Toasts = Toasts;
