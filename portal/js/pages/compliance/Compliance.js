/**
 * Compliance Page
 * Compliance-first workspace built on the latest compliance snapshot and typed AI reports.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { getEffectiveMaxInputDate } from '../../utils/effectiveDate.js';
import ChatDrawer from '../../components/ChatDrawer.js';
import { EvidenceBanner, TimeWarpEvidenceCallout } from '../../components/shared/EvidenceBanner.js';
import { TrendSnapshotStrip, getTrendDateRange } from '../../components/TrendSnapshotStrip.js';

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
      evidence: null,
      isRefreshingInBackground: false,
      selectedFramework: 'all',
      selectedDate: toInputDate(null),
      reportLoading: false,
      generatingReport: false,
      reportError: null,
      currentReport: null,
      // Control drill-down
      drilldownControl: null,
      drilldownDevices: [],
      drilldownLoading: false,
      // Cached compliance-control-facts atom (per-device per-control state) for drilldowns
      controlFacts: [],
      // Trend chart
      trendData: [],
      trendLoading: false,
      // D-2: full Compliance Gaps datatable controls (search, sort, paginate).
      // Keeps the headline "Top Compliance Gaps" tile (top 2 highest-priority) above
      // the full board so customers can see the headline and drill into the rest in-page.
      gapBoardSearch: '',
      gapBoardSortKey: 'priority',     // 'framework' | 'control' | 'affectedAssets' | 'priority'
      gapBoardSortDir: 'desc',         // 'asc' | 'desc'
      gapBoardPage: 1,
      gapBoardPageSize: 10              // 10 | 25 | 50
    };
    this.orgUnsubscribe = null;
    this._rewindUnsub = null;
  }

  componentDidMount() {
    const reload = () => {
      this.loadPage();
      this.loadTrendData();
    };
    this.orgUnsubscribe = orgContext.onChange(reload);
    this._rewindUnsub = rewindContext.onChange(reload);
    this.loadPage();
    this.loadTrendData();
  }

  componentWillUnmount() {
    if (this.orgUnsubscribe) this.orgUnsubscribe();
    if (this._rewindUnsub) this._rewindUnsub();
  }

  getOrgId() {
    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    return currentOrg?.orgId || user?.email || null;
  }

  _cacheKey() {
    const effectiveDate = rewindContext.isActive?.() ? rewindContext.getDate?.() : 'live';
    return `ms-compliance-${this.getOrgId()}-${effectiveDate || 'live'}`;
  }

  _getCached() {
    try {
      const raw = localStorage.getItem(this._cacheKey());
      if (!raw) return null;
      const { data, timestamp } = JSON.parse(raw);
      const isStale = Date.now() - timestamp >= 15 * 60 * 1000; // 15 min TTL
      return { data, isStale };
    } catch { return null; }
  }

  _setCache(data) {
    try { localStorage.setItem(this._cacheKey(), JSON.stringify({ data, timestamp: Date.now() })); } catch { /* quota */ }
  }

  buildFallbackSnapshot(bundleResp) {
    const data = bundleResp?.data || bundleResp?.Data || {};
    const evidence = data?.evidence || data?.Evidence || null;
    const freshness = data?.freshness || data?.Freshness || null;
    const asOf = evidence?.asOf || evidence?.AsOf || freshness?.asOf || freshness?.AsOf || new Date().toISOString();
    return {
      generatedAt: asOf,
      overallScore: 0,
      standards: [],
      isEvidenceFallback: true
    };
  }

  async loadPage(forceRefresh = false) {
    const orgId = this.getOrgId();
    if (!orgId) {
      window.location.hash = '#!/login';
      return;
    }

    // SWR: serve cached snapshot immediately
    if (!forceRefresh) {
      const cached = this._getCached();
      if (cached) {
        this.setState({
          snapshot: cached.data,
          evidence: null,
          loading: false,
          isRefreshingInBackground: true,
          error: null,
          selectedDate: toInputDate(cached.data?.generatedAt)
        }, () => this.loadLatestReport());
      }
    }

    if (!this.state.snapshot) {
      this.setState({ loading: true, error: null });
    }

    try {
      // Phase 4.3.3: source the compliance snapshot from the unified page bundle.
      // The 'compliance' bundle's 'compliance-snapshot' atom emits ComplianceSnapshotValue
      // rows that match the legacy /compliance/latest payload shape (overallScore, standards, generatedAt).
      const bundleResp = await api.getPageBundle(orgId, 'compliance');
      if (!bundleResp?.success) {
        throw new Error(bundleResp?.message || 'Failed to load the compliance report');
      }
      const evidence = bundleResp?.data?.evidence || bundleResp?.data?.Evidence || null;
      const atom = bundleResp?.data?.atoms?.['compliance-snapshot'];
      const atomRows = atom?.data || atom?.Data || [];
      const snapshot = Array.isArray(atomRows) && atomRows.length > 0 ? atomRows[0] : null;
      // compliance-control-facts is per-device per-control state — cache for drilldowns.
      const controlFactsAtom = bundleResp?.data?.atoms?.['compliance-control-facts'];
      const controlFacts = controlFactsAtom?.data || controlFactsAtom?.Data || [];
      const effectiveSnapshot = snapshot || this.buildFallbackSnapshot(bundleResp);

      if (snapshot) this._setCache(snapshot);
      this.setState({
        snapshot: effectiveSnapshot,
        evidence,
        controlFacts: Array.isArray(controlFacts) ? controlFacts : [],
        loading: false,
        isRefreshingInBackground: false,
        error: null,
        selectedDate: toInputDate(effectiveSnapshot?.generatedAt)
      }, () => {
        this.loadLatestReport();
      });
    } catch (err) {
      this.setState({
        loading: false,
        isRefreshingInBackground: false,
        evidence: err?.evidence || this.state.evidence,
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
      const response = date
        ? await api.getAIReportByDate(orgId, date, {
            reportKind: REPORT_KIND,
            framework
          })
        : await api.getLatestAIReport(orgId, {
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

      window.toast?.show?.('Compliance report generated.', 'success', 3500);

      await this.loadLatestReport();
    } catch (err) {
      const message = err?.message || 'Failed to generate compliance report';
      this.setState({ generatingReport: false, reportError: message });
      window.toast?.show?.(message, 'error', 5000);
    }
  }

  // ── Control drill-down ─────────────────────────────────────────────────────

  openDrilldown(gap) {
    this.setState({ drilldownControl: gap, drilldownDevices: [], drilldownLoading: true });
    this.loadControlDevices(gap.controlId);
  }

  closeDrilldown() { this.setState({ drilldownControl: null, drilldownDevices: [], drilldownLoading: false }); }

  async loadControlDevices(controlId) {
    const orgId = this.getOrgId();
    if (!orgId) return;
    try {
      // Drilldown filters from the compliance-control-facts atom already loaded
      // by the page-bundle on initial mount (cached in state.controlFacts).
      // Each fact row shape: { controlId, deviceId, deviceName, isCompliant, ... }.
      const facts = Array.isArray(this.state.controlFacts) ? this.state.controlFacts : [];
      const rows = facts.filter(f =>
        f && (f.controlId === controlId || f.ControlId === controlId) &&
        (f.isCompliant === false || f.IsCompliant === false)
      );
      this.setState({ drilldownDevices: rows, drilldownLoading: false });
    } catch { this.setState({ drilldownLoading: false }); }
  }

  // ── Compliance trend chart ─────────────────────────────────────────────────

  async loadTrendData() {
    const orgId = this.getOrgId();
    if (!orgId) return;
    this.setState({ trendLoading: true });
    try {
      const range = getTrendDateRange(30);
      const resp = await api.getTrendSnapshots(orgId, range);
      const payload = resp?.data || resp;
      const trends = Array.isArray(payload) ? payload : (payload?.data || payload?.snapshots || []);
      if (Array.isArray(trends)) {
        this.setState({ trendData: trends, trendLoading: false });
      } else {
        this.setState({ trendLoading: false });
      }
    } catch { this.setState({ trendLoading: false }); }
  }

  getFrameworkCards() {    const standards = this.state.snapshot?.standards || [];
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

  // D-2: returns every gap across every live framework, unsliced. The headline tile
  // still uses getTopGaps() (capped) for the "Top Compliance Gaps" highlight; the
  // datatable below uses this so search/sort/paginate operate on the complete set.
  getAllGaps() {
    return this.getFrameworkCards()
      .filter((item) => item.available)
      .flatMap((item) => (item.gaps || []).map((gap) => ({ ...gap, frameworkName: item.shortName })));
  }

  renderHeader(cards) {
    const snapshot = this.state.snapshot || {};
    const liveCount = cards.filter((item) => item.available).length;
    const totalGaps = this.getTopGaps().length;
    const score = snapshot.overallScore || 0;
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    const topGaps = this.getTopGaps().slice(0, 2);

    return html`
      <div class="page-header d-print-none mb-4">
        <div class="container-xl">
          <div class="row g-3 align-items-end">
            <div class="col">
              <div class="page-pretitle">Compliance Command</div>
              <h2 class="page-title">Your Readiness</h2>
              <div class="text-muted mt-1">
                Are you audit-ready? Track compliance alignment and generate evidence.
                ${snapshot.generatedAt ? html`<span class="badge bg-secondary-lt text-secondary ms-2">Evidence prepared ${formatRelativeTimeShort(snapshot.generatedAt)}</span>` : ''}
                ${snapshot.isEvidenceFallback ? html`<span class="badge bg-azure-lt text-azure ms-2">Evidence pending</span>` : ''}
              </div>
            </div>
          </div>

          ${(() => {
            // Green floor pinned to Grade B (>= 80) so the numeric tone matches
            // the displayed Grade badge (eliminates "78 green / Grade C amber" drift).
            const scoreTone = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger';
            const accentVar = scoreTone === 'success' ? 'var(--tblr-success,#2fb344)'
              : scoreTone === 'warning' ? 'var(--tblr-warning,#f59f00)'
              : 'var(--tblr-danger,#d63939)';
            const gapsTone = totalGaps === 0 ? 'success' : totalGaps <= 5 ? 'warning' : 'danger';
            return html`
              <div class="card shadow-sm border-0 mt-3" style=${`border-left:4px solid ${accentVar} !important;`}>
                <div class="card-body p-4">
                  <div class="row align-items-center g-4">
                    <div class="col-lg-4 text-center text-lg-start">
                      <div class="text-uppercase small fw-semibold text-muted mb-1" style="letter-spacing:0.06em;">Audit Score</div>
                      <div class="display-3 fw-bold mb-0 text-${scoreTone}">${score}<span class="h2 text-muted ms-1">/100</span></div>
                      <div class="d-flex align-items-center gap-2 mt-2 justify-content-center justify-content-lg-start">
                        <span class="badge bg-${scoreTone}-lt text-${scoreTone}">Grade ${grade}</span>
                        <span class="badge bg-secondary-lt text-secondary">${liveCount} live standard${liveCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div class="col-lg-5">
                      ${topGaps.length > 0 ? html`
                        <div class="text-uppercase small fw-semibold text-muted mb-2" style="letter-spacing:0.06em;">Top Compliance Gaps</div>
                        ${topGaps.map((gap, i) => html`
                          <div class="d-flex align-items-start gap-2 mb-2">
                            <span class="badge bg-${gapsTone}-lt text-${gapsTone} rounded-circle flex-shrink-0" style="width:24px;height:24px;line-height:20px;padding:0;text-align:center;">${i + 1}</span>
                            <div class="min-w-0">
                              <div class="fw-semibold text-truncate">${gap.controlName || gap.controlId || 'Control gap'}</div>
                              <div class="small text-muted">${gap.frameworkName || ''} \u00b7 ${gap.affectedAssets || 0} device${(gap.affectedAssets || 0) === 1 ? '' : 's'} non-compliant</div>
                            </div>
                          </div>
                        `)}
                      ` : html`
                        <div class="text-center py-3">
                          <div class="fw-semibold text-success"><i class="ti ti-shield-check me-1"></i>All clear</div>
                          <div class="small text-muted">No priority gaps detected</div>
                        </div>
                      `}
                    </div>
                    <div class="col-lg-3 text-center text-lg-end">
                      <div class="d-inline-flex flex-column gap-2 align-items-center align-items-lg-end">
                        <span class="badge bg-${gapsTone}-lt text-${gapsTone}">${totalGaps} priority gap${totalGaps !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })()}
        </div>
      </div>
    `;
  }

  renderCommandDeck() {
    const snapshotDate = this.state.snapshot?.generatedAt;
    const maxSelectableDate = getEffectiveMaxInputDate();

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm" style="background: var(--tblr-bg-surface); border: 1px solid var(--tblr-border-color);">
          <div class="card-body p-4">
            <div class="row g-3 align-items-end">
              <div class="col-12 col-lg-3">
                <label class="form-label text-uppercase small fw-bold text-muted">Report Date</label>
                <input
                  type="date"
                  class="form-control"
                  aria-label="Compliance report date"
                  value=${this.state.selectedDate}
                  max=${maxSelectableDate}
                  onInput=${(e) => this.setState({ selectedDate: e.target.value }, () => this.loadLatestReport())}
                />
                <div class="form-hint">Reports resolve to signals and telemetry from this UTC day.</div>
              </div>
              <div class="col-12 col-lg-4">
                <label class="form-label text-uppercase small fw-bold text-muted">Framework Scope</label>
                <select
                  class="form-select"
                  aria-label="Compliance framework scope"
                  value=${this.state.selectedFramework}
                  onChange=${(e) => this.setState({ selectedFramework: e.target.value }, () => this.loadLatestReport())}
                >
                  <option value="all">All live standards</option>
                  ${FRAMEWORK_CATALOG.map((item) => html`<option value=${item.id}>${item.shortName}</option>`)}
                </select>
                <div class="form-hint">Choose a single standard or generate a combined compliance report.</div>
              </div>
              <div class="col-12 col-lg-5">
                <div class="d-flex flex-wrap gap-2 justify-content-lg-end align-items-center">
                  <button class="btn btn-primary" data-mutates-state="true" disabled=${this.state.generatingReport} onClick=${() => this.generateReport()}>
                    ${this.state.generatingReport ? 'Generating…' : 'Generate Compliance Report'}
                  </button>
                  <a href="#!/mission-brief" class="btn btn-outline-primary">
                    Open Mission Brief Builder
                  </a>
                </div>
              </div>
            </div>
            <div class="row g-3 mt-2">
              <div class="col-lg-8">
                <div class="alert alert-info border-0 mb-0">
                  <strong>Tip:</strong> Pick a date and framework, then generate a dated evidence report you can share with auditors or leadership.
                </div>
              </div>
              <div class="col-lg-4">
                <div class="small text-muted text-lg-end">
                  ${snapshotDate ? html`Latest compliance evidence: <strong>${toInputDate(snapshotDate)}</strong>` : 'No evidence timestamp available'}
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
          <div class="text-muted small">Only evidence-backed standards show live scores. Planned standards stay visible so coverage expectations are clear.</div>
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
                        ${topGap ? html`Top gap: <strong>${topGap.controlId}</strong> · ${topGap.title}` : 'No recorded gaps in this evidence.'}
                      </div>
                      <div class="mt-auto d-flex gap-2">
                        <button class="btn btn-sm btn-primary flex-fill" data-mutates-state="true" onClick=${() => this.generateReport(item.id)}>
                          Generate ${item.shortName} Report
                        </button>
                      </div>
                    ` : html`
                      <div class="alert alert-secondary border-0 mb-3">
                        Dedicated compliance signals for ${item.shortName} are not enabled yet.
                      </div>
                      <div class="small text-muted mt-auto">You can continue using live frameworks for current evidence generation.</div>
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

  // D-2: Full Compliance Gaps datatable.
  // Spec (TASKS.md D-2): keep the "Top Compliance Gaps" headline tile (rendered in
  // renderHeader from getTopGaps()) above this board; render the *complete* gap list
  // here with search, sort, and pagination (10/25/50 rows). No modal, no separate sub-page.
  // Source data is the same per-framework `gaps[]` already loaded into the snapshot —
  // the spec mentions /api/v1/orgs/{orgId}/compliance/gaps as the canonical endpoint;
  // routing this through the snapshot read keeps the page on the existing single-load
  // path (snapshot already carries every gap; no extra fetch needed).
  renderGapBoard(allGaps) {
    const { gapBoardSearch, gapBoardSortKey, gapBoardSortDir, gapBoardPage, gapBoardPageSize } = this.state;
    const search = (gapBoardSearch || '').trim().toLowerCase();

    // Filter
    const filtered = !search
      ? allGaps.slice()
      : allGaps.filter((gap) => {
          const blob = [
            gap.frameworkName,
            gap.controlId,
            gap.title,
            gap.controlName,
            gap.description,
            gap.remediation
          ].filter(Boolean).join(' ').toLowerCase();
          return blob.includes(search);
        });

    // Sort
    const dir = gapBoardSortDir === 'asc' ? 1 : -1;
    const sortKey = gapBoardSortKey || 'priority';
    const cmp = (a, b) => {
      let av, bv;
      if (sortKey === 'framework') { av = (a.frameworkName || '').toLowerCase(); bv = (b.frameworkName || '').toLowerCase(); }
      else if (sortKey === 'control') { av = (a.controlId || '').toLowerCase(); bv = (b.controlId || '').toLowerCase(); }
      else if (sortKey === 'affectedAssets') { av = a.affectedAssets || 0; bv = b.affectedAssets || 0; }
      else { av = a.priority || 0; bv = b.priority || 0; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // tiebreaker: priority then affectedAssets desc, stable across equal sort keys
      const tp = (b.priority || 0) - (a.priority || 0);
      if (tp !== 0) return tp;
      return (b.affectedAssets || 0) - (a.affectedAssets || 0);
    };
    const sorted = filtered.sort(cmp);

    // Paginate
    const totalRows = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / gapBoardPageSize));
    const safePage = Math.min(Math.max(1, gapBoardPage), totalPages);
    const startIdx = (safePage - 1) * gapBoardPageSize;
    const endIdx = Math.min(startIdx + gapBoardPageSize, totalRows);
    const pageRows = sorted.slice(startIdx, endIdx);

    const sortIcon = (key) => {
      if (sortKey !== key) return html`<i class="ti ti-arrows-sort text-muted ms-1" style="font-size:0.85em;"></i>`;
      return gapBoardSortDir === 'asc'
        ? html`<i class="ti ti-arrow-up text-primary ms-1" style="font-size:0.85em;"></i>`
        : html`<i class="ti ti-arrow-down text-primary ms-1" style="font-size:0.85em;"></i>`;
    };

    const headerCell = (label, key, extraClasses = '') => html`
      <th class="${extraClasses}" style="cursor:pointer; user-select:none;" onClick=${() => this.toggleGapBoardSort(key)}>
        ${label}${sortIcon(key)}
      </th>
    `;

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h3 class="card-title mb-1">All Compliance Gaps</h3>
              <div class="card-subtitle text-muted">
                ${totalRows === 0 && allGaps.length === 0 ? 'No live compliance gaps in the latest evidence.'
                  : totalRows === 0 ? `No gaps match \u201c${gapBoardSearch}\u201d`
                  : `Showing ${startIdx + 1}\u2013${endIdx} of ${totalRows} gap${totalRows === 1 ? '' : 's'}${search ? ` (filtered from ${allGaps.length})` : ''}`}
              </div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <div class="input-icon">
                <span class="input-icon-addon"><i class="ti ti-search"></i></span>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Search controls, frameworks, remediation\u2026"
                  value=${gapBoardSearch}
                  onInput=${(e) => this.setGapBoardSearch(e.target.value)}
                  style="min-width:260px;"
                />
              </div>
            </div>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table">
              <thead>
                <tr>
                  ${headerCell('Framework', 'framework')}
                  ${headerCell('Control', 'control')}
                  <th>Why It Matters</th>
                  ${headerCell('Affected Assets', 'affectedAssets')}
                  ${headerCell('Priority', 'priority')}
                  <th>Remediation</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                ${totalRows === 0 ? html`
                  <tr>
                    <td colspan="7" class="text-center py-5 text-muted">
                      ${allGaps.length === 0
                        ? 'No live compliance gaps are available in the latest evidence.'
                        : html`No gaps match your search. <button class="btn btn-link btn-sm p-0 ms-1 align-baseline" onClick=${() => this.setGapBoardSearch('')}>Clear filter</button>`}
                    </td>
                  </tr>
                ` : pageRows.map((gap) => {
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
                      <td><span class="badge bg-${urgency.className} text-white">${urgency.label} \u00b7 ${gap.priority || 0}</span></td>
                      <td class="text-muted small">${gap.remediation || 'No remediation text available.'}</td>
                      <td>
                        <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.openDrilldown(gap)} title="View failing devices">
                          Devices
                        </button>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
          ${totalRows > 0 ? html`
            <div class="card-footer d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div class="d-flex align-items-center gap-2">
                <span class="text-muted small">Rows per page</span>
                <select
                  class="form-select form-select-sm"
                  style="width:auto;"
                  value=${gapBoardPageSize}
                  onChange=${(e) => this.setGapBoardPageSize(Number(e.target.value))}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </div>
              <ul class="pagination pagination-sm m-0">
                <li class="page-item ${safePage === 1 ? 'disabled' : ''}">
                  <button class="page-link" type="button" onClick=${() => this.setGapBoardPage(safePage - 1)} disabled=${safePage === 1}>
                    <i class="ti ti-chevron-left"></i> Prev
                  </button>
                </li>
                ${this._gapBoardPaginationRange(safePage, totalPages).map((p) => p === '\u2026' ? html`
                  <li class="page-item disabled"><span class="page-link">\u2026</span></li>
                ` : html`
                  <li class="page-item ${p === safePage ? 'active' : ''}">
                    <button class="page-link" type="button" onClick=${() => this.setGapBoardPage(p)}>${p}</button>
                  </li>
                `)}
                <li class="page-item ${safePage === totalPages ? 'disabled' : ''}">
                  <button class="page-link" type="button" onClick=${() => this.setGapBoardPage(safePage + 1)} disabled=${safePage === totalPages}>
                    Next <i class="ti ti-chevron-right"></i>
                  </button>
                </li>
              </ul>
            </div>
          ` : null}
        </div>
      </div>
    `;
  }

  // Compact pagination range: always include 1, current\u00b11, total, and ellipses for gaps.
  _gapBoardPaginationRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const range = new Set([1, total, current, current - 1, current + 1]);
    const sorted = Array.from(range).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('\u2026');
      out.push(sorted[i]);
    }
    return out;
  }

  setGapBoardSearch(q) {
    this.setState({ gapBoardSearch: q || '', gapBoardPage: 1 });
  }

  setGapBoardPage(p) {
    this.setState({ gapBoardPage: Math.max(1, p) });
  }

  setGapBoardPageSize(size) {
    this.setState({ gapBoardPageSize: size, gapBoardPage: 1 });
  }

  toggleGapBoardSort(key) {
    const { gapBoardSortKey, gapBoardSortDir } = this.state;
    if (gapBoardSortKey === key) {
      this.setState({ gapBoardSortDir: gapBoardSortDir === 'asc' ? 'desc' : 'asc', gapBoardPage: 1 });
    } else {
      // Default direction per column type: descending for numeric (priority, affectedAssets),
      // ascending for textual (framework, control).
      const defaultDir = (key === 'priority' || key === 'affectedAssets') ? 'desc' : 'asc';
      this.setState({ gapBoardSortKey: key, gapBoardSortDir: defaultDir, gapBoardPage: 1 });
    }
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
                <div class="empty-subtitle text-muted">No report exists for ${this.state.selectedDate} (${frameworkLabel}).</div>
                <div class="empty-action mt-3">
                  <button class="btn btn-primary" data-mutates-state="true" onClick=${() => this.generateReport()} disabled=${this.state.generatingReport}>
                    ${this.state.generatingReport ? 'Preparing…' : 'Prepare report now'}
                  </button>
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

  renderDrilldownModal() {
    const { drilldownControl, drilldownDevices, drilldownLoading } = this.state;
    if (!drilldownControl) return null;
    return html`
      <div class="modal modal-blur show d-block" tabIndex="-1" style="background:rgba(0,0,0,0.5);"
           onClick=${e => e.target === e.currentTarget && this.closeDrilldown()}>
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                Failing devices for <span class="text-danger">${drilldownControl.controlId}</span>
              </h5>
              <button type="button" class="btn-close" onClick=${() => this.closeDrilldown()}></button>
            </div>
            <div class="modal-body p-0">
              ${drilldownLoading ? html`
                <div class="d-flex justify-content-center py-5">
                  <div class="spinner-border text-primary"></div>
                </div>
              ` : drilldownDevices.length === 0 ? html`
                <div class="empty py-5">
                  <p class="empty-title">No non-compliant devices found</p>
                  <p class="empty-subtitle text-muted">All devices are passing this control, or compliance data has not been assimilated yet.</p>
                </div>
              ` : html`
                <div class="table-responsive">
                  <table class="table table-vcenter card-table mb-0">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Expected</th>
                        <th>Actual</th>
                        <th>Last Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${drilldownDevices.map(row => html`
                        <tr>
                          <td>
                            <a href=${'#!/devices/' + row.deviceId} class="text-reset fw-medium">${row.deviceId}</a>
                          </td>
                          <td class="text-muted small">${row.expected || '-'}</td>
                          <td class="text-muted small text-truncate" style="max-width:200px;" title=${row.actual || ''}>${row.actual || '-'}</td>
                          <td class="text-muted small">
                            ${row.lastChecked ? new Date(row.lastChecked).toLocaleDateString() : '-'}
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              `}
            </div>
            <div class="modal-footer">
              <div class="text-muted small me-auto">
                ${drilldownControl.title}
              </div>
              <button type="button" class="btn btn-secondary" onClick=${() => this.closeDrilldown()}>Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderTrendChart() {
    const { trendData, trendLoading } = this.state;
    if (trendLoading) return null;
    if (!trendData || trendData.length < 2) return null;

    const sorted = [...trendData].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const scores = sorted.map(d => d.snapshot?.complianceScore || 0);
    const labels = sorted.map(d => {
      const s = String(d.date || '');
      return s.length === 8 ? `${s.slice(4,6)}/${s.slice(6,8)}` : s;
    });

    const maxScore = Math.max(...scores, 100);
    const w = 600, h = 120, pad = 20;
    const xStep = (w - pad * 2) / Math.max(scores.length - 1, 1);

    const pts = scores.map((v, i) => {
      const x = pad + i * xStep;
      const y = h - pad - (v / maxScore) * (h - pad * 2);
      return { x, y, label: labels[i], score: v };
    });

    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
    const gradId = 'compTrendGrad';

    const latest = scores[scores.length - 1];
    const first  = scores[0];
    const trendDir = latest > first + 2 ? 'improving' : latest < first - 2 ? 'declining' : 'stable';
    const trendColor = { improving: '#2fb344', stable: '#0054a6', declining: '#d63939' }[trendDir];
    const trendLabel = { improving: 'Improving ↑', stable: 'Stable →', declining: 'Declining ↓' }[trendDir];

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <div class="card-title">30-Day Compliance Score Trend</div>
            <div class="card-options d-flex align-items-center gap-2">
              <span class="badge text-white" style="background:${trendColor}">${trendLabel}</span>
              <span class="text-muted small">Latest: ${latest}%</span>
            </div>
          </div>
          <div class="card-body p-3">
            <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;">
              <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="${trendColor}" stop-opacity="0.3"/>
                  <stop offset="100%" stop-color="${trendColor}" stop-opacity="0.0"/>
                </linearGradient>
              </defs>
              <!-- Area fill -->
              <polygon
                points="${polyline} ${pts[pts.length-1].x},${h} ${pts[0].x},${h}"
                fill="url(#${gradId})" />
              <!-- Line -->
              <polyline
                points="${polyline}"
                fill="none" stroke="${trendColor}" stroke-width="2" stroke-linejoin="round" />
              <!-- Data points -->
              ${pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 8)) === 0 || i === pts.length - 1).map(p => html`
                <circle cx="${p.x}" cy="${p.y}" r="3" fill="${trendColor}" />
                <text x="${p.x}" y="${p.y - 6}" text-anchor="middle" font-size="10" fill="#6e7582">${p.score}%</text>
              `)}
            </svg>
            <div class="d-flex justify-content-between text-muted small mt-1 px-2">
              <span>${labels[0]}</span>
              <span>${labels[Math.floor(labels.length / 2)]}</span>
              <span>${labels[labels.length - 1]}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSeparationCard() {
    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm" style="border-left:4px solid var(--tblr-warning,#f59f00) !important;">
          <div class="card-body d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
            <div>
              <div class="text-uppercase small fw-semibold text-warning mb-1" style="letter-spacing:0.06em;"><i class="ti ti-route me-1"></i>Workflow</div>
              <h3 class="mb-1">Use Compliance for controls, Mission Brief Builder for risk narrative</h3>
              <div class="text-muted">Compliance focuses on standards and evidence trails. Mission Brief Builder packages security, compliance, and inventory into executive-ready briefs.</div>
            </div>
            <div class="d-flex gap-2">
              <a href="#!/mission-brief" class="btn btn-outline-primary"><i class="ti ti-file-text me-1"></i>Open Mission Brief Builder</a>
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
          <${TimeWarpEvidenceCallout} surface="compliance evidence" />
          <${EvidenceBanner} evidence=${this.state.evidence} pageName="compliance" />
          <div class="alert alert-danger">${this.state.error}</div>
          <button class="btn btn-primary" onClick=${() => this.loadPage()}>Retry</button>
        </div>
      `;
    }

    const frameworkCards = this.getFrameworkCards();
    const allGaps = this.getAllGaps();

    return html`
      <div style="padding-bottom: 88px;">
        ${this.renderHeader(frameworkCards)}
        <div class="container-xl">
          <${TimeWarpEvidenceCallout} surface="compliance evidence" />
          ${this.state.evidence ? html`<${EvidenceBanner} evidence=${this.state.evidence} pageName="compliance" />` : null}
        </div>
        ${this.state.snapshot?.isEvidenceFallback ? html`
          <div class="container-xl mb-4">
            <div class="alert alert-info border-0 shadow-sm">
              The compliance report is still being prepared. The framework catalog, dated report controls, and available trend evidence remain visible so you can see what will populate when control facts arrive.
            </div>
          </div>
        ` : null}
        ${this.renderCommandDeck()}
        ${this.renderFrameworkGrid(frameworkCards)}
        <div class="container-xl">
          <${TrendSnapshotStrip}
            trends=${this.state.trendData}
            context="compliance"
            title="Compliance Trend"
            subtitle="Readiness score, fix velocity, and at-risk devices from daily reports"
          />
        </div>
        ${this.renderTrendChart()}
        ${this.renderGapBoard(allGaps)}
        ${this.renderReportPanel()}
        ${this.renderSeparationCard()}
        <${ChatDrawer} contextHint="compliance posture, framework gaps, and audit evidence" persona="compliance_officer" />
        ${this.renderDrilldownModal()}
      </div>
    `;
  }
}

export default CompliancePage;
