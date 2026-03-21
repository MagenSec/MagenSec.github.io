/**
 * UnifiedDashboard - Persona-driven security dashboard
 * Uses html`` template literals (no JSX)
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import PersonaNav from './PersonaNav.js';
import { buildOfficerNoteStatusCopy } from './OfficerNoteCopy.js';

const { html, Component } = window;
const BUSINESS_ONLY_TOOLTIP = 'Feature available in Business License only';
const BUSINESS_ONLY_ROUTES = new Set(['#!/compliance', '#!/reports', '#!/auditor', '#!/analyst']);

function renderMarkdown(text) {
  if (!text) return '';
  let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
  return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

export default class UnifiedDashboard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      refreshing: false,
      error: null,
      refreshError: null,
      data: null,
      isRefreshingInBackground: false,
      activePersona: 'business', // business | it | security | auditor
      personaSheetOpen: false,
      aiPrompt: '',
      aiAnswer: null,
      aiLoading: false,
      aiError: null,
      addOnSignals: {
        loading: false,
        peerBenchmark: null,
        hygieneCoach: null
      },
      cyberHygieneCollapsed: true,
      officerNoteOpen: false,
      officerNoteDismissed: false
    };
    this.cyberChartRef = null;
    this._cyberChart = null;
    this._cyberTheme = null;
    this._cyberSeriesSignature = null;
    this._sheetDismissHandler = null;
    this._orgChangeUnsub = null;
    this._rewindUnsub = null;
  }

  isPersonalOrg() {
    return orgContext.getCurrentOrg()?.type === 'Personal';
  }

  isBusinessOnlyHref(href) {
    return BUSINESS_ONLY_ROUTES.has(href);
  }

  getBusinessOnlyMeta(href) {
    const isBusinessOnly = this.isBusinessOnlyHref(href);
    const isPersonal = this.isPersonalOrg();
    const shouldDisable = isBusinessOnly && isPersonal;

    return {
      className: shouldDisable ? 'business-license-only' : '',
      title: shouldDisable ? BUSINESS_ONLY_TOOLTIP : '',
      dataTooltip: shouldDisable ? BUSINESS_ONLY_TOOLTIP : ''
    };
  }

  componentDidMount() {
    this.loadDashboard();
    this._orgChangeUnsub = orgContext.onChange(() => {
      // Clear cached dashboard data for old org and reload for new org
      try {
        for (const key of [...Object.keys(localStorage)]) {
          if (key.startsWith('unified_dashboard_')) localStorage.removeItem(key);
        }
      } catch (_) {}
      this.loadDashboard();
    });
    this._rewindUnsub = rewindContext.onChange(() => this.loadDashboard({ skipCache: true }));
  }

  componentWillUnmount() {
    if (this._orgChangeUnsub) this._orgChangeUnsub();
    if (this._rewindUnsub) this._rewindUnsub();
    if (this._cyberChart) {
      this._cyberChart.destroy();
      this._cyberChart = null;
    }
    this._cyberTheme = null;
    this._cyberSeriesSignature = null;
  }

  componentDidUpdate() {
    this.renderCyberHygieneChart();
  }

  getCachedDashboard(key, ttlMinutes = 30) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const ageMs = Date.now() - timestamp;
      const TTL_MS = ttlMinutes * 60 * 1000;
      const isStale = ageMs >= TTL_MS;

      return { data, isStale };
    } catch (err) {
      console.warn('[UnifiedDashboard] Cache read error:', err);
    }
    return null;
  }

  setCachedDashboard(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (err) {
      console.warn('[UnifiedDashboard] Cache write error:', err);
    }
  }

  getOfficerNoteDismissKey(orgId) {
    return `officer_note_unified_${orgId}`;
  }

  isOfficerNoteDismissed(orgId) {
    if (!orgId) return false;
    try {
      return sessionStorage.getItem(this.getOfficerNoteDismissKey(orgId)) === '1';
    } catch {
      return false;
    }
  }

  dismissOfficerNote(orgId) {
    if (!orgId) {
      this.setState({ officerNoteDismissed: true });
      return;
    }
    try {
      sessionStorage.setItem(this.getOfficerNoteDismissKey(orgId), '1');
    } catch (_) {
      // Best effort persistence.
    }
    this.setState({ officerNoteDismissed: true, officerNoteOpen: false });
  }

  async loadDashboard({ refresh, background, skipCache } = {}) {
    try {
      const isBackground = !!background;
      const isRefresh = !!refresh && !isBackground;
      this.setState({
        loading: !this.state.data && !isRefresh && !isBackground,
        refreshing: isRefresh && !isBackground,
        error: null,
        refreshError: null
      });

      const user = auth.getUser();
      const currentOrg = orgContext.getCurrentOrg();
      const orgId = currentOrg?.orgId || user?.email;

      if (!orgId) {
        window.location.hash = '#!/login';
        return;
      }

      const warpDate = rewindContext.getDate?.() || null;
      const cacheKey = warpDate
        ? `unified_dashboard_${orgId}_warp_${warpDate}`
        : `unified_dashboard_${orgId}`;

      if (!isRefresh && !skipCache) {
        const cached = this.getCachedDashboard(cacheKey, 30);
        if (cached?.data) {
          this.setState(prevState => ({
            data: cached.data,
            loading: false,
            refreshing: false,
            isRefreshingInBackground: true,
            error: null,
            refreshError: null,
            personaSheetOpen: false,
            officerNoteDismissed: this.isOfficerNoteDismissed(orgId)
          }));

          // If cached counters are stale/partial, hydrate from devices + inventory APIs.
          this.hydrateDashboardStats(orgId, cached.data);

          await this.loadDashboard({ background: true, skipCache: true });
          return;
        }
      }

      const params = { format: 'unified' };
      if (warpDate) {
        params.date = warpDate;
      } else if (isRefresh) {
        params.refresh = 'true';
      } else {
        params['include'] = 'cached-summary';
      }

      const response = await api.getUnifiedDashboard(orgId, params);

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dashboard');
      }

      let normalizedData = response.data;
      if (normalizedData) {
        normalizedData = await this.normalizeDashboardStats(orgId, normalizedData);
        this.setCachedDashboard(cacheKey, normalizedData);
        this.loadAddOnSignals(orgId);
      }

      this.setState(prevState => ({
        data: normalizedData,
        loading: false,
        refreshing: false,
        isRefreshingInBackground: false,
        // Keep drawer collapsed by default; user can open intentionally.
        personaSheetOpen: false,
        officerNoteDismissed: this.isOfficerNoteDismissed(orgId)
      }));
    } catch (err) {
      console.error('Failed to load unified dashboard:', err);

      const message = err?.message || 'Failed to load dashboard data';
      const isRefresh = !!refresh;
      const isBackground = !!background;

      // If we already have data, keep showing it and surface a non-blocking refresh error.
      if ((isRefresh || isBackground) && this.state.data) {
        this.setState({
          refreshError: message,
          loading: false,
          refreshing: false,
          isRefreshingInBackground: false
        });
        return;
      }

      this.setState({
        error: message,
        loading: false,
        refreshing: false,
        isRefreshingInBackground: false
      });
    }
  }

  async loadAddOnSignals(orgId) {
    const canBenchmark = orgContext.hasPeerBenchmark?.() ?? false;
    const canCoach = orgContext.hasHygieneCoach?.() ?? false;

    if (!canBenchmark && !canCoach) {
      this.setState({ addOnSignals: { loading: false, peerBenchmark: null, hygieneCoach: null } });
      return;
    }

    this.setState((prevState) => ({
      addOnSignals: {
        ...prevState.addOnSignals,
        loading: true
      }
    }));

    const requests = [
      canBenchmark
        ? api.get(`/api/v1/orgs/${encodeURIComponent(orgId)}/add-ons/peer-benchmark`)
            .then((resp) => resp?.data?.peerBenchmark || null)
            .catch(() => null)
        : Promise.resolve(null),
      canCoach
        ? api.get(`/api/v1/orgs/${encodeURIComponent(orgId)}/add-ons/hygiene-coach`)
            .then((resp) => resp?.data?.hygieneCoach || null)
            .catch(() => null)
        : Promise.resolve(null)
    ];

    const [peerBenchmark, hygieneCoach] = await Promise.all(requests);
    const activeOrgId = orgContext.getCurrentOrg()?.orgId || auth.getUser()?.email;
    if (activeOrgId !== orgId) {
      return;
    }

    this.setState({
      addOnSignals: {
        loading: false,
        peerBenchmark,
        hygieneCoach
      }
    });
  }

  renderAddOnSpotlights() {
    const { addOnSignals } = this.state;
    const peer = addOnSignals?.peerBenchmark;
    const coach = addOnSignals?.hygieneCoach;

    if (!peer && !coach && !addOnSignals?.loading) {
      return null;
    }

    const cardStyle = 'width:100%;display:flex;flex-direction:column;background:rgba(255,255,255,0.82);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:12px 13px;box-shadow:0 8px 24px rgba(15,23,42,0.07);overflow:hidden;';
    const eyebrowStyle = 'font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;';
    const titleStyle = 'font-size:0.92rem;font-weight:700;color:#111827;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
    const bodyStyle = 'color:#4b5563;font-size:0.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
    const ribbonStyle = (background, color) => `display:inline-flex; align-items:center; justify-content:center; max-width:100%; min-height:26px; padding:5px 12px 6px; border-radius:999px 0 0 999px; background:${background}; color:${color}; font-size:0.72rem; font-weight:800; line-height:1.1; white-space:normal; text-align:center; box-shadow:0 6px 16px rgba(15,23,42,0.12); margin:-12px -13px 0 0;`;

    return html`
      <div class="d-flex flex-column gap-2 h-100">
        ${peer || addOnSignals?.loading ? html`
          <div style=${cardStyle}>
                <div>
                <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                  <div>
                    <div style=${`${eyebrowStyle}color:#6366f1;`}>Peer Benchmark</div>
                    <div style=${titleStyle}>${peer ? `Ahead of ${peer.scorePercentile ?? 0}% of peers` : 'Loading benchmark signal...'}</div>
                  </div>
                  <div style="flex:0 0 auto; display:flex; justify-content:flex-end; align-items:flex-start; max-width:120px;">
                    <span style=${ribbonStyle('linear-gradient(135deg, #2563eb, #4f46e5)', '#ffffff')}>${peer ? `${peer.orgScore ?? 0} score` : '...'}</span>
                  </div>
                </div>
                <div style=${bodyStyle}>
                  ${peer
                    ? `Sector median is ${peer.sectorMedianScore ?? 0}. Cohort: ${peer.sector || 'General'} · ${peer.cohortSize ?? 0} organizations.`
                    : 'Pulling the latest cohort position for this organization.'}
                </div>
                <div class="mt-2 d-flex flex-wrap gap-1" style="min-height:24px;">
                  ${peer?.topGapDomains?.length > 0
                    ? peer.topGapDomains.slice(0, 3).map((domain) => html`<span class="badge bg-warning-lt text-warning">${domain}</span>`)
                    : null}
                </div>
                </div>
                <div class="mt-auto pt-2">
                  <a href="#!/add-ons/peer-benchmark" class="btn btn-sm btn-outline-primary">Open Benchmark</a>
                </div>
          </div>
        ` : null}

        ${coach || addOnSignals?.loading ? html`
          <div style=${cardStyle}>
                <div>
                <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                  <div>
                    <div style=${`${eyebrowStyle}color:#0f766e;`}>Hygiene Coach</div>
                    <div style=${titleStyle}>${coach?.homeworkItems?.[0]?.actionTitle || 'Loading this week\'s homework...'}</div>
                  </div>
                  <div style="flex:0 1 auto; display:flex; justify-content:flex-end; align-items:flex-start; max-width:145px;">
                    <span style=${ribbonStyle('linear-gradient(135deg, #0f766e, #14b8a6)', '#ffffff')}>${coach ? `${coach.currentStreak ?? 0} week streak` : '...'}</span>
                  </div>
                </div>
                <div style=${bodyStyle}>
                  ${coach
                    ? (coach.coachMessage || 'Fresh coaching guidance is available for this week.')
                    : 'Pulling the latest weekly coaching plan for this organization.'}
                </div>
                <div class="mt-2" style="font-size:0.78rem; line-height:1.4; min-height:18px; color:var(--tblr-body-color, #334155); opacity:0.88; font-weight:600;">
                  ${coach?.homeworkItems?.[0]
                    ? `Impact +${Number(coach.homeworkItems[0].impactScore || 0).toFixed(1)} · ${coach.homeworkItems[0].estimatedDaysToComplete ?? 0} day${coach.homeworkItems[0].estimatedDaysToComplete === 1 ? '' : 's'} to complete`
                    : ''}
                </div>
                </div>
                <div class="mt-auto pt-2">
                  <a href="#!/add-ons/hygiene-coach" class="btn btn-sm btn-outline-success">Open Coach</a>
                </div>
          </div>
        ` : null}
      </div>
    `;
  }

  fleetStatsNeedHydration(data) {
    const fleet = data?.quickStats?.devices;
    if (!fleet) return true;

    const total = Number(fleet.totalCount || 0);
    const active = Number(fleet.activeCount || 0);
    const offline = Number(fleet.offlineCount || 0);

    return total > 0 && active === 0;
  }

  deriveFleetFromDevicesPayload(devicesPayload) {
    const devices = Array.isArray(devicesPayload?.devices) ? devicesPayload.devices : [];
    const now = Date.now();

    const total = devices.length;
    let active = 0;
    let offline = 0;

    devices.forEach((d) => {
      const stamp = d?.lastHeartbeat || d?.lastSeen || d?.lastTelemetry || null;
      if (!stamp) {
        offline += 1;
        return;
      }

      const ts = new Date(stamp).getTime();
      if (!Number.isFinite(ts)) {
        offline += 1;
        return;
      }

      const ageHours = (now - ts) / (1000 * 60 * 60);
      if (ageHours <= 24) {
        active += 1;
      } else {
        offline += 1;
      }
    });

    return { totalCount: total, activeCount: active, offlineCount: offline };
  }

  appStatsNeedHydration(data) {
    const quickApps = data?.quickStats?.apps || {};
    const tracked = Number(quickApps.trackedCount || 0);
    const vulnerable = Number(quickApps.vulnerableCount || 0);
    const itTotalApps = Number(data?.itAdmin?.inventory?.totalApps || 0);
    const hasAppRisks = Array.isArray(data?.itAdmin?.appRisks) && data.itAdmin.appRisks.length > 0;

    return tracked <= 0 || itTotalApps <= 0 || (tracked > 0 && vulnerable === 0) || !hasAppRisks;
  }

  deriveAppStatsFromInventoryPayload(inventoryPayload) {
    const apps = Array.isArray(inventoryPayload?.apps) ? inventoryPayload.apps : [];
    const totalApps = Number(inventoryPayload?.totalApps || apps.length);

    const vulnerableSet = new Set();
    const criticalSet = new Set();
    const vendorSet = new Set();

    apps.forEach((app) => {
      const appName = String(app?.name || '').trim();
      const vendor = String(app?.vendor || '').trim();
      const cves = Array.isArray(app?.cves) ? app.cves : [];
      const cveCount = Number(app?.cveCount || cves.length || 0);

      if (vendor) vendorSet.add(vendor.toLowerCase());
      if (appName && cveCount > 0) vulnerableSet.add(appName.toLowerCase());

      const hasCritical = cves.some((cve) => String(cve?.severity || '').toLowerCase() === 'critical');
      if (appName && hasCritical) criticalSet.add(appName.toLowerCase());
    });

    return {
      trackedCount: totalApps,
      vulnerableCount: vulnerableSet.size,
      criticalAppCount: criticalSet.size,
      vendorCount: vendorSet.size
    };
  }

  buildAppRisksFromInventoryPayload(inventoryPayload, limit = 10) {
    const apps = Array.isArray(inventoryPayload?.apps) ? inventoryPayload.apps : [];

    const scoreFromRisk = (risk) => {
      const r = String(risk || '').toLowerCase();
      if (r === 'critical') return 90;
      if (r === 'high') return 70;
      if (r === 'medium') return 45;
      return 20;
    };

    return apps
      .filter((app) => Number(app?.cveCount || 0) > 0)
      .map((app) => {
        const cves = Array.isArray(app?.cves) ? app.cves : [];
        const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
        cves.forEach((cve) => {
          const s = String(cve?.severity || '').toLowerCase();
          if (s in bySeverity) bySeverity[s] += 1;
        });

        return {
          appName: app?.name || 'Unknown application',
          appVendor: app?.vendor || null,
          version: app?.version || null,
          riskScore: scoreFromRisk(app?.riskScore),
          riskLevel: String(app?.riskScore || 'low').toLowerCase(),
          cveSummary: {
            critical: bySeverity.critical,
            high: bySeverity.high,
            medium: bySeverity.medium,
            low: bySeverity.low,
            total: Number(app?.cveCount || cves.length || 0)
          },
          deviceCount: Number(app?.deviceCount || 0),
          devices: [],
          hasUpdate: false,
          latestVersion: null,
          kevCount: 0
        };
      })
      .sort((a, b) => {
        if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
        return (b.cveSummary?.total || 0) - (a.cveSummary?.total || 0);
      })
      .slice(0, limit);
  }

  async normalizeDashboardStats(orgId, data) {
    let normalized = data;

    if (this.fleetStatsNeedHydration(normalized)) {
      try {
        const devicesResponse = await api.getDevices(orgId, { include: 'cached-summary' }, { skipCache: true });
        const devicesPayload = devicesResponse?.data || devicesResponse;
        const derivedFleet = this.deriveFleetFromDevicesPayload(devicesPayload);

        normalized = {
          ...normalized,
          quickStats: {
            ...(normalized.quickStats || {}),
            devices: {
              ...((normalized.quickStats && normalized.quickStats.devices) || {}),
              ...derivedFleet
            }
          }
        };
      } catch {
        // Best-effort hydration only.
      }
    }

    if (this.appStatsNeedHydration(normalized)) {
      try {
        const inventoryResponse = await api.getSoftwareInventory(orgId, { includeCachedSummary: true });
        const inventoryPayload = inventoryResponse?.data || inventoryResponse;
        const appStats = this.deriveAppStatsFromInventoryPayload(inventoryPayload);
        const derivedAppRisks = this.buildAppRisksFromInventoryPayload(inventoryPayload);

        normalized = {
          ...normalized,
          quickStats: {
            ...(normalized.quickStats || {}),
            apps: {
              ...((normalized.quickStats && normalized.quickStats.apps) || {}),
              trackedCount: appStats.trackedCount,
              vulnerableCount: appStats.vulnerableCount,
              criticalAppCount: appStats.criticalAppCount
            }
          },
          itAdmin: {
            ...(normalized.itAdmin || {}),
            inventory: {
              ...((normalized.itAdmin && normalized.itAdmin.inventory) || {}),
              totalApps: appStats.trackedCount,
              uniqueAppCount: appStats.vendorCount || appStats.trackedCount
            },
            appRisks: (Array.isArray(normalized?.itAdmin?.appRisks) && normalized.itAdmin.appRisks.length > 0)
              ? normalized.itAdmin.appRisks
              : derivedAppRisks
          }
        };
      } catch {
        // Best-effort hydration only.
      }
    }

    return normalized;
  }

  async hydrateDashboardStats(orgId, data) {
    if (!this.fleetStatsNeedHydration(data) && !this.appStatsNeedHydration(data)) {
      return;
    }

    const normalized = await this.normalizeDashboardStats(orgId, data);
    if (normalized !== data) {
      this.setState({ data: normalized });
      try {
        const cacheKey = `unified_dashboard_${orgId}`;
        this.setCachedDashboard(cacheKey, normalized);
      } catch (_) {}
    }
  }

  refreshDashboard = async () => {
    if (this.state.refreshing) return;
    await this.loadDashboard({ refresh: true });
  };

  handlePersonaChange = (persona) => {
    const alreadyOpen = this.state.personaSheetOpen && this.state.activePersona === persona;
    if (alreadyOpen) {
      this.setState({ personaSheetOpen: false });
    } else {
      this.setState({ activePersona: persona, personaSheetOpen: true });
    }
  };

  closePersonaSheet = () => {
    this.setState({ personaSheetOpen: false });
  };

  scrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  handleAiPromptChange = (e) => {
    this.setState({ aiPrompt: e?.target?.value ?? '' });
  };

  submitAiPrompt = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const prompt = (this.state.aiPrompt || '').trim();
    if (!prompt || this.state.aiLoading) return;

    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;
    if (!orgId) return;

    this.setState({ aiLoading: true, aiAnswer: null, aiError: null });
    try {
      const response = await api.askAIAnalyst(orgId, { question: prompt });
      const data = response?.data;
      const answer = data?.answer || response?.answer || data?.response || response?.response || null;
      if (!answer) throw new Error('No answer in response');
      this.setState({
        aiAnswer: {
          question: prompt,
          answer,
          confidence: data?.confidence ?? null,
          citations: Array.isArray(data?.citations) ? data.citations : []
        },
        aiLoading: false
      });
    } catch (err) {
      this.setState({ aiError: err?.message || 'Failed to get an answer', aiLoading: false });
    }
  };

  clearAiAnswer = () => {
    this.setState({ aiAnswer: null, aiError: null });
  };

  getGradeClass(grade) {
    const gradeMap = {
      'A+': 'success', 'A': 'success', 'A-': 'success',
      'B+': 'info', 'B': 'info', 'B-': 'info',
      'C+': 'warning', 'C': 'warning', 'C-': 'warning',
      'D+': 'orange', 'D': 'orange', 'D-': 'orange',
      'F': 'danger'
    };
    return gradeMap[grade] || 'secondary';
  }

  getLicenseStatusClass(status) {
    const statusMap = {
      'Active': 'bg-success',
      'Expiring Soon': 'bg-warning',
      'Expired': 'bg-danger',
      'Disabled': 'bg-secondary'
    };
    return statusMap[status] || 'bg-secondary';
  }

  getFreshnessInfo() {
    const generatedAt = this.state.data?.generatedAt;
    if (!generatedAt) return null;

    const dt = new Date(generatedAt);
    if (isNaN(dt.getTime())) return null;

    const ageMs = Date.now() - dt.getTime();
    const ageMinutes = Math.max(0, Math.floor(ageMs / 60000));
    const ageHours = Math.floor(ageMinutes / 60);

    const isStale = ageMs > (25 * 60 * 60 * 1000);
    const ageText = ageHours >= 24
      ? `${Math.floor(ageHours / 24)}d ${ageHours % 24}h ago`
      : ageHours >= 1
        ? `${ageHours}h ${ageMinutes % 60}m ago`
        : `${ageMinutes}m ago`;

    return {
      generatedAt: dt,
      ageText,
      isStale
    };
  }

  getDeviceHealthDotClass(stats) {
    const offline = Number(stats?.devices?.offlineCount || 0);
    const total = Number(stats?.devices?.totalCount || 0);

    if (total === 0) return 'status-gray';
    if (offline <= 0) return 'status-green';
    if (offline <= 2) return 'status-yellow';
    return 'status-red';
  }

  getFleetStats(data) {
    const stats = data?.quickStats || {};
    const it = data?.itAdmin || {};

    const rawActive = Number(stats.devices?.activeCount || 0);
    const rawTotal = Number(stats.devices?.totalCount || 0);
    const rawOffline = Number(stats.devices?.offlineCount || 0);

    const inventoryTotal = Number(it.inventory?.totalDevices || 0);
    const health = Array.isArray(it.deviceHealth) ? it.deviceHealth : [];
    const devices = Array.isArray(it.devices) ? it.devices : [];

    const normalize = (v) => String(v || '').toLowerCase();
    const healthyByStatus = health.filter((d) => {
      const s = normalize(d?.status);
      return s === 'active' || s === 'online' || s === 'healthy';
    }).length;
    const onlineByStatus = health.filter((d) => {
      const s = normalize(d?.status);
      return s === 'online' || s === 'healthy';
    }).length;
    const offlineByStatus = health.filter((d) => {
      const s = normalize(d?.status);
      const visibility = normalize(d?.visibilityState);
      return s === 'offline'
        || s === 'stale'
        || s === 'degraded'
        || s === 'dormant'
        || s === 'ghosted'
        || visibility === 'stale'
        || visibility === 'dormant'
        || visibility === 'ghosted';
    }).length;

    const total = rawTotal > 0
      ? rawTotal
      : (inventoryTotal > 0 ? inventoryTotal : (health.length || devices.length));

    // Prefer explicit online status when available; quickStats active may include stale devices.
    const hasHealthRows = health.length > 0;
    const online = hasHealthRows
      ? Math.max(0, Math.min(total, onlineByStatus))
      : (rawActive > 0 ? rawActive : (healthyByStatus > 0 ? healthyByStatus : 0));

    const active = online;

    // Trust rawOffline from quickStats when quickStats has device data (rawTotal > 0).
    // Only fall back to deviceHealth-based count when quickStats is absent entirely.
    const offline = hasHealthRows
      ? Math.max(0, total - online)
      : (rawTotal > 0
        ? Math.max(rawOffline, total - online)
        : (offlineByStatus > 0 ? offlineByStatus : Math.max(0, total - online)));

    return { active, online, total, offline };
  }

  getHeroGradient(score) {
    if (score >= 80) return 'linear-gradient(160deg, #0a1f12 0%, #0e2f1e 45%, #071a2a 100%)';
    if (score >= 60) return 'linear-gradient(160deg, #071829 0%, #0c2040 45%, #060e1c 100%)';
    if (score >= 40) return 'linear-gradient(160deg, #1a1209 0%, #2b1d0e 30%, #1c1410 60%, #141218 100%)';
    return 'linear-gradient(160deg, #1a0608 0%, #2e0c0c 45%, #1a0508 100%)';
  }

  getPersonaGradient(persona) {
    const map = {
      business: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
      it:       'linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)',
      security: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
      auditor:  'linear-gradient(135deg, #0f766e 0%, #047857 100%)'
    };
    return map[persona] || map.business;
  }

  getCyberHygieneData(data) {
    const raw = data?.cyberHygiene;
    const derivedSecurity = Number(data?.securityScore?.score || 0);
    const derivedCompliance = Number(data?.businessOwner?.complianceCard?.percent || 0);
    const gapCount = Number(data?.businessOwner?.complianceCard?.gapCount || 0);
    const riskScoreRaw = Number(data?.businessOwner?.riskSummary?.riskScore || 50);
    const derivedAudit = Math.max(0, Math.min(100, 88 - (gapCount * 8)));
    const derivedRiskPosture = Math.max(0, Math.min(100, 100 - (riskScoreRaw * 1.8)));

    const preferSignal = (rawValue, derivedValue) => {
      const rawNum = Number(rawValue);
      if (Number.isFinite(rawNum) && rawNum > 0) return rawNum;
      return Number.isFinite(derivedValue) ? derivedValue : 0;
    };

    const security = preferSignal(raw?.security, derivedSecurity);
    const compliance = preferSignal(raw?.compliance, derivedCompliance);
    const audit = preferSignal(raw?.audit, derivedAudit);
    const riskPosture = preferSignal(raw?.riskPosture, derivedRiskPosture);

    const weighted = (security * 0.4) + (compliance * 0.25) + (audit * 0.2) + (riskPosture * 0.15);
    const computedScore = Math.round(weighted);
    const rawScore = Number(raw?.score || 0);
    const score = rawScore > 0 ? rawScore : computedScore;
    const grade = rawScore > 0
      ? (raw?.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'))
      : (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');
    const insuranceTier = rawScore > 0
      ? (raw?.insuranceTier || (score >= 80 ? 'Insurance Ready' : score >= 65 ? 'Conditional Approval' : 'High Risk'))
      : (score >= 80 ? 'Insurance Ready' : score >= 65 ? 'Conditional Approval' : 'High Risk');

    return {
      score,
      grade,
      insuranceTier,
      security,
      compliance,
      audit,
      riskPosture
    };
  }

  renderRefreshBanner() {
    const { refreshing, refreshError, data, isRefreshingInBackground } = this.state;
    if (!refreshing && !refreshError && !isRefreshingInBackground) return null;
    if (!data) return null;

    if (refreshing) {
      return html`
        <div class="alert alert-info mb-4 border-0 shadow-sm rounded-3">
          <div class="d-flex align-items-center justify-content-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></div>
            <div>Updating intelligence...</div>
          </div>
        </div>
      `;
    }

    if (isRefreshingInBackground) {
      return html`
        <div class="alert alert-info mb-4 border-0 shadow-sm rounded-3">
          <div class="d-flex align-items-center justify-content-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></div>
            <div>Refreshing signal intelligence...</div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="alert alert-warning mb-4 border-0 shadow-sm rounded-3">
        <div class="d-flex align-items-center justify-content-center gap-3">
          <div>Signal is temporarily delayed. Showing latest cached intelligence. ${refreshError}</div>
          <button class="btn btn-warning btn-sm btn-pill" onClick=${() => this.refreshDashboard()}>Try Again</button>
        </div>
      </div>
    `;
  }

  renderBillingNoticeBanner() {
    const notice = this.state?.data?.billingNotice;
    if (!notice || notice.visible === false) return null;

    const severity = (notice.severity || '').toLowerCase();
    const alertClass = severity === 'critical'
      ? 'alert-danger'
      : severity === 'warning'
        ? 'alert-warning'
        : 'alert-info';

    const daysRemaining = typeof notice.daysRemaining === 'number'
      ? notice.daysRemaining
      : null;
    const metaParts = [];

    if (notice.invoiceId) metaParts.push(`Invoice: ${notice.invoiceId}`);
    if (notice.paymentRequestId) metaParts.push(`Payment: ${notice.paymentRequestId}`);
    if (daysRemaining !== null) {
      if (daysRemaining < 0) metaParts.push(`Expired ${Math.abs(daysRemaining)} day(s) ago`);
      else if (daysRemaining === 0) metaParts.push('Expires today');
      else metaParts.push(`${daysRemaining} day(s) remaining`);
    }

    return html`
      <div class=${`alert ${alertClass} mb-4 border-0 shadow-sm rounded-3`} role="alert" aria-live="polite">
        <div class="d-flex flex-column gap-1">
          <div class="fw-semibold">${notice.title || 'License billing update'}</div>
          <div>${notice.message || 'Renewal invoice is generated and emailed to business contacts.'}</div>
          ${metaParts.length > 0 ? html`<div class="small opacity-75">${metaParts.join(' | ')}</div>` : null}
        </div>
      </div>
    `;
  }

  renderSearchHeader() {
    const { data, aiLoading, aiAnswer, aiError, refreshing, addOnSignals } = this.state;
    const secScore = typeof data?.securityScore?.score === 'number' ? data.securityScore.score : 0;
    const freshness = this.getFreshnessInfo();
    const hasSpotlightStrip = Boolean(addOnSignals?.loading || addOnSignals?.peerBenchmark || addOnSignals?.hygieneCoach);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const aiPlaceholder = isSmallScreen
      ? 'Ask threats, compliance, or devices...'
      : 'Ask about threats, compliance, or any device...';
    const aiButtonLabel = aiLoading ? 'Thinking...' : (isSmallScreen ? 'Ask' : 'Ask MAGI');
    const quickPillStyle = 'font-size: var(--db-pill-font-size); color: var(--db-pill-text); text-decoration: none; padding: var(--db-pill-padding); background: var(--db-pill-bg); border-radius: var(--db-pill-radius); border: 1px solid var(--db-pill-border); box-shadow: var(--db-pill-shadow); font-weight: var(--db-pill-weight);';
    const refreshPillStyle = 'font-size: var(--db-pill-font-size); color: var(--db-pill-text); background: var(--db-pill-bg); border: 1px solid var(--db-pill-border); border-radius: var(--db-pill-radius); padding: var(--db-pill-padding); cursor: pointer; box-shadow: var(--db-pill-shadow); font-weight: var(--db-pill-weight);';

    return html`
      <div style="
        width: 100vw;
        position: relative;
        left: 50%;
        right: 50%;
        margin-left: -50vw;
        margin-right: -50vw;
        background: var(--tblr-body-bg, #f4f6fa);
        padding: 12px 16px 20px;
        overflow: visible;
      ">
        <!-- Decorative glow orbs -->
        <div style="position: absolute; top: -80px; right: -40px; width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%); pointer-events: none;"></div>
        <div style="position: absolute; bottom: -60px; left: -40px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%); pointer-events: none;"></div>

        <div style="max-width: 1320px; margin: 0 auto; position: relative;">
          <div class="row g-3 align-items-start mt-1">
            <div class=${hasSpotlightStrip ? 'col-12 col-xl-9' : 'col-12'}>
              <div style="max-width: 800px; margin: 0 auto 8px; display:flex; justify-content:center;">
                ${this.renderSecurityOfficerDrawer({ embeddedInCard: true })}
              </div>

              <!-- Cyber Hygiene (AI-derived) -->
              ${this.renderCyberHygieneLanding(data, true)}

              <!-- Refresh status belongs to left client area -->
              ${this.renderRefreshBanner()}

              <!-- AI Search bar -->
              <div style="max-width: 700px; margin: 0 auto 12px;">
            <form onSubmit=${this.submitAiPrompt}>
              <div style="
                display: flex;
                align-items: center;
                background: var(--db-glass-bg);
                backdrop-filter: blur(16px) saturate(180%);
                -webkit-backdrop-filter: blur(16px) saturate(180%);
                border: 1.5px solid rgba(99, 102, 241, 0.35);
                border-radius: 50px;
                overflow: hidden;
                transition: border-color 0.2s;
                box-shadow: 0 6px 22px rgba(99,102,241,0.14), 0 1px 3px rgba(0,0,0,0.06);
              ">
                <span style="display: flex; align-items: center; padding: 0 10px 0 20px; color: var(--db-faintest-text); flex-shrink: 0;">
                  ${aiLoading
                    ? html`<span class="spinner-border spinner-border-sm" style="color: #6366f1; width: 16px; height: 16px; border-width: 2px;" role="status"></span>`
                    : html`<svg width="17" height="17" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>`}
                </span>
                <input
                  type="text"
                  aria-label="Ask security assistant"
                  placeholder=${aiPlaceholder}
                  value=${this.state.aiPrompt}
                  onInput=${this.handleAiPromptChange}
                  disabled=${aiLoading}
                  style="
                    flex: 1;
                    background: none;
                    border: none;
                    outline: none;
                    color: var(--db-input-color);
                    font-size: ${isSmallScreen ? '0.84rem' : '0.9rem'};
                    padding: ${isSmallScreen ? '11px 6px' : '13px 8px'};
                    min-width: 0;
                  "
                />
                <button
                  type="submit"
                  disabled=${aiLoading}
                  style="
                    flex-shrink: 0;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none;
                    color: #fff;
                    padding: ${isSmallScreen ? '0 14px' : '0 20px'};
                    height: ${isSmallScreen ? '34px' : '36px'};
                    font-weight: 600;
                    font-size: ${isSmallScreen ? '0.78rem' : '0.82rem'};
                    border-radius: 40px;
                    margin: 4px;
                    cursor: ${aiLoading ? 'default' : 'pointer'};
                    opacity: ${aiLoading ? '0.6' : '1'};
                    transition: opacity 0.15s;
                    white-space: nowrap;
                  "
                >${aiButtonLabel}</button>
              </div>
            </form>

            <!-- AI Answer card -->
            ${aiAnswer ? html`
              <div style="
                margin-top: 14px;
                background: var(--db-answer-bg);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid var(--db-card-border);
                border-left: 3px solid #818cf8;
                border-radius: 14px;
                padding: 14px 16px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.06);
              ">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="#6366f1" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
                    <span style="color: #6366f1; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.02em;">🛡️MAGI</span>
                    ${aiAnswer.confidence != null ? html`
                      <span style="font-size: 0.7rem; background: rgba(99,102,241,0.12); color: #6366f1; padding: 1px 8px; border-radius: 20px;">${Math.round((aiAnswer.confidence || 0) * 100)}% confident</span>
                    ` : ''}
                  </div>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <button
                      onClick=${() => {
                        if (this.isPersonalOrg()) {
                          window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                          return;
                        }
                        try { sessionStorage.setItem('ai_analyst_prefill', JSON.stringify({ question: aiAnswer.question, answer: aiAnswer.answer })); } catch (_) {}
                        window.location.hash = '#!/analyst';
                      }}
                      class=${this.isPersonalOrg() ? 'business-license-only' : ''}
                      title=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''}
                      data-business-tooltip=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''}
                      style="background: var(--db-subtle-bg); border: 1px solid var(--db-subtle-border); color: var(--db-subtle-text); font-size: 0.75rem; padding: 3px 10px; border-radius: 6px; cursor: pointer;"
                    >Continue →</button>
                    <button onClick=${this.clearAiAnswer} style="background: none; border: none; color: var(--db-faintest-text); cursor: pointer; font-size: 1.1rem; line-height: 1; padding: 0 4px;">✕</button>
                  </div>
                </div>
                <div style="color: var(--db-faint-text); font-size: 0.76rem; margin-bottom: 8px; font-style: italic;">${aiAnswer.question}</div>
                <div class="chat-markdown-content" style="color: var(--db-answer-text); font-size: 0.875rem;" dangerouslySetInnerHTML=${{ __html: renderMarkdown(aiAnswer.answer) }}></div>
              </div>
            ` : ''}

            ${aiError ? html`
              <div style="margin-top: 10px; background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.2); border-radius: 10px; padding: 10px 14px; color: #dc2626; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                <span>${aiError}</span>
                <button onClick=${this.clearAiAnswer} style="background: none; border: none; color: #dc2626; cursor: pointer; margin-left: 8px;">✕</button>
              </div>
            ` : ''}

              <!-- Quick nav + freshness -->
              <div style="max-width: 700px; margin: 10px auto 0; text-align: center;">
                <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center;">
                  <a href="#!/security" class="db-quick-pill" style=${quickPillStyle}>Security</a>
                  <a
                    href="#!/compliance"
                    class=${`db-quick-pill ${this.getBusinessOnlyMeta('#!/compliance').className}`}
                    title=${this.getBusinessOnlyMeta('#!/compliance').title}
                    data-business-tooltip=${this.getBusinessOnlyMeta('#!/compliance').dataTooltip}
                    style=${quickPillStyle}
                  >Compliance</a>
                  <a
                    href="#!/reports"
                    class=${`db-quick-pill ${this.getBusinessOnlyMeta('#!/reports').className}`}
                    title=${this.getBusinessOnlyMeta('#!/reports').title}
                    data-business-tooltip=${this.getBusinessOnlyMeta('#!/reports').dataTooltip}
                    style=${quickPillStyle}
                  >Reports</a>
                  <button class="db-quick-pill db-quick-pill-btn" onClick=${() => this.refreshDashboard()} style=${refreshPillStyle}>
                    ${refreshing ? 'Refreshing…' : '↻ Refresh'}
                  </button>
                  ${freshness ? html`
                    <span style="font-size: 0.68rem; color: var(--db-faintest-text);">
                      · ${freshness.ageText}${freshness.isStale ? ' (stale)' : ''}
                    </span>
                  ` : ''}
                </div>
              </div>
              </div>
            </div>

            ${hasSpotlightStrip ? html`
              <div class="col-12 col-xl-3">
                ${this.renderAddOnSpotlights()}
              </div>
            ` : null}
          </div>

        </div>
      </div>
    `;
  }

  renderConfidenceTiles() {
    const { data } = this.state;
    if (!data) return null;

    const score = data.securityScore || {};
    const compliance = data.businessOwner?.complianceCard || {};
    const stats = data.quickStats || {};
    const threats = data.securityPro?.threatIntel || {};

    const secScore = score.score || 0;
    const compliancePercent = compliance.percent || 0;
    const criticalCount = threats.criticalCveCount || 0;
    const fleet = this.getFleetStats(data);
    const activeDevices = fleet.active;
    const totalDevices = fleet.total;
    const offlineDevices = fleet.offline;

    const scoreHex   = secScore >= 80 ? '#16a34a' : secScore >= 60 ? '#2563eb' : secScore >= 40 ? '#d97706' : '#dc2626';
    const compHex    = compliancePercent >= 80 ? '#16a34a' : compliancePercent >= 60 ? '#2563eb' : compliancePercent >= 40 ? '#d97706' : '#dc2626';
    const threatHex  = criticalCount === 0 ? '#16a34a' : criticalCount <= 3 ? '#d97706' : '#dc2626';
    const fleetHex   = offlineDevices === 0 ? '#2563eb' : offlineDevices <= 2 ? '#d97706' : '#dc2626';

    const glass = 'height:100%;background:var(--db-tile-bg);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border:1px solid var(--db-tile-border);border-radius:14px;padding:16px 14px;cursor:pointer;transition:background 0.2s,border-color 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.05);';
    const label = 'color:var(--db-muted-text);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.09em;font-weight:600;margin-bottom:6px;';
    const bigNum = (color) => `font-size:2rem;font-weight:800;color:${color};line-height:1;margin-bottom:4px;`;
    const sub = 'font-size:0.72rem;color:var(--db-faint-text);';

    return html`
      <div class="row g-2 mb-5">

        <div class="col-6 col-md-3">
          <div style="${glass}" onClick=${() => window.location.hash = '#!/security'}>
            <div style="${label}">Security</div>
            <div style="display:flex;align-items:baseline;gap:8px;${bigNum(scoreHex)}">
              <span>${secScore}</span>
              <span style="font-size:0.78rem;font-weight:700;color:${scoreHex};background:var(--db-badge-bg);padding:2px 7px;border-radius:6px;">${score.grade || '—'}</span>
            </div>
            <div style="${sub}${score.urgentActionCount > 0 ? 'color:#dc2626;' : ''}">
              ${score.urgentActionCount > 0 ? `⚠  ${score.urgentActionCount} urgent` : '✓ No alerts'}
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div
            style="${glass}"
            class=${this.isPersonalOrg() ? 'business-license-only' : ''}
            title=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''}
            data-business-tooltip=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''}
            onClick=${() => {
              if (this.isPersonalOrg()) {
                window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                return;
              }
              window.location.hash = '#!/compliance';
            }}
          >
            <div style="${label}">Compliance</div>
            <div style="${bigNum(compHex)}">${compliancePercent}%</div>
            <div style="background:var(--db-bar-track);border-radius:3px;height:3px;overflow:hidden;margin-bottom:5px;">
              <div style="width:${compliancePercent}%;height:100%;background:${compHex};border-radius:3px;transition:width 0.9s ease;"></div>
            </div>
            <div style="${sub}">
              ${compliance.gapCount > 0 ? `${compliance.gapCount} gap${compliance.gapCount !== 1 ? 's' : ''}` : 'Fully compliant'}
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div style="${glass}" onClick=${() => window.location.hash = '#!/security'}>
            <div style="${label}">Threats</div>
            <div style="display:flex;align-items:baseline;gap:6px;${bigNum(threatHex)}">
              <span>${criticalCount}</span>
              <span style="font-size:0.72rem;color:var(--db-faint-text);">critical</span>
            </div>
            <div style="${sub}${threats.exploitCount > 0 ? 'color:#ea580c;' : ''}">
              ${threats.exploitCount > 0 ? `${threats.exploitCount} KEV exploits` : `${threats.highCveCount || 0} high severity`}
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div style="${glass}" onClick=${() => window.location.hash = '#!/devices'}>
            <div style="${label}">Fleet</div>
            <div style="display:flex;align-items:baseline;gap:4px;${bigNum(fleetHex)}">
              <span>${activeDevices}</span>
              <span style="font-size:0.82rem;color:var(--db-slash-color);">/ ${totalDevices}</span>
            </div>
            <div style="${sub}${offlineDevices > 0 ? 'color:#d97706;' : ''}">
              ${offlineDevices > 0 ? `${offlineDevices} at risk` : '✓ All healthy'}
            </div>
          </div>
        </div>

      </div>
    `;
  }

  renderPersonaSheet() {
    const { data, activePersona, personaSheetOpen } = this.state;
    if (!data) return null;

    const headerGradient = this.getPersonaGradient(activePersona);

    const PERSONA_ICONS = {
      business: html`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" stroke-width="1.8" stroke="rgba(255,255,255,0.9)" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/><path d="M3 13a20 20 0 0 0 18 0"/></svg>`,
      it:       html`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" stroke-width="1.8" stroke="rgba(255,255,255,0.9)" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1"/><line x1="7" y1="20" x2="17" y2="20"/><line x1="9" y1="16" x2="9" y2="20"/><line x1="15" y1="16" x2="15" y2="20"/></svg>`,
      security: html`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" stroke-width="1.8" stroke="rgba(255,255,255,0.9)" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/><path d="M9 12l2 2l4-4"/></svg>`,
      auditor:  html`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" stroke-width="1.8" stroke="rgba(255,255,255,0.9)" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 12l2 2l4-4"/></svg>`
    };

    const PERSONA_LABELS = {
      business: 'Business Owner',
      it:       'IT Operations',
      security: 'Security',
      auditor:  'Auditor'
    };

    const PERSONA_CTAs = {
      business: [
        { href: '#!/compliance', label: 'Compliance', businessOnly: true },
        { href: '#!/security',   label: 'Security' },
        { href: '#!/reports',    label: 'Reports', businessOnly: true }
      ],
      it: [
        { href: '#!/devices',   label: 'Devices' },
        { href: '#!/inventory', label: 'Inventory' },
        { href: '#!/security',  label: 'Vulnerabilities' }
      ],
      security: [
        { href: '#!/security',    label: 'Full Analysis' },
        { href: '#!/reports',     label: 'Reports', businessOnly: true },
        { href: '#!/analyst',     label: 'Ask 🛡️MAGI', businessOnly: true }
      ],
      auditor: [
        { href: '#!/auditor',     label: 'Auditor Dashboard', businessOnly: true },
        { href: '#!/audit',       label: 'Command Log' },
        { href: '#!/compliance',  label: 'Compliance', businessOnly: true }
      ]
    };

    // Build headline metric for header
    let headlineValue = '';
    let headlineLabel = '';
    let headlineSubtitle = '';
    const score = data.securityScore || {};
    const bo = data.businessOwner || {};
    const it = data.itAdmin || {};
    const sec = data.securityPro?.threatIntel || {};
    const compPct = bo.complianceCard?.percent || 0;
    const businessTrends = bo.businessTrends || {};
    const businessTrendPoints = Array.isArray(businessTrends.points) ? businessTrends.points : [];

    // AI KR velocity metrics (from aiTrends field)
    const aiTrends = data.aiTrends || {};
    const mttdDays  = typeof aiTrends?.dwellTime?.averageDwellTimeDays === 'number'      ? aiTrends.dwellTime.averageDwellTimeDays      : null;
    const mttrDays  = typeof aiTrends?.patchLatency?.averageLatencyDays === 'number'     ? aiTrends.patchLatency.averageLatencyDays     : null;
    const patchCovPct = typeof aiTrends?.patchLatency?.patchCoveragePercent === 'number' ? aiTrends.patchLatency.patchCoveragePercent   : null;
    const vulnGrowth  = typeof aiTrends?.vulnerabilityGrowth?.growthRatePercent === 'number' ? aiTrends.vulnerabilityGrowth.growthRatePercent : null;
    const newVulnsWeek = aiTrends?.vulnerabilityGrowth?.newThisWeek ?? null;

    if (activePersona === 'business') {
      headlineValue = `${compPct}%`;
      headlineLabel = 'Compliance';
      headlineSubtitle = bo.riskSummary?.overallRisk ? `${bo.riskSummary.overallRisk} risk overall` : 'Risk posture summary';
    } else if (activePersona === 'it') {
      headlineValue = String(it.deploymentStatus?.pendingUpdates || 0);
      headlineLabel = 'Pending Updates';
      headlineSubtitle = `${it.inventory?.totalDevices || 0} devices · ${it.inventory?.totalApps || 0} apps tracked`;
    } else if (activePersona === 'security') {
      headlineValue = String(sec.criticalCveCount || 0);
      headlineLabel = 'Critical CVEs';
      headlineSubtitle = sec.exploitCount > 0 ? `⚠  ${sec.exploitCount} actively exploited (KEV)` : `${sec.highCveCount || 0} high severity CVEs`;
    } else {
      headlineValue = `${compPct}%`;
      headlineLabel = 'Audit Readiness';
      headlineSubtitle = bo.complianceCard?.gapCount > 0 ? `${bo.complianceCard.gapCount} control gap${bo.complianceCard.gapCount !== 1 ? 's' : ''}` : 'Controls verified';
    }

    // Build metric row (row 1 of sheet body)
    let metricCards = [];
    if (activePersona === 'business') {
      const risk = bo.riskSummary?.overallRisk || '—';
      const riskColor = risk === 'low' ? '#34d399' : risk === 'medium' ? '#fbbf24' : '#f87171';
      metricCards = [
        { label: 'Security Score', value: score.score || 0, valueColor: score.score >= 80 ? '#16a34a' : score.score >= 60 ? '#2563eb' : '#d97706', suffix: '', sub: score.grade || '' },
        { label: 'Compliance',     value: `${compPct}%`,   valueColor: compPct >= 80 ? '#16a34a' : compPct >= 60 ? '#2563eb' : '#dc2626', suffix: '', sub: bo.complianceCard?.gapCount > 0 ? `${bo.complianceCard.gapCount} gaps` : 'clean' },
        { label: 'Risk Level',     value: risk,            valueColor: riskColor,   suffix: '', sub: `Score: ${bo.riskSummary?.riskScore || '—'}` },
        { label: 'License',        value: `${bo.licenseCard?.seatsUsed || 0}/${bo.licenseCard?.seatsTotal || 0}`, valueColor: '#6366f1', suffix: '', sub: `${bo.licenseCard?.daysRemaining || 0}d remaining` }
      ];
    } else if (activePersona === 'it') {
      const osEntries = it.inventory?.osBreakdown ? Object.entries(it.inventory.osBreakdown) : [];
      metricCards = [
        { label: 'Managed Devices', value: it.inventory?.totalDevices || 0,         valueColor: '#2563eb', suffix: '', sub: osEntries.slice(0,2).map(([k,v])=>`${k}: ${v}`).join(' · ') || '' },
        { label: 'Pending Patches', value: it.deploymentStatus?.pendingUpdates || 0, valueColor: it.deploymentStatus?.pendingUpdates > 0 ? '#d97706' : '#16a34a', suffix: '', sub: '' },
        { label: 'Patch Coverage',  value: patchCovPct != null ? `${Math.round(patchCovPct)}%` : `${it.deploymentStatus?.completedToday || 0} today`,
          valueColor: patchCovPct != null ? (patchCovPct >= 90 ? '#16a34a' : patchCovPct >= 70 ? '#d97706' : '#dc2626') : '#16a34a',
          suffix: '', sub: patchCovPct != null ? 'across fleet' : 'patched today' },
        { label: 'MTTR',            value: mttrDays != null ? `${Math.round(mttrDays)}d` : `${it.inventory?.totalApps || 0}`,
          valueColor: mttrDays != null ? (mttrDays < 30 ? '#16a34a' : mttrDays < 60 ? '#d97706' : '#dc2626') : '#6366f1',
          suffix: '', sub: mttrDays != null ? 'avg remediation' : 'apps tracked' }
      ];
    } else if (activePersona === 'security') {
      const critDelta = sec.criticalCveDelta;
      const highDelta = sec.highCveDelta;
      metricCards = [
        { label: 'Critical CVEs', value: sec.criticalCveCount || 0,
          valueColor: sec.criticalCveCount > 0 ? '#dc2626' : '#16a34a', suffix: '',
          sub: critDelta > 0 ? `▲ +${critDelta} new` : critDelta < 0 ? `▼ ${Math.abs(critDelta)} fixed` : '' },
        { label: 'High Severity', value: sec.highCveCount || 0,
          valueColor: sec.highCveCount > 0 ? '#d97706' : '#16a34a', suffix: '',
          sub: highDelta > 0 ? `▲ +${highDelta} new` : highDelta < 0 ? `▼ ${Math.abs(highDelta)} fixed` : '' },
        { label: 'KEV / In-Wild', value: `${sec.exploitCount || 0} / ${sec.activeExploitCount || 0}`,
          valueColor: sec.exploitCount > 0 ? '#ea580c' : '#16a34a', suffix: '', sub: 'catalog / exploited' },
        { label: 'High EPSS',     value: sec.highEpssCount || 0,
          valueColor: sec.highEpssCount > 0 ? '#7c3aed' : '#16a34a', suffix: '', sub: 'EPSS > 80%' }
      ];
    } else {
      const gapCount = bo.complianceCard?.gapCount || 0;
      metricCards = [
        { label: 'Compliance',   value: `${compPct}%`,                          valueColor: compPct >= 80 ? '#16a34a' : compPct >= 60 ? '#2563eb' : '#dc2626', suffix: '', sub: '' },
        { label: 'Control Gaps', value: gapCount,                               valueColor: gapCount > 0 ? '#d97706' : '#16a34a', suffix: '', sub: '' },
        { label: 'Risk Score',   value: bo.riskSummary?.riskScore || '—',       valueColor: '#6366f1', suffix: '', sub: '' },
        { label: 'Status',       value: compPct >= 80 ? 'Ready' : 'Not Ready',  valueColor: compPct >= 80 ? '#16a34a' : '#d97706', suffix: '', sub: '' }
      ];
    }

    // Build action list (row 2 of sheet body)
    let actionRows = [];
    if (activePersona === 'business') {
      actionRows = (bo.topActions || []).slice(0, 3).map(a => ({
        badge: a.urgency || 'normal',
        badgeColor: a.urgency === 'critical' || a.urgency === 'urgent' ? '#dc2626' : a.urgency === 'high' || a.urgency === 'important' ? '#d97706' : '#6b7280',
        title: a.title || '',
        sub: a.primaryDeviceName
          ? `Affected device: ${a.primaryDeviceName}${a.deadlineText ? ` · ${a.deadlineText}` : ''}`
          : (a.deadlineText || a.description || '')
      }));
    } else if (activePersona === 'it') {
      actionRows = (it.appRisks || []).slice(0, 3).map(a => ({
        badge: `${a.cveSummary?.total ?? 0} CVEs`,
        badgeColor: '#dc2626',
        title: a.appName || '',
        sub: a.kevCount > 0 ? `${a.kevCount} KEV · ${a.deviceCount} device${a.deviceCount !== 1 ? 's' : ''}` : `${a.deviceCount} device${a.deviceCount !== 1 ? 's' : ''} affected`
      }));
    } else if (activePersona === 'security') {
      if (sec.exploitCount > 0) {
        actionRows = [{ badge: 'KEV', badgeColor: '#ea580c', title: `${sec.exploitCount} actively exploited vulnerability${sec.exploitCount !== 1 ? 'ies' : 'y'}`, sub: 'Patch immediately — these are in CISA KEV catalog' }];
      }
      actionRows = [...actionRows, ...(data.securityPro?.attackSurface?.layers || []).slice(0, 2).map(l => ({
        badge: l.riskLevel || 'medium',
        badgeColor: l.riskLevel === 'critical' ? '#dc2626' : l.riskLevel === 'high' ? '#d97706' : '#6b7280',
        title: l.name || '',
        sub: `${l.cveCount || 0} CVEs${l.criticalCount > 0 ? ` · ${l.criticalCount} critical` : ''}`
      }))].slice(0, 3);
    } else {
      const gapDesc = bo.complianceCard?.gapDescription || '';
      if (gapDesc) actionRows.push({ badge: 'gap', badgeColor: '#d97706', title: 'Compliance gap identified', sub: gapDesc });
      actionRows.push({ badge: 'report', badgeColor: '#6366f1', title: 'Asset inventory', sub: 'Available now' });
      actionRows.push({ badge: 'report', badgeColor: '#6366f1', title: 'Compliance report', sub: 'Available now' });
      actionRows = actionRows.slice(0, 3);
    }

    let businessTrendChart = null;
    if (activePersona === 'business' && businessTrendPoints.length > 1) {
      const width = 360;
      const height = 88;
      const maxY = Math.max(1, ...businessTrendPoints.map(p => Math.max(p?.storeInstalls || 0, p?.storeStale24h || 0, p?.msiInstalls || 0)));
      const xStep = businessTrendPoints.length > 1 ? width / (businessTrendPoints.length - 1) : width;

      const toPath = (selector) => businessTrendPoints
        .map((point, index) => {
          const x = index * xStep;
          const y = height - ((selector(point) || 0) / maxY) * height;
          return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

      const storePath = toPath(p => p?.storeInstalls || 0);
      const stalePath = toPath(p => p?.storeStale24h || 0);
      const msiPath = toPath(p => p?.msiInstalls || 0);

      businessTrendChart = html`
        <div style="padding: 12px 16px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tblr-secondary, #999);">
              Business Trends (7d)
            </div>
            <div style="font-size: 0.72rem; color: var(--tblr-secondary, #888);">
              Store ${businessTrends.storeInstalls || 0} · MSI ${businessTrends.msiInstalls || 0} · Stale 24h ${businessTrends.storeStale24h || 0}
            </div>
          </div>
          <svg width="100%" height="88" viewBox=${`0 0 ${width} ${height}`} preserveAspectRatio="none" style="display:block; border:1px solid var(--tblr-border-color, #eceef1); border-radius:8px; background: var(--tblr-bg-surface-secondary, #fafafa);">
            <path d=${msiPath} fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" />
            <path d=${storePath} fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" />
            <path d=${stalePath} fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="4 3" />
          </svg>
          <div style="display:flex; gap:12px; align-items:center; margin-top:6px; font-size:0.7rem; color:var(--tblr-secondary, #888);">
            <span style="display:inline-flex; align-items:center; gap:5px;"><span style="width:9px; height:2px; background:#6366f1; display:inline-block;"></span>MSI</span>
            <span style="display:inline-flex; align-items:center; gap:5px;"><span style="width:9px; height:2px; background:#10b981; display:inline-block;"></span>Store</span>
            <span style="display:inline-flex; align-items:center; gap:5px;"><span style="width:9px; height:2px; background:#ef4444; display:inline-block;"></span>Store stale 24h</span>
          </div>
        </div>
      `;
    }

    const ctaList = PERSONA_CTAs[activePersona] || PERSONA_CTAs.business;

    return html`
      <div>
        <!-- Scrim backdrop -->
        <div
          onClick=${this.closePersonaSheet}
          style="
            position: fixed;
            inset: 0;
            z-index: 1028;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            transition: opacity 0.3s ease;
            opacity: ${personaSheetOpen ? '1' : '0'};
            pointer-events: ${personaSheetOpen ? 'all' : 'none'};
          "
        ></div>

        <!-- Persona sheet -->
        <div style="
          position: fixed;
          bottom: 58px;
          left: 0;
          right: 0;
          z-index: 1040;
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
          transform: ${personaSheetOpen ? 'translateY(0)' : 'translateY(100%)'};
          opacity: ${personaSheetOpen ? '1' : '0'};
          pointer-events: ${personaSheetOpen ? 'all' : 'none'};
        ">
          <div style="
            border-top-left-radius: 20px;
            border-top-right-radius: 20px;
            overflow: hidden;
            box-shadow: 0 -8px 48px rgba(0,0,0,0.28), 0 -2px 12px rgba(0,0,0,0.12);
            max-height: 56vh;
            display: flex;
            flex-direction: column;
          ">
            <!-- Row 0: Gradient header with persona identity + headline metric -->
            <div style="
              background: ${headerGradient};
              padding: 16px 20px 18px;
              position: relative;
              flex-shrink: 0;
            ">
              <!-- Close button -->
              <button
                onClick=${this.closePersonaSheet}
                style="position: absolute; top: 12px; right: 14px; background: rgba(255,255,255,0.15); border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff;"
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>

              <!-- Drag handle -->
              <div style="width: 36px; height: 3px; background: rgba(255,255,255,0.3); border-radius: 2px; margin: 0 auto 14px;"></div>

              <div style="display: flex; align-items: center; gap: 14px;">
                <div style="opacity: 0.9; flex-shrink: 0;">${PERSONA_ICONS[activePersona]}</div>
                <div style="flex: 1; min-width: 0;">
                  <div style="color: rgba(255,255,255,0.65); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 2px;">${PERSONA_LABELS[activePersona]}</div>
                  <div style="display: flex; align-items: baseline; gap: 8px;">
                    <span style="font-size: 2rem; font-weight: 800; color: #fff; line-height: 1;">${headlineValue}</span>
                    <span style="font-size: 0.85rem; color: rgba(255,255,255,0.7); font-weight: 500;">${headlineLabel}</span>
                  </div>
                  <div style="color: rgba(255,255,255,0.55); font-size: 0.78rem; margin-top: 2px;">${headlineSubtitle}</div>
                </div>
              </div>
            </div>

            <!-- Scrollable body -->
            <div style="
              background: var(--tblr-bg-surface, #fff);
              overflow-y: auto;
              flex: 1;
              padding-bottom: 8px;
            ">

              <!-- Row 1: Metric cards -->
              <div class="row g-2" style="padding: 14px 16px 0; margin: 0;">
                ${metricCards.map(m => html`
                  <div class="col-6 col-sm-3">
                    <div style="
                      background: var(--tblr-bg-surface-secondary, #f8f9fa);
                      border-radius: 10px;
                      padding: 10px 12px;
                      border: 1px solid var(--tblr-border-color, #e6e7e9);
                      height: 100%;
                    ">
                      <div style="font-size: 1.3rem; font-weight: 800; color: ${m.valueColor}; line-height: 1.1; margin-bottom: 2px;">${m.value}</div>
                      <div style="font-size: 0.63rem; color: var(--tblr-secondary, #666); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${m.label}</div>
                      ${m.sub ? html`<div style="font-size: 0.63rem; color: ${m.valueColor}; opacity: 0.75; margin-top: 1px;">${m.sub}</div>` : ''}
                    </div>
                  </div>
                `)}
              </div>

              <!-- Row 2: Action list -->
              ${actionRows.length > 0 ? html`
                <div style="padding: 12px 16px 0;">
                  <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tblr-secondary, #999); margin-bottom: 8px;">
                    ${activePersona === 'it' ? 'Top apps to patch' : activePersona === 'auditor' ? 'Compliance status' : 'Priority actions'}
                  </div>
                  ${actionRows.map(a => html`
                    <div style="
                      display: flex;
                      align-items: flex-start;
                      gap: 10px;
                      padding: 8px 0;
                      border-bottom: 1px solid var(--tblr-border-color, #f0f0f0);
                    ">
                      <span style="
                        flex-shrink: 0;
                        font-size: 0.65rem;
                        font-weight: 700;
                        color: ${a.badgeColor};
                        background: ${a.badgeColor}18;
                        padding: 2px 7px;
                        border-radius: 4px;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        margin-top: 1px;
                        border: 1px solid ${a.badgeColor}33;
                        white-space: nowrap;
                      ">${a.badge}</span>
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.84rem; font-weight: 500; color: var(--tblr-body-color, #333); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.title}</div>
                        ${a.sub ? html`<div style="font-size: 0.75rem; color: var(--tblr-secondary, #888); margin-top: 1px;">${a.sub}</div>` : ''}
                      </div>
                    </div>
                  `)}
                </div>
              ` : html`
                <div style="padding: 16px 16px 4px; color: var(--tblr-success, #2fb344); font-size: 0.875rem; display: flex; align-items: center; gap: 8px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10-10"/></svg>
                  All clear — no immediate actions required
                </div>
              `}

              ${businessTrendChart}

              <!-- Row 2b: Persona KR metrics (aiTrends) -->
              ${(activePersona === 'security' || activePersona === 'auditor') && (mttdDays != null || mttrDays != null || vulnGrowth != null) ? html`
                <div style="padding: 12px 16px 0;">
                  <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tblr-secondary, #999); margin-bottom: 8px;">Key Result Metrics</div>
                  <div class="row g-2" style="margin: 0;">
                    ${mttdDays != null ? html`<div class="col-6"><div style="background:var(--tblr-bg-surface-secondary,#f8f9fa);border-radius:8px;padding:8px 10px;border:1px solid var(--tblr-border-color,#e6e7e9);">
                      <div style="font-size:1rem;font-weight:800;color:${mttdDays<14?'#16a34a':mttdDays<30?'#d97706':'#dc2626'}">${mttdDays.toFixed(1)}d</div>
                      <div style="font-size:0.6rem;color:var(--tblr-secondary,#666);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">MTTD <span style="font-weight:400;opacity:0.7">(detect)</span></div>
                    </div></div>` : ''}
                    ${mttrDays != null ? html`<div class="col-6"><div style="background:var(--tblr-bg-surface-secondary,#f8f9fa);border-radius:8px;padding:8px 10px;border:1px solid var(--tblr-border-color,#e6e7e9);">
                      <div style="font-size:1rem;font-weight:800;color:${mttrDays<30?'#16a34a':mttrDays<60?'#d97706':'#dc2626'}">${mttrDays.toFixed(1)}d</div>
                      <div style="font-size:0.6rem;color:var(--tblr-secondary,#666);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">MTTR <span style="font-weight:400;opacity:0.7">(remediate)</span></div>
                    </div></div>` : ''}
                    ${patchCovPct != null ? html`<div class="col-6"><div style="background:var(--tblr-bg-surface-secondary,#f8f9fa);border-radius:8px;padding:8px 10px;border:1px solid var(--tblr-border-color,#e6e7e9);">
                      <div style="font-size:1rem;font-weight:800;color:${patchCovPct>=90?'#16a34a':patchCovPct>=70?'#d97706':'#dc2626'}">${patchCovPct.toFixed(0)}%</div>
                      <div style="font-size:0.6rem;color:var(--tblr-secondary,#666);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Patch Coverage</div>
                    </div></div>` : ''}
                    ${vulnGrowth != null ? html`<div class="col-6"><div style="background:var(--tblr-bg-surface-secondary,#f8f9fa);border-radius:8px;padding:8px 10px;border:1px solid var(--tblr-border-color,#e6e7e9);">
                      <div style="font-size:1rem;font-weight:800;color:${vulnGrowth<=0?'#16a34a':vulnGrowth<5?'#d97706':'#dc2626'}">${vulnGrowth>0?'+':''}${vulnGrowth.toFixed(1)}%</div>
                      <div style="font-size:0.6rem;color:var(--tblr-secondary,#666);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Vuln Growth <span style="font-weight:400;opacity:0.7">/wk</span></div>
                    </div></div>` : ''}
                  </div>
                </div>
              ` : ''}

              <!-- Row 2c: IT KR metrics (aiTrends) -->
              ${activePersona === 'it' && (mttdDays != null || patchCovPct != null || (it.inventory?.osBreakdown && Object.keys(it.inventory.osBreakdown).length > 0)) ? html`
                <div style="padding: 12px 16px 0;">
                  <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tblr-secondary, #999); margin-bottom: 8px;">Operational Metrics</div>
                  ${it.inventory?.osBreakdown && Object.keys(it.inventory.osBreakdown).length > 0 ? html`
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                      ${Object.entries(it.inventory.osBreakdown).map(([os, count]) => html`
                        <span style="font-size:0.7rem;font-weight:600;padding:3px 9px;border-radius:20px;background:var(--tblr-bg-surface-secondary,#f0f0f0);color:var(--tblr-body-color,#333);border:1px solid var(--tblr-border-color,#e0e0e0);">
                          ${os} <span style="font-weight:400;opacity:0.7">×${count}</span>
                        </span>
                      `)}
                    </div>
                  ` : ''}
                  ${mttdDays != null ? html`<div style="font-size:0.8rem;color:var(--tblr-secondary,#666);margin-top:2px;">MTTD: <strong style="color:${mttdDays<14?'#16a34a':mttdDays<30?'#d97706':'#dc2626'}">${mttdDays.toFixed(1)} days</strong></div>` : ''}
                </div>
              ` : ''}

              <!-- Row 2d: Top CVE table (security only) -->
              ${activePersona === 'security' && (data.securityPro?.cveDetails || []).length > 0 ? html`
                <div style="padding: 12px 16px 0;">
                  <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tblr-secondary, #999); margin-bottom: 8px;">Top Vulnerabilities</div>
                  <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.75rem;">
                      <thead>
                        <tr style="border-bottom:1px solid var(--tblr-border-color,#e6e7e9);">
                          <th style="text-align:left;padding:4px 6px 4px 0;font-weight:600;color:var(--tblr-secondary,#666);">CVE</th>
                          <th style="text-align:right;padding:4px 4px;font-weight:600;color:var(--tblr-secondary,#666);">CVSS</th>
                          <th style="text-align:right;padding:4px 0;font-weight:600;color:var(--tblr-secondary,#666);">EPSS</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(data.securityPro.cveDetails || []).slice(0,5).map(c => html`
                          <tr style="border-bottom:1px solid var(--tblr-border-color,#f0f0f0);">
                            <td style="padding:5px 6px 5px 0;">
                              <span style="font-weight:600;color:${c.severity==='Critical'?'#dc2626':c.severity==='High'?'#d97706':'#6366f1'}">${c.cveId}</span>
                              ${c.hasKevExploit ? html`<span style="font-size:0.6rem;font-weight:700;color:#ea580c;background:#ea580c18;border:1px solid #ea580c33;border-radius:3px;padding:1px 4px;margin-left:4px;">KEV</span>` : ''}
                            </td>
                            <td style="text-align:right;padding:5px 4px;color:${(c.cvssScore||0)>=9?'#dc2626':(c.cvssScore||0)>=7?'#d97706':'#6b7280'};font-weight:600;">${c.cvssScore?.toFixed(1) || '—'}</td>
                            <td style="text-align:right;padding:5px 0;color:${(c.epssScore||0)>=0.5?'#7c3aed':'#6b7280'};font-weight:${(c.epssScore||0)>=0.5?'700':'400'}">${c.epssScore != null ? `${(c.epssScore*100).toFixed(0)}%` : '—'}</td>
                          </tr>
                        `)}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : ''}

              <!-- Row 3: CTA buttons -->
              <div style="padding: 12px 16px 4px; display: flex; gap: 8px; flex-wrap: wrap;">
                ${ctaList.map((cta, i) => html`
                  ${(() => {
                    const personalBlocked = this.isPersonalOrg() && cta.businessOnly;
                    return html`
                  <a
                    href="${cta.href}"
                    class=${personalBlocked ? 'business-license-only' : ''}
                    title=${personalBlocked ? BUSINESS_ONLY_TOOLTIP : ''}
                    data-business-tooltip=${personalBlocked ? BUSINESS_ONLY_TOOLTIP : ''}
                    onClick=${() => {
                      if (personalBlocked) {
                        window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                        return;
                      }
                      this.closePersonaSheet();
                      window.location.hash = cta.href.slice(1);
                    }}
                    style="
                      font-size: 0.78rem;
                      font-weight: 600;
                      color: ${i === 0 ? '#fff' : 'var(--tblr-body-color, #333)'};
                      background: ${i === 0 ? headerGradient : 'var(--tblr-bg-surface-secondary, #f5f5f5)'};
                      border: 1px solid ${i === 0 ? 'transparent' : 'var(--tblr-border-color, #e6e7e9)'};
                      padding: 6px 14px;
                      border-radius: 8px;
                      text-decoration: none;
                      transition: opacity 0.15s;
                    "
                  >${cta.label} →</a>
                    `;
                  })()}
                `)}
              </div>

            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderCyberHygieneLanding(data, embedded = false) {
    const { cyberHygieneCollapsed } = this.state;
    const ch = this.getCyberHygieneData(data);
    if (!ch) return '';

    const securityVal = Number(ch.security || 0);
    const complianceVal = Number(ch.compliance || 0);
    const auditVal = Number(ch.audit || 0);
    const riskVal = Number(ch.riskPosture || 0);
    const computedDisplayScore = Math.round((securityVal * 0.4) + (complianceVal * 0.25) + (auditVal * 0.2) + (riskVal * 0.15));
    const displayScore = Number(ch.score) > 0 ? Number(ch.score) : computedDisplayScore;
    const displayGrade = Number(ch.score) > 0
      ? (ch.grade || (displayScore >= 90 ? 'A' : displayScore >= 80 ? 'B' : displayScore >= 70 ? 'C' : displayScore >= 60 ? 'D' : 'F'))
      : (displayScore >= 90 ? 'A' : displayScore >= 80 ? 'B' : displayScore >= 70 ? 'C' : displayScore >= 60 ? 'D' : 'F');

    const gradeColor = displayGrade === 'A' ? '#16a34a'
      : displayGrade === 'B' ? '#10b981'
      : displayGrade === 'C' ? '#d97706'
      : displayGrade === 'D' ? '#f97316'
      : '#dc2626';

    const tierColor = ch.insuranceTier?.startsWith('Insurance') ? '#16a34a'
      : ch.insuranceTier?.startsWith('Conditional') ? '#d97706'
      : '#dc2626';

    const pillars = [
      { label: 'Security',     value: ch.security },
      { label: 'Compliance',   value: ch.compliance },
      { label: 'Audit',        value: ch.audit },
      { label: 'Risk Posture', value: ch.riskPosture },
    ];
    const barColor = v => v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626';
    const topGap = pillars
      .slice()
      .sort((a, b) => (a.value || 0) - (b.value || 0))
      .find(p => (p.value || 0) < 100) || null;

    const threats = data?.securityPro?.threatIntel || {};
    const fleet = this.getFleetStats(data);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const isCollapsedDesktop = cyberHygieneCollapsed && !isSmallScreen;
    const useSingleHeaderRow = !cyberHygieneCollapsed && !isSmallScreen;
    const wrapperStyle = embedded
      ? `max-width: ${isCollapsedDesktop ? '550px' : '800px'}; margin: 0 auto 8px;`
      : 'margin-top: -16px; margin-bottom: 8px;';
    const headerTitleStyle = isCollapsedDesktop
      ? 'color:var(--tblr-body-color,#111827); font-weight:800; font-size:1.2rem; line-height:1.14; letter-spacing:0.01em;'
      : (useSingleHeaderRow
        ? 'color:var(--tblr-body-color,#111827); font-weight:800; font-size:1rem; line-height:1.04; letter-spacing:0.005em; white-space:nowrap;'
        : 'color:var(--tblr-body-color,#111827); font-weight:800; font-size:1.14rem; line-height:1.08; letter-spacing:0.01em;');
    const headerTileWidth = isSmallScreen ? 0 : 122;
    const headerTileHeight = isSmallScreen ? 42 : 46;
    const headerLabelSize = isSmallScreen ? '0.46rem' : '0.5rem';
    const headerValueSize = isSmallScreen ? '0.84rem' : '0.95rem';

    const gradeBg = displayGrade === 'A' || displayGrade === 'B'
      ? '#e8f9ef'
      : displayGrade === 'C' || displayGrade === 'D'
        ? '#fff4e5'
        : '#ffe9e9';
    const insuranceBg = ch.insuranceTier?.startsWith('Insurance')
      ? '#e8f9ef'
      : ch.insuranceTier?.startsWith('Conditional')
        ? '#fff4e5'
        : '#ffe9e9';

    const metricTileStyle = (bgColor, borderColor) => `
      flex:${isSmallScreen ? '1 1 calc(50% - 6px)' : '0 0 auto'};
      min-width:${headerTileWidth}px;
      height:${headerTileHeight}px;
      border-radius:10px;
      padding:${isSmallScreen ? '4px 7px' : '5px 8px'};
      background:${bgColor};
      color:#0f172a;
      border:1px solid ${borderColor};
      display:grid;
      grid-template-columns:20px 1fr;
      column-gap:7px;
      align-items:center;
    `;

    return html`
      <style>
        @keyframes cyberExpandBounce {
          0%, 100% { transform: translateY(0); }
          35% { transform: translateY(-2px); }
          70% { transform: translateY(1px); }
        }
      </style>
      <div class="container-xl" style=${wrapperStyle}>
        <div class="card" style="position:relative; border: 1px solid var(--tblr-border-color, #e6e7e9); border-left: 4px solid ${gradeColor}; border-radius: 12px; overflow: visible;">
          <div
            class="card-header"
            role="button"
            tabIndex="${cyberHygieneCollapsed ? '0' : '-1'}"
            aria-label=${cyberHygieneCollapsed ? 'Expand Cyber Hygiene' : 'Collapse Cyber Hygiene'}
            onClick=${(e) => {
              if (e.target?.closest('button,a,input,textarea,select')) return;
              this.setState({ cyberHygieneCollapsed: !cyberHygieneCollapsed });
            }}
            onKeyDown=${(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.setState({ cyberHygieneCollapsed: !cyberHygieneCollapsed });
              }
            }}
            style="display:block; position:relative; background: var(--tblr-bg-surface-secondary, #f8fafc); border-bottom: ${cyberHygieneCollapsed ? 'none' : '1px solid var(--tblr-border-color, #e6e7e9)'}; cursor:pointer; padding:12px 16px;"
          >
            <div class=${useSingleHeaderRow ? 'd-flex align-items-center justify-content-between gap-2 w-100' : 'd-flex flex-column w-100 gap-2'}>
              <div class=${useSingleHeaderRow ? 'd-flex align-items-center justify-content-start gap-1 text-start flex-nowrap' : 'd-flex align-items-center justify-content-center gap-1 flex-wrap text-center'}>
                <h3 class="card-title mb-0 d-flex align-items-center gap-1">
                  <span style=${headerTitleStyle}>⚡MAGI LENS Cyber Hygiene</span>
                  <button
                    title="Business signal: a single confidence view across security posture, compliance gaps, audit readiness, and cyber-insurance eligibility."
                    aria-label="About the MAGI signal"
                    style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; padding:0; border:none; background:transparent; color:var(--tblr-secondary,#6b7280); cursor:help; opacity:0.8;"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9h.01"/><path d="M11 12h1v4h1"/><path d="M12 3a9 9 0 1 0 9 9a9 9 0 0 0 -9 -9"/></svg>
                  </button>
                </h3>
              </div>
              <div
                class="d-flex align-items-center gap-1 w-100"
                style=${`justify-content:${useSingleHeaderRow ? 'flex-end' : (isSmallScreen ? 'flex-start' : 'center')}; flex-wrap:${useSingleHeaderRow ? 'nowrap' : (isSmallScreen ? 'wrap' : 'nowrap')};`}
              >
                <div style=${metricTileStyle('#e8f0ff', '#bed3ff')}>
                  <span style="font-size:1.08rem; line-height:1; grid-row:1 / span 2; display:flex; align-items:center; justify-content:center;">🧠</span>
                  <div style="font-size:${headerLabelSize}; text-transform:uppercase; letter-spacing:0.08em; opacity:0.92; font-weight:700; line-height:1.05;">MAGI Score</div>
                  <div style="font-size:${headerValueSize}; font-weight:800; line-height:1.05; color:#1d4ed8;">${displayScore}/100</div>
                </div>
                <div style=${metricTileStyle(gradeBg, `${gradeColor}55`)}>
                  <span style="font-size:1.08rem; line-height:1; grid-row:1 / span 2; display:flex; align-items:center; justify-content:center;">🏅</span>
                  <div style="font-size:${headerLabelSize}; text-transform:uppercase; letter-spacing:0.08em; opacity:0.92; font-weight:700; line-height:1.05;">Grade</div>
                  <div style="font-size:${headerValueSize}; font-weight:800; line-height:1.05; color:${gradeColor};">${displayGrade}</div>
                </div>
                <div style=${metricTileStyle(insuranceBg, `${tierColor}55`)}>
                  <span style="font-size:1.08rem; line-height:1; grid-row:1 / span 2; display:flex; align-items:center; justify-content:center;">🛡️</span>
                  <div style="font-size:${headerLabelSize}; text-transform:uppercase; letter-spacing:0.08em; opacity:0.92; font-weight:700; line-height:1.05;">Insurance</div>
                  <div style="font-size:${headerValueSize}; font-weight:800; line-height:1.05; color:${tierColor};">${ch.insuranceTier}</div>
                </div>
                <div style=${isSmallScreen ? 'margin-left:auto; flex:0 0 auto; align-self:center;' : 'margin-left:8px; flex:0 0 auto; align-self:center;'}>
                  <button
                    onClick=${(e) => { e.stopPropagation(); this.setState({ cyberHygieneCollapsed: !cyberHygieneCollapsed }); }}
                    title=${cyberHygieneCollapsed ? 'Expand Cyber Hygiene' : 'Collapse Cyber Hygiene'}
                    aria-label=${cyberHygieneCollapsed ? 'Expand Cyber Hygiene' : 'Collapse Cyber Hygiene'}
                    style="display:inline-flex; align-items:center; justify-content:center; width:${isSmallScreen ? '42px' : '34px'}; min-width:${isSmallScreen ? '42px' : '34px'}; height:${isSmallScreen ? '42px' : '34px'}; border-radius:10px; border:1px solid rgba(14,165,233,0.35); background:rgba(14,165,233,0.14); color:#0369a1; cursor:pointer;"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" fill="none" style="transition:transform 0.2s ease; transform:rotate(${cyberHygieneCollapsed ? '0' : '180'}deg); ${cyberHygieneCollapsed ? 'animation: cyberExpandBounce 1.2s ease-in-out infinite;' : ''}"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          ${!cyberHygieneCollapsed ? html`
          <div class="card-body" style="padding:8px 14px 6px;">
            <div class="row g-2 align-items-start">
              <div class="col-lg-5">
                <div style="height: 204px;" ref=${(el) => { this.cyberChartRef = el; }}></div>
              </div>
              <div class="col-lg-7" style="display:flex; flex-direction:column; justify-content:center;">
                <div class="row g-2">
                  ${pillars.map((p) => {
                    const isWeakest = topGap && topGap.label === p.label;
                    return html`
                    <div class="col-sm-6">
                      <div style="position:relative; overflow:hidden; border:1px solid var(--tblr-border-color-translucent, #e6e7e9); border-radius:10px; padding:8px 10px; background: var(--tblr-bg-surface-secondary, #fafbfc);">
                        ${isWeakest ? html`
                          <span
                            title="Weakest pillar. Improving this card first raises the overall Cyber Hygiene score fastest."
                            style="position:absolute; top:8px; right:-20px; transform:rotate(24deg); background:linear-gradient(135deg,#f59f00,#ef4444); color:#fff; font-size:0.58rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; padding:2px 24px; box-shadow:0 2px 6px rgba(15,23,42,0.2);"
                          >Weakest</span>
                        ` : ''}
                        <div class="d-flex justify-content-between align-items-center mb-1">
                          <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--tblr-secondary, #6b7280); font-weight:700;">${p.label}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                          <span style="font-size:1.15rem; font-weight:800; color:${barColor(p.value)}; line-height:1;">${Math.round(p.value || 0)}</span>
                          <span style="font-size:0.72rem; color:var(--tblr-secondary, #6b7280);">${p.value >= 80 ? 'Strong' : p.value >= 60 ? 'Watch' : 'Needs attention'}</span>
                        </div>
                        <div style="height:5px; background:var(--tblr-border-color-translucent, #e6e7e9); border-radius:999px; overflow:hidden; margin-top:6px;">
                          <div style="height:100%; width:${Math.max(2, Math.min(100, Math.round(p.value || 0)))}%; background:${barColor(p.value)};"></div>
                        </div>
                      </div>
                    </div>
                    `;
                  })}
                </div>

                <div style="margin-top:6px;" class="d-flex flex-wrap gap-2">
                  <span class="badge bg-danger-lt text-danger">Critical ${Number(threats.criticalCveCount || 0)}</span>
                  <span class="badge bg-warning-lt text-warning">High ${Number(threats.highCveCount || 0)}</span>
                  <span class="badge bg-info-lt text-info">Online ${fleet.online}/${fleet.total}</span>
                  <span class="badge bg-secondary-lt text-secondary">Offline ${fleet.offline}</span>
                </div>
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderCyberHygieneChart() {
    const ch = this.getCyberHygieneData(this.state?.data);
    if (!this.cyberChartRef || !window.ApexCharts || !ch) {
      if (this._cyberChart) {
        this._cyberChart.destroy();
        this._cyberChart = null;
      }
      return;
    }

    const theme = (document.documentElement.getAttribute('data-bs-theme') || 'light').toLowerCase();
    const labels = ['Security', 'Compliance', 'Audit', 'Risk Posture'];
    const series = [
      Math.round(ch.security || 0),
      Math.round(ch.compliance || 0),
      Math.round(ch.audit || 0),
      Math.round(ch.riskPosture || 0)
    ];
    const derivedScore = Math.round((series[0] * 0.4) + (series[1] * 0.25) + (series[2] * 0.2) + (series[3] * 0.15));
    const seriesSignature = `${theme}:${series.join('|')}:${derivedScore}`;

    if (this._cyberChart && this._cyberTheme === theme && this._cyberSeriesSignature === seriesSignature) {
      return;
    }

    if (this._cyberChart) {
      this._cyberChart.destroy();
      this._cyberChart = null;
    }

    const options = {
      chart: {
        type: 'radialBar',
        height: 204,
        toolbar: { show: false },
        background: 'transparent'
      },
      series,
      labels,
      legend: {
        position: 'bottom',
        fontSize: '12px',
        labels: {
          colors: theme === 'dark' ? '#cbd5e1' : '#4b5563'
        }
      },
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 225,
          hollow: {
            size: '34%'
          },
          track: {
            background: theme === 'dark' ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.16)',
            strokeWidth: '100%',
            margin: 4
          },
          dataLabels: {
            name: {
              fontSize: '11px',
              color: theme === 'dark' ? '#94a3b8' : '#6b7280'
            },
            value: {
              fontSize: '13px',
              fontWeight: 700,
              color: theme === 'dark' ? '#e5e7eb' : '#111827',
              formatter: (v) => `${Math.round(v)}`
            },
            total: {
              show: true,
              label: 'MAGI Score',
              color: theme === 'dark' ? '#94a3b8' : '#6b7280',
              fontSize: '11px',
              formatter: () => `${derivedScore}`
            }
          }
        }
      },
      stroke: {
        lineCap: 'round'
      },
      colors: ['#3b82f6', '#14b8a6', '#f59f00', '#ef4444'],
      tooltip: {
        y: {
          formatter: (val) => `${Math.round(val)} / 100`
        }
      },
      theme: { mode: theme }
    };

    this._cyberChart = new window.ApexCharts(this.cyberChartRef, options);
    this._cyberChart.render();
    this._cyberTheme = theme;
    this._cyberSeriesSignature = seriesSignature;
  }

  renderSecurityOfficerDrawer(options = {}) {
    const { data, officerNoteOpen, officerNoteDismissed } = this.state;
    if (!data || officerNoteDismissed) return null;
    const embeddedInCard = options.embeddedInCard === true;

    const score = data.securityScore || {};
    const threats = data.securityPro?.threatIntel || {};
    const actions = data.businessOwner?.topActions || [];

    const secScore = typeof score.score === 'number' ? score.score : 100;
    const grade = score.grade || '—';
    const critical = threats.criticalCveCount || 0;
    const high = threats.highCveCount || 0;
    const reportCard = data.reportCard || {};
    const reportGeneratedAt = reportCard.generatedAt ? new Date(reportCard.generatedAt) : null;

    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;

    // Only show when there's something to flag
    if (secScore >= 80 && critical === 0 && high === 0) return null;

    const urgentAction = actions.find(a => a.urgency === 'critical' || a.urgency === 'urgent') || actions[0];
    const urgencyRaw = String(urgentAction?.urgency || '').toLowerCase();
    let urgencyLabel = (urgentAction?.urgency || 'action').toString().toUpperCase();
    if ((critical > 0 || high > 0) && (urgencyRaw === '' || urgencyRaw === 'routine' || urgencyRaw === 'low')) {
      urgencyLabel = critical > 0 ? 'IMMEDIATE' : 'HIGH';
    }

    const titleRaw = String(urgentAction?.title || '').trim();
    const actionDeviceMatch = titleRaw.match(/\son\s(\d+)\sdevice(s)?\.?$/i);
    const actionDeviceCount = actionDeviceMatch ? Number(actionDeviceMatch[1]) : 0;
    const actionTitle = actionDeviceMatch
      ? titleRaw.replace(/\son\s\d+\sdevice(s)?\.?$/i, '').trim()
      : titleRaw;

    const descRaw = String(urgentAction?.description || '').trim();
    const descDeviceMatch = descRaw.match(/^Affects\s(\d+)\sdevice(s)?\.?$/i);
    const descDeviceCount = descDeviceMatch ? Number(descDeviceMatch[1]) : 0;

    const shouldHideDescription = !descRaw
      || (descDeviceCount > 0 && actionDeviceCount > 0 && descDeviceCount === actionDeviceCount);

    const normalizedDescription = shouldHideDescription ? '' : descRaw;

    // Use structured device fields from API; fall back to regex count from title
    const apiDeviceId   = urgentAction?.primaryDeviceId   || null;
    const apiDeviceName = urgentAction?.primaryDeviceName || null;
    const apiDeviceCount = urgentAction?.deviceCount != null ? urgentAction.deviceCount : actionDeviceCount;
    let targetDeviceLine = '';
    let targetDeviceNode = null;
    if (apiDeviceName && apiDeviceCount === 1) {
      const deviceHref = apiDeviceId ? `#!/devices/${apiDeviceId}` : '#!/devices';
      targetDeviceNode = html`<a href=${deviceHref} style="font-size:0.72rem;color:rgba(255,255,255,0.65);text-decoration:underline;text-underline-offset:2px;">${apiDeviceName}</a>`;
    } else if (apiDeviceCount > 1 && apiDeviceName) {
      // primary device + N more
      const extra = apiDeviceCount - 1;
      targetDeviceNode = html`<span style="font-size:0.72rem;color:rgba(255,255,255,0.55);">${apiDeviceName} + ${extra} more device${extra === 1 ? '' : 's'}</span>`;
    } else if (apiDeviceCount > 0) {
      targetDeviceLine = `Targets ${apiDeviceCount} device${apiDeviceCount === 1 ? '' : 's'}.`;
    };

    const isGreenGrade = ['A+','A','A-','B+','B','B-'].includes(grade);
    const isAmberGrade = ['C+','C','C-'].includes(grade);
    const gradeColor = isGreenGrade ? '#16a34a' : isAmberGrade ? '#d97706' : '#dc2626';
    const borderColor = isGreenGrade ? 'rgba(22,163,74,0.4)' : isAmberGrade ? 'rgba(217,119,6,0.4)' : 'rgba(239,68,68,0.5)';
    const bgColor = isGreenGrade ? 'rgba(22,163,74,0.08)' : isAmberGrade ? 'rgba(217,119,6,0.08)' : 'rgba(239,68,68,0.06)';
    const noteAccent = embeddedInCard ? gradeColor : '#ef4444';
    const noteBorderColor = embeddedInCard ? borderColor : 'rgba(239,68,68,0.62)';
    const noteBgColor = embeddedInCard
      ? 'var(--tblr-bg-surface, #ffffff)'
      : 'linear-gradient(135deg, rgba(24,10,14,0.96), rgba(36,12,17,0.94))';

    let situationText = '';
    if (critical > 0 && high > 0) {
      situationText = `${critical} critical · ${high} high vulnerabilities require immediate remediation.`;
    } else if (critical > 0) {
      situationText = `${critical} critical CVE${critical !== 1 ? 's' : ''} require immediate attention.`;
    } else if (high > 0) {
      situationText = `${high} high-severity CVE${high !== 1 ? 's' : ''} detected across your fleet.`;
    } else {
      situationText = `Security posture is below target threshold.`;
    }

    // Styled version with severity color dots for display only
    const situationNode = (critical > 0 && high > 0)
      ? html`Immediate Attention: <span style="color:#ff6b6b; font-size:0.65rem;">●</span> <strong>${critical} critical</strong> · <span style="color:#ffa94d; font-size:0.65rem;">●</span> <strong>${high} high</strong> vulnerabilities.`
      : (critical > 0)
      ? html`Immediate Attention: <span style="color:#ff6b6b; font-size:0.65rem;">●</span> <strong>${critical} critical</strong> vulnerabilities.`
      : (high > 0)
      ? html`Immediate Attention: <span style="color:#ffa94d; font-size:0.65rem;">●</span> <strong>${high} high</strong> vulnerabilities.`
      : html`Security posture is below target threshold.`;

    const freshness = this.getFreshnessInfo();
    const signalUpdatedText = freshness ? freshness.ageText : 'unknown';
    const { signalLine } = buildOfficerNoteStatusCopy({
      signalUpdatedText,
      reportCard
    });

    const glowAnim = isGreenGrade ? 'gradeGlowGreen' : isAmberGrade ? 'gradeGlowAmber' : 'gradeGlowRed';
    const panelMaxHeight = embeddedInCard ? '2000px' : '560px';
    const panelPositionStyle = embeddedInCard
      ? 'position:absolute; top:100%; left:0; right:0; width:100%;'
      : 'position:absolute; top:100%; left:0; right:0; width:100%;';

    return html`
      <style>
        @keyframes officerSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradeGlowRed {
          0%, 100% { box-shadow: 0 0 24px rgba(220,38,38,0.13), 0 0 48px rgba(220,38,38,0.06), inset 0 0 12px rgba(220,38,38,0.05); }
          50%      { box-shadow: 0 0 36px rgba(220,38,38,0.22), 0 0 64px rgba(220,38,38,0.10), inset 0 0 16px rgba(220,38,38,0.08); }
        }
        @keyframes gradeGlowAmber {
          0%, 100% { box-shadow: 0 0 24px rgba(217,119,6,0.13), 0 0 48px rgba(217,119,6,0.06), inset 0 0 12px rgba(217,119,6,0.05); }
          50%      { box-shadow: 0 0 36px rgba(217,119,6,0.22), 0 0 64px rgba(217,119,6,0.10), inset 0 0 16px rgba(217,119,6,0.08); }
        }
        @keyframes gradeGlowGreen {
          0%, 100% { box-shadow: 0 0 24px rgba(22,163,74,0.13), 0 0 48px rgba(22,163,74,0.06), inset 0 0 12px rgba(22,163,74,0.05); }
          50%      { box-shadow: 0 0 36px rgba(22,163,74,0.22), 0 0 64px rgba(22,163,74,0.10), inset 0 0 16px rgba(22,163,74,0.08); }
        }
        @keyframes noteBounceHint {
          0%, 100% { transform: translateY(0); }
          35% { transform: translateY(-2px); }
          70% { transform: translateY(1px); }
        }
      </style>

      <div>

        <!-- Scrim backdrop -->
        <div
          onClick=${() => this.setState({ officerNoteOpen: false })}
          style="
            position: fixed;
            inset: 0;
            z-index: 180;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            transition: opacity 0.3s ease;
            opacity: ${(embeddedInCard && officerNoteOpen) ? '1' : '0'};
            pointer-events: ${(embeddedInCard && officerNoteOpen) ? 'all' : 'none'};
          "
        ></div>

        <!-- Embedded card overlay wrapper -->
        <div class=${embeddedInCard ? '' : 'security-officer-top-note'} style="${embeddedInCard
          ? 'position:relative; z-index:220; width:min(390px, calc(100vw - 40px)); margin:0 auto;'
          : 'position:relative; z-index:' + (officerNoteOpen ? '950' : '5') + '; width:min(390px, calc(100vw - 40px)); margin:0 auto 8px;'}">

        <!-- Collapsed tab styled to match bottom persona lenses -->
        <div
          role="button"
          tabIndex="0"
          aria-expanded=${officerNoteOpen ? 'true' : 'false'}
          aria-controls="security-officer-note-panel"
          aria-label="Toggle Security Officer note"
          onClick=${() => this.setState({ officerNoteOpen: !officerNoteOpen })}
          onKeyDown=${(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this.setState({ officerNoteOpen: !officerNoteOpen });
            }
          }}
          style="
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: ${embeddedInCard ? '8px 44px 8px 44px' : '8px 44px 8px 44px'};
            width: 100%;
            cursor: pointer;
            user-select: none;
            background: ${noteBgColor};
            border: 1px solid ${noteBorderColor};
            border-top: 2px solid ${noteAccent};
            border-radius: ${officerNoteOpen ? '14px 14px 0 0' : '14px'};
            transition: border-radius 0.3s ease;
            box-shadow: ${embeddedInCard ? '0 6px 18px rgba(15,23,42,0.08)' : '0 0 0 1px rgba(239,68,68,0.25), 0 0 16px rgba(239,68,68,0.24), 0 6px 18px rgba(15,23,42,0.18)'};
          "
        >
          <!-- Shield icon -->
          <svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="${noteAccent}" fill="none" style="${embeddedInCard ? 'position:absolute; left:14px; top:50%; transform:translateY(-50%); opacity:0.9;' : 'position:absolute; left:14px; top:50%; transform:translateY(-50%); opacity:0.9;'}">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
            <path d="M9 12l2 2l4-4"/>
          </svg>

          <!-- Title text -->
          ${embeddedInCard ? html`
            <span style="font-size: 0.67rem; font-weight: 800; color: var(--tblr-body-color, #1f2937); letter-spacing: 0.12em; text-transform: uppercase; text-align:center; width:100%;">Security Officer's Note</span>
          ` : html`
            <span style="font-size: 0.67rem; font-weight: 800; color: #fecaca; letter-spacing: 0.12em; text-transform: uppercase; text-align:center; width:100%; text-shadow:0 0 12px rgba(239,68,68,0.35);">Security Officer's Note</span>
          `}

          <!-- Chevron -->
          <svg
            width="13" height="13" viewBox="0 0 24 24" stroke-width="2.5"
            stroke="var(--tblr-secondary, #6b7280)" fill="none"
            style="position:absolute; right:34px; top:50%; transition: transform 0.3s ease; transform:translateY(-50%) rotate(${officerNoteOpen ? '180' : '0'}deg); ${embeddedInCard && !officerNoteOpen ? 'animation: noteBounceHint 1.2s ease-in-out infinite;' : ''}"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>

          <!-- Dismiss X -->
          <button
            onClick=${(e) => { e.stopPropagation(); this.dismissOfficerNote(orgId); }}
            style="
              position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
              background: none; border: none; color: var(--tblr-secondary, #6b7280); cursor: pointer;
              font-size: 0.85rem; line-height: 1; padding: 2px 4px;
              transition: color 0.15s;
            "
            title="Dismiss"
            aria-label="Dismiss Security Officer note"
          >✕</button>
        </div>

        <!-- Expanded body: absolute overlay below tab -->
        <div id="security-officer-note-panel" style="
          ${panelPositionStyle}
          max-height: ${officerNoteOpen ? panelMaxHeight : '0'};
          overflow: ${officerNoteOpen ? (embeddedInCard ? 'visible' : 'auto') : 'hidden'};
          transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: ${embeddedInCard ? '200' : (officerNoteOpen ? '951' : '1')};
        ">
          <div style="
            background: linear-gradient(180deg, rgba(15,15,25,0.97), rgba(20,18,30,0.97));
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255,255,255,0.08);
            border-top: none;
            border-radius: 0 0 16px 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.15);
            position: relative;
          ">
            <!-- Grade-colored glow line -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, ${gradeColor}55, transparent);"></div>

            <div style="padding: 0;">

              <!-- Grade box — centered -->
              <div style="display: flex; justify-content: center; padding: ${embeddedInCard ? '16px 16px 10px' : '10px 12px 6px'};">
                <div style="
                  width: 80px; height: 80px; border-radius: 14px; flex-shrink: 0;
                  display: flex; flex-direction: column; align-items: center; justify-content: center;
                  background: ${gradeColor}14; border: 1px solid ${gradeColor}40;
                  animation: ${glowAnim} 3s ease-in-out infinite;
                  position: relative; overflow: hidden;
                ">
                  <div style="position: absolute; inset: 0; background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.06) 0%, transparent 60%); pointer-events: none;"></div>
                  <span style="font-size: 2.2rem; font-weight: 900; color: ${gradeColor}; line-height: 1; position: relative;">${grade}</span>
                  <span style="font-size: 0.58rem; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; position: relative;">Grade</span>
                </div>
              </div>

              <!-- Situation text — centered -->
              <div style="text-align: center; padding: ${embeddedInCard ? '0 16px 6px' : '0 12px 4px'};">
                <div style="font-size: 0.88rem; font-weight: 600; color: rgba(255,255,255,0.88); line-height: 1.4; margin-bottom: 6px;">
                  ${situationNode}
                </div>
                <div style="font-size: 0.72rem; color: rgba(255,255,255,0.35); line-height: 1.4;">
                  ${signalLine}
                </div>
              </div>

              <!-- Urgent action card (full width) -->
              ${urgentAction ? html`
                <div style="margin: ${embeddedInCard ? '10px 16px' : '8px 12px'}; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: ${embeddedInCard ? '10px 12px' : '8px 10px'}; text-align: center;">
                  <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
                    <span style="
                      flex-shrink: 0;
                      font-size: 0.62rem; font-weight: 700;
                      color: #d97706; background: rgba(217,119,6,0.12);
                      border: 1px solid rgba(217,119,6,0.25);
                      padding: 1px 6px; border-radius: 4px;
                      text-transform: uppercase; letter-spacing: 0.04em;
                    ">${urgencyLabel}</span>
                    <div style="font-size: 0.83rem; font-weight: 600; color: rgba(255,255,255,0.88); overflow-wrap: anywhere; word-break: break-word;">${actionTitle || titleRaw}</div>
                  </div>
                  ${normalizedDescription ? html`<div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">${normalizedDescription}</div>` : ''}
                  ${targetDeviceNode ? html`<div style="font-size: 0.72rem; color: rgba(255,255,255,0.42); margin-top: 2px;">${targetDeviceNode}</div>` : targetDeviceLine ? html`<div style="font-size: 0.72rem; color: rgba(255,255,255,0.42); margin-top: 2px;">${targetDeviceLine}</div>` : ''}
                  ${urgentAction.deadlineText ? html`<div style="font-size: 0.72rem; color: rgba(255,255,255,0.4); margin-top: 2px;">${urgentAction.deadlineText}</div>` : ''}
                </div>
              ` : ''}

              <!-- Footer links — centered -->
              <div style="display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; padding: ${embeddedInCard ? '8px 16px 14px' : '6px 12px 10px'};">
                <a href="#!/security" style="font-size: 0.76rem; font-weight: 600; color: ${gradeColor}; text-decoration: none;">Full Security Report →</a>
                <button
                  onClick=${() => {
                    if (this.isPersonalOrg()) {
                      window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                      return;
                    }
                    const postureSummary = 'Security grade: ' + grade + ' (score ' + secScore + '/100). ' + situationText + ' Please explain our current security posture in brief and provide up to 5 prioritized action items to improve it.';
                    try { sessionStorage.setItem('ai_analyst_prefill_prompt', postureSummary); } catch (_) {}
                    this.setState({ officerNoteOpen: false });
                    window.location.hash = '#!/analyst';
                  }}
                  class=${this.isPersonalOrg() ? 'business-license-only' : ''}
                  title=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''}
                  data-business-tooltip=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''}
                  style="
                    font-size: 0.76rem; font-weight: 700; color: #fff;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none; border-radius: 20px;
                    padding: 5px 16px; cursor: pointer;
                    box-shadow: 0 0 12px rgba(99,102,241,0.3);
                    transition: box-shadow 0.2s, transform 0.15s;
                  "
                >Ask MAGI →</button>
              </div>

            </div>

            <!-- Bottom fade gradient -->
            <div style="height: 4px; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.15)); border-radius: 0 0 16px 16px;"></div>
          </div>
        </div>

        </div>
      </div>
    `;
  }

  render() {
    const { loading, error } = this.state;

    if (loading) {
      return html`
        <div class="container" style="padding-top: 48px; padding-bottom: 48px;">
          <div style="max-width: 340px; margin: 0 auto; min-height: 42vh; display: flex; align-items: center; justify-content: center;">
            <div style="width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px 24px;border-radius:18px;background:rgba(255,255,255,0.88);border:1px solid rgba(148,163,184,0.18);box-shadow:0 12px 32px rgba(15,23,42,0.08);text-align:center;">
              <div style="
                width: 42px; height: 42px; border-radius: 50%;
                border: 3px solid rgba(99,102,241,0.18);
                border-top-color: #6366f1;
                animation: spin 0.8s linear infinite;
                margin-bottom: 12px;
              "></div>
              <div style="color:#111827;font-size:0.95rem;font-weight:600;">Loading intelligence...</div>
              <div style="color:#6b7280;font-size:0.82rem;margin-top:4px;">Building your current security dossier.</div>
            </div>
          </div>
          <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        </div>
      `;
    }

    if (error && !this.state.data) {
      return html`
        <div class="container p-4">
          <div class="d-flex flex-column justify-content-center align-items-center" style="min-height: 50vh;">
            <div class="display-1 text-muted mb-3">:(</div>
            <h2 class="h2 mb-3">Connection Interrupted</h2>
            <p class="text-muted text-center mb-4" style="max-width: 500px;">
              We couldn't reach the intelligence engine. ${error}
            </p>
            <button class="btn btn-primary btn-pill px-4" onClick=${() => this.loadDashboard()}>
              Try Again
            </button>
          </div>
        </div>
      `;
    }

    return html`
      <div style="min-height: 100vh;">
        ${this.renderBillingNoticeBanner()}
        ${this.renderSearchHeader()}
        <${PersonaNav}
          activePersona=${this.state.activePersona}
          sheetOpen=${this.state.personaSheetOpen}
          onPersonaChange=${this.handlePersonaChange}
        />
        ${this.renderPersonaSheet()}
      </div>
    `;
  }
}
