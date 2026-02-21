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

    this.setState({ loading: true, error: null, eventsLoading: true });

    // Load dashboard and audit events in parallel
    const [dashboardResult, auditResult] = await Promise.allSettled([
      api.get(`/api/v1/orgs/${orgId}/dashboard?format=unified&include=cached-summary`),
      api.get(`/api/v1/orgs/${orgId}/audit?pageSize=10&days=30`)
    ]);

    const dashState = {};
    if (dashboardResult.status === 'fulfilled' && dashboardResult.value?.success) {
      dashState.data = dashboardResult.value.data;
      dashState.loading = false;
    } else {
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

  renderReadinessComposite(data) {
    const compliance = data?.businessOwner?.complianceCard || {};
    const score = data?.securityScore || {};
    const risk = data?.businessOwner?.riskSummary || {};
    const pct = compliance?.percent || 0;
    const auditReady = pct >= 80;
    const complianceColor = pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'danger';

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Audit Readiness</h3>
            <div class="card-options">
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
          </div>
        </div>
      </div>
    `;
  }

  renderEvidenceChecklist(data) {
    const items = buildEvidenceChecklist(data);
    const completeCount = items.filter(i => i.status === 'complete').length;
    const totalCount = items.length;

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Evidence Checklist</h3>
            <div class="card-options">
              <span class="badge bg-secondary-lt text-muted">${completeCount}/${totalCount} items complete</span>
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
                      <a href="#!/posture-ai" class="btn btn-sm btn-outline-primary">Generate →</a>
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
            <h3 class="card-title">Recent Audit Events</h3>
            <div class="card-options">
              <a href="#!/audit" class="btn btn-sm btn-outline-secondary">View full log →</a>
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
                      <div class="fw-medium small">${event.eventType || 'Event'}</div>
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
                <h4 class="mb-1">Download Audit Package</h4>
                <p class="text-muted mb-0">
                  Export a complete audit package including the posture snapshot, compliance evidence,
                  and device inventory for external auditors.
                </p>
              </div>
              <div class="col-auto">
                <button class="btn btn-secondary" disabled title="Audit package export — coming soon">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="16" /></svg>
                  Download Audit Package
                </button>
                <span class="badge bg-secondary-lt ms-2">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const { loading, error, data } = this.state;

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
                <div class="page-subtitle text-muted">Audit readiness, evidence status, and recent activity</div>
              </div>
              <div class="col-auto">
                <a href="#!/audit" class="btn btn-outline-secondary me-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 8v-2a2 2 0 0 1 2 -2h7l3 3v11a2 2 0 0 1 -2 2h-5" /><path d="M7 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M7 14v3l2 1" /></svg>
                  Full Audit Log
                </a>
                <a href="#!/posture-ai" class="btn btn-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><circle cx="12" cy="12" r="4" /></svg>
                  AI Posture Report
                </a>
              </div>
            </div>
          </div>
        </div>

        ${this.renderReadinessComposite(data)}
        ${this.renderEvidenceChecklist(data)}
        ${this.renderRecentEvents()}
        ${this.renderDownloadSection()}

        <${ChatDrawer} contextHint="audit readiness and compliance evidence" />
      </div>
    `;
  }
}

export default AuditorPage;
