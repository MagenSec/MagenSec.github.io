/**
 * AiResponsesAdmin — Site Admin page for managing AI Response Library entries.
 * Route: #!/siteadmin/ai-responses
 *
 * API:
 *   GET    /api/v1/admin/ai/responses           — list entries
 *   DELETE /api/v1/admin/ai/responses/{rowKey}   — delete entry
 *   PATCH  /api/v1/admin/ai/responses/{rowKey}   — lock/unlock/extend/update
 */

import { api } from '@api';

const { html, Component } = window;

function renderMarkdown(text) {
    if (!text) return '';
    let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
    return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const hours = Math.floor((Date.now() - d.getTime()) / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export class AiResponsesAdminPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            entries: [],
            error: null,
            filterLocked: null,
            filterApp: '',
            expandedRow: null,
            editingRow: null,
            editedResponse: '',
            savingRow: null,
            entryDetails: {},
            loadingDetailRow: null,
        };
    }

    componentDidMount() {
        this.loadEntries();
    }

    async loadEntries() {
        this.setState({ loading: true, error: null });
        try {
            const params = {};
            if (this.state.filterLocked !== null) params.locked = this.state.filterLocked;
            if (this.state.filterApp) params.app = this.state.filterApp;

            const resp = await api.adminListAiResponses(params);
            const data = resp?.data || resp?.Data;
            const entries = Array.isArray(data) ? data : [];
            this.setState({ loading: false, entries, entryDetails: {} });
        } catch (err) {
            this.setState({ loading: false, error: err.message });
        }
    }

    async deleteEntry(rowKey) {
        if (!confirm(`Delete cache entry "${rowKey}"?`)) return;
        try {
            await api.adminDeleteAiResponse(rowKey);
            await this.loadEntries();
        } catch (err) {
            alert(`Delete failed: ${err.message}`);
        }
    }

    async ensureEntryDetail(rowKey) {
        const existing = this.state.entryDetails[rowKey];
        if (existing?.response || existing?.Response) return existing;

        try {
            this.setState({ loadingDetailRow: rowKey });
            const resp = await api.adminGetAiResponse(rowKey);
            const detail = resp?.data || resp?.Data || null;
            if (detail) {
                this.setState(prev => ({
                    entryDetails: { ...prev.entryDetails, [rowKey]: detail },
                    loadingDetailRow: null,
                }));
            } else {
                this.setState({ loadingDetailRow: null });
            }
            return detail;
        } catch (err) {
            this.setState({ loadingDetailRow: null });
            alert(`Failed to load full entry: ${err.message}`);
            return null;
        }
    }

    async toggleExpanded(rowKey, isExpanded) {
        if (isExpanded) {
            this.setState({ expandedRow: null, editingRow: null, editedResponse: '' });
            return;
        }

        this.setState({ expandedRow: rowKey, editingRow: null, editedResponse: '' });
        await this.ensureEntryDetail(rowKey);
    }

    async patchEntry(rowKey, action) {
        try {
            this.setState({ savingRow: rowKey });
            await api.adminPatchAiResponse(rowKey, { action });
            await this.loadEntries();
        } catch (err) {
            alert(`${action} failed: ${err.message}`);
        } finally {
            this.setState({ savingRow: null });
        }
    }

    async startEdit(rowKey, response) {
        let fullResponse = response || '';
        const detail = await this.ensureEntryDetail(rowKey);
        if (detail?.response || detail?.Response) {
            fullResponse = detail.response || detail.Response || fullResponse;
        }

        this.setState({
            expandedRow: rowKey,
            editingRow: rowKey,
            editedResponse: fullResponse || '',
        });
    }

    cancelEdit() {
        this.setState({ editingRow: null, editedResponse: '' });
    }

    async saveEdit(rowKey) {
        const response = (this.state.editedResponse || '').trim();
        if (!response) {
            alert('Response text cannot be empty.');
            return;
        }

        try {
            this.setState({ savingRow: rowKey });
            await api.adminPatchAiResponse(rowKey, { action: 'update', response });
            await this.loadEntries();
            this.setState({ editingRow: null, editedResponse: '', expandedRow: rowKey });
        } catch (err) {
            alert(`Update failed: ${err.message}`);
        } finally {
            this.setState({ savingRow: null });
        }
    }

    render() {
        const { loading, entries, error, filterLocked, filterApp, expandedRow, editingRow, editedResponse, savingRow, entryDetails, loadingDetailRow } = this.state;
        const cveFocusedCount = entries.filter(e => (e.cveId || e.CveId)).length;

        return html`
            <div class="container-xl py-4 ai-responses-admin">
                <div class="page-header mb-4">
                    <div class="row align-items-end">
                        <div class="col">
                            <div class="page-pretitle">Site Administration</div>
                            <h2 class="page-title">AI Response Library</h2>
                            <p class="page-subtitle mt-1 mb-0">Manage AI-generated remediation guidance saved per application and CVE-focused context.</p>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-outline-primary btn-sm" onClick=${() => this.loadEntries()}>
                                <i class="ti ti-refresh me-1"></i>Refresh
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card mb-3 ai-responses-admin__filters-card">
                    <div class="card-body py-2">
                        <div class="row g-2 align-items-center">
                            <div class="col-auto">
                                <select class="form-select form-select-sm" value=${filterLocked === null ? '' : filterLocked}
                                    onChange=${(e) => {
                                        const v = e.target.value;
                                        this.setState({ filterLocked: v === '' ? null : v === 'true' }, () => this.loadEntries());
                                    }}>
                                    <option value="">All entries</option>
                                    <option value="true">Locked only</option>
                                    <option value="false">Unlocked only</option>
                                </select>
                            </div>
                            <div class="col-auto">
                                <input class="form-control form-control-sm" placeholder="Filter by app, vendor, version, or CVE…"
                                    value=${filterApp}
                                    onInput=${(e) => this.setState({ filterApp: e.target.value })}
                                    onKeyDown=${(e) => { if (e.key === 'Enter') this.loadEntries(); }}
                                />
                            </div>
                            <div class="col-auto">
                                <button class="btn btn-sm btn-primary" onClick=${() => this.loadEntries()}>Apply</button>
                            </div>
                        </div>
                    </div>
                </div>

                ${error ? html`<div class="alert alert-danger">${error}</div>` : null}

                ${loading ? html`
                    <div class="card"><div class="card-body text-center py-5">
                        <div class="spinner-border text-primary mb-3"></div>
                        <p class="text-muted">Loading cache entries…</p>
                    </div></div>
                ` : entries.length === 0 ? html`
                    <div class="card"><div class="card-body">
                        <div class="empty">
                            <div class="empty-icon"><i class="ti ti-database-off" style="font-size:3rem;color:#6c757d"></i></div>
                            <p class="empty-title">No cache entries</p>
                            <p class="empty-subtitle text-muted">AI Response Library is empty or no entries match the filter.</p>
                        </div>
                    </div></div>
                ` : html`
                    <div class="card">
                        <div class="card-header d-flex flex-wrap align-items-center gap-2 justify-content-between">
                            <h3 class="card-title mb-0">${entries.length} cache entries</h3>
                            <div class="d-flex gap-2 flex-wrap">
                                <span class="badge bg-primary text-white">${entries.length - cveFocusedCount} app-scoped</span>
                                <span class="badge bg-danger text-white">${cveFocusedCount} CVE-focused</span>
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-vcenter card-table ai-responses-admin__table">
                                <thead>
                                    <tr>
                                        <th>Application</th>
                                        <th>Vendor</th>
                                        <th>Version</th>
                                        <th>OS</th>
                                        <th>Context</th>
                                        <th>Feedback</th>
                                        <th>Status</th>
                                        <th>Age</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${entries.map((entry) => {
                                        const rowKey = entry.rowKey || entry.RowKey || '';
                                        const val = entry.value || entry;
                                        const detail = entryDetails[rowKey] || {};
                                        const isExpanded = expandedRow === rowKey;
                                        const isEditing = editingRow === rowKey;
                                        const responseText = detail.response || detail.Response || val.response || val.Response || val.responsePreview || val.ResponsePreview || '';
                                        const cveId = detail.cveId || detail.CveId || val.cveId || val.CveId || '';
                                        const scope = val.scope || val.Scope || (cveId ? 'App + CVE' : 'App');
                                        const busy = savingRow === rowKey;

                                        return html`
                                            <tr key=${rowKey}>
                                                <td>
                                                    <a href="#" class="text-reset fw-semibold" onClick=${async (e) => { e.preventDefault(); await this.toggleExpanded(rowKey, isExpanded); }}>
                                                        ${val.appName || val.AppName || '—'}
                                                    </a>
                                                    <div class="small text-muted mt-1">${cveId ? 'CVE-focused guidance' : 'App-wide guidance'}</div>
                                                </td>
                                                <td class="text-muted">${val.vendor || val.Vendor || '—'}</td>
                                                <td><code>${val.version || val.Version || '—'}</code></td>
                                                <td class="text-muted">${val.os || val.Os || '—'}</td>
                                                <td>
                                                    <div class="d-flex gap-1 flex-wrap">
                                                        <span class="badge bg-primary text-white">${scope}</span>
                                                        ${cveId ? html`<span class="badge bg-danger text-white">${cveId}</span>` : html`<span class="badge bg-secondary text-white">All CVEs for app</span>`}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span class="text-success">▲${val.feedbackUp ?? val.FeedbackUp ?? 0}</span>
                                                    <span class="text-danger ms-1">▼${val.feedbackDown ?? val.FeedbackDown ?? 0}</span>
                                                </td>
                                                <td>
                                                    ${(val.isLocked || val.IsLocked) ? html`<span class="badge bg-warning text-white">Locked</span>` : null}
                                                    ${(val.isVerified || val.IsVerified) ? html`<span class="badge bg-success text-white ms-1">Verified</span>` : null}
                                                    ${!(val.isLocked || val.IsLocked) && !(val.isVerified || val.IsVerified) ? html`<span class="badge bg-secondary text-white">Open</span>` : null}
                                                </td>
                                                <td class="text-muted small">${timeAgo(val.generatedAt || val.GeneratedAt)}</td>
                                                <td>
                                                    <div class="btn-list flex-nowrap">
                                                        <button class="btn btn-sm btn-outline-secondary py-0 px-1" title="Preview" disabled=${busy}
                                                            onClick=${async () => this.toggleExpanded(rowKey, isExpanded)}>
                                                            <i class="ti ti-eye"></i>
                                                        </button>
                                                        <button class="btn btn-sm btn-outline-primary py-0 px-1" title="Edit response" disabled=${busy}
                                                            onClick=${() => this.startEdit(rowKey, responseText)}>
                                                            <i class="ti ti-edit"></i>
                                                        </button>
                                                        ${(val.isLocked || val.IsLocked)
                                                            ? html`<button class="btn btn-sm btn-outline-success py-0 px-1" title="Unlock" disabled=${busy} onClick=${() => this.patchEntry(rowKey, 'unlock')}><i class="ti ti-lock-open"></i></button>`
                                                            : html`<button class="btn btn-sm btn-outline-warning py-0 px-1" title="Lock" disabled=${busy} onClick=${() => this.patchEntry(rowKey, 'lock')}><i class="ti ti-lock"></i></button>`
                                                        }
                                                        <button class="btn btn-sm btn-outline-primary py-0 px-1" title="Extend 30 days" disabled=${busy} onClick=${() => this.patchEntry(rowKey, 'extend')}><i class="ti ti-clock-plus"></i></button>
                                                        <button class="btn btn-sm btn-outline-danger py-0 px-1" title="Delete" disabled=${busy} onClick=${() => this.deleteEntry(rowKey)}><i class="ti ti-trash"></i></button>
                                                    </div>
                                                </td>
                                            </tr>
                                            ${isExpanded ? html`
                                                <tr>
                                                    <td colspan="9" class="ai-responses-admin__detail-cell">
                                                        <div class="p-3 ai-responses-admin__detail">
                                                            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                                                                <div class="d-flex flex-wrap gap-2 align-items-center">
                                                                    <span class="badge bg-primary text-white">${scope}</span>
                                                                    ${cveId ? html`<span class="badge bg-danger text-white">${cveId}</span>` : null}
                                                                    <code class="small">${rowKey}</code>
                                                                </div>
                                                                <div class="btn-list">
                                                                    ${isEditing ? html`
                                                                        <button class="btn btn-sm btn-success" disabled=${busy} onClick=${() => this.saveEdit(rowKey)}>
                                                                            <i class="ti ti-device-floppy me-1"></i>${busy ? 'Saving…' : 'Save as verified'}
                                                                        </button>
                                                                        <button class="btn btn-sm btn-outline-secondary" disabled=${busy} onClick=${() => this.cancelEdit()}>
                                                                            Cancel
                                                                        </button>
                                                                    ` : html`
                                                                        <button class="btn btn-sm btn-outline-primary" onClick=${() => this.startEdit(rowKey, responseText)}>
                                                                            <i class="ti ti-edit me-1"></i>Edit response
                                                                        </button>
                                                                    `}
                                                                </div>
                                                            </div>

                                                            <div class="row g-3">
                                                                <div class=${isEditing ? 'col-lg-6' : 'col-12'}>
                                                                    <div class="card ai-responses-admin__preview-card">
                                                                        <div class="card-header py-2">
                                                                            <h4 class="card-title mb-0">Rendered preview</h4>
                                                                        </div>
                                                                        <div class="card-body">
                                                                            ${loadingDetailRow === rowKey && !detail.response && !detail.Response ? html`
                                                                                <div class="d-flex align-items-center gap-2 text-muted small">
                                                                                    <div class="spinner-border spinner-border-sm text-primary"></div>
                                                                                    <span>Loading full cached response…</span>
                                                                                </div>
                                                                            ` : responseText
                                                                                ? html`<div class="ai-responses-admin__preview markdown-body small" dangerouslySetInnerHTML=${{ __html: renderMarkdown(responseText) }}></div>`
                                                                                : html`<div class="text-muted small">No cached response text available for this entry.</div>`}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                ${isEditing ? html`
                                                                    <div class="col-lg-6">
                                                                        <div class="card ai-responses-admin__editor-card">
                                                                            <div class="card-header py-2">
                                                                                <h4 class="card-title mb-0">Edit response</h4>
                                                                            </div>
                                                                            <div class="card-body">
                                                                                <textarea
                                                                                    class="form-control font-monospace ai-responses-admin__editor"
                                                                                    rows="16"
                                                                                    value=${editedResponse}
                                                                                    onInput=${(e) => this.setState({ editedResponse: e.target.value })}
                                                                                ></textarea>
                                                                                <div class="form-text mt-2">Saving updates the cached guidance and marks the entry as verified.</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ` : null}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ` : null}
                                        `;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `}
            </div>
        `;
    }
}

export default AiResponsesAdminPage;
