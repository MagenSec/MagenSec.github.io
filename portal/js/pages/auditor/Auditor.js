/**
 * Auditor Evidence Hub — 4-tab workspace for audit readiness, fleet evidence,
 * delta comparison reports, and AI reports library.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import ChatDrawer from '../../components/ChatDrawer.js';
import { bundleToUnifiedPayload } from '../dashboard/bundleAdapter.js';

const { html, Component } = window;

// Shared sessionStorage key — same key written by Dashboard, Compliance, and Auditor pages
const SESSION_DASH_KEY = (orgId) => rewindContext.isActive()
  ? `dashboard_data_${orgId}_${rewindContext.getDate()}`
  : `dashboard_data_${orgId}`;
const LS_AUDITOR_KEY = (orgId) => rewindContext.isActive()
  ? `auditor_${orgId}_${rewindContext.getDate()}`
  : `auditor_${orgId}`;
const LS_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Date helpers for delta tab (API uses yyyyMMdd, inputs use yyyy-MM-dd)
const toApiDate = (isoStr) => isoStr ? isoStr.replace(/-/g, '') : null;
const toIsoDate = (compact) => compact
  ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
  : null;
const daysAgoIso = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayOrRewindIso = () => {
  if (rewindContext.isActive()) return toIsoDate(rewindContext.getDate());
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
      // Readiness tab (main data)
      loading: true,
      error: null,
      data: null,
      cachedAt: null,
      recentEvents: [],
      eventsLoading: true,
      // Tab navigation
      activeTab: 'readiness',
      // Fleet Evidence tab
      fleetLoading: false,
      fleetError: null,
      fleetDevices: null,
      fleetSort: { col: 'lastHeartbeat', dir: 'desc' },
      fleetFilter: '',
      // Delta Report tab
      deltaFrom: daysAgoIso(7),
      deltaTo: todayOrRewindIso(),
      deltaData: null,
      deltaLoading: false,
      deltaError: null,
      // Reports Library tab
      reportLoading: false,
      reportError: null,
      reportData: null,
      reportDate: todayOrRewindIso(),
      // Export
      exportLoading: false,
      exportError: null
    };
    this.orgUnsubscribe = null;
    this._rewindUnsub = null;
  }

  componentDidMount() {
    this.orgUnsubscribe = orgContext.onChange(() => { this.loadAll(); this._resetTabState(); });
    this._rewindUnsub = rewindContext.onChange(() => { this.loadAll(); this._resetTabState(); });
    this.loadAll();
  }

  componentWillUnmount() {
    if (this.orgUnsubscribe) this.orgUnsubscribe();
    if (this._rewindUnsub) this._rewindUnsub();
  }

  _resetTabState() {
    this.setState({
      deltaTo: todayOrRewindIso(),
      fleetDevices: null,
      fleetError: null,
      deltaData: null,
      deltaError: null,
      reportData: null,
      reportError: null,
      reportDate: todayOrRewindIso()
    });
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
    // Phase 4.3.1: dashboard data sourced from page bundle (atoms + live overlays);
    // adapter synthesizes the legacy unified-dashboard shape so this page's renderer
    // does not need to change.
    const [bundleResult, auditResult] = await Promise.allSettled([
      api.getPageBundle(orgId, 'dashboard'),
      api.get(`/api/v1/orgs/${orgId}/audit?pageSize=10&days=30`)
    ]);

    const dashState = {};
    if (bundleResult.status === 'fulfilled' && bundleResult.value?.success) {
      let unifiedShape;
      try {
        unifiedShape = bundleToUnifiedPayload(bundleResult.value.data);
      } catch (e) {
        console.warn('[Auditor] bundleToUnifiedPayload threw', e);
        unifiedShape = bundleResult.value.data;
      }
      const now = Date.now();
      try {
        sessionStorage.setItem(SESSION_DASH_KEY(orgId), JSON.stringify({ data: unifiedShape, ts: now }));
        localStorage.setItem(LS_AUDITOR_KEY(orgId), JSON.stringify({ data: unifiedShape, ts: now }));
      } catch {}
      dashState.data = unifiedShape;
      dashState.cachedAt = now;
      dashState.loading = false;
      dashState.error = null;
    } else if (!cachedData) {
      dashState.error = bundleResult.reason?.message || 'Failed to load dashboard data';
      dashState.loading = false;
    }

    const eventState = {};
    if (auditResult.status === 'fulfilled' && auditResult.value?.success) {
      eventState.recentEvents = auditResult.value.data?.events?.slice(0, 10) || [];
    }
    eventState.eventsLoading = false;

    this.setState({ ...dashState, ...eventState });
  }

  // ── Tab switching ────────────────────────────────────────────────────────────────────────
  async switchTab(tab) {
    if (this.state.activeTab === tab) return;
    this.setState({ activeTab: tab });

    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;
    if (!orgId) return;

    if (tab === 'fleet' && !this.state.fleetDevices && !this.state.fleetLoading) {
      await this.loadFleetEvidence(orgId);
    } else if (tab === 'library' && !this.state.reportData && !this.state.reportLoading) {
      await this.loadReportsLibrary(orgId);
    }
  }

  // ── Fleet Evidence ───────────────────────────────────────────────────────────────────────
  async loadFleetEvidence(orgId) {
    this.setState({ fleetLoading: true, fleetError: null });
    const result = await api.getDevices(orgId);
    if (result?.success) {
      const raw = result.data?.devices || result.data || [];
      this.setState({ fleetDevices: Array.isArray(raw) ? raw : [], fleetLoading: false });
    } else {
      this.setState({ fleetError: result?.message || 'Failed to load fleet data', fleetLoading: false });
    }
  }

  exportFleetCSV() {
    const devices = this.state.fleetDevices || [];
    if (!devices.length) return;
    const headers = ['Device Name', 'Device ID', 'OS', 'Status', 'Last Heartbeat'];
    const rows = devices.map(d => [
      d.deviceName || d.DeviceName || d.deviceId,
      d.deviceId || '',
      d.osName || d.OsName || '',
      d.status || '',
      d.lastHeartbeat || ''
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleet-evidence-${todayOrRewindIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getFleetSorted() {
    const { fleetDevices, fleetSort, fleetFilter } = this.state;
    if (!fleetDevices) return [];
    let items = fleetDevices;
    if (fleetFilter) {
      const q = fleetFilter.toLowerCase();
      items = items.filter(d =>
        (d.deviceName || d.DeviceName || d.deviceId || '').toLowerCase().includes(q) ||
        (d.osName || d.OsName || '').toLowerCase().includes(q) ||
        (d.status || '').toLowerCase().includes(q)
      );
    }
    return [...items].sort((a, b) => {
      let va, vb;
      if (fleetSort.col === 'deviceName') {
        va = (a.deviceName || a.DeviceName || a.deviceId || '').toLowerCase();
        vb = (b.deviceName || b.DeviceName || b.deviceId || '').toLowerCase();
        return fleetSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (fleetSort.col === 'status') {
        va = (a.status || '').toLowerCase();
        vb = (b.status || '').toLowerCase();
        return fleetSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (fleetSort.col === 'lastHeartbeat') {
        va = new Date(a.lastHeartbeat || 0).getTime();
        vb = new Date(b.lastHeartbeat || 0).getTime();
        return fleetSort.dir === 'asc' ? va - vb : vb - va;
      }
      return 0;
    });
  }

  renderSortHeader(col, label) {
    const { fleetSort } = this.state;
    const active = fleetSort.col === col;
    const nextDir = active && fleetSort.dir === 'asc' ? 'desc' : 'asc';
    return html`
      <th class="cursor-pointer user-select-none" onClick=${() => this.setState({ fleetSort: { col, dir: nextDir } })}>
        ${label}${active ? (fleetSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    `;
  }

  getReferenceDate() {
    return rewindContext.getReferenceDate?.() || new Date();
  }

  getReferenceTime() {
    return this.getReferenceDate().getTime();
  }

  getStatusDot(lastHeartbeat) {
    if (!lastHeartbeat) return 'bg-secondary';
    const mins = (this.getReferenceTime() - new Date(lastHeartbeat)) / 60000;
    if (mins < 60) return 'bg-success';       // Online
    if (mins < 1440) return 'bg-info';        // Offline (recent)
    if (mins < 4320) return 'bg-warning';     // Stale (1-3d)
    if (mins < 10080) return 'bg-orange';     // Dormant (3-7d)
    return 'bg-danger';                       // Ghosted (>7d)
  }

  getStatusLabel(device) {
    if (device.status && device.status !== 'Active') return device.status;
    if (!device.lastHeartbeat) return 'Never seen';
    const mins = (this.getReferenceTime() - new Date(device.lastHeartbeat)) / 60000;
    if (mins < 60) return 'Online';
    if (mins < 1440) return 'Offline';
    if (mins < 4320) return 'Stale';
    if (mins < 10080) return 'Dormant';
    return 'Ghosted';
  }

  formatLastSeen(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const hours = (this.getReferenceTime() - d.getTime()) / 3600000;
    if (hours < 0) return 'after selected date';
    if (hours < 1) return `${Math.floor(hours * 60)}m ago`;
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // ── Delta Report ─────────────────────────────────────────────────────────────────────────
  async loadDeltaReport(orgId) {
    const { deltaFrom, deltaTo } = this.state;
    if (!deltaFrom || !deltaTo) return;
    this.setState({ deltaLoading: true, deltaError: null, deltaData: null });
    const result = await api.getOrgDelta(orgId, toApiDate(deltaFrom), toApiDate(deltaTo));
    if (result?.success) {
      this.setState({ deltaData: result.data, deltaLoading: false });
    } else {
      this.setState({
        deltaError: result?.message || result?.error || 'No snapshot data found for this date range',
        deltaLoading: false
      });
    }
  }

  renderDeltaArrow(change) {
    if (!change && change !== 0) return '';
    if (change > 0) return html`<span class="text-success ms-1">▲ +${change}</span>`;
    if (change < 0) return html`<span class="text-danger ms-1">▼ ${change}</span>`;
    return html`<span class="text-muted ms-1">→ no change</span>`;
  }

  renderDeltaSeverityChange(bySeverityChange) {
    if (!bySeverityChange) return null;
    const sev = [
      { key: 'Critical', color: 'danger' },
      { key: 'High', color: 'warning' },
      { key: 'Medium', color: 'info' },
      { key: 'Low', color: 'success' }
    ];
    return html`
      <div class="row g-2 mt-1">
        ${sev.map(({ key, color }) => {
          const n = bySeverityChange[key] || 0;
          return html`
            <div class="col-6 col-md-3">
              <div class="card border-0 bg-light text-center py-2">
                <div class="h5 mb-0 text-${color}">${n > 0 ? '+' + n : n}</div>
                <div class="text-muted small">${key}</div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  // ── Reports Library ──────────────────────────────────────────────────────────────────────
  async loadReportsLibrary(orgId) {
    this.setState({ reportLoading: true, reportError: null });
    const date = toApiDate(this.state.reportDate);
    const result = await api.getAIReportByDate(orgId, date);
    if (result?.success && result?.data) {
      this.setState({ reportData: result.data, reportLoading: false });
    } else {
      this.setState({
        reportError: result?.message || 'No AI Posture Report found for this date. Reports are generated daily.',
        reportLoading: false
      });
    }
  }

  // ── Status helpers ───────────────────────────────────────────────────────────────────────
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
    if (rewindContext.isActive()) {
      return rewindContext.getDateLabel?.() || toIsoDate(rewindContext.getDate());
    }
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
    const ageMs = this.getReferenceTime() - d.getTime();
    if (ageMs < 0) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

  renderExecutiveSummaryStrip(data, cachedAt) {
    const compliance = data?.businessOwner?.complianceCard || {};
    const score = data?.securityScore || {};
    const risk = data?.businessOwner?.riskSummary || {};
    const urgent = score?.urgentActionCount || 0;
    const readiness = this.getReadinessTone(compliance?.percent || 0);
    const asOf = this.formatCachedAt(cachedAt);
    const asOfLabel = rewindContext.isActive() ? 'Evidence date' : 'Last refresh';

    return html`
      <div class="container-xl mb-3">
        <div class="card border-0 shadow-sm">
          <div class="card-body py-3">
            <div class="row g-3 align-items-center">
              <div class="col-lg">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <span class="badge bg-${readiness.color} text-white">${readiness.text}</span>
                  <span class="badge bg-primary-lt text-primary">Security Grade ${score?.grade || '—'}</span>
                  <span class="badge bg-warning-lt text-warning">${urgent} Urgent Action(s)</span>
                  <span class="badge bg-info-lt text-info">Risk ${risk?.riskScore || '—'}</span>
                </div>
                <div class="text-muted small">
                  Executive Snapshot: Compliance ${compliance?.percent || 0}% with ${urgent} priority item(s) pending.
                  ${asOf ? `${asOfLabel} ${asOf}.` : ''}
                </div>
              </div>
              <div class="col-lg-auto d-flex gap-2">
                <a href="#!/mission-brief" class="btn btn-sm btn-primary">Create Executive Brief</a>
                <a href="#!/reports" class="btn btn-sm btn-outline-secondary">Open Board Report</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderAuditPhaseStrip(data) {
    const checklist = buildEvidenceChecklist(data);
    const done = checklist.filter(i => i.status === 'complete').length;
    const total = checklist.length || 1;
    const pct = Math.round((done / total) * 100);

    const phases = [
      { title: 'Phase 1', name: 'Scope & Inventory', detail: 'Assets, users, and boundaries', href: '#!/devices' },
      { title: 'Phase 2', name: 'Control Validation', detail: 'Compliance and security controls', href: '#!/compliance' },
      { title: 'Phase 3', name: 'Evidence & Timeline', detail: 'Command chronology and proofs', href: '#!/audit' },
      { title: 'Phase 4', name: 'Executive Reporting', detail: 'Findings and recommendations', href: '#!/mission-brief' }
    ];

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Audit Mission Flow</h3>
            <div class="card-options">
              <span class="badge bg-secondary-lt text-muted">${pct}% checklist completion</span>
            </div>
          </div>
          <div class="card-body">
            <div class="row g-3">
              ${phases.map((phase) => html`
                <div class="col-md-6 col-xl-3">
                  <a href="${phase.href}" class="card card-link border-0 shadow-sm h-100 text-decoration-none">
                    <div class="card-body">
                      <div class="text-muted small text-uppercase fw-bold">${phase.title}</div>
                      <div class="fw-semibold mb-1">${phase.name}</div>
                      <div class="text-muted small">${phase.detail}</div>
                    </div>
                  </a>
                </div>
              `)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderAIPromptRail() {
    const prompts = [
      {
        title: 'Gap Prioritization',
        prompt: 'Prioritize top compliance gaps by business impact and remediation effort.',
        tone: 'warning'
      },
      {
        title: 'Auditor Narrative',
        prompt: 'Draft a concise auditor narrative summarizing control posture and key risks.',
        tone: 'primary'
      },
      {
        title: 'Executive Actions',
        prompt: 'Generate a 30-day executive action plan with owners and milestones.',
        tone: 'success'
      }
    ];

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">AI Prompt Deck</h3>
            <div class="card-options">
              <a href="#!/analyst" class="btn btn-sm btn-outline-secondary">Open AI Analyst</a>
            </div>
          </div>
          <div class="card-body">
            <div class="row g-3">
              ${prompts.map((item) => html`
                <div class="col-md-4">
                  <div class="card border border-${item.tone}-lt h-100">
                    <div class="card-body">
                      <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-${item.tone} text-white">AI</span>
                        <div class="fw-semibold">${item.title}</div>
                      </div>
                      <p class="text-muted small mb-3">${item.prompt}</p>
                      <a
                        href="#!/analyst?prompt=${encodeURIComponent(item.prompt)}"
                        class="btn btn-sm btn-outline-${item.tone}"
                      >
                        Ask This in Analyst
                      </a>
                    </div>
                  </div>
                </div>
              `)}
            </div>
          </div>
        </div>
      </div>
    `;
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
                <h2 class="mb-2" style="font-size: 2rem; line-height: 1.15;">Review Evidence, Validate Controls, and Prepare Auditor Findings</h2>
                <p class="mb-3" style="opacity: .9; max-width: 58ch;">
                  This workspace is tailored for external auditors: verify control posture, inspect timeline evidence,
                  ask focused AI questions, and compile defensible observations for stakeholder review.
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

  renderAccessGuidance() {
    return html`
      <div class="container-xl mb-4">
        <div class="alert alert-info-lt border-0 d-flex align-items-start gap-2 mb-0" role="alert">
          <span class="avatar avatar-sm bg-info text-white"><i class="ti ti-info-circle"></i></span>
          <div class="flex-fill">
            <div class="fw-semibold">Need to grant Auditor access to another user?</div>
            <div class="small text-muted">
              Go to <strong>Settings</strong> -> <strong>General</strong> -> <strong>Team</strong>, then assign the appropriate access.
            </div>
          </div>
          <a href="#!/settings" class="btn btn-sm btn-outline-info" title="Open Settings to manage team access">
            Open Settings
          </a>
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
    const gradeTone = score?.grade
      ? (score.grade.startsWith('A') ? 'success' : score.grade.startsWith('B') ? 'info' : score.grade.startsWith('C') ? 'warning' : 'danger')
      : 'secondary';
    const asOf = this.formatCachedAt(cachedAt);
    const asOfTitle = rewindContext.isActive() ? 'Evidence date' : 'Data last refreshed';

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-header">
            <h3 class="card-title">Audit Readiness</h3>
            <div class="card-options d-flex align-items-center gap-2">
              ${asOf ? html`<span class="badge bg-secondary-lt text-muted fw-normal" title=${asOfTitle}>as of ${asOf}</span>` : ''}
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
                  <span class="badge bg-${gradeTone}-lt text-${gradeTone} fs-5 d-inline-flex align-items-center gap-1 px-3 py-2">
                    <i class="ti ti-shield-check"></i>
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
    const { exportLoading, exportError } = this.state;
    const asOfDate = rewindContext.isActive() ? rewindContext.getDate() : null;

    const handleExport = async () => {
      const user = auth.getUser();
      const org = orgContext.getCurrentOrg();
      const orgId = org?.orgId || user?.email;
      if (!orgId) return;
      this.setState({ exportLoading: true, exportError: null });
      try {
        await api.exportAuditEvidence(orgId, asOfDate || undefined);
      } catch (err) {
        this.setState({ exportError: err?.message || 'Export failed' });
      } finally {
        this.setState({ exportLoading: false });
      }
    };

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col">
                <h4 class="mb-1">Evidence Export Pack</h4>
                <p class="text-muted mb-0">
                  Download a ZIP containing org/security/compliance snapshots and 90-day audit log CSV —
                  ready for external auditors.
                  ${asOfDate ? html` <span class="badge bg-amber-lt text-amber ms-1">⏪ Historical: ${toIsoDate(asOfDate)}</span>` : ''}
                </p>
                ${exportError ? html`<div class="text-danger small mt-1">${exportError}</div>` : ''}
              </div>
              <div class="col-auto">
                <button
                  class="btn btn-primary"
                  onClick=${handleExport}
                  disabled=${exportLoading}
                >
                  ${exportLoading
                    ? html`<span class="spinner-border spinner-border-sm me-1"></span>Building…`
                    : html`
                      <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="16" /></svg>
                      Download Evidence Pack
                    `}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Fleet Evidence Tab ───────────────────────────────────────────────────────────────────
  renderFleetEvidence() {
    const { fleetLoading, fleetError, fleetFilter } = this.state;
    const devices = this.getFleetSorted();
    const total = this.state.fleetDevices?.length || 0;
    const online = (this.state.fleetDevices || []).filter(d => {
      if (!d.lastHeartbeat) return false;
      return (this.getReferenceTime() - new Date(d.lastHeartbeat)) / 60000 < 60;
    }).length;
    const asOf = rewindContext.isActive()
      ? html`<span class="badge bg-amber-lt text-amber ms-2">⏪ As of ${toIsoDate(rewindContext.getDate())}</span>`
      : '';

    return html`
      <div class="container-xl">
        <div class="card border-0 shadow-sm">
          <div class="card-header flex-wrap gap-2">
            <div>
              <h3 class="card-title mb-0">Fleet Evidence</h3>
              <div class="text-muted small">All enrolled devices — exportable CSV for auditors ${asOf}</div>
            </div>
            <div class="card-options d-flex align-items-center gap-2 flex-wrap">
              <span class="badge bg-primary-lt text-primary">${total} devices</span>
              <span class="badge bg-success-lt text-success">${online} online</span>
              <input
                type="text"
                class="form-control form-control-sm"
                style="width: 180px;"
                placeholder="Filter devices…"
                value=${fleetFilter}
                onInput=${(e) => this.setState({ fleetFilter: e.target.value })}
              />
              <button
                class="btn btn-sm btn-outline-secondary"
                onClick=${() => this.exportFleetCSV()}
                disabled=${!devices.length}
                title="Export device list as CSV"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="16" /></svg>
                Export CSV
              </button>
              <button class="btn btn-sm btn-outline-primary" onClick=${async () => {
                const user = auth.getUser();
                const org = orgContext.getCurrentOrg();
                await this.loadFleetEvidence(org?.orgId || user?.email);
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
              </button>
            </div>
          </div>

          ${fleetLoading ? html`
            <div class="card-body text-center py-5">
              <div class="spinner-border text-primary" role="status"></div>
              <div class="text-muted mt-2">Loading device inventory…</div>
            </div>
          ` : fleetError ? html`
            <div class="card-body">
              <div class="alert alert-danger mb-0">${fleetError}</div>
            </div>
          ` : devices.length === 0 && !fleetFilter ? html`
            <div class="empty py-5">
              <p class="empty-title">No devices enrolled</p>
              <p class="empty-subtitle text-muted">Enroll devices via the MagenSec Engine to populate fleet evidence.</p>
              <a href="#!/devices" class="btn btn-primary btn-sm">View Devices</a>
            </div>
          ` : html`
            <div class="table-responsive">
              <table class="table table-vcenter card-table table-hover">
                <thead>
                  <tr>
                    ${this.renderSortHeader('deviceName', 'Device Name')}
                    <th>OS</th>
                    ${this.renderSortHeader('status', 'Status')}
                    ${this.renderSortHeader('lastHeartbeat', 'Last Seen')}
                    <th>Device ID</th>
                  </tr>
                </thead>
                <tbody>
                  ${devices.map(d => {
                    const name = d.deviceName || d.DeviceName || d.deviceId;
                    const dot = this.getStatusDot(d.lastHeartbeat);
                    const label = this.getStatusLabel(d);
                    return html`
                      <tr>
                        <td>
                          <a href="#!/devices" class="text-reset fw-medium">${name}</a>
                        </td>
                        <td class="text-muted small">${d.osName || d.OsName || '—'}</td>
                        <td>
                          <span class="d-flex align-items-center gap-1">
                            <span class="badge rounded-pill ${dot}" style="width:8px;height:8px;padding:0;"></span>
                            <span class="small">${label}</span>
                          </span>
                        </td>
                        <td class="text-muted small">${this.formatLastSeen(d.lastHeartbeat)}</td>
                        <td class="text-muted small font-monospace">${d.deviceId || '—'}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
            ${fleetFilter && devices.length === 0 ? html`
              <div class="card-body text-center text-muted py-4">
                No devices match "${fleetFilter}"
              </div>
            ` : ''}
          `}
        </div>
      </div>
    `;
  }

  // ── Delta Report Tab ─────────────────────────────────────────────────────────────────────
  renderDeltaReport() {
    const { deltaFrom, deltaTo, deltaLoading, deltaError, deltaData } = this.state;

    const orgId = (() => {
      const u = auth.getUser();
      const org = orgContext.getCurrentOrg();
      return org?.orgId || u?.email;
    })();

    const maxDate = todayOrRewindIso();

    return html`
      <div class="container-xl">
        <!-- Date range selector -->
        <div class="card border-0 shadow-sm mb-4">
          <div class="card-header">
            <h3 class="card-title">Security Posture Comparison</h3>
            <div class="card-options text-muted small">Compare two snapshots to see what changed</div>
          </div>
          <div class="card-body">
            <div class="row g-3 align-items-end">
              <div class="col-md-auto">
                <label class="form-label">From date</label>
                <input
                  type="date"
                  class="form-control"
                  aria-label="Delta comparison from date"
                  value=${deltaFrom}
                  max=${deltaTo || maxDate}
                  onInput=${(e) => this.setState({ deltaFrom: e.target.value })}
                />
              </div>
              <div class="col-md-auto d-flex align-items-end pb-1 text-muted">→</div>
              <div class="col-md-auto">
                <label class="form-label">To date</label>
                <input
                  type="date"
                  class="form-control"
                  aria-label="Delta comparison to date"
                  value=${deltaTo}
                  min=${deltaFrom}
                  max=${maxDate}
                  onInput=${(e) => this.setState({ deltaTo: e.target.value })}
                />
              </div>
              <div class="col-md-auto">
                <button
                  class="btn btn-primary"
                  disabled=${!deltaFrom || !deltaTo || deltaLoading}
                  onClick=${() => this.loadDeltaReport(orgId)}
                >
                  ${deltaLoading
                    ? html`<span class="spinner-border spinner-border-sm me-1"></span> Computing…`
                    : 'Run Comparison'}
                </button>
              </div>
              ${deltaData ? html`
                <div class="col-md-auto">
                  <button class="btn btn-outline-secondary btn-sm" onClick=${() => this.setState({ deltaData: null, deltaError: null })}>
                    Clear
                  </button>
                </div>
              ` : ''}
            </div>
            ${rewindContext.isActive() ? html`
              <div class="alert alert-warning-lt border-0 mt-3 mb-0 py-2 small">
                ⏪ Time Warp active — "To date" capped at ${toIsoDate(rewindContext.getDate())}
              </div>
            ` : ''}
          </div>
        </div>

        ${deltaError ? html`
          <div class="alert alert-warning">
            <div class="fw-semibold">No comparison data available</div>
            ${deltaError}
            <div class="mt-1 small text-muted">Snapshots are created daily. Try dates that fall within your active subscription period.</div>
          </div>
        ` : ''}

        ${!deltaData && !deltaLoading && !deltaError ? html`
          <div class="empty py-5">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><circle cx="12" cy="12" r="4" /></svg>
            </div>
            <p class="empty-title">Select a date range and run the comparison</p>
            <p class="empty-subtitle text-muted">Compares posture snapshots from two points in time to show score changes, new CVEs, and compliance drift.</p>
          </div>
        ` : ''}

        ${deltaData ? html`
          <!-- Score Delta -->
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header">
              <h3 class="card-title">
                <span class="avatar avatar-sm bg-primary-lt text-primary me-2"><i class="ti ti-shield-check"></i></span>
                Security Score
              </h3>
            </div>
            <div class="card-body">
              <div class="row g-4 text-center">
                <div class="col-4">
                  <div class="h2 mb-0">${deltaData.score?.from ?? '—'}</div>
                  <div class="text-muted small mt-1">Score on ${deltaFrom}</div>
                  ${deltaData.score?.gradeFrom ? html`<span class="badge bg-secondary-lt text-secondary">${deltaData.score.gradeFrom}</span>` : ''}
                </div>
                <div class="col-4 d-flex flex-column align-items-center justify-content-center">
                  ${this.renderDeltaArrow(deltaData.score?.change)}
                  <div class="text-muted small mt-1">Net Change</div>
                </div>
                <div class="col-4">
                  <div class="h2 mb-0">${deltaData.score?.to ?? '—'}</div>
                  <div class="text-muted small mt-1">Score on ${deltaTo}</div>
                  ${deltaData.score?.gradeTo ? html`<span class="badge bg-secondary-lt text-secondary">${deltaData.score.gradeTo}</span>` : ''}
                </div>
              </div>
            </div>
          </div>

          <!-- Findings Delta -->
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header">
              <h3 class="card-title">
                <span class="avatar avatar-sm bg-danger-lt text-danger me-2"><i class="ti ti-bug"></i></span>
                Vulnerability Findings
              </h3>
              <div class="card-options">
                <span class="badge bg-secondary-lt text-muted">Total: ${deltaData.findings?.totalFrom ?? 0} → ${deltaData.findings?.totalTo ?? 0}</span>
                ${this.renderDeltaArrow(deltaData.findings?.totalChange)}
              </div>
            </div>
            <div class="card-body">
              <div class="fw-medium mb-1">Change by severity</div>
              ${this.renderDeltaSeverityChange(deltaData.findings?.bySeverityChange)}

              ${deltaData.findings?.newCves?.length ? html`
                <div class="mt-3">
                  <div class="fw-medium text-danger mb-1">
                    <i class="ti ti-circle-plus me-1"></i>${deltaData.findings.newCves.length} New CVE(s) Introduced
                  </div>
                  <div class="d-flex flex-wrap gap-1">
                    ${deltaData.findings.newCves.slice(0, 20).map(cve => html`
                      <span class="badge bg-danger-lt text-danger font-monospace">${cve}</span>
                    `)}
                    ${deltaData.findings.newCves.length > 20 ? html`
                      <span class="badge bg-secondary-lt text-muted">+${deltaData.findings.newCves.length - 20} more</span>
                    ` : ''}
                  </div>
                </div>
              ` : ''}

              ${deltaData.findings?.resolvedCves?.length ? html`
                <div class="mt-3">
                  <div class="fw-medium text-success mb-1">
                    <i class="ti ti-circle-check me-1"></i>${deltaData.findings.resolvedCves.length} CVE(s) Resolved
                  </div>
                  <div class="d-flex flex-wrap gap-1">
                    ${deltaData.findings.resolvedCves.slice(0, 20).map(cve => html`
                      <span class="badge bg-success-lt text-success font-monospace">${cve}</span>
                    `)}
                    ${deltaData.findings.resolvedCves.length > 20 ? html`
                      <span class="badge bg-secondary-lt text-muted">+${deltaData.findings.resolvedCves.length - 20} more</span>
                    ` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Compliance Delta -->
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header">
              <h3 class="card-title">
                <span class="avatar avatar-sm bg-orange-lt text-orange me-2"><i class="ti ti-certificate"></i></span>
                Compliance Score
              </h3>
              <div class="card-options">
                <span class="badge bg-secondary-lt text-muted">${deltaData.compliance?.overallScoreFrom ?? 0}% → ${deltaData.compliance?.overallScoreTo ?? 0}%</span>
                ${this.renderDeltaArrow(deltaData.compliance?.overallChange)}
              </div>
            </div>
            ${deltaData.compliance?.perFramework?.length ? html`
              <div class="table-responsive">
                <table class="table table-sm card-table">
                  <thead>
                    <tr>
                      <th>Framework</th>
                      <th class="text-end">${deltaFrom}</th>
                      <th class="text-end">${deltaTo}</th>
                      <th class="text-end">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${deltaData.compliance.perFramework.map(f => html`
                      <tr>
                        <td class="fw-medium">${f.framework}</td>
                        <td class="text-end text-muted">${f.scoreFrom}%</td>
                        <td class="text-end fw-medium">${f.scoreTo}%</td>
                        <td class="text-end">
                          ${f.change > 0
                            ? html`<span class="text-success">▲ +${f.change}%</span>`
                            : f.change < 0
                              ? html`<span class="text-danger">▼ ${f.change}%</span>`
                              : html`<span class="text-muted">—</span>`}
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            ` : html`<div class="card-body text-muted small">No framework data available for this period.</div>`}
          </div>

          <!-- Devices Delta -->
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header">
              <h3 class="card-title">
                <span class="avatar avatar-sm bg-info-lt text-info me-2"><i class="ti ti-device-laptop"></i></span>
                Device Fleet
              </h3>
              <div class="card-options">
                <span class="badge bg-secondary-lt text-muted">${deltaData.devices?.countFrom ?? 0} → ${deltaData.devices?.countTo ?? 0} devices</span>
                ${this.renderDeltaArrow(deltaData.devices?.countChange)}
              </div>
            </div>
            <div class="card-body">
              ${deltaData.devices?.riskChanges?.length ? html`
                <div class="fw-medium mb-2">Risk Score Changes (top movers)</div>
                <div class="table-responsive">
                  <table class="table table-sm">
                    <thead>
                      <tr><th>Device</th><th class="text-end">From</th><th class="text-end">To</th><th class="text-end">Δ</th></tr>
                    </thead>
                    <tbody>
                      ${deltaData.devices.riskChanges.slice(0, 10).map(d => html`
                        <tr>
                          <td class="small">${d.deviceName || d.deviceId}</td>
                          <td class="text-end text-muted small">${d.riskFrom}</td>
                          <td class="text-end small">${d.riskTo}</td>
                          <td class="text-end small">
                            ${d.change < 0
                              ? html`<span class="text-success">▲ ${Math.abs(d.change)}</span>`
                              : d.change > 0
                                ? html`<span class="text-danger">▼ +${d.change}</span>`
                                : '—'}
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              ` : ''}

              <div class="row g-3 mt-1">
                ${deltaData.devices?.appearedDevices?.length ? html`
                  <div class="col-md-6">
                    <div class="fw-medium text-success mb-1 small">
                      <i class="ti ti-circle-plus me-1"></i>${deltaData.devices.appearedDevices.length} Device(s) Added
                    </div>
                    <div class="d-flex flex-wrap gap-1">
                      ${deltaData.devices.appearedDevices.slice(0, 8).map(id => html`
                        <span class="badge bg-success-lt text-success font-monospace small">${id}</span>
                      `)}
                    </div>
                  </div>
                ` : ''}
                ${deltaData.devices?.removedDevices?.length ? html`
                  <div class="col-md-6">
                    <div class="fw-medium text-danger mb-1 small">
                      <i class="ti ti-circle-minus me-1"></i>${deltaData.devices.removedDevices.length} Device(s) Removed
                    </div>
                    <div class="d-flex flex-wrap gap-1">
                      ${deltaData.devices.removedDevices.slice(0, 8).map(id => html`
                        <span class="badge bg-danger-lt text-danger font-monospace small">${id}</span>
                      `)}
                    </div>
                  </div>
                ` : ''}
                ${!deltaData.devices?.appearedDevices?.length && !deltaData.devices?.removedDevices?.length ? html`
                  <div class="col-12 text-muted small">No devices added or removed during this period.</div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Remediation Velocity Delta -->
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header">
              <h3 class="card-title">
                <span class="avatar avatar-sm bg-success-lt text-success me-2"><i class="ti ti-run"></i></span>
                Remediation Velocity
              </h3>
            </div>
            <div class="card-body">
              <div class="row g-4 text-center">
                <div class="col-md-4">
                  <div class="h3 mb-0">${deltaData.remediation?.avgDaysFrom ?? '—'} d</div>
                  <div class="text-muted small">Avg days to fix (${deltaFrom})</div>
                </div>
                <div class="col-md-4">
                  <div class="h3 mb-0">${deltaData.remediation?.avgDaysTo ?? '—'} d</div>
                  <div class="text-muted small">Avg days to fix (${deltaTo})</div>
                </div>
                <div class="col-md-4">
                  <div class="h3 mb-0">${deltaData.remediation?.remediatedCountTo ?? 0}</div>
                  <div class="text-muted small">Issues resolved by ${deltaTo}</div>
                </div>
              </div>
              <div class="row g-4 text-center mt-1">
                <div class="col-md-6">
                  <div class="small text-muted">Patch compliance</div>
                  <div class="fw-medium">${deltaData.remediation?.patchComplianceFrom ?? 0}% → ${deltaData.remediation?.patchComplianceTo ?? 0}%</div>
                </div>
                <div class="col-md-6">
                  <div class="small text-muted">Speed score</div>
                  <div class="fw-medium">${deltaData.remediation?.speedScoreFrom ?? 0} → ${deltaData.remediation?.speedScoreTo ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── Reports Library Tab ──────────────────────────────────────────────────────────────────
  renderReportsLibrary() {
    const { reportLoading, reportError, reportData, reportDate } = this.state;
    const isRewindActive = rewindContext.isActive();
    const rewindDate = rewindContext.getDate();
    const canRewind = orgContext.hasRewind();

    const orgId = (() => {
      const u = auth.getUser();
      const org = orgContext.getCurrentOrg();
      return org?.orgId || u?.email;
    })();

    // Effective display date: rewind date if active, else the stored reportDate (today)
    const effectiveDate = isRewindActive ? toIsoDate(rewindDate) : reportDate;

    return html`
      <div class="container-xl">

        <!-- Header: no standalone date picker — Rewind controls historical access -->
        <div class="card border-0 shadow-sm mb-4">
          <div class="card-header">
            <div>
              <h3 class="card-title mb-0">AI Security Posture Reports</h3>
              <div class="text-muted small mt-1">AI-generated daily security analysis</div>
            </div>
            <div class="card-options gap-2">
              ${isRewindActive ? html`
                <span class="badge bg-amber-lt text-amber">
                  <i class="ti ti-history me-1"></i>⏪ ${toIsoDate(rewindDate)}
                </span>
                <button class="btn btn-sm btn-ghost-secondary" onClick=${() => rewindContext.deactivate()}>
                  <i class="ti ti-x me-1"></i>Exit Time Warp
                </button>
              ` : html`
                <span class="badge bg-success-lt text-success">
                  <i class="ti ti-broadcast me-1"></i>Live
                </span>
              `}
            </div>
          </div>
          <div class="card-body py-3">
            ${isRewindActive ? html`
              <!-- Rewind mode: showing historical report for the active date -->
              <div class="d-flex align-items-center gap-3">
                <div class="text-muted">
                  <i class="ti ti-calendar-event me-1"></i>
                  Showing report for <strong>${toIsoDate(rewindDate)}</strong>
                  — use the <strong>⏪ Time Warp bar</strong> at the top to change dates.
                </div>
                <button
                  class="btn btn-sm btn-primary ms-auto"
                  disabled=${reportLoading}
                  onClick=${() => this.loadReportsLibrary(orgId)}
                >
                  ${reportLoading
                    ? html`<span class="spinner-border spinner-border-sm me-1"></span>Loading…`
                    : html`<i class="ti ti-refresh me-1"></i>Reload`}
                </button>
              </div>
            ` : html`
              <!-- Live mode: today's report, with upsell for older reports -->
              <div class="d-flex align-items-center gap-3 flex-wrap">
                <div class="text-muted small">
                  <i class="ti ti-calendar-check me-1 text-success"></i>
                  Showing today's report — ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}
                </div>
                <button
                  class="btn btn-sm btn-primary ms-auto"
                  disabled=${reportLoading}
                  onClick=${() => this.loadReportsLibrary(orgId)}
                >
                  ${reportLoading
                    ? html`<span class="spinner-border spinner-border-sm me-1"></span>Loading…`
                    : html`<i class="ti ti-refresh me-1"></i>${reportData ? 'Reload' : 'Load Today\'s Report'}`}
                </button>
                <a href="#!/mission-brief" class="btn btn-sm btn-outline-secondary">Generate New →</a>
              </div>
            `}
          </div>
        </div>

        ${/* Upsell panel — shown when Rewind not active and org doesn't have Rewind access */
          !isRewindActive && !canRewind ? html`
          <div class="card border-0 shadow-sm mb-4" style="background: linear-gradient(135deg, #1a1f3a 0%, #2d3561 100%); color: #fff;">
            <div class="card-body p-4">
              <div class="row align-items-center g-3">
                <div class="col-lg-8">
                  <div class="text-uppercase small fw-bold mb-2" style="opacity:.7; letter-spacing:.08em;">
                    <i class="ti ti-lock me-1"></i>Business Feature
                  </div>
                  <h4 class="mb-2" style="color:#fff;">Access reports from any date in the past year</h4>
                  <p class="mb-3" style="opacity:.8; font-size:.9rem;">
                    <strong>Time Warp</strong> lets you step back to any historical snapshot — see exactly what your security posture
                    looked like on the day of an audit, incident, or compliance review.
                    Every page, every chart, every AI analysis reflects that exact point in time.
                  </p>
                  <div class="d-flex gap-2 flex-wrap">
                    <div class="d-flex align-items-center gap-2 me-3" style="opacity:.85; font-size:.85rem;">
                      <i class="ti ti-check text-success"></i> 365-day history
                    </div>
                    <div class="d-flex align-items-center gap-2 me-3" style="opacity:.85; font-size:.85rem;">
                      <i class="ti ti-check text-success"></i> Ask MAGI about any past date
                    </div>
                    <div class="d-flex align-items-center gap-2 me-3" style="opacity:.85; font-size:.85rem;">
                      <i class="ti ti-check text-success"></i> Evidence packs with historical snapshots
                    </div>
                    <div class="d-flex align-items-center gap-2 me-3" style="opacity:.85; font-size:.85rem;">
                      <i class="ti ti-check text-success"></i> Delta reports across any window
                    </div>
                  </div>
                </div>
                <div class="col-lg-4 text-center">
                  <div class="mb-3" style="font-size: 3rem;">⏪</div>
                  <a href="#!/account" class="btn btn-warning btn-lg fw-semibold px-4">
                    Upgrade to Business
                  </a>
                  <div class="small mt-2" style="opacity:.6;">Includes Time Warp + MAGI + Priority Reports</div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        ${/* Subtle teaser — shown when Rewind available but not active, prompting user to use it */
          !isRewindActive && canRewind ? html`
          <div class="alert alert-info border-0 d-flex align-items-center gap-3 mb-4 py-3">
            <span style="font-size:1.5rem;">⏪</span>
            <div>
              <strong>Want to see a report from a specific date?</strong>
              Use <strong>Time Warp</strong> — activate it from the navbar (
              <i class="ti ti-history"></i>) to travel to any date in the past year.
              Every page, including this one, updates to reflect that snapshot.
            </div>
          </div>
        ` : ''}

        ${reportError ? html`
          <div class="alert alert-warning d-flex align-items-start gap-2">
            <i class="ti ti-info-circle mt-1"></i>
            <div>
              <div class="fw-semibold">Report not available for ${effectiveDate}</div>
              <div class="text-muted small">${reportError}</div>
              <a href="#!/mission-brief" class="btn btn-sm btn-outline-warning mt-2">Generate Today's Report</a>
            </div>
          </div>
        ` : ''}

        ${reportData ? html`
          <!-- Report header card -->
          <div class="card border-0 shadow-sm mb-4" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff;">
            <div class="card-body p-4">
              <div class="row align-items-center g-3">
                <div class="col-lg-8">
                  <div class="text-uppercase small fw-bold mb-1" style="opacity:.8;">AI Security Posture Report</div>
                  <h3 class="mb-1" style="color:#fff;">
                    ${reportData.riskSummary?.riskLevel || 'Security'} Risk Assessment
                  </h3>
                  <div style="opacity:.85;" class="small">
                    Generated ${reportData.generatedAt ? new Date(reportData.generatedAt).toLocaleDateString('en-US', { dateStyle: 'long' }) : effectiveDate}
                    ${isRewindActive ? html` <span class="badge bg-amber-lt text-amber ms-1">⏪ Historical</span>` : ''}
                  </div>
                </div>
                <div class="col-lg-4">
                  <div class="card bg-white text-dark border-0">
                    <div class="card-body py-3 text-center">
                      <div class="h2 mb-0 text-${
                        reportData.riskSummary?.riskLevel === 'Low' ? 'success'
                        : reportData.riskSummary?.riskLevel === 'Medium' ? 'warning'
                        : 'danger'}">${Math.round(reportData.riskSummary?.overallRiskScore || 0)}</div>
                      <div class="text-muted small">Risk Score</div>
                      <span class="badge bg-${
                        reportData.riskSummary?.riskLevel === 'Low' ? 'success'
                        : reportData.riskSummary?.riskLevel === 'Medium' ? 'warning'
                        : 'danger'} text-white mt-1">${reportData.riskSummary?.riskLevel || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Executive Summary -->
          ${reportData.executiveSummary ? html`
            <div class="card border-0 shadow-sm mb-4">
              <div class="card-header">
                <h3 class="card-title"><i class="ti ti-file-description me-2"></i>Executive Summary</h3>
              </div>
              <div class="card-body">
                <p class="text-muted mb-0">${reportData.executiveSummary}</p>
              </div>
            </div>
          ` : ''}

          <!-- Risk Findings -->
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header">
              <h3 class="card-title"><i class="ti ti-bug me-2"></i>Security Findings</h3>
              <div class="card-options d-flex gap-2 flex-wrap">
                ${reportData.riskSummary?.criticalIssues ? html`<span class="badge bg-danger text-white">${reportData.riskSummary.criticalIssues} Critical</span>` : ''}
                ${reportData.riskSummary?.highIssues ? html`<span class="badge bg-warning text-white">${reportData.riskSummary.highIssues} High</span>` : ''}
                ${reportData.riskSummary?.mediumIssues ? html`<span class="badge bg-info text-white">${reportData.riskSummary.mediumIssues} Medium</span>` : ''}
                ${reportData.riskSummary?.lowIssues ? html`<span class="badge bg-success text-white">${reportData.riskSummary.lowIssues} Low</span>` : ''}
              </div>
            </div>
            ${reportData.riskSummary?.topRiskFactors?.length ? html`
              <div class="list-group list-group-flush">
                ${reportData.riskSummary.topRiskFactors.map((f, i) => html`
                  <div class="list-group-item">
                    <div class="row align-items-start">
                      <div class="col-auto">
                        <span class="avatar avatar-sm bg-danger-lt text-danger fw-bold">${i + 1}</span>
                      </div>
                      <div class="col">
                        <div class="fw-medium">${f.category}</div>
                        <div class="text-muted small">${f.description}</div>
                        ${f.mitigation ? html`<div class="small mt-1 text-success"><i class="ti ti-check me-1"></i>${f.mitigation}</div>` : ''}
                      </div>
                      <div class="col-auto">
                        <span class="badge bg-secondary-lt text-muted">${Math.round(f.impactScore)}</span>
                      </div>
                    </div>
                  </div>
                `)}
              </div>
            ` : html`<div class="card-body text-muted small">No risk factors available.</div>`}
          </div>

          <!-- Recommendations -->
          ${reportData.recommendations?.length ? html`
            <div class="card border-0 shadow-sm mb-4">
              <div class="card-header">
                <h3 class="card-title"><i class="ti ti-checklist me-2"></i>Recommendations</h3>
                <div class="card-options">
                  <span class="badge bg-primary-lt text-primary">${reportData.recommendations.length} actions</span>
                </div>
              </div>
              <div class="list-group list-group-flush">
                ${reportData.recommendations.map((rec, i) => html`
                  <div class="list-group-item">
                    <div class="d-flex gap-2">
                      <div class="flex-shrink-0">
                        <span class="badge bg-${i === 0 ? 'danger' : i === 1 ? 'warning' : 'secondary'} text-white rounded-circle" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
                      </div>
                      <div class="text-muted small">${rec}</div>
                    </div>
                  </div>
                `)}
              </div>
            </div>
          ` : ''}

          <!-- Devices at Risk -->
          ${reportData.devicesAtRisk?.length ? html`
            <div class="card border-0 shadow-sm mb-4">
              <div class="card-header">
                <h3 class="card-title"><i class="ti ti-device-laptop me-2"></i>Devices at Risk</h3>
              </div>
              <div class="table-responsive">
                <table class="table table-sm card-table">
                  <thead>
                    <tr><th>Device</th><th>Risk Level</th><th>Top Issue</th></tr>
                  </thead>
                  <tbody>
                    ${reportData.devicesAtRisk.slice(0, 10).map(d => html`
                      <tr>
                        <td class="fw-medium small">${d.deviceName || d.deviceId}</td>
                        <td><span class="badge bg-${d.riskLevel === 'Critical' ? 'danger' : d.riskLevel === 'High' ? 'warning' : 'secondary'} text-white">${d.riskLevel}</span></td>
                        <td class="text-muted small">${d.topIssue || '—'}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <div class="d-flex gap-2 mb-4">
            <a href="#!/mission-brief" class="btn btn-outline-primary btn-sm">Generate New Report</a>
            <a href="#!/reports" class="btn btn-outline-secondary btn-sm">View Board Report</a>
          </div>
        ` : ''}

        ${!reportData && !reportLoading && !reportError ? html`
          <div class="empty py-5">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /></svg>
            </div>
            <p class="empty-title">No report loaded yet</p>
            <p class="empty-subtitle text-muted">
              Click <strong>Load Today's Report</strong> above.
              ${canRewind && !isRewindActive ? ' Activate Time Warp to see any historical date.' : ''}
            </p>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── Tab navigation ───────────────────────────────────────────────────────────────────────
  renderTabs() {
    const { activeTab } = this.state;
    const tabs = [
      { id: 'readiness', icon: 'ti-clipboard-check', label: 'Readiness' },
      { id: 'fleet', icon: 'ti-devices', label: 'Fleet Evidence' },
      { id: 'delta', icon: 'ti-arrows-diff', label: 'Delta Report' },
      { id: 'library', icon: 'ti-file-analytics', label: 'Reports Library' }
    ];

    return html`
      <div class="container-xl mb-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body py-0">
            <ul class="nav nav-tabs card-header-tabs" role="tablist">
              ${tabs.map(t => html`
                <li class="nav-item" role="presentation">
                  <button
                    class="nav-link ${activeTab === t.id ? 'active' : ''}"
                    role="tab"
                    onClick=${(e) => { e.preventDefault(); this.switchTab(t.id); }}
                  >
                    <i class="ti ${t.icon} me-1"></i>${t.label}
                  </button>
                </li>
              `)}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const { loading, error, data, cachedAt, activeTab } = this.state;

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
                  Auditor Evidence Hub
                </h2>
                <div class="page-subtitle text-muted">Readiness, fleet inventory, posture delta, and AI report library — all in one workspace.</div>
              </div>
              <div class="col-auto">
                <a href="#!/audit" class="btn btn-outline-secondary me-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 8v-2a2 2 0 0 1 2 -2h7l3 3v11a2 2 0 0 1 -2 2h-5" /><path d="M7 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M7 14v3l2 1" /></svg>
                  Command Log
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
        ${this.renderAccessGuidance()}
        ${this.renderExecutiveSummaryStrip(data, cachedAt)}

        ${this.renderTabs()}

        ${activeTab === 'readiness' ? html`
          ${this.renderAuditPhaseStrip(data)}
          ${this.renderActionLanes(data)}
          ${this.renderAIPromptRail()}
          ${this.renderReadinessComposite(data, cachedAt)}
          ${this.renderEvidenceChecklist(data)}
          ${this.renderRecentEvents()}
          ${this.renderDownloadSection()}
        ` : activeTab === 'fleet' ? html`
          ${this.renderFleetEvidence()}
        ` : activeTab === 'delta' ? html`
          ${this.renderDeltaReport()}
        ` : activeTab === 'library' ? html`
          ${this.renderReportsLibrary()}
        ` : ''}

        <${ChatDrawer} contextHint="audit readiness and compliance evidence" persona="auditor" />
      </div>
    `;
  }
}

export default AuditorPage;
