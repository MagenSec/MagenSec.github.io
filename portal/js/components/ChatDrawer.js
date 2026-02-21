/**
 * ChatDrawer — Floating AI Analyst panel
 *
 * A sticky bottom-right sliding panel that provides quick access to the AI Analyst
 * without leaving the current page.
 *
 * Props:
 *   contextHint {string} — Optional context hint prepended to queries (e.g. "compliance posture and gaps")
 *
 * Uses the same POST /api/v1/orgs/{orgId}/ai-analyst/ask endpoint as the home page search bar.
 */

import { api } from '@api';
import { auth } from '@auth';
import { orgContext } from '@orgContext';
import { CveDetailsModal } from '@components/CveDetailsModal.js';
import { DeviceQuickViewModal } from '@components/DeviceQuickViewModal.js';
import { AppDevicesModal } from '@components/AppDevicesModal.js';

const { html, Component } = window;

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
      modalAppName: null
    };
    this.inputRef = null;
  }

  toggle = () => {
    this.setState(s => {
      const nowOpen = !s.open;
      if (nowOpen) {
        // Focus input on next tick
        setTimeout(() => {
          if (this.inputRef) this.inputRef.focus();
        }, 150);
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

    // Build effective question (optionally prefixed with context hint)
    const { contextHint } = this.props;
    const effectiveQuestion = contextHint
      ? `[Context: ${contextHint}] ${text}`
      : text;

    this.setState(s => ({
      messages: [...s.messages, { role: 'user', text }],
      prompt: '',
      loading: true,
      error: null
    }));

    // Scroll to bottom after user message renders
    requestAnimationFrame(() => this.scrollToBottom());

    try {
      const response = await api.askAIAnalyst(orgId, { question: effectiveQuestion, responseMode: 'brief' });
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
    this.setState({ messages: [], error: null, prompt: '' });
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
        title="${open ? 'Close AI Analyst' : 'Ask AI Analyst'}"
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
    const { open, prompt, loading, messages } = this.state;
    const { contextHint } = this.props;

    return html`
      <div
        style="
          position: fixed;
          bottom: 88px;
          right: 24px;
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 520px;
          max-height: calc(100vh - 120px);
          border-radius: 12px;
          background: var(--tblr-bg-surface, #fff);
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          border: 1px solid var(--tblr-border-color, #e6e7e9);
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
        <div style="padding: 14px 16px; border-bottom: 1px solid var(--tblr-border-color, #e6e7e9); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="#6366f1" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
            <span style="font-weight: 600; font-size: 0.9rem;">AI Analyst</span>
            ${contextHint ? html`<span style="font-size: 0.75rem; color: var(--tblr-secondary, #666); background: var(--tblr-bg-surface-secondary, #f8f9fa); padding: 2px 8px; border-radius: 999px;">${contextHint}</span>` : ''}
          </div>
          <div style="display: flex; gap: 4px;">
            ${messages.length > 0 ? html`
              <button
                onClick=${this.clearChat}
                title="Clear chat"
                style="background: none; border: none; cursor: pointer; color: var(--tblr-secondary, #888); padding: 4px 6px; border-radius: 4px; font-size: 0.75rem;"
              >
                Clear
              </button>
            ` : ''}
            <a href="#!/analyst" style="background: none; border: none; cursor: pointer; color: var(--tblr-secondary, #888); padding: 4px 6px; border-radius: 4px; font-size: 0.75rem; text-decoration: none;" title="Open full analyst chat">
              Full chat →
            </a>
          </div>
        </div>

        <!-- Messages -->
        <div
          id="chat-drawer-messages"
          onClick=${this.handlePortalLinkClick}
          style="flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px;"
        >
          ${messages.length === 0 ? html`
            <div style="text-align: center; color: var(--tblr-secondary, #888); margin-top: 40px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" stroke-width="1.5" stroke="#c4b5fd" fill="none" style="display: block; margin: 0 auto 12px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
              <div style="font-size: 0.875rem; font-weight: 500; margin-bottom: 4px;">Ask the AI Analyst</div>
              <div style="font-size: 0.8rem;">
                ${contextHint
                  ? `Ask about ${contextHint}`
                  : 'Ask about threats, compliance, or devices'}
              </div>
            </div>
          ` : messages.map((msg) => html`
            <div style="display: flex; flex-direction: column; align-items: ${msg.role === 'user' ? 'flex-end' : 'flex-start'};">
              <div style="
                max-width: 85%;
                padding: 8px 12px;
                border-radius: ${msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px'};
                font-size: 0.875rem;
                line-height: 1.5;
                background: ${msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : msg.role === 'error' ? 'var(--tblr-danger-lt, #fce)' : 'var(--tblr-bg-surface-secondary, #f0f1ff)'};
                color: ${msg.role === 'user' ? '#fff' : msg.role === 'error' ? 'var(--tblr-danger, #d63939)' : 'inherit'};
                white-space: ${msg.role === 'user' ? 'pre-wrap' : 'normal'};
                word-break: break-word;
              "
            >
              ${msg.role === 'assistant'
                ? html`<div class="chat-markdown-content" dangerouslySetInnerHTML=${{ __html: renderMarkdown(msg.text) }} />`
                : msg.text
              }
            </div>
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
        <div style="padding: 10px 12px; border-top: 1px solid var(--tblr-border-color, #e6e7e9); flex-shrink: 0;">
          <div style="display: flex; gap: 8px; align-items: flex-end;">
            <input
              ref=${(el) => { this.inputRef = el; }}
              type="text"
              class="form-control form-control-sm"
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
                background: ${loading || !prompt.trim() ? 'var(--tblr-secondary, #ccc)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)'};
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
          <div style="font-size: 0.7rem; color: var(--tblr-secondary, #999); margin-top: 4px; text-align: right;">
            Enter to send · Esc to close
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
