/**
 * UnifiedDashboard - Persona-driven security dashboard
 * Uses html`` template literals (no JSX)
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import PersonaNav from './PersonaNav.js';

const { html, Component } = window;

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
      officerNoteOpen: false,
      officerNoteDismissed: false
    };
    this._sheetDismissHandler = null;
    this._orgChangeUnsub = null;
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
  }

  componentWillUnmount() {
    if (this._orgChangeUnsub) this._orgChangeUnsub();
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

  async loadDashboard({ refresh, background } = {}) {
    try {
      const isRefresh = !!refresh;
      const isBackground = !!background;
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

      const cacheKey = `unified_dashboard_${orgId}`;

      if (!isRefresh) {
        const cached = this.getCachedDashboard(cacheKey, 30);
        if (cached?.data) {
          this.setState({
            data: cached.data,
            loading: false,
            refreshing: false,
            isRefreshingInBackground: true,
            error: null,
            refreshError: null
          });
          await this.loadDashboard({ refresh: true, background: true });
          return;
        }
      }

      let url = `/api/v1/orgs/${orgId}/dashboard?format=unified`;
      if (isRefresh) {
        url += '&refresh=true';
      } else {
        url += '&include=cached-summary';
      }

      const response = await api.get(url);

      if (!response.success) {
        throw new Error(response.message || 'Failed to load dashboard');
      }

      if (response.data) {
        this.setCachedDashboard(cacheKey, response.data);
      }

      this.setState({
        data: response.data,
        loading: false,
        refreshing: false,
        isRefreshingInBackground: false
      });
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
            <div>Refreshing cached snapshot...</div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="alert alert-warning mb-4 border-0 shadow-sm rounded-3">
        <div class="d-flex align-items-center justify-content-center gap-3">
          <div>Displaying cached snapshot. ${refreshError}</div>
          <button class="btn btn-warning btn-sm btn-pill" onClick=${() => this.refreshDashboard()}>Try Again</button>
        </div>
      </div>
    `;
  }

  renderSearchHeader() {
    const { data, aiLoading, aiAnswer, aiError, refreshing } = this.state;
    const secScore = typeof data?.securityScore?.score === 'number' ? data.securityScore.score : 0;
    const freshness = this.getFreshnessInfo();

    return html`
      <div style="
        width: 100vw;
        position: relative;
        left: 50%;
        right: 50%;
        margin-left: -50vw;
        margin-right: -50vw;
        background: var(--tblr-body-bg, #f4f6fa);
        padding: 40px 16px 44px;
        overflow: hidden;
      ">
        <!-- Decorative glow orbs -->
        <div style="position: absolute; top: -80px; right: -40px; width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%); pointer-events: none;"></div>
        <div style="position: absolute; bottom: -60px; left: -40px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%); pointer-events: none;"></div>

        <div style="max-width: 960px; margin: 0 auto; position: relative;">

          <!-- Title -->
          <div style="text-align: center; margin-bottom: 28px;">
            <h1 style="font-size: 2.6rem; font-weight: 800; letter-spacing: -1.5px; margin: 0 0 6px; line-height: 1.1;">
              <span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Magen</span><span style="color: var(--db-hero-title-color);">Sec</span>
            </h1>
            <div style="color: var(--db-faint-text); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500;">Security Intelligence Platform</div>
          </div>

          <!-- Glassmorphism KR Tiles -->
          ${this.renderConfidenceTiles()}

          <!-- AI Search bar -->
          <div style="max-width: 680px; margin: 0 auto 12px;">
            <form onSubmit=${this.submitAiPrompt}>
              <div style="
                display: flex;
                align-items: center;
                background: var(--db-glass-bg);
                backdrop-filter: blur(16px) saturate(180%);
                -webkit-backdrop-filter: blur(16px) saturate(180%);
                border: 1px solid var(--db-glass-border);
                border-radius: 50px;
                overflow: hidden;
                transition: border-color 0.2s;
                box-shadow: 0 1px 3px rgba(0,0,0,0.06);
              ">
                <span style="display: flex; align-items: center; padding: 0 10px 0 20px; color: var(--db-faintest-text); flex-shrink: 0;">
                  ${aiLoading
                    ? html`<span class="spinner-border spinner-border-sm" style="color: #6366f1; width: 16px; height: 16px; border-width: 2px;" role="status"></span>`
                    : html`<svg width="17" height="17" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>`}
                </span>
                <input
                  type="text"
                  placeholder="Ask about threats, compliance, or any device..."
                  value=${this.state.aiPrompt}
                  onInput=${this.handleAiPromptChange}
                  disabled=${aiLoading}
                  style="
                    flex: 1;
                    background: none;
                    border: none;
                    outline: none;
                    color: var(--db-input-color);
                    font-size: 0.9rem;
                    padding: 13px 8px;
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
                    padding: 0 20px;
                    height: 36px;
                    font-weight: 600;
                    font-size: 0.82rem;
                    border-radius: 40px;
                    margin: 4px;
                    cursor: ${aiLoading ? 'default' : 'pointer'};
                    opacity: ${aiLoading ? '0.6' : '1'};
                    transition: opacity 0.15s;
                    white-space: nowrap;
                  "
                >${aiLoading ? 'Thinking…' : 'Ask 🛡️MAGI'}</button>
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
                        try { sessionStorage.setItem('ai_analyst_prefill', JSON.stringify({ question: aiAnswer.question, answer: aiAnswer.answer })); } catch (_) {}
                        window.location.hash = '#!/analyst';
                      }}
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
          </div>

          <!-- Quick nav + freshness -->
          <div style="text-align: center;">
            <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center;">
              <a href="#!/security" style="font-size: 0.72rem; color: var(--db-muted-text); text-decoration: none; padding: 3px 10px; background: var(--db-pill-bg); border-radius: 20px; border: 1px solid var(--db-pill-border);">Security</a>
              <a href="#!/compliance" style="font-size: 0.72rem; color: var(--db-muted-text); text-decoration: none; padding: 3px 10px; background: var(--db-pill-bg); border-radius: 20px; border: 1px solid var(--db-pill-border);">Compliance</a>
              <a href="#!/reports" style="font-size: 0.72rem; color: var(--db-muted-text); text-decoration: none; padding: 3px 10px; background: var(--db-pill-bg); border-radius: 20px; border: 1px solid var(--db-pill-border);">Reports</a>
              <button onClick=${() => this.refreshDashboard()} style="font-size: 0.72rem; color: var(--db-muted-text); background: var(--db-pill-bg); border: 1px solid var(--db-pill-border); border-radius: 20px; padding: 3px 10px; cursor: pointer;">
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
    const activeDevices = stats.devices?.activeCount || 0;
    const totalDevices = stats.devices?.totalCount || 0;
    const offlineDevices = stats.devices?.offlineCount || 0;

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
          <div style="${glass}" onClick=${() => window.location.hash = '#!/compliance'}>
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
              ${offlineDevices > 0 ? `${offlineDevices} offline` : '✓ All healthy'}
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
        { href: '#!/compliance', label: 'Compliance' },
        { href: '#!/security',   label: 'Security' },
        { href: '#!/reports',    label: 'Reports' }
      ],
      it: [
        { href: '#!/devices',   label: 'Devices' },
        { href: '#!/inventory', label: 'Inventory' },
        { href: '#!/security',  label: 'Vulnerabilities' }
      ],
      security: [
        { href: '#!/security',    label: 'Full Analysis' },
        { href: '#!/reports',     label: 'Reports' },
        { href: '#!/analyst',     label: 'Ask 🛡️MAGI' }
      ],
      auditor: [
        { href: '#!/auditor',     label: 'Auditor Dashboard' },
        { href: '#!/audit',       label: 'Audit Log' },
        { href: '#!/compliance',  label: 'Compliance' }
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
      metricCards = [
        { label: 'Managed Devices', value: it.inventory?.totalDevices || 0,         valueColor: '#2563eb', suffix: '', sub: '' },
        { label: 'Pending Patches', value: it.deploymentStatus?.pendingUpdates || 0, valueColor: it.deploymentStatus?.pendingUpdates > 0 ? '#d97706' : '#16a34a', suffix: '', sub: '' },
        { label: 'Patched Today',   value: it.deploymentStatus?.completedToday || 0, valueColor: '#16a34a', suffix: '', sub: '' },
        { label: 'Apps Tracked',    value: it.inventory?.totalApps || 0,             valueColor: '#6366f1', suffix: '', sub: '' }
      ];
    } else if (activePersona === 'security') {
      metricCards = [
        { label: 'Critical CVEs', value: sec.criticalCveCount || 0, valueColor: sec.criticalCveCount > 0 ? '#dc2626' : '#16a34a', suffix: '', sub: '' },
        { label: 'High Severity', value: sec.highCveCount || 0,     valueColor: sec.highCveCount > 0 ? '#d97706' : '#16a34a',    suffix: '', sub: '' },
        { label: 'KEV Exploits',  value: sec.exploitCount || 0,     valueColor: sec.exploitCount > 0 ? '#ea580c' : '#16a34a',    suffix: '', sub: 'active' },
        { label: 'Risk Score',    value: 100 - (score.score || 0),  valueColor: '#6366f1', suffix: '', sub: '' }
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
        sub: a.deadlineText || a.description || ''
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

              <!-- Row 3: CTA buttons -->
              <div style="padding: 12px 16px 4px; display: flex; gap: 8px; flex-wrap: wrap;">
                ${ctaList.map((cta, i) => html`
                  <a
                    href="${cta.href}"
                    onClick=${() => { this.closePersonaSheet(); window.location.hash = cta.href.slice(1); }}
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
                `)}
              </div>

            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSecurityOfficerDrawer() {
    const { data, officerNoteOpen, officerNoteDismissed } = this.state;
    if (!data || officerNoteDismissed) return null;

    const score = data.securityScore || {};
    const threats = data.securityPro?.threatIntel || {};
    const actions = data.businessOwner?.topActions || [];

    const secScore = typeof score.score === 'number' ? score.score : 100;
    const grade = score.grade || '—';
    const critical = threats.criticalCveCount || 0;
    const high = threats.highCveCount || 0;

    // Only show when there's something to flag
    if (secScore >= 80 && critical === 0 && high === 0) return null;

    const urgentAction = actions.find(a => a.urgency === 'critical' || a.urgency === 'urgent') || actions[0];

    const isGreenGrade = ['A+','A','A-','B+','B','B-'].includes(grade);
    const isAmberGrade = ['C+','C','C-'].includes(grade);
    const gradeColor = isGreenGrade ? '#16a34a' : isAmberGrade ? '#d97706' : '#dc2626';
    const borderColor = isGreenGrade ? 'rgba(22,163,74,0.4)' : isAmberGrade ? 'rgba(217,119,6,0.4)' : 'rgba(239,68,68,0.5)';
    const bgColor = isGreenGrade ? 'rgba(22,163,74,0.08)' : isAmberGrade ? 'rgba(217,119,6,0.08)' : 'rgba(239,68,68,0.06)';

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
      ? html`<span style="color:#ff6b6b; font-size:0.65rem;">●</span> <strong>${critical} critical</strong> · <span style="color:#ffa94d; font-size:0.65rem;">●</span> <strong>${high} high</strong> vulnerabilities require immediate remediation.`
      : (critical > 0)
      ? html`<span style="color:#ff6b6b; font-size:0.65rem;">●</span> <strong>${critical} critical</strong> CVE${critical !== 1 ? 's' : ''} require immediate attention.`
      : (high > 0)
      ? html`<span style="color:#ffa94d; font-size:0.65rem;">●</span> <strong>${high} high-severity</strong> CVE${high !== 1 ? 's' : ''} detected across your fleet.`
      : html`Security posture is below target threshold.`;

    const freshness = this.getFreshnessInfo();
    const updatedText = freshness ? freshness.ageText : 'No scans yet';

    const glowAnim = isGreenGrade ? 'gradeGlowGreen' : isAmberGrade ? 'gradeGlowAmber' : 'gradeGlowRed';

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
            opacity: ${officerNoteOpen ? '1' : '0'};
            pointer-events: ${officerNoteOpen ? 'all' : 'none'};
          "
        ></div>

        <!-- In-flow relative wrapper -->
        <div style="position: relative; z-index: 200; max-width: 640px; margin: 0 auto;">

        <!-- Dark glassmorphism collapsed tab -->
        <div
          onClick=${() => this.setState({ officerNoteOpen: !officerNoteOpen })}
          style="
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 10px 40px;
            cursor: pointer;
            user-select: none;
            background: rgba(15,15,25,0.95);
            backdrop-filter: blur(16px) saturate(160%);
            -webkit-backdrop-filter: blur(16px) saturate(160%);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: ${officerNoteOpen ? '14px 14px 0 0' : '14px'};
            transition: border-radius 0.3s ease;
          "
        >
          <!-- Decorative slash -->
          <span style="color: ${gradeColor}; opacity: 0.35; font-weight: 300; font-size: 1.1rem; line-height: 1;">/</span>

          <!-- Shield icon -->
          <svg width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="${gradeColor}" fill="none" style="flex-shrink: 0; opacity: 0.8;">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
            <path d="M9 12l2 2l4-4"/>
          </svg>

          <!-- Title text -->
          <span style="font-size: 0.68rem; font-weight: 700; color: rgba(255,255,255,0.55); letter-spacing: 0.12em; text-transform: uppercase;">Security Officer's Note</span>

          <!-- Chevron -->
          <svg
            width="13" height="13" viewBox="0 0 24 24" stroke-width="2.5"
            stroke="rgba(255,255,255,0.35)" fill="none"
            style="transition: transform 0.3s ease; transform: rotate(${officerNoteOpen ? '180' : '0'}deg);"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>

          <!-- Decorative backslash -->
          <span style="color: ${gradeColor}; opacity: 0.35; font-weight: 300; font-size: 1.1rem; line-height: 1;">\\</span>

          <!-- Dismiss X -->
          <button
            onClick=${(e) => { e.stopPropagation(); this.setState({ officerNoteDismissed: true }); }}
            style="
              position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
              background: none; border: none; color: rgba(255,255,255,0.2); cursor: pointer;
              font-size: 0.85rem; line-height: 1; padding: 2px 4px;
              transition: color 0.15s;
            "
            title="Dismiss"
          >✕</button>
        </div>

        <!-- Expanded body: absolute overlay below tab -->
        <div style="
          position: absolute; top: 100%; left: 0; right: 0;
          max-height: ${officerNoteOpen ? '560px' : '0'};
          overflow: hidden;
          transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 200;
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
              <div style="display: flex; justify-content: center; padding: 16px 16px 10px;">
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
              <div style="text-align: center; padding: 0 16px 6px;">
                <div style="font-size: 0.88rem; font-weight: 600; color: rgba(255,255,255,0.88); line-height: 1.4; margin-bottom: 6px;">
                  ${situationNode}
                </div>
                <div style="font-size: 0.72rem; color: rgba(255,255,255,0.35);">
                  · Score ${secScore}/100 · Updated ${updatedText}
                </div>
              </div>

              <!-- Urgent action card (full width) -->
              ${urgentAction ? html`
                <div style="margin: 10px 16px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 12px; text-align: center;">
                  <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
                    <span style="
                      flex-shrink: 0;
                      font-size: 0.62rem; font-weight: 700;
                      color: #d97706; background: rgba(217,119,6,0.12);
                      border: 1px solid rgba(217,119,6,0.25);
                      padding: 1px 6px; border-radius: 4px;
                      text-transform: uppercase; letter-spacing: 0.04em;
                    ">${urgentAction.urgency || 'action'}</span>
                    <div style="font-size: 0.83rem; font-weight: 600; color: rgba(255,255,255,0.88);">${urgentAction.title}</div>
                  </div>
                  ${urgentAction.description ? html`<div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">${urgentAction.description}</div>` : ''}
                  ${urgentAction.deadlineText ? html`<div style="font-size: 0.72rem; color: rgba(255,255,255,0.4); margin-top: 2px;">${urgentAction.deadlineText}</div>` : ''}
                </div>
              ` : ''}

              <!-- Footer links — centered -->
              <div style="display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; padding: 8px 16px 14px;">
                <a href="#!/security" style="font-size: 0.76rem; font-weight: 600; color: ${gradeColor}; text-decoration: none;">Full Security Report →</a>
                <button
                  onClick=${() => {
                    const postureSummary = 'Security grade: ' + grade + ' (score ' + secScore + '/100). ' + situationText + ' Please explain our current security posture in brief and provide up to 5 prioritized action items to improve it.';
                    try { sessionStorage.setItem('ai_analyst_prefill_prompt', postureSummary); } catch (_) {}
                    this.setState({ officerNoteOpen: false });
                    window.location.hash = '#!/analyst';
                  }}
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
        <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 70vh;">
          <div style="
            width: 48px; height: 48px; border-radius: 50%;
            border: 3px solid rgba(99,102,241,0.2);
            border-top-color: #6366f1;
            animation: spin 0.8s linear infinite;
            margin-bottom: 16px;
          "></div>
          <div style="color: var(--tblr-secondary, #888); font-size: 0.9rem;">Loading intelligence...</div>
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
        ${this.renderSecurityOfficerDrawer()}
        ${this.renderRefreshBanner()}
        ${this.renderSearchHeader()}
        <${PersonaNav} activePersona=${this.state.activePersona} onPersonaChange=${this.handlePersonaChange} />
        ${this.renderPersonaSheet()}
      </div>
    `;
  }
}
