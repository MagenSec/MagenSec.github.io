/**
 * Alerts Page - Security and compliance alert tracking with suppress/reopen workflows
 *
 * Severity scale (backend int):
 *   4 = Critical, 3 = High, 2 = Medium, 1 = Low, 0 = Info
 *
 * Domain values: "Vulnerability" | "Compliance"
 *
 * SWR pattern: localStorage cache (10 min TTL) + background refresh
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { getAlertRemediationTemplate } from '../../data/compliance-remediation-cache.js';
import { SegmentedControl, CollapsibleSectionCard, resolveDeviceLabel } from '../../components/shared/CommonComponents.js';

const { html, Component } = window;

const SEV_INT_MAP = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low', 0: 'Info' };
const SEV_COLOR   = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'secondary', Info: 'azure' };

function severityLabel(sevInt) {
    return SEV_INT_MAP[sevInt] ?? 'Unknown';
}
function severityColor(sevInt) {
    return SEV_COLOR[severityLabel(sevInt)] ?? 'secondary';
}
function domainColor(domain) {
    if (!domain) return 'secondary';
    const d = domain.toLowerCase();
    if (d === 'vulnerability') return 'danger';
    if (d === 'compliance') return 'warning';
    return 'secondary';
}
function fmtDate(val) {
    if (!val) return '—';
    try { return new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return '—'; }
}

function fmtActual(val) {
    if (!val) return '';
    if (val === 'Unknown') return 'Not Verified';
    return val;
}

function isSyncControl(alert) {
    const controlId = (alert?.controlId || '').toUpperCase();
    return controlId.startsWith('SYNC-');
}

function getAlertTitle(alert) {
    const controlId = (alert?.controlId || '').toUpperCase();
    if (controlId === 'SYNC-CONFIG') return 'Configuration Out-of-Sync';
    if (controlId === 'VERSION-CLIENT') return 'Client App Update Required';
    if (controlId === 'KB-MISSING') {
        const kb = alert?.detailJson?.kb || alert?.detailJson?.Kb;
        const prod = alert?.detailJson?.productName || alert?.detailJson?.ProductName;
        return prod && kb ? `Missing ${kb} for ${prod}` : 'Missing Security Patch';
    }
    if (isSyncControl(alert)) return 'Configuration Out-of-Sync';
    return alert?.controlName || alert?.controlId || 'Unknown Alert';
}

function getRiskTag(alert) {
    const controlId = (alert?.controlId || '').toUpperCase();
    const actual = (alert?.actual || '').toUpperCase();

    if (controlId === 'VERSION-CLIENT') return 'Version Risk';
    if (controlId === 'KB-MISSING') return 'Patch Risk';
    if (isSyncControl(alert)) return 'Sync Risk';
    if (controlId.includes('OFFLINE') || controlId.includes('STALE') || controlId.includes('GHOST') || actual.includes('OFFLINE')) {
        return 'Health Risk';
    }

    return null;
}

function shouldShowStateDetails(alert) {
    return !isSyncControl(alert);
}

function getSyncAlertGuidance() {
    return 'Fingerprint drift detected. Ask the user to update the client, confirm the device is online, and verify internet connectivity so the latest inventory and compliance data can sync.';
}

function formatSuspiciousCount(count) {
    const numeric = Number(count) || 0;
    return numeric === 256 ? '256+' : String(numeric);
}

// SLA deadlines by severity (days from openedAt)
const SLA_DAYS = { 4: 2, 3: 7, 2: 30, 1: 90 };  // Critical=2d, High=7d, Medium=30d, Low=90d

function slaInfo(severity, openedAt) {
    const slaDays = SLA_DAYS[severity];
    if (!slaDays || !openedAt) return { label: '—', color: 'secondary', daysLeft: Infinity };
    const opened = new Date(openedAt);
    const deadline = new Date(opened.getTime() + slaDays * 86400000);
    const now = new Date();
    const daysLeft = Math.ceil((deadline - now) / 86400000);
    if (daysLeft < 0) return { label: `${Math.abs(daysLeft)}d overdue`, color: 'danger', daysLeft };
    if (daysLeft === 0) return { label: 'Due today', color: 'danger', daysLeft };
    if (daysLeft <= 3) return { label: `${daysLeft}d left`, color: 'warning', daysLeft };
    return { label: `${daysLeft}d left`, color: 'secondary', daysLeft };
}

export class AlertsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            alerts: [],
            summary: null,
            deviceMap: {},          // deviceId → deviceName
            stateFilter: 'OPEN',
            severityFilter: 'all',
            domainFilter: 'all',
            deviceFilter: 'all',        // 'all' or deviceId
            groupBy: 'application',
            expandedGroups: {},
            isRefreshingInBackground: false,

            // Suppress modal
            suppressModal: null,    // { alert } when open
            suppressReason: '',
            suppressDays: '30',     // '7' | '30' | '90' | 'forever'

            // Bulk suppress
            selectedAlerts: new Set(),   // keys: `${deviceId}|${alertRowKey}`
            bulkModal: false,
            bulkLoading: false,

            // Pending action for loading indicators
            pendingRowKey: null,

            // Inline MAGI panel
            magiAlert: null,        // alert being investigated
            magiLoading: false,
            magiAnswer: null,
            magiError: null,
            magiFromCache: false,   // true if answer came from local cache
            magiFeedback: null,     // 'up' | 'down' | null

            // Glossary popover
            showGlossary: false,

            // Sort
            sortBy: null,           // 'sla' | null
            sortDir: 'asc',
        };
        this.orgUnsubscribe = null;
        this._rewindUnsub = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadAlerts());
        this._rewindUnsub = rewindContext.onChange(() => this.loadAlerts());
        this.loadAlerts();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this._rewindUnsub) this._rewindUnsub();
    }

    // ── SWR helpers ────────────────────────────────────────────────────────────

    _cacheKey() {
        const org = orgContext.getCurrentOrg();
        const effectiveDate = api.getEffectiveDate?.() || 'current';
        return `alerts_${org?.orgId || 'default'}_${this.state.stateFilter}_${effectiveDate}`;
    }

    getCached() {
        try {
            const raw = localStorage.getItem(this._cacheKey());
            if (!raw) return null;
            const { data, timestamp } = JSON.parse(raw);
            const isStale = Date.now() - timestamp >= 10 * 60 * 1000;
            return { data, isStale };
        } catch { return null; }
    }

    setCache(data) {
        try {
            localStorage.setItem(this._cacheKey(), JSON.stringify({ data, timestamp: Date.now() }));
        } catch { /* storage full */ }
    }

    // ── Data loading ───────────────────────────────────────────────────────────

    async loadAlerts(forceRefresh = false) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId || auth.getUser()?.email;

        if (!forceRefresh) {
            const cached = this.getCached();
            if (cached) {
                this.setState({
                    alerts: cached.data.alerts || [],
                    summary: cached.data.summary,
                    loading: false,
                    isRefreshingInBackground: true,
                    error: null,
                });
            }
        }

        if (!this.state.alerts.length) {
            this.setState({ loading: true, error: null });
        }

        try {
            const [alertsResp, summaryResp, devicesResp] = await Promise.all([
                api.getAlerts(orgId, { state: this.state.stateFilter, limit: 500 }),
                api.getAlertSummary(orgId),
                api.getDevices(orgId),
            ]);

            if (!alertsResp.success) throw new Error(alertsResp.message || 'Failed to load alerts');

            // Build deviceId → deviceName lookup
            const deviceMap = {};
            const devList = devicesResp?.data?.devices || devicesResp?.data || [];
            for (const d of (Array.isArray(devList) ? devList : [])) {
                if (d.deviceId) deviceMap[d.deviceId] = d.deviceName || d.deviceId;
            }

            const data = {
                alerts: alertsResp.data?.alerts || [],
                summary: summaryResp.success ? summaryResp.data : null,
            };

            this.setCache(data);
            this.setState({
                alerts: data.alerts,
                summary: data.summary,
                deviceMap,
                loading: false,
                isRefreshingInBackground: false,
                error: null,
            });
        } catch (err) {
            this.setState({ error: err.message, loading: false, isRefreshingInBackground: false });
        }
    }

    // ── Suppress / Reopen ─────────────────────────────────────────────────────

    openSuppressModal(alert) {
        this.setState({ suppressModal: { alert }, suppressReason: '', suppressDays: '30' });
    }

    closeSuppressModal() {
        this.setState({ suppressModal: null });
    }

    async confirmSuppress() {
        const { suppressModal, suppressReason, suppressDays } = this.state;
        if (!suppressModal) return;
        const alert = suppressModal.alert;
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId || auth.getUser()?.email;

        this.setState({ pendingRowKey: alert.alertRowKey });
        try {
            const body = {
                alertRowKey: alert.alertRowKey,
                suppressReason: suppressReason.trim() || 'Suppressed by user',
                suppressUntilDays: suppressDays === 'forever' ? null : parseInt(suppressDays, 10),
            };
            const resp = await api.suppressAlert(orgId, alert.deviceId, body);
            if (!resp.success) throw new Error(resp.message || 'Suppress failed');
            this.closeSuppressModal();
            // Invalidate cache and reload
            try { localStorage.removeItem(this._cacheKey()); } catch { /* ignore */ }
            await this.loadAlerts(true);
        } catch (err) {
            window.toast?.error?.(err.message || 'Failed to suppress alert');
        } finally {
            this.setState({ pendingRowKey: null });
        }
    }

    async reopenAlert(alert) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId || auth.getUser()?.email;
        this.setState({ pendingRowKey: alert.alertRowKey });
        try {
            const resp = await api.reopenAlert(orgId, alert.deviceId, { alertRowKey: alert.alertRowKey });
            if (!resp.success) throw new Error(resp.message || 'Reopen failed');
            try { localStorage.removeItem(this._cacheKey()); } catch { /* ignore */ }
            await this.loadAlerts(true);
        } catch (err) {
            window.toast?.error?.(err.message || 'Failed to reopen alert');
        } finally {
            this.setState({ pendingRowKey: null });
        }
    }

    // ── Bulk selection ─────────────────────────────────────────────────────────

    _alertKey(alert) { return `${alert.deviceId}|${alert.alertRowKey}`; }

    toggleAlert(alert) {
        const key = this._alertKey(alert);
        const next = new Set(this.state.selectedAlerts);
        if (next.has(key)) next.delete(key); else next.add(key);
        this.setState({ selectedAlerts: next });
    }

    toggleAll(filtered) {
        const openAlerts = filtered.filter(a => (a.state || '').toUpperCase() === 'OPEN');
        const allKeys = openAlerts.map(a => this._alertKey(a));
        const allSelected = allKeys.every(k => this.state.selectedAlerts.has(k));
        if (allSelected) {
            const next = new Set(this.state.selectedAlerts);
            allKeys.forEach(k => next.delete(k));
            this.setState({ selectedAlerts: next });
        } else {
            const next = new Set(this.state.selectedAlerts);
            allKeys.forEach(k => next.add(k));
            this.setState({ selectedAlerts: next });
        }
    }

    clearSelection() { this.setState({ selectedAlerts: new Set() }); }

    openBulkModal()  { this.setState({ bulkModal: true, suppressReason: '', suppressDays: '30' }); }
    closeBulkModal() { this.setState({ bulkModal: false }); }

    async confirmBulkSuppress() {
        const { selectedAlerts, suppressReason, suppressDays, alerts } = this.state;
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId || auth.getUser()?.email;

        const items = [...selectedAlerts].map(key => {
            const [deviceId, ...rkParts] = key.split('|');
            return { deviceId, alertRowKey: rkParts.join('|') };
        });
        if (items.length === 0) return;

        this.setState({ bulkLoading: true });
        try {
            const resp = await api.bulkSuppressAlerts(
                orgId, items,
                suppressReason.trim() || 'Bulk suppressed by user',
                suppressDays === 'forever' ? null : parseInt(suppressDays, 10)
            );
            if (!resp.success) throw new Error(resp.message || 'Bulk suppress failed');
            this.closeBulkModal();
            this.clearSelection();
            try { localStorage.removeItem(this._cacheKey()); } catch { /* ignore */ }
            await this.loadAlerts(true);
        } catch (err) {
            window.toast?.error?.(err.message || 'Bulk suppress failed');
        } finally {
            this.setState({ bulkLoading: false });
        }
    }


    // ── Inline MAGI panel ───────────────────────────────────────────────────

    askMagi(alert) {
        if (!orgContext.hasAddOn?.('MAGI')) {
            window.location.hash = '#!/upgrade?feature=MAGI';
            return;
        }

        // Cache-first: use static remediation templates for known alert categories.
        const cached = getAlertRemediationTemplate({
            ...alert,
            deviceName: this.state.deviceMap[alert.deviceId] || alert.deviceId
        });
        if (cached) {
            this.setState({
                magiAlert: alert,
                magiLoading: false,
                magiAnswer: cached,
                magiError: null,
                magiFromCache: true,
                magiFeedback: null,
            });
            return;
        }

        // Cache miss — fall back to MAGI AI
        this._askMagiAI(alert);
    }

    _askMagiAI(alert) {
        this.setState({ magiAlert: alert, magiLoading: true, magiAnswer: null, magiError: null, magiFromCache: false, magiFeedback: null });

        const deviceName = this.state.deviceMap[alert.deviceId] || alert.deviceId;
        const controlTitle = getAlertTitle(alert);
        const riskTag = getRiskTag(alert);
        const question =
            `I have a security alert on device "${deviceName}" (${alert.deviceId}):\n\n` +
            `**Control:** ${controlTitle}\n` +
            `**Domain:** ${alert.domain || 'Unknown'}\n` +
            `**Severity:** ${severityLabel(alert.severity)}\n` +
            (riskTag ? `**Risk category:** ${riskTag}\n` : '') +
            (shouldShowStateDetails(alert) && alert.expected ? `**Expected state:** ${alert.expected}\n` : '') +
            (shouldShowStateDetails(alert) && alert.actual ? `**Current state:**  ${fmtActual(alert.actual)}\n` : '') +
            (!shouldShowStateDetails(alert) ? `**Observed issue:** Cloud and device configuration are out-of-sync. Recommend updating the client and checking device/network connectivity before deeper troubleshooting.\n` : '') +
            `\nExplain likely causes, business impact if unresolved, and provide step-by-step remediation with a quick verification checklist.`;

        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ magiLoading: false, magiError: 'No organization selected' });
            return;
        }

        api.askAIAnalyst(orgId, {
            question,
            includeContext: true,
            context: { hint: 'alerts-page', route: '#!/alerts', source: 'alerts-ask-magi' }
        }).then(resp => {
            if (resp.success && resp.data?.answer) {
                this.setState({ magiAnswer: resp.data.answer, magiLoading: false });
            } else {
                this.setState({ magiError: resp.message || 'MAGI could not answer.', magiLoading: false });
            }
        }).catch(err => {
            this.setState({ magiError: err.message || 'Failed to contact MAGI.', magiLoading: false });
        });
    }

    closeMagiPanel() {
        this.setState({ magiAlert: null, magiAnswer: null, magiError: null, magiLoading: false, magiFromCache: false, magiFeedback: null });
    }

    submitMagiFeedback(vote) {
        this.setState({ magiFeedback: vote });
        // For AI-generated answers, send feedback to the backend
        if (!this.state.magiFromCache) {
            const org = orgContext.getCurrentOrg();
            if (org?.orgId) {
                api.askAIAnalyst(org.orgId, {
                    question: this.state.magiAlert?.controlName || this.state.magiAlert?.controlId || '',
                    action: vote === 'up' ? 'upvote' : 'downvote',
                    context: { hint: 'alerts-magi-feedback', controlId: this.state.magiAlert?.controlId }
                }).catch(() => {});
            }
        }
    }

    renderMagiPanel() {
        const { magiAlert, magiLoading, magiAnswer, magiError, magiFromCache, magiFeedback } = this.state;
        if (!magiAlert) return null;
        const deviceName = this.state.deviceMap[magiAlert.deviceId] || magiAlert.deviceId;
        const sevLabel = severityLabel(magiAlert.severity);
        const sevCol = severityColor(magiAlert.severity);
        const controlTitle = getAlertTitle(magiAlert);
        const riskTag = getRiskTag(magiAlert);

        const renderMarkdown = (text) => {
            if (!text) return '';
            if (window.marked) {
                const raw = window.marked.parse(text);
                return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
            }
            return text.replace(/\n/g, '<br>');
        };

        return html`
            <div class="modal modal-blur show d-block" tabIndex="-1" style="background:rgba(0,0,0,0.5);"
                 onClick=${e => e.target === e.currentTarget && this.closeMagiPanel()}>
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #6b5ce7, #8b5cf6); color: #fff;">
                            <div>
                                <h5 class="modal-title text-white mb-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler me-1" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" /><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" /></svg>
                                    MAGI Analysis
                                </h5>
                                <div class="small text-white-50 mt-1">${controlTitle}</div>
                            </div>
                            <button type="button" class="btn-close btn-close-white" onClick=${() => this.closeMagiPanel()}></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex flex-wrap gap-2 mb-3">
                                <span class="badge bg-${sevCol} text-white">${sevLabel}</span>
                                <span class="badge bg-secondary-lt text-secondary">${magiAlert.domain}</span>
                                ${riskTag ? html`<span class="badge bg-warning-lt text-warning">${riskTag}</span>` : ''}
                                <a href=${`#!/devices/${magiAlert.deviceId}`} class="badge bg-blue-lt text-blue text-decoration-none">${deviceName}</a>
                                ${magiFromCache ? html`<span class="badge bg-green-lt text-green">Instant answer</span>` : ''}
                            </div>
                            ${(shouldShowStateDetails(magiAlert) && (magiAlert.expected || magiAlert.actual)) ? html`
                                <div class="alert alert-info py-2 small mb-3">
                                    ${magiAlert.expected ? html`<div><strong>Expected:</strong> ${magiAlert.expected}</div>` : ''}
                                    ${magiAlert.actual   ? html`<div><strong>Current:</strong> ${fmtActual(magiAlert.actual)}</div>` : ''}
                                </div>
                            ` : isSyncControl(magiAlert) ? html`
                                <div class="alert alert-info py-2 small mb-3">
                                    <strong>Observed:</strong> Device and cloud fingerprints are out-of-sync. Ask the user to update the client, confirm the device is online, and verify internet connectivity so the latest telemetry can reach the service.
                                </div>
                            ` : ''}
                            ${magiLoading ? html`
                                <div class="d-flex align-items-center gap-3 py-4 justify-content-center">
                                    <div class="spinner-border text-purple"></div>
                                    <span class="text-muted">MAGI is analyzing this alert…</span>
                                </div>
                            ` : magiError ? html`
                                <div class="alert alert-danger">${magiError}</div>
                            ` : magiAnswer ? html`
                                <div class="magi-response" dangerouslySetInnerHTML=${{ __html: renderMarkdown(magiAnswer) }}></div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link link-secondary me-auto" onClick=${() => this.closeMagiPanel()}>Close</button>
                            <div class="d-flex align-items-center gap-2">
                                ${magiAnswer ? html`
                                    <span class="text-muted small me-1">Helpful?</span>
                                    <button class="btn btn-sm btn-icon ${magiFeedback === 'up' ? 'btn-success' : 'btn-outline-success'}"
                                            onClick=${() => this.submitMagiFeedback('up')}
                                            disabled=${!!magiFeedback}
                                            title="Helpful">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3" /></svg>
                                    </button>
                                    <button class="btn btn-sm btn-icon ${magiFeedback === 'down' ? 'btn-danger' : 'btn-outline-danger'}"
                                            onClick=${() => this.submitMagiFeedback('down')}
                                            disabled=${!!magiFeedback}
                                            title="Not helpful">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M7 13v-8a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v7a1 1 0 0 0 1 1h3a4 4 0 0 1 4 4v1a2 2 0 0 0 4 0v-5h3a2 2 0 0 0 2 -2l-1 -5a2 3 0 0 0 -2 -2h-7a3 3 0 0 0 -3 3" /></svg>
                                    </button>
                                ` : ''}
                                ${magiFromCache ? html`
                                    <button class="btn btn-outline-purple" onClick=${() => this._askMagiAI(magiAlert)}>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" /><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" /></svg>
                                        Ask MAGI
                                    </button>
                                ` : html`
                                    <a href=${`#!/analyst?q=${encodeURIComponent(controlTitle || magiAlert.controlId || '')}`} class="btn btn-outline-purple">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" /><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" /></svg>
                                        Open in MAGI
                                    </a>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ── Filtering helpers ─────────────────────────────────────────────────────

    getFiltered() {
        const { alerts, severityFilter, domainFilter, deviceFilter, sortBy, sortDir } = this.state;
        let result = alerts.filter(a => {
            if (severityFilter !== 'all' && severityLabel(a.severity) !== severityFilter) return false;
            if (domainFilter !== 'all' && (a.domain || '') !== domainFilter) return false;
            if (deviceFilter !== 'all' && a.deviceId !== deviceFilter) return false;
            return true;
        });
        if (sortBy === 'sla') {
            result = [...result].sort((a, b) => {
                const sa = slaInfo(a.severity, a.openedAt).daysLeft;
                const sb = slaInfo(b.severity, b.openedAt).daysLeft;
                return sortDir === 'asc' ? sa - sb : sb - sa;
            });
        }
        return result;
    }

    toggleSort(col) {
        const { sortBy, sortDir } = this.state;
        if (sortBy === col) {
            this.setState({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
        } else {
            this.setState({ sortBy: col, sortDir: 'asc' });
        }
    }

    toggleExpandedGroup(groupKey) {
        this.setState(prev => ({
            expandedGroups: {
                ...prev.expandedGroups,
                [groupKey]: !prev.expandedGroups[groupKey]
            }
        }));
    }

    inferVendorLabel(alert) {
        if ((alert?.domain || '').toLowerCase() === 'compliance') return 'Compliance';
        const title = getAlertTitle(alert);
        if (!title) return 'Unknown vendor';
        const words = title.split(/\s+/).filter(Boolean);
        return words.slice(0, Math.min(2, words.length)).join(' ') || 'Unknown vendor';
    }

    buildGroupedAlerts(filtered) {
        const { groupBy, deviceMap } = this.state;
        const groups = {};

        filtered.forEach(alert => {
            let key = '';
            let title = '';
            let subtitle = '';

            const appName = (alert.appName || '').trim();
            const appVendor = (alert.appVendor || '').trim();
            const appVersion = (alert.appVersion || '').trim();
            const deviceLabel = resolveDeviceLabel(alert.deviceId, deviceMap, alert.deviceId);
            const isVulnAppAlert = (alert.domain || '').toLowerCase() === 'vulnerability' && !!appName;

            if (groupBy === 'device') {
                key = alert.deviceId || 'unattributed-device';
                title = resolveDeviceLabel(alert.deviceId, deviceMap, 'Unattributed device');
                subtitle = title !== (alert.deviceId || '') ? alert.deviceId || 'Endpoint activity' : 'Endpoint activity';
            } else if (groupBy === 'vendor') {
                key = isVulnAppAlert ? (appVendor || 'Unknown vendor') : this.inferVendorLabel(alert);
                title = key;
                subtitle = `${alert.domain || 'Security'} signal cluster`;
            } else if (isVulnAppAlert) {
                key = `${appName}||${appVendor}||${appVersion}`;
                title = appName;
                subtitle = [appVendor, appVersion, deviceLabel].filter(Boolean).join(' · ');
            } else {
                key = `${getAlertTitle(alert)}||${alert.domain || 'domain'}`;
                title = getAlertTitle(alert);
                subtitle = `${alert.domain || 'Security'}${alert.deviceId ? ` · ${deviceLabel}` : ''}`;
            }

            if (!groups[key]) groups[key] = { key, title, subtitle, alerts: [] };
            groups[key].alerts.push(alert);
        });

        return Object.values(groups)
            .map(section => {
                const deviceIds = new Set(section.alerts.map(a => a.deviceId).filter(Boolean));
                const worstSeverity = section.alerts.reduce((max, a) => Math.max(max, Number(a.severity || 0)), 0);
                const newest = section.alerts
                    .map(a => new Date(a.openedAt || 0).getTime())
                    .sort((a, b) => b - a)[0] || 0;
                return {
                    ...section,
                    alertCount: section.alerts.length,
                    deviceCount: deviceIds.size || (groupBy === 'device' ? 1 : 0),
                    worstSeverity,
                    newest,
                    openCount: section.alerts.filter(a => (a.state || '').toUpperCase() === 'OPEN').length,
                };
            })
            .sort((a, b) => b.worstSeverity - a.worstSeverity || b.alertCount - a.alertCount || a.title.localeCompare(b.title));
    }

    renderGroupedSections(filtered) {
        const { groupBy, expandedGroups } = this.state;
        const sections = this.buildGroupedAlerts(filtered);

        if (sections.length === 0) {
            return this.renderTable(filtered);
        }

        return html`
            ${sections.map(section => {
                const tone = severityColor(section.worstSeverity);
                const groupKey = `alerts-${groupBy}-${String(section.key || section.title || 'group')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 80) || 'group'}`;
                const isOpen = !!expandedGroups[groupKey];

                return html`
                    <${CollapsibleSectionCard}
                        title=${section.title}
                        subtitle=${section.subtitle || ''}
                        meta=${`${formatSuspiciousCount(section.alertCount)} action item${section.alertCount === 1 ? '' : 's'} · ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'} · latest ${fmtDate(section.newest)}`}
                        badges=${[
                            { text: `${formatSuspiciousCount(section.openCount)} open`, className: `bg-${tone} text-white` },
                            { text: isOpen ? 'Collapse' : 'Expand', className: 'bg-secondary-lt text-secondary' }
                        ]}
                        accent=${tone}
                        isOpen=${isOpen}
                        onToggle=${() => this.toggleExpandedGroup(groupKey)}>
                        ${this.renderTable(section.alerts, true)}
                    </${CollapsibleSectionCard}>
                `;
            })}
        `;
    }

    // ── Render helpers ────────────────────────────────────────────────────────

    renderSummaryBar() {
        const { summary, alerts, stateFilter } = this.state;
        const open = summary?.totalOpen ?? alerts.filter(a => (a.state || '').toUpperCase() === 'OPEN').length;
        const suppressed = summary?.totalSuppressed ?? alerts.filter(a => (a.state || '').toUpperCase() === 'SUPPRESSED').length;
        // Backend summary now returns distinctControls + affectedDevices so the UI can
        // show "X distinct issues across Y devices" instead of an exposure-multiplied count.
        const distinctIssues = summary?.distinctControls ?? null;
        const affectedDevices = summary?.affectedDevices ?? null;
        const topControls = Array.isArray(summary?.topControls) ? summary.topControls : [];

        const visibleOpen = alerts.filter(a => (a.state || '').toUpperCase() === 'OPEN');
        const critical = visibleOpen.filter(a => Number(a.severity) === 4).length;
        const high = visibleOpen.filter(a => Number(a.severity) === 3).length;
        const medium = visibleOpen.filter(a => Number(a.severity) === 2).length;
        const low = visibleOpen.filter(a => Number(a.severity) <= 1).length;
        const needsAttentionNow = visibleOpen.filter(a => {
            const info = slaInfo(a.severity, a.openedAt);
            return Number.isFinite(info.daysLeft) && info.daysLeft <= 0;
        }).length;
        const dueSoon = visibleOpen.filter(a => {
            const info = slaInfo(a.severity, a.openedAt);
            return Number.isFinite(info.daysLeft) && info.daysLeft > 0 && info.daysLeft <= 3;
        }).length;
        const openedLast24h = visibleOpen.filter(a => {
            const openedAt = new Date(a.openedAt || 0).getTime();
            return Number.isFinite(openedAt) && (Date.now() - openedAt) <= 86_400_000;
        }).length;

        // Headline KPI: prefer "distinct issues" over raw exposure count when available.
        // Each distinct issue is one ControlId (e.g. "Chrome critical CVE") even if it
        // reaches many devices. Operators have ~controlCount things to fix, not totalOpen.
        const headlineValue = distinctIssues != null && distinctIssues > 0 ? distinctIssues : open;
        const headlineLabel = distinctIssues != null ? 'Distinct Issues' : 'Open Queue';
        const headlineSub = distinctIssues != null
            ? `${open.toLocaleString()} instance${open === 1 ? '' : 's'}${affectedDevices != null ? ` · ${affectedDevices} device${affectedDevices === 1 ? '' : 's'}` : ''}`
            : `${suppressed} suppressed`;

        const cards = [
            { label: headlineLabel, value: headlineValue.toLocaleString(), sub: headlineSub, tone: headlineValue > 0 ? 'danger' : 'success' },
            { label: 'Needs Attention Now', value: needsAttentionNow, sub: 'overdue or due today', tone: needsAttentionNow > 0 ? 'warning' : 'success' },
            { label: 'Due Soon', value: dueSoon, sub: 'next 3 days', tone: dueSoon > 0 ? 'warning' : 'secondary' },
            { label: 'New in 24h', value: openedLast24h, sub: 'recently opened', tone: openedLast24h > 0 ? 'info' : 'secondary' },
        ];

        return html`
            <div class="row row-cards mb-3">
                ${cards.map(card => html`
                    <div class="col-sm-6 col-lg-3">
                        <div class="card card-sm h-100">
                            <div class="card-body">
                                <div class="text-muted small text-uppercase">${card.label}</div>
                                <div class="d-flex align-items-baseline gap-2 mt-1">
                                    <div class="h2 mb-0 text-${card.tone}">${card.value}</div>
                                </div>
                                <div class="text-muted small mt-1">${card.sub}</div>
                            </div>
                        </div>
                    </div>
                `)}
            </div>
            <div class="card card-sm mb-3">
                <div class="card-body py-2 d-flex flex-wrap justify-content-between gap-2 align-items-center">
                    <div class="d-flex gap-2 flex-wrap align-items-center">
                        ${critical > 0 ? html`<span class="badge bg-danger text-white">${critical} critical in queue</span>` : ''}
                        ${high > 0 ? html`<span class="badge bg-warning text-white">${high} high</span>` : ''}
                        ${medium > 0 ? html`<span class="badge bg-info text-white">${medium} medium</span>` : ''}
                        ${low > 0 ? html`<span class="badge bg-secondary text-white">${low} low</span>` : ''}
                        ${rewindContext.isActive() ? html`<span class="badge bg-azure-lt text-azure">As of ${api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
                    </div>
                    <div class="text-muted small">
                        ${stateFilter === 'OPEN' && open > alerts.length
                            ? `Showing newest ${alerts.length} of ${open} open instances · grouped into ${distinctIssues ?? '—'} distinct issues for triage.`
                            : `Showing ${alerts.length} ${stateFilter === 'ALL' ? 'loaded' : stateFilter.toLowerCase()} action item${alerts.length === 1 ? '' : 's'}.`}
                    </div>
                </div>
            </div>
            ${topControls.length > 0 ? html`
                <div class="card card-sm mb-3">
                    <div class="card-body py-2">
                        <div class="text-muted small text-uppercase mb-2">Top issues by reach</div>
                        <div class="d-flex flex-wrap gap-2">
                            ${topControls.map(tc => html`
                                <span class="badge bg-secondary-lt text-secondary" title="${tc.controlId}">
                                    ${tc.controlId}: ${tc.affectedDevices} device${tc.affectedDevices === 1 ? '' : 's'} · ${tc.open} instance${tc.open === 1 ? '' : 's'}
                                </span>
                            `)}
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    }

    renderFilters() {
        const { stateFilter, severityFilter, domainFilter, deviceFilter, groupBy, alerts, deviceMap } = this.state;

        // Build unique domain values from loaded alerts
        const domains = [...new Set(alerts.map(a => a.domain).filter(Boolean))].sort();

        // Build device dropdown options from deviceMap, sorted by name
        const deviceEntries = Object.entries(deviceMap)
            .map(([id, name]) => ({ id, name: name || id }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return html`
            <div class="card mb-3">
                <div class="card-body py-3">
                    <div class="triage-filter-toolbar">
                        <div class="triage-filter-block">
                            <div class="triage-filter-label">State</div>
                            <${SegmentedControl}
                                options=${[
                                    { id: 'OPEN', label: 'Open' },
                                    { id: 'SUPPRESSED', label: 'Suppressed' },
                                    { id: 'ALL', label: 'All States' }
                                ]}
                                value=${stateFilter}
                                onChange=${value => this.setState({ stateFilter: value, alerts: [] }, () => this.loadAlerts(true))}
                            />
                        </div>
                        <div class="triage-filter-block">
                            <div class="triage-filter-label">Severity</div>
                            <${SegmentedControl}
                                options=${[
                                    { id: 'all', label: 'All' },
                                    { id: 'Critical', label: 'Critical' },
                                    { id: 'High', label: 'High' },
                                    { id: 'Medium', label: 'Medium' },
                                    { id: 'Low', label: 'Low' }
                                ]}
                                value=${severityFilter}
                                onChange=${value => this.setState({ severityFilter: value })}
                            />
                        </div>
                        <div class="triage-filter-block">
                            <div class="triage-filter-label">Group by</div>
                            <${SegmentedControl}
                                options=${[
                                    { id: 'application', label: 'Application' },
                                    { id: 'vendor', label: 'Vendor' },
                                    { id: 'device', label: 'Device' }
                                ]}
                                value=${groupBy}
                                onChange=${value => this.setState({ groupBy: value })}
                            />
                        </div>
                        <div class="triage-filter-block">
                            <div class="triage-filter-label">Domain</div>
                            <select class="form-select form-select-sm" style="min-width:160px;"
                                    value=${domainFilter}
                                    onChange=${e => this.setState({ domainFilter: e.target.value })}>
                                <option value="all">All Domains</option>
                                ${domains.map(d => html`<option value=${d}>${d}</option>`)}
                            </select>
                        </div>
                        ${deviceEntries.length > 1 ? html`
                            <div class="triage-filter-block">
                                <div class="triage-filter-label">Device</div>
                                <select class="form-select form-select-sm" style="min-width:200px;"
                                        value=${deviceFilter}
                                        onChange=${e => this.setState({ deviceFilter: e.target.value })}>
                                    <option value="all">All Devices (${deviceEntries.length})</option>
                                    ${deviceEntries.map(d => html`<option value=${d.id}>${d.name}</option>`)}
                                </select>
                            </div>
                        ` : ''}
                        <div class="ms-auto align-self-end">
                            <button class="btn btn-sm btn-icon btn-outline-secondary border-0" title="Legend" onClick=${() => this.setState({ showGlossary: true })}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 8l.01 0" /><path d="M11 12h1v4h1" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            ${this.state.showGlossary ? html`
                <div class="modal modal-blur show d-block" tabIndex="-1" style="background:rgba(0,0,0,0.5);"
                     onClick=${e => e.target === e.currentTarget && this.setState({ showGlossary: false })}>
                    <div class="modal-dialog modal-dialog-centered" style="max-width:440px;">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Alert Status Legend</h5>
                                <button type="button" class="btn-close" onClick=${() => this.setState({ showGlossary: false })}></button>
                            </div>
                            <div class="modal-body">
                                <table class="table table-sm table-borderless mb-0">
                                    <tbody>
                                        <tr><td class="text-danger fw-bold" style="width:110px">Disabled</td><td>Control is turned off and needs to be enabled</td></tr>
                                        <tr><td class="text-danger fw-bold">NonCompliant</td><td>Setting exists but doesn't meet the required standard</td></tr>
                                        <tr><td class="text-danger fw-bold">Not Verified</td><td>Agent could not read the setting — needs manual check</td></tr>
                                        <tr><td class="text-danger fw-bold">Insufficient</td><td>Value is below the minimum threshold</td></tr>
                                        <tr><td class="text-success fw-bold">Enabled</td><td>Control is active and meeting expectations</td></tr>
                                        <tr><td class="text-success fw-bold">Compliant</td><td>Policy or configuration meets all requirements</td></tr>
                                    </tbody>
                                </table>
                                <hr class="my-2" />
                                <div class="fw-bold mb-1">SLA by Severity</div>
                                <div class="d-flex flex-wrap gap-2">
                                    <span class="badge bg-danger text-white">Critical: 48h</span>
                                    <span class="badge bg-warning text-white">High: 7 days</span>
                                    <span class="badge bg-info text-white">Medium: 30 days</span>
                                    <span class="badge bg-secondary text-white">Low: 90 days</span>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onClick=${() => this.setState({ showGlossary: false })}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    }

    renderTable(filtered, nested = false) {
        const { pendingRowKey, stateFilter, selectedAlerts } = this.state;
        if (filtered.length === 0) {
            if (nested) return null;
            return html`
                <div class="empty">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M9 12l2 2l4 -4" /></svg>
                    </div>
                    <p class="empty-title">No alerts found</p>
                    <p class="empty-subtitle text-muted">
                        ${stateFilter === 'OPEN' ? 'No open alerts for your current filters. Your security posture looks good!' : 'No alerts match the selected filters.'}
                    </p>
                </div>
            `;
        }

        const openAlerts  = filtered.filter(a => (a.state || '').toUpperCase() === 'OPEN');
        const openKeys    = openAlerts.map(a => this._alertKey(a));
        const allSelected = openKeys.length > 0 && openKeys.every(k => selectedAlerts.has(k));
        const someSelected = openKeys.some(k => selectedAlerts.has(k));

        return html`
            ${nested ? html`` : html`<div class="card">`}
                <div class="table-responsive">
                    <table class="table table-vcenter card-table mb-0">
                        <thead>
                            <tr>
                                <th class="w-1">
                                    <input type="checkbox" class="form-check-input"
                                           checked=${allSelected}
                                           ref=${el => el && (el.indeterminate = someSelected && !allSelected)}
                                           onChange=${() => this.toggleAll(filtered)}
                                           title="Select all open alerts" />
                                </th>
                                <th>Domain / Severity</th>
                                <th>Alert</th>
                                <th>Device</th>
                                <th>Opened</th>
                                <th style="cursor:pointer;user-select:none;" onClick=${() => this.toggleSort('sla')} title="Sort by SLA">
                                    SLA ${this.state.sortBy === 'sla' ? (this.state.sortDir === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="w-1">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(alert => {
                                const sevLabel = severityLabel(alert.severity);
                                const sevCol   = severityColor(alert.severity);
                                const domCol   = domainColor(alert.domain);
                                const isPending = pendingRowKey === alert.alertRowKey;
                                const isSuppressed = (alert.state || '').toUpperCase() === 'SUPPRESSED';
                                const key = this._alertKey(alert);
                                const isChecked = selectedAlerts.has(key);

                                return html`
                                    <tr key=${alert.alertRowKey} class="${isSuppressed ? 'text-muted' : ''}">
                                        <td>
                                            ${!isSuppressed ? html`
                                                <input type="checkbox" class="form-check-input"
                                                       checked=${isChecked}
                                                       onChange=${() => this.toggleAlert(alert)} />
                                            ` : ''}
                                        </td>
                                        <td>
                                            <div class="d-flex flex-column gap-1">
                                                <span class="badge bg-${domCol}-lt text-${domCol}">${alert.domain || 'Unknown'}</span>
                                                <span class="badge bg-${sevCol} text-white">${sevLabel}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="font-weight-medium small">${getAlertTitle(alert)}</div>
                                            ${getRiskTag(alert) ? html`<div class="small text-muted mt-1"><span class="badge bg-warning-lt text-warning">${getRiskTag(alert)}</span></div>` : ''}
                                            ${(shouldShowStateDetails(alert) && (alert.expected || alert.actual)) ? html`
                                                <div class="small mt-1" style="max-width:360px;">
                                                    ${alert.expected ? html`<div class="text-success"><strong>Expected:</strong> ${alert.expected}</div>` : ''}
                                                    ${alert.actual ? html`<div class="text-danger"><strong>Current:</strong> ${fmtActual(alert.actual)}</div>` : ''}
                                                </div>
                                            ` : isSyncControl(alert) ? html`
                                                <div class="small mt-1 text-muted" style="max-width:360px;">
                                                    ${getSyncAlertGuidance()}
                                                </div>
                                            ` : ''}
                                            ${isSuppressed && alert.suppressReason ? html`
                                                <div class="text-muted small mt-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs me-1" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M12 8l0 4" /><path d="M12 16l.01 0" /></svg>
                                                    Suppressed: ${alert.suppressReason}
                                                    ${alert.suppressUntil ? html` · until ${fmtDate(alert.suppressUntil)}` : ''}
                                                </div>
                                            ` : ''}
                                            ${alert.domain === 'Vulnerability' && alert.controlId ? html`
                                                <a class="small text-muted" href=${'#!/cves/' + encodeURIComponent((alert.controlId || '').replace(/^VULN-/i, ''))}>
                                                    ${(alert.controlId || '').replace(/^VULN-/i, '')}
                                                </a>
                                            ` : ''}
                                        </td>
                                        <td>
                                            <a href=${`#!/devices/${alert.deviceId}`} class="small text-reset fw-medium">
                                                ${resolveDeviceLabel(alert.deviceId, this.state.deviceMap, alert.deviceId)}
                                            </a>
                                        </td>
                                        <td class="text-muted small">${fmtDate(alert.openedAt)}</td>
                                        <td>
                                            ${(() => {
                                                if (isSuppressed) return html`<span class="badge bg-warning-lt text-warning">Suppressed</span>`;
                                                const sla = slaInfo(alert.severity, alert.openedAt);
                                                return html`<span class="badge bg-${sla.color}-lt text-${sla.color} small">${sla.label}</span>`;
                                            })()}
                                        </td>
                                        <td>
                                            ${isPending
                                                ? html`<span class="spinner-border spinner-border-sm text-muted"></span>`
                                                : isSuppressed
                                                    ? html`<button class="btn btn-sm btn-outline-secondary" onClick=${() => this.reopenAlert(alert)} title="Reopen">Reopen</button>`
                                                    : html`
                                                                        <div class="d-flex gap-1 align-items-center">
                                                            <button class="btn btn-sm btn-primary" onClick=${() => { window.location.hash = '#!/devices/' + alert.deviceId; }} title="Go to device and resolve">
                                                                Resolve
                                                            </button>
                                                            <button class="btn btn-sm btn-icon btn-outline-warning" onClick=${() => this.openSuppressModal(alert)} title="Suppress">
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M17.28 9.05a5.5 5.5 0 1 0 -10.56 0" /><path d="M12 17.5v.5" /><path d="M3 3l18 18" /></svg>
                                                            </button>
                                                            <button class="btn btn-sm btn-icon" style="background:linear-gradient(135deg,#6b5ce7,#8b5cf6);color:#fff;" onClick=${() => this.askMagi(alert)} title="Ask MAGI">
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
                                                            </button>
                                                        </div>
                                                    `
                                            }
                                        </td>
                                    </tr>
                                `;
                            })}
                        </tbody>
                    </table>
                </div>
            ${nested ? html`` : html`</div>`}
        `;
    }

    renderBulkActionBar() {
        const { selectedAlerts, bulkLoading } = this.state;
        const count = selectedAlerts.size;
        if (count === 0) return null;
        return html`
            <div class="position-fixed bottom-0 start-50 translate-middle-x mb-4" style="z-index:1050;">
                <div class="card shadow-lg border-0" style="min-width:340px;">
                    <div class="card-body py-2 px-3 d-flex align-items-center gap-3">
                        <span class="badge bg-primary text-white me-1">${count}</span>
                        <span class="text-muted small">${count === 1 ? '1 alert' : `${count} alerts`} selected</span>
                        <div class="ms-auto d-flex gap-2">
                            <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.clearSelection()}>Clear</button>
                            <button class="btn btn-sm btn-warning" onClick=${() => this.openBulkModal()} disabled=${bulkLoading}>
                                Suppress ${count}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderBulkSuppressModal() {
        const { bulkModal, selectedAlerts, suppressReason, suppressDays, bulkLoading } = this.state;
        if (!bulkModal) return null;
        const count = selectedAlerts.size;
        return html`
            <div class="modal modal-blur show d-block" tabIndex="-1" style="background:rgba(0,0,0,0.5);"
                 onClick=${e => e.target === e.currentTarget && this.closeBulkModal()}>
                <div class="modal-dialog modal-dialog-centered" style="max-width:480px;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Bulk Suppress ${count} Alert${count !== 1 ? 's' : ''}</h5>
                            <button type="button" class="btn-close" onClick=${() => this.closeBulkModal()}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Suppress duration</label>
                                <div class="btn-group w-100" role="group">
                                    ${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['forever', 'Indefinitely']].map(([val, label]) => html`
                                        <input type="radio" class="btn-check" name="bulkSuppressDays" id=${'bsd-' + val} value=${val}
                                               checked=${suppressDays === val}
                                               onChange=${() => this.setState({ suppressDays: val })} />
                                        <label class="btn btn-sm btn-outline-secondary" for=${'bsd-' + val}>${label}</label>
                                    `)}
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label" for="bulk-suppress-reason">Reason <span class="text-muted">(optional)</span></label>
                                <textarea id="bulk-suppress-reason" class="form-control" rows="2"
                                          placeholder="e.g. Planned maintenance, mitigated by compensating control…"
                                          value=${suppressReason}
                                          onInput=${e => this.setState({ suppressReason: e.target.value })}>
                                </textarea>
                            </div>
                            <div class="alert alert-warning py-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>
                                This will suppress ${count} alert${count !== 1 ? 's' : ''}. They can be reopened individually.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link link-secondary me-auto" onClick=${() => this.closeBulkModal()}>Cancel</button>
                            <button type="button" class="btn btn-warning" onClick=${() => this.confirmBulkSuppress()} disabled=${bulkLoading}>
                                ${bulkLoading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                Suppress ${count} Alert${count !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSuppressModal() {
        const { suppressModal, suppressReason, suppressDays } = this.state;
        if (!suppressModal) return null;
        const alert = suppressModal.alert;
        const sevLabel = severityLabel(alert.severity);
        const sevCol   = severityColor(alert.severity);

        return html`
            <div class="modal modal-blur show d-block" tabIndex="-1" style="background:rgba(0,0,0,0.5);"
                 onClick=${e => e.target === e.currentTarget && this.closeSuppressModal()}>
                <div class="modal-dialog modal-dialog-centered" style="max-width:480px;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Suppress Alert</h5>
                            <button type="button" class="btn-close" onClick=${() => this.closeSuppressModal()}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <div class="d-flex gap-2 mb-2">
                                    <span class="badge bg-${sevCol} text-white">${sevLabel}</span>
                                    <span class="badge bg-secondary-lt text-secondary">${alert.domain}</span>
                                </div>
                                <div class="font-weight-medium">${getAlertTitle(alert)}</div>
                                ${getRiskTag(alert) ? html`<div class="text-muted small mt-1"><span class="badge bg-warning-lt text-warning">${getRiskTag(alert)}</span></div>` : ''}
                                ${(shouldShowStateDetails(alert) && alert.actual) ? html`<div class="text-muted small mt-1">${fmtActual(alert.actual)}</div>` : ''}
                                <div class="text-muted small mt-1">Device: ${this.state.deviceMap[alert.deviceId] || alert.deviceId}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Suppress duration</label>
                                <div class="btn-group w-100" role="group">
                                    ${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['forever', 'Indefinitely']].map(([val, label]) => html`
                                        <input type="radio" class="btn-check" name="suppressDays" id=${'sd-' + val} value=${val}
                                               checked=${suppressDays === val}
                                               onChange=${() => this.setState({ suppressDays: val })} />
                                        <label class="btn btn-sm btn-outline-secondary" for=${'sd-' + val}>${label}</label>
                                    `)}
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label" for="suppress-reason">Reason <span class="text-muted">(optional)</span></label>
                                <textarea id="suppress-reason" class="form-control" rows="2"
                                          placeholder="e.g. Known false positive, mitigated by compensating control…"
                                          value=${suppressReason}
                                          onInput=${e => this.setState({ suppressReason: e.target.value })}>
                                </textarea>
                            </div>

                            <div class="alert alert-warning alert-dismissible py-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>
                                Suppressed alerts will not re-fire until the suppression expires or you reopen them manually.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link link-secondary me-auto" onClick=${() => this.closeSuppressModal()}>Cancel</button>
                            <button type="button" class="btn btn-warning" onClick=${() => this.confirmSuppress()}>
                                Suppress Alert
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        const { loading, error, alerts, isRefreshingInBackground } = this.state;
        const filtered = this.getFiltered();

        if (loading && !alerts.length) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height:60vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error && !alerts.length) {
            return html`<div class="alert alert-danger m-3"><h4 class="alert-title">Error loading alerts</h4><div>${error}</div></div>`;
        }

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Action Items</h2>
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:12px;height:12px;"></span>
                                        Refreshing…
                                    </span>
                                ` : ''}
                            </div>
                            <p class="page-subtitle mt-1 mb-0">
                                Things that need your attention — prioritize what is urgent now, suppress known noise, or ask MAGI for help
                                ${rewindContext.isActive() ? html` · <span class="badge bg-azure-lt text-azure">As of ${api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
                            </p>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-primary" onClick=${() => this.loadAlerts(true)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    ${this.renderSummaryBar()}
                    ${this.renderFilters()}
                    <div class="text-muted small mb-2">${filtered.length} item${filtered.length !== 1 ? 's' : ''} shown</div>
                    ${this.renderGroupedSections(filtered)}
                </div>
            </div>

            ${this.renderBulkActionBar()}
            ${this.renderSuppressModal()}
            ${this.renderBulkSuppressModal()}
            ${this.renderMagiPanel()}
        `;
    }
}
