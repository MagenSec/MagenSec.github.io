/**
 * ChatDrawer — Floating AI Analyst panel
 *
 * A sticky bottom-right sliding panel that provides quick access to the AI Analyst
 * without leaving the current page.
 *
 * Props:
 *   contextHint {string} — Optional context hint sent as structured chat context (e.g. "compliance posture and gaps")
 *   persona     {string} — Optional persona key that selects Officer MAGI's behavioral mode.
 *                          Allowed values: ciso, it_admin, auditor, threat_hunter,
 *                          compliance_officer, business_owner, cyber_insurance, secops.
 *                          When set the AI's system prompt, context selection, and framing
 *                          automatically match the caller's role. Omit for general-purpose mode.
 *
 * Uses the same POST /api/v1/orgs/{orgId}/ai-analyst/ask endpoint as the home page search bar.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { magiContext } from '@magiContext';
import { CveDetailsModal } from '@components/CveDetailsModal.js';
import { DeviceQuickViewModal } from '@components/DeviceQuickViewModal.js';
import { AppDevicesModal } from '@components/AppDevicesModal.js';

const { html, Component } = window;
const BUSINESS_ONLY_TOOLTIP = 'Feature available in Business License only';

function _generateConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function _downloadMarkdown(text, filenameBase) {
  try {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const blob = new Blob([text || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase || 'magi-response'}-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (err) {
    console.error('[ChatDrawer] markdown download failed', err);
  }
}

function renderMarkdown(text) {
    if (!text) return '';
    let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
    return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

export class ChatDrawer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      open: false,
      prompt: '',
      loading: false,
      messages: [],    // { role: 'user'|'assistant', text: string }
      error: null,
      modalDeviceId: null,
      modalCveId: null,
      modalAppName: null,
      conversationId: _generateConversationId(),
      pageCtx: magiContext.get()
    };
    this.inputRef = null;
    this._magiUnsub = null;
  }

  componentDidMount() {
    this._magiUnsub = magiContext.subscribe((ctx) => {
      this.setState({ pageCtx: { ...ctx } });
    });
  }

  componentWillUnmount() {
    if (this._magiUnsub) { this._magiUnsub(); this._magiUnsub = null; }
  }

  toggle = () => {
    this.setState(s => {
      const nowOpen = !s.open;
      if (nowOpen) {
        setTimeout(() => { if (this.inputRef) this.inputRef.focus(); }, 150);
        // Seed an opening greeting so the chat always has an intro.
        // 1. Page-specific snapshot greeting (registered via magiContext.set)
        // 2. Generic greeting derived from the contextHint prop
        if (!s.messages || s.messages.length === 0) {
          const ctx = magiContext.get();
          const { contextHint } = this.props;
          let greeting = ctx.greeting;
          if (!greeting) {
            greeting = contextHint
              ? `Hi — I'm MAGI. I have your **${contextHint}** loaded. Ask me anything about it, or for guidance on what to do next.`
              : 'Hi — I\'m MAGI, your AI security officer. Ask me about threats, compliance, devices, or what to do next.';
          }
          return { open: true, messages: [{ role: 'system', text: greeting }] };
        }
      }
      return { open: nowOpen };
    });
  };

  handleInput = (e) => {
    this.setState({ prompt: e?.target?.value ?? '' });
  };

  handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.submit();
    }
    if (e.key === 'Escape') {
      this.setState({ open: false });
    }
  };

  submit = async () => {
    const { prompt, loading } = this.state;
    const text = (prompt || '').trim();
    if (!text || loading) return;

    const user = auth.getUser();
    const currentOrg = orgContext.getCurrentOrg();
    const orgId = currentOrg?.orgId || user?.email;
    if (!orgId) return;

    const { contextHint } = this.props;
    const routeHash = (window.location.hash || '').split('?')[0] || '';
    const pageCtx = magiContext.get();
    const requestContext = {
      hint: pageCtx.hint || contextHint || null,
      route: routeHash || null,
      source: 'chat-drawer',
      ...(pageCtx.snapshot ? { snapshot: pageCtx.snapshot } : {})
    };

    this.setState(s => ({
      messages: [...s.messages, { role: 'user', text }],
      prompt: '',
      loading: true,
      error: null
    }));

    // Scroll to bottom after user message renders
    requestAnimationFrame(() => this.scrollToBottom());

    try {
      const asOfDate = rewindContext.isActive() ? rewindContext.getDate() : undefined;
      const { persona } = this.props;
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
      if (!answer) throw new Error('No answer in response');

      this.setState(s => ({
        messages: [...s.messages, { role: 'assistant', text: answer }],
        loading: false
      }));
    } catch (err) {
      this.setState(s => ({
        error: err?.message || 'Failed to get an answer',
        loading: false,
        messages: [...s.messages, { role: 'error', text: err?.message || 'Failed to get an answer' }]
      }));
    }

    requestAnimationFrame(() => this.scrollToBottom());
  };

  clearChat = () => {
    this.setState({ messages: [], error: null, prompt: '', conversationId: _generateConversationId() });
  };

  continueInMagi = (e) => {
    // Hand the in-place conversation off to the dedicated /analyst page so the
    // user can continue without losing turns. Falls back to a plain navigation
    // if sessionStorage is unavailable.
    try {
      const { messages, conversationId } = this.state;
      const { contextHint, persona } = this.props;
      const pageCtx = magiContext.get();
      const payload = {
        conversationId,
        messages: (messages || [])
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.text })),
        contextHint: pageCtx.hint || contextHint || null,
        persona: persona || null,
        snapshot: pageCtx.snapshot || null
      };
      sessionStorage.setItem('ai_analyst_prefill_messages', JSON.stringify(payload));
    } catch (_) { /* ignore — link still navigates */ }
  };

  downloadResponse = (text) => {
    const { contextHint } = this.props;
    const slug = (contextHint || 'magi').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'magi';
    _downloadMarkdown(text, `${slug}-response`);
  };

  scrollToBottom() {
    const el = document.getElementById('chat-drawer-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  handlePortalLinkClick = (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#!/devices/')) {
      e.preventDefault(); e.stopPropagation();
      this.setState({ modalDeviceId: href.slice('#!/devices/'.length) });
    } else if (href.startsWith('#!/cves/')) {
      e.preventDefault(); e.stopPropagation();
      this.setState({ modalCveId: href.slice('#!/cves/'.length) });
    } else if (href.startsWith('#!/apps/')) {
      e.preventDefault(); e.stopPropagation();
      this.setState({ modalAppName: decodeURIComponent(href.slice('#!/apps/'.length)) });
    }
  };

  renderToggleButton() {
    const { open } = this.state;
    return html`
      <button
        onClick=${this.toggle}
        title="${open ? 'Close Analyst' : 'Ask 🛡️MAGI'}"
        style="
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #fff;
          box-shadow: 0 4px 16px rgba(99,102,241,0.4);
          cursor: pointer;
          z-index: 1050;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
        "
      >
        ${open
          ? html`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>`
          : html`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>`}
      </button>
    `;
  }

  renderPanel() {
    const { open, prompt, loading, messages, pageCtx } = this.state;
    const { contextHint } = this.props;
    const isPersonalOrg = orgContext.getCurrentOrg()?.type === 'Personal';
    const effectiveHint = (pageCtx && pageCtx.hint) || contextHint;
    const fullChatHref = effectiveHint
      ? `#!/analyst?ctx=${encodeURIComponent(effectiveHint)}`
      : '#!/analyst';

    return html`
      <div
        class="magi-chat-panel"
        style="
          position: fixed;
          bottom: 88px;
          right: 24px;
          width: 500px;
          max-width: calc(100vw - 48px);
          height: 560px;
          max-height: calc(100vh - 120px);
          border-radius: 14px;
          background: var(--magi-bg);
          color: var(--magi-text);
          box-shadow: var(--magi-shadow);
          border: 1px solid var(--magi-border);
          display: flex;
          flex-direction: column;
          z-index: 1049;
          transform: ${open ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)'};
          opacity: ${open ? '1' : '0'};
          pointer-events: ${open ? 'all' : 'none'};
          transition: transform 0.2s ease, opacity 0.2s ease;
          overflow: hidden;
        "
      >
        <!-- Header -->
        <div style="padding: 10px 14px; border-bottom: 1px solid var(--magi-border-soft); display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; background: var(--magi-header-bg); color: var(--magi-text);">
          <!-- Row 1: title + Continue link -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="var(--magi-link)" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
              <span style="font-weight: 600; font-size: 0.95rem; color: var(--magi-text); white-space: nowrap;">🛡️ MAGI</span>
            </div>
            <a
              href=${fullChatHref}
              onClick=${this.continueInMagi}
              class=${isPersonalOrg ? 'business-license-only' : ''}
              data-business-tooltip=${isPersonalOrg ? BUSINESS_ONLY_TOOLTIP : ''}
              style="color: var(--magi-link); font-size: 0.75rem; text-decoration: none; font-weight: 500; white-space: nowrap;"
              title=${isPersonalOrg ? BUSINESS_ONLY_TOOLTIP : (messages.length > 0 ? 'Continue this conversation in MAGI' : 'Open full analyst chat')}
            >
              ${messages.length > 0 ? 'Continue in MAGI →' : 'Full chat →'}
            </a>
          </div>
          <!-- Row 2: subtitle + context pill -->
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; padding-left: 26px;">
            <span style="font-size: 0.75rem; color: var(--magi-text-muted); white-space: nowrap; flex-shrink: 0;">AI Security Officer</span>
            ${rewindContext.isActive() ? html`<span style="margin-left: auto; font-size: 0.7rem; font-weight:600; color:#92400e; background:#fef3c7; padding: 1px 8px; border-radius: 999px; border: 1px solid #f59e0b;" title="Answering from ${rewindContext.getDate()} snapshot">⏪ ${rewindContext.getDate()}</span>` : ''}
            ${effectiveHint && !rewindContext.isActive() ? html`<span style="margin-left: auto; font-size: 0.7rem; color: var(--magi-pill-text); background: var(--magi-pill-bg); padding: 1px 8px; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; max-width: 70%;" title=${effectiveHint}>${effectiveHint}</span>` : ''}
          </div>
        </div>

        <!-- Messages -->
        <div
          id="chat-drawer-messages"
          onClick=${this.handlePortalLinkClick}
          style="flex: 1; overflow-y: auto; scrollbar-width: thin; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: var(--magi-msg-bg); color: var(--magi-text);"
        >
          ${messages.length === 0 ? html`
            <div style="text-align: center; color: var(--magi-empty-text); margin-top: 40px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" stroke-width="1.5" stroke="var(--magi-empty-icon)" fill="none" style="display: block; margin: 0 auto 12px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
              <div style="font-size: 0.875rem; font-weight: 500; margin-bottom: 4px; color: var(--magi-text);">Ask 🛡️MAGI (AI Security Officer)</div>
              <div style="font-size: 0.8rem;">
                ${effectiveHint
                  ? `Ask about ${effectiveHint}`
                  : 'Ask about threats, compliance, or devices'}
              </div>
            </div>
          ` : messages.map((msg) => msg.role === 'system' ? html`
            <div style="display: flex; justify-content: center; padding: 4px 0 8px;">
              <div style="
                max-width: 95%;
                padding: 10px 14px;
                border-radius: 10px;
                font-size: 0.825rem;
                line-height: 1.5;
                background: var(--magi-system-bg);
                color: var(--magi-system-text);
                border: 1px dashed var(--magi-system-border);
                text-align: left;
              ">
                <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--magi-system-label); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12.01" y2="8"/><polyline points="11 12 12 12 12 16 13 16"/></svg>
                  Page context loaded
                </div>
                <div class="chat-markdown-content" dangerouslySetInnerHTML=${{ __html: renderMarkdown(msg.text) }} />
              </div>
            </div>
          ` : html`
            <div style="display: flex; flex-direction: column; align-items: ${msg.role === 'user' ? 'flex-end' : 'flex-start'};">
              <div style="
                max-width: 85%;
                padding: 9px 13px;
                border-radius: ${msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px'};
                font-size: 0.875rem;
                line-height: 1.5;
                background: ${msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : msg.role === 'error' ? 'var(--magi-error-bg)' : 'var(--magi-assistant-bg)'};
                color: ${msg.role === 'user' ? '#fff' : msg.role === 'error' ? 'var(--magi-error-text)' : 'var(--magi-text)'};
                border: ${msg.role === 'assistant' ? '1px solid var(--magi-assistant-border)' : 'none'};
                white-space: ${msg.role === 'user' ? 'pre-wrap' : 'normal'};
                word-break: break-word;
              "
            >
              ${msg.role === 'assistant'
                ? html`<div class="chat-markdown-content" dangerouslySetInnerHTML=${{ __html: renderMarkdown(msg.text) }} />`
                : msg.text
              }
            </div>
            ${msg.role === 'assistant' ? html`
              <button
                onClick=${() => this.downloadResponse(msg.text)}
                title="Download this response as Markdown"
                aria-label="Download response as Markdown"
                style="background:none;border:none;cursor:pointer;color:var(--magi-text-muted);padding:2px 6px;margin-top:2px;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;border-radius:4px;"
                onMouseEnter=${(e) => { e.currentTarget.style.color = 'var(--magi-link)'; }}
                onMouseLeave=${(e) => { e.currentTarget.style.color = 'var(--magi-text-muted)'; }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
                Download response
              </button>
            ` : ''}
            </div>
          `)}

          ${loading ? html`
            <div style="display: flex; align-items: flex-start;">
              <div class="chat-shimmer" style="width: 85%;">
                <div class="chat-shimmer-line"></div>
                <div class="chat-shimmer-line"></div>
                <div class="chat-shimmer-line"></div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Input form -->
        <div style="padding: 10px 12px; border-top: 1px solid var(--magi-border-soft); flex-shrink: 0; background: var(--magi-input-footer-bg);">
          <div style="display: flex; gap: 8px; align-items: flex-end;">
            <input
              ref=${(el) => { this.inputRef = el; }}
              type="text"
              class="form-control form-control-sm magi-input"
              aria-label="Ask a question"
              placeholder="Ask a question…"
              value=${prompt}
              onInput=${this.handleInput}
              onKeyDown=${this.handleKeyDown}
              disabled=${loading}
              style="flex: 1; border-radius: 8px;"
            />
            <button
              onClick=${this.submit}
              disabled=${loading || !prompt.trim()}
              style="
                background: ${loading || !prompt.trim() ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #8b5cf6)'};
                border: none;
                border-radius: 8px;
                color: #fff;
                width: 34px;
                height: 34px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: ${loading || !prompt.trim() ? 'default' : 'pointer'};
                flex-shrink: 0;
                transition: opacity 0.15s;
              "
              title="Send"
            >
              ${loading
                ? html`<span class="spinner-border spinner-border-sm" style="width: 14px; height: 14px; border-width: 2px;" role="status"></span>`
                : html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="10" y1="14" x2="21" y2="3" /><path d="M21 3l-6.5 18a0.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a0.55 .55 0 0 1 0 -1l18 -6.5" /></svg>`}
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; gap: 8px;">
            <div>
              ${messages.length > 0 ? html`
                <button
                  onClick=${this.clearChat}
                  title="Clear chat"
                  style="background: none; border: none; cursor: pointer; color: var(--magi-text-muted); padding: 0; font-size: 0.7rem; text-decoration: underline;"
                >
                  Clear chat
                </button>
              ` : ''}
            </div>
            <div style="font-size: 0.7rem; color: var(--magi-footer-text); text-align: right;">
              Enter to send · Esc to close
            </div>
          </div>
        </div>
      </div>

    `;
  }

  render() {
    const { modalDeviceId, modalCveId, modalAppName } = this.state;
    const orgId = orgContext.getCurrentOrg()?.orgId;
    return html`
      <div>
        ${this.renderPanel()}
        ${this.renderToggleButton()}
        ${modalDeviceId && html`
          <${DeviceQuickViewModal}
            deviceId=${modalDeviceId}
            orgId=${orgId}
            isOpen=${true}
            onClose=${() => this.setState({ modalDeviceId: null })}
          />`}
        ${modalCveId && html`
          <${CveDetailsModal}
            cveId=${modalCveId}
            orgId=${orgId}
            isOpen=${true}
            onClose=${() => this.setState({ modalCveId: null })}
          />`}
        ${modalAppName && html`
          <${AppDevicesModal}
            appName=${modalAppName}
            orgId=${orgId}
            isOpen=${true}
            onClose=${() => this.setState({ modalAppName: null })}
          />`}
      </div>
    `;
  }
}

export default ChatDrawer;
