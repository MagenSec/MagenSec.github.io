/**
 * Compliance Page
 * Compliance-first workspace built on the latest compliance snapshot and typed AI reports.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import ChatDrawer from '../../components/ChatDrawer.js';

const { html, Component } = window;

const FRAMEWORK_CATALOG = [
  {
    id: 'cis',
    standardIds: ['CIS'],
    name: 'CIS Controls v8.1',
    shortName: 'CIS',
    description: 'Operational control baseline for endpoint and policy hygiene.',
    status: 'live',
    accent: '#0054a6'
  },
  {
    id: 'nist',
    standardIds: ['NIST'],
    name: 'NIST CSF 2.0',
    shortName: 'NIST',
    description: 'Governance and cyber resilience model for business and IT leadership.',
    status: 'live',
    accent: '#f76707'
  },
  {
    id: 'cert-in',
    standardIds: ['CERT-IN', 'CERT_IN'],
    name: 'CERT-In',
    shortName: 'CERT-In',
    description: 'India-specific operational readiness and incident handling controls.',
    status: 'planned',
    accent: '#2fb344'
  },
  {
    id: 'iso27001',
    standardIds: ['ISO27001', 'ISO_27001'],
    name: 'ISO 27001',
    shortName: 'ISO 27001',
    description: 'Audit-oriented ISMS evidence and control maturity framework.',
    status: 'planned',
    accent: '#d63939'
  }
];

const REPORT_KIND = 'compliance';

function toCompactDate(value) {
  if (!value) return null;
  return String(value).replaceAll('-', '');
}

function toInputDate(value) {
  if (!value) {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return toInputDate(null);
  }

  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function formatRelativeTimeShort(value) {
  if (!value) return 'unknown';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown';

  const diffMs = Date.now() - parsed.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(mins / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
  if (hours >= 1) return `${hours}h ${mins % 60}m ago`;
  return `${mins}m ago`;
}

function renderMarkdown(text) {
  const content = typeof text === 'string' ? text : '';
  if (!content) return '';

  if (!window.marked) {
    return content.replace(/\n/g, '<br>');
  }

  const rawHtml = window.marked.parse(content);
  return window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
}

function getUrgencyTone(priority) {
  if (priority >= 80) return { label: 'Critical', className: 'danger' };
  if (priority >= 60) return { label: 'High', className: 'warning' };
  if (priority >= 40) return { label: 'Medium', className: 'info' };
  return { label: 'Low', className: 'success' };
}

function getFrameworkState(snapshotStandard, catalogItem) {
  if (!snapshotStandard) {
    return {
      ...catalogItem,
      available: false,
      score: null,
      gapCount: null,
      gaps: []
    };
  }

  return {
    ...catalogItem,
    available: true,
    score: snapshotStandard.score,
    gapCount: snapshotStandard.gapCount,
    gaps: snapshotStandard.gaps || [],
    standardId: snapshotStandard.standardId,
    displayName: snapshotStandard.displayName
  };
}

export class CompliancePage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: null,
      snapshot: null,
      selectedFramework: 'all',
      selectedDate: toInputDate(null),
      reportLoading: false,
      generatingReport: false,
      reportError: null,
      currentReport: null
    };
    this.orgUnsubscribe = null;
  }

  componentDidMount() {
    this.orgUnsubscribe = orgContext.onChange(() => this.loadPage());
    this.loadPage();
  }

  componentWillUnmount() {
    if (this.orgUnsubscribe) this.orgUnsubscribe();
  }

  getOrgId() {
    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    return currentOrg?.orgId || user?.email || null;
  }

  async loadPage() {
    const orgId = this.getOrgId();
    if (!orgId) {
      window.location.hash = '#!/login';
      return;
    }

    this.setState({ loading: true, error: null });
    try {
      const snapshotResponse = await api.getLatestComplianceSnapshot(orgId);
      if (!snapshotResponse?.success) {
        throw new Error(snapshotResponse?.message || 'Failed to load compliance snapshot');
      }

      this.setState({
        snapshot: snapshotResponse.data,
        loading: false,
        error: null,
        selectedDate: toInputDate(snapshotResponse.data?.generatedAt)
      }, () => {
        this.loadLatestReport();
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err?.message || 'Failed to load compliance page'
      });
    }
  }

  async loadLatestReport() {
    const orgId = this.getOrgId();
    if (!orgId) return;

    this.setState({ reportLoading: true, reportError: null });
    try {
      const framework = this.state.selectedFramework === 'all' ? undefined : this.state.selectedFramework;
      const date = toCompactDate(this.state.selectedDate);
      const response = await api.getLatestAIReport(orgId, {
        reportKind: REPORT_KIND,
        framework,
        date
      });

      if (response?.success === false) {
        this.setState({ currentReport: null, reportLoading: false, reportError: response.message || null });
        return;
      }

      this.setState({ currentReport: response?.data || response, reportLoading: false, reportError: null });
    } catch (err) {
      this.setState({ currentReport: null, reportLoading: false, reportError: err?.message || 'Failed to load compliance report' });
    }
  }

  async generateReport(frameworkOverride = null) {
    const orgId = this.getOrgId();
    if (!orgId) return;

    const framework = frameworkOverride || this.state.selectedFramework;
    this.setState({ generatingReport: true, reportError: null });
    try {
      const response = await api.generateAIReport(orgId, {
        model: 'heuristic',
        reportKind: REPORT_KIND,
        framework: framework === 'all' ? null : framework,
        date: toCompactDate(this.state.selectedDate)
      });

      if (response?.success === false) {
        throw new Error(response.message || response.error || 'Failed to generate compliance report');
      }

      this.setState({
        currentReport: response?.data || response,
        generatingReport: false,
        reportError: null,
        selectedFramework: framework
      });

      await this.loadLatestReport();
    } catch (err) {
      this.setState({ generatingReport: false, reportError: err?.message || 'Failed to generate compliance report' });
    }
  }

  getFrameworkCards() {
    const standards = this.state.snapshot?.standards || [];
    return FRAMEWORK_CATALOG.map((catalogItem) => {
      const matched = standards.find((standard) => catalogItem.standardIds.includes(standard.standardId));
      return getFrameworkState(matched, catalogItem);
    });
  }

  getTopGaps() {
    return this.getFrameworkCards()
      .filter((item) => item.available)
      .flatMap((item) => (item.gaps || []).map((gap) => ({ ...gap, frameworkName: item.shortName })))
      .sort((left, right) => (right.priority || 0) - (left.priority || 0) || (right.affectedAssets || 0) - (left.affectedAssets || 0))
      .slice(0, 12);
  }

  renderHeader(cards) {
    const snapshot = this.state.snapshot || {};
    const liveCount = cards.filter((item) => item.available).length;
    const plannedCount = cards.filter((item) => !item.available).length;
    const totalGaps = this.getTopGaps().length;

    return html`
      <div class="page-header d-print-none mb-4">
        <div class="container-xl">
          <div class="row g-3 align-items-end">
            <div class="col">
              <div class="page-pretitle">Compliance Command</div>
              <h2 class="page-title">Standards, evidence, and report generation</h2>
              <div class="text-muted mt-1">
                Compliance reports live here. Security posture remains a separate operational view.
                ${snapshot.generatedAt ? html`<span class="badge bg-secondary-lt text-muted ms-2">Signals updated ${formatRelativeTimeShort(snapshot.generatedAt)}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="row row-cols-2 row-cols-lg-4 g-3 mt-1">
            <div class="col">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted text-uppercase small fw-bold mb-1">Overall Alignment</div>
                  <div class="display-6 fw-bold text-primary">${snapshot.overallScore || 0}%</div>
                  <div class="text-muted small mt-1">Based on live compliance signals only</div>
                </div>
              </div>
            </div>
            <div class="col">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted text-uppercase small fw-bold mb-1">Live Standards</div>
                  <div class="display-6 fw-bold text-success">${liveCount}</div>
                  <div class="text-muted small mt-1">Currently instrumented frameworks</div>
                </div>
              </div>
            </div>
            <div class="col">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted text-uppercase small fw-bold mb-1">Planned Standards</div>
                  <div class="display-6 fw-bold text-warning">${plannedCount}</div>
                  <div class="text-muted small mt-1">Frameworks waiting for dedicated signals</div>
                </div>
              </div>
            </div>
            <div class="col">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted text-uppercase small fw-bold mb-1">Priority Gaps</div>
                  <div class="display-6 fw-bold text-danger">${totalGaps}</div>
                  <div class="text-muted small mt-1">Top remediation items across live standards</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderCommandDeck() {
    const snapshotDate = this.state.snapshot?.generatedAt;

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #f8fafc 0%, #eef4ff 100%); border: 1px solid rgba(0,84,166,0.08);">
          <div class="card-body p-4">
            <div class="row g-3 align-items-end">
              <div class="col-12 col-lg-4">
                <label class="form-label text-uppercase small fw-bold text-muted">Report Date</label>
                <input
                  type="date"
                  class="form-control"
                  value=${this.state.selectedDate}
                  onInput=${(e) => this.setState({ selectedDate: e.target.value }, () => this.loadLatestReport())}
                />
                <div class="form-hint">Reports resolve to signals and telemetry from this UTC day.</div>
              </div>
              <div class="col-12 col-lg-4">
                <label class="form-label text-uppercase small fw-bold text-muted">Framework Scope</label>
                <select
                  class="form-select"
                  value=${this.state.selectedFramework}
                  onChange=${(e) => this.setState({ selectedFramework: e.target.value }, () => this.loadLatestReport())}
                >
                  <option value="all">All live standards</option>
                  ${FRAMEWORK_CATALOG.map((item) => html`<option value=${item.id}>${item.shortName}</option>`)}
                </select>
                <div class="form-hint">Choose a single standard or generate a combined compliance report.</div>
              </div>
              <div class="col-12 col-lg-4">
                <div class="d-flex flex-wrap gap-2 justify-content-lg-end">
                  <button class="btn btn-primary" disabled=${this.state.generatingReport} onClick=${() => this.generateReport()}>
                    ${this.state.generatingReport ? 'Generating…' : 'Generate Compliance Report'}
                  </button>
                  <button class="btn btn-outline-secondary" onClick=${() => this.loadPage()}>
                    Refresh Signals
                  </button>
                  <a href="#!/mission-brief" class="btn btn-outline-primary">
                    Security Posture
                  </a>
                </div>
              </div>
            </div>
            <div class="row g-3 mt-2">
              <div class="col-lg-8">
                <div class="alert alert-info border-0 mb-0">
                  <strong>Separation of concerns:</strong> this page owns standards alignment and audit evidence. Security posture remains the operational risk report because it blends vulnerabilities, exposure, and device risk beyond audit controls.
                </div>
              </div>
              <div class="col-lg-4">
                <div class="small text-muted text-lg-end">
                  ${snapshotDate ? html`Latest compliance snapshot: <strong>${toInputDate(snapshotDate)}</strong>` : 'No snapshot timestamp available'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderFrameworkGrid(cards) {
    return html`
      <div class="container-xl mb-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h3 class="mb-0">Framework Status</h3>
          <div class="text-muted small">Only instrumented standards show live scores. Planned standards stay visible so the model remains extensible.</div>
        </div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3">
          ${cards.map((item) => {
            const topGap = item.gaps?.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
            const tone = item.available ? (item.score >= 80 ? 'success' : item.score >= 60 ? 'warning' : 'danger') : 'secondary';
            return html`
              <div class="col">
                <div class="card border-0 shadow-sm h-100" style="border-top: 3px solid ${item.accent};">
                  <div class="card-body d-flex flex-column">
                    <div class="d-flex align-items-start justify-content-between mb-3">
                      <div>
                        <div class="fw-semibold">${item.name}</div>
                        <div class="text-muted small">${item.description}</div>
                      </div>
                      <span class="badge ${item.available ? 'bg-success text-white' : 'bg-secondary text-white'}">${item.available ? 'Live' : 'Planned'}</span>
                    </div>

                    ${item.available ? html`
                      <div class="d-flex align-items-end justify-content-between mb-2">
                        <div>
                          <div class="text-muted text-uppercase small fw-bold">Score</div>
                          <div class="display-6 fw-bold text-${tone}">${item.score}%</div>
                        </div>
                        <div class="text-end">
                          <div class="text-muted text-uppercase small fw-bold">Open Gaps</div>
                          <div class="h2 mb-0 text-${item.gapCount > 0 ? 'danger' : 'success'}">${item.gapCount}</div>
                        </div>
                      </div>
                      <div class="progress progress-sm mb-3">
                        <div class="progress-bar bg-${tone}" style="width: ${item.score}%"></div>
                      </div>
                      <div class="small text-muted mb-3" style="min-height: 3rem;">
                        ${topGap ? html`Top gap: <strong>${topGap.controlId}</strong> · ${topGap.title}` : 'No recorded gaps in this snapshot.'}
                      </div>
                      <div class="mt-auto d-flex gap-2">
                        <button class="btn btn-sm btn-primary flex-fill" onClick=${() => this.generateReport(item.id)}>
                          Generate ${item.shortName} Report
                        </button>
                      </div>
                    ` : html`
                      <div class="alert alert-secondary border-0 mb-3">
                        Dedicated compliance signals for ${item.shortName} are not wired yet. The framework remains visible here so audit and control work can adopt it without another page redesign later.
                      </div>
                      <div class="small text-muted mt-auto">Planned next step: add standards-specific signal mapping and gap extraction.</div>
                    `}
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  renderGapBoard(gaps) {
    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Priority Gap Board</h3>
            <div class="card-subtitle text-muted">Highest-priority controls across currently instrumented standards</div>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Framework</th>
                  <th>Control</th>
                  <th>Why It Matters</th>
                  <th>Affected Assets</th>
                  <th>Priority</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${gaps.length === 0 ? html`
                  <tr>
                    <td colspan="6" class="text-center py-5 text-muted">No live compliance gaps are available in the latest snapshot.</td>
                  </tr>
                ` : gaps.map((gap) => {
                  const urgency = getUrgencyTone(gap.priority || 0);
                  return html`
                    <tr>
                      <td><span class="badge bg-primary text-white">${gap.frameworkName}</span></td>
                      <td>
                        <div class="fw-semibold">${gap.controlId}</div>
                        <div class="text-muted small">${gap.title}</div>
                      </td>
                      <td class="text-muted small">${gap.description || 'No description provided.'}</td>
                      <td>${gap.affectedAssets || 0}</td>
                      <td><span class="badge bg-${urgency.className} text-white">${urgency.label} · ${gap.priority || 0}</span></td>
                      <td class="text-muted small">${gap.remediation || 'No remediation text available.'}</td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderReportPanel() {
    const report = this.state.currentReport;
    const frameworkLabel = this.state.selectedFramework === 'all'
      ? 'All live standards'
      : FRAMEWORK_CATALOG.find((item) => item.id === this.state.selectedFramework)?.shortName || this.state.selectedFramework;

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <div>
              <h3 class="card-title mb-1">Compliance Report Console</h3>
              <div class="text-muted small">Framework scope: ${frameworkLabel} · Date: ${this.state.selectedDate}</div>
            </div>
          </div>
          <div class="card-body">
            ${this.state.reportLoading ? html`
              <div class="d-flex align-items-center gap-2 text-muted">
                <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                Loading compliance report…
              </div>
            ` : this.state.reportError && !report ? html`
              <div class="empty py-4">
                <div class="empty-title">No compliance report for this scope yet</div>
                <div class="empty-subtitle text-muted">Generate a dated compliance report for a single framework or all live standards.</div>
                <div class="empty-action mt-3">
                  <button class="btn btn-primary" onClick=${() => this.generateReport()}>Generate report now</button>
                </div>
              </div>
            ` : report ? html`
              <div class="row g-3 mb-4">
                <div class="col-md-3">
                  <div class="text-muted text-uppercase small fw-bold">Report Kind</div>
                  <div class="fw-semibold">${report.reportKind || REPORT_KIND}</div>
                </div>
                <div class="col-md-3">
                  <div class="text-muted text-uppercase small fw-bold">Report Date</div>
                  <div class="fw-semibold">${toInputDate(report.reportDate || this.state.selectedDate)}</div>
                </div>
                <div class="col-md-3">
                  <div class="text-muted text-uppercase small fw-bold">Framework</div>
                  <div class="fw-semibold">${report.framework || 'all'}</div>
                </div>
                <div class="col-md-3">
                  <div class="text-muted text-uppercase small fw-bold">Generated</div>
                  <div class="fw-semibold">${formatRelativeTimeShort(report.completedAt || report.enqueuedAt)}</div>
                </div>
              </div>
              <div class="markdown" dangerouslySetInnerHTML=${{ __html: renderMarkdown(report.report || '') }}></div>
            ` : null}
          </div>
        </div>
      </div>
    `;
  }

  renderSeparationCard() {
    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm" style="background: linear-gradient(135deg, #fff8e6 0%, #fff2cc 100%);">
          <div class="card-body d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
            <div>
              <div class="text-uppercase small fw-bold text-warning mb-1">Separate from posture</div>
              <h3 class="mb-1">Security posture should not be the only compliance report</h3>
              <div class="text-muted">This page now owns standards alignment and compliance reporting. The posture page remains useful for operational risk, vulnerabilities, and remediation velocity.</div>
            </div>
            <div class="d-flex gap-2">
              <a href="#!/mission-brief" class="btn btn-outline-primary">Open Mission Briefing</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this.state.loading) {
      return html`
        <div class="container-xl d-flex justify-content-center align-items-center" style="min-height: 60vh;">
          <div class="text-center">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <div class="text-muted">Loading compliance command center…</div>
          </div>
        </div>
      `;
    }

    if (this.state.error) {
      return html`
        <div class="container-xl py-4">
          <div class="alert alert-danger">${this.state.error}</div>
          <button class="btn btn-primary" onClick=${() => this.loadPage()}>Retry</button>
        </div>
      `;
    }

    const frameworkCards = this.getFrameworkCards();
    const topGaps = this.getTopGaps();

    return html`
      <div style="padding-bottom: 88px;">
        ${this.renderHeader(frameworkCards)}
        ${this.renderCommandDeck()}
        ${this.renderFrameworkGrid(frameworkCards)}
        ${this.renderGapBoard(topGaps)}
        ${this.renderReportPanel()}
        ${this.renderSeparationCard()}
        <${ChatDrawer} contextHint="compliance posture, framework gaps, and audit evidence" />
      </div>
    `;
  }
}

export default CompliancePage;
