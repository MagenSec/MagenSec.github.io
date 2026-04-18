const { html } = window;
const { useEffect, useMemo, useState } = window.preactHooks;

export function MagiCodesTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [includeDeleted, setIncludeDeleted] = useState(false);

    const [newCode, setNewCode] = useState('');
    const [newSeats, setNewSeats] = useState(5);
    const [newDays, setNewDays] = useState(30);
    const [newExpiresAt, setNewExpiresAt] = useState('');
    const [newMaxUses, setNewMaxUses] = useState('');
    const [newComment, setNewComment] = useState('');

    const [editingCode, setEditingCode] = useState(null);
    const [editSeats, setEditSeats] = useState(5);
    const [editDays, setEditDays] = useState(30);
    const [editExpiresAt, setEditExpiresAt] = useState('');
    const [editMaxUses, setEditMaxUses] = useState('');
    const [editComment, setEditComment] = useState('');

    const loadCodes = async () => {
        setLoading(true);
        try {
            const res = await window.api.adminListMagiCodes({ includeDeleted });
            const list = Array.isArray(res?.data?.items) ? res.data.items : [];
            setItems(list);
        } catch (err) {
            console.error('[MagiCodesTab] Failed to load codes', err);
            window.toast?.show?.(err?.message || 'Failed to load MAGICodes', 'error');
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCodes();
    }, [includeDeleted]);

    const stats = useMemo(() => {
        const active = items.filter(x => x.isEnabled && !x.isDeleted).length;
        const disabled = items.filter(x => !x.isEnabled && !x.isDeleted).length;
        const deleted = items.filter(x => x.isDeleted).length;
        return { active, disabled, deleted };
    }, [items]);

    const resetCreateForm = () => {
        setNewCode('');
        setNewSeats(5);
        setNewDays(30);
        setNewExpiresAt('');
        setNewMaxUses('');
        setNewComment('');
    };

    const handleCreate = async () => {
        if (!newCode.trim()) {
            window.toast?.show?.('Code is required', 'warning');
            return;
        }

        try {
            await window.api.adminCreateMagiCode({
                code: newCode.trim().toUpperCase(),
                seats: Number(newSeats) || 5,
                days: Number(newDays) || 30,
                expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
                maxUses: newMaxUses === '' ? null : Number(newMaxUses),
                comment: newComment?.trim() || null
            });
            window.toast?.show?.('MAGICode created', 'success');
            resetCreateForm();
            await loadCodes();
        } catch (err) {
            console.error('[MagiCodesTab] create failed', err);
            window.toast?.show?.(err?.message || 'Failed to create MAGICode', 'error');
        }
    };

    const startEdit = (item) => {
        setEditingCode(item.code);
        setEditSeats(item.seats || 5);
        setEditDays(item.days || 30);
        setEditExpiresAt(item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 10) : '');
        setEditMaxUses(item.maxUses ?? '');
        setEditComment(item.comment || '');
    };

    const cancelEdit = () => {
        setEditingCode(null);
        setEditSeats(5);
        setEditDays(30);
        setEditExpiresAt('');
        setEditMaxUses('');
        setEditComment('');
    };

    const handleUpdate = async () => {
        if (!editingCode) return;
        try {
            await window.api.adminUpdateMagiCode(editingCode, {
                code: editingCode,
                seats: Number(editSeats) || 5,
                days: Number(editDays) || 30,
                expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
                maxUses: editMaxUses === '' ? null : Number(editMaxUses),
                comment: editComment?.trim() || null
            });
            window.toast?.show?.('MAGICode updated', 'success');
            cancelEdit();
            await loadCodes();
        } catch (err) {
            console.error('[MagiCodesTab] update failed', err);
            window.toast?.show?.(err?.message || 'Failed to update MAGICode', 'error');
        }
    };

    const handleDisable = async (code) => {
        const comment = window.prompt('Disable comment (optional):', '') ?? '';
        if (!window.confirm(`Disable MAGICode ${code}?`)) return;

        try {
            await window.api.adminDisableMagiCode(code, comment.trim() || null);
            window.toast?.show?.('MAGICode disabled', 'success');
            await loadCodes();
        } catch (err) {
            console.error('[MagiCodesTab] disable failed', err);
            window.toast?.show?.(err?.message || 'Failed to disable MAGICode', 'error');
        }
    };

    const handleDelete = async (code) => {
        if (!window.confirm(`Delete MAGICode ${code}? This cannot be undone.`)) return;
        const comment = window.prompt('Delete comment (optional):', '') ?? '';

        try {
            await window.api.adminDeleteMagiCode(code, comment.trim() || null);
            window.toast?.show?.('MAGICode deleted', 'success');
            await loadCodes();
        } catch (err) {
            console.error('[MagiCodesTab] delete failed', err);
            window.toast?.show?.(err?.message || 'Failed to delete MAGICode', 'error');
        }
    };

    const toLocalDate = (value) => value ? new Date(value).toLocaleString() : '-';

    return html`
        <div>
            <div class="row g-3 mb-3">
                <div class="col-md-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="text-muted small">Active</div>
                            <div class="h2 m-0">${stats.active}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="text-muted small">Disabled</div>
                            <div class="h2 m-0">${stats.disabled}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="text-muted small">Deleted</div>
                            <div class="h2 m-0">${stats.deleted}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 d-flex align-items-center justify-content-md-end">
                    <label class="form-check form-switch mt-2">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            checked=${includeDeleted}
                            onChange=${(e) => setIncludeDeleted(e.target.checked)}
                        />
                        <span class="form-check-label">Show deleted</span>
                    </label>
                </div>
            </div>

            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Create MAGICode</h3>
                </div>
                <div class="card-body">
                    <div class="row g-3 align-items-end">
                        <div class="col-md-3">
                            <label class="form-label">Code</label>
                            <input class="form-control" value=${newCode} onInput=${(e) => setNewCode(e.target.value.toUpperCase())} placeholder="WELCOME-2026" />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Seats</label>
                            <input type="number" min="1" class="form-control" value=${newSeats} onInput=${(e) => setNewSeats(e.target.value)} />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Days</label>
                            <input type="number" min="1" class="form-control" value=${newDays} onInput=${(e) => setNewDays(e.target.value)} />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Max Uses</label>
                            <input type="number" min="1" class="form-control" value=${newMaxUses} onInput=${(e) => setNewMaxUses(e.target.value)} placeholder="Unlimited" />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Expires At</label>
                            <input type="date" class="form-control" value=${newExpiresAt} onInput=${(e) => setNewExpiresAt(e.target.value)} />
                        </div>
                        <div class="col-md-10">
                            <label class="form-label">Comment</label>
                            <input class="form-control" value=${newComment} onInput=${(e) => setNewComment(e.target.value)} placeholder="Campaign, partner, support note" />
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-primary w-100" onClick=${handleCreate}>
                                <i class="ti ti-plus me-1"></i>
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title mb-0">MAGICodes</h3>
                    <button class="btn btn-sm btn-outline-primary" onClick=${loadCodes} disabled=${loading}>
                        <i class="ti ti-refresh me-1"></i>
                        Refresh
                    </button>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm table-vcenter card-table mb-0">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Seats</th>
                                <th>Days</th>
                                <th>Usage</th>
                                <th>Expiry</th>
                                <th>Status</th>
                                <th>Comment</th>
                                <th>Updated</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${loading && html`<tr><td colspan="9" class="text-center py-4 text-muted">Loading MAGICodes...</td></tr>`}
                            ${!loading && items.length === 0 && html`<tr><td colspan="9" class="text-center py-4 text-muted">No MAGICodes found</td></tr>`}
                            ${!loading && items.map(item => html`
                                <tr>
                                    <td class="fw-semibold">${item.code}</td>
                                    <td>${item.seats}</td>
                                    <td>${item.days}</td>
                                    <td>
                                        <span>${item.usedCount || 0}</span>
                                        <span class="text-muted">/ ${item.maxUses || '∞'}</span>
                                    </td>
                                    <td>${item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'Never'}</td>
                                    <td>
                                        ${item.isDeleted
                                            ? html`<span class="badge bg-secondary text-white">Deleted</span>`
                                            : item.isEnabled
                                                ? html`<span class="badge bg-success text-white">Active</span>`
                                                : html`<span class="badge bg-warning text-white">Disabled</span>`}
                                    </td>
                                    <td class="text-muted text-truncate" style="max-width: 220px;" title=${item.comment || ''}>${item.comment || '-'}</td>
                                    <td class="text-muted">${toLocalDate(item.updatedAt || item.createdAt)}</td>
                                    <td class="text-end">
                                        <div class="btn-list justify-content-end">
                                            <button class="btn btn-sm btn-outline-primary" onClick=${() => startEdit(item)} disabled=${item.isDeleted}>
                                                <i class="ti ti-edit"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-warning" onClick=${() => handleDisable(item.code)} disabled=${item.isDeleted || !item.isEnabled}>
                                                <i class="ti ti-ban"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-danger" onClick=${() => handleDelete(item.code)} disabled=${item.isDeleted}>
                                                <i class="ti ti-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </div>

            ${editingCode && html`
                <div class="modal-root">
                    <div class="modal-backdrop fade show custom-backdrop"></div>
                    <div class="modal modal-blur fade show" style="display: block;" tabindex="-1" onClick=${cancelEdit}>
                        <div class="modal-dialog modal-lg modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3 class="modal-title">Edit MAGICode: ${editingCode}</h3>
                                    <button type="button" class="btn-close" onClick=${cancelEdit}></button>
                                </div>
                                <div class="modal-body">
                                    <div class="row g-3">
                                        <div class="col-md-4">
                                            <label class="form-label">Seats</label>
                                            <input type="number" min="1" class="form-control" value=${editSeats} onInput=${(e) => setEditSeats(e.target.value)} />
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">Days</label>
                                            <input type="number" min="1" class="form-control" value=${editDays} onInput=${(e) => setEditDays(e.target.value)} />
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">Max Uses</label>
                                            <input type="number" min="1" class="form-control" value=${editMaxUses} onInput=${(e) => setEditMaxUses(e.target.value)} placeholder="Unlimited" />
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Expires At</label>
                                            <input type="date" class="form-control" value=${editExpiresAt} onInput=${(e) => setEditExpiresAt(e.target.value)} />
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Comment</label>
                                            <input class="form-control" value=${editComment} onInput=${(e) => setEditComment(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" onClick=${cancelEdit}>Cancel</button>
                                    <button type="button" class="btn btn-primary" onClick=${handleUpdate}>Save</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
