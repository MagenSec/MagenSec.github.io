/**
 * UnifiedDashboard - Business proof-readiness dashboard.
 * MAGI-first proof-readiness dashboard with readiness model, hygiene trend, and focused evidence details.
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { buildOfficerNoteStatusCopy } from './OfficerNoteCopy.js';
import { bundleToUnifiedPayload } from './bundleAdapter.js';
import { EvidenceBanner } from '../../components/shared/EvidenceBanner.js';
import { MagiGuideCard } from '../../components/shared/MagiGuideCard.js';
import { metricPhrase } from '../../utils/metricUnits.js';

const { html, Component } = window;
const BUSINESS_ONLY_TOOLTIP = 'Feature available in Business License only';
const BUSINESS_ONLY_ROUTES = new Set(['#!/compliance', '#!/reports', '#!/auditor', '#!/analyst']);
function renderMarkdown(text) {
  if (!text) return '';
  let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
  return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

function pointValueIsFinite(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
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
      dossierOpen: false,
      evidenceGapsOpen: false,
      hygieneDetailsOpen: false,
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
    this._unmounted = false;
    this._currentOrgId = null;
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
    this._prevHtmlOverflow = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = 'auto';
    document.documentElement.style.scrollbarWidth = 'thin';
    this.loadDashboard();
    this._orgChangeUnsub = orgContext.onChange(() => {
      // Only reload if the org actually changed (prevents redundant calls during init races)
      const newOrgId = orgContext.getCurrentOrg()?.orgId;
      if (this._currentOrgId && this._currentOrgId === newOrgId) return;
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
    document.documentElement.style.overflowY = this._prevHtmlOverflow || '';
    document.documentElement.style.scrollbarWidth = '';
    this._unmounted = true;
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
    if (this._unmounted) return;
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

      this._currentOrgId = orgId;

      // Phase 4.2.3: page bundle composes cooked atoms (parquet + DuckDB) into a single first-paint payload.
      // TimeWarp date passes through via X-Effective-Date header in api.js.
      const response = await api.getPageBundle(orgId, 'dashboard', {}, { skipCache: true });

      if (this._unmounted) return;

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dashboard');
      }

      console.debug('[UnifiedDashboard] bundle freshness=%s missing=%o live=%o elapsedMs=%d',
        response.data?.freshness, response.data?.missingAtoms, response.data?.livePresent, response.data?.elapsedMs);

      let normalizedData = response.data ? bundleToUnifiedPayload(response.data) : null;
      if (normalizedData) {
        normalizedData = await this.overlayAlertSummaryCounts(orgId, normalizedData);
        normalizedData = await this.attachPatchStatus(orgId, normalizedData);
        normalizedData = await this.normalizeDashboardStats(orgId, normalizedData);
        this.loadAddOnSignals(orgId);
      }

      this.setState(prevState => ({
        data: normalizedData,
        loading: false,
        refreshing: false,
        isRefreshingInBackground: false,
        // Keep drawer collapsed by default; user can open intentionally.
        personaSheetOpen: false,
        dossierOpen: false,
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

  readSummaryInt(obj, key) {
    if (!obj || typeof obj !== 'object') return 0;
    const direct = obj[key] ?? obj[key?.toLowerCase?.()] ?? obj[key?.toUpperCase?.()];
    if (direct !== undefined && direct !== null && Number.isFinite(Number(direct))) return Number(direct);

    const foundKey = Object.keys(obj).find(k => String(k).toLowerCase() === String(key).toLowerCase());
    const found = foundKey ? obj[foundKey] : undefined;
    return Number.isFinite(Number(found)) ? Number(found) : 0;
  }

  applyAlertSummaryCounts(data, summary) {
    if (!data || !summary) return data;

    const bySeverityByDomain = summary.bySeverityByDomain || {};
    const vulnerabilityDomainKey = Object.keys(bySeverityByDomain)
      .find(key => String(key).toLowerCase() === 'vulnerability');
    if (!vulnerabilityDomainKey) return data;

    const vulnSeverity = bySeverityByDomain[vulnerabilityDomainKey] || {};
    const byDomain = summary.byDomain || {};
    const critical = this.readSummaryInt(vulnSeverity, 'Critical');
    const high = this.readSummaryInt(vulnSeverity, 'High');
    const medium = this.readSummaryInt(vulnSeverity, 'Medium');
    const low = this.readSummaryInt(vulnSeverity, 'Low');
    const severityTotal = critical + high + medium + low;
    const domainTotal = this.readSummaryInt(byDomain, vulnerabilityDomainKey);
    const total = domainTotal > 0 ? domainTotal : (severityTotal > 0 ? severityTotal : Number(summary.totalOpen || 0));

    if (total <= 0 && severityTotal <= 0) return data;

    const existingThreatIntel = data.securityPro?.threatIntel || {};
    const alertSummaryMeta = {
      source: 'alerts-summary',
      snapshotDate: summary.snapshotDate || null,
      isHistoricalSnapshot: summary.isHistoricalSnapshot === true,
      isCapped: summary.isCapped === true,
      capturedOpen: Number(summary.capturedOpen ?? 0),
      totalOpen: Number(summary.totalOpen ?? total)
    };

    return {
      ...data,
      quickStats: {
        ...(data.quickStats || {}),
        cves: {
          ...((data.quickStats && data.quickStats.cves) || {}),
          totalCount: total,
          criticalCount: critical,
          highCount: high,
          mediumCount: medium,
          lowCount: low,
          alertSummaryMeta
        }
      },
      securityPro: {
        ...(data.securityPro || {}),
        threatIntel: {
          ...existingThreatIntel,
          criticalCveCount: critical,
          highCveCount: high,
          mediumCveCount: medium,
          lowCveCount: low,
          totalCveCount: total,
          alertSummaryMeta
        }
      },
      _alertSummary: alertSummaryMeta
    };
  }

  async overlayAlertSummaryCounts(orgId, data) {
    try {
      const response = await api.getAlertSummary(orgId, { include: 'cached-summary' });
      if (response && response.success === false) return data;
      return this.applyAlertSummaryCounts(data, response?.data || response);
    } catch (err) {
      console.warn('[UnifiedDashboard] AlertSummary overlay skipped:', err);
      return data;
    }
  }

  async attachPatchStatus(orgId, data) {
    try {
      const response = await api.getPatchPosture(orgId, { skipCache: true });
      if (response && response.success === false) return data;
      return {
        ...data,
        _patchPosture: response?.data || response || null
      };
    } catch (err) {
      console.warn('[UnifiedDashboard] Patch Status overlay skipped:', err);
      return {
        ...data,
        _patchPosture: {
          unavailable: true,
          message: err?.message || 'Patch Status unavailable'
        }
      };
    }
  }

  getPatchStatusSummary(data = this.state.data) {
    const patch = data?._patchPosture || {};
    const summary = patch.summary || {};
    const intel = patch.intel || {};
    const hosts = Array.isArray(patch.hosts) ? patch.hosts : [];

    return {
      unavailable: patch.unavailable === true,
      message: patch.message || '',
      openAlerts: Number(summary.openAlerts ?? 0),
      hostsAffected: Number(summary.hostsAffected ?? hosts.length ?? 0),
      critical: Number(summary.critical ?? 0),
      high: Number(summary.high ?? 0),
      exploited: Number(summary.exploited ?? 0),
      distinctKbs: Number(summary.distinctKbs ?? intel.topKbs?.length ?? 0),
      productCount: Number(intel.productCount ?? 0),
      leafPatchCount: Number(intel.leafPatchCount ?? 0),
      builtAt: intel.builtAt || intel.lastBuiltAt || intel.generatedAt || null
    };
  }

  async loadAddOnSignals(orgId) {
    const canBenchmark = orgContext.hasAddOnForOrg?.('PeerBenchmark') ?? false;
    const canCoach     = orgContext.hasAddOnForOrg?.('HygieneCoach') ?? false;

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
        ? api.getPageBundle(orgId, 'add-on/peer-benchmark')
            .then((resp) => {
              const atom = resp?.data?.atoms?.['addon-peer-benchmark'];
              const row = Array.isArray(atom?.data) && atom.data.length > 0 ? atom.data[0] : null;
              return row && row.ready !== false ? row : null;
            })
            .catch(() => null)
        : Promise.resolve(null),
      canCoach
        ? api.getPageBundle(orgId, 'add-on/hygiene-coach')
            .then((resp) => {
              const atom = resp?.data?.atoms?.['addon-hygiene'];
              return Array.isArray(atom?.data) && atom.data.length > 0 ? atom.data[0] : null;
            })
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
    const peer  = addOnSignals?.peerBenchmark;
    const coach = addOnSignals?.hygieneCoach;

    if (!peer && !coach && !addOnSignals?.loading) {
      return null;
    }

    const cardStyle = 'width:100%;display:flex;flex-direction:column;background:var(--tblr-bg-surface);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:1px solid var(--tblr-border-color);border-radius:16px;padding:12px 13px;box-shadow:0 8px 24px rgba(15,23,42,0.07);overflow:hidden;';
    const eyebrowStyle = 'font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;';
    const titleStyle = 'font-size:0.92rem;font-weight:700;color:var(--tblr-body-color);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
    const bodyStyle = 'color:var(--tblr-secondary);font-size:0.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
    const ribbonStyle = (background, color) => `display:inline-flex; align-items:center; justify-content:center; max-width:100%; min-height:26px; padding:5px 12px 6px; border-radius:999px 0 0 999px; background:${background}; color:${color}; font-size:0.72rem; font-weight:800; line-height:1.1; white-space:normal; text-align:center; box-shadow:0 6px 16px rgba(15,23,42,0.12); margin:-12px -13px 0 0;`;

    return html`
      <div class="d-flex flex-column gap-2 h-100">
        ${peer || addOnSignals?.loading ? html`
          <div style=${cardStyle}>
                <div>
                <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                  <div>
                    <div style=${`${eyebrowStyle}color:#6366f1;`}>Peer Benchmark</div>
                    <div style=${titleStyle}>${peer ? `Ahead of ${peer.allOrgsPercentile ?? 0}% of peers` : 'Loading benchmark signal...'}</div>
                  </div>
                  <div style="flex:0 0 auto; display:flex; justify-content:flex-end; align-items:flex-start; max-width:120px;">
                    <span style=${ribbonStyle('linear-gradient(135deg, #2563eb, #4f46e5)', '#ffffff')}>${peer ? `${peer.orgScore ?? 0} score` : '...'}</span>
                  </div>
                </div>
                <div style=${bodyStyle}>
                  ${peer
                    ? (peer.hasIndustryCohort
                        ? `${peer.industryBucket}: ${peer.industryPercentile ?? 0}th · Global median ${peer.allOrgsMedianScore ?? 0} · ${peer.globalCohortSize ?? 0} organizations.`
                        : `Global median ${peer.allOrgsMedianScore ?? 0} · ${peer.globalCohortSize ?? 0} organizations.`)
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

  buildMagiActionContext(data = this.state.data) {
    const items = this.getTopActionViewItems(data).filter(item => item.kind === 'action').slice(0, 3);
    if (items.length === 0) return null;

    return items.map((item) => {
      const deviceNames = item.deviceNames.length > 0 ? item.deviceNames.join(', ') : 'not identified in current data';
      const support = item.supportText ? `; detail=${item.supportText}` : '';
      return `${item.index}. ${item.title}; urgency=${item.badge}; devices=${deviceNames}; ${item.deviceText}${support}`;
    }).join('\n');
  }

  groundAiActionAnswer(answer, data = this.state.data) {
    if (!answer) return answer;

    const items = this.getTopActionViewItems(data)
      .filter(item => item.kind === 'action' && item.deviceNames.length > 0)
      .slice(0, 3);
    if (items.length === 0) return answer;

    let replacementIndex = 0;
    return String(answer).replace(/Affected device:\s*(?:1|one) device\b/gi, (match) => {
      const item = items[Math.min(replacementIndex, items.length - 1)];
      replacementIndex += 1;
      return match.replace(/(?:1|one) device\b/i, item.deviceNames[0]);
    });
  }

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
      const actionContext = this.buildMagiActionContext();
      const question = actionContext
        ? `${prompt}\n\nDashboard Recommended Next Steps. Use these exact targets when recommending immediate actions; do not summarize a named device as "1 device".\n${actionContext}\n\nAnswer requirement: every recommended action must include the exact device name to act on. If multiple devices are present, name the first device and state how many others remain.`
        : prompt;
      const asOfDate = rewindContext.isActive?.() ? rewindContext.getDate?.() : undefined;

      const response = await api.askAIAnalyst(orgId, {
        question,
        includeContext: true,
        context: {
          hint: actionContext
            ? `dashboard-immediate-actions; exact device targets: ${actionContext.replace(/\s+/g, ' ').slice(0, 1200)}`
            : 'dashboard-immediate-actions',
          route: '#!/dashboard',
          source: 'dashboard-magi-command'
        },
        persona: 'business_owner',
        ...(asOfDate ? { asOfDate } : {})
      });
      const data = response?.data;
      const answer = data?.answer || response?.answer || data?.response || response?.response || null;
      if (!answer) throw new Error('No answer in response');
      this.setState({
        aiAnswer: {
          question: prompt,
          answer: this.groundAiActionAnswer(answer),
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

  getScoreTone(score) {
    const numericScore = Number(score || 0);
    if (numericScore >= 85) return '#16a34a';
    if (numericScore >= 70) return '#2563eb';
    if (numericScore >= 50) return '#d97706';
    return '#dc2626';
  }

  getReadableScoreTone(score) {
    const numericScore = Number(score || 0);
    if (numericScore >= 85) return 'var(--db-tone-success,#15803d)';
    if (numericScore >= 70) return 'var(--db-tone-info,#1d4ed8)';
    if (numericScore >= 50) return 'var(--db-tone-warning,#b45309)';
    return 'var(--db-tone-danger,#dc2626)';
  }

  getUrgencyTone(urgency) {
    const value = String(urgency || '').toLowerCase();
    if (value === 'critical' || value === 'urgent' || value === 'immediate') return '#dc2626';
    if (value === 'high' || value === 'important') return '#d97706';
    if (value === 'medium' || value === 'watch') return '#2563eb';
    return '#64748b';
  }

  getReadableUrgencyTone(urgency) {
    const value = String(urgency || '').toLowerCase();
    if (value === 'critical' || value === 'urgent' || value === 'immediate') return 'var(--db-tone-danger,#dc2626)';
    if (value === 'high' || value === 'important') return 'var(--db-tone-warning,#b45309)';
    if (value === 'medium' || value === 'watch') return 'var(--db-tone-info,#1d4ed8)';
    return 'var(--db-tone-neutral,#475569)';
  }

  getTranslucentSurface(tone, alpha = '08') {
    return `linear-gradient(135deg, ${tone}${alpha} 0%, var(--db-glass-bg, rgba(255,255,255,0.76)) 52%, var(--db-glass-bg, rgba(255,255,255,0.76)) 100%)`;
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

  getProofReadinessData(data = this.state.data) {
    const hs = this.getHealthScoreData(data);
    const patch = this.getPatchStatusSummary(data);
    const coverage = data?.quickStats?.coverage || data?.itAdmin?.coverage || {};
    const cves = data?.quickStats?.cves || data?.securityPro?.threatIntel || {};
    const compliance = data?.businessOwner?.complianceCard || data?.complianceSummary || {};

    const critical = Number(cves.criticalCount ?? cves.critical ?? cves.uniqueCriticalCveCount ?? 0);
    const high = Number(cves.highCount ?? cves.high ?? cves.uniqueHighCveCount ?? 0);
    const dormant = Number(coverage.dormant || 0);
    const ghost = Number(coverage.ghost || coverage.ghosted || 0);
    const errors = Number(coverage.error || 0);
    const deviceBlockers = Math.max(0, dormant + ghost + errors);
    const gapCount = Number(compliance.gapCount || compliance.gaps || 0);
    const blockers = [];

    if (patch.openAlerts > 0) {
      blockers.push({
        label: 'Patch posture',
        value: patch.openAlerts,
        detail: `${patch.hostsAffected} affected device${patch.hostsAffected === 1 ? '' : 's'} · ${patch.critical} critical · ${patch.high} high`,
        href: '#!/patch-posture',
        tone: '#d97706',
        readableTone: 'var(--db-tone-warning,#b45309)'
      });
    }

    if (critical + high > 0) {
      blockers.push({
        label: 'Vulnerability exposure',
        value: critical + high,
        detail: `${critical} critical · ${high} high CVE${critical + high === 1 ? '' : 's'} need remediation evidence`,
        href: '#!/vulnerabilities',
        tone: '#dc2626',
        readableTone: 'var(--db-tone-danger,#dc2626)'
      });
    }

    if (deviceBlockers > 0) {
      const parts = [];
      if (ghost > 0) parts.push(`${ghost} ghosted`);
      if (dormant > 0) parts.push(`${dormant} dormant`);
      if (errors > 0) parts.push(`${errors} error`);
      blockers.push({
        label: 'Inventory coverage',
        value: deviceBlockers,
        detail: `${parts.join(' · ')} device${deviceBlockers === 1 ? '' : 's'} reduce readiness confidence`,
        href: '#!/devices',
        tone: '#2563eb',
        readableTone: 'var(--db-tone-info,#1d4ed8)'
      });
    }

    if (gapCount > 0) {
      blockers.push({
        label: 'Compliance evidence',
        value: gapCount,
        detail: `${gapCount} control gap${gapCount === 1 ? '' : 's'} need evidence or remediation`,
        href: '#!/compliance',
        tone: '#7c3aed',
        readableTone: 'var(--db-tone-purple,#7c3aed)'
      });
    }

    if ((hs.response?.score ?? 100) <= 50) {
      blockers.push({
        label: 'Response hygiene',
        value: 'Trend',
        detail: hs.response?.shortReason || 'Remediation trend evidence is not strong enough yet',
        href: '#!/alerts',
        tone: '#0f766e',
        readableTone: 'var(--db-tone-teal,#0f766e)'
      });
    }

    const tier = hs.insuranceTier || 'At Risk';
    const label = tier === 'Insurance Ready' ? 'Ready' : tier === 'Conditional' ? 'Conditional' : 'At Risk';
    const tone = label === 'Ready' ? '#16a34a' : label === 'Conditional' ? '#d97706' : '#d97706';
    const readableTone = label === 'Ready' ? 'var(--db-tone-success,#15803d)' : label === 'Conditional' ? 'var(--db-tone-warning,#b45309)' : 'var(--db-tone-warning,#b45309)';
    const summary = blockers.length > 0
      ? `${blockers.length} proof gap${blockers.length === 1 ? '' : 's'} must improve before this evidence package is ready for review.`
      : 'This evidence package is review-ready. Keep patch, response, and compliance evidence current.';

    return { hs, label, tier, tone, readableTone, summary, blockers };
  }

  getActionDeviceNames(action) {
    if (!action) return [];
    const names = [];
    const push = (value) => {
      const text = String(value || '').trim();
      if (text && !names.some(existing => existing.toLowerCase() === text.toLowerCase())) names.push(text);
    };

    (Array.isArray(action.affectedDeviceNames) ? action.affectedDeviceNames : []).forEach(push);
    (Array.isArray(action.deviceNames) ? action.deviceNames : []).forEach(push);
    push(action.primaryDeviceName);
    push(action.deviceName);

    if (!names.length) {
      (Array.isArray(action.affectedDevices) ? action.affectedDevices : []).forEach((device) => {
        if (typeof device === 'string') push(device);
        else push(device?.deviceName || device?.DeviceName || device?.deviceId || device?.DeviceId);
      });
      push(action.primaryDeviceId);
      push(action.deviceId);
    }

    return names;
  }

  formatActionDeviceText(action) {
    if (!action) return 'Device: not identified yet';

    const names = this.getActionDeviceNames(action);

    const count = Math.max(Number(action.deviceCount || 0), names.length);
    if (names.length) {
      return count > 1 ? `Device: ${names[0]} + ${count - 1} more` : `Device: ${names[0]}`;
    }
    if (count > 0) return `Device: ${count} unnamed device${count === 1 ? '' : 's'}`;
    return 'Device: not identified yet';
  }

  getTopActionViewItems(data = this.state.data) {
    if (!data) return [];

    const actions = Array.isArray(data?.businessOwner?.topActions)
      ? data.businessOwner.topActions.filter(Boolean).slice(0, 3)
      : [];
    const proof = this.getProofReadinessData(data);

    if (actions.length > 0) {
      return actions.map((action, index) => {
        const deviceNames = this.getActionDeviceNames(action);
        return {
          kind: 'action',
          index: index + 1,
          key: `action-${index}`,
          href: action.href || action.url || action.drillDownUrl || action.route || '#!/security',
          tone: this.getUrgencyTone(action.urgency),
          readableTone: this.getReadableUrgencyTone(action.urgency),
          badge: String(action.urgency || 'action').toUpperCase(),
          title: this.cleanActionTitle(action.title || action.name || `Action ${index + 1}`),
          deviceText: this.formatActionDeviceText(action),
          deviceNames,
          supportText: action.deadlineText || action.description || action.reason || '',
          icon: 'ti-bolt'
        };
      });
    }

    return proof.blockers.slice(0, 3).map((blocker, index) => ({
      kind: 'blocker',
      index: index + 1,
      key: `blocker-${index}`,
      href: blocker.href || '#!/security',
      tone: blocker.tone || proof.tone,
      readableTone: blocker.readableTone || proof.readableTone,
      badge: 'REVIEW',
      title: blocker.label,
      deviceText: 'Scope: organization readiness',
      deviceNames: [],
      supportText: blocker.detail,
      icon: 'ti-alert-triangle'
    }));
  }

  cleanActionTitle(title) {
    return String(title || '')
      .replace(/\s+on\s+\d+\s+devices?\.?$/i, '')
      .replace(/Remediate compliance gap:\s*/i, 'Fix compliance: ')
      .replace(/LowComplianceScore/g, 'Low compliance score')
      .replace(/NonCompliantDevice/g, 'Non-compliant devices')
      .replace(/MissingEncryption/g, 'Missing encryption')
      .replace(/StaleUpdates/g, 'Stale updates')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\bIn Design\b/g, 'InDesign')
      .replace(/\bIn Copy\b/g, 'InCopy')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }

  getPrioritySoftwareUpdateCount(data = this.state.data) {
    const actions = Array.isArray(data?.businessOwner?.topActions) ? data.businessOwner.topActions : [];
    const updateNames = new Set();

    actions.forEach((action) => {
      const title = this.cleanActionTitle(action?.title || action?.name || '');
      if (!/^update\s+/i.test(title)) return;
      updateNames.add(title.toLowerCase());
    });

    return updateNames.size;
  }

  getDeviceCoverageDetail(data = this.state.data) {
    const coverage = data?.quickStats?.coverage || data?.itAdmin?.coverage || {};
    const fleet = this.getFleetStats(data) || {};
    const total = Number(coverage.total || fleet.total || 0);
    const ghost = Number(coverage.ghost || coverage.ghosted || 0);
    const dormant = Number(coverage.dormant || 0);
    const error = Number(coverage.error || 0);
    const stale = Number(coverage.stale || 0);
    const online = Number(coverage.online || fleet.online || 0);

    const blockers = [];
    if (ghost > 0) blockers.push(`${ghost} ghosted`);
    if (dormant > 0 || ghost > 0) blockers.push(`${dormant} dormant`);
    if (error > 0) blockers.push(`${error} error`);

    if (blockers.length > 0) {
      const staleText = stale > 0 ? `; ${stale} stale monitored` : '';
      return `${blockers.join(' · ')} of ${total} devices${staleText}`;
    }

    if (stale > 0) return `${stale} stale monitored · ${online} current of ${total} devices`;
    return `${online} current of ${total} devices`;
  }

  getSoftwareDossierDetail(data = this.state.data, hs = null, patch = null) {
    const apps = data?.quickStats?.apps || {};
    const cves = data?.quickStats?.cves || data?.securityPro?.threatIntel || {};
    const trackedApps = Number(apps.trackedCount || data?.itAdmin?.inventory?.totalApps || 0);
    const vulnerableApps = Number(apps.vulnerableCount || 0);
    const critical = Number(cves.criticalCount ?? cves.critical ?? cves.uniqueCriticalCveCount ?? 0);
    const high = Number(cves.highCount ?? cves.high ?? cves.uniqueHighCveCount ?? 0);
    const priorityUpdates = this.getPrioritySoftwareUpdateCount(data);
    const patchStatus = patch || this.getPatchStatusSummary(data);

    if (vulnerableApps > 0 && trackedApps > 0) {
      return `${vulnerableApps} vulnerable of ${trackedApps} tracked apps`;
    }
    if (priorityUpdates > 0 && trackedApps > 0) {
      return `${priorityUpdates} priority app update${priorityUpdates === 1 ? '' : 's'} · ${trackedApps} tracked apps`;
    }
    if (!patchStatus.unavailable && patchStatus.openAlerts > 0 && trackedApps > 0) {
      return `${trackedApps} tracked apps · ${patchStatus.openAlerts} missing updates in Patch`;
    }
    if (critical + high > 0 && trackedApps > 0) {
      return `${trackedApps} tracked apps · ${critical + high} high-risk CVEs in Vulnerabilities`;
    }
    if (trackedApps > 0) return `${trackedApps} tracked apps · no app-level CVE exposure`;
    return hs?.software?.shortReason || 'Software inventory score';
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

  getHealthScoreData(data) {
    const hs = data?.healthScore;
    if (hs && typeof hs.score === 'number') return hs;

    // Fallback: derive from legacy fields when backend hasn't computed healthScore yet
    const threats = data?.securityPro?.threatIntel || {};
    // Prefer unique CVE counts where backend provides them so the hygiene score is
    // not skewed by exposure multiplication (e.g. 1 Chrome CVE on 50 devices = 50 exposures).
    const crit = threats.uniqueCriticalCveCount ?? threats.criticalCveCount ?? 0;
    const high = threats.uniqueHighCveCount ?? threats.highCveCount ?? 0;
    const medium = threats.mediumCveCount || 0;
    const comp = data?.businessOwner?.complianceCard || {};
    const remediation = data?.aiTrends?.patchLatency || {};
    const mttr = remediation.averageLatencyDays || 0;
    const apps = data?.quickStats?.apps || {};
    const tracked = apps.trackedCount || 0;
    const vuln = apps.vulnerableCount || 0;
    const prioritySoftwareUpdates = this.getPrioritySoftwareUpdateCount(data);

    // Use coverage data (visibility-based: Recent < 24h) instead of real-time online status.
    // Offline devices (powered off but heartbeat < 24h) should NOT penalize.
    // Stale (1-3d) = still considered "healthy" (short absence, don't penalize).
    // Only Dormant (3-7d) and Ghost (7d+) penalize the score.
    const coverage = data?.quickStats?.coverage || data?.itAdmin?.coverage || {};
    const covTotal = Number(coverage.total) || 0;
    const covHealthy = Number(coverage.healthy) || 0;
    const covStale = Number(coverage.stale) || 0;
    const covDormant = Number(coverage.dormant) || 0;
    const covGhost = Number(coverage.ghost) || 0;
    const covError = Number(coverage.error) || 0;
    const covOffline = Number(coverage.offline) || 0; // = dormant + ghost
    const fleet = this.getFleetStats(data);
    const total = covTotal > 0 ? covTotal : fleet.total;
    const actionableDevices = covTotal > 0 ? Math.max(0, covDormant + covGhost + covError) : fleet.offline;
    const healthy = covTotal > 0 ? Math.max(0, total - actionableDevices) : fleet.active;

    const deviceScore = total > 0 ? Math.round((healthy / total) * 100) : 50;
    let softwareScore = tracked > 0 ? Math.round(((tracked - vuln) / tracked) * 100) : 50;
    if (vuln <= 0 && prioritySoftwareUpdates > 0) {
      softwareScore = Math.min(softwareScore, prioritySoftwareUpdates >= 3 ? 60 : 75);
    } else if (vuln <= 0 && crit + high > 0) {
      softwareScore = Math.min(softwareScore, 80);
    }
    const vulnScore = Math.max(0, 100 - (crit * 20) - (high * 10) - (medium * 5));
    const responseScore = mttr <= 0 ? 50 : mttr <= 7 ? 100 : mttr >= 90 ? 0 : Math.round(100 - ((mttr - 7) * 100 / 83));
    const complianceScore = Number(comp.percent) || 0;

    let composite = Math.round(
      0.25 * deviceScore + 0.15 * softwareScore + 0.25 * vulnScore + 0.20 * responseScore + 0.15 * complianceScore
    );
    const hasCriticalPenalty = crit > 0 || mttr >= 90;
    if (hasCriticalPenalty) composite = Math.round(composite * 0.7);
    composite = Math.max(0, Math.min(100, composite));

    const grade = composite >= 90 ? 'A' : composite >= 80 ? 'B' : composite >= 70 ? 'C' : composite >= 60 ? 'D' : 'F';
    const unhealthy = Math.max(0, total - healthy);

    // Build device reason using dormant/ghost terminology (stale no longer penalizes)
    const deviceReason = (() => {
      if (unhealthy === 0 && covStale === 0) return 'All devices reporting normally';
      const parts = [];
      if (covError > 0) parts.push(`${covError} error`);
      if (covGhost > 0) parts.push(`${covGhost} ghosted`);
      if (covDormant > 0) parts.push(`${covDormant} dormant`);
      if (parts.length > 0) {
        const staleText = covStale > 0 ? `; ${covStale} stale device${covStale !== 1 ? 's' : ''} need monitoring` : '';
        return `${parts.join(', ')} device${unhealthy !== 1 ? 's' : ''} need attention${staleText}`;
      }
      if (covStale > 0) return `${covStale} stale device${covStale !== 1 ? 's' : ''} need monitoring`;
      return `${unhealthy} device${unhealthy !== 1 ? 's' : ''} need attention`;
    })();

    // Find weakest for narration
    const pillars = [
      { name: 'Device Security', s: deviceScore, reason: deviceReason },
      { name: 'Software', s: softwareScore, reason: this.getSoftwareDossierDetail(data) },
      { name: 'Vulnerability', s: vulnScore, reason: crit > 0 || high > 0 ? `${[crit > 0 ? `${crit} critical` : '', high > 0 ? `${high} high` : ''].filter(Boolean).join(' · ')} CVE${crit + high !== 1 ? 's' : ''} need patching` : 'No critical or high CVEs' },
      { name: 'Response', s: responseScore, reason: mttr <= 0 ? 'No remediation data yet' : mttr <= 7 ? 'Fixes applied within 7 days' : `Average fix time is ${Math.round(mttr)} days` },
      { name: 'Compliance', s: complianceScore, reason: (comp.gapCount || 0) > 0 ? `${comp.gapCount} compliance gap${comp.gapCount !== 1 ? 's' : ''} need attention` : 'All compliance controls met' }
    ];
    const weakest = pillars.reduce((a, b) => a.s <= b.s ? a : b);
    const narration = weakest.s >= 80 ? 'Your security posture looks good across all areas' : weakest.reason;

    return {
      score: composite,
      grade,
      insuranceTier: grade === 'A' || grade === 'B' ? 'Insurance Ready' : grade === 'C' ? 'Conditional' : 'At Risk',
      hasCriticalPenalty,
      narration,
      narrationImpact: '',
      device:        { score: deviceScore,     label: 'Device Security',  shortReason: pillars[0].reason, drillDownUrl: '#!/devices' },
      software:      { score: softwareScore,   label: 'Software',         shortReason: pillars[1].reason, drillDownUrl: '#!/apps' },
      vulnerability: { score: vulnScore,       label: 'Vulnerabilities',  shortReason: pillars[2].reason, drillDownUrl: '#!/vulnerabilities' },
      response:      { score: responseScore,   label: 'Response',         shortReason: pillars[3].reason, drillDownUrl: '#!/alerts' },
      compliance:    { score: complianceScore,  label: 'Compliance',       shortReason: pillars[4].reason, drillDownUrl: this.isPersonalOrg() ? '#!/auditor' : '#!/compliance' }
    };
  }

  /** @deprecated Backward-compat shim for legacy drill-down views */
  getCyberHygieneData(data) {
    if (!data) return null;
    const hs = this.getHealthScoreData(data);
    return {
      score: hs.score, grade: hs.grade, insuranceTier: hs.insuranceTier,
      security: hs.device?.score || 0, compliance: hs.compliance?.score || 0,
      audit: hs.response?.score || 0, riskPosture: hs.vulnerability?.score || 0,
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

  renderTopActionItems({ stacked = false, embedded = false } = {}) {
    const { data } = this.state;
    if (!data) return null;

    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const items = this.getTopActionViewItems(data);

    if (items.length === 0) {
      return html`
        <div style="margin-top:10px;background:var(--db-glass-bg,rgba(255,255,255,0.78));border:1px solid rgba(22,163,74,0.22);border-radius:999px;padding:9px 12px;color:var(--db-answer-text,#111827);font-size:0.8rem;font-weight:700;text-align:center;box-shadow:0 1px 4px rgba(15,23,42,0.04);">
          No urgent recommendations. Keep evidence current and watch for new patch or vulnerability alerts.
        </div>
      `;
    }

    return html`
      <section aria-label="Recommended fixes" style="margin-top:${embedded ? '12px' : stacked ? '0' : '9px'};text-align:left;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:${embedded ? '0 4px 6px' : '0 8px 6px'};">
          <div title="These fixes close the most important evidence gaps. Open Security or click a row to start." style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:850;color:var(--db-muted-text,#6b7280);">Recommended Fixes</div>
          <a href="#!/security" title="Open Security to patch, investigate devices, and close the listed gaps." style="font-size:0.72rem;font-weight:800;color:var(--db-tone-primary,#4f46e5);text-decoration:none;white-space:nowrap;">Open Security</a>
        </div>
        <div role="list" style="display:grid;grid-template-columns:${stacked || isSmallScreen ? '1fr' : 'repeat(3,minmax(220px,1fr))'};gap:0;background:var(--db-glass-bg,rgba(255,255,255,0.78));border:1px solid var(--db-tile-border,rgba(148,163,184,0.18));border-radius:${stacked || isSmallScreen ? '18px' : '999px'};box-shadow:0 4px 14px rgba(15,23,42,0.045);overflow:hidden;">
          ${items.map((item, index) => {
            const meta = this.getBusinessOnlyMeta(item.href);
            const isDisabled = Boolean(meta.className);
            const detail = item.supportText ? `${item.deviceText} · ${item.supportText}` : item.deviceText;
            const urgency = item.badge && item.badge !== 'ACTION' ? `${item.badge}: ` : '';
            const isLast = index === items.length - 1;
            return html`
              <a
                role="listitem"
                key=${item.key}
                href=${item.href}
                class=${meta.className}
                title=${meta.title || `${urgency}${item.title} - ${detail}`}
                aria-label=${`${urgency}${item.title}. ${detail}`}
                data-business-tooltip=${meta.dataTooltip}
                onClick=${(event) => {
                  if (isDisabled) {
                    event.preventDefault();
                    window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                  }
                }}
                style="text-decoration:none;color:var(--db-answer-text,#111827);display:grid;grid-template-columns:${isSmallScreen ? '30px minmax(0,1fr)' : '32px minmax(0,1fr) auto'};align-items:center;gap:10px;min-height:68px;padding:${isSmallScreen ? '8px 12px' : '8px 12px 8px 9px'};background:transparent;border:0;border-bottom:${isLast ? '0' : '1px solid var(--db-tile-border,rgba(148,163,184,0.18))'};border-radius:0;box-shadow:none;overflow:hidden;text-align:left;"
              >
                <span aria-hidden="true" style="width:28px;height:28px;border-radius:999px;background:${item.tone}16;color:${item.readableTone || item.tone};display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:900;justify-self:center;">${item.index}</span>
                <span style="min-width:0;display:block;">
                  <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:0.8rem;font-weight:850;line-height:1.16;overflow:hidden;">${item.title}</span>
                  <span style="display:block;font-size:0.68rem;color:var(--db-faint-text,#6b7280);line-height:1.24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;">${detail}</span>
                </span>
                <span style="grid-column:${isSmallScreen ? '2' : 'auto'};justify-self:${isSmallScreen ? 'start' : 'end'};display:inline-flex;align-items:center;gap:4px;border-radius:999px;border:1px solid ${item.tone}24;background:${item.tone}10;color:${item.readableTone || item.tone};font-size:0.62rem;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;line-height:1;padding:5px 8px;white-space:nowrap;">
                  <span aria-hidden="true" style="width:4px;height:4px;border-radius:999px;background:${item.readableTone || item.tone};display:inline-block;"></span>
                  ${item.badge}
                </span>
              </a>
            `;
          })}
        </div>
      </section>
    `;
  }

  renderTopActionDropdown({ embedded = false } = {}) {
    const { data } = this.state;
    if (!data) return null;

    const proof = this.getProofReadinessData(data);
    const itemCount = this.getTopActionViewItems(data).length;
    const containerStyle = embedded
      ? 'margin:12px 0 0;padding:0;'
      : 'max-width:720px;margin:8px auto 18px;padding:0 16px;';

    return html`
      <section aria-label="Close proof gaps" style=${containerStyle}>
        <details title="The highest-value fixes for improving insurance readiness. Expand, then open Security or a row to act." style="background:var(--db-glass-bg,rgba(255,255,255,0.74));border:1px solid rgba(99,102,241,0.14);border-radius:12px;box-shadow:0 4px 14px rgba(15,23,42,0.04);overflow:hidden;">
          <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;color:var(--db-answer-text,#111827);">
            <span style="display:flex;align-items:center;gap:10px;min-width:0;">
              <span style="width:30px;height:30px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:${proof.tone}18;color:${proof.readableTone};flex-shrink:0;"><i class="ti ti-list-check"></i></span>
              <span style="min-width:0;">
                <span style="display:block;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:var(--db-muted-text,#6b7280);">Close the Proof Gaps</span>
                <span style="display:block;font-size:0.84rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${itemCount} fix${itemCount === 1 ? '' : 'es'} that improve the chain</span>
              </span>
            </span>
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:800;color:${proof.readableTone};white-space:nowrap;">
              Review <i class="ti ti-chevron-down"></i>
            </span>
          </summary>
          <div style="padding:0 12px 12px;">
            ${this.renderTopActionItems({ stacked: true, embedded: true })}
          </div>
        </details>
      </section>
    `;
  }

  readNumber(source, keys, fallback = null) {
    if (!source || typeof source !== 'object') return fallback;
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
    }

    const lowerKeyMap = new Map(Object.keys(source).map((key) => [key.toLowerCase(), key]));
    for (const key of keys) {
      const actualKey = lowerKeyMap.get(String(key).toLowerCase());
      const value = actualKey ? source[actualKey] : null;
      if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
    }

    return fallback;
  }

  clampScore(value, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  parseDashboardTrendDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (/^\d{8}$/.test(text)) {
      const parsed = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    const parsed = new Date(text);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  formatDashboardTrendDate(value) {
    const parsed = this.parseDashboardTrendDate(value);
    if (!parsed) return null;
    return parsed.toISOString().slice(0, 10);
  }

  formatDashboardTrendLabel(value) {
    const parsed = this.parseDashboardTrendDate(value);
    if (!parsed) return '';
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  getDashboardTrendPoints(data = this.state.data) {
    if (!data) return [];

    const byDate = new Map();
    const rawPoints = Array.isArray(data.snapshots) ? data.snapshots : [];
    const hs = this.getHealthScoreData(data);
    const currentScores = {
      hygieneScore: this.clampScore(hs.score),
      securityScore: this.clampScore(hs.vulnerability?.score ?? hs.score),
      complianceScore: this.clampScore(hs.compliance?.score ?? 0),
      deviceScore: this.clampScore(hs.device?.score ?? hs.score),
      responseScore: this.clampScore(hs.response?.score ?? 0)
    };

    const nullableScore = (value, currentValue) => {
      if (!Number.isFinite(Number(value))) return null;
      const numeric = Number(value);
      if (numeric <= 0 && Number(currentValue) > 0) return null;
      return this.clampScore(numeric);
    };

    rawPoints.forEach((point) => {
      const source = point?.snapshot || point?.Snapshot || point || {};
      const date = this.formatDashboardTrendDate(point?.date || point?.Date || source.date || source.Date);
      if (!date) return;

      const securityScore = this.readNumber(source, ['securityScore', 'SecurityScore', 'riskScore', 'RiskScore'], null);
      const complianceScore = this.readNumber(source, ['complianceScore', 'ComplianceScore'], null);
      const deviceScore = this.readNumber(source, ['deviceScore', 'DeviceScore', 'coverageScore', 'CoverageScore'], null);
      const responseScore = this.readNumber(source, ['responseScore', 'ResponseScore'], null);
      const explicitHygieneScore = this.readNumber(source, ['hygieneScore', 'HygieneScore', 'healthScore', 'HealthScore', 'score', 'Score'], null);
      const hygieneScore = Number.isFinite(Number(explicitHygieneScore)) && Number(explicitHygieneScore) > 0
        ? explicitHygieneScore
        : securityScore;

      byDate.set(date, {
        date,
        hygieneScore: nullableScore(hygieneScore, currentScores.hygieneScore),
        securityScore: nullableScore(securityScore, currentScores.securityScore),
        complianceScore: nullableScore(complianceScore, currentScores.complianceScore),
        deviceScore: nullableScore(deviceScore, currentScores.deviceScore),
        responseScore: nullableScore(responseScore, currentScores.responseScore),
      });
    });

    const currentDate = this.formatDashboardTrendDate(rewindContext?.getDate?.() || data.generatedAt || new Date());
    if (currentDate) {
      byDate.set(currentDate, {
        date: currentDate,
        ...currentScores,
      });
    }

    return Array.from(byDate.values())
      .sort((a, b) => this.parseDashboardTrendDate(a.date) - this.parseDashboardTrendDate(b.date))
      .slice(-30);
  }

  buildScoreTrendGeometry(points, key, width = 560, height = 190, pad = 18) {
    const trendValues = points
      .map((point, index) => ({ value: point?.[key], index }))
      .filter((item) => pointValueIsFinite(item.value))
      .map((item) => ({ ...item, value: Number(item.value) }));
    const values = trendValues.map((item) => item.value);
    if (trendValues.length < 2) return null;

    let min = Math.max(0, Math.min(...values) - 6);
    let max = Math.min(100, Math.max(...values) + 6);
    if (max - min < 10) {
      const mid = (max + min) / 2;
      min = Math.max(0, mid - 5);
      max = Math.min(100, mid + 5);
    }

    const span = Math.max(1, max - min);
    const xStep = (width - (pad * 2)) / Math.max(1, points.length - 1);
    const coords = trendValues.map((item) => {
      const x = pad + item.index * xStep;
      const value = item.value;
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      return { x, y };
    });

    const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(' ');
    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPath = `${linePath} L ${last.x.toFixed(1)} ${(height - pad).toFixed(1)} L ${first.x.toFixed(1)} ${(height - pad).toFixed(1)} Z`;

    return { linePath, areaPath, width, height };
  }

  getTrendMetricSummary(points, key, currentValue) {
    const comparable = points
      .map((point) => point?.[key])
      .filter((value) => pointValueIsFinite(value))
      .map((value) => Number(value));
    const latestValue = Number.isFinite(Number(currentValue)) ? Number(currentValue) : (comparable[comparable.length - 1] ?? 0);
    if (comparable.length < 2) {
      return { value: latestValue, delta: null, hasDelta: false };
    }

    return {
      value: latestValue,
      delta: latestValue - comparable[0],
      hasDelta: true
    };
  }

  trendDeltaLabel(delta, suffix = '') {
    if (delta === null || delta === undefined) return 'current';
    const numeric = Number(delta);
    if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.5) return 'flat';
    return `${numeric > 0 ? '+' : '-'}${Math.abs(Math.round(numeric))}${suffix}`;
  }

  trendDeltaTone(delta) {
    if (delta === null || delta === undefined) return '#64748b';
    const numeric = Number(delta);
    if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.5) return '#64748b';
    return numeric > 0 ? '#16a34a' : '#d97706';
  }

  renderProofBlockerList(proof) {
    const blockers = Array.isArray(proof?.blockers) ? proof.blockers.slice(0, 4) : [];
    if (blockers.length === 0) return null;

    return html`
      <details
        open=${this.state.evidenceGapsOpen}
        onToggle=${(event) => {
          const nextOpen = event.currentTarget.open === true;
          if (nextOpen !== this.state.evidenceGapsOpen) this.setState({ evidenceGapsOpen: nextOpen });
        }}
        title="Evidence gaps are the model inputs blocking a cleaner insurance review. Expand and click a row to act."
        style="margin-top:16px;text-align:left;border:1px solid var(--db-tile-border,rgba(148,163,184,0.2));border-radius:12px;background:var(--db-tile-bg,rgba(255,255,255,0.48));overflow:hidden;"
      >
        <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;color:var(--db-answer-text,#111827);">
          <span style="min-width:0;display:flex;align-items:center;gap:9px;">
            <span style="width:28px;height:28px;border-radius:9px;background:${proof.tone}16;color:${proof.readableTone};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-alert-triangle"></i></span>
            <span style="min-width:0;">
              <span title="Security, compliance, inventory, patch, vulnerability, and response evidence needing action. Open a row to resolve it." style="display:block;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:850;color:var(--db-muted-text,#6b7280);">Evidence gaps</span>
              <span style="display:block;font-size:0.78rem;font-weight:780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${blockers.length} proof gap${blockers.length === 1 ? '' : 's'} blocking review</span>
            </span>
          </span>
          <span style="font-size:0.72rem;font-weight:850;color:${proof.readableTone};white-space:nowrap;">Review</span>
        </summary>
        <div style="padding:0 10px 10px;display:grid;gap:8px;">
          ${blockers.map((blocker) => {
            const meta = this.getBusinessOnlyMeta(blocker.href || '#!/security');
            const isDisabled = Boolean(meta.className);
            return html`
              <a
                href=${blocker.href || '#!/security'}
                class=${meta.className}
                title=${meta.title || blocker.detail}
                data-business-tooltip=${meta.dataTooltip}
                onClick=${(event) => {
                  if (isDisabled) {
                    event.preventDefault();
                    window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                  }
                }}
                style="display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;text-decoration:none;color:var(--db-answer-text,#111827);border:1px solid ${blocker.tone}22;background:${blocker.tone}08;border-radius:12px;padding:9px 10px;"
              >
                <span style="width:30px;height:30px;border-radius:10px;background:${blocker.tone}16;color:${blocker.readableTone || blocker.tone};display:inline-flex;align-items:center;justify-content:center;font-size:0.84rem;font-weight:900;">${blocker.value}</span>
                <span style="min-width:0;">
                  <span style="display:block;font-size:0.78rem;font-weight:850;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${blocker.label}</span>
                  <span style="display:block;font-size:0.72rem;color:var(--db-faint-text,#6b7280);line-height:1.24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${blocker.detail}</span>
                </span>
                <i class="ti ti-arrow-up-right" style="color:${blocker.readableTone || blocker.tone};font-size:0.95rem;"></i>
              </a>
            `;
          })}
        </div>
      </details>
    `;
  }

  renderMiniScoreTrend(points, key, tone) {
    const geometry = this.buildScoreTrendGeometry(points, key, 120, 42, 4);
    if (!geometry) return null;

    return html`
      <svg viewBox=${`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true" style="width:100%;height:34px;display:block;margin-top:7px;">
        <path d=${geometry.linePath} fill="none" stroke=${tone} stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  renderSecurityHygieneTrendPanel(data = this.state.data, { isSmallScreen = false } = {}) {
    if (!data) return null;

    const points = this.getDashboardTrendPoints(data);
    const hs = this.getHealthScoreData(data);
    const currentPoint = points[points.length - 1] || {
      date: this.formatDashboardTrendDate(data.generatedAt || new Date()),
      hygieneScore: this.clampScore(hs.score),
      securityScore: this.clampScore(hs.vulnerability?.score ?? hs.score),
      complianceScore: this.clampScore(hs.compliance?.score ?? 0),
      deviceScore: this.clampScore(hs.device?.score ?? hs.score),
      responseScore: this.clampScore(hs.response?.score ?? 0)
    };
    const firstPoint = points.find((point) => pointValueIsFinite(point?.hygieneScore)) || currentPoint;
    const hygieneSummary = this.getTrendMetricSummary(points, 'hygieneScore', currentPoint.hygieneScore);
    const hygieneDelta = hygieneSummary.hasDelta ? hygieneSummary.delta : null;
    const hygieneTone = this.trendDeltaTone(hygieneDelta);
    const mainGeometry = this.buildScoreTrendGeometry(points, 'hygieneScore', 560, 190, 18);
    const fromLabel = this.formatDashboardTrendLabel(firstPoint.date);
    const toLabel = this.formatDashboardTrendLabel(currentPoint.date);
    const metricCards = [
      { key: 'securityScore', label: 'Security', href: '#!/security', icon: 'ti-shield-check', detail: hs.vulnerability?.shortReason || 'Security trend' },
      { key: 'complianceScore', label: 'Compliance', href: '#!/compliance', icon: 'ti-clipboard-check', detail: hs.compliance?.shortReason || 'Compliance evidence' },
      { key: 'deviceScore', label: 'Devices', href: '#!/devices', icon: 'ti-devices', detail: this.getDeviceCoverageDetail(data) },
      { key: 'responseScore', label: 'Response', href: '#!/alerts', icon: 'ti-clock-check', detail: hs.response?.shortReason || 'Response evidence' },
    ];

    return html`
      <section aria-label="Hygiene behavior trend" title="Hygiene shows whether the org is improving or drifting. Use the supporting charts to open the weak area." class="card" style="min-width:0;height:100%;background:var(--db-glass-bg,rgba(255,255,255,0.78));border:1px solid var(--db-tile-border,rgba(148,163,184,0.18));border-radius:16px;padding:${isSmallScreen ? '14px' : '16px'};box-shadow:0 4px 18px rgba(15,23,42,0.05);overflow:hidden;">
        <div class="card-status-top bg-orange" style="opacity:${hygieneDelta !== null && hygieneDelta < -0.5 ? '1' : '0.55'};"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <div style="min-width:0;">
            <div title="Behavior history, not a duplicate of today's insurance outcome. Expand supporting charts to act on weak areas." style="font-size:0.72rem;color:var(--db-muted-text,#6b7280);text-transform:uppercase;letter-spacing:0.12em;font-weight:850;margin-bottom:3px;">Hygiene Behavior Trend</div>
            <div style="font-size:0.86rem;font-weight:780;color:var(--db-answer-text,#111827);line-height:1.35;">Org security behavior over time</div>
            <div style="font-size:0.74rem;color:var(--db-faint-text,#6b7280);margin-top:5px;">${fromLabel && toLabel ? `${fromLabel} to ${toLabel}` : 'Latest hygiene trend'} · hygiene score movement</div>
          </div>
          <span class="badge bg-orange-lt text-orange-lt-fg badge-pill" style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${hygieneTone}26;font-size:0.74rem;font-weight:900;line-height:1;padding:7px 10px;white-space:nowrap;">
            ${this.trendDeltaLabel(hygieneDelta, ' pts')}
          </span>
        </div>

        ${mainGeometry ? html`
          <svg viewBox=${`0 0 ${mainGeometry.width} ${mainGeometry.height}`} role="img" aria-label="Hygiene score trend" preserveAspectRatio="none" style="width:100%;height:${isSmallScreen ? '130px' : '160px'};display:block;border-radius:12px;background:linear-gradient(180deg,rgba(99,102,241,0.06),rgba(99,102,241,0.015));">
            <path d=${mainGeometry.areaPath} fill="${hygieneTone}12"></path>
            <path d=${mainGeometry.linePath} fill="none" stroke=${hygieneTone} stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        ` : html`
          <div style="height:${isSmallScreen ? '130px' : '160px'};display:flex;align-items:center;justify-content:center;border:1px dashed var(--db-tile-border,rgba(148,163,184,0.3));border-radius:12px;color:var(--db-faint-text,#6b7280);font-size:0.82rem;">Waiting for the next daily Dossier</div>
        `}

        <details
          open=${this.state.hygieneDetailsOpen}
          onToggle=${(event) => {
            const nextOpen = event.currentTarget.open === true;
            if (nextOpen !== this.state.hygieneDetailsOpen) this.setState({ hygieneDetailsOpen: nextOpen });
          }}
          title="Security + Compliance, Devices, and Response drive hygiene. Expand, then click a tile to open that workflow."
          style="margin-top:12px;border:1px solid var(--db-tile-border,rgba(148,163,184,0.2));border-radius:12px;background:var(--db-tile-bg,rgba(255,255,255,0.42));overflow:hidden;"
        >
          <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;color:var(--db-answer-text,#111827);">
            <span style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.09em;font-weight:850;color:var(--db-muted-text,#6b7280);">Supporting behavior charts</span>
            <span style="font-size:0.72rem;font-weight:850;color:${hygieneTone};white-space:nowrap;">View</span>
          </summary>
          <div style="display:grid;grid-template-columns:${isSmallScreen ? '1fr' : 'repeat(2,minmax(0,1fr))'};gap:8px;padding:0 10px 10px;">
            ${metricCards.map((metric) => {
              const summary = this.getTrendMetricSummary(points, metric.key, currentPoint[metric.key]);
              const value = Number(summary.value ?? 0);
              const tone = this.trendDeltaTone(summary.hasDelta ? summary.delta : null);
              const meta = this.getBusinessOnlyMeta(metric.href);
              const isDisabled = Boolean(meta.className);
              return html`
                <a
                  href=${metric.href}
                  class=${meta.className}
                  title=${meta.title || metric.detail}
                  data-business-tooltip=${meta.dataTooltip}
                  onClick=${(event) => {
                    if (isDisabled) {
                      event.preventDefault();
                      window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                    }
                  }}
                  style="text-decoration:none;color:var(--db-answer-text,#111827);min-width:0;border:1px solid ${tone}22;background:${tone}08;border-radius:12px;padding:10px;display:block;"
                >
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span style="display:flex;align-items:center;gap:7px;min-width:0;">
                      <i class=${`ti ${metric.icon}`} style="color:${tone};font-size:1rem;"></i>
                      <span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:850;color:var(--db-muted-text,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${metric.label}</span>
                    </span>
                    <span style="font-size:0.72rem;font-weight:900;color:${tone};white-space:nowrap;">${this.trendDeltaLabel(summary.hasDelta ? summary.delta : null, ' pts')}</span>
                  </div>
                  <div style="display:flex;align-items:baseline;gap:7px;margin-top:5px;">
                    <span style="font-size:1.25rem;font-weight:850;color:${this.getReadableScoreTone(value)};line-height:1;">${Math.round(value)}</span>
                    <span style="font-size:0.72rem;color:var(--db-faint-text,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${metric.detail}</span>
                  </div>
                  ${this.renderMiniScoreTrend(points, metric.key, tone)}
                </a>
              `;
            })}
          </div>
        </details>
      </section>
    `;
  }

  renderProofChain(data = this.state.data, { isSmallScreen = false } = {}) {
    if (!data) return null;

    const hs = this.getHealthScoreData(data);
    const proof = this.getProofReadinessData(data);
    const securityScore = this.clampScore(hs.vulnerability?.score ?? hs.device?.score ?? hs.score);
    const complianceScore = this.clampScore(hs.compliance?.score ?? 0);
    const auditScore = this.clampScore(hs.response?.score ?? 0);
    const hygieneScore = this.clampScore(hs.score);
    const baseScore = Math.min(securityScore, complianceScore);
    const steps = [
      {
        label: 'Security + Compliance',
        value: `${securityScore} / ${complianceScore}`,
        detail: 'Exposure plus controls',
        icon: 'ti-shield-check',
        tone: this.getScoreTone(baseScore),
        readableTone: this.getReadableScoreTone(baseScore),
        tooltip: 'Security exposure and compliance controls form the base. Open Security or Compliance to improve the weakest side.'
      },
      {
        label: 'Audit',
        value: `${auditScore}`,
        detail: 'Response proof',
        icon: 'ti-clipboard-check',
        tone: this.getScoreTone(auditScore),
        readableTone: this.getReadableScoreTone(auditScore),
        tooltip: 'Audit proof shows whether findings have remediation evidence. Open Alerts to improve response proof.'
      },
      {
        label: 'Hygiene',
        value: `${hygieneScore} ${hs.grade}`,
        detail: 'Behavior over time',
        icon: 'ti-activity',
        tone: this.getScoreTone(hygieneScore),
        readableTone: this.getReadableScoreTone(hygieneScore),
        tooltip: 'Hygiene shows whether the organization is improving or drifting. Use the behavior trend to choose the weak workflow.'
      },
      {
        label: 'Insurance',
        value: proof.label,
        detail: 'Coverage outcome',
        icon: 'ti-file-certificate',
        tone: proof.tone,
        readableTone: proof.readableTone,
        tooltip: 'Insurance readiness is the outcome. Open Reports for evidence packs or ask MAGI what blocks readiness.'
      }
    ];

    return html`
      <section
        aria-label="Readiness model"
        class="proof-chain-strip"
        title="Security + Compliance -> Audit -> Hygiene -> Insurance. Follow the weakest signal to choose the next action."
        style="order:3;margin:0 0 14px;background:var(--proof-chain-bg);border:1px solid var(--proof-chain-border);border-radius:14px;padding:${isSmallScreen ? '11px' : '12px 14px'};box-shadow:var(--proof-chain-shadow);"
      >
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          <div style="min-width:0;">
            <div title="The readiness model behind this dashboard. Follow the weakest signal below to decide where to act next." style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.12em;font-weight:850;color:var(--db-muted-text,#6b7280);">Readiness Model</div>
            <div style="font-size:0.84rem;color:var(--db-answer-text,#374151);font-weight:700;line-height:1.38;max-width:820px;">MAGI correlates live endpoint telemetry, patch and vulnerability exposure, compliance controls, and response history into an auditable insurance readiness position.</div>
          </div>
          <span
            class="badge badge-pill"
            title="Ask MAGI to explain which model input blocks readiness and where to act."
            style="display:inline-flex;align-items:center;gap:6px;background:rgba(34,211,238,0.14);color:var(--db-tone-info,#1d4ed8);border:1px solid rgba(34,211,238,0.35);font-weight:850;box-shadow:0 6px 18px rgba(34,211,238,0.10);"
          >
            <i class="ti ti-sparkles"></i>
            MAGI explains this model
          </span>
        </div>
        <div style="display:flex;align-items:stretch;gap:${isSmallScreen ? '8px' : '9px'};flex-wrap:${isSmallScreen ? 'wrap' : 'nowrap'};">
          ${steps.map((step, index) => html`
            <div style="display:flex;align-items:center;gap:${isSmallScreen ? '8px' : '9px'};flex:${isSmallScreen ? '1 1 100%' : '1 1 0'};min-width:${isSmallScreen ? '100%' : '0'};">
              <div
                aria-label=${`${step.label}: ${step.value}. ${step.detail}`}
                title=${step.tooltip}
                style="flex:1;min-width:0;border:1px solid ${step.tone}22;background:${this.getTranslucentSurface(step.tone, '08')};border-radius:12px;padding:10px 11px;display:grid;grid-template-columns:32px minmax(0,1fr);gap:9px;align-items:center;color:var(--db-answer-text,#111827);"
              >
                <span style="width:32px;height:32px;border-radius:10px;background:${step.tone}16;color:${step.readableTone || step.tone};display:inline-flex;align-items:center;justify-content:center;"><i class=${`ti ${step.icon}`}></i></span>
                <span style="min-width:0;display:block;">
                  <span style="display:block;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:850;color:var(--db-muted-text,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${step.label}</span>
                  <span style="display:flex;align-items:baseline;gap:7px;margin-top:2px;min-width:0;">
                    <span style="font-size:0.98rem;font-weight:900;color:${step.readableTone || step.tone};line-height:1;white-space:nowrap;">${step.value}</span>
                    <span style="font-size:0.7rem;color:var(--db-faint-text,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${step.detail}</span>
                  </span>
                </span>
              </div>
              ${index < steps.length - 1 ? html`
                <span aria-hidden="true" style="display:${isSmallScreen ? 'none' : 'inline-flex'};align-items:center;justify-content:center;color:var(--db-tone-primary,#4f46e5);opacity:0.75;flex:0 0 18px;"><i class="ti ti-arrow-narrow-right"></i></span>
              ` : null}
            </div>
          `)}
        </div>
      </section>
    `;
  }

  renderSearchHeader() {
    const { data, aiLoading, aiAnswer, aiError, refreshing } = this.state;
    if (!data) return null;

    const hs = this.getHealthScoreData(data);
    const freshness = this.getFreshnessInfo();
    const proof = this.getProofReadinessData(data);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const aiPlaceholder = isSmallScreen
      ? 'Ask about readiness or risk...'
      : 'Ask MAGI about readiness, risk, or next actions...';
    const aiButtonLabel = aiLoading ? 'Thinking...' : (isSmallScreen ? 'Ask' : 'Ask MAGI');
    const scoreColor = this.getScoreTone(hs.score);
    const scoreReadableColor = this.getReadableScoreTone(hs.score);
    const magiHeroTip = 'Ask MAGI to explain the readiness model and name the Security, Compliance, Audit, or Hygiene action to take next.';
    const proofCardTip = 'Insurance readiness is today\'s outcome. Open Reports for evidence, or ask MAGI what blocks readiness.';

    return html`
      <div style="
        width: 100vw;
        position: relative;
        left: 50%;
        right: 50%;
        margin-left: -50vw;
        margin-right: -50vw;
        background: var(--tblr-body-bg, #f4f6fa);
        padding: 14px 16px 8px;
        overflow: visible;
      ">
        <div style="max-width: 1120px; margin: 0 auto; position: relative; display:flex; flex-direction:column;">
          <section aria-label="MAGI search" class="card card-lg magi-hero-card" style="order:1;min-width:0;margin:0 0 12px;border-radius:16px;">
            <div class="card-status-top bg-purple"></div>
            <div class="card-body" style="padding:${isSmallScreen ? '16px' : '18px 20px'};display:flex;flex-direction:column;gap:14px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">
                <div style="min-width:0;flex:1 1 300px;">
                  <div class="badges-list" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px;">
                    <span class="badge bg-indigo-lt text-indigo-lt-fg badge-pill" title="Ask Officer MAGI to explain evidence and name the next action." style="font-weight:850;letter-spacing:0.08em;text-transform:uppercase;">MAGI</span>
                    <span class="badge bg-azure-lt text-azure-lt-fg badge-pill" title="Review the readiness model below, then open the weak area.">Readiness model</span>
                    <span class="badge bg-purple-lt text-purple-lt-fg badge-pill" title="Use Recommended Fixes or ask MAGI for the next action.">Next action</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="width:38px;height:38px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--db-tone-primary,#4f46e5),var(--db-tone-purple,#7c3aed));color:#fff;box-shadow:0 10px 20px rgba(79,70,229,0.24);"><i class="ti ti-sparkles" style="font-size:1.18rem;"></i></span>
                    <span style="font-size:${isSmallScreen ? '1.35rem' : '1.65rem'};font-weight:900;line-height:1;color:var(--db-answer-text,#111827);">Officer MAGI</span>
                  </div>
                  <div style="margin-top:7px;color:var(--db-faint-text,#6b7280);font-size:0.86rem;line-height:1.42;max-width:680px;">${magiHeroTip}</div>
                </div>
                <a href="#!/analyst" class=${this.isPersonalOrg() ? 'btn btn-outline-indigo business-license-only' : 'btn btn-outline-indigo'} title=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : 'Open Officer MAGI'} data-business-tooltip=${this.isPersonalOrg() ? BUSINESS_ONLY_TOOLTIP : ''} onClick=${(event) => {
                  if (this.isPersonalOrg()) {
                    event.preventDefault();
                    window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                  }
                }} style="white-space:nowrap;align-self:${isSmallScreen ? 'stretch' : 'flex-start'};justify-content:center;">
                  <i class="ti ti-messages"></i>
                  Analyst view
                </a>
              </div>

              <div aria-label="MAGI command box" class="magi-command-shell" title=${magiHeroTip}>
                <form onSubmit=${this.submitAiPrompt}>
                  <div class="input-group input-group-flat magi-command-input">
                    <span class="input-group-text" style="background:transparent;border:0;color:var(--db-faintest-text);padding-left:14px;padding-right:4px;">
                      ${aiLoading
                        ? html`<span class="spinner-border spinner-border-sm" style="color: var(--db-tone-primary,#4f46e5); width: 16px; height: 16px; border-width: 2px;" role="status"></span>`
                        : html`<i class="ti ti-search" style="font-size:1rem;"></i>`}
                    </span>
                    <input
                      type="text"
                      class="form-control"
                      aria-label="Ask security assistant"
                      title="Ask about insurance readiness, proof blockers, hygiene drift, or which page to open next."
                      placeholder=${aiPlaceholder}
                      value=${this.state.aiPrompt}
                      onInput=${this.handleAiPromptChange}
                      disabled=${aiLoading}
                      style="background:transparent;border:0;box-shadow:none;color:var(--db-input-color);font-size:${isSmallScreen ? '0.84rem' : '0.92rem'};padding:${isSmallScreen ? '11px 6px' : '13px 8px'};min-width:0;"
                    />
                    <button
                      type="submit"
                      class=${aiLoading ? 'btn btn-indigo btn-loading' : 'btn btn-indigo'}
                      title="Ask MAGI to explain the current readiness model."
                      disabled=${aiLoading}
                      style="margin:4px;border-radius:10px;min-width:${isSmallScreen ? '72px' : '106px'};white-space:nowrap;"
                    >${aiButtonLabel}</button>
                  </div>
                </form>
              </div>

              ${aiAnswer ? html`
                <div class="magi-answer-card" style="
                  background: var(--db-answer-bg, rgba(255,255,255,0.85));
                  backdrop-filter: blur(16px);
                  -webkit-backdrop-filter: blur(16px);
                  border: 1px solid var(--db-card-border, rgba(148,163,184,0.18));
                  border-left: 3px solid #818cf8;
                  border-radius: 14px;
                  padding: 14px 16px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                ">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="color: var(--db-tone-primary,#4f46e5); font-size: 0.78rem; font-weight: 700;">MAGI</span>
                      ${aiAnswer.confidence != null ? html`
                        <span class="badge bg-indigo-lt text-indigo-lt-fg badge-pill">${Math.round((aiAnswer.confidence || 0) * 100)}%</span>
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
                        class=${this.isPersonalOrg() ? 'btn btn-sm btn-outline-indigo business-license-only' : 'btn btn-sm btn-outline-indigo'}
                        title="Continue this answer in the full Analyst view."
                      >Continue</button>
                      <button class="btn btn-action" aria-label="Clear MAGI answer" title="Clear MAGI answer" onClick=${this.clearAiAnswer}><i class="ti ti-x"></i></button>
                    </div>
                  </div>
                  <div class="magi-answer-question" style="color: var(--db-faint-text); font-size: 0.76rem; margin-bottom: 8px; font-style: italic;">${aiAnswer.question}</div>
                  <div class="chat-markdown-content magi-answer-body" style="color: var(--db-answer-text); font-size: 0.875rem;" dangerouslySetInnerHTML=${{ __html: renderMarkdown(aiAnswer.answer) }}></div>
                </div>
              ` : ''}

              ${aiError ? html`
                <div class="alert alert-warning mb-0" role="alert" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <span>${aiError}</span>
                  <button class="btn btn-action" aria-label="Clear MAGI error" onClick=${this.clearAiAnswer}><i class="ti ti-x"></i></button>
                </div>
              ` : ''}
            </div>
          </section>

          <div style="order:2;margin:0 0 16px;padding:0 2px;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(124,58,237,0.36),transparent);margin:0 0 10px;"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div title="When the dashboard evidence package was last generated. If it looks stale, click Refresh before reviewing or exporting." style="display:inline-flex;align-items:center;gap:8px;color:var(--db-faint-text,#6b7280);font-size:0.76rem;font-weight:650;">
                <i class=${`ti ${freshness?.isStale ? 'ti-clock-exclamation' : 'ti-clock-check'}`} style="color:var(--db-tone-primary,#4f46e5);"></i>
                <span>${freshness ? `Updated ${freshness.ageText}${freshness.isStale ? ' · stale evidence' : ''}` : 'Current readiness data'}</span>
              </div>
              <button
                class=${refreshing ? 'btn btn-sm btn-outline-indigo btn-loading' : 'btn btn-sm btn-outline-indigo'}
                onClick=${() => this.refreshDashboard()}
                title="Reload the dashboard evidence package before reviewing or exporting reports."
                disabled=${refreshing}
                style="display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:6px 10px;border-radius:9px;white-space:nowrap;"
              >
                <i class="ti ti-refresh"></i>
                ${refreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </div>

          ${this.renderProofChain(data, { isSmallScreen })}

          <section
            aria-label="Insurance outcome and hygiene behavior trend"
            style="order:4;display:grid;grid-template-columns:${isSmallScreen ? '1fr' : 'minmax(330px,0.82fr) minmax(500px,1.18fr)'};gap:${isSmallScreen ? '10px' : '14px'};align-items:stretch;"
          >
            <section aria-label="Insurance readiness" style="min-width:0;">
              <div
                class="card proof-readiness-card"
                style="
                  --proof-readiness-tone: ${proof.tone};
                  --proof-readiness-shadow: ${proof.tone}18;
                  width: 100%;
                  height: 100%;
                  margin: 0 auto;
                  padding: 16px 18px;
                  background: linear-gradient(135deg, rgba(99,102,241,0.055), var(--db-glass-bg, rgba(255,255,255,0.76)) 44%, var(--db-glass-bg, rgba(255,255,255,0.76)));
                  backdrop-filter: blur(14px);
                  -webkit-backdrop-filter: blur(14px);
                  border: 1px solid var(--db-tile-border, rgba(148,163,184,0.18));
                  border-top: 4px solid ${proof.tone};
                  border-left: 1px solid ${proof.tone}26;
                  border-radius: 16px;
                  box-shadow: 0 6px 22px ${proof.tone}12, 0 4px 18px rgba(15,23,42,0.05);
                  display:flex;
                  flex-direction:column;
                "
                title=${proofCardTip}
              >
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
                  <div style="text-align:left;min-width:220px;flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                      <div title="The underwriter-facing outcome. Open Reports for the evidence pack or click gaps below." style="font-size:0.72rem;color:var(--db-muted-text,#6b7280);text-transform:uppercase;letter-spacing:0.12em;font-weight:800;">Insurance Readiness</div>
                      <span class="badge badge-pill" title=${proofCardTip} style="font-weight:850;background:${proof.tone};color:#fff;border:1px solid ${proof.tone};box-shadow:0 6px 14px ${proof.tone}24;">${proof.label}</span>
                    </div>
                    <div title="This is the insurance decision view. Use Evidence gaps to choose what to fix." style="font-size:${isSmallScreen ? '1.45rem' : '1.72rem'};font-weight:850;color:var(--db-answer-text,#111827);line-height:1.08;">Coverage outcome</div>
                    <div style="font-size:0.84rem;color:var(--db-answer-text,#374151);font-weight:550;margin-top:7px;line-height:1.4;">${proof.summary}</div>
                  </div>
                  <a href="#!/reports" title="Open evidence reports for the hygiene score and insurance package." style="min-width:132px;padding:11px 12px;border-radius:12px;background:${this.getTranslucentSurface(scoreColor, '07')};border:1px solid ${scoreColor}24;text-align:left;text-decoration:none;color:var(--db-answer-text,#111827);">
                    <div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--db-muted-text,#6b7280);font-weight:800;">Hygiene Score</div>
                    <div style="display:flex;align-items:center;gap:9px;margin-top:3px;">
                      <span style="font-size:1.95rem;font-weight:850;color:${scoreReadableColor};line-height:1;">${hs.score}</span>
                      <span style="min-width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900;color:#fff;background:${scoreColor};border-radius:10px;line-height:1;box-shadow:0 8px 18px ${scoreColor}33;">${hs.grade}</span>
                    </div>
                    <div style="font-size:0.7rem;color:var(--db-faint-text,#6b7280);margin-top:4px;">Evidence reports</div>
                  </a>
                </div>

                <div title="The strongest reason the current outcome is not cleaner. Use the gap list below to open the right workflow." style="margin-top:22px;text-align:left;border-left:3px solid ${proof.tone};padding-left:10px;">
                  <div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--db-muted-text,#6b7280);font-weight:850;margin-bottom:3px;">Why this outcome</div>
                  <div style="font-size:0.82rem;color:var(--db-answer-text,#374151);font-weight:500;line-height:1.42;">${hs.narration}</div>
                  ${hs.narrationImpact ? html`
                    <div style="font-size:0.72rem;color:var(--db-tone-success,#15803d);font-weight:650;margin-top:3px;">${hs.narrationImpact}</div>
                  ` : null}
                </div>

                ${this.renderProofBlockerList(proof)}

                <div style="margin-top:auto;padding-top:12px;display:flex;align-items:center;gap:10px;font-size:0.74rem;flex-wrap:wrap;">
                  ${hs.hasCriticalPenalty ? html`
                    <span style="color:var(--db-tone-danger,#dc2626);font-weight:700;font-size:0.72rem;">Critical penalty applied</span>
                  ` : null}
                  ${freshness ? html`<span style="color:var(--db-faint-text,#9ca3af);">Evidence: ${freshness.ageText}${freshness.isStale ? ' stale' : ''}</span>` : null}
                </div>
              </div>
            </section>

            ${this.renderSecurityHygieneTrendPanel(data, { isSmallScreen })}
          </section>

          <section
            aria-label="Readiness details and next steps"
            style="order:5;display:grid;grid-template-columns:${isSmallScreen ? '1fr' : 'minmax(0,1fr) minmax(320px,0.92fr)'};gap:${isSmallScreen ? '10px' : '14px'};align-items:start;margin-top:14px;"
          >
            <div style="min-width:0;">${this.renderDossierStack({ embedded: true })}</div>
            <div style="min-width:0;">${this.renderTopActionDropdown({ embedded: true })}</div>
          </section>
        </div>
      </div>
    `;
  }

  renderHealthPillars() {
    const { data } = this.state;
    if (!data) return null;

    const hs = this.getHealthScoreData(data);
    const pillars = [
      { key: 'device',        data: hs.device,        icon: html`<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><rect x="3" y="4" width="18" height="12" rx="1"/><line x1="7" y1="20" x2="17" y2="20"/><line x1="9" y1="16" x2="9" y2="20"/><line x1="15" y1="16" x2="15" y2="20"/></svg>` },
      { key: 'software',      data: hs.software,      icon: html`<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>` },
      { key: 'vulnerability', data: hs.vulnerability, icon: html`<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 9v4"/><path d="M12 16v.01"/></svg>` },
      { key: 'response',      data: hs.response,      icon: html`<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>` },
      { key: 'compliance',    data: hs.compliance,     icon: html`<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/><path d="M9 12l2 2l4-4"/></svg>` }
    ];

    return html`
      <div style="max-width:960px;margin:8px auto 4px;padding:0 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:var(--db-muted-text,#6b7280);">Evidence Pack</div>
          <a href="#!/reports" style="font-size:0.74rem;font-weight:700;text-decoration:none;color:#2563eb;">Open reports</a>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          ${pillars.map(p => {
            const s = p.data?.score ?? 0;
            const color = s >= 80 ? '#16a34a' : s >= 60 ? '#2563eb' : s >= 40 ? '#d97706' : '#dc2626';
            const status = s >= 80 ? 'Ready' : s >= 60 ? 'Partial' : s >= 40 ? 'Watch' : 'Blocked';
            const label = p.key === 'device'
              ? 'Devices'
              : p.key === 'vulnerability'
                ? 'Vulns'
                : p.data?.label || p.key;
            const url = p.data?.drillDownUrl || '#!/security';
            const isCompBiz = p.key === 'compliance' && this.isPersonalOrg();

            return html`
              <button
                key=${p.key}
                class=${isCompBiz ? 'business-license-only' : ''}
                title=${isCompBiz ? BUSINESS_ONLY_TOOLTIP : `${p.data?.label || p.key}: ${p.data?.shortReason || status}`}
                onClick=${() => {
                  if (isCompBiz) { window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000); return; }
                  window.location.hash = url;
                }}
                style="flex:1 1 150px;min-width:150px;max-width:190px;display:flex;align-items:center;gap:9px;text-align:left;background:var(--db-tile-bg);border:1px solid var(--db-tile-border);border-left:3px solid ${color};border-radius:12px;padding:9px 10px;cursor:pointer;color:var(--db-answer-text,#111827);"
              >
                <span style="color:${color};display:flex;flex-shrink:0;">${p.icon}</span>
                <span style="min-width:0;flex:1;">
                  <span style="display:block;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.07em;font-weight:700;color:var(--db-muted-text,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</span>
                  <span style="display:flex;align-items:baseline;gap:6px;margin-top:1px;">
                    <span style="font-size:1rem;font-weight:800;color:${color};line-height:1;">${status}</span>
                    <span style="font-size:0.72rem;color:var(--db-faint-text,#6b7280);">${s}</span>
                  </span>
                </span>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  renderPatchStatusCard() {
    const { data } = this.state;
    if (!data) return null;

    const patch = this.getPatchStatusSummary(data);
    const hasOpen = patch.openAlerts > 0;
    const tone = patch.unavailable ? '#6b7280' : hasOpen ? '#d97706' : '#16a34a';
    const title = patch.unavailable
      ? 'Patch Status unavailable'
      : hasOpen
        ? `${patch.openAlerts} missing Microsoft update${patch.openAlerts === 1 ? '' : 's'}`
        : 'No missing Microsoft updates';
    const subtitle = patch.unavailable
      ? (patch.message || 'The Patch Status API did not return a current result.')
      : hasOpen
        ? `${patch.hostsAffected} affected device${patch.hostsAffected === 1 ? '' : 's'} · ${patch.critical} critical · ${patch.high} high${patch.exploited > 0 ? ` · ${patch.exploited} exploited` : ''}`
        : `Patch intelligence covers ${patch.productCount} products and ${patch.leafPatchCount} KBs.`;
    const builtDate = patch.builtAt ? new Date(patch.builtAt) : null;
    const intelText = builtDate && !Number.isNaN(builtDate.getTime())
      ? `MSRC intel built ${builtDate.toLocaleString()}`
      : `MSRC intel: ${patch.productCount} products · ${patch.leafPatchCount} KBs`;

    return html`
      <div style="display:flex;justify-content:center;margin:8px 16px 4px;">
        <a href="#!/patch-posture" style="text-decoration:none;width:100%;max-width:720px;">
          <div
            style="background:var(--db-tile-bg);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border:1px solid var(--db-tile-border);border-left:4px solid ${tone};border-radius:14px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);color:var(--db-answer-text,#111827);transition:transform 0.15s,box-shadow 0.15s;"
            onMouseEnter=${(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
            onMouseLeave=${(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
          >
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <span style="color:${tone};display:flex;margin-top:1px;">
                <svg width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/><path d="M10 13l2 2l4-4"/></svg>
              </span>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                  <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.09em;font-weight:700;color:var(--db-muted-text,#6b7280);">Patch Status</div>
                  <span class="badge ${patch.unavailable ? 'bg-secondary text-white' : hasOpen ? 'bg-warning text-white' : 'bg-success text-white'}">${patch.unavailable ? 'Unavailable' : hasOpen ? 'Action needed' : 'Clean'}</span>
                </div>
                <div style="font-size:1rem;font-weight:750;line-height:1.3;margin-top:3px;color:var(--db-answer-text,#111827);">${title}</div>
                <div style="font-size:0.82rem;color:var(--db-faint-text,#6b7280);line-height:1.4;margin-top:2px;">${subtitle}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:9px;">
                  <span style="font-size:0.72rem;color:var(--db-faintest-text,#9ca3af);">${intelText}</span>
                  <span style="font-size:0.76rem;font-weight:700;color:${tone};display:inline-flex;align-items:center;gap:4px;">
                    Open Patch Status
                    <svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z"/><path d="M5 12h14"/><path d="M13 18l6-6"/><path d="M13 6l6 6"/></svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </a>
      </div>
    `;
  }

  renderDossierStack({ embedded = false } = {}) {
    const { data } = this.state;
    if (!data) return null;

    const hs = this.getHealthScoreData(data);
    const proof = this.getProofReadinessData(data);
    const patch = this.getPatchStatusSummary(data);
    const apps = data?.quickStats?.apps || {};
    const cves = data?.quickStats?.cves || data?.securityPro?.threatIntel || {};

    const patchTone = patch.unavailable ? '#64748b' : patch.critical > 0 ? '#dc2626' : patch.high > 0 || patch.openAlerts > 0 ? '#d97706' : '#16a34a';
    const deviceScore = Number(hs.device?.score ?? 0);
    const softwareScore = Number(hs.software?.score ?? 0);
    const vulnerabilityScore = Number(hs.vulnerability?.score ?? 0);
    const complianceScore = Number(hs.compliance?.score ?? 0);
    const responseScore = Number(hs.response?.score ?? 0);
    const critical = Number(cves.criticalCount ?? cves.critical ?? cves.uniqueCriticalCveCount ?? 0);
    const high = Number(cves.highCount ?? cves.high ?? cves.uniqueHighCveCount ?? 0);
    const softwareDetail = this.getSoftwareDossierDetail(data, hs, patch);
    const deviceDetail = this.getDeviceCoverageDetail(data);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;
    const containerStyle = embedded
      ? 'margin:12px 0 0;padding:0;'
      : 'max-width:720px;margin:8px auto 18px;padding:0 16px;';
    const itemMinHeight = embedded ? '78px' : '86px';

    const dropdownItems = [
      {
        href: '#!/devices',
        icon: 'ti-devices',
        label: 'Devices',
        value: `${deviceScore}`,
        detail: deviceDetail,
        tone: this.getScoreTone(deviceScore),
        readableTone: this.getReadableScoreTone(deviceScore)
      },
      {
        href: hs.software?.drillDownUrl || '#!/apps',
        icon: 'ti-packages',
        label: 'Software',
        value: `${softwareScore}`,
        detail: softwareDetail,
        tone: this.getScoreTone(softwareScore),
        readableTone: this.getReadableScoreTone(softwareScore)
      },
      {
        href: '#!/patch-posture',
        icon: 'ti-tool',
        label: 'Patch',
        value: patch.unavailable ? 'N/A' : `${patch.openAlerts}`,
        detail: patch.unavailable
          ? (patch.message || 'Patch evidence unavailable')
          : `${patch.hostsAffected} affected devices, ${patch.critical} critical`,
        tone: patchTone,
        readableTone: patch.unavailable ? 'var(--db-tone-neutral,#475569)' : patch.critical > 0 ? 'var(--db-tone-danger,#dc2626)' : patch.high > 0 || patch.openAlerts > 0 ? 'var(--db-tone-warning,#b45309)' : 'var(--db-tone-success,#15803d)'
      },
      {
        href: hs.vulnerability?.drillDownUrl || '#!/vulnerabilities',
        icon: 'ti-shield-exclamation',
        label: 'Vulnerabilities',
        value: `${vulnerabilityScore}`,
        detail: critical + high > 0
          ? `${critical} critical, ${high} high CVEs`
          : (hs.vulnerability?.shortReason || 'No critical or high CVEs'),
        tone: this.getScoreTone(vulnerabilityScore),
        readableTone: this.getReadableScoreTone(vulnerabilityScore)
      },
      {
        href: hs.compliance?.drillDownUrl || '#!/compliance',
        icon: 'ti-clipboard-check',
        label: 'Compliance',
        value: `${complianceScore}`,
        detail: hs.compliance?.shortReason || 'Control evidence and audit-ready compliance context.',
        tone: this.getScoreTone(complianceScore),
        readableTone: this.getReadableScoreTone(complianceScore)
      },
      {
        href: hs.response?.drillDownUrl || '#!/alerts',
        icon: 'ti-clock-check',
        label: 'Response',
        value: `${responseScore}`,
        detail: hs.response?.shortReason || 'Remediation and response evidence',
        tone: this.getScoreTone(responseScore),
        readableTone: this.getReadableScoreTone(responseScore)
      }
    ];

    return html`
      <section aria-label="Readiness model signal dropdown" style=${containerStyle}>
        <details
          open=${this.state.dossierOpen}
          onToggle=${(event) => {
            const nextOpen = event.currentTarget.open === true;
            if (nextOpen !== this.state.dossierOpen) this.setState({ dossierOpen: nextOpen });
          }}
          title="Detailed signals behind Security + Compliance, Audit, Hygiene, and Insurance readiness. Expand and click a signal to act."
          style="background:var(--db-glass-bg,rgba(255,255,255,0.74));border:1px solid rgba(99,102,241,0.14);border-radius:12px;box-shadow:0 4px 14px rgba(15,23,42,0.04);overflow:hidden;"
        >
          <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;color:var(--db-answer-text,#111827);">
            <span style="display:flex;align-items:center;gap:10px;min-width:0;">
              <span style="width:30px;height:30px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:${proof.tone}18;color:${proof.readableTone};flex-shrink:0;"><i class="ti ti-layout-grid"></i></span>
              <span style="min-width:0;">
                <span style="display:block;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:var(--db-muted-text,#6b7280);">Model Signals</span>
                <span style="display:block;font-size:0.84rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${proof.label} · security, compliance, audit, and hygiene inputs</span>
              </span>
            </span>
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:800;color:${proof.readableTone};white-space:nowrap;">
              ${this.state.dossierOpen ? 'Hide signals' : 'Review signals'} <i class=${`ti ${this.state.dossierOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
            </span>
          </summary>
          <div role="list" aria-label="Readiness model signal links" style="display:grid;grid-template-columns:${isSmallScreen ? '1fr' : 'repeat(2,minmax(0,1fr))'};gap:8px;padding:0 12px 12px;">
            ${dropdownItems.map((item) => {
              const meta = this.getBusinessOnlyMeta(item.href);
              const isDisabled = Boolean(meta.className);
              return html`
                <div role="listitem">
                  <a
                    key=${item.href}
                    href=${item.href}
                    class=${meta.className}
                    aria-label=${`${item.label}. ${item.value}. ${item.detail}`}
                    title=${meta.title || `${item.label}: ${item.detail}`}
                    data-business-tooltip=${meta.dataTooltip}
                    onClick=${(event) => {
                      if (isDisabled) {
                        event.preventDefault();
                        window.toast?.show(BUSINESS_ONLY_TOOLTIP, 'warning', 3000);
                      }
                    }}
                    style="min-height:${itemMinHeight};display:flex;align-items:flex-start;gap:10px;text-decoration:none;color:var(--db-answer-text,#111827);background:${this.getTranslucentSurface(item.tone, '07')};border:1px solid ${item.tone}20;border-radius:11px;padding:10px;box-shadow:0 1px 3px rgba(15,23,42,0.04);"
                  >
                    <span style="width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:${item.tone}18;color:${item.readableTone || item.tone};flex-shrink:0;"><i class=${`ti ${item.icon}`}></i></span>
                    <span style="min-width:0;flex:1;">
                      <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:var(--db-muted-text,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.label}</span>
                        <span style="font-size:1rem;font-weight:850;color:${item.readableTone || item.tone};line-height:1;white-space:nowrap;">${item.value}</span>
                      </span>
                      <span style="display:block;font-size:0.76rem;color:var(--db-faint-text,#6b7280);line-height:1.35;margin-top:6px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${item.detail}</span>
                    </span>
                  </a>
                </div>
              `;
            })}
          </div>
        </details>
      </section>
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
      const patchStatus = this.getPatchStatusSummary(data);
      headlineValue = patchStatus.unavailable ? '—' : String(patchStatus.openAlerts);
      headlineLabel = 'Missing Updates';
      headlineSubtitle = patchStatus.unavailable
        ? 'Patch Status unavailable'
        : `${patchStatus.hostsAffected} device${patchStatus.hostsAffected === 1 ? '' : 's'} · ${patchStatus.critical} critical · ${patchStatus.high} high`;
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
        { label: 'Hygiene Score', value: score.score || 0, valueColor: score.score >= 80 ? '#16a34a' : score.score >= 60 ? '#2563eb' : '#d97706', suffix: '', sub: score.grade || '' },
        { label: 'Compliance',     value: `${compPct}%`,   valueColor: compPct >= 80 ? '#16a34a' : compPct >= 60 ? '#2563eb' : '#dc2626', suffix: '', sub: bo.complianceCard?.gapCount > 0 ? `${bo.complianceCard.gapCount} gaps` : 'clean' },
        { label: 'Risk Level',     value: risk,            valueColor: riskColor,   suffix: '', sub: `Score: ${bo.riskSummary?.riskScore || '—'}` },
        { label: 'License',        value: `${bo.licenseCard?.seatsUsed || 0}/${bo.licenseCard?.seatsTotal || 0}`, valueColor: '#6366f1', suffix: '', sub: `${bo.licenseCard?.daysRemaining || 0}d remaining` }
      ];
    } else if (activePersona === 'it') {
      const osEntries = it.inventory?.osBreakdown ? Object.entries(it.inventory.osBreakdown) : [];
      const patchStatus = this.getPatchStatusSummary(data);
      metricCards = [
        { label: 'Managed Devices', value: it.inventory?.totalDevices || 0,         valueColor: '#2563eb', suffix: '', sub: osEntries.slice(0,2).map(([k,v])=>`${k}: ${v}`).join(' · ') || '' },
        { label: 'Missing Updates', value: patchStatus.unavailable ? '—' : patchStatus.openAlerts, valueColor: patchStatus.openAlerts > 0 ? '#d97706' : '#16a34a', suffix: '', sub: patchStatus.unavailable ? 'unavailable' : `${patchStatus.hostsAffected} affected hosts` },
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
      // Display unique CVE counts; show exposure multiplier as sub-text for context.
      const uCrit = sec.uniqueCriticalCveCount ?? sec.criticalCveCount ?? 0;
      const uHigh = sec.uniqueHighCveCount ?? sec.highCveCount ?? 0;
      const xCrit = sec.criticalCveCount || 0;
      const xHigh = sec.highCveCount || 0;
      const dCrit = sec.affectedDevicesCritical || 0;
      const dHigh = sec.affectedDevicesHigh || 0;
      metricCards = [
           { label: 'Critical Unique CVEs', value: uCrit,
          valueColor: uCrit > 0 ? '#dc2626' : '#16a34a', suffix: '',
          sub: critDelta > 0 ? `▲ +${critDelta} new`
             : critDelta < 0 ? `▼ ${Math.abs(critDelta)} fixed`
             : (xCrit > uCrit ? `${metricPhrase('cveExposures', xCrit)} · ${dCrit ? metricPhrase('affectedDevices', dCrit) : 'affected devices unknown'}` : '') },
           { label: 'High Unique CVEs', value: uHigh,
          valueColor: uHigh > 0 ? '#d97706' : '#16a34a', suffix: '',
          sub: highDelta > 0 ? `▲ +${highDelta} new`
             : highDelta < 0 ? `▼ ${Math.abs(highDelta)} fixed`
             : (xHigh > uHigh ? `${metricPhrase('cveExposures', xHigh)} · ${dHigh ? metricPhrase('affectedDevices', dHigh) : 'affected devices unknown'}` : '') },
        { label: 'Actively Exploited', value: `${sec.exploitCount || 0} / ${sec.activeExploitCount || 0}`,
          valueColor: sec.exploitCount > 0 ? '#ea580c' : '#16a34a', suffix: '', sub: 'catalog / in the wild' },
        { label: 'High Exploit Risk',     value: sec.highEpssCount || 0,
          valueColor: sec.highEpssCount > 0 ? '#7c3aed' : '#16a34a', suffix: '', sub: '> 80% exploit likelihood' }
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
      actionRows = (bo.topActions || []).slice(0, 3).map(a => {
        const affectedNames = Array.isArray(a.affectedDeviceNames)
          ? a.affectedDeviceNames.filter(Boolean)
          : [];
        const primaryName = affectedNames[0] || a.primaryDeviceName || '';
        const count = Number.isFinite(Number(a.deviceCount))
          ? Number(a.deviceCount)
          : affectedNames.length;
        const extra = Math.max(0, count - 1);
        const targetText = primaryName
          ? (count > 1
              ? `Affected device: ${primaryName} and ${extra} more`
              : `Affected device: ${primaryName}`)
          : '';

        return {
          badge: a.urgency || 'normal',
          badgeColor: a.urgency === 'critical' || a.urgency === 'urgent' ? '#dc2626' : a.urgency === 'high' || a.urgency === 'important' ? '#d97706' : '#6b7280',
          title: a.title || '',
          sub: targetText
            ? `${targetText}${a.deadlineText ? ` · ${a.deadlineText}` : ''}`
            : (a.deadlineText || a.description || '')
        };
      });
    } else if (activePersona === 'it') {
      actionRows = (it.appRisks || []).slice(0, 3).map(a => ({
        badge: `${a.cveSummary?.total ?? 0} CVEs`,
        badgeColor: '#dc2626',
        title: a.appName || '',
        sub: a.kevCount > 0 ? `${a.kevCount} actively exploited · ${a.deviceCount} device${a.deviceCount !== 1 ? 's' : ''}` : `${a.deviceCount} device${a.deviceCount !== 1 ? 's' : ''} affected`
      }));
    } else if (activePersona === 'security') {
      if (sec.exploitCount > 0) {
        actionRows = [{ badge: 'EXPLOITED', badgeColor: '#ea580c', title: `${sec.exploitCount} actively exploited vulnerability${sec.exploitCount !== 1 ? 'ies' : 'y'}`, sub: 'Patch immediately — these are actively exploited in the wild' }];
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
                          <th style="text-align:right;padding:4px 0;font-weight:600;color:var(--tblr-secondary,#666);">Exploit Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(data.securityPro.cveDetails || []).slice(0,5).map(c => html`
                          <tr style="border-bottom:1px solid var(--tblr-border-color,#f0f0f0);">
                            <td style="padding:5px 6px 5px 0;">
                              <span style="font-weight:600;color:${c.severity==='Critical'?'#dc2626':c.severity==='High'?'#d97706':'#6366f1'}">${c.cveId}</span>
                              ${c.hasKevExploit ? html`<span style="font-size:0.6rem;font-weight:700;color:#ea580c;background:#ea580c18;border:1px solid #ea580c33;border-radius:3px;padding:1px 4px;margin-left:4px;">Exploited</span>` : ''}
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
                  <span class="badge bg-danger-lt text-danger" title="Unique critical CVEs (${Number(threats.criticalCveCount || 0)} exposures)">Critical ${Number(threats.uniqueCriticalCveCount ?? threats.criticalCveCount ?? 0)}</span>
                  <span class="badge bg-warning-lt text-warning" title="Unique high CVEs (${Number(threats.highCveCount || 0)} exposures)">High ${Number(threats.uniqueHighCveCount ?? threats.highCveCount ?? 0)}</span>
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

  renderOfficerOrb() {
    const { data, officerNoteOpen, officerNoteDismissed } = this.state;
    if (!data || officerNoteDismissed) return null;

    const score = data.securityScore || {};
    const threats = data.securityPro?.threatIntel || {};
    const actions = data.businessOwner?.topActions || [];
    const todaysAction = data.businessOwner?.todaysAction || null;
    const secScore = typeof score.score === 'number' ? score.score : 100;
    const grade = score.grade || '—';
    const critical = threats.uniqueCriticalCveCount ?? threats.criticalCveCount ?? 0;
    const high = threats.uniqueHighCveCount ?? threats.highCveCount ?? 0;

    // Don't show if everything is green
    if (secScore >= 80 && critical === 0 && high === 0) return null;

    const urgentAction = actions.find(a => a.urgency === 'critical' || a.urgency === 'urgent') || actions[0];
    const cleanOrbTitle = (t) => (t || '')
      .replace(/\s+on\s+\d+\s+devices?\.?$/i, '')
      .replace(/Remediate compliance gap:\s*/i, 'Fix compliance: ')
      .replace(/LowComplianceScore/g, 'Low compliance score')
      .replace(/NonCompliantDevice/g, 'Non-compliant devices')
      .replace(/MissingEncryption/g, 'Missing encryption')
      .replace(/StaleUpdates/g, 'Stale updates')
      .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, c => c.toUpperCase());
    const actionTitle = cleanOrbTitle(urgentAction?.title);
    // Aggregate device names across all actions with the same cleaned title
    const actionDevices = urgentAction ? this.formatActionDeviceText(urgentAction) : '';

    const isGreen = ['A+','A','A-','B+','B','B-'].includes(grade);
    const isAmber = ['C+','C','C-'].includes(grade);
    const glowColor = isGreen ? '#16a34a' : isAmber ? '#d97706' : '#dc2626';
    const bgGrad = isGreen
      ? 'linear-gradient(135deg, #065f46, #047857)'
      : isAmber
      ? 'linear-gradient(135deg, #78350f, #b45309)'
      : 'linear-gradient(135deg, #7f1d1d, #dc2626)';

    let situationLine = 'Security posture below target.';
    if (critical > 0 && high > 0) situationLine = `${critical} critical, ${high} high-sev vulns detected.`;
    else if (critical > 0) situationLine = `${critical} critical ${critical !== 1 ? 'vulnerabilities' : 'vulnerability'} found.`;
    else if (high > 0) situationLine = `${high} high-severity ${high !== 1 ? 'vulnerabilities' : 'vulnerability'} found.`;

    const freshness = this.getFreshnessInfo();
    const signalText = freshness ? freshness.ageText : '';

    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;

    return html`
      <style>
        @keyframes officerPulse {
          0%, 100% { box-shadow: 0 0 16px ${glowColor}66, 0 0 32px ${glowColor}33; }
          50% { box-shadow: 0 0 28px ${glowColor}aa, 0 0 56px ${glowColor}55, 0 0 80px ${glowColor}22; }
        }
        @keyframes orbSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      </style>

      <!-- Scrim when open -->
      ${officerNoteOpen ? html`
        <div
          onClick=${() => this.setState({ officerNoteOpen: false })}
          style="position:fixed;inset:0;z-index:998;background:rgba(0,0,0,0.3);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);"
        ></div>
      ` : null}

      <!-- Floating orb -->
      <div style="position:fixed;bottom:24px;right:24px;z-index:999;">

        ${!officerNoteOpen ? html`
          <!-- Collapsed: pulsing shield orb -->
          <button
            onClick=${() => this.setState({ officerNoteOpen: true })}
            aria-label="Security Officer's Briefing"
            style="
              width: 54px; height: 54px; border-radius: 50%;
              background: ${bgGrad};
              border: 2px solid ${glowColor}88;
              color: #fff; cursor: pointer;
              display: flex; align-items: center; justify-content: center;
              animation: officerPulse 2.5s ease-in-out infinite;
              transition: transform 0.2s;
              position: relative;
            "
            onMouseEnter=${(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave=${(e) => { e.currentTarget.style.transform = ''; }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
            <!-- Badge count -->
            ${(critical + high) > 0 ? html`
              <span style="
                position:absolute; top:-4px; right:-4px;
                background:#dc2626; color:#fff;
                font-size:0.62rem; font-weight:800;
                min-width:18px; height:18px;
                display:flex; align-items:center; justify-content:center;
                border-radius:10px; padding:0 4px;
                border: 2px solid var(--tblr-body-bg, #1a1c2e);
              ">${critical + high}</span>
            ` : null}
          </button>
        ` : html`
          <!-- Expanded: briefing card -->
          <div style="
            width: min(360px, calc(100vw - 48px));
            background: linear-gradient(180deg, rgba(15,15,25,0.97), rgba(20,18,30,0.97));
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1.5px solid ${glowColor}88;
            border-radius: 16px;
            box-shadow: 0 0 40px ${glowColor}55, 0 0 80px ${glowColor}22, 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 ${glowColor}20;
            animation: orbSlideIn 0.25s ease-out;
            overflow: hidden;
          ">
            <!-- Header bar -->
            <div style="
              display:flex; align-items:center; justify-content:space-between;
              padding: 12px 16px;
              border-bottom: 1px solid rgba(255,255,255,0.08);
              background: ${glowColor}0a;
            ">
              <div style="display:flex; align-items:center; gap:8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="${glowColor}" fill="none">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
                </svg>
                <span style="font-size:0.7rem;font-weight:800;color:rgba(255,255,255,0.85);letter-spacing:0.1em;text-transform:uppercase;">Officer's Briefing</span>
                ${(() => {
                  // State-aware streak pill — mirrors daily email so portal and inbox tell the same story.
                  // 0 days: "Start a streak" invite that fades after habit forms.
                  // 1-6: 🔥 Day N badge.
                  // ≥7: 🔥 N-day streak · top 5%.
                  // Broke yesterday: 💔 fallback so user sees the lapse instead of silent reset.
                  const streak = todaysAction?.streakDays ?? 0;
                  const longest = todaysAction?.longestStreak ?? 0;
                  const lastIncIso = todaysAction?.lastStreakIncrementUtc;
                  const lastInc = lastIncIso ? new Date(lastIncIso) : null;
                  const hoursSinceLastInc = lastInc ? (Date.now() - lastInc.getTime()) / 3.6e6 : null;
                  const brokeYesterday = streak === 0 && longest > 0 && hoursSinceLastInc != null && hoursSinceLastInc > 24 && hoursSinceLastInc < 168;
                  let label = '🌱 Start a streak';
                  let title = 'Take the recommended action today to start a daily streak.';
                  if (brokeYesterday) {
                    label = `💔 Streak broken (was ${longest})`;
                    title = `Best streak: ${longest} days. Take action today to start fresh.`;
                  } else if (streak >= 7) {
                    label = `🔥 ${streak}d · top 5%`;
                    title = `${streak} consecutive weekdays acted on. You are in the top 5% of customers.`;
                  } else if (streak > 0) {
                    label = `🔥 Day ${streak}`;
                    title = `${streak} consecutive weekday${streak === 1 ? '' : 's'} acted on. Keep going.`;
                  }
                  return html`
                    <span title=${title} style="display:inline-flex;align-items:center;gap:3px;background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);border-radius:999px;padding:2px 8px;font-size:0.62rem;font-weight:800;letter-spacing:0.04em;">
                      ${label}
                    </span>
                  `;
                })()}
              </div>
              <div style="display:flex;gap:6px;">
                <button onClick=${() => this.setState({ officerNoteOpen: false })} style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:0.75rem;padding:2px 6px;">—</button>
                <button onClick=${(e) => { e.stopPropagation(); this.dismissOfficerNote(orgId); }} style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:0.75rem;padding:2px 6px;" title="Dismiss">✕</button>
              </div>
            </div>

            <!-- Grade + Situation -->
            <div style="padding:16px; text-align:center;">
              <div style="
                display:inline-flex; align-items:center; justify-content:center;
                width:64px; height:64px; border-radius:14px;
                background:${glowColor}18; border:1px solid ${glowColor}40;
                margin-bottom:10px;
              ">
                <span style="font-size:2rem;font-weight:900;color:${glowColor};line-height:1;">${grade}</span>
              </div>
              <div style="font-size:0.85rem;font-weight:600;color:rgba(255,255,255,0.88);line-height:1.4;margin-bottom:6px;">
                ${situationLine}
              </div>
              ${signalText ? html`
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.35);">Signal updated ${signalText}</div>
              ` : null}
            </div>

            <!-- Reward strip — three states mirror the daily email -->
            ${(() => {
              if (todaysAction?.yesterdayResolvedApp) {
                return html`
                  <div style="margin:0 16px 10px;background:rgba(22,163,74,0.12);border:1px solid rgba(22,163,74,0.35);border-radius:8px;padding:8px 10px;display:flex;gap:8px;align-items:flex-start;">
                    <span style="font-size:0.95rem;line-height:1;">✅</span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:0.72rem;font-weight:700;color:#86efac;line-height:1.3;">You closed ${todaysAction.yesterdayResolvedApp} yesterday</div>
                      <div style="font-size:0.64rem;color:rgba(134,239,172,0.7);margin-top:1px;">Score is moving in the right direction.</div>
                    </div>
                  </div>
                `;
              }
              if (todaysAction?.pendingAction) {
                return html`
                  <div style="margin:0 16px 10px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:8px 10px;display:flex;gap:8px;align-items:flex-start;">
                    <span style="font-size:0.95rem;line-height:1;">⏳</span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:0.72rem;font-weight:700;color:#fbbf24;line-height:1.3;">${todaysAction.pendingAction} is still pending</div>
                      <div style="font-size:0.64rem;color:rgba(251,191,36,0.7);margin-top:1px;">Closing it today will lift your score and start your streak.</div>
                    </div>
                  </div>
                `;
              }
              return null;
            })()}

            <!-- Top action -->
            ${todaysAction ? html`
              <div style="margin:0 16px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                  <span style="font-size:0.6rem;font-weight:700;color:#fff;background:${glowColor};padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.05em;">
                    🎯 Today’s action · 2 min
                  </span>
                  ${todaysAction.hasKev ? html`
                    <span style="font-size:0.58rem;font-weight:800;color:#fecaca;background:rgba(220,38,38,0.18);border:1px solid rgba(220,38,38,0.45);padding:2px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:0.04em;">
                      🚨 KEV
                    </span>
                  ` : null}
                </div>
                <div style="font-size:0.92rem;font-weight:700;color:rgba(255,255,255,0.95);word-break:break-word;line-height:1.3;">${todaysAction.title || todaysAction.appName}</div>
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.55);margin-top:3px;">
                  ${this.formatActionDeviceText(todaysAction)}
                </div>

                ${todaysAction.whyItMatters ? html`
                  <div style="margin-top:10px;">
                    <div style="font-size:0.6rem;font-weight:800;color:rgba(255,255,255,0.45);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px;">Why it matters</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.78);line-height:1.45;">${todaysAction.whyItMatters}</div>
                  </div>
                ` : null}

                ${todaysAction.remediationSteps && todaysAction.remediationSteps.length ? html`
                  <div style="margin-top:10px;">
                    <div style="font-size:0.6rem;font-weight:800;color:rgba(255,255,255,0.45);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px;">How to fix</div>
                    <ol style="margin:0;padding-left:18px;font-size:0.7rem;color:rgba(255,255,255,0.78);line-height:1.5;">
                      ${todaysAction.remediationSteps.slice(0, 3).map(step => html`<li style="margin-bottom:2px;">${step}</li>`)}
                    </ol>
                  </div>
                ` : (todaysAction.whatToDo ? html`
                  <div style="margin-top:10px;">
                    <div style="font-size:0.6rem;font-weight:800;color:rgba(255,255,255,0.45);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:3px;">How to fix</div>
                    <div style="font-size:0.72rem;color:rgba(255,255,255,0.78);line-height:1.45;">${todaysAction.whatToDo}</div>
                  </div>
                ` : null)}

                ${todaysAction.riskReductionPct > 0 ? html`
                  <div style="margin-top:10px;font-size:0.65rem;color:rgba(134,239,172,0.85);font-weight:600;">
                    Expected score lift: +${todaysAction.riskReductionPct} pts
                  </div>
                ` : null}
              </div>
            ` : (urgentAction ? html`
              <div style="margin:0 16px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="font-size:0.6rem;font-weight:700;color:#d97706;background:rgba(217,119,6,0.12);border:1px solid rgba(217,119,6,0.25);padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em;">
                    ${(urgentAction.urgency || 'action').toUpperCase()}
                  </span>
                </div>
                <div style="font-size:0.8rem;font-weight:600;color:rgba(255,255,255,0.88);word-break:break-word;">${actionTitle}</div>
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.45);margin-top:4px;">${actionDevices}</div>
              </div>
            ` : null)}

            <!-- Footer links -->
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 16px 14px;">
              <a href="#!/security" style="font-size:0.74rem;font-weight:600;color:${glowColor};text-decoration:none;">Full Report →</a>
              <button
                onClick=${() => {
                  this.setState({ officerNoteOpen: false, aiPrompt: 'What should I fix first?' });
                  setTimeout(() => this.submitAiPrompt({ preventDefault: () => {} }), 100);
                }}
                style="font-size:0.74rem;font-weight:600;color:#818cf8;background:none;border:none;cursor:pointer;"
              >Ask MAGI</button>
            </div>
          </div>
        `}
      </div>
    `;
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
    const critical = threats.uniqueCriticalCveCount ?? threats.criticalCveCount ?? 0;
    const high = threats.uniqueHighCveCount ?? threats.highCveCount ?? 0;
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

    // Use structured device fields from API; prefer affectedDeviceNames when available
    const apiDeviceId = urgentAction?.primaryDeviceId || null;
    const apiDeviceName = urgentAction?.primaryDeviceName || null;
    const apiDeviceNames = Array.isArray(urgentAction?.affectedDeviceNames)
      ? urgentAction.affectedDeviceNames.filter(Boolean)
      : [];
    const displayDeviceName = apiDeviceNames[0] || apiDeviceName;
    const apiDeviceCount = urgentAction?.deviceCount != null
      ? urgentAction.deviceCount
      : (apiDeviceNames.length > 0 ? apiDeviceNames.length : actionDeviceCount);

    let targetDeviceLine = '';
    let targetDeviceNode = null;
    if (displayDeviceName && apiDeviceCount === 1) {
      const deviceHref = apiDeviceId ? `#!/devices/${apiDeviceId}` : '#!/devices';
      targetDeviceNode = html`<a href=${deviceHref} style="font-size:0.72rem;color:rgba(255,255,255,0.65);text-decoration:underline;text-underline-offset:2px;">${displayDeviceName}</a>`;
    } else if (apiDeviceCount > 1 && displayDeviceName) {
      const extra = apiDeviceCount - 1;
      targetDeviceNode = html`<span style="font-size:0.72rem;color:rgba(255,255,255,0.55);">${displayDeviceName} and ${extra} more</span>`;
    } else if (apiDeviceCount > 0) {
      targetDeviceLine = `Targets ${apiDeviceCount} device${apiDeviceCount === 1 ? '' : 's'}.`;
    }

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
      situationText = `${critical} critical · ${high} high CVE${critical + high === 1 ? '' : 's'} need patching.`;
    } else if (critical > 0) {
      situationText = `${critical} critical CVE${critical !== 1 ? 's' : ''} require immediate attention.`;
    } else if (high > 0) {
      situationText = `${high} high-severity CVE${high !== 1 ? 's' : ''} detected across your fleet.`;
    } else {
      situationText = `Security posture is below target threshold.`;
    }

    // Styled version with severity color dots for display only
    const situationNode = (critical > 0 && high > 0)
      ? html`Immediate Attention: <span style="color:#ff6b6b; font-size:0.65rem;">●</span> <strong>${critical} critical</strong> · <span style="color:#ffa94d; font-size:0.65rem;">●</span> <strong>${high} high</strong> CVEs need patching.`
      : (critical > 0)
      ? html`Immediate Attention: <span style="color:#ff6b6b; font-size:0.65rem;">●</span> <strong>${critical} critical</strong> CVE${critical !== 1 ? 's' : ''}.`
      : (high > 0)
      ? html`Immediate Attention: <span style="color:#ffa94d; font-size:0.65rem;">●</span> <strong>${high} high</strong> CVE${high !== 1 ? 's' : ''}.`
      : html`Security posture is below target threshold.`;

    const freshness = this.getFreshnessInfo();
    const signalUpdatedText = freshness ? freshness.ageText : 'unknown';
    const { signalLine, tooltips } = buildOfficerNoteStatusCopy({
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
                <div style="font-size: 0.72rem; color: rgba(255,255,255,0.35); line-height: 1.4;" title="${tooltips?.signal || ''}">
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
              <div style="color:#111827;font-size:0.95rem;font-weight:600;">Summoning MAGI...</div>
              <div style="color:#6b7280;font-size:0.82rem;margin-top:4px;">Preparing your readiness Dossier.</div>
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
      <div class="dashboard-api-reveal" style="min-height: calc(100vh - 120px); display: flex; flex-direction: column;">
        ${this.renderBillingNoticeBanner()}
        ${this.state.data?.evidence && rewindContext.isActive?.() ? html`
          <div class="container-xl pt-3">
            ${EvidenceBanner({ evidence: this.state.data.evidence, pageName: 'dashboard' })}
          </div>
        ` : null}
        ${this.isBootstrapState() ? this.renderBootstrapSetup() : html`
          ${this.renderSearchHeader()}
          ${this.renderOfficerOrb()}
        `}
      </div>
    `;
  }

  /**
   * Bootstrap state: org has no enrolled devices yet. Backend sets
   * healthScore.isBootstrap=true and returns zeroed pillar scores. Suppress the
   * synthesized 70/C tile and the 5 sub-pillar cards (they read as "you're
   * failing" on a brand-new account) in favour of a single Setup card.
   */
  isBootstrapState() {
    const data = this.state.data;
    if (!data) return false;
    if (data.healthScore?.isBootstrap === true) return true;
    // Secondary signal — no quickStats devices at all.
    const coverage = data.quickStats?.coverage || data.itAdmin?.coverage || {};
    const totalCov = Number(coverage.total) || 0;
    const fleet = this.getFleetStats(data);
    return totalCov <= 0 && (fleet?.total ?? 0) <= 0;
  }

  renderBootstrapSetup() {
    const data = this.state.data || {};
    const orgLabel = data.orgName || data.org?.name || 'your organization';
    const installUrl = '#!/devices';
    return html`
      <div style="width:100vw;position:relative;left:50%;right:50%;margin-left:-50vw;margin-right:-50vw;background:var(--tblr-body-bg,#f4f6fa);padding:32px 16px 48px;">
        <div style="max-width:720px;margin:0 auto;">
          <!-- Hero -->
          <div style="background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);color:#fff;border-radius:16px;padding:28px 32px;box-shadow:0 8px 28px rgba(30,58,138,0.18);">
            <div style="font-size:0.72rem;letter-spacing:0.12em;font-weight:700;text-transform:uppercase;opacity:0.85;">Welcome to MagenSec</div>
            <h1 style="margin:8px 0 4px;font-size:1.75rem;font-weight:700;line-height:1.2;">Setup pending — add your first device</h1>
            <p style="margin:0;font-size:0.95rem;opacity:0.9;max-width:520px;">MagenSec needs at least one enrolled device in <strong>${orgLabel}</strong> before MAGI can start scoring your posture, scanning apps, and producing your daily security action.</p>
          </div>

          <!-- Steps -->
          <div style="margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:24px 28px;">
            <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:#475569;margin-bottom:12px;">How to get started</div>
            <ol style="margin:0;padding-left:22px;color:#1e293b;font-size:0.95rem;line-height:1.7;">
              <li>Open the <a href=${installUrl} style="color:#2563eb;text-decoration:none;font-weight:600;">Devices</a> page and click <strong>Add device</strong>.</li>
              <li>Download the MagenSec installer for your platform.</li>
              <li>Run it on the device you want to monitor — no admin rights required.</li>
              <li>MAGI will pick up the first heartbeat within 5 minutes and start scoring.</li>
            </ol>
            <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
              <a href=${installUrl} class="btn btn-primary btn-pill px-4" style="background:#0f172a;border-color:#0f172a;color:#fff;font-weight:700;">Add your first device →</a>
              <a href="#!/ai-chat" class="btn btn-outline-secondary btn-pill px-4" style="font-weight:600;">Ask Officer MAGI</a>
            </div>
          </div>

          <!-- Why no score -->
          <div style="margin-top:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px 24px;color:#475569;font-size:0.85rem;line-height:1.6;">
            <strong style="color:#0f172a;">Why don't I see a score?</strong> Scores are computed from device telemetry (apps installed, patch level, heartbeat freshness, compliance controls). Until at least one device checks in, we'd be making numbers up — and that's not what MAGI does.
          </div>
        </div>
      </div>
    `;
  }
}
