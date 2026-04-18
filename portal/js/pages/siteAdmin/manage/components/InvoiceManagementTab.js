/**
 * Site Admin - Invoice Management Tab
 * Lists all pending payment requests and allows site admins to approve or reject them.
 */

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function InvoiceManagementTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionRow, setActionRow] = useState(null); // { orgId, paymentId, mode: 'approve'|'reject' }
    const [proofUrl, setProofUrl] = useState('');
    const [bankRef, setBankRef] = useState('');
    const [notes, setNotes] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadPending = async () => {
        setLoading(true);
        try {
            const res = await window.api.adminListPendingPayments();
            setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
        } catch (err) {
            console.error('[InvoiceManagementTab] load failed', err);
            window.toast?.show?.(err?.message || 'Failed to load pending payments', 'error');
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPending(); }, []);

    const openAction = (item, mode) => {
        setActionRow({ orgId: item.orgId, paymentId: item.paymentId, invoiceId: item.invoiceId, amount: item.amount, currency: item.currency, mode });
        setProofUrl(''); setBankRef(''); setNotes(''); setRejectReason('');
    };

    const cancelAction = () => { setActionRow(null); };

    const handleApprove = async () => {
        if (!actionRow) return;
        setSubmitting(true);
        try {
            await window.api.adminApprovePayment(actionRow.orgId, actionRow.paymentId, {
                proofUrl: proofUrl.trim() || null,
                bankRef:  bankRef.trim()  || null,
                notes:    notes.trim()    || null,
            });
            window.toast?.show?.('Payment approved', 'success');
            setActionRow(null);
            await loadPending();
        } catch (err) {
            console.error('[InvoiceManagementTab] approve failed', err);
            window.toast?.show?.(err?.message || 'Approval failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!actionRow || !rejectReason.trim()) {
            window.toast?.show?.('Rejection reason is required', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            await window.api.adminRejectPayment(actionRow.orgId, actionRow.paymentId, {
                reason: rejectReason.trim()
            });
            window.toast?.show?.('Payment rejected', 'success');
            setActionRow(null);
            await loadPending();
        } catch (err) {
            console.error('[InvoiceManagementTab] reject failed', err);
            window.toast?.show?.(err?.message || 'Rejection failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const fmtAmt = (amt, cur) => `${(cur || 'USD')} ${Number(amt || 0).toFixed(2)}`;

    return html`
      <div class="card">
        <div class="card-header d-flex align-items-center justify-content-between">
          <h3 class="card-title mb-0">Pending Invoices</h3>
          <button class="btn btn-sm btn-outline-secondary" onClick=${loadPending} disabled=${loading}>
            ${loading ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
            Refresh
          </button>
        </div>

        ${actionRow ? html`
          <div class="card-body border-bottom bg-light" style="border-left: 4px solid ${actionRow.mode === 'approve' ? '#2fb344' : '#d63939'}">
            <div class="d-flex align-items-center gap-2 mb-3">
              <span class="badge ${actionRow.mode === 'approve' ? 'bg-success text-white' : 'bg-danger text-white'}">
                ${actionRow.mode === 'approve' ? 'Approve' : 'Reject'}
              </span>
              <span class="text-muted small">
                Invoice ${actionRow.invoiceId || actionRow.paymentId} · ${fmtAmt(actionRow.amount, actionRow.currency)}
              </span>
            </div>

            ${actionRow.mode === 'approve' ? html`
              <div class="row g-2">
                <div class="col-md-4">
                  <label class="form-label small">Proof URL <span class="text-muted">(optional)</span></label>
                  <input class="form-control form-control-sm" type="url" placeholder="https://…" value=${proofUrl}
                    onInput=${e => setProofUrl(e.target.value)} />
                </div>
                <div class="col-md-3">
                  <label class="form-label small">Bank Reference <span class="text-muted">(optional)</span></label>
                  <input class="form-control form-control-sm" placeholder="TXN-…" value=${bankRef}
                    onInput=${e => setBankRef(e.target.value)} />
                </div>
                <div class="col-md-5">
                  <label class="form-label small">Notes <span class="text-muted">(optional)</span></label>
                  <input class="form-control form-control-sm" placeholder="Approval notes…" value=${notes}
                    onInput=${e => setNotes(e.target.value)} />
                </div>
              </div>
              <div class="mt-2 d-flex gap-2">
                <button class="btn btn-success btn-sm" onClick=${handleApprove} disabled=${submitting}>
                  ${submitting ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : ''}
                  Confirm Approval
                </button>
                <button class="btn btn-outline-secondary btn-sm" onClick=${cancelAction} disabled=${submitting}>Cancel</button>
              </div>
            ` : html`
              <div>
                <label class="form-label small">Rejection Reason <span class="text-danger">*</span></label>
                <input class="form-control form-control-sm" placeholder="Reason for rejection…" value=${rejectReason}
                  onInput=${e => setRejectReason(e.target.value)} />
              </div>
              <div class="mt-2 d-flex gap-2">
                <button class="btn btn-danger btn-sm" onClick=${handleReject} disabled=${submitting}>
                  ${submitting ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : ''}
                  Confirm Rejection
                </button>
                <button class="btn btn-outline-secondary btn-sm" onClick=${cancelAction} disabled=${submitting}>Cancel</button>
              </div>
            `}
          </div>
        ` : ''}

        <div class="table-responsive">
          ${loading ? html`
            <div class="p-4 text-center text-muted">
              <span class="spinner-border spinner-border-sm me-2"></span>Loading…
            </div>
          ` : items.length === 0 ? html`
            <div class="empty p-4">
              <div class="empty-icon"><i class="ti ti-check" style="font-size:2rem;color:#2fb344;"></i></div>
              <p class="empty-title">No pending invoices</p>
              <p class="empty-subtitle text-muted">All payment requests have been processed.</p>
            </div>
          ` : html`
            <table class="table table-vcenter card-table table-hover">
              <thead>
                <tr>
                  <th>Org</th>
                  <th>Invoice ID</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th>Created By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => html`
                  <tr key=${item.paymentId}>
                    <td class="text-monospace small">${item.orgId}</td>
                    <td class="small text-muted">${item.invoiceId || item.paymentId}</td>
                    <td class="fw-bold">${fmtAmt(item.amount, item.currency)}</td>
                    <td><span class="badge bg-blue-lt text-blue">${item.paymentType || item.method || '—'}</span></td>
                    <td class="text-muted small">${fmt(item.createdAt)}</td>
                    <td class="text-muted small">${item.createdBy || '—'}</td>
                    <td>
                      <div class="d-flex gap-2 justify-content-end">
                        <button class="btn btn-sm btn-success"
                          onClick=${() => openAction(item, 'approve')}
                          disabled=${!!actionRow}>
                          Approve
                        </button>
                        <button class="btn btn-sm btn-outline-danger"
                          onClick=${() => openAction(item, 'reject')}
                          disabled=${!!actionRow}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
}
