/**
 * Auditor Dashboard
 * Provides audit readiness composite, evidence checklist, and recent audit events.
 * Uses unified dashboard API + audit log API. No new backend endpoints.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import ChatDrawer from '../../components/ChatDrawer.js';

const { html, Component } = window;

// Shared sessionStorage key — same key written by Dashboard, Compliance, and Auditor pages
const SESSION_DASH_KEY = (orgId) => `dashboard_data_${orgId}`;
const LS_AUDITOR_KEY = (orgId) => `auditor_${orgId}`;
const LS_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Evidence checklist items — status derived from live dashboard data
const buildEvidenceChecklist = (data) => {
  const compliance = data?.businessOwner?.complianceCard || {};
  const score = data?.securityScore || {};
  const stats = data?.quickStats || {};
  const pct = compliance?.percent || 0;
  const grade = score?.grade || '';
  const totalDevices = stats?.devices?.totalCount || 0;
  const urgentCount = score?.urgentActionCount || 0;

  return [
    {
      id: 'device-inventory',
      label: 'Device inventory documented',
      description: 'All managed devices enrolled and tracked',
      status: totalDevices > 0 ? 'complete' : 'missing',
      detail: totalDevices > 0 ? `${totalDevices} devices enrolled` : 'No devices found'
    },
    {
      id: 'security-score',
      label: 'Security baseline established',
      description: 'Security score meets minimum threshold (grade C or above)',
      status: ['A+','A','A-','B+','B','B-','C+','C','C-'].includes(grade) ? 'complete' : grade ? 'partial' : 'missing',
      detail: grade ? `Current grade: ${grade} (${score?.score || 0} points)` : 'No score available'
    },
    {
      id: 'compliance-score',
      label: 'Compliance score above 60%',
      description: 'Minimum compliance threshold for audit readiness',
      status: pct >= 80 ? 'complete' : pct >= 60 ? 'partial' : 'missing',
      detail: pct > 0 ? `Current: ${pct}%` : 'No compliance data'
    },
    {
      id: 'urgent-actions',
      label: 'No critical open actions',
      description: 'All critical security actions have been addressed',
      status: urgentCount === 0 ? 'complete' : urgentCount <= 2 ? 'partial' : 'missing',
      detail: urgentCount === 0 ? 'No urgent actions' : `${urgentCount} urgent action(s) open`
    },
    {
      id: 'gap-description',
      label: 'Gap analysis reviewed',
      description: 'Compliance gap description reviewed and acknowledged',
      status: compliance?.gapDescription ? 'partial' : 'complete',
      detail: compliance?.gapDescription ? 'Gaps identified — review recommended' : 'No gaps reported'
    },
    {
      id: 'ai-report',
      label: 'AI posture report generated',
      description: 'Latest AI security posture report available for auditors',
      status: 'manual',
      detail: 'Generate from AI Posture page'
    }
  ];
};

export class AuditorPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: null,
      data: null,
      cachedAt: null,
      recentEvents: [],
      eventsLoading: true
    };
    this.orgUnsubscribe = null;
  }

  componentDidMount() {
    this.orgUnsubscribe = orgContext.onChange(() => this.loadAll());
    this.loadAll();
  }

  componentWillUnmount() {
    if (this.orgUnsubscribe) this.orgUnsubscribe();
  }

  async loadAll() {
    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;

    if (!orgId) {
      window.location.hash = '#!/login';
      return;
    }

    // ── 1. Try cross-page sessionStorage cache (zero cost if Dashboard loaded this session) ──
    let cachedData = null;
    let cachedAt = null;

    try {
      const sessionRaw = sessionStorage.getItem(SESSION_DASH_KEY(orgId));
      if (sessionRaw) {
        const parsed = JSON.parse(sessionRaw);
        cachedData = parsed?.data ?? parsed;
        cachedAt = parsed?.ts ?? null;
      }
    } catch {}

    // ── 2. Fall back to localStorage with TTL ────────────────────────────────────────────────
    if (!cachedData) {
      try {
        const lsRaw = localStorage.getItem(LS_AUDITOR_KEY(orgId));
        if (lsRaw) {
          const parsed = JSON.parse(lsRaw);
          if (parsed?.ts && Date.now() - parsed.ts < LS_TTL_MS) {
            cachedData = parsed.data;
            cachedAt = parsed.ts;
          }
        }
      } catch {}
    }

    // ── 3. Render cached dashboard data immediately (stale-while-revalidate) ────────────────
    if (cachedData) {
      this.setState({ data: cachedData, loading: false, cachedAt, error: null });
    } else {
      this.setState({ loading: true, error: null, eventsLoading: true });
    }

    // ── 4. Background refresh — always fetch dashboard + audit events in parallel ────────────
    const [dashboardResult, auditResult] = await Promise.allSettled([
      api.getUnifiedDashboard(orgId, { format: 'unified', include: 'cached-summary' }),
      api.get(`/api/v1/orgs/${orgId}/audit?pageSize=10&days=30`)
    ]);

    const dashState = {};
    if (dashboardResult.status === 'fulfilled' && dashboardResult.value?.success) {
      const now = Date.now();
      try {
        sessionStorage.setItem(SESSION_DASH_KEY(orgId), JSON.stringify({ data: dashboardResult.value.data, ts: now }));
        localStorage.setItem(LS_AUDITOR_KEY(orgId), JSON.stringify({ data: dashboardResult.value.data, ts: now }));
      } catch {}
      dashState.data = dashboardResult.value.data;
      dashState.cachedAt = now;
      dashState.loading = false;
      dashState.error = null;
    } else if (!cachedData) {
      dashState.error = dashboardResult.reason?.message || 'Failed to load dashboard data';
      dashState.loading = false;
    }

    const eventState = {};
    if (auditResult.status === 'fulfilled' && auditResult.value?.success) {
      eventState.recentEvents = auditResult.value.data?.events?.slice(0, 10) || [];
    }
    eventState.eventsLoading = false;

    this.setState({ ...dashState, ...eventState });
  }

  getStatusIcon(status) {
    if (status === 'complete') return html`
      <svg class="icon text-success" width="20" height="20" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>
    `;
    if (status === 'partial') return html`
      <svg class="icon text-warning" width="20" height="20" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    `;
    if (status === 'manual') return html`
      <svg class="icon text-info" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12.01" y2="8" /><polyline points="11 12 12 12 12 16 13 16" /></svg>
    `;
    return html`
      <svg class="icon text-danger" width="20" height="20" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    `;
  }

  getStatusBadge(status) {
    const map = {
      complete: 'bg-success-lt text-success',
      partial: 'bg-warning-lt text-warning',
      manual: 'bg-info-lt text-info',
      missing: 'bg-danger-lt text-danger'
    };
    const labelMap = { complete: 'Complete', partial: 'Partial', manual: 'Manual', missing: 'Not Met' };
    return html`<span class="badge ${map[status] || 'bg-secondary-lt'}">${labelMap[status] || status}</span>`;
  }

  formatCachedAt(ts) {
    if (!ts) return null;
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  formatTimestamp(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const ageMs = Date.now() - d.getTime();
    const mins = Math.floor(ageMs / 60000);
    const hours = Math.floor(ageMs / 3600000);
    const days = Math.floor(ageMs / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  getReadinessTone(percent) {
    if (percent >= 80) return { text: 'Deployment Ready', color: 'success' };
    if (percent >= 60) return { text: 'Needs Hardening', color: 'warning' };
    return { text: 'At Risk', color: 'danger' };
  }

  renderCommandCenter(data, cachedAt) {
    const compliance = data?.businessOwner?.complianceCard || {};
    const score = data?.securityScore || {};
    const risk = data?.businessOwner?.riskSummary || {};
    const pct = compliance?.percent || 0;
    const readiness = this.getReadinessTone(pct);
    const asOf = this.formatCachedAt(cachedAt);

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #0b3b66 0%, #145da0 45%, #1f7fbf 100%); color: #fff;">
          <div class="card-body p-4 p-md-5">
            <div class="row g-4 align-items-center">
              <div class="col-lg-8">
                <div class="text-uppercase small fw-bold mb-2" style="letter-spacing: .08em; opacity: .9;">Auditor Command Center</div>
                <h2 class="mb-2" style="font-size: 2rem; line-height: 1.15;">Run Evidence Ops, Engage AI, and Publish Executive-Ready Findings</h2>
                <p class="mb-3" style="opacity: .9; max-width: 58ch;">
                  This console is optimized for external audit flow: assess readiness, validate controls, review command chronology,
                  and generate stakeholder-grade briefings in one pass.
                </p>
                <div class="d-flex flex-wrap gap-2">
                  <a href="#!/analyst" class="btn btn-light">
                    <i class="ti ti-message-chatbot me-1"></i> Ask AI Analyst
                  </a>
                  <a href="#!/mission-brief" class="btn btn-outline-light">
                    <i class="ti ti-brain me-1"></i> Build Mission Brief
                  </a>
                  <a href="#!/reports" class="btn btn-outline-light">
                    <i class="ti ti-chart-bar me-1"></i> Open Reports
                  </a>
                </div>
              </div>

              <div class="col-lg-4">
                <div class="card bg-white text-dark border-0 shadow-sm">
                  <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <div class="text-muted small">Current Readiness</div>
                        <div class="h2 mb-0">${pct}%</div>
                      </div>
                      <span class="badge bg-${readiness.color} text-white">${readiness.text}</span>
                    </div>
                    <div class="progress progress-sm mb-2">
                      <div class="progress-bar bg-${readiness.color}" style="width: ${pct}%"></div>
                    </div>
                    <div class="d-flex justify-content-between text-muted small">
                      <span>Security Grade: ${score?.grade || '—'}</span>
                      <span>Risk: ${risk?.riskScore || '—'}</span>
                    </div>
                    ${asOf ? html`<div class="text-muted small mt-2">Snapshot: ${asOf}</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderActionLanes(data) {
    const score = data?.securityScore || {};
    const compliance = data?.businessOwner?.complianceCard || {};
    const urgentActions = score?.urgentActionCount || 0;

    return html`
      <div class="container-xl mb-4">
        <div class="row g-3">
          <div class="col-md-6 col-xl-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-body">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="avatar avatar-sm bg-primary text-white"><i class="ti ti-file-search"></i></span>
                  <div class="fw-semibold">Command Log Review</div>
                </div>
                <div class="text-muted small mb-3">Inspect chronological events and user actions before close-out.</div>
                <a href="#!/audit" class="btn btn-sm btn-outline-primary">Open Command Log</a>
              </div>
            </div>
          </div>

          <div class="col-md-6 col-xl-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-body">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="avatar avatar-sm bg-orange text-white"><i class="ti ti-certificate"></i></span>
                  <div class="fw-semibold">Controls Validation</div>
                </div>
                <div class="text-muted small mb-3">Compliance posture at ${compliance?.percent || 0}% with framework-level drilldown.</div>
                <a href="#!/compliance" class="btn btn-sm btn-outline-warning">Review Compliance</a>
              </div>
            </div>
          </div>

          <div class="col-md-6 col-xl-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-body">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="avatar avatar-sm bg-success text-white"><i class="ti ti-message-chatbot"></i></span>
                  <div class="fw-semibold">AI Co-Auditor</div>
                </div>
                <div class="text-muted small mb-3">Query evidence gaps, summarize issues, and draft executive findings fast.</div>
                <a href="#!/analyst" class="btn btn-sm btn-outline-success">Engage AI Analyst</a>
              </div>
            </div>
          </div>

          <div class="col-md-6 col-xl-3">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-body">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="avatar avatar-sm bg-danger text-white"><i class="ti ti-alert-triangle"></i></span>
                  <div class="fw-semibold">Priority Risks</div>
                </div>
                <div class="text-muted small mb-3">${urgentActions} urgent action(s) currently open and impacting readiness.</div>
                <a href="#!/security" class="btn btn-sm btn-outline-danger">Triage Security</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderReadinessComposite(data, cachedAt) {
    const compliance = data?.businessOwner?.complianceCard || {};
    const score = data?.securityScore || {};
    const risk = data?.businessOwner?.riskSummary || {};
    const pct = compliance?.percent || 0;
    const auditReady = pct >= 80;
    const complianceColor = pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'danger';
    const asOf = this.formatCachedAt(cachedAt);

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Audit Readiness</h3>
            <div class="card-options d-flex align-items-center gap-2">
              ${asOf ? html`<span class="badge bg-secondary-lt text-muted fw-normal" title="Data last refreshed">as of ${asOf}</span>` : ''}
              <a href="#!/auditor" class="btn btn-sm btn-outline-secondary" onClick=${(e) => { e.preventDefault(); this.loadAll(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                Refresh
              </a>
            </div>
          </div>
          <div class="card-body">
            <div class="row g-4 text-center">
              <div class="col-md-3">
                <div class="h1 mb-0 text-${complianceColor}">${pct}%</div>
                <div class="text-muted small mt-1">Compliance Score</div>
                <div class="progress mt-2" style="height: 4px;">
                  <div class="progress-bar bg-${complianceColor}" style="width: ${pct}%"></div>
                </div>
              </div>
              <div class="col-md-3">
                <div class="h1 mb-0 text-${auditReady ? 'success' : 'warning'}">
                  ${auditReady ? 'Ready' : 'Not Ready'}
                </div>
                <div class="text-muted small mt-1">Audit Status</div>
              </div>
              <div class="col-md-3">
                <div class="h1 mb-0">
                  <span class="badge bg-${score?.grade ? (score.grade.startsWith('A') ? 'success' : score.grade.startsWith('B') ? 'info' : score.grade.startsWith('C') ? 'warning' : 'danger') : 'secondary'} fs-3">
                    ${score?.grade || '—'}
                  </span>
                </div>
                <div class="text-muted small mt-1">Security Grade</div>
              </div>
              <div class="col-md-3">
                <div class="h1 mb-0 text-${risk?.overallRisk === 'low' ? 'success' : risk?.overallRisk === 'medium' ? 'warning' : risk?.overallRisk ? 'danger' : 'secondary'}">
                  ${risk?.riskScore || '—'}
                </div>
                <div class="text-muted small mt-1">Risk Score</div>
              </div>
            </div>

            ${compliance?.gapDescription ? html`
              <div class="mt-4 alert alert-${complianceColor}-lt border-0">
                ${compliance.gapDescription}
              </div>
            ` : ''}

            <div class="mt-3 d-flex flex-wrap gap-2 justify-content-center">
              <a href="#!/compliance" class="btn btn-sm btn-outline-${complianceColor}">Validate Controls</a>
              <a href="#!/mission-brief" class="btn btn-sm btn-outline-primary">Generate Briefing</a>
              <a href="#!/reports" class="btn btn-sm btn-outline-secondary">Executive Reports</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderEvidenceChecklist(data) {
    const items = buildEvidenceChecklist(data);
    const completeCount = items.filter(i => i.status === 'complete').length;
    const partialCount = items.filter(i => i.status === 'partial').length;
    const missingCount = items.filter(i => i.status === 'missing').length;
    const totalCount = items.length;

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Evidence Checklist</h3>
            <div class="card-options">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-success-lt text-success">${completeCount} complete</span>
                <span class="badge bg-warning-lt text-warning">${partialCount} partial</span>
                <span class="badge bg-danger-lt text-danger">${missingCount} missing</span>
              </div>
            </div>
          </div>
          <div class="card-body pb-2">
            <div class="d-flex justify-content-between text-muted small mb-1">
              <span>Checklist completion</span>
              <span>${completeCount}/${totalCount}</span>
            </div>
            <div class="progress progress-sm">
              <div class="progress-bar bg-success" style="width: ${totalCount > 0 ? (completeCount / totalCount) * 100 : 0}%"></div>
            </div>
          </div>
          <div class="list-group list-group-flush">
            ${items.map(item => html`
              <div class="list-group-item">
                <div class="row align-items-center">
                  <div class="col-auto">${this.getStatusIcon(item.status)}</div>
                  <div class="col">
                    <div class="d-flex align-items-center gap-2 mb-1">
                      <span class="fw-medium">${item.label}</span>
                      ${this.getStatusBadge(item.status)}
                    </div>
                    <div class="text-muted small">${item.description}</div>
                    <div class="text-muted small mt-1">
                      <em>${item.detail}</em>
                    </div>
                  </div>
                  ${item.id === 'ai-report' ? html`
                    <div class="col-auto">
                      <a href="#!/mission-brief" class="btn btn-sm btn-outline-primary">Generate →</a>
                    </div>
                  ` : ''}
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    `;
  }

  renderRecentEvents() {
    const { recentEvents, eventsLoading } = this.state;

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Recent Command Events</h3>
            <div class="card-options">
              <a href="#!/audit" class="btn btn-sm btn-outline-secondary">View command log →</a>
            </div>
          </div>

          ${eventsLoading ? html`
            <div class="card-body text-center py-4">
              <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
              <div class="text-muted small mt-2">Loading events...</div>
            </div>
          ` : recentEvents.length === 0 ? html`
            <div class="empty py-4">
              <p class="empty-title">No recent audit events</p>
              <p class="empty-subtitle text-muted">Events from the last 30 days will appear here.</p>
            </div>
          ` : html`
            <div class="list-group list-group-flush">
              ${recentEvents.map(event => html`
                <div class="list-group-item">
                  <div class="row align-items-center">
                    <div class="col-auto">
                      <span class="avatar avatar-sm bg-secondary-lt">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /></svg>
                      </span>
                    </div>
                    <div class="col">
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-primary-lt text-primary">${event.eventType || 'Event'}</span>
                        <span class="fw-medium small">${event.entityType || 'Record'}</span>
                      </div>
                      <div class="text-muted small">${event.description || event.performedBy || '—'}</div>
                    </div>
                    <div class="col-auto text-muted small">${this.formatTimestamp(event.timestamp)}</div>
                  </div>
                </div>
              `)}
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderDownloadSection() {
    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col">
                <h4 class="mb-1">Evidence Export Pack</h4>
                <p class="text-muted mb-0">
                  Export a complete audit package including the posture snapshot, compliance evidence,
                  and device inventory for external auditors.
                </p>
              </div>
              <div class="col-auto">
                <button class="btn btn-secondary" disabled title="Evidence export pack — coming soon">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="16" /></svg>
                  Download Evidence Pack
                </button>
                <span class="badge bg-secondary-lt text-secondary ms-2">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const { loading, error, data, cachedAt } = this.state;

    if (loading) {
      return html`
        <div class="container-xl d-flex justify-content-center align-items-center" style="min-height: 60vh;">
          <div class="text-center">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <div class="text-muted">Loading auditor dashboard...</div>
          </div>
        </div>
      `;
    }

    if (error) {
      return html`
        <div class="container-xl py-4">
          <div class="alert alert-danger">${error}</div>
          <button class="btn btn-primary" onClick=${() => this.loadAll()}>Retry</button>
        </div>
      `;
    }

    return html`
      <div style="padding-bottom: 80px;">
        <div class="page-header d-print-none mb-4">
          <div class="container-xl">
            <div class="row g-2 align-items-center">
              <div class="col">
                <h2 class="page-title">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12l2 2l4 -4" /></svg>
                  Auditor Dashboard
                </h2>
                <div class="page-subtitle text-muted">High-impact console for auditor workflows, AI analysis, and executive-ready evidence.</div>
              </div>
              <div class="col-auto">
                <a href="#!/audit" class="btn btn-outline-secondary me-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 8v-2a2 2 0 0 1 2 -2h7l3 3v11a2 2 0 0 1 -2 2h-5" /><path d="M7 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M7 14v3l2 1" /></svg>
                  Full Command Log
                </a>
                <a href="#!/mission-brief" class="btn btn-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><circle cx="12" cy="12" r="4" /></svg>
                  Mission Briefing
                </a>
              </div>
            </div>
          </div>
        </div>

        ${this.renderCommandCenter(data, cachedAt)}
        ${this.renderActionLanes(data)}
        ${this.renderReadinessComposite(data, cachedAt)}
        ${this.renderEvidenceChecklist(data)}
        ${this.renderRecentEvents()}
        ${this.renderDownloadSection()}

        <${ChatDrawer} contextHint="audit readiness and compliance evidence" />
      </div>
    `;
  }
}

export default AuditorPage;
