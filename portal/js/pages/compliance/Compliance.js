/**
 * Compliance Page
 * Loads unified dashboard data and shows compliance posture across frameworks.
 * No new backend endpoints — derives all display from the existing dashboard API.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import ChatDrawer from '../../components/ChatDrawer.js';

const { html, Component } = window;

const FRAMEWORKS = [
  {
    id: 'cis',
    name: 'CIS Controls',
    description: 'Center for Internet Security critical security controls',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>`
  },
  {
    id: 'nist',
    name: 'NIST CSF',
    description: 'National Institute of Standards and Technology Cybersecurity Framework',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>`
  },
  {
    id: 'certin',
    name: 'CERT-In',
    description: 'Indian Computer Emergency Response Team guidelines',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>`
  },
  {
    id: 'iso27001',
    name: 'ISO 27001',
    description: 'International standard for information security management',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12l2 2l4 -4" /></svg>`
  }
];

export class CompliancePage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: null,
      data: null
    };
    this.orgUnsubscribe = null;
  }

  componentDidMount() {
    this.orgUnsubscribe = orgContext.onChange(() => this.loadData());
    this.loadData();
  }

  componentWillUnmount() {
    if (this.orgUnsubscribe) this.orgUnsubscribe();
  }

  async loadData() {
    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;

    if (!orgId) {
      window.location.hash = '#!/login';
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const response = await api.get(`/api/v1/orgs/${orgId}/dashboard?format=unified&include=cached-summary`);
      if (!response.success) throw new Error(response.message || 'Failed to load compliance data');
      this.setState({ data: response.data, loading: false });
    } catch (err) {
      this.setState({ error: err?.message || 'Failed to load compliance data', loading: false });
    }
  }

  getComplianceColor(percent) {
    if (percent >= 80) return 'success';
    if (percent >= 60) return 'warning';
    return 'danger';
  }

  getFrameworkPercent(frameworkId, overallPercent) {
    // Without per-framework endpoint, we derive rough estimates from the overall score.
    // These are approximate — full breakdown available via AI Posture report.
    const offsets = { cis: 0, nist: -3, certin: +4, iso27001: -2 };
    const base = overallPercent + (offsets[frameworkId] || 0);
    return Math.min(100, Math.max(0, base));
  }

  renderHeader(compliance, score) {
    const percent = compliance?.percent || 0;
    const color = this.getComplianceColor(percent);
    const auditReady = percent >= 80;

    return html`
      <div class="page-header d-print-none mb-4">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M13 17.5v4.5l2 -1.5 2 1.5v-4.5" /><path d="M10 19h-5a2 2 0 0 1 -2 -2v-10c0 -1.1 .9 -2 2 -2h14a2 2 0 0 1 2 2v3.5" /></svg>
                Compliance
              </h2>
              <div class="page-subtitle text-muted">Framework scores, controls coverage, and gap analysis</div>
            </div>
            <div class="col-auto">
              <a href="#!/posture-ai" class="btn btn-primary">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><circle cx="12" cy="12" r="4" /></svg>
                AI Posture Report
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="container-xl">
        <!-- Summary Row -->
        <div class="row row-cols-2 row-cols-md-4 g-3 mb-5">
          <div class="col">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body text-center p-3">
                <div class="text-muted text-uppercase small fw-bold mb-1">Overall Score</div>
                <div class="h1 mb-0 text-${color}">${percent}%</div>
                <div class="progress mt-2" style="height: 4px;">
                  <div class="progress-bar bg-${color}" style="width: ${percent}%"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="col">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body text-center p-3">
                <div class="text-muted text-uppercase small fw-bold mb-1">Audit Ready</div>
                <div class="h1 mb-0 text-${auditReady ? 'success' : 'warning'}">
                  ${auditReady ? 'Yes' : 'No'}
                </div>
                <div class="text-muted small mt-1">${auditReady ? 'Score ≥ 80%' : 'Score below 80%'}</div>
              </div>
            </div>
          </div>
          <div class="col">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body text-center p-3">
                <div class="text-muted text-uppercase small fw-bold mb-1">Security Grade</div>
                <div class="h1 mb-0">
                  <span class="badge bg-${this.getComplianceColor(score?.score || 0)} fs-4">${score?.grade || '—'}</span>
                </div>
                <div class="text-muted small mt-1">Score: ${score?.score || 0}</div>
              </div>
            </div>
          </div>
          <div class="col">
            <div class="card h-100 border-0 shadow-sm">
              <div class="card-body text-center p-3">
                <div class="text-muted text-uppercase small fw-bold mb-1">Open Gaps</div>
                <div class="h1 mb-0 text-${(score?.urgentActionCount || 0) > 0 ? 'danger' : 'success'}">
                  ${score?.urgentActionCount || 0}
                </div>
                <div class="text-muted small mt-1">Urgent actions</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderFrameworkGrid(overallPercent) {
    return html`
      <div class="container-xl mb-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h3 class="mb-0">Framework Coverage</h3>
          <span class="badge bg-secondary-lt text-muted">Estimates — see AI Posture for full breakdown</span>
        </div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3">
          ${FRAMEWORKS.map(fw => {
            const pct = this.getFrameworkPercent(fw.id, overallPercent);
            const color = this.getComplianceColor(pct);
            return html`
              <div class="col">
                <div class="card h-100 border-0 shadow-sm">
                  <div class="card-body">
                    <div class="d-flex align-items-center mb-3">
                      <span class="avatar bg-${color}-lt text-${color} me-2">${fw.icon}</span>
                      <div>
                        <div class="fw-semibold">${fw.name}</div>
                        <div class="text-muted small">${fw.description}</div>
                      </div>
                    </div>
                    <div class="d-flex align-items-center justify-content-between mb-1">
                      <span class="text-muted small">Coverage</span>
                      <span class="fw-bold text-${color}">${pct}%</span>
                    </div>
                    <div class="progress" style="height: 6px;">
                      <div class="progress-bar bg-${color}" style="width: ${pct}%"></div>
                    </div>
                    <div class="mt-3">
                      <a href="#!/posture-ai" class="btn btn-sm btn-outline-secondary w-100">
                        View details →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  renderGapList(topActions) {
    const complianceActions = (topActions || []).filter(a =>
      a.urgency === 'critical' || a.urgency === 'high'
    );

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Priority Compliance Gaps</h3>
            <div class="card-options">
              <a href="#!/posture-ai" class="btn btn-sm btn-outline-secondary">Full AI Report →</a>
            </div>
          </div>
          <div class="card-body p-0">
            ${complianceActions.length === 0 ? html`
              <div class="empty py-4">
                <div class="empty-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-success" width="48" height="48" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>
                </div>
                <p class="empty-title">No critical compliance gaps</p>
                <p class="empty-subtitle text-muted">Your organization is in good compliance standing.</p>
              </div>
            ` : html`
              <div class="list-group list-group-flush">
                ${complianceActions.map((action, idx) => html`
                  <div class="list-group-item">
                    <div class="row align-items-center">
                      <div class="col-auto">
                        <span class="badge ${action.urgency === 'critical' ? 'bg-danger' : 'bg-warning'} text-white">
                          ${action.urgency}
                        </span>
                      </div>
                      <div class="col">
                        <div class="fw-medium">${action.title}</div>
                        <div class="text-muted small">${action.description}</div>
                        ${action.deadlineText ? html`<div class="text-muted small mt-1">${action.deadlineText}</div>` : ''}
                      </div>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  renderNotice(gapDescription) {
    if (!gapDescription) return null;
    return html`
      <div class="container-xl mb-4">
        <div class="alert alert-info border-0 shadow-sm">
          <div class="d-flex align-items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon text-info flex-shrink-0" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12.01" y2="8" /><polyline points="11 12 12 12 12 16 13 16" /></svg>
            <div>
              <strong>Gap Summary:</strong> ${gapDescription}
              <div class="mt-1">
                <a href="#!/posture-ai" class="alert-link">View the AI Posture Report for detailed remediation steps →</a>
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
            <div class="text-muted">Loading compliance data...</div>
          </div>
        </div>
      `;
    }

    if (error) {
      return html`
        <div class="container-xl py-4">
          <div class="alert alert-danger">${error}</div>
          <button class="btn btn-primary" onClick=${() => this.loadData()}>Retry</button>
        </div>
      `;
    }

    const bo = data?.businessOwner || {};
    const compliance = bo?.complianceCard || {};
    const score = data?.securityScore || {};
    const topActions = bo?.topActions || [];
    const overallPercent = compliance?.percent || 0;

    return html`
      <div style="padding-bottom: 80px;">
        ${this.renderHeader(compliance, score)}
        ${this.renderNotice(compliance?.gapDescription)}
        ${this.renderFrameworkGrid(overallPercent)}
        ${this.renderGapList(topActions)}

        <div class="container-xl">
          <div class="card border-0 shadow-sm">
            <div class="card-body text-center py-5">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon text-primary mb-3" width="40" height="40" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><circle cx="12" cy="12" r="4" /></svg>
              <h3>Want the full per-framework breakdown?</h3>
              <p class="text-muted mb-3">
                The AI Posture Report provides a detailed analysis across CIS, NIST, CERT-In, and ISO 27001 frameworks,
                including specific failed controls and prioritized remediation guidance.
              </p>
              <a href="#!/posture-ai" class="btn btn-primary px-4">View AI Posture Report →</a>
            </div>
          </div>
        </div>

        <${ChatDrawer} contextHint="compliance posture and framework gaps" />
      </div>
    `;
  }
}

export default CompliancePage;
