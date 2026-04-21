import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

/**
 * Patch Posture — Missing-patch rollup derived from KB-MISSING alerts.
 *
 * Data source:
 *   GET /api/v1/orgs/{orgId}/patch-posture  → { summary, intel, hosts[] }
 *
 * Intel freshness is surfaced so admins know whether the MSRC catalog is stale.
 *
 * Caching: stale-while-revalidate from localStorage (15min TTL). On mount,
 * paint the cached payload immediately, then fetch fresh data in the background
 * and silently swap. Eliminates the 1-2s blank screen on repeat visits.
 */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_KEY_PREFIX = 'magensec.patchPosture.v1';
const cacheKey = (orgId) => `${CACHE_KEY_PREFIX}.${orgId}`;

function readCache(orgId) {
    try {
        const raw = localStorage.getItem(cacheKey(orgId));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj?.cachedAt || !obj?.data) return null;
        if (Date.now() - obj.cachedAt > CACHE_TTL_MS) return null;
        return obj;
    } catch { return null; }
}

function writeCache(orgId, data) {
    try {
        localStorage.setItem(cacheKey(orgId), JSON.stringify({ cachedAt: Date.now(), data }));
    } catch { /* quota or disabled — ignore */ }
}

export class PatchPosturePage extends Component {
    constructor(props) {
        super(props);
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        this.state = {
            loading: true,
            refreshing: false,
            fromCache: false,
            error: null,
            data: null,
            expanded: new Set(),
            diffFrom: from.toISOString().substring(0, 10),
            diffTo: to.toISOString().substring(0, 10),
            diffLoading: false,
            diffError: null,
            diff: null
        };
        this._orgUnsub = null;
    }

    componentDidMount() {
        this._orgUnsub = orgContext.onChange(() => this.load());
        this.load();
    }

    componentWillUnmount() {
        if (this._orgUnsub) this._orgUnsub();
    }

    async load() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) {
            this.setState({ loading: false, error: 'No organization selected.' });
            return;
        }

        // Stale-while-revalidate: paint cache immediately if fresh, then fetch.
        const cached = readCache(org.orgId);
        if (cached) {
            this.setState({ loading: false, refreshing: true, fromCache: true, data: cached.data, error: null });
        } else {
            this.setState({ loading: this.state.data == null, refreshing: this.state.data != null, fromCache: false, error: null });
        }

        try {
            const resp = await api.getPatchPosture(org.orgId);
            if (!resp?.success) throw new Error(resp?.message || 'Failed to load patch posture');
            writeCache(org.orgId, resp.data);
            this.setState({ loading: false, refreshing: false, fromCache: false, data: resp.data });
        } catch (err) {
            console.error('[PatchPosture] load failed', err);
            // Keep stale cache visible if present; only clear if we had no data.
            this.setState({
                loading: false,
                refreshing: false,
                error: this.state.data ? null : (err.message || String(err))
            });
        }
    }

    toggleDevice(deviceId) {
        const expanded = new Set(this.state.expanded);
        if (expanded.has(deviceId)) expanded.delete(deviceId);
        else expanded.add(deviceId);
        this.setState({ expanded });
    }

    async loadDiff() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        const { diffFrom, diffTo } = this.state;
        if (!diffFrom || !diffTo) return;
        this.setState({ diffLoading: true, diffError: null });
        try {
            // send from/to as full-day UTC bounds
            const fromIso = new Date(`${diffFrom}T00:00:00Z`).toISOString();
            const toIso = new Date(`${diffTo}T23:59:59Z`).toISOString();
            const resp = await api.getPatchPostureDiff(org.orgId, fromIso, toIso);
            if (!resp?.success) throw new Error(resp?.message || 'Failed to load diff');
            this.setState({ diffLoading: false, diff: resp.data });
        } catch (err) {
            console.error('[PatchPosture] diff failed', err);
            this.setState({ diffLoading: false, diffError: err.message || String(err) });
        }
    }

    severityBadge(sev) {
        if (sev >= 3) return html`<span class="badge bg-danger text-white">Critical</span>`;
        if (sev >= 2) return html`<span class="badge bg-warning text-white">High</span>`;
        if (sev >= 1) return html`<span class="badge bg-info text-white">Medium</span>`;
        return html`<span class="badge bg-secondary text-white">Low</span>`;
    }

    /**
     * Operational health banner. Two outcomes for the customer:
     *  - intel index missing → tell them MagenSec is still ingesting Microsoft's
     *    catalog and to retry shortly. No internal cron / Site-Admin references.
     *  - intel ready but zero findings → reassure that all monitored devices are
     *    current with available Microsoft updates. No build numbers, no cron names.
     */
    renderDiagnostics(summary, intel, hosts) {
        if (!intel?.loaded || (intel?.productCount ?? 0) === 0) {
            return html`
                <div class="alert alert-warning d-flex align-items-start mb-3" role="alert">
                    <i class="ti ti-alert-triangle me-2 fs-2"></i>
                    <div>
                        <strong>Patch intelligence is still being prepared.</strong>
                        MagenSec is downloading the latest Microsoft Security Response Center catalog. This usually completes within a few hours of a fresh install or after a major Patch Tuesday release. Please check back shortly.
                    </div>
                </div>`;
        }
        if ((intel?.productCount ?? 0) > 0 && hosts.length === 0 && (summary?.openAlerts ?? 0) === 0) {
            return html`
                <div class="alert alert-success d-flex align-items-start mb-3" role="alert">
                    <i class="ti ti-shield-check me-2 fs-2"></i>
                    <div>
                        <strong>All monitored devices are up to date.</strong>
                        No missing Microsoft security updates were found across your fleet. Keep your MagenSec agent current so newly published Microsoft updates continue to be evaluated automatically.
                    </div>
                </div>`;
        }
        return null;
    }

    async exportCsv() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        try {
            await api.exportPatchPostureCsv(org.orgId);
        } catch (err) {
            console.error('[PatchPosture] csv export failed', err);
            window.toast?.show?.(err.message || 'CSV export failed', 'danger', 5000);
        }
    }

    /**
     * Opens the printable HTML report in a new tab. The user then hits
     * Ctrl+P / Cmd+P → "Save as PDF". Avoids server-side PDF deps.
     */
    async openPrintReport() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        try {
            await api.openPatchPosturePrintReport(org.orgId);
        } catch (err) {
            console.error('[PatchPosture] print report failed', err);
            window.toast?.show?.(err.message || 'Failed to open printable report', 'danger', 5000);
        }
    }

    /**
     * Emails the Patch Posture HTML report to the org owner (default) or a custom address.
     * Same UX as the review-report send button.
     */
    async emailReport() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        const target = window.prompt('Send Patch Posture report to (leave blank to send to org owner):', '') || '';
        const trimmed = target.trim();
        const recipient = trimmed ? 'custom' : 'owner';
        try {
            window.toast?.show?.('Sending patch posture report…', 'info', 3000);
            const res = await api.sendPatchPostureReport(org.orgId, recipient, trimmed);
            if (res?.success) {
                window.toast?.show?.(res.message || `Report sent to ${res.data?.recipient || 'owner'}`, 'success', 5000);
            } else {
                window.toast?.show?.(res?.message || 'Failed to send report', 'danger', 5000);
            }
        } catch (err) {
            console.error('[PatchPosture] email report failed', err);
            window.toast?.show?.(err.message || 'Failed to send report', 'danger', 5000);
        }
    }

    renderKpis(summary, intel) {
        const builtAt = intel?.builtAt ? new Date(intel.builtAt).toLocaleString() : '—';
        const intelStatus = intel?.loaded
            ? html`<span class="text-success">Loaded</span>`
            : html`<span class="text-danger">Not built</span>`;
        return html`
            <div class="row row-cards mb-3">
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="subheader">Hosts affected</div>
                        <div class="h1 mb-0">${summary?.hostsAffected ?? 0}</div>
                    </div></div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="subheader">Open missing-patch alerts</div>
                        <div class="h1 mb-0">${summary?.openAlerts ?? 0}</div>
                    </div></div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="subheader">Critical · High</div>
                        <div class="h1 mb-0">
                            <span class="text-danger">${summary?.critical ?? 0}</span>
                            <span class="text-muted mx-1">·</span>
                            <span class="text-warning">${summary?.high ?? 0}</span>
                        </div>
                    </div></div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="subheader">Patch intelligence</div>
                        <div class="h3 mb-0">${intelStatus}</div>
                        <div class="text-muted small mt-1">
                            Built: ${builtAt}<br/>
                            Products: ${intel?.productCount ?? 0} · KBs: ${intel?.leafPatchCount ?? 0}
                        </div>
                    </div></div>
                </div>
            </div>
        `;
    }

    renderHostRow(host) {
        const expanded = this.state.expanded.has(host.deviceId);
        const total = (host.critical || 0) + (host.high || 0) + (host.other || 0);
        return html`
            <>
                <tr class="cursor-pointer" onClick=${() => this.toggleDevice(host.deviceId)}>
                    <td>
                        <i class="ti ${expanded ? 'ti-chevron-down' : 'ti-chevron-right'} me-2 text-muted"></i>
                        <strong>${host.deviceName}</strong>
                        <div class="text-muted small">${host.deviceId}</div>
                    </td>
                    <td class="text-center">${total}</td>
                    <td class="text-center">${host.critical > 0 ? html`<span class="badge bg-danger text-white">${host.critical}</span>` : '—'}</td>
                    <td class="text-center">${host.high > 0 ? html`<span class="badge bg-warning text-white">${host.high}</span>` : '—'}</td>
                    <td class="text-center">${host.other > 0 ? html`<span class="badge bg-secondary text-white">${host.other}</span>` : '—'}</td>
                </tr>
                ${expanded ? html`
                    <tr>
                        <td colspan="5" class="bg-light p-0">
                            <div class="p-3">
                                <table class="table table-sm mb-0">
                                    <thead><tr>
                                        <th>KB</th><th>Product</th><th>Severity</th>
                                        <th class="text-end">CVSS</th><th class="text-center">Exploited</th>
                                        <th class="text-end">Age (d)</th><th>CVEs</th><th>Advisory</th>
                                    </tr></thead>
                                    <tbody>
                                        ${(host.missingPatches || []).map(p => html`
                                            <tr key=${p.kb + '|' + p.productId}>
                                                <td><code>${p.kb}</code></td>
                                                <td>
                                                    <div>${p.productName || p.productId}</div>
                                                    <div class="text-muted small">${p.msrcSeverity || ''}</div>
                                                </td>
                                                <td>${this.severityBadge(p.severity)}</td>
                                                <td class="text-end">${p.maxCvss != null ? p.maxCvss.toFixed(1) : '—'}</td>
                                                <td class="text-center">${p.isExploited
                                                    ? html`<span class="badge bg-danger text-white">Yes</span>`
                                                    : html`<span class="text-muted">No</span>`}</td>
                                                <td class="text-end">${p.daysSinceRelease ?? 0}</td>
                                                <td>
                                                    ${(p.cves || []).slice(0, 3).map(c => html`
                                                        <a href="#!/cves/${c}" class="badge bg-blue-lt text-blue me-1">${c}</a>
                                                    `)}
                                                    ${(p.cves || []).length > 3 ? html`<span class="text-muted small">+${p.cves.length - 3}</span>` : null}
                                                </td>
                                                <td>${p.advisoryUrl
                                                    ? html`<a href=${p.advisoryUrl} target="_blank" rel="noopener"><i class="ti ti-external-link"></i></a>`
                                                    : '—'}</td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        </td>
                    </tr>
                ` : null}
            </>
        `;
    }

    render() {
        const { loading, refreshing, error, data } = this.state;
        if (loading) {
            return html`
                <div class="page-body"><div class="container-xl">
                    <div class="text-center py-5"><div class="spinner-border text-primary"></div></div>
                </div></div>
            `;
        }
        if (error) {
            return html`
                <div class="page-body"><div class="container-xl">
                    <div class="alert alert-danger">${error}</div>
                </div></div>
            `;
        }
        const { summary, intel, hosts = [] } = data || {};
        return html`
            <div class="page-body"><div class="container-xl">
                <div class="d-flex align-items-center mb-3">
                    <div>
                        <h2 class="page-title mb-1">
                            Patch Posture
                            ${refreshing ? html`<span class="badge bg-info-lt text-info ms-2"><i class="ti ti-refresh me-1"></i>Refreshing…</span>` : null}
                        </h2>
                        <div class="text-muted">Missing Microsoft security updates across your fleet, refreshed daily.</div>
                    </div>
                    <div class="ms-auto">
                        <div class="btn-group me-2">
                            <button class="btn btn-outline-secondary" onClick=${() => this.exportCsv()} disabled=${!summary?.openAlerts}>
                                <i class="ti ti-download me-1"></i>Download CSV
                            </button>
                            <button class="btn btn-outline-secondary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false" disabled=${!summary?.openAlerts}>
                                <span class="visually-hidden">Toggle dropdown</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item" href="#" onClick=${(e) => { e.preventDefault(); this.exportCsv(); }}>
                                    <i class="ti ti-file-spreadsheet me-2"></i>CSV (Excel / SIEM)
                                </a></li>
                                <li><a class="dropdown-item" href="#" onClick=${(e) => { e.preventDefault(); this.openPrintReport(); }}>
                                    <i class="ti ti-printer me-2"></i>Printable PDF report
                                </a></li>
                                <li><a class="dropdown-item" href="#" onClick=${(e) => { e.preventDefault(); this.emailReport(); }}>
                                    <i class="ti ti-mail me-2"></i>Email me the report
                                </a></li>
                            </ul>
                        </div>
                        <button class="btn btn-outline-primary" onClick=${() => this.load()} disabled=${refreshing}>
                            <i class="ti ti-refresh me-1"></i>${refreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                </div>

                ${this.renderDiagnostics(summary, intel, hosts)}

                ${this.renderKpis(summary, intel)}

                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">What changed</h3>
                        <div class="card-subtitle text-muted">Newly discovered vs newly resolved missing-patch findings in the selected window.</div>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 align-items-end">
                            <div class="col-auto">
                                <label class="form-label">From</label>
                                <input type="date" class="form-control" value=${this.state.diffFrom}
                                    onChange=${(e) => this.setState({ diffFrom: e.target.value })} />
                            </div>
                            <div class="col-auto">
                                <label class="form-label">To</label>
                                <input type="date" class="form-control" value=${this.state.diffTo}
                                    onChange=${(e) => this.setState({ diffTo: e.target.value })} />
                            </div>
                            <div class="col-auto">
                                <button class="btn btn-primary" onClick=${() => this.loadDiff()} disabled=${this.state.diffLoading}>
                                    <i class="ti ti-git-compare me-1"></i>${this.state.diffLoading ? 'Loading…' : 'Compare'}
                                </button>
                            </div>
                            ${this.state.diff ? html`
                                <div class="col-auto ms-auto">
                                    <span class="badge bg-danger text-white me-1">Opened: ${this.state.diff.counts?.opened ?? 0}</span>
                                    <span class="badge bg-success text-white">Resolved: ${this.state.diff.counts?.resolved ?? 0}</span>
                                </div>
                            ` : null}
                        </div>
                        ${this.state.diffError ? html`<div class="alert alert-danger mt-3 mb-0">${this.state.diffError}</div>` : null}
                        ${this.state.diff && (this.state.diff.counts?.opened || this.state.diff.counts?.resolved) ? html`
                            <div class="row mt-3">
                                <div class="col-md-6">
                                    <h4 class="text-danger">Newly opened</h4>
                                    ${(this.state.diff.opened || []).length === 0
                                        ? html`<div class="text-muted small">None.</div>`
                                        : html`<ul class="list-unstyled mb-0">
                                            ${this.state.diff.opened.map(o => html`
                                                <li class="small py-1 border-bottom">
                                                    <code>${o.kb}</code> · ${o.productName} · <span class="text-muted">${o.deviceName}</span>
                                                </li>
                                            `)}
                                        </ul>`}
                                </div>
                                <div class="col-md-6">
                                    <h4 class="text-success">Newly resolved</h4>
                                    ${(this.state.diff.resolved || []).length === 0
                                        ? html`<div class="text-muted small">None.</div>`
                                        : html`<ul class="list-unstyled mb-0">
                                            ${this.state.diff.resolved.map(o => html`
                                                <li class="small py-1 border-bottom">
                                                    <code>${o.kb}</code> · ${o.productName} · <span class="text-muted">${o.deviceName}</span>
                                                </li>
                                            `)}
                                        </ul>`}
                                </div>
                            </div>
                        ` : null}
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Hosts with missing patches</h3>
                    </div>
                    ${hosts.length === 0 ? html`
                        <div class="empty">
                            <div class="empty-icon"><i class="ti ti-shield-check" style="font-size: 48px; color: #2fb344;"></i></div>
                            <p class="empty-title">All patched</p>
                            <p class="empty-subtitle text-muted">
                                No devices have open missing-patch findings for this organization.
                                ${!intel?.loaded ? html` Patch intelligence is still being prepared — please check back shortly.` : null}
                            </p>
                        </div>
                    ` : html`
                        <div class="table-responsive">
                            <table class="table table-vcenter card-table">
                                <thead><tr>
                                    <th>Host</th>
                                    <th class="text-center">Total</th>
                                    <th class="text-center">Critical</th>
                                    <th class="text-center">High</th>
                                    <th class="text-center">Other</th>
                                </tr></thead>
                                <tbody>
                                    ${hosts.map(h => this.renderHostRow(h))}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div></div>
        `;
    }
}
