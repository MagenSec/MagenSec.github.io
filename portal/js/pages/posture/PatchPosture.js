import { api } from '@api';
import { orgContext } from '@orgContext';
import { magiContext } from '@magiContext';
import { CveDetailsModal } from '@components/CveDetailsModal.js';

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
            selectedCveId: null,
            diffFrom: from.toISOString().substring(0, 10),
            diffTo: to.toISOString().substring(0, 10),
            diffLoading: false,
            diffError: null,
            diff: null,
            diffFilters: { opened: true, resolved: true, stayed: true },
            emailState: 'idle',     // idle | sending | sent | failed
            emailDiffState: 'idle', // idle | sending | sent | failed
        };
        this._orgUnsub = null;
    }

    componentDidMount() {
        this._orgUnsub = orgContext.onChange(() => this.load());
        this.load();
    }

    componentDidUpdate(_prevProps, prevState) {
        if (prevState.data !== this.state.data) {
            this.publishMagiContext();
        }
    }

    componentWillUnmount() {
        if (this._orgUnsub) this._orgUnsub();
        magiContext.clear();
    }

    /**
     * Push the current Patch Status snapshot to the global Officer MAGI ChatDrawer
     * so its answers stay grounded in the data the user is looking at and the
     * opening greeting reflects the live numbers.
     */
    publishMagiContext() {
        const snapshot = this.buildMagiSnapshot();
        const greeting = snapshot.openAlerts === 0
            ? `Hi — your Patch Status report is clean (no missing Microsoft updates across ${snapshot.hostsAffected || 0} device${(snapshot.hostsAffected || 0) === 1 ? '' : 's'}). Ask me about hardening tips, patch cadence, or compliance evidence.`
            : `Hi — I have your current Patch Status loaded: **${snapshot.openAlerts} open update${snapshot.openAlerts === 1 ? '' : 's'}** across **${snapshot.hostsAffected} device${snapshot.hostsAffected === 1 ? '' : 's'}** (${snapshot.critical} critical, ${snapshot.high} high, ${snapshot.exploited} actively exploited). Ask what to patch first, how to plan a maintenance window, or for exec-ready impact wording.`;
        const suggestions = (snapshot.openAlerts || 0) > 0
            ? [
                'What should I patch first this week?',
                'Draft a maintenance window plan',
                'Explain the business impact for my exec team',
            ]
            : [
                'How do I keep this clean?',
                'Recommend a patch cadence',
                'What evidence should I keep for compliance?',
            ];
        magiContext.set({
            hint: 'patch status report',
            greeting,
            snapshot,
            suggestions,
        });
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
     * Nessus-style severity column — a coloured pill that shows the qualitative
     * severity AND the CVSS base score in a single glance. Doubles as the row's
     * visual anchor when scanning a long table.
     */
    severityPill(sev, cvss) {
        const score = (cvss != null) ? cvss.toFixed(1) : '—';
        const cls = sev >= 3 ? 'pp-sev pp-sev--crit'
            : sev >= 2 ? 'pp-sev pp-sev--high'
            : sev >= 1 ? 'pp-sev pp-sev--med'
            : 'pp-sev pp-sev--low';
        const label = sev >= 3 ? 'Critical' : sev >= 2 ? 'High' : sev >= 1 ? 'Medium' : 'Low';
        return html`<span class=${cls}><span class="pp-sev__label">${label}</span><span class="pp-sev__score">${score}</span></span>`;
    }

    /**
     * Convert an MSRC CVSS3 vector string (e.g. CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
     * into a compact set of human-readable chips that reproduce the Tenable plugin-detail look.
     */
    cvssVectorChips(vector) {
        if (!vector || typeof vector !== 'string') return null;
        const map = {
            'AV:N': { label: 'Network', cls: 'pp-vec--bad' },
            'AV:A': { label: 'Adjacent', cls: 'pp-vec--warn' },
            'AV:L': { label: 'Local', cls: 'pp-vec--ok' },
            'AV:P': { label: 'Physical', cls: 'pp-vec--ok' },
            'AC:L': { label: 'Low complexity', cls: 'pp-vec--bad' },
            'AC:H': { label: 'High complexity', cls: 'pp-vec--ok' },
            'PR:N': { label: 'No privs', cls: 'pp-vec--bad' },
            'PR:L': { label: 'Low privs', cls: 'pp-vec--warn' },
            'PR:H': { label: 'High privs', cls: 'pp-vec--ok' },
            'UI:N': { label: 'No user action', cls: 'pp-vec--bad' },
            'UI:R': { label: 'User action req.', cls: 'pp-vec--ok' },
            'C:H':  { label: 'Confidentiality H', cls: 'pp-vec--bad' },
            'I:H':  { label: 'Integrity H', cls: 'pp-vec--bad' },
            'A:H':  { label: 'Availability H', cls: 'pp-vec--bad' }
        };
        const chips = [];
        for (const tok of vector.split('/')) {
            if (map[tok]) chips.push(html`<span class="pp-vec ${map[tok].cls}">${map[tok].label}</span>`);
        }
        return chips.length ? html`<div class="pp-vec-row">${chips}</div>` : null;
    }

    openCve(cveId) {
        if (!cveId) return;
        this.setState({ selectedCveId: cveId });
    }

    /**
     * Tenable surfaces remediation in two clicks ("Solution" + advisory link).
     * We give one-click access to BOTH the MSRC advisory and the Microsoft Update
     * Catalog search for the KB — admins on a maintenance window need to grab the
     * MSU/CAB and push it without leaving the page.
     */
    catalogUrl(kb) {
        const k = (kb || '').replace(/^kb/i, '');
        return `https://catalog.update.microsoft.com/v7/site/Search.aspx?q=${encodeURIComponent('KB' + k)}`;
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
     * Builds a compact, deterministic snapshot of the current Patch Status page that we
     * pass to MAGI as the conversation's grounding context. The snapshot is sent as the
     * `context.snapshot` field on every /ai-analyst/ask call so follow-up questions stay
     * grounded in the same report the user is looking at.
     */
    buildMagiSnapshot() {
        const summary = this.state.data?.summary || {};
        const intel = this.state.data?.intel || {};
        const hosts = this.state.data?.hosts || [];
        const topKbs = (intel.topKbs || []).slice(0, 8).map(k => ({
            kb: k.kb || k.Kb,
            product: k.product || k.ProductName,
            devices: k.devices || k.Devices || 0,
            severity: k.severity || k.Severity,
            maxCvss: k.maxCvss || k.MaxCvss,
            exploited: k.exploited || k.Exploited || false,
        }));
        const topHosts = hosts
            .slice()
            .sort((a, b) => (b.critical || 0) - (a.critical || 0) || (b.high || 0) - (a.high || 0))
            .slice(0, 8)
            .map(h => ({
                deviceName: h.deviceName,
                critical: h.critical || 0,
                high: h.high || 0,
                other: h.other || 0,
                oldestDays: h.maxAge || h.oldestDays || 0,
            }));
        return {
            page: 'patch-status',
            openAlerts: summary.openAlerts || 0,
            hostsAffected: summary.hostsAffected || hosts.length || 0,
            critical: summary.critical || 0,
            high: summary.high || 0,
            exploited: summary.exploited || 0,
            distinctKbs: summary.distinctKbs || (intel.topKbs?.length || 0),
            topKbs,
            topHosts,
        };
    }

    /**
     * Emails the Patch Posture HTML report to the org owner (default) or a custom address.
     * Inline button state + toast so the click always produces visible feedback.
     */
    async emailReport() {
        if (this.state.emailState === 'sending') return;
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        const target = window.prompt('Send Patch Status report to (leave blank to send to org owner):', '');
        if (target === null) return; // user cancelled the prompt
        const trimmed = target.trim();
        const recipient = trimmed ? 'custom' : 'owner';
        this.setState({ emailState: 'sending' });
        window.toast?.show?.('Sending Patch Status report…', 'info', 3000);
        try {
            const res = await api.sendPatchPostureReport(org.orgId, recipient, trimmed);
            if (res?.success) {
                this.setState({ emailState: 'sent' });
                window.toast?.show?.(res.message || `Report sent to ${res.data?.recipient || 'owner'}`, 'success', 5000);
                setTimeout(() => { if (this.state.emailState === 'sent') this.setState({ emailState: 'idle' }); }, 4000);
            } else {
                this.setState({ emailState: 'failed' });
                window.toast?.show?.(res?.message || 'Failed to send report', 'danger', 6000);
                setTimeout(() => { if (this.state.emailState === 'failed') this.setState({ emailState: 'idle' }); }, 5000);
            }
        } catch (err) {
            console.error('[PatchPosture] email report failed', err);
            this.setState({ emailState: 'failed' });
            window.toast?.show?.(err.message || 'Failed to send report', 'danger', 6000);
            setTimeout(() => { if (this.state.emailState === 'failed') this.setState({ emailState: 'idle' }); }, 5000);
        }
    }

    /**
     * Downloads the unified Opened/Resolved/Stayed diff as CSV.
     * Hits /diff?format=csv which streams the same dataset rendered in the table.
     */
    async exportDiffCsv() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        const { diffFrom, diffTo } = this.state;
        if (!diffFrom || !diffTo) return;
        try {
            await api.exportPatchPostureDiffCsv(org.orgId, diffFrom, diffTo);
        } catch (err) {
            console.error('[PatchPosture] diff CSV failed', err);
            window.toast?.show?.(err.message || 'Diff CSV export failed', 'danger', 5000);
        }
    }

    /**
     * Emails the What-Changed (diff) report as a branded PDF for the selected window.
     * Tracks its own button state so the diff toolbar shows independent send progress.
     */
    async emailDiffReport() {
        if (this.state.emailDiffState === 'sending') return;
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        const { diffFrom, diffTo } = this.state;
        if (!diffFrom || !diffTo) return;
        const target = window.prompt('Send Patch Status diff report to (leave blank to send to org owner):', '');
        if (target === null) return;
        const trimmed = target.trim();
        const recipient = trimmed ? 'custom' : 'owner';
        this.setState({ emailDiffState: 'sending' });
        window.toast?.show?.('Sending Patch Status diff report…', 'info', 3000);
        try {
            const res = await api.sendPatchPostureDiffReport(org.orgId, diffFrom, diffTo, recipient, trimmed);
            if (res?.success) {
                this.setState({ emailDiffState: 'sent' });
                window.toast?.show?.(res.message || `Diff report sent to ${res.data?.recipient || 'owner'}`, 'success', 5000);
                setTimeout(() => { if (this.state.emailDiffState === 'sent') this.setState({ emailDiffState: 'idle' }); }, 4000);
            } else {
                this.setState({ emailDiffState: 'failed' });
                window.toast?.show?.(res?.message || 'Failed to send diff report', 'danger', 6000);
                setTimeout(() => { if (this.state.emailDiffState === 'failed') this.setState({ emailDiffState: 'idle' }); }, 5000);
            }
        } catch (err) {
            console.error('[PatchPosture] email diff report failed', err);
            this.setState({ emailDiffState: 'failed' });
            window.toast?.show?.(err.message || 'Failed to send diff report', 'danger', 6000);
            setTimeout(() => { if (this.state.emailDiffState === 'failed') this.setState({ emailDiffState: 'idle' }); }, 5000);
        }
    }

    /**
     * Opens the What-Changed PDF report in a new tab.
     */
    async openDiffPdf() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        const { diffFrom, diffTo } = this.state;
        if (!diffFrom || !diffTo) return;
        try {
            await api.openPatchPostureDiffPrintReport(org.orgId, diffFrom, diffTo);
        } catch (err) {
            console.error('[PatchPosture] diff PDF failed', err);
            window.toast?.show?.(err.message || 'Diff PDF failed', 'danger', 5000);
        }
    }

    /**
     * Renders the unified Opened/Resolved/Stayed diff body as a single sortable table.
     * Order: Opened first (most actionable), then Stayed (the persistent backlog),
     * then Resolved (good news at the bottom). Mirrors how Tenable displays diff exports.
     */
    toggleDiffFilter(key) {
        const next = { ...this.state.diffFilters, [key]: !this.state.diffFilters[key] };
        // Don't allow turning everything off — re-enable the just-clicked one.
        if (!next.opened && !next.resolved && !next.stayed) next[key] = true;
        this.setState({ diffFilters: next });
    }

    renderDiffRows() {
        const d = this.state.diff;
        if (!d) return null;
        const f = this.state.diffFilters || { opened: true, resolved: true, stayed: true };
        const rows = [];
        if (f.opened) {
            for (const x of (d.opened || [])) rows.push({ ...x, _status: 'Opened', _badge: 'bg-danger', _icon: 'ti-circle-plus', _when: x.openedAt || x.OpenedAt });
        }
        if (f.stayed) {
            for (const x of (d.stayed || [])) rows.push({ ...x, _status: 'Stayed open', _badge: 'bg-warning', _icon: 'ti-clock-exclamation', _when: x.openedAt || x.OpenedAt });
        }
        if (f.resolved) {
            for (const x of (d.resolved || [])) rows.push({ ...x, _status: 'Resolved', _badge: 'bg-success', _icon: 'ti-circle-check', _when: x.closedAt || x.ClosedAt || x.openedAt || x.OpenedAt });
        }
        return rows.map((r, idx) => {
            const kb = r.kb || r.Kb || '';
            const product = r.productName || r.ProductName || '';
            const title = r.vulnTitle || r.VulnTitle || '';
            const sev = r.severity || r.Severity || 0;
            const cvss = r.maxCvss || r.MaxCvss;
            const cves = r.cves || r.Cves || [];
            const when = r._when ? new Date(r._when).toLocaleDateString() : '—';
            return html`
                <tr key=${'diff-' + idx} class="pp-finding pp-finding--sev${sev}">
                    <td class="pp-finding__sev">${this.severityPill(sev, cvss)}</td>
                    <td class="pp-finding__kb"><code class="pp-kb">${kb}</code></td>
                    <td class="pp-finding__vuln">
                        <div class="pp-vuln-title">${title || `Security update for ${product}`}</div>
                        <div class="pp-vuln-product text-muted small">${product}</div>
                    </td>
                    <td class="pp-finding__cves">
                        ${cves.slice(0, 3).map(c => html`
                            <button type="button" class="btn btn-sm pp-cve-chip" onClick=${() => this.openCve(c)} title="Open ${c} details">${c}</button>
                        `)}
                        ${cves.length > 3 ? html`<span class="text-muted small ms-1">+${cves.length - 3}</span>` : null}
                    </td>
                    <td class="text-muted small">${r.deviceName || r.DeviceName || ''}</td>
                    <td class="text-end text-muted small">${when}</td>
                    <td class="text-center"><span class="badge ${r._badge} text-white"><i class="ti ${r._icon} me-1"></i>${r._status}</span></td>
                </tr>`;
        });
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
        // Sort missing patches the way Nessus does — critical first, then by
        // CVSS desc, then by oldest unpatched. This puts the must-fix item at
        // the top regardless of which product flavour produced the alert.
        const sortedPatches = [...(host.missingPatches || [])].sort((a, b) => {
            if ((b.severity || 0) !== (a.severity || 0)) return (b.severity || 0) - (a.severity || 0);
            if ((b.maxCvss || 0) !== (a.maxCvss || 0)) return (b.maxCvss || 0) - (a.maxCvss || 0);
            return (b.daysSinceRelease || 0) - (a.daysSinceRelease || 0);
        });

        const mainRow = html`
            <tr key=${'h-' + host.deviceId} class="pp-host-row" onClick=${() => this.toggleDevice(host.deviceId)}>
                <td>
                    <i class="ti ${expanded ? 'ti-chevron-down' : 'ti-chevron-right'} me-2 text-muted"></i>
                    <strong>${host.deviceName}</strong>
                    <div class="text-muted small">${host.deviceId}</div>
                </td>
                <td class="text-center">${total}</td>
                <td class="text-center">${host.critical > 0 ? html`<span class="badge bg-danger text-white">${host.critical}</span>` : '—'}</td>
                <td class="text-center">${host.high > 0 ? html`<span class="badge bg-warning text-white">${host.high}</span>` : '—'}</td>
                <td class="text-center">${host.other > 0 ? html`<span class="badge bg-secondary text-white">${host.other}</span>` : '—'}</td>
            </tr>`;
        if (!expanded) return mainRow;

        const detailRow = html`
            <tr key=${'d-' + host.deviceId}>
                <td colspan="5" class="pp-detail-cell p-0">
                    <div class="pp-detail-wrap">
                        <div class="pp-detail-header">
                            <div class="pp-detail-title">
                                <i class="ti ti-bug me-2"></i>
                                ${sortedPatches.length} missing security update${sortedPatches.length === 1 ? '' : 's'}
                            </div>
                            <div class="pp-detail-sub text-muted small">
                                Findings sourced from MSRC CVRF, ranked by severity then CVSS.
                            </div>
                        </div>
                        <table class="table table-sm pp-detail-table mb-0">
                            <thead><tr>
                                <th style="width:104px">Severity</th>
                                <th style="width:128px">KB</th>
                                <th>Vulnerability</th>
                                <th class="text-center" style="width:72px">Age</th>
                                <th>CVEs</th>
                                <th class="text-end" style="width:170px">Remediation</th>
                            </tr></thead>
                            <tbody>
                                ${sortedPatches.map(p => this.renderPatchDetailRow(p))}
                            </tbody>
                        </table>
                    </div>
                </td>
            </tr>`;
        return [mainRow, detailRow];
    }

    /**
     * One row of the Nessus-style finding table. Each row reads top-to-bottom like
     * a Tenable plugin entry: severity pill (with CVSS score), KB id (with the
     * MSRC impact-type tag), one-line vulnerability title, CVE chips that open the
     * shared CveDetailsModal in-place, and a remediation button group that takes
     * the admin straight to either the MSRC advisory or the Microsoft Update
     * Catalog search for the KB.
     */
    renderPatchDetailRow(p) {
        const impacts = (p.impactTypes || []).filter(Boolean);
        const cves = (p.cves || []).filter(Boolean);
        return html`
            <tr key=${p.kb + '|' + p.productId} class="pp-finding pp-finding--sev${p.severity || 0}">
                <td class="pp-finding__sev">${this.severityPill(p.severity, p.maxCvss)}</td>
                <td class="pp-finding__kb">
                    <code class="pp-kb">${p.kb}</code>
                    ${p.isExploited ? html`<span class="pp-flag pp-flag--exploited" title="Microsoft confirms in-the-wild exploitation"><i class="ti ti-bolt me-1"></i>Exploited</span>` : null}
                </td>
                <td class="pp-finding__vuln">
                    ${p.vulnTitle
                        ? html`<div class="pp-vuln-title">${p.vulnTitle}</div>`
                        : html`<div class="pp-vuln-title">Security update for ${p.productName || p.productId}</div>`}
                    <div class="pp-vuln-product text-muted small">${p.productName || p.productId}</div>
                    ${impacts.length ? html`<div class="pp-impact-row">
                        ${impacts.map(i => html`<span class="pp-impact">${i}</span>`)}
                    </div>` : null}
                    ${this.cvssVectorChips(p.cvssVector)}
                </td>
                <td class="text-center pp-finding__age">
                    <span class="pp-age ${(p.daysSinceRelease || 0) >= 30 ? 'pp-age--old' : ''}">${p.daysSinceRelease ?? 0}d</span>
                </td>
                <td class="pp-finding__cves">
                    ${cves.slice(0, 4).map(c => html`
                        <button type="button" class="btn btn-sm pp-cve-chip" onClick=${() => this.openCve(c)} title="Open ${c} details">
                            ${c}
                        </button>
                    `)}
                    ${cves.length > 4 ? html`<span class="text-muted small ms-1">+${cves.length - 4} more</span>` : null}
                </td>
                <td class="text-end pp-finding__fix">
                    <div class="btn-group btn-group-sm" role="group">
                        <a class="btn btn-outline-primary"
                           href=${p.msrcUrl || p.advisoryUrl || (cves[0] ? `https://msrc.microsoft.com/update-guide/vulnerability/${cves[0]}` : '#')}
                           target="_blank" rel="noopener"
                           title="Microsoft Security Response Center vulnerability page"
                           ?disabled=${!p.msrcUrl && !p.advisoryUrl && !cves[0]}>
                            <i class="ti ti-shield-lock me-1"></i>MSRC
                        </a>
                        <a class="btn btn-outline-secondary" href=${this.catalogUrl(p.kb)} target="_blank" rel="noopener" title="Download the update package from the Microsoft Update Catalog">
                            <i class="ti ti-download me-1"></i>Catalog
                        </a>
                    </div>
                </td>
            </tr>`;
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
                            Patch Status
                            ${refreshing ? html`<span class="badge bg-info-lt text-info ms-2"><i class="ti ti-refresh me-1"></i>Refreshing…</span>` : null}
                        </h2>
                        <div class="text-muted">Missing Microsoft security updates across your fleet, refreshed daily.</div>
                    </div>
                    <div class="ms-auto">
                        <div class="btn-group me-2">
                            <button class="btn btn-primary ${this.state.emailState === 'sending' ? 'disabled' : ''}"
                                    onClick=${() => { if (this.state.emailState !== 'sending') this.emailReport(); }}
                                    disabled=${!summary?.openAlerts || this.state.emailState === 'sending'}
                                    title="Email a branded PDF of the full report">
                                ${this.state.emailState === 'sending'
                                    ? html`<span class="spinner-border spinner-border-sm me-1" role="status"></span>Sending…`
                                    : this.state.emailState === 'sent'
                                        ? html`<i class="ti ti-circle-check me-1"></i>Report sent`
                                        : this.state.emailState === 'failed'
                                            ? html`<i class="ti ti-alert-circle me-1"></i>Retry email`
                                            : html`<i class="ti ti-mail me-1"></i>Email PDF report`}
                            </button>
                            <button class="btn btn-primary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false" disabled=${!summary?.openAlerts}>
                                <span class="visually-hidden">Toggle dropdown</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item" href="#" onClick=${(e) => { e.preventDefault(); this.openPrintReport(); }}>
                                    <i class="ti ti-file-type-pdf me-2"></i>Open PDF report
                                </a></li>
                                <li><a class="dropdown-item" href="#" onClick=${(e) => { e.preventDefault(); this.exportCsv(); }}>
                                    <i class="ti ti-file-spreadsheet me-2"></i>Download CSV (Excel / SIEM)
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
                                    <div class="btn-group btn-group-sm me-2" role="group" aria-label="Filter diff rows">
                                        <button type="button"
                                            class="btn ${this.state.diffFilters.opened ? 'btn-danger' : 'btn-outline-danger'}"
                                            onClick=${() => this.toggleDiffFilter('opened')}
                                            title="First seen inside this window">
                                            <i class="ti ti-circle-plus me-1"></i>Opened: ${this.state.diff.counts?.opened ?? 0}
                                        </button>
                                        <button type="button"
                                            class="btn ${this.state.diffFilters.stayed ? 'btn-warning' : 'btn-outline-warning'}"
                                            onClick=${() => this.toggleDiffFilter('stayed')}
                                            title="Open before AND still open at end of window">
                                            <i class="ti ti-clock-exclamation me-1"></i>Stayed: ${this.state.diff.counts?.stayed ?? 0}
                                        </button>
                                        <button type="button"
                                            class="btn ${this.state.diffFilters.resolved ? 'btn-success' : 'btn-outline-success'}"
                                            onClick=${() => this.toggleDiffFilter('resolved')}
                                            title="Closed inside this window">
                                            <i class="ti ti-circle-check me-1"></i>Resolved: ${this.state.diff.counts?.resolved ?? 0}
                                        </button>
                                    </div>
                                    <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.openDiffPdf()} title="Open this diff as a PDF">
                                        <i class="ti ti-file-type-pdf me-1"></i>PDF
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary ms-1" onClick=${() => this.exportDiffCsv()} title="Download this diff as CSV">
                                        <i class="ti ti-download me-1"></i>CSV
                                    </button>
                                    <button class="btn btn-sm ${this.state.emailDiffState === 'sent' ? 'btn-success' : this.state.emailDiffState === 'failed' ? 'btn-danger' : 'btn-outline-secondary'} ms-1"
                                            onClick=${() => this.emailDiffReport()}
                                            disabled=${this.state.emailDiffState === 'sending'}
                                            title="Email this diff as a report">
                                        ${this.state.emailDiffState === 'sending'
                                            ? html`<span class="spinner-border spinner-border-sm me-1" role="status"></span>Sending…`
                                            : this.state.emailDiffState === 'sent'
                                                ? html`<i class="ti ti-circle-check me-1"></i>Sent`
                                                : this.state.emailDiffState === 'failed'
                                                    ? html`<i class="ti ti-alert-circle me-1"></i>Retry`
                                                    : html`<i class="ti ti-mail me-1"></i>Email`}
                                    </button>
                                </div>
                            ` : null}
                        </div>
                        ${this.state.diffError ? html`<div class="alert alert-danger mt-3 mb-0">${this.state.diffError}</div>` : null}
                        ${this.state.diff && (this.state.diff.counts?.opened + this.state.diff.counts?.resolved + this.state.diff.counts?.stayed > 0) ? html`
                            <div class="table-responsive mt-3">
                                <table class="table table-sm table-vcenter pp-diff-table mb-0">
                                    <thead><tr>
                                        <th style="width:104px">Severity</th>
                                        <th style="width:128px">KB</th>
                                        <th>Vulnerability</th>
                                        <th>CVE</th>
                                        <th>Device</th>
                                        <th class="text-end" style="width:120px">When</th>
                                        <th class="text-center" style="width:140px">Status</th>
                                    </tr></thead>
                                    <tbody>
                                        ${this.renderDiffRows()}
                                    </tbody>
                                </table>
                            </div>
                        ` : (this.state.diff ? html`<div class="text-muted small mt-3">No changes in this window. Pick a different range above.</div>` : null)}
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
            <${CveDetailsModal}
                cveId=${this.state.selectedCveId}
                orgId=${orgContext.getCurrentOrg()?.orgId}
                isOpen=${!!this.state.selectedCveId}
                onClose=${() => this.setState({ selectedCveId: null })}
            />
        `;
    }
}
