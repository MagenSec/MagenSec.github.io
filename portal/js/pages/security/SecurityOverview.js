/**
 * SecurityOverview - fast, consistent security landing page for Personal and Business orgs.
 */
import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { SWRHelper } from '@utils/SWRHelper.js';

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

    buildOverview(dashboardResp, alertsResp, org) {
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
            const [dashboardResp, alertsResp] = await Promise.all([
                api.getUnifiedDashboard(orgId, { format: 'unified', include: 'cached-summary' }),
                api.getAlertSummary(orgId, { include: 'cached-summary' }),
            ]);

            if (!dashboardResp?.success && !alertsResp?.success) {
                throw new Error('Unable to load security data.');
            }

            const overview = this.buildOverview(dashboardResp, alertsResp, org);
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

    renderSeatGarage(isPersonal) {
        const org = orgContext.getCurrentOrg();
        const totalSeats = Math.max(1, num(org?.totalSeats || (isPersonal ? 5 : this.state.devicesTotal)));
        const usedSeats = Math.max(0, Math.min(totalSeats, num(this.state.devicesTotal || org?.deviceCount)));
        const freeSeats = Math.max(0, totalSeats - usedSeats);
        const slotCount = Math.max(3, Math.min(totalSeats, 10));
        const openVisible = Math.min(slotCount, freeSeats);
        const occupiedVisible = Math.min(slotCount - openVisible, usedSeats);
        const slots = [
            ...Array.from({ length: openVisible }, () => 'open'),
            ...Array.from({ length: occupiedVisible }, () => 'occupied')
        ];

        return html`
            <div class="card h-100 border-0 shadow-sm" style="cursor:pointer;" onClick=${this.goToGarage}>
                <div class="card-header">
                    <h3 class="card-title">License Seats</h3>
                    <div class="card-actions">
                        <span class="badge bg-${freeSeats > 0 ? 'success' : 'warning'}-lt text-${freeSeats > 0 ? 'success' : 'warning'}">${freeSeats} open</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-baseline gap-2 mb-2">
                        <div class="h2 mb-0">${freeSeats}</div>
                        <div class="text-muted">${freeSeats === 1 ? 'open seat' : 'open seats'}</div>
                    </div>
                    <div class="text-muted small mb-3">
                        ${usedSeats} occupied now. ${isPersonal ? 'Add another protected device when you are ready.' : 'Open seats are shown first so license headroom is instantly visible.'}
                    </div>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                        ${slots.map((state, idx) => html`
                            <div class="d-flex flex-column align-items-center justify-content-center rounded-3 border"
                                 title=${state === 'open' ? `Seat ${idx + 1}: available for a device` : `Seat ${idx + 1}: assigned to a device`}
                                 style=${`width:48px;height:56px;background:${state === 'open' ? 'linear-gradient(135deg,#ecfdf3 0%,#d1fae5 100%)' : 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)'};border-color:${state === 'open' ? 'rgba(34,197,94,0.28)' : 'rgba(37,99,235,0.35)'} !important;color:${state === 'open' ? '#15803d' : '#fff'};box-shadow:${state === 'open' ? '0 6px 12px rgba(34,197,94,0.10)' : '0 8px 16px rgba(37,99,235,0.18)'};`}>
                                <i class="ti ${state === 'open' ? 'ti-plus' : 'ti-device-desktop'}" style="font-size:1rem;"></i>
                                <span class="small fw-semibold">${idx + 1}</span>
                            </div>
                        `)}
                        ${(totalSeats || 0) > slotCount ? html`<div class="d-flex align-items-center text-muted small">+${totalSeats - slotCount} more</div>` : ''}
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <a href="#!/devices" class="btn btn-primary btn-sm" onClick=${(e) => e.stopPropagation()}>
                            <i class="ti ti-devices me-1"></i>Devices
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    renderVisualInsights() {
        const s = this.state;
        const org = orgContext.getCurrentOrg();
        const totalRisk = Math.max(1, s.critical + s.high + s.medium);
        const totalSeats = Math.max(1, num(org?.totalSeats || (org?.type === 'Personal' ? 5 : s.devicesTotal)));
        const occupiedSeats = Math.min(totalSeats, s.devicesTotal);
        const occupiedPct = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;
        const criticalPct = Math.round((s.critical / totalRisk) * 100);
        const highPct = Math.round((s.high / totalRisk) * 100);
        const mediumPct = Math.max(0, 100 - criticalPct - highPct);

        return html`
            <div class="row row-cards mb-4">
                <div class="col-lg-4">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small mb-2">Security Pulse</div>
                            <div class="d-flex align-items-end gap-2 mb-2">
                                <div class="display-6 fw-bold text-${s.score >= 80 ? 'success' : s.score >= 65 ? 'warning' : 'danger'}">${s.score}</div>
                                <span class="badge bg-${s.score >= 80 ? 'success' : s.score >= 65 ? 'warning' : 'danger'} text-white mb-2">Grade ${s.grade}</span>
                            </div>
                            <div class="progress progress-sm mb-2">
                                <div class="progress-bar bg-${s.score >= 80 ? 'success' : s.score >= 65 ? 'warning' : 'danger'}" style=${`width:${Math.max(0, Math.min(100, s.score))}%`}></div>
                            </div>
                            <div class="small text-muted">Updated ${formatRelativeTime(s.postureGeneratedAt) || 'recently'}</div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small mb-2">Threat Mix</div>
                            <div class="d-flex justify-content-between small mb-2">
                                <span>Critical ${s.critical}</span>
                                <span>High ${s.high}</span>
                                <span>Medium ${s.medium}</span>
                            </div>
                            <div class="progress-stacked mb-2" style="height:10px;">
                                <div class="progress" style=${`width:${criticalPct}%`}><div class="progress-bar bg-danger"></div></div>
                                <div class="progress" style=${`width:${highPct}%`}><div class="progress-bar bg-orange"></div></div>
                                <div class="progress" style=${`width:${mediumPct}%`}><div class="progress-bar bg-warning"></div></div>
                            </div>
                            <div class="small text-muted">${s.vulnerabilitiesTotal} known exposures in the current dossier</div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small mb-2">Coverage</div>
                            <div class="d-flex justify-content-between align-items-end mb-2">
                                <div class="h3 mb-0">${occupiedSeats}/${totalSeats}</div>
                                <span class="small text-muted">occupied</span>
                            </div>
                            <div class="progress progress-sm mb-2">
                                <div class="progress-bar bg-success" style=${`width:${occupiedPct}%`}></div>
                            </div>
                            <div class="small text-muted">${Math.max(0, totalSeats - occupiedSeats)} seats open</div>
                        </div>
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
                                <div class="text-muted small">applications in your current dossier</div>
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
                        <div class="text-muted text-uppercase fw-semibold small mb-2">Recommended next steps</div>
                        <div class="list-group list-group-flush">
                            ${s.topActions.map((item) => html`
                                <a href=${item?.actionUrl || '#!/posture'} class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                    <span>${item?.title || 'Security action'}</span>
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
                    <div class="card mb-4 border-0 shadow-sm overflow-hidden" style="background:linear-gradient(120deg,#1657a8 0%,#1a73e8 100%);color:#fff;">
                        <div class="card-body p-4 p-lg-5">
                            <div class="row align-items-center g-4">
                                <div class="col-lg-7">
                                    <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                                        <div class="text-uppercase text-white-50 fw-semibold">${isPersonal ? 'Personal Security Console' : 'Business Security Console'}</div>
                                        ${s.isRefreshing ? html`<span class="badge bg-white text-primary">Refreshing…</span>` : ''}
                                    </div>
                                    <h2 class="mb-2 text-white">Protect what matters first.</h2>
                                    <div class="text-white-75 mb-3">
                                        Your current command view: score, exposures, actions, and capacity — all from the same live dossier.
                                        ${s.postureGeneratedAt ? html` Updated ${formatRelativeTime(s.postureGeneratedAt)}.` : ''}
                                        ${rewindContext.isActive() ? html` Viewing a historical Time Warp snapshot.` : ''}
                                    </div>
                                    <div class="btn-list">
                                        ${!isPersonal ? html`
                                            <a href="#!/alerts" class="btn btn-white ${s.actionsOpen > 0 ? '' : 'disabled'}">
                                                <i class="ti ti-bell-ringing me-1"></i>Review ${s.actionsOpen} actions
                                            </a>
                                        ` : ''}
                                        <a href="#!/vulnerabilities" class="btn btn-outline-light">
                                            <i class="ti ti-bug me-1"></i>Open exposures
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
                                                    <div class="text-muted text-uppercase fw-semibold small">Applications observed</div>
                                                    <div class="h2 mb-0">${s.appsTotal}</div>
                                                    <div class="text-muted small">software inventory view</div>
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
                                                    <div class="text-muted text-uppercase fw-semibold small">Open actions</div>
                                                    <div class="h2 mb-0 text-${s.actionsOpen > 0 ? 'danger' : 'success'}">${s.actionsOpen}</div>
                                                    <div class="text-muted small">${s.actionsSuppressed} suppressed</div>
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

                    ${this.renderVisualInsights()}

                    <div class="row row-cards mb-4">
                        <div class="col-lg-5">
                            ${this.renderSeatGarage(isPersonal)}
                        </div>
                        <div class="col-lg-7">
                            <div class="card h-100 border-0 shadow-sm">
                                <div class="card-header">
                                    <h3 class="card-title">Priority Focus</h3>
                                </div>
                                <div class="card-body">
                                    <div class="list-group list-group-flush">
                                        <a href="#!/vulnerabilities" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                            <span><i class="ti ti-alert-triangle text-danger me-2"></i>Remediate critical vulnerabilities first</span>
                                            <span class="badge bg-danger text-white">${s.critical}</span>
                                        </a>
                                        <a href="#!/devices" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                            <span><i class="ti ti-devices me-2"></i>Review devices needing attention</span>
                                            <span class="badge bg-secondary text-white">${s.devicesAttention}</span>
                                        </a>
                                        ${!isPersonal ? html`
                                            <a href="#!/alerts" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                                <span><i class="ti ti-bell-ringing text-warning me-2"></i>Close actions</span>
                                                <span class="badge bg-${s.actionsOpen > 0 ? 'warning' : 'success'} text-white">${s.actionsOpen} open</span>
                                            </a>
                                        ` : ''}
                                        <a href="#!/apps" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                            <span><i class="ti ti-apps me-2"></i>Inspect risky software footprint</span>
                                            <span class="badge bg-blue text-white">${s.appsTotal > 0 ? `${s.appsTotal} apps` : 'Inventory'}</span>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

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
