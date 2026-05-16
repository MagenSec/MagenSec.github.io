/**
 * MAGIOfficer — the calm Security Officer.
 *
 * Display rules (binding from Charter):
 * - MAGI is a Security Officer, NEVER a chatbot, NEVER a search bar.
 * - Calm voice: declarative, evidence-first, no exclamation marks, no emoji,
 *   no "Hi! 😊" energy. Speaks like the senior partner at a security firm.
 * - Always says: Situation → What I noticed → What I recommend → optional Ask.
 * - Two surfaces:
 *     1. Band  — slim top-right strip on every page. Status + 1-line narration.
 *     2. Drawer — slide-in from right when band is clicked. Full briefing
 *                 + live Q&A with the AI Analyst (askAIAnalyst endpoint).
 *
 * Status states:
 *   watching         — passive monitoring, no current concern
 *   briefing-ready   — I have a briefing for you (badge dot)
 *   investigating    — actively analyzing (subtle pulse)
 *   time-warped      — historical view (purple)
 *
 * Usage on a page:
 *   <${MAGIOfficerBand} status=${...} narration=${...} onOpen=${...} />
 *   <${MAGIOfficerDrawer} isOpen=${...} briefing=${...} pageContext=${...}
 *                          onClose=${...} persona=${...} />
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';

const { html, Component } = window;

function _renderMarkdown(text) {
    if (!text) return '';
    const parsed = window.marked ? window.marked.parse(text) : String(text).replace(/\n/g, '<br>');
    return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

function _newConversationId() {
    return `magi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Band: top-right strip, sticky.
// ---------------------------------------------------------------------------

// Charter binding: MAGI is calm intelligence (perceptive, trustworthy, never alert).
// Palette stays in the cool indigo/violet family — amber/rust read as "warning"
// and broke the "senior partner at a security firm" voice.
const STATUS_STYLE = {
    watching:        { tone: '#4338ca', accent: 'rgba(79,70,229,0.10)',   pulse: false, label: 'Officer MAGI · Watching' },
    'briefing-ready':{ tone: '#4f46e5', accent: 'rgba(99,102,241,0.16)',  pulse: false, label: 'Officer MAGI · Briefing ready' },
    investigating:   { tone: '#5b21b6', accent: 'rgba(124,58,237,0.16)',  pulse: true,  label: 'Officer MAGI · Reviewing' },
    'time-warped':   { tone: '#7c3aed', accent: 'rgba(124,58,237,0.18)',  pulse: false, label: 'Officer MAGI · Time-warped' },
    locked:          { tone: '#64748b', accent: 'rgba(100,116,139,0.14)', pulse: false, label: 'Officer MAGI · Add-on locked' }
};

export function MAGIOfficerBand({
    status = 'watching',
    narration = '',
    onOpen = null,
    ctaLabel = 'Open briefing',
    ariaLabel = null
} = {}) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.watching;
    const interactive = typeof onOpen === 'function';
    const resolvedAriaLabel = ariaLabel || (interactive ? 'Open Officer MAGI briefing' : 'Officer MAGI status');

    return html`
        <div class=${`v7-magi-band ${interactive ? 'v7-magi-band--interactive' : ''}`}
             role=${interactive ? 'button' : null}
             tabindex=${interactive ? '0' : null}
             aria-label=${resolvedAriaLabel}
             onClick=${interactive ? onOpen : null}
             onKeyDown=${interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : null}
             style=${`--v7-magi-tone:${s.tone};--v7-magi-accent:${s.accent};`}>
            <div class=${`v7-magi-band-icon ${s.pulse ? 'v7-magi-band-icon--pulse' : ''}`}>
                    <i class="ti ti-shield-check" aria-hidden="true"></i>
            </div>
            <div class="v7-magi-band-copy">
                <div class="v7-magi-band-label">
                    ${s.label}
                    ${status === 'briefing-ready' ? html`<span class="v7-magi-band-dot" aria-hidden="true"></span>` : null}
                </div>
                ${narration ? html`<div class="v7-magi-band-narration">${narration}</div>` : null}
            </div>
            ${interactive ? html`
                <span class="v7-magi-band-cta">
                    <span>${ctaLabel}</span>
                    <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </span>
            ` : null}
        </div>
    `;
}

function _firstText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.text || '';
}

function _stripDriverPrefix(text) {
    return String(text || '').replace(/^Why it moved:\s*/i, '').trim();
}

function _trajectorySentence(trajectory, delta) {
    if (!trajectory || !Number.isFinite(Number(delta))) return '';
    const points = Math.abs(Math.round(Number(delta)));
    if (points < 1) return 'Trust has held roughly steady over the comparison window.';
    if (trajectory === 'slipping') return `Trust slipped ${points} point${points === 1 ? '' : 's'} over the comparison window.`;
    if (trajectory === 'climbing' || trajectory === 'recovering') return `Trust improved ${points} point${points === 1 ? '' : 's'} over the comparison window.`;
    return 'Trust is moving within a narrow range over the comparison window.';
}

export function MAGIOfficerBriefingPanel({
    briefing = null,
    items = [],
    scoreContext = null,
    trajectory = null,
    delta = null,
    hasMagiAccess = true,
    onAsk = null,
    onOpenBriefing = null
} = {}) {
    const observations = Array.isArray(briefing?.observations) ? briefing.observations : [];
    const topItems = Array.isArray(items) ? items.slice(0, 2) : [];
    const driver = _stripDriverPrefix(scoreContext?.driver) || _firstText(observations[0]) || briefing?.situation || 'MAGI is reviewing the latest captured evidence.';
    const trajectoryCopy = _trajectorySentence(trajectory, delta);
    const defaultQuestion = 'Why did the Trust Score change today, and what should I fix first?';
    const stats = Array.isArray(scoreContext?.chips) ? scoreContext.chips.filter(Boolean).slice(0, 2) : [];
    const primaryFix = topItems[0]?.title || '';
    const summary = trajectoryCopy || driver;
    const recommendation = primaryFix
        ? `Start with ${primaryFix}.`
        : 'Open the briefing for the next best action.';
    const ask = (prompt) => {
        if (typeof onAsk === 'function') onAsk(prompt);
    };
    const openBriefing = () => {
        if (typeof onOpenBriefing === 'function') onOpenBriefing();
    };
    const askDisabled = !hasMagiAccess || typeof onAsk !== 'function';
    const briefingDisabled = !hasMagiAccess || typeof onOpenBriefing !== 'function';

    return html`
        <section class="v7-magi-briefing-card" aria-label="Ask Officer MAGI about this dashboard">
            <div class="v7-magi-briefing-header">
                <div class="v7-magi-briefing-id">
                    <span class="v7-magi-briefing-icon" aria-hidden="true"><i class="ti ti-sparkles"></i></span>
                    <div>
                        <div class="v7-magi-briefing-eyebrow">Officer MAGI · Briefing ready</div>
                        <div class="v7-magi-briefing-title">MAGI's daily read</div>
                    </div>
                </div>
                <div class="v7-magi-briefing-actions">
                    <button type="button"
                            class="btn btn-sm btn-outline-indigo v7-magi-open-briefing-btn"
                            disabled=${briefingDisabled}
                            onClick=${openBriefing}>Open briefing</button>
                </div>
            </div>

            <div class="v7-magi-briefing-summary">
                ${summary}
                <span>${recommendation}</span>
            </div>

            ${stats.length || primaryFix ? html`
                <div class="v7-magi-briefing-stats" aria-label="Trust Hub evidence MAGI will use">
                    ${stats.map((stat) => html`<span>${stat}</span>`)}
                    ${primaryFix ? html`<a href=${topItems[0]?.href || '#!/remediation'}>Open first action</a>` : null}
                </div>
            ` : null}

            <form class="v7-magi-briefing-search"
                  onSubmit=${(e) => { e.preventDefault(); ask(e.currentTarget.elements.magiQuestion.value || defaultQuestion); }}>
                <label class="v7-magi-briefing-search-label" for="trust-hub-magi-question">Ask MAGI</label>
                <div class="v7-magi-briefing-search-box">
                    <i class="ti ti-message-question" aria-hidden="true"></i>
                    <input id="trust-hub-magi-question"
                           name="magiQuestion"
                           type="text"
                           defaultValue=${defaultQuestion}
                           disabled=${askDisabled}
                           aria-label="Ask Officer MAGI about Trust Hub evidence" />
                    <button type="submit" class="btn btn-sm btn-indigo" disabled=${askDisabled}>
                        <i class="ti ti-send" aria-hidden="true"></i>
                        <span>Ask</span>
                    </button>
                </div>
            </form>
        </section>
    `;
}

// ---------------------------------------------------------------------------
// Drawer: slides in from the right with the full briefing AND a live chat.
//
// The drawer is a stateful Component so it can hold the conversation locally
// while the briefing card stays pinned at the top. Q&A goes through the same
// /api/v1/orgs/{orgId}/ai-analyst/ask endpoint as the floating ChatDrawer —
// no stubs, no "answer ships in Slice 2".
// ---------------------------------------------------------------------------

export class MAGIOfficerDrawer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            messages: [],         // [{ role: 'user'|'assistant'|'error', text }]
            prompt: '',
            sending: false,
            conversationId: _newConversationId()
        };
        this.inputRef = null;
        this.bodyRef = null;
        this._lastIsOpen = props.isOpen === true;
    }

    componentDidUpdate(prevProps) {
        // Reset conversation when the drawer is freshly opened. Keeps each
        // briefing self-contained and avoids surprise carry-over from the
        // previous page context.
        if (this.props.isOpen && !prevProps.isOpen) {
            const initialPrompt = typeof this.props.initialPrompt === 'string' ? this.props.initialPrompt : '';
            this.setState({
                messages: [],
                prompt: initialPrompt,
                sending: false,
                conversationId: _newConversationId()
            });
            // Focus the composer once the slide-in animation has settled.
            setTimeout(() => { if (this.inputRef) this.inputRef.focus(); }, 240);
        } else if (this.props.isOpen && this.props.initialPrompt && prevProps.initialPrompt !== this.props.initialPrompt) {
            this.setState({ prompt: this.props.initialPrompt });
        }
    }

    handleClose = () => {
        if (typeof this.props.onClose === 'function') this.props.onClose();
    };

    handleInput = (e) => {
        this.setState({ prompt: e?.target?.value ?? '' });
    };

    handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.submit();
        } else if (e.key === 'Escape') {
            this.handleClose();
        }
    };

    scrollBodyToBottom() {
        const el = this.bodyRef;
        if (el) el.scrollTop = el.scrollHeight;
    }

    submit = async () => {
        const text = (this.state.prompt || '').trim();
        if (!text || this.state.sending) return;

        const user = auth.getUser();
        const currentOrg = orgContext.getCurrentOrg();
        const orgId = currentOrg?.orgId || user?.email;
        if (!orgId) {
            this.setState(s => ({
                messages: [...s.messages, { role: 'error', text: 'No organization selected — cannot ask MAGI right now.' }]
            }));
            return;
        }

        const { persona, pageContext } = this.props;
        const routeHash = (window.location.hash || '').split('?')[0] || '';
        const requestContext = {
            hint: pageContext || null,
            route: routeHash || null,
            source: 'magi-officer-drawer'
        };

        // Push user turn + clear input.
        this.setState(s => ({
            messages: [...s.messages, { role: 'user', text }],
            prompt: '',
            sending: true
        }));
        requestAnimationFrame(() => this.scrollBodyToBottom());

        try {
            const asOfDate = (rewindContext.isActive && rewindContext.isActive()) ? rewindContext.getDate() : undefined;
            const response = await api.askAIAnalyst(orgId, {
                question: text,
                responseMode: 'brief',
                conversationId: this.state.conversationId,
                context: requestContext,
                ...(persona ? { persona } : {}),
                ...(asOfDate ? { asOfDate } : {})
            });
            const answer =
                response?.data?.answer ||
                response?.answer ||
                response?.data?.response ||
                response?.response ||
                null;
            if (!answer) throw new Error('MAGI did not return an answer.');

            this.setState(s => ({
                messages: [...s.messages, { role: 'assistant', text: answer }],
                sending: false
            }));
        } catch (err) {
            const msg = err?.message || 'Failed to reach MAGI. Try again in a moment.';
            this.setState(s => ({
                messages: [...s.messages, { role: 'error', text: msg }],
                sending: false
            }));
        }

        requestAnimationFrame(() => this.scrollBodyToBottom());
    };

    renderBriefing(b) {
        if (!b) return null;
        const observations = Array.isArray(b.observations) ? b.observations : [];
        const recommendations = Array.isArray(b.recommendations) ? b.recommendations : [];

        return html`
            <div class="v7-magi-drawer-briefing" style="display:flex;flex-direction:column;gap:18px;">
                ${b.situation ? html`
                    <section>
                        <div class="v7-magi-section-eyebrow">Situation</div>
                        <div class="v7-magi-section-body">${b.situation}</div>
                    </section>
                ` : null}

                ${observations.length ? html`
                    <section>
                        <div class="v7-magi-section-eyebrow">What I noticed</div>
                        <ul class="v7-magi-obs-list">
                            ${observations.map(o => html`
                                <li class="v7-magi-obs-item">
                                    <span aria-hidden="true" class="v7-magi-obs-dot"></span>
                                    <span class="v7-magi-obs-text">
                                        <span>${typeof o === 'string' ? o : o.text}</span>
                                        ${(typeof o === 'object' && o.evidence) ? html`<a href=${o.evidence} class="v7-magi-evidence-link">Evidence →</a>` : null}
                                    </span>
                                </li>
                            `)}
                        </ul>
                    </section>
                ` : null}

                ${recommendations.length ? html`
                    <section>
                        <div class="v7-magi-section-eyebrow">What I recommend</div>
                        <ol class="v7-magi-rec-list">
                            ${recommendations.map(r => html`
                                <li class="v7-magi-rec-item">
                                    ${typeof r === 'string' ? r : html`
                                        <span>${r.text}</span>
                                        ${r.href ? html`<a href=${r.href} class="v7-magi-rec-link">${r.cta || 'Open'} →</a>` : null}
                                    `}
                                </li>
                            `)}
                        </ol>
                    </section>
                ` : null}

                ${b.note ? html`
                    <div class="v7-magi-note">${b.note}</div>
                ` : null}
            </div>
        `;
    }

    renderConversation() {
        const { messages, sending } = this.state;
        if (!messages.length && !sending) return null;
        return html`
            <div class="v7-magi-convo">
                <div class="v7-magi-convo-divider">
                    <span>Conversation</span>
                </div>
                ${messages.map(msg => msg.role === 'user'
                    ? html`
                        <div class="v7-magi-msg v7-magi-msg-user">
                            <div class="v7-magi-bubble v7-magi-bubble-user">${msg.text}</div>
                        </div>
                    `
                    : msg.role === 'error'
                    ? html`
                        <div class="v7-magi-msg v7-magi-msg-assistant">
                            <div class="v7-magi-bubble v7-magi-bubble-error">
                                <i class="ti ti-alert-triangle me-1"></i>${msg.text}
                            </div>
                        </div>
                    `
                    : html`
                        <div class="v7-magi-msg v7-magi-msg-assistant">
                            <div class="v7-magi-bubble v7-magi-bubble-assistant"
                                 dangerouslySetInnerHTML=${{ __html: _renderMarkdown(msg.text) }} />
                        </div>
                    `
                )}
                ${sending ? html`
                    <div class="v7-magi-msg v7-magi-msg-assistant">
                        <div class="v7-magi-thinking">
                            <span class="v7-magi-thinking-dot"></span>
                            <span class="v7-magi-thinking-dot"></span>
                            <span class="v7-magi-thinking-dot"></span>
                            <span class="v7-magi-thinking-label">MAGI is reviewing the evidence…</span>
                        </div>
                    </div>
                ` : null}
            </div>
        `;
    }

    render() {
        const { isOpen, briefing, pageContext } = this.props;
        const { prompt, sending } = this.state;
        if (!isOpen) return null;

        const b = briefing || {};

        return html`
            <div class="v7-magi-drawer-backdrop" onClick=${this.handleClose}></div>

            <aside class="v7-magi-drawer"
                     role="dialog" aria-modal="true" aria-label="Officer MAGI briefing panel"
                   onClick=${(e) => e.stopPropagation()}>

                <span class="v7-magi-haze" aria-hidden="true"></span>

                <header class="v7-magi-drawer-header">
                    <div class="v7-magi-drawer-header-row">
                        <div class="v7-magi-drawer-header-id">
                            <div class="v7-magi-drawer-header-icon">
                                <i class="ti ti-shield-check" aria-hidden="true"></i>
                            </div>
                            <div class="v7-magi-drawer-header-titles">
                                <div class="v7-magi-drawer-header-eyebrow">Officer MAGI · Briefing</div>
                                <div class="v7-magi-drawer-header-title">${b.title || 'Today\u2019s briefing'}</div>
                                ${pageContext ? html`<div class="v7-magi-drawer-header-context">${pageContext}</div>` : null}
                            </div>
                        </div>
                        <button class="v7-magi-drawer-close" onClick=${this.handleClose} aria-label="Close briefing" type="button">
                            <i class="ti ti-x" aria-hidden="true"></i>
                        </button>
                    </div>
                </header>

                <div class="v7-magi-drawer-body" ref=${(el) => { this.bodyRef = el; }}>
                    ${this.renderBriefing(b)}
                    ${this.renderConversation()}
                </div>

                <footer class="v7-magi-drawer-footer">
                    <div class="v7-magi-drawer-ask-eyebrow">Ask Officer MAGI</div>
                    <form class="v7-magi-drawer-ask-form" onSubmit=${(e) => { e.preventDefault(); this.submit(); }}>
                        <textarea
                            ref=${(el) => { this.inputRef = el; }}
                            class="v7-magi-drawer-ask-input"
                            name="magi-ask"
                            rows="2"
                            placeholder="What blocks readiness? Why does this score look this way?"
                            aria-label="Ask Officer MAGI"
                            value=${prompt}
                            onInput=${this.handleInput}
                            onKeyDown=${this.handleKeyDown}
                            disabled=${sending}></textarea>
                        <button type="submit"
                                class="v7-magi-drawer-ask-btn"
                                disabled=${sending || !prompt.trim()}>
                            ${sending
                                ? html`<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`
                                : html`<i class="ti ti-send" aria-hidden="true"></i>`}
                            <span>${sending ? 'Reviewing' : 'Ask'}</span>
                        </button>
                    </form>
                    <div class="v7-magi-drawer-ask-hint">
                        MAGI cites evidence in answers. Treat as a senior partner, not search. <kbd>Enter</kbd> to send · <kbd>Esc</kbd> to close.
                    </div>
                </footer>
            </aside>
        `;
    }
}

// ---------------------------------------------------------------------------
// buildHubBriefing — derives a calm officer briefing from dashboard data.
// Used by Hub. Other pages provide their own briefing builders in Slice 2.
// ---------------------------------------------------------------------------

export function buildHubBriefing(data, hs = null) {
    if (!data) return null;
    // Prefer the caller-supplied health-score object (same composite the Hub displays).
    // Fall back to legacy shapes if not supplied: data.healthScore (number or object), data.securityScore.score.
    let score = null;
    let grade = null;
    if (hs && typeof hs === 'object' && Number.isFinite(Number(hs.score))) {
        score = Number(hs.score);
        grade = hs.grade || null;
    }
    if (score === null) {
        const hsRaw = data.healthScore;
        if (typeof hsRaw === 'number') score = Number(hsRaw);
        else if (hsRaw && typeof hsRaw === 'object' && Number.isFinite(Number(hsRaw.score))) {
            score = Number(hsRaw.score);
            grade = grade || hsRaw.grade || null;
        }
    }
    if (score === null && data.securityScore && Number.isFinite(Number(data.securityScore.score))) {
        score = Number(data.securityScore.score);
        grade = grade || data.securityScore.grade || null;
    }
    const threats = (data.securityPro && data.securityPro.threatIntel) || {};
    const crit = threats.uniqueCriticalCveCount ?? threats.criticalCveCount ?? 0;
    const high = threats.uniqueHighCveCount ?? threats.highCveCount ?? 0;
    const fleet = (data.quickStats && data.quickStats.devices) || {};
    const total = Number(
        fleet.totalCount
        ?? data?.quickStats?.coverage?.total
        ?? data?.itAdmin?.coverage?.total
        ?? data?.itAdmin?.inventory?.totalDevices
    ) || 0;
    const coverage = (data.quickStats && data.quickStats.coverage) || {};
    const dormant = Number(coverage.dormant) || 0;
    const ghost = Number(coverage.ghost) || 0;
    const offline = Number(coverage.offline) || (dormant + ghost);
    const compliance = (data.businessOwner && data.businessOwner.complianceCard) || {};
    const compGap = Number(compliance.gapCount) || 0;

    // Situation
    let situation;
    if (score === null || total === 0) {
        situation = 'I am still building a baseline for this organization. I will issue a full briefing once telemetry settles in.';
    } else if (score <= 20) {
        situation = `Trust posture is critical. ${total} device${total!==1?'s':''} are reporting and the picture warrants immediate action.`;
    } else if (score < 60) {
        situation = `Trust posture is fragile. ${total} device${total!==1?'s':''} are reporting; several material gaps need owners this week.`;
    } else if (score < 80) {
        situation = `Trust posture is uneven. The fleet is reporting cleanly; a small number of items still warrant attention.`;
    } else {
        situation = `Trust posture is solid. The fleet is reporting cleanly and material gaps are closed.`;
    }

    // Observations
    const observations = [];
    if (crit > 0) observations.push({ text: `${crit} critical CVE${crit!==1?'s':''} affecting unpatched software.`, evidence: '#!/vulnerabilities' });
    if (high > 0 && observations.length < 4) observations.push({ text: `${high} high-severity CVE${high!==1?'s':''} on the fleet.`, evidence: '#!/vulnerabilities' });
    if (offline > 0) observations.push({ text: `${offline} device${offline!==1?'s':''} have not checked in for over 3 days.`, evidence: '#!/devices' });
    if (compGap > 0) observations.push({ text: `${compGap} compliance control${compGap!==1?'s':''} are unsatisfied for the chosen framework.`, evidence: '#!/compliance' });
    if (!observations.length) observations.push({ text: 'No material issues stand out. I will keep watching.' });

    // Recommendations
    const recommendations = [];
    if (crit > 0) recommendations.push({ text: 'Open the Vulnerability work queue and triage criticals first.', href: '#!/vulnerabilities', cta: 'Open work queue' });
    if (offline > 0) recommendations.push({ text: 'Re-check ghosted devices; agents may need a manual restart.', href: '#!/devices', cta: 'Open fleet' });
    if (compGap > 0) recommendations.push({ text: 'Review compliance gaps and assign owners.', href: '#!/compliance', cta: 'Open compliance' });
    if (!recommendations.length) recommendations.push({ text: 'Open today’s Daily Report and share with stakeholders.', href: '#!/proof', cta: 'Open Report' });

    return {
        title: 'Today\u2019s briefing',
        situation,
        observations: observations.slice(0, 4),
        recommendations: recommendations.slice(0, 3),
        note: 'I review this view continuously. Access me from any page for a context briefing.'
    };
}

// ---------------------------------------------------------------------------
// deriveStatus — chooses the band status based on briefing severity.
// ---------------------------------------------------------------------------

export function deriveBandStatus({ score = null, hasObservations = false, isTimeWarped = false, isLoading = false } = {}) {
    if (isTimeWarped) return 'time-warped';
    if (isLoading)    return 'investigating';
    if (score !== null && score < 60) return 'briefing-ready';
    if (hasObservations) return 'briefing-ready';
    return 'watching';
}

export default MAGIOfficerBand;
