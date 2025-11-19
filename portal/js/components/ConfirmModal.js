// ConfirmModal component (Tabler modal skeleton)
// TODO: Wire to modal actions and state
const { html } = window.htm;
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return html`
    <div class="modal show" tabindex="-1" style="display:block;">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close" aria-label="Close" onClick=${onCancel}></button>
          </div>
          <div class="modal-body">
            <p>${message}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onClick=${onCancel}>Cancel</button>
            <button type="button" class="btn btn-primary" onClick=${onConfirm}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.ConfirmModal = ConfirmModal;
