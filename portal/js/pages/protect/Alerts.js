/**
 * Alerts Page - Security and compliance alert tracking with suppress/reopen workflows
 *
 * Severity scale (backend int):
 *   4 = Critical, 3 = High, 2 = Medium, 1 = Low, 0 = Info
 *
 * Domain values are backend control families (Vulnerability, PatchManagement,
 * OS Hardening, Identity & Access, etc.). Route query lens=security/compliance
 * maps those backend domains into buyer-facing product lenses; legacy
 * domain=Compliance/Vulnerability routes are retained as compatibility aliases.
 *
 * SWR pattern: localStorage cache (10 min TTL) + background refresh
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { getAlertRemediationTemplate } from '../../data/compliance-remediation-cache.js';
import { metricPhrase, metricTitle } from '../../utils/metricUnits.js';
import { EvidenceBanner } from '../../components/shared/EvidenceBanner.js';
import { CollapsibleSectionCard, resolveDeviceLabel } from '../../components/shared/CommonComponents.js';

const { html, Component } = window;

const SEV_INT_MAP = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low', 0: 'Info' };
const SEV_COLOR   = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'secondary', Info: 'azure' };
const ALERT_LENS = Object.freeze({
    ALL: 'all',
    SECURITY: 'security',
    COMPLIANCE: 'compliance',
});
const SECURITY_ALERT_DOMAINS = new Set([
    'Antivirus',
    'DeviceHealth',
    'DeviceSync',
    'PatchManagement',
    'Software Security',
    'Threats',
    'Vulnerability',
]);
const LENS_COPY = Object.freeze({
    [ALERT_LENS.SECURITY]: {
        eyebrow: 'Protect',
        title: 'Security Alerts',
        subtitle: 'Exposures, missing patches, endpoint health, and software-risk signals that can become active incidents.',
        guideTitle: 'MAGI security triage guide',
    },
    [ALERT_LENS.COMPLIANCE]: {
        eyebrow: 'Comply',
        title: 'Compliance Alerts',
        subtitle: 'Control, policy, logging, identity, and audit-readiness gaps that need evidence or configuration closure.',
        guideTitle: 'MAGI compliance triage guide',
    },
    [ALERT_LENS.ALL]: {
        eyebrow: 'Action Queue',
        title: 'Action Items',
        subtitle: 'All open security and compliance work in one queue for cross-domain triage.',
        guideTitle: 'MAGI triage guide',
    },
});

const LENS_ROUTES = Object.freeze({
    [ALERT_LENS.SECURITY]: '#!/alerts/security',
    [ALERT_LENS.COMPLIANCE]: '#!/alerts/compliance',
    [ALERT_LENS.ALL]: '#!/alerts',
});

function defaultGroupByForLens(alertLens) {
    if (alertLens === ALERT_LENS.COMPLIANCE) return 'control';
    if (alertLens === ALERT_LENS.SECURITY) return 'bundle';
    return 'control';
}

function supportsGroupBy(alertLens, groupBy) {
    if (alertLens === ALERT_LENS.COMPLIANCE) return ['control', 'domain', 'device'].includes(groupBy);
    if (alertLens === ALERT_LENS.SECURITY) return ['bundle', 'control', 'application', 'vendor', 'device'].includes(groupBy);
    return ['control', 'domain', 'device'].includes(groupBy);
}

function normalizeDomKey(value) {
    return String(value || 'group')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'group';
}

function alertGroupDomKey(groupBy, key, title) {
    return `alerts-${groupBy}-${normalizeDomKey(key || title || 'group')}`;
}

function getLensRoute(alertLens) {
    return LENS_ROUTES[alertLens] || LENS_ROUTES[ALERT_LENS.ALL];
}

function normalizeBundleText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\b(?:x64|x86|arm64|en-us|update|updates|setup|installer)\b/g, ' ')
        .replace(/\b\d+(?:\.\d+){1,4}\b/g, ' ')
        .replace(/[^a-z0-9.+#]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function bundleTitleTokens(value) {
    const stopWords = new Set(['for', 'and', 'the', 'a', 'an', 'of', 'with', 'to', 'in', 'on', 'by']);
    return normalizeBundleText(value)
        .split(' ')
        .filter(token => token && !stopWords.has(token));
}

function formatBundleLabel(tokens) {
    const known = new Map([
        ['microsoft', 'Microsoft'],
        ['office', 'Office'],
        ['edge', 'Edge'],
        ['framework', 'Framework'],
        ['runtime', 'Runtime'],
        ['visual', 'Visual'],
        ['studio', 'Studio'],
        ['adobe', 'Adobe'],
        ['acrobat', 'Acrobat'],
        ['reader', 'Reader'],
        ['citrix', 'Citrix'],
    ]);
    return tokens.map(token => {
        if (token === '.net' || token === 'net') return '.NET';
        if (token === 'asp.net') return 'ASP.NET';
        if (token === 'c++') return 'C++';
        if (known.has(token)) return known.get(token);
        return token.length <= 3 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
    }).join(' ');
}

function inferKnownBundleLabel(titles, vendor) {
    const corpus = normalizeBundleText([vendor, ...titles].join(' '));
    const hasMicrosoft = corpus.includes('microsoft') || normalizeBundleText(vendor).includes('microsoft');
    const hasAdobe = corpus.includes('adobe') || normalizeBundleText(vendor).includes('adobe');

    if (hasMicrosoft && /\b(edge|webview2)\b/.test(corpus)) return 'Microsoft Edge';
    if (hasMicrosoft && /\b(office|microsoft 365|word|excel|powerpoint|outlook|onenote|access|publisher|proofing)\b/.test(corpus)) return 'Microsoft Office';
    if (hasMicrosoft && /\b(\.net|net framework)\b/.test(corpus)) return 'Microsoft .NET Framework';
    if (hasMicrosoft && /\b(visual studio|msbuild|visual c\+\+|vc\+\+)\b/.test(corpus)) return 'Microsoft Visual Studio';
    if (hasAdobe && /\b(acrobat|reader)\b/.test(corpus)) return 'Adobe Acrobat';

    return '';
}

function inferMajorityCommonTitle(titles) {
    const tokenRows = titles
        .map(title => bundleTitleTokens(title))
        .filter(tokens => tokens.length >= 2);
    if (tokenRows.length === 0) return '';

    const candidateCounts = new Map();
    tokenRows.forEach(tokens => {
        const maxLength = Math.min(tokens.length, 4);
        const seen = new Set();
        for (let length = 2; length <= maxLength; length += 1) {
            const key = tokens.slice(0, length).join(' ');
            if (seen.has(key)) continue;
            seen.add(key);
            candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
        }
    });

    const majority = Math.max(2, Math.ceil(tokenRows.length * 0.5));
    const ranked = [...candidateCounts.entries()]
        .filter(([, count]) => count >= majority)
        .sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length || a[0].localeCompare(b[0]));
    const [best] = ranked[0] || [];
    return best ? formatBundleLabel(best.split(' ')) : '';
}

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
    if (controlId === 'THREAT-DETECTION') {
        const [topThreat] = getThreatDetections(alert);
        return topThreat?.title ? `Active threat: ${topThreat.title}` : 'Active Threat Detection';
    }
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

    if (controlId === 'THREAT-DETECTION') return 'Active Malware';
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

function isThreatDetectionAlert(alert) {
    return (alert?.controlId || '').toUpperCase() === 'THREAT-DETECTION'
        || (alert?.alertType || '').toUpperCase() === 'THREAT'
        || (alert?.domain || '').toLowerCase() === 'threats';
}

function readAlertDetailJson(alert) {
    const detail = alert?.detailJson;
    if (!detail) return null;
    if (typeof detail === 'object') return detail;
    if (typeof detail !== 'string') return null;
    try { return JSON.parse(detail); }
    catch { return null; }
}

function getThreatDetections(alert) {
    const detail = readAlertDetailJson(alert);
    const detections = detail?.detections || detail?.Detections || [];
    return Array.isArray(detections) ? detections : [];
}

function threatField(detection, camel, pascal) {
    return detection?.[camel] ?? detection?.[pascal] ?? '';
}

function fmtThreatDate(value) {
    if (!value) return '';
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function renderThreatEvidence(alert) {
    if (!isThreatDetectionAlert(alert)) return null;
    const detections = getThreatDetections(alert);
    if (detections.length === 0) return null;
    const shown = detections.slice(0, 2);
    const more = detections.length - shown.length;

    return html`
        <div class="alerts-threat-evidence mt-2">
            ${shown.map(detection => {
                const title = threatField(detection, 'title', 'Title') || 'Unknown threat';
                const severity = threatField(detection, 'severity', 'Severity');
                const resource = threatField(detection, 'resource', 'Resource');
                const process = threatField(detection, 'process', 'Process');
                const detectedAt = fmtThreatDate(threatField(detection, 'detectedAt', 'DetectedAt'));
                const source = threatField(detection, 'source', 'Source');
                const origin = threatField(detection, 'origin', 'Origin');
                const threatId = threatField(detection, 'threatId', 'ThreatId');

                return html`
                    <div class="alerts-threat-evidence-item">
                        <div class="d-flex flex-wrap gap-1 align-items-center">
                            <span class="badge bg-danger text-white">${severity || 'Threat'}</span>
                            <span class="fw-semibold">${title}</span>
                            ${threatId ? html`<span class="text-muted small">ID ${threatId}</span>` : ''}
                        </div>
                        ${resource ? html`<div class="small text-muted text-break"><strong>File:</strong> ${resource}</div>` : ''}
                        ${process ? html`<div class="small text-muted text-break"><strong>Process:</strong> ${process}</div>` : ''}
                        ${(source || origin || detectedAt) ? html`
                            <div class="small text-muted">
                                ${source || 'Defender'}${origin ? ` - ${origin}` : ''}${detectedAt ? ` - ${detectedAt}` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            })}
            ${more > 0 ? html`<div class="small text-muted mt-1">+${more} more detection${more === 1 ? '' : 's'}</div>` : ''}
        </div>
    `;
}

function buildThreatEvidencePrompt(alert) {
    const detections = getThreatDetections(alert);
    if (!isThreatDetectionAlert(alert) || detections.length === 0) return '';
    const lines = detections.slice(0, 5).map((detection, index) => {
        const title = threatField(detection, 'title', 'Title') || 'Unknown threat';
        const severity = threatField(detection, 'severity', 'Severity') || 'Unknown severity';
        const resource = threatField(detection, 'resource', 'Resource') || 'Unknown file/resource';
        const process = threatField(detection, 'process', 'Process') || 'Unknown process';
        const source = threatField(detection, 'source', 'Source') || 'Defender';
        const detectedAt = threatField(detection, 'detectedAt', 'DetectedAt') || 'unknown time';
        return `${index + 1}. ${title} (${severity}) detected by ${source} at ${detectedAt}; resource: ${resource}; process: ${process}`;
    });
    return `\n**Defender evidence:**\n${lines.join('\n')}\n`;
}

function formatSuspiciousCount(count) {
    const numeric = Number(count) || 0;
    return numeric === 256 ? '256+' : String(numeric);
}

function hasLiveMagiAccess() {
    return orgContext.hasMagi?.() ?? orgContext.hasAddOn?.('MAGI') ?? false;
}

function isSecurityAlertDomain(domain) {
    return SECURITY_ALERT_DOMAINS.has(domain || '');
}

function isComplianceAlertDomain(domain) {
    return !!domain && !isSecurityAlertDomain(domain);
}

function getRouteAlertFilters() {
    const filters = { alertLens: ALERT_LENS.ALL, domainFilter: 'all' };
    try {
        const hash = window.location.hash || '';
        const rawHashPath = hash.startsWith('#!') ? hash.slice(2) : hash;
        const routePath = (rawHashPath.split('?')[0] || '').toLowerCase();
        const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
        const params = new URLSearchParams(query);
        const lens = (params.get('lens') || '').toLowerCase();
        const domainParam = params.get('domain') || '';
        const normalizedDomain = domainParam.toLowerCase();
        if (routePath === '/alerts/security') {
            filters.alertLens = ALERT_LENS.SECURITY;
        } else if (routePath === '/alerts/compliance') {
            filters.alertLens = ALERT_LENS.COMPLIANCE;
        } else if (lens === ALERT_LENS.SECURITY || lens === ALERT_LENS.COMPLIANCE || lens === ALERT_LENS.ALL) {
            filters.alertLens = lens;
        } else if (normalizedDomain === 'vulnerability' || normalizedDomain === 'security') {
            filters.alertLens = ALERT_LENS.SECURITY;
        } else if (normalizedDomain === 'compliance') {
            filters.alertLens = ALERT_LENS.COMPLIANCE;
        } else if (domainParam) {
            filters.domainFilter = domainParam;
            filters.alertLens = isSecurityAlertDomain(domainParam) ? ALERT_LENS.SECURITY : ALERT_LENS.COMPLIANCE;
        }
    } catch {
        // Ignore malformed hash query strings and fall back to all alerts.
    }
    return filters;
}

function lensMatchesAlert(alert, alertLens) {
    if (alertLens === ALERT_LENS.SECURITY) return isSecurityAlertDomain(alert?.domain || '');
    if (alertLens === ALERT_LENS.COMPLIANCE) return isComplianceAlertDomain(alert?.domain || '');
    return true;
}

function getLensCopy(alertLens) {
    return LENS_COPY[alertLens] || LENS_COPY[ALERT_LENS.ALL];
}

// SLA deadlines by severity (days from openedAt)
const SLA_DAYS = { 4: 2, 3: 7, 2: 30, 1: 90 };  // Critical=2d, High=7d, Medium=30d, Low=90d

function slaInfo(severity, openedAt, referenceDate = new Date()) {
    const slaDays = SLA_DAYS[severity];
    if (!slaDays || !openedAt) return { label: '—', color: 'secondary', daysLeft: Infinity };
    const opened = new Date(openedAt);
    const deadline = new Date(opened.getTime() + slaDays * 86400000);
    const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const daysLeft = Math.ceil((deadline - now) / 86400000);
    if (daysLeft < 0) return { label: `${Math.abs(daysLeft)}d overdue`, color: 'danger', daysLeft };
    if (daysLeft === 0) return { label: 'Due today', color: 'danger', daysLeft };
    if (daysLeft <= 3) return { label: `${daysLeft}d left`, color: 'warning', daysLeft };
    return { label: `${daysLeft}d left`, color: 'secondary', daysLeft };
}

export class AlertsPage extends Component {
    constructor(props) {
        super(props);
        const routeFilters = getRouteAlertFilters();
        const initialLens = props?.forcedLens || routeFilters.alertLens;
        this.state = {
            loading: true,
            error: null,
            alerts: [],
            summary: null,
            deviceMap: {},          // deviceId → deviceName
            stateFilter: 'OPEN',
            severityFilter: 'all',
            alertLens: initialLens,
            domainFilter: routeFilters.domainFilter,
            deviceFilter: 'all',        // 'all' or deviceId
            groupBy: defaultGroupByForLens(initialLens),
            expandedGroups: {},
            focusedIssueKey: null,
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
            magiLiveLocked: false,
            magiFeedback: null,     // 'up' | 'down' | null

            // Glossary popover
            showGlossary: false,

            // Sort
            sortBy: null,           // 'sla' | null
            sortDir: 'asc',
        };
        this.orgUnsubscribe = null;
        this._rewindUnsub = null;
        this._hashChangeHandler = () => this.syncDomainFilterFromRoute();
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadAlerts());
        this._rewindUnsub = rewindContext.onChange(() => this.loadAlerts());
        window.addEventListener('hashchange', this._hashChangeHandler);
        this.loadAlerts();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this._rewindUnsub) this._rewindUnsub();
        window.removeEventListener('hashchange', this._hashChangeHandler);
    }

    syncDomainFilterFromRoute() {
        if (!window.location.hash.startsWith('#!/alerts')) return;
        const routeFilters = getRouteAlertFilters();
        const nextLens = this.props?.forcedLens || routeFilters.alertLens;
        if (routeFilters.alertLens !== this.state.alertLens || routeFilters.domainFilter !== this.state.domainFilter) {
            this.setState(prev => {
                const nextGroupBy = supportsGroupBy(nextLens, prev.groupBy)
                    ? prev.groupBy
                    : defaultGroupByForLens(nextLens);
                return {
                    alertLens: nextLens,
                    domainFilter: routeFilters.domainFilter,
                    groupBy: nextGroupBy,
                    expandedGroups: {},
                    focusedIssueKey: null,
                };
            });
        }
    }

    setAlertLens(alertLens) {
        const nextHash = getLensRoute(alertLens);
        if (window.location.hash !== nextHash) {
            window.location.hash = nextHash;
            return;
        }
        this.setState(prev => {
            const nextGroupBy = supportsGroupBy(alertLens, prev.groupBy)
                ? prev.groupBy
                : defaultGroupByForLens(alertLens);
            return { alertLens, domainFilter: 'all', groupBy: nextGroupBy, expandedGroups: {}, focusedIssueKey: null };
        });
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
                    deviceMap: cached.data.deviceMap || {},
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
            const [alertsResp, summaryResp, devicesResp, evidenceResp] = await Promise.all([
                api.getAlerts(orgId, { state: this.state.stateFilter, limit: 500 }),
                api.getAlertSummary(orgId),
                api.getDevices(orgId),
                rewindContext.isActive?.()
                    ? api.getPageBundle(orgId, 'alerts', { include: 'summary' })
                    : Promise.resolve(null),
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
                evidence: evidenceResp?.success ? (evidenceResp.data?.evidence || null) : null,
                deviceMap,
            };

            this.setCache(data);
            this.setState({
                alerts: data.alerts,
                summary: data.summary,
                evidence: data.evidence,
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
                magiLiveLocked: false,
                magiFeedback: null,
            });
            return;
        }

        if (!hasLiveMagiAccess()) {
            this.setState({
                magiAlert: alert,
                magiLoading: false,
                magiAnswer: null,
                magiError: 'Static guidance is not available for this alert yet. Live MAGI chat requires the MAGI entitlement.',
                magiFromCache: false,
                magiLiveLocked: true,
                magiFeedback: null,
            });
            return;
        }

        // Cache miss — fall back to MAGI AI
        this._askMagiAI(alert);
    }

    _askMagiAI(alert) {
        if (!hasLiveMagiAccess()) {
            this.setState({
                magiAlert: alert,
                magiLoading: false,
                magiAnswer: null,
                magiError: 'Live MAGI chat requires the MAGI entitlement.',
                magiFromCache: false,
                magiLiveLocked: true,
                magiFeedback: null,
            });
            return;
        }

        this.setState({ magiAlert: alert, magiLoading: true, magiAnswer: null, magiError: null, magiFromCache: false, magiLiveLocked: false, magiFeedback: null });

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
            buildThreatEvidencePrompt(alert) +
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
        this.setState({ magiAlert: null, magiAnswer: null, magiError: null, magiLoading: false, magiFromCache: false, magiLiveLocked: false, magiFeedback: null });
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
        const { magiAlert, magiLoading, magiAnswer, magiError, magiFromCache, magiFeedback, magiLiveLocked } = this.state;
        if (!magiAlert) return null;
        const hasLiveMagi = hasLiveMagiAccess();
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
                                    ${hasLiveMagi ? html`
                                    <button class="btn btn-outline-purple" onClick=${() => this._askMagiAI(magiAlert)}>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" /><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" /></svg>
                                        Ask MAGI
                                    </button>
                                    ` : html`
                                        <button class="btn btn-outline-secondary" disabled title="Live MAGI chat requires the MAGI entitlement">
                                            <i class="ti ti-lock me-1"></i>Live MAGI locked
                                        </button>
                                        <a class="btn btn-outline-purple" href="#!/upgrade?feature=MAGI">Unlock MAGI</a>
                                    `}
                                ` : html`
                                    ${hasLiveMagi ? html`
                                    <a href=${`#!/analyst?q=${encodeURIComponent(controlTitle || magiAlert.controlId || '')}`} class="btn btn-outline-purple">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" /><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" /></svg>
                                        Open in MAGI
                                    </a>
                                    ` : html`
                                        <a class="btn btn-outline-purple ${magiLiveLocked ? '' : ''}" href="#!/upgrade?feature=MAGI">
                                            <i class="ti ti-lock me-1"></i>Unlock live MAGI
                                        </a>
                                    `}
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ── Filtering helpers ─────────────────────────────────────────────────────

    getReferenceDate() {
        return rewindContext.getReferenceDate?.() || new Date();
    }

    getFiltered() {
        const { alerts, severityFilter, alertLens, domainFilter, deviceFilter, sortBy, sortDir } = this.state;
        let result = alerts.filter(a => {
            if (severityFilter !== 'all' && severityLabel(a.severity) !== severityFilter) return false;
            if (!lensMatchesAlert(a, alertLens)) return false;
            if (domainFilter !== 'all' && (a.domain || '') !== domainFilter) return false;
            if (deviceFilter !== 'all' && a.deviceId !== deviceFilter) return false;
            return true;
        });
        if (sortBy === 'sla') {
            const referenceDate = this.getReferenceDate();
            result = [...result].sort((a, b) => {
                const sa = slaInfo(a.severity, a.openedAt, referenceDate).daysLeft;
                const sb = slaInfo(b.severity, b.openedAt, referenceDate).daysLeft;
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

    focusPriorityIssue(issue, askMagi = false) {
        if (!issue) return;
        const groupBy = 'control';
        const groupKey = alertGroupDomKey(groupBy, issue.key, issue.title);
        this.setState(prev => ({
            domainFilter: issue.domain || 'all',
            severityFilter: 'all',
            groupBy,
            focusedIssueKey: issue.key,
            expandedGroups: {
                ...prev.expandedGroups,
                [groupKey]: true,
            },
        }), () => {
            const scrollToTarget = () => {
                const target = document.querySelector(`[data-alert-group-key="${groupKey}"]`) || document.querySelector('.alerts-datagrid-card');
                target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(scrollToTarget);
            } else {
                setTimeout(scrollToTarget, 0);
            }
            if (askMagi && issue.sampleAlert) {
                this.askMagi(issue.sampleAlert);
            }
        });
    }

    inferVendorLabel(alert) {
        if ((alert?.domain || '').toLowerCase() === 'compliance') return 'Compliance';
        const title = getAlertTitle(alert);
        if (!title) return 'Unknown vendor';
        const words = title.split(/\s+/).filter(Boolean);
        return words.slice(0, Math.min(2, words.length)).join(' ') || 'Unknown vendor';
    }

    deriveSecurityBundle(alert) {
        const appName = (alert?.appName || '').trim();
        const appVendor = (alert?.appVendor || '').trim();
        const appVersion = (alert?.appVersion || '').trim();
        const title = getAlertTitle(alert);
        const vendorOrFamily = appVendor || this.inferVendorLabel(alert) || appName || title || 'Unknown software';

        if (appVersion) {
            return {
                key: `${vendorOrFamily}||${appVersion}`,
                title: `${vendorOrFamily} ${appVersion}`,
                subtitle: 'Vendor/version bundle',
            };
        }

        if (appName || appVendor) {
            return {
                key: `${appVendor || 'Unknown vendor'}||${appName || 'Unknown application'}`,
                title: appName || appVendor || 'Unknown software',
                subtitle: appVendor ? `${appVendor} application family` : 'Application family',
            };
        }

        return {
            key: `${title}||${alert?.domain || 'security'}`,
            title,
            subtitle: `${alert?.domain || 'Security'} signal bundle`,
        };
    }

    inferSecurityBundleIdentity(alerts, section) {
        const titles = alerts
            .map(alert => (alert.appName || '').trim())
            .filter(Boolean);
        const vendors = alerts
            .map(alert => (alert.appVendor || '').trim())
            .filter(Boolean);
        const versions = alerts
            .map(alert => (alert.appVersion || '').trim())
            .filter(Boolean);
        const vendor = vendors.sort((a, b) => vendors.filter(x => x === b).length - vendors.filter(x => x === a).length)[0] || '';
        const version = versions.sort((a, b) => versions.filter(x => x === b).length - versions.filter(x => x === a).length)[0] || '';
        const knownLabel = inferKnownBundleLabel(titles, vendor);
        const commonLabel = knownLabel || inferMajorityCommonTitle(titles);
        const fallbackTitle = section.title || [vendor, version].filter(Boolean).join(' ') || 'Software bundle';

        if (commonLabel) {
            return {
                title: version ? `${commonLabel} ${version}` : commonLabel,
                subtitle: knownLabel ? 'Recognized software bundle' : 'Majority-title bundle',
            };
        }

        return {
            title: fallbackTitle,
            subtitle: titles.length > 1 ? 'Shared vendor/version cluster' : section.subtitle || 'Vendor/version bundle',
        };
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

            if (groupBy === 'bundle') {
                const bundle = this.deriveSecurityBundle(alert);
                key = bundle.key;
                title = bundle.title;
                subtitle = bundle.subtitle;
            } else if (groupBy === 'device') {
                key = alert.deviceId || 'unattributed-device';
                title = resolveDeviceLabel(alert.deviceId, deviceMap, 'Unattributed device');
                subtitle = title !== (alert.deviceId || '') ? alert.deviceId || 'Endpoint activity' : 'Endpoint activity';
            } else if (groupBy === 'domain') {
                key = alert.domain || 'Unknown domain';
                title = key;
                subtitle = 'Control family';
            } else if (groupBy === 'control') {
                key = alert.controlId || `${getAlertTitle(alert)}||${alert.domain || 'domain'}`;
                title = getAlertTitle(alert);
                subtitle = `${alert.domain || 'Compliance'}${alert.controlId ? ` · ${alert.controlId}` : ''}`;
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
                const bundleIdentity = groupBy === 'bundle'
                    ? this.inferSecurityBundleIdentity(section.alerts, section)
                    : null;
                const deviceIds = new Set(section.alerts.map(a => a.deviceId).filter(Boolean));
                const primaryAlert = section.alerts
                    .slice()
                    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))[0] || null;
                const primaryDeviceName = primaryAlert?.deviceId
                    ? resolveDeviceLabel(primaryAlert.deviceId, deviceMap, primaryAlert.deviceId)
                    : null;
                const worstSeverity = section.alerts.reduce((max, a) => Math.max(max, Number(a.severity || 0)), 0);
                const newest = section.alerts
                    .map(a => new Date(a.openedAt || 0).getTime())
                    .sort((a, b) => b - a)[0] || 0;
                return {
                    ...section,
                    title: bundleIdentity?.title || section.title,
                    subtitle: bundleIdentity?.subtitle || section.subtitle,
                    alertCount: section.alerts.length,
                    deviceCount: deviceIds.size || (groupBy === 'device' ? 1 : 0),
                    primaryDeviceName,
                    worstSeverity,
                    newest,
                    openCount: section.alerts.filter(a => (a.state || '').toUpperCase() === 'OPEN').length,
                };
            })
            .sort((a, b) => b.worstSeverity - a.worstSeverity || b.alertCount - a.alertCount || a.title.localeCompare(b.title));
    }

    buildIssueRollups(alerts) {
        const issueMap = new Map();
        alerts.forEach(alert => {
            const key = alert.controlId || `${getAlertTitle(alert)}|${alert.domain || 'domain'}`;
            if (!issueMap.has(key)) {
                issueMap.set(key, {
                    key,
                    title: getAlertTitle(alert),
                    domain: alert.domain || 'Unknown',
                    severity: Number(alert.severity || 0),
                    open: 0,
                    total: 0,
                    devices: new Set(),
                    alerts: [],
                    sampleAlert: alert,
                    newest: 0,
                });
            }
            const issue = issueMap.get(key);
            issue.total += 1;
            issue.alerts.push(alert);
            if ((alert.state || '').toUpperCase() === 'OPEN') issue.open += 1;
            issue.severity = Math.max(issue.severity, Number(alert.severity || 0));
            if (Number(alert.severity || 0) >= Number(issue.sampleAlert?.severity || 0)) {
                issue.sampleAlert = alert;
            }
            if (alert.deviceId) issue.devices.add(alert.deviceId);
            const openedAt = new Date(alert.openedAt || 0).getTime();
            if (Number.isFinite(openedAt)) issue.newest = Math.max(issue.newest, openedAt);
        });
        return Array.from(issueMap.values())
            .map(issue => ({
                ...issue,
                deviceCount: issue.devices.size,
            }))
            .sort((a, b) => b.severity - a.severity || b.open - a.open || b.deviceCount - a.deviceCount || a.title.localeCompare(b.title));
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
                const groupKey = alertGroupDomKey(groupBy, section.key, section.title);
                const isOpen = !!expandedGroups[groupKey];

                return html`
                    <div data-alert-group-key=${groupKey} class=${this.state.focusedIssueKey === section.key ? 'alerts-focused-group' : ''}>
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
                    </div>
                `;
            })}
        `;
    }

    // ── Render helpers ────────────────────────────────────────────────────────

    renderSummaryBar(filtered) {
        const { summary, stateFilter, alertLens } = this.state;
        const scopedAlerts = filtered || [];
        const open = scopedAlerts.filter(a => (a.state || '').toUpperCase() === 'OPEN').length;
        const suppressed = scopedAlerts.filter(a => (a.state || '').toUpperCase() === 'SUPPRESSED').length;
        const isHistoricalSummary = summary?.isHistoricalSnapshot === true;
        const isCappedSummary = summary?.isCapped === true;
        const capturedOpen = Number(summary?.capturedOpen ?? scopedAlerts.length);
        const issueRollups = this.buildIssueRollups(scopedAlerts);
        const distinctIssues = issueRollups.length;
        const affectedDevices = new Set(scopedAlerts.map(a => a.deviceId).filter(Boolean)).size;
        const lensMeta = getLensCopy(alertLens);

        const visibleOpen = scopedAlerts.filter(a => (a.state || '').toUpperCase() === 'OPEN');
        const referenceDate = this.getReferenceDate();
        const referenceTime = referenceDate.getTime();
        const critical = visibleOpen.filter(a => Number(a.severity) === 4).length;
        const high = visibleOpen.filter(a => Number(a.severity) === 3).length;
        const medium = visibleOpen.filter(a => Number(a.severity) === 2).length;
        const low = visibleOpen.filter(a => Number(a.severity) <= 1).length;
        const needsAttentionNow = visibleOpen.filter(a => {
            const info = slaInfo(a.severity, a.openedAt, referenceDate);
            return Number.isFinite(info.daysLeft) && info.daysLeft <= 0;
        }).length;
        const dueSoon = visibleOpen.filter(a => {
            const info = slaInfo(a.severity, a.openedAt, referenceDate);
            return Number.isFinite(info.daysLeft) && info.daysLeft > 0 && info.daysLeft <= 3;
        }).length;
        const openedLast24h = visibleOpen.filter(a => {
            const openedAt = new Date(a.openedAt || 0).getTime();
            return Number.isFinite(openedAt) && openedAt <= referenceTime && (referenceTime - openedAt) <= 86_400_000;
        }).length;

        // Headline KPI: prefer "distinct issues" over raw exposure count when available.
        // Each distinct issue is one ControlId (e.g. "Chrome critical CVE") even if it
        // reaches many devices. Operators have ~controlCount things to fix, not totalOpen.
        const headlineValue = distinctIssues > 0 ? distinctIssues : open;
        const headlineLabel = metricTitle('distinctIssues');
        const headlineSub = `${metricPhrase('openAlertInstances', open)} · ${metricPhrase('affectedDevices', affectedDevices)}`;

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
                        ${critical > 0 ? html`<span class="badge bg-danger-lt text-danger">${critical} critical in queue</span>` : ''}
                        ${high > 0 ? html`<span class="badge bg-warning-lt text-warning">${high} high</span>` : ''}
                        ${medium > 0 ? html`<span class="badge bg-info-lt text-info">${medium} medium</span>` : ''}
                        ${low > 0 ? html`<span class="badge bg-secondary-lt text-secondary">${low} low</span>` : ''}
                        ${rewindContext.isActive() ? html`<span class="badge bg-azure-lt text-azure">As of ${rewindContext.getDateLabel?.() || api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
                    </div>
                    <div class="text-muted small">
                        ${isHistoricalSummary && isCappedSummary
                            ? `Historical report captured ${metricPhrase('openAlertInstances', capturedOpen)} as row-level samples of ${metricPhrase('openAlertInstances', open)}; the remaining count is aggregate-only.`
                            : `${lensMeta.title}: ${scopedAlerts.length} ${stateFilter === 'ALL' ? 'loaded' : stateFilter.toLowerCase()} action item${scopedAlerts.length === 1 ? '' : 's'}${suppressed > 0 ? ` · ${suppressed} suppressed in this view` : ''}.`}
                    </div>
                </div>
            </div>
        `;
    }

    renderQueueBrief(filtered) {
        const lensMeta = getLensCopy(this.state.alertLens);
        const open = filtered.filter(a => (a.state || '').toUpperCase() === 'OPEN').length;
        const issueRollups = this.buildIssueRollups(filtered);
        const topIssues = issueRollups.slice(0, 5);
        const distinct = issueRollups.length;
        const affected = new Set(filtered.map(a => a.deviceId).filter(Boolean)).size;
        const primaryIssue = topIssues[0] || null;
        const nextAction = primaryIssue
            ? `Open ${primaryIssue.title}, clear the highest-reach rows, then ask MAGI for the exact evidence trail before suppression or closure.`
            : 'No open action cluster needs attention in the current filter.';
        const lensStatement = this.state.alertLens === ALERT_LENS.COMPLIANCE
            ? 'MAGI is treating this as audit risk, not vulnerability volume. The goal is to remove the blockers that would make evidence look incomplete, stale, or untrustworthy.'
            : this.state.alertLens === ALERT_LENS.SECURITY
            ? 'MAGI is treating this as attack surface. The goal is to collapse exploitable software bundles, missing patches, and endpoint-defense gaps before they become incident paths.'
            : 'MAGI is reading this as the full action queue across protection and compliance work.';
        const scopeStatement = this.state.alertLens === ALERT_LENS.COMPLIANCE
            ? 'CVE and patch-noise is excluded here; broad control failures and evidence blockers stay visible.'
            : this.state.alertLens === ALERT_LENS.SECURITY
            ? 'Audit-control gaps are excluded here; protection signals are grouped bundle-first so shared vendor/version exposure is easier to close once.'
            : 'Both security exposure and compliance-control domains are included in this blended view.';
        const pressureStatement = primaryIssue
            ? `${primaryIssue.title} is the current pressure point: ${metricPhrase('openAlertInstances', primaryIssue.open)} across ${metricPhrase('affectedDevices', primaryIssue.deviceCount)}.`
            : `${lensMeta.title} has no open pressure point in the current filters.`;

        return html`
            <div class="card alerts-queue-brief mb-3">
                <div class="card-header align-items-center">
                    <div>
                        <div class="subheader">Queue brief</div>
                        <h3 class="card-title mb-0">${lensMeta.title} workbench</h3>
                    </div>
                    <div class="ms-auto d-flex flex-wrap gap-2 align-items-center">
                        <span class="badge bg-azure-lt text-azure">${rewindContext.isActive() ? 'Historical evidence' : 'Live evidence'}</span>
                        <span class="badge bg-secondary-lt text-secondary">${metricPhrase('distinctIssues', distinct)}</span>
                        <span class="badge bg-secondary-lt text-secondary">${metricPhrase('affectedDevices', affected)}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="alerts-queue-brief-grid">
                        <div class="alerts-priority-panel">
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <div>
                                    <div class="text-muted small text-uppercase fw-semibold">Priority stack</div>
                                    <div class="small text-muted">Sorted by severity, open count, and affected devices</div>
                                </div>
                                <span class="badge bg-primary text-white">${metricPhrase('openAlertInstances', open)}</span>
                            </div>
                            ${topIssues.length > 0 ? html`
                                <div class="table-responsive alerts-priority-table-wrap">
                                    <table class="table table-sm table-vcenter mb-0 alerts-priority-table">
                                        <thead>
                                            <tr>
                                                <th>Issue</th>
                                                <th>Family</th>
                                                <th class="text-end">Reach</th>
                                                <th class="text-end">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${topIssues.map(issue => {
                                                const tone = severityColor(issue.severity);
                                                return html`
                                                    <tr data-priority-clickable="true" onClick=${() => this.focusPriorityIssue(issue)}>
                                                        <td>
                                                            <div class="fw-semibold text-truncate" title=${issue.title}>${issue.title}</div>
                                                            <div class="small text-muted">${issue.key}</div>
                                                        </td>
                                                        <td><span class="badge bg-${domainColor(issue.domain)}-lt text-${domainColor(issue.domain)}">${issue.domain}</span></td>
                                                        <td class="text-end">
                                                            <div><span class="badge bg-${tone} text-white">${severityLabel(issue.severity)}</span></div>
                                                            <div class="small text-muted mt-1">${issue.open} open · ${issue.deviceCount} device${issue.deviceCount === 1 ? '' : 's'}</div>
                                                        </td>
                                                        <td class="text-end">
                                                            <div class="alerts-priority-actions" onClick=${event => event.stopPropagation()}>
                                                                <button class="btn btn-sm btn-outline-primary" onClick=${() => this.focusPriorityIssue(issue)}>View</button>
                                                                <button class="btn btn-sm btn-outline-purple" disabled=${!issue.sampleAlert} title=${issue.sampleAlert ? 'Ask MAGI about this issue' : 'No representative alert available'} onClick=${() => this.focusPriorityIssue(issue, true)}>
                                                                    MAGI
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                `;
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ` : html`
                                <div class="empty py-3">
                                    <p class="empty-title mb-1">No priority stack</p>
                                    <p class="empty-subtitle text-muted mb-0">No open work in this lens and filter set.</p>
                                </div>
                            `}
                        </div>
                        <div class="alerts-magi-read-panel">
                            <div class="d-flex align-items-center gap-2 mb-2">
                                <span class="avatar avatar-sm bg-purple-lt text-purple">M</span>
                                <div>
                                    <div class="text-muted small text-uppercase fw-semibold">MAGI read</div>
                                    <div class="fw-semibold">${lensMeta.title} context</div>
                                </div>
                            </div>
                            <p class="mb-2">${lensStatement}</p>
                            <p class="fw-semibold mb-2">${pressureStatement}</p>
                            <p class="text-muted small mb-3">${scopeStatement}</p>
                            <div class="alerts-next-action">
                                <div class="text-muted small text-uppercase fw-semibold mb-1">Next move</div>
                                <div>${nextAction}</div>
                            </div>
                            <div class="d-flex flex-wrap gap-2 mt-3 align-items-center">
                                <span class="badge bg-secondary-lt text-secondary">Alert facts</span>
                                <span class="badge bg-secondary-lt text-secondary">SLA rules</span>
                                ${hasLiveMagiAccess() ? html`
                                    <a class="btn btn-sm btn-outline-purple ms-auto" href="#!/analyst?ctx=alert%20triage%20and%20actions">Ask MAGI</a>
                                ` : html`
                                    <button class="btn btn-sm btn-outline-secondary ms-auto" disabled title="Live MAGI chat requires the MAGI entitlement">
                                        <i class="ti ti-lock me-1"></i>Live MAGI locked
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderFilters() {
        const { stateFilter, severityFilter, alertLens, domainFilter, deviceFilter, groupBy, alerts, deviceMap } = this.state;

        const domains = [...new Set(alerts
            .filter(alert => lensMatchesAlert(alert, alertLens))
            .map(a => a.domain)
            .filter(Boolean))].sort();
        const lensOptions = [
            { id: ALERT_LENS.SECURITY, label: 'Security Alerts' },
            { id: ALERT_LENS.COMPLIANCE, label: 'Compliance Alerts' },
            { id: ALERT_LENS.ALL, label: 'All Alerts' }
        ];
        const stateOptions = [
            { id: 'OPEN', label: 'Open' },
            { id: 'SUPPRESSED', label: 'Suppressed' },
            { id: 'ALL', label: 'All States' }
        ];
        const severityOptions = [
            { id: 'all', label: 'All Severities' },
            { id: 'Critical', label: 'Critical' },
            { id: 'High', label: 'High' },
            { id: 'Medium', label: 'Medium' },
            { id: 'Low', label: 'Low' }
        ];
        const groupOptions = alertLens === ALERT_LENS.COMPLIANCE
            ? [
                { id: 'control', label: 'Control' },
                { id: 'domain', label: 'Domain' },
                { id: 'device', label: 'Device' }
            ]
            : alertLens === ALERT_LENS.SECURITY
            ? [
                { id: 'bundle', label: 'Bundle' },
                { id: 'control', label: 'Issue' },
                { id: 'application', label: 'Application' },
                { id: 'vendor', label: 'Vendor' },
                { id: 'device', label: 'Device' }
            ]
            : [
                { id: 'control', label: 'Issue' },
                { id: 'domain', label: 'Domain' },
                { id: 'device', label: 'Device' }
            ];
        const activeGroupBy = groupOptions.some(option => option.id === groupBy) ? groupBy : groupOptions[0].id;

        const renderFilterSelect = ({ label, value, options, onChange, disabled = false }) => html`
            <label class="alerts-filter-field">
                <span class="triage-filter-label">${label}</span>
                <span class="alerts-filter-select-shell">
                    <select class="form-select form-select-sm alerts-filter-select"
                            value=${value}
                            disabled=${disabled}
                            onChange=${onChange}>
                        ${options.map(option => html`<option value=${option.id}>${option.label}</option>`)}
                    </select>
                </span>
            </label>
        `;

        // Build device dropdown options from deviceMap, sorted by name
        const deviceEntries = Object.entries(deviceMap)
            .map(([id, name]) => ({ id, name: name || id }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return html`
            <div class="card alerts-filter-card mb-3">
                <div class="card-header align-items-center">
                    <div>
                        <div class="subheader">View controls</div>
                        <h3 class="card-title mb-0">Filters and grouping</h3>
                    </div>
                    <button class="btn btn-sm btn-icon btn-outline-secondary border-0 ms-auto" title="Legend" onClick=${() => this.setState({ showGlossary: true })}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 8l.01 0" /><path d="M11 12h1v4h1" /></svg>
                    </button>
                </div>
                <div class="card-body py-3">
                    <div class="triage-filter-toolbar alerts-filter-grid">
                        ${renderFilterSelect({
                            label: 'Alert type',
                            value: alertLens,
                            options: lensOptions,
                            onChange: event => this.setAlertLens(event.target.value)
                        })}
                        ${renderFilterSelect({
                            label: 'State',
                            value: stateFilter,
                            options: stateOptions,
                            onChange: event => this.setState({ stateFilter: event.target.value, alerts: [] }, () => this.loadAlerts(true))
                        })}
                        ${renderFilterSelect({
                            label: 'Severity',
                            value: severityFilter,
                            options: severityOptions,
                            onChange: event => this.setState({ severityFilter: event.target.value })
                        })}
                        ${renderFilterSelect({
                            label: 'Group by',
                            value: activeGroupBy,
                            options: groupOptions,
                            onChange: event => this.setState({ groupBy: event.target.value })
                        })}
                        ${renderFilterSelect({
                            label: 'Domain',
                            value: domainFilter,
                            options: [{ id: 'all', label: 'All Domains' }, ...domains.map(domain => ({ id: domain, label: domain }))],
                            onChange: event => this.setState({ domainFilter: event.target.value })
                        })}
                        ${renderFilterSelect({
                            label: 'Device',
                            value: deviceFilter,
                            options: [{ id: 'all', label: deviceEntries.length > 1 ? `All Devices (${deviceEntries.length})` : 'All Devices' }, ...deviceEntries.map(device => ({ id: device.id, label: device.name }))],
                            disabled: deviceEntries.length <= 1,
                            onChange: event => this.setState({ deviceFilter: event.target.value })
                        })}
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
        const { pendingRowKey, stateFilter, selectedAlerts, alertLens } = this.state;
        const lensMeta = getLensCopy(alertLens);
        if (filtered.length === 0) {
            if (nested) return null;
            const historicalOpen = Number(this.state.summary?.totalOpen ?? 0);
            const historicalCaptured = Number(this.state.summary?.capturedOpen ?? 0);
            if (rewindContext.isActive() && stateFilter === 'OPEN' && historicalOpen > 0) {
                return html`
                    <div class="empty">
                        <div class="empty-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86l-8.09 14a2 2 0 0 0 1.71 3h16.18a2 2 0 0 0 1.71 -3l-8.09 -14a2 2 0 0 0 -3.42 0z" /></svg>
                        </div>
                        <p class="empty-title">Historical alert samples are incomplete</p>
                        <p class="empty-subtitle text-muted">
                            The report shows ${historicalOpen.toLocaleString()} open alert instance${historicalOpen === 1 ? '' : 's'} as of ${rewindContext.getDateLabel?.() || api.getEffectiveDate?.() || 'the selected date'}, but ${historicalCaptured.toLocaleString()} row-level sample${historicalCaptured === 1 ? '' : 's'} are available for this view.
                        </p>
                    </div>
                `;
            }
            return html`
                <div class="empty">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M9 12l2 2l4 -4" /></svg>
                    </div>
                    <p class="empty-title">No alerts found</p>
                    <p class="empty-subtitle text-muted">
                        ${stateFilter === 'OPEN' ? `No open ${lensMeta.title.toLowerCase()} match the current filters.` : 'No alerts match the selected filters.'}
                    </p>
                </div>
            `;
        }

        const openAlerts  = filtered.filter(a => (a.state || '').toUpperCase() === 'OPEN');
        const openKeys    = openAlerts.map(a => this._alertKey(a));
        const allSelected = openKeys.length > 0 && openKeys.every(k => selectedAlerts.has(k));
        const someSelected = openKeys.some(k => selectedAlerts.has(k));

        return html`
            ${nested ? html`` : html`
                <div class="card alerts-datagrid-card">
                    <div class="card-header align-items-center">
                        <div>
                            <div class="subheader">Alert datagrid</div>
                            <h3 class="card-title mb-0">${lensMeta.title}</h3>
                        </div>
                        <span class="badge bg-secondary-lt text-secondary ms-auto">${filtered.length} row${filtered.length === 1 ? '' : 's'}</span>
                    </div>
            `}
                <div class="table-responsive alerts-datagrid-wrap">
                    <table class="table table-vcenter card-table table-hover table-nowrap mb-0 alerts-datatable">
                        <thead>
                            <tr>
                                <th class="w-1">
                                    <input type="checkbox" class="form-check-input"
                                           checked=${allSelected}
                                           ref=${el => el && (el.indeterminate = someSelected && !allSelected)}
                                           onChange=${() => this.toggleAll(filtered)}
                                           title="Select all open alerts" />
                                </th>
                                <th>${alertLens === ALERT_LENS.COMPLIANCE ? 'Control / Severity' : 'Category / Severity'}</th>
                                <th>${alertLens === ALERT_LENS.COMPLIANCE ? 'Control gap' : 'Alert'}</th>
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
                                            ${renderThreatEvidence(alert)}
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
                                                const sla = slaInfo(alert.severity, alert.openedAt, this.getReferenceDate());
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
        const { loading, error, alerts, isRefreshingInBackground, evidence } = this.state;
        const filtered = this.getFiltered();
        const lensMeta = getLensCopy(this.state.alertLens);

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
                            <div class="text-uppercase small fw-semibold text-warning mb-1" style="letter-spacing:0.08em;">${lensMeta.eyebrow}</div>
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">${lensMeta.title}</h2>
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:12px;height:12px;"></span>
                                        Refreshing…
                                    </span>
                                ` : ''}
                            </div>
                            <p class="page-subtitle mt-1 mb-0">
                                ${lensMeta.subtitle}
                                ${rewindContext.isActive() ? html` · <span class="badge bg-azure-lt text-azure">As of ${rewindContext.getDateLabel?.() || api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
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
                    <${EvidenceBanner} evidence=${evidence} pageName="alerts" />
                    ${this.renderSummaryBar(filtered)}
                    ${this.renderQueueBrief(filtered)}
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

export function SecurityAlertsPage() {
    return html`<${AlertsPage} forcedLens=${ALERT_LENS.SECURITY} />`;
}

export function ComplianceAlertsPage() {
    return html`<${AlertsPage} forcedLens=${ALERT_LENS.COMPLIANCE} />`;
}
