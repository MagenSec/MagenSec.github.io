/**
 * SecurityOverview - fast, consistent security landing page for Personal and Business orgs.
 */
import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { SWRHelper } from '@utils/SWRHelper.js';
import { bundleToUnifiedPayload } from '../dashboard/bundleAdapter.js';
import { EvidenceBanner } from '../../components/shared/EvidenceBanner.js';
import { TrendSnapshotStrip } from '../../components/TrendSnapshotStrip.js';

const { html, Component } = window;

function num(v) {
    return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function gradeForScore(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

function formatRelativeTime(dateValue) {
    if (!dateValue) return '';
    const ts = new Date(dateValue).getTime();
    if (!Number.isFinite(ts)) return '';
    const diffMs = Date.now() - ts;
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
}

function buildPatchStatus(patchResp) {
    const patch = patchResp?.data || patchResp || {};
    const summary = patch.summary || {};
    const intel = patch.intel || {};
    const hosts = Array.isArray(patch.hosts) ? patch.hosts : [];

    return {
        unavailable: patchResp?.success === false || patch.unavailable === true,
        openAlerts: num(summary.openAlerts),
        hostsAffected: num(summary.hostsAffected || hosts.length),
        critical: num(summary.critical),
        high: num(summary.high),
        exploited: num(summary.exploited),
        builtAt: intel.builtAt || intel.lastBuiltAt || intel.generatedAt || null,
    };
}

function formatActionDeviceText(action) {
    if (!action) return 'Device: not identified in this dossier';

    const deviceNames = [];
    const pushDeviceName = (value) => {
        const text = String(value || '').trim();
        if (text && !deviceNames.some((existing) => existing.toLowerCase() === text.toLowerCase())) {
            deviceNames.push(text);
        }
    };

    (Array.isArray(action.affectedDeviceNames) ? action.affectedDeviceNames : []).forEach(pushDeviceName);
    (Array.isArray(action.deviceNames) ? action.deviceNames : []).forEach(pushDeviceName);
    pushDeviceName(action.primaryDeviceName);
    pushDeviceName(action.deviceName);

    if (!deviceNames.length) {
        (Array.isArray(action.affectedDevices) ? action.affectedDevices : []).forEach((device) => {
            if (typeof device === 'string') pushDeviceName(device);
            else pushDeviceName(device?.deviceName || device?.DeviceName || device?.deviceId || device?.DeviceId);
        });
        pushDeviceName(action.primaryDeviceId);
        pushDeviceName(action.deviceId);
    }

    const count = Math.max(num(action.deviceCount), deviceNames.length);
    if (deviceNames.length) {
        return count > 1 ? `Device: ${deviceNames[0]} + ${count - 1} more` : `Device: ${deviceNames[0]}`;
    }
    if (count > 0) return `Device: ${count} unnamed device${count === 1 ? '' : 's'}`;
    return 'Device: not identified in this dossier';
}

function cleanActionTitle(action) {
    return String(action?.title || 'Security action')
        .replace(/\s+on\s+\d+\s+devices?\.?$/i, '')
        .replace(/Remediate compliance gap:\s*/i, 'Fix compliance: ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^\w/, (letter) => letter.toUpperCase());
}

export class SecurityOverview extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            score: 0,
            grade: 'N/A',
            devicesTotal: 0,
            devicesHealthy: 0,
            devicesAttention: 0,
            vulnerabilitiesTotal: 0,
            critical: 0,
            high: 0,
            medium: 0,
            actionsOpen: 0,
            actionsSuppressed: 0,
            postureGeneratedAt: null,
            isRefreshing: false,
            deepDiveOpen: false,
            cacheSource: null,
            compliancePercent: 0,
            appsTotal: 0,
            topActions: [],
            patchStatus: buildPatchStatus(null),
            evidence: null,
            trendSnapshots: [],
        };

        this.orgUnsub = null;
        this.rewindUnsub = null;
        this.swr = null;
        this.currentCacheKey = null;
    }

    componentDidMount() {
        this.orgUnsub = orgContext.onChange(() => this.load());
        this.rewindUnsub = rewindContext.onChange(() => this.load());
        this.load();
    }

    componentWillUnmount() {
        if (this.orgUnsub) this.orgUnsub();
        if (this.rewindUnsub) this.rewindUnsub();
    }

    getSWR(orgId) {
        const key = `security_overview_v2_${orgId}`;
        if (!this.swr || this.currentCacheKey !== key) {
            this.swr = new SWRHelper(key, 10);
            this.currentCacheKey = key;
        }
        return this.swr;
    }

    buildOverview(dashboardResp, alertsResp, patchResp, org) {
        const dashboard = dashboardResp?.data || {};
        const hygiene = dashboard?.cyberHygiene || dashboard?.hygieneScore || {};
        const security = dashboard?.securityScore || {};
        const quickStats = dashboard?.quickStats || {};
        const deviceStats = quickStats?.devices || dashboard?.deviceStats || {};
        const cveStats = quickStats?.cves || dashboard?.threatSummary || {};
        const inventoryStats = quickStats?.apps || dashboard?.inventoryStats || dashboard?.itAdmin?.inventory || {};
        const coverage = dashboard?.coverage || {};
        const complianceSummary = dashboard?.complianceSummary || {};

        const score = num(hygiene?.score || security?.score || dashboard?.healthScore);
        const grade = hygiene?.grade || security?.grade || gradeForScore(score);
        const rawDevicesTotal = num(deviceStats?.totalCount || deviceStats?.total || coverage?.total || org?.deviceCount);
        const rawDevicesHealthy = num(deviceStats?.activeCount || deviceStats?.active || coverage?.healthy);
        const devicesTotal = Math.max(rawDevicesTotal, rawDevicesHealthy);
        const devicesHealthy = Math.min(devicesTotal, rawDevicesHealthy || devicesTotal);
        const rawDevicesAttention = num(deviceStats?.offlineCount || ((coverage?.stale || 0) + (coverage?.offline || 0)));
        const devicesAttention = Math.max(0, Math.min(devicesTotal, rawDevicesAttention || Math.max(0, devicesTotal - devicesHealthy)));
        const critical = num(cveStats?.criticalCount || cveStats?.critical);
        const high = num(cveStats?.highCount || cveStats?.high);
        const medium = num(cveStats?.mediumCount || cveStats?.medium);
        const vulnerabilitiesTotal = num(cveStats?.totalCount || cveStats?.total || critical + high + medium);
        const alerts = alertsResp?.data || {};
        const topActionsRaw = Array.isArray(dashboard?.businessOwner?.topActions)
            ? dashboard.businessOwner.topActions
            : [];
        const seenActions = new Set();
        const topActions = topActionsRaw
            .filter((item) => {
                const key = String(item?.title || item?.actionUrl || '').trim().toLowerCase();
                if (!key || seenActions.has(key)) return false;
                seenActions.add(key);
                return true;
            })
            .slice(0, 3);

        return {
            score,
            grade,
            devicesTotal,
            devicesHealthy,
            devicesAttention,
            vulnerabilitiesTotal,
            critical,
            high,
            medium,
            actionsOpen: num(alerts?.totalOpen),
            actionsSuppressed: num(alerts?.totalSuppressed),
            postureGeneratedAt: dashboard?.generatedAt || dashboard?.freshness?.generatedAt || dashboard?.freshness?.cachedAt || null,
            compliancePercent: Math.round(num(hygiene?.compliance || complianceSummary?.score || security?.compliancePercent)),
            appsTotal: num(inventoryStats?.totalCount || inventoryStats?.totalApps || inventoryStats?.total),
            topActions,
            patchStatus: buildPatchStatus(patchResp),
            evidence: dashboard?.evidence || dashboard?._bundle?.evidence || null,
            trendSnapshots: Array.isArray(dashboard?.snapshots) ? dashboard.snapshots : [],
        };
    }

    async load(forceRefresh = false) {
        const org = orgContext.getCurrentOrg();
        const user = auth.getUser();
        const orgId = org?.orgId || user?.email;
        if (!orgId) return;

        const swr = this.getSWR(orgId);
        const cached = forceRefresh ? null : swr.getCached();

        if (cached?.data) {
            this.setState({
                ...cached.data,
                loading: false,
                error: null,
                isRefreshing: true,
                cacheSource: cached.isStale ? 'stale' : 'fresh-cache'
            });
        } else {
            this.setState({ loading: true, error: null, isRefreshing: false, cacheSource: null });
        }

        try {
            // Phase 4.3.1: source dashboard data from page bundle (`security` is a personal-org
            // alias of the dashboard bundle). Adapter synthesizes the legacy unified-dashboard
            // shape so buildOverview() does not need to change.
            const [bundleResp, alertsResp, patchResp] = await Promise.all([
                api.getPageBundle(orgId, 'security', {}, { skipCache: true }),
                api.getAlertSummary(orgId, { include: 'cached-summary' }),
                api.getPatchPosture(orgId, { skipCache: true }).catch((err) => ({
                    success: false,
                    data: { unavailable: true, message: err?.message || 'Patch Status unavailable' }
                })),
            ]);

            const dashboardResp = bundleResp?.success
                ? { success: true, data: bundleToUnifiedPayload(bundleResp.data) }
                : bundleResp;

            if (!dashboardResp?.success && !alertsResp?.success) {
                throw new Error('Unable to load security data.');
            }

            const overview = this.buildOverview(dashboardResp, alertsResp, patchResp, org);
            swr.setCached(overview);

            this.setState({
                ...overview,
                loading: false,
                error: null,
                isRefreshing: false,
                cacheSource: 'fresh'
            });
        } catch (err) {
            if (cached?.data) {
                this.setState({ isRefreshing: false, error: null });
                return;
            }

            this.setState({ loading: false, error: err?.message || 'Failed to load security overview.' });
        }
    }

    goToGarage = () => {
        const page = window.page || window.Page;
        if (page) page.show('/devices');
        else window.location.hash = '#!/devices';
    };

    toggleDeepDive = () => {
        this.setState(prev => ({ deepDiveOpen: !prev.deepDiveOpen }));
    };

    buildSecuritySignals() {
        const s = this.state;
        const patch = s.patchStatus || buildPatchStatus(null);
        const strengths = [];
        const weaknesses = [];

        if (s.devicesHealthy > 0) {
            strengths.push({ icon: 'ti-device-desktop-check', text: `${s.devicesHealthy} protected device${s.devicesHealthy === 1 ? '' : 's'} reporting into the Dossier.` });
        }
        if (s.appsTotal > 0) {
            strengths.push({ icon: 'ti-apps', text: `${s.appsTotal} applications inventoried for exposure matching.` });
        }
        if (s.critical === 0) {
            strengths.push({ icon: 'ti-shield-check', text: 'No critical vulnerability is open in the current Dossier.' });
        }
        if (patch.openAlerts === 0 && !patch.unavailable) {
            strengths.push({ icon: 'ti-shield-bolt', text: 'No Microsoft patch alert is currently blocking coverage.' });
        }
        if (!s.topActions.length) {
            strengths.push({ icon: 'ti-circle-check', text: 'No fix-first action was generated from the latest evidence.' });
        }

        if (s.devicesAttention > 0) {
            weaknesses.push({ icon: 'ti-wifi-off', href: '#!/devices', tone: 'warning', text: `${s.devicesAttention} device${s.devicesAttention === 1 ? '' : 's'} need visibility review.` });
        }
        if (s.critical > 0 || s.high > 0) {
            weaknesses.push({ icon: 'ti-bug', href: '#!/vulnerabilities', tone: s.critical > 0 ? 'danger' : 'warning', text: `${s.critical} critical and ${s.high} high vulnerabilities need triage.` });
        }
        if (patch.openAlerts > 0 || patch.hostsAffected > 0) {
            weaknesses.push({ icon: 'ti-shield-x', href: '#!/patch-posture', tone: 'warning', text: `${patch.openAlerts} patch alert${patch.openAlerts === 1 ? '' : 's'} across ${patch.hostsAffected} affected device${patch.hostsAffected === 1 ? '' : 's'}.` });
        }
        if (s.actionsOpen > 0) {
            weaknesses.push({ icon: 'ti-bell-ringing', href: '#!/alerts', tone: 'warning', text: `${s.actionsOpen} open action${s.actionsOpen === 1 ? '' : 's'} still need closure.` });
        }
        if (!weaknesses.length) {
            weaknesses.push({ icon: 'ti-circle-check', tone: 'success', text: 'No immediate weakness is visible in the latest Dossier.' });
        }

        return { strengths: strengths.slice(0, 4), weaknesses: weaknesses.slice(0, 4) };
    }

    renderSecurityCoverageMap() {
        const s = this.state;
        const totalDevices = Math.max(0, s.devicesTotal, s.devicesHealthy + s.devicesAttention);
        const attentionDevices = Math.max(0, Math.min(totalDevices, s.devicesAttention));
        const healthyDevices = Math.max(0, totalDevices - attentionDevices);
        const cellsToShow = totalDevices > 0 ? (totalDevices <= 24 ? totalDevices : 24) : 12;
        const devicesPerCell = totalDevices > cellsToShow ? Math.ceil(totalDevices / cellsToShow) : 1;
        const attentionCells = totalDevices > 0 ? Math.min(cellsToShow, Math.ceil((attentionDevices / Math.max(1, totalDevices)) * cellsToShow)) : 0;
        const healthyCells = totalDevices > 0 ? Math.max(0, cellsToShow - attentionCells) : 0;
        const cells = Array.from({ length: cellsToShow }, (_, index) => {
            if (totalDevices === 0) return 'unknown';
            return index < healthyCells ? 'healthy' : 'attention';
        });
        const coveragePct = totalDevices > 0 ? Math.round((healthyDevices / totalDevices) * 100) : 0;
        const mapSubtitle = totalDevices > cellsToShow
            ? `Each square represents up to ${devicesPerCell} devices.`
            : 'Each square represents one known device.';

        return html`
            <div class="card h-100 border-0 shadow-sm">
                <div class="card-header">
                    <h3 class="card-title">Security Coverage Map</h3>
                    <div class="card-actions">
                        <span class="badge bg-${coveragePct >= 90 ? 'success' : coveragePct >= 70 ? 'warning' : 'danger'}-lt text-${coveragePct >= 90 ? 'success' : coveragePct >= 70 ? 'warning' : 'danger'}">${coveragePct}% covered</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-end gap-3 mb-2">
                        <div>
                            <div class="text-muted text-uppercase fw-semibold small">Protected estate</div>
                            <div class="h2 mb-0">${healthyDevices}/${totalDevices || 0}</div>
                        </div>
                        <div class="text-end small text-muted">
                            <div>${attentionDevices} need review</div>
                            <div>${mapSubtitle}</div>
                        </div>
                    </div>
                    <div class="progress progress-sm mb-3">
                        <div class="progress-bar bg-success" style=${`width:${Math.max(0, Math.min(100, coveragePct))}%`}></div>
                    </div>
                    <div class="mb-3" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;">
                        ${cells.map((state, index) => {
                            const title = state === 'healthy'
                                ? `Coverage square ${index + 1}: reporting device coverage`
                                : state === 'attention'
                                    ? `Coverage square ${index + 1}: device coverage needs review`
                                    : `Coverage square ${index + 1}: waiting for device evidence`;
                            const style = state === 'healthy'
                                ? 'background:linear-gradient(135deg,#16a34a,#22c55e);border-color:rgba(22,163,74,0.45);'
                                : state === 'attention'
                                    ? 'background:linear-gradient(135deg,#f97316,#f59e0b);border-color:rgba(249,115,22,0.45);'
                                    : 'background:linear-gradient(135deg,#e5e7eb,#f8fafc);border-color:rgba(148,163,184,0.35);';
                            return html`
                                <div title=${title} style=${`${style}aspect-ratio:1;border-radius:6px;border:1px solid;box-shadow:inset 0 1px 0 rgba(255,255,255,0.22);`}></div>
                            `;
                        })}
                    </div>
                    <div class="d-flex gap-3 flex-wrap small mb-3">
                        <span class="d-inline-flex align-items-center gap-1"><span class="rounded-circle bg-success" style="width:10px;height:10px;"></span>Reporting</span>
                        <span class="d-inline-flex align-items-center gap-1"><span class="rounded-circle bg-warning" style="width:10px;height:10px;"></span>Needs review</span>
                        <span class="d-inline-flex align-items-center gap-1"><span class="rounded-circle bg-secondary" style="width:10px;height:10px;"></span>Awaiting evidence</span>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <a href="#!/devices" class="btn btn-primary btn-sm">
                            <i class="ti ti-devices me-1"></i>Open fleet
                        </a>
                        <a href="#!/patch-posture" class="btn btn-outline-secondary btn-sm">
                            <i class="ti ti-shield-bolt me-1"></i>Patch coverage
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    renderStrengthsWeaknesses() {
        const { strengths, weaknesses } = this.buildSecuritySignals();

        return html`
            <div class="row row-cards mb-4">
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header">
                            <h3 class="card-title">Strengths to preserve</h3>
                        </div>
                        <div class="list-group list-group-flush">
                            ${strengths.map((item) => html`
                                <div class="list-group-item d-flex align-items-start gap-2">
                                    <i class=${`ti ${item.icon} text-success mt-1`}></i>
                                    <span>${item.text}</span>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header">
                            <h3 class="card-title">Weaknesses to close</h3>
                        </div>
                        <div class="list-group list-group-flush">
                            ${weaknesses.map((item) => {
                                const content = html`
                                    <i class=${`ti ${item.icon} text-${item.tone || 'warning'} mt-1`}></i>
                                    <span>${item.text}</span>
                                `;
                                return item.href ? html`
                                    <a href=${item.href} class="list-group-item list-group-item-action d-flex align-items-start gap-2">
                                        ${content}
                                    </a>
                                ` : html`
                                    <div class="list-group-item d-flex align-items-start gap-2">
                                        ${content}
                                    </div>
                                `;
                            })}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderFocusMatrix() {
        const s = this.state;
        const patch = s.patchStatus || buildPatchStatus(null);
        const cards = [
            {
                label: 'Coverage',
                value: `${s.devicesHealthy}/${Math.max(s.devicesTotal, s.devicesHealthy + s.devicesAttention)}`,
                detail: `${s.devicesAttention} devices need visibility review`,
                icon: 'ti-radar-2',
                tone: s.devicesAttention > 0 ? 'warning' : 'success',
                href: '#!/devices'
            },
            {
                label: 'Vulnerabilities',
                value: `${s.critical + s.high}`,
                detail: `${s.critical} critical, ${s.high} high`,
                icon: 'ti-bug',
                tone: s.critical > 0 ? 'danger' : s.high > 0 ? 'warning' : 'success',
                href: '#!/vulnerabilities'
            },
            {
                label: 'Patches',
                value: `${patch.openAlerts}`,
                detail: `${patch.hostsAffected} affected devices`,
                icon: 'ti-shield-bolt',
                tone: patch.openAlerts > 0 ? 'warning' : 'success',
                href: '#!/patch-posture'
            },
            {
                label: 'Actions',
                value: `${s.topActions.length || s.actionsOpen}`,
                detail: s.topActions.length ? 'fix-first items ready' : `${s.actionsOpen} open alerts`,
                icon: 'ti-list-check',
                tone: (s.topActions.length || s.actionsOpen) > 0 ? 'warning' : 'success',
                href: '#!/alerts'
            }
        ];

        return html`
            <div class="row row-cards mb-4">
                ${cards.map(card => html`
                    <div class="col-sm-6 col-xl-3">
                        <a href=${card.href} class="card card-link border-0 shadow-sm h-100 text-reset text-decoration-none">
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <span class=${`avatar avatar-sm bg-${card.tone}-lt text-${card.tone}`}><i class=${`ti ${card.icon}`}></i></span>
                                    <span class=${`badge bg-${card.tone}-lt text-${card.tone}`}>${card.tone === 'success' ? 'Clear' : 'Review'}</span>
                                </div>
                                <div class="text-muted text-uppercase fw-semibold small">${card.label}</div>
                                <div class="h2 mb-0">${card.value}</div>
                                <div class="text-muted small">${card.detail}</div>
                            </div>
                        </a>
                    </div>
                `)}
            </div>
        `;
    }

    renderSecurityCoverageSection() {
        return html`
            <div class="row row-cards mb-4">
                <div class="col-lg-5">
                    ${this.renderSecurityCoverageMap()}
                </div>
                <div class="col-lg-7">
                    ${this.renderFixFirstCard()}
                </div>
            </div>
        `;
    }

    renderFixFirstCard() {
        const s = this.state;
        const patch = s.patchStatus || buildPatchStatus(null);

        return html`
            <div class="card h-100 border-0 shadow-sm">
                <div class="card-header">
                    <h3 class="card-title">Fix First</h3>
                </div>
                <div class="card-body">
                    <div class="list-group list-group-flush">
                        ${s.topActions.slice(0, 3).map((item) => html`
                            <a href=${item?.actionUrl || '#!/alerts'} class="list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-3">
                                <span class="flex-fill">
                                    <span class="d-block fw-semibold">${cleanActionTitle(item)}</span>
                                    <span class="d-block text-muted small mt-1">${formatActionDeviceText(item)}</span>
                                </span>
                                <span class="badge bg-${String(item?.urgency || '').toLowerCase() === 'critical' ? 'danger' : 'warning'} text-white">${item?.urgency || 'Priority'}</span>
                            </a>
                        `)}
                        ${!s.topActions.length ? html`
                            <div class="list-group-item text-muted">No generated fix-first action is waiting. Review the queues below to keep coverage strong.</div>
                        ` : null}
                        <div class="text-muted text-uppercase fw-semibold small mt-3 mb-2">Review queues</div>
                        <a href="#!/vulnerabilities" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <span><i class="ti ti-alert-triangle text-danger me-2"></i>Remediate critical vulnerabilities first</span>
                            <span class="badge bg-danger text-white">${s.critical}</span>
                        </a>
                        <a href="#!/devices" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <span><i class="ti ti-devices me-2"></i>Review devices needing attention</span>
                            <span class="badge bg-secondary text-white">${s.devicesAttention}</span>
                        </a>
                        <a href="#!/patch-posture" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <span><i class="ti ti-shield-check text-warning me-2"></i>Install missing Microsoft updates</span>
                            <span class="badge bg-${patch.openAlerts > 0 ? 'warning' : 'success'} text-white">${patch.openAlerts} open</span>
                        </a>
                        <a href="#!/apps" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <span><i class="ti ti-apps me-2"></i>Inspect risky software footprint</span>
                            <span class="badge bg-blue text-white">${s.appsTotal > 0 ? `${s.appsTotal} apps` : 'Inventory'}</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    renderDeepDive() {
        const s = this.state;
        return html`
            <div class="card-body">
                <div class="row g-3 mb-3">
                    <div class="col-md-4">
                        <div class="card border-0 bg-body-secondary h-100">
                            <div class="card-body">
                                <div class="text-muted text-uppercase fw-semibold small">Software footprint</div>
                                <div class="h2 mb-0">${s.appsTotal}</div>
                                <div class="text-muted small">applications in your current Dossier</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card border-0 bg-body-secondary h-100">
                            <div class="card-body">
                                <div class="text-muted text-uppercase fw-semibold small">Reporting devices</div>
                                <div class="h2 mb-0">${s.devicesHealthy}</div>
                                <div class="text-muted small">${s.devicesAttention} need review</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card border-0 bg-body-secondary h-100">
                            <div class="card-body">
                                <div class="text-muted text-uppercase fw-semibold small">Known exposures</div>
                                <div class="h2 mb-0">${s.vulnerabilitiesTotal}</div>
                                <div class="text-muted small">${s.critical} critical • ${s.high} high</div>
                            </div>
                        </div>
                    </div>
                </div>

                ${s.topActions.length > 0 ? html`
                    <div class="mb-3">
                        <div class="text-muted text-uppercase fw-semibold small mb-2">Fix first</div>
                        <div class="list-group list-group-flush">
                            ${s.topActions.map((item) => html`
                                <a href=${item?.actionUrl || '#!/posture'} class="list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-3">
                                    <span class="flex-fill">
                                        <span class="d-block fw-semibold">${cleanActionTitle(item)}</span>
                                        <span class="d-block text-muted small mt-1">${formatActionDeviceText(item)}</span>
                                    </span>
                                    <span class="badge bg-${String(item?.urgency || '').toLowerCase() === 'critical' ? 'danger' : 'warning'} text-white">${item?.urgency || 'Priority'}</span>
                                </a>
                            `)}
                        </div>
                    </div>
                ` : ''}

                <div class="d-flex gap-2 flex-wrap">
                    <a href="#!/dashboard" class="btn btn-primary btn-sm">
                        <i class="ti ti-layout-dashboard me-1"></i>Open full command center
                    </a>
                    <a href="#!/posture" class="btn btn-outline-secondary btn-sm">
                        <i class="ti ti-shield-check me-1"></i>View posture detail
                    </a>
                </div>
            </div>
        `;
    }

    render() {
        const s = this.state;
        const org = orgContext.getCurrentOrg();
        const isPersonal = org?.type === 'Personal';
        const scoreTone = s.score >= 80 ? 'success' : s.score >= 65 ? 'warning' : 'danger';
        const patch = s.patchStatus || buildPatchStatus(null);
        const needsAttention = s.devicesAttention > 0 || s.critical > 0 || patch.openAlerts > 0;
        const safetyTone = needsAttention ? 'warning' : 'success';
        const safetyTitle = needsAttention ? 'Attention' : 'Secure';
        const safetySubtitle = needsAttention ? 'needs action today' : 'no urgent blocker';
        const safetyCopy = needsAttention
            ? `${s.devicesAttention} device${s.devicesAttention === 1 ? '' : 's'} need review, ${s.critical} critical exposure${s.critical === 1 ? '' : 's'}, and ${patch.openAlerts} missing Microsoft update${patch.openAlerts === 1 ? '' : 's'} need action.`
            : 'Your protected devices have no critical exposure, missing Microsoft update, or device visibility blocker in the current Dossier.';

        if (s.loading) {
            return html`
                <div class="page-body">
                    <div class="container-xl">
                        <div class="card">
                            <div class="card-body d-flex align-items-center gap-2">
                                <span class="spinner-border spinner-border-sm"></span>
                                <span>Loading security overview...</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (s.error) {
            return html`
                <div class="page-body">
                    <div class="container-xl">
                        <div class="alert alert-danger">${s.error}</div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="page-body">
                <div class="container-xl">
                    <${EvidenceBanner} evidence=${s.evidence} pageName="security" />
                    <div class="card mb-4 border-0 shadow-sm overflow-hidden" style="background:linear-gradient(120deg,#1657a8 0%,#1a73e8 100%);color:#fff;">
                        <div class="card-body p-4 p-lg-5">
                            <div class="row align-items-center g-4">
                                <div class="col-lg-7">
                                    <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                                        <div class="text-uppercase text-white-50 fw-semibold">${isPersonal ? 'Personal Protection Dashboard' : 'Security Coverage Dashboard'}</div>
                                        ${s.isRefreshing ? html`<span class="badge bg-white text-primary">Refreshing…</span>` : ''}
                                    </div>
                                    <h2 class="mb-2 text-white">Am I secure today?</h2>
                                    <div class="text-white-75 mb-3">
                                        ${safetyCopy}
                                        ${s.postureGeneratedAt ? html` Dossier submitted ${formatRelativeTime(s.postureGeneratedAt)}.` : ''}
                                        ${rewindContext.isActive() ? html` Viewing a historical Time Warp dossier.` : ''}
                                    </div>
                                    <div class="btn-list">
                                        <a href=${patch.openAlerts > 0 ? '#!/patch-posture' : '#!/alerts'} class="btn btn-white ${needsAttention ? '' : 'disabled'}">
                                            <i class="ti ti-tool me-1"></i>${needsAttention ? 'Fix first' : 'No urgent fix'}
                                        </a>
                                        <a href="#!/vulnerabilities" class="btn btn-outline-light">
                                            <i class="ti ti-bug me-1"></i>Open exposures
                                        </a>
                                        <a href="#!/patch-posture" class="btn btn-outline-light">
                                            <i class="ti ti-shield-check me-1"></i>Patch Status
                                        </a>
                                        <a href="#!/devices" class="btn btn-outline-light">
                                            <i class="ti ti-devices me-1"></i>Fleet
                                        </a>
                                    </div>
                                </div>
                                <div class="col-lg-5">
                                    <div class="row g-2">
                                        <div class="col-6">
                                            <div class="card bg-white text-body shadow-sm border-0">
                                                <div class="card-body p-3">
                                                    <div class="text-muted text-uppercase fw-semibold small">Today's state</div>
                                                    <div class="h2 mb-0 text-${safetyTone}">${safetyTitle}</div>
                                                    <div class="text-muted small">${safetySubtitle}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="card bg-white text-body shadow-sm border-0">
                                                <div class="card-body p-3">
                                                    <div class="text-muted text-uppercase fw-semibold small">Devices needing review</div>
                                                    <div class="h2 mb-0">${s.devicesAttention}</div>
                                                    <div class="text-muted small">${s.devicesHealthy} reporting now</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="card bg-white text-body shadow-sm border-0">
                                                <div class="card-body p-3">
                                                    <div class="text-muted text-uppercase fw-semibold small">Missing patches</div>
                                                    <div class="h2 mb-0 text-${patch.openAlerts > 0 ? 'warning' : 'success'}">${patch.openAlerts}</div>
                                                    <div class="text-muted small">${patch.hostsAffected} affected devices</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="card bg-white text-body shadow-sm border-0">
                                                <div class="card-body p-3">
                                                    <div class="text-muted text-uppercase fw-semibold small">Critical vulnerabilities</div>
                                                    <div class="h2 mb-0 text-${s.critical > 0 ? 'danger' : 'success'}">${s.critical}</div>
                                                    <div class="text-muted small">${s.high} high pending</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    ${this.renderFocusMatrix()}
                    ${this.renderStrengthsWeaknesses()}
                    ${this.renderSecurityCoverageSection()}
                    <${TrendSnapshotStrip}
                        trends=${s.trendSnapshots}
                        context="security"
                        title="Security Trend"
                        subtitle="Score, CVE exposure, and fleet movement over the last 30 days"
                    />

                    <div class="card border-0 shadow-sm mb-3">
                        <div class="card-header">
                            <h3 class="card-title">Detailed Security Intelligence</h3>
                        </div>
                        ${this.renderDeepDive()}
                    </div>
                </div>
            </div>
        `;
    }
}
