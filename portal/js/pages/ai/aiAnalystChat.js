/**
 * MAGI — Security Intelligence Chat
 *
 * Full-page chat interface for MAGI, the AI security assistant.
 * - html`` template literals (Preact/HTM pattern)
 * - marked.js + DOMPurify for markdown rendering
 * - Mermaid diagram support in AI responses
 * - Shimmer skeleton typing indicator
 * - sessionStorage pre-load from dashboard (no wasted request)
 *
 * API: POST /api/v1/orgs/{orgId}/ai-analyst/ask
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { auth } from '@auth';

const { html, Component, createRef } = window;

const SUGGESTIONS = [
    'How secure is my organization right now?',
    'Which CVEs need patching first?',
    'What are our top 5 security risks?',
    'How do we compare against CIS benchmarks?'
];

function renderMarkdown(text) {
    if (!text) return '';
    let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
    // Replace mermaid code blocks before sanitizing so mermaid.run() can pick them up
    parsed = parsed.replace(
        /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
        (_, content) => `<div class="mermaid">${content}</div>`
    );
    return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

export default class AIAnalystChatPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            messages: [],
            inputText: '',
            sending: false,
            error: null,
            conversationId: this.generateConversationId(),
            proactiveInsights: null,
            insightsLoading: true,
            insightsExpanded: null,
            quota: null
        };
        this.chatEndRef = createRef();
        this.inputRef = createRef();
        this.orgChangeListener = null;
    }

    generateConversationId() {
        return `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    componentDidMount() {
        this.orgChangeListener = orgContext.onChange(() => {
            this.setState({
                messages: [],
                conversationId: this.generateConversationId(),
                error: null,
                proactiveInsights: null,
                insightsLoading: true
            });
            this.fetchProactiveInsights();
        });

        this.fetchProactiveInsights();

        // 1. Try to hydrate from sessionStorage (pre-load from dashboard search — no extra API call)
        const prefill = this.loadPrefill();
        if (prefill) {
            this.setState({ messages: prefill.messages, conversationId: prefill.conversationId });
            return;
        }

        // 2. Check for ?q= in hash (backward compat with old "Ask Analyst" links)
        const initialQuestion = this.getInitialQuestionFromHash();
        if (initialQuestion) {
            this.setState({ inputText: initialQuestion }, () => {
                this.sendMessage(initialQuestion);
            });
            return;
        }

        // 3. Check for auto-prompt from Security Officer's Note drawer
        try {
            const autoPrompt = sessionStorage.getItem('ai_analyst_prefill_prompt');
            if (autoPrompt) {
                sessionStorage.removeItem('ai_analyst_prefill_prompt');
                setTimeout(() => this.sendMessage(autoPrompt), 100);
                return;
            }
        } catch (_) {}

        // 4. Load today's persisted session from server (resume conversation)
        this.loadChatSessionFromServer();
    }

    async loadChatSessionFromServer() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        try {
            const res = await api.get(`/api/v1/orgs/${org.orgId}/ai/chat-session`);
            if (res.success && res.data?.messages?.length > 0) {
                this.setState({
                    messages: res.data.messages,
                    conversationId: res.data.conversationId || this.generateConversationId()
                });
            }
        } catch (_) {}
    }

    async saveChatSessionToServer(messages) {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId || !messages?.length) return;
        try {
            await api.post(`/api/v1/orgs/${org.orgId}/ai/chat-session`, {
                conversationId: this.state.conversationId,
                messages,
                date: new Date().toISOString().slice(0, 10)
            });
        } catch (_) {}
    }

    async fetchProactiveInsights() {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) {
            this.setState({ insightsLoading: false });
            return;
        }
        try {
            const res = await api.get(`/api/v1/orgs/${org.orgId}/ai/proactive-insights`);
            if (res.success && res.data?.insights?.length > 0) {
                this.setState({ proactiveInsights: res.data, insightsLoading: false });
            } else {
                this.setState({ insightsLoading: false });
            }
        } catch (_) {
            this.setState({ insightsLoading: false });
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.messages.length !== this.state.messages.length) {
            this.scrollToBottom();
            if (window.mermaid) {
                requestAnimationFrame(() => {
                    try { window.mermaid.run(); } catch (_) {}
                });
            }
        }
    }

    componentWillUnmount() {
        if (this.orgChangeListener) this.orgChangeListener();
    }

    loadPrefill() {
        try {
            const raw = sessionStorage.getItem('ai_analyst_prefill');
            if (!raw) return null;
            sessionStorage.removeItem('ai_analyst_prefill');
            const { question, answer, conversationId } = JSON.parse(raw);
            if (!question || !answer) return null;
            return {
                conversationId: conversationId || this.generateConversationId(),
                messages: [
                    { id: 'prefill_q', role: 'user', content: question, timestamp: new Date().toISOString() },
                    { id: 'prefill_a', role: 'assistant', content: answer, timestamp: new Date().toISOString() }
                ]
            };
        } catch (_) {
            return null;
        }
    }

    getInitialQuestionFromHash() {
        const hash = window.location.hash || '';
        const queryIndex = hash.indexOf('?');
        if (queryIndex < 0) return '';
        const params = new URLSearchParams(hash.substring(queryIndex + 1));
        return (params.get('q') || '').trim();
    }

    scrollToBottom() {
        if (this.chatEndRef.current) {
            this.chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }

    async sendMessage(messageText) {
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) {
            this.setState({ error: 'No organization selected' });
            return;
        }

        const question = (messageText || '').trim();
        if (!question) return;

        const userMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: question,
            timestamp: new Date().toISOString()
        };

        this.setState(prev => ({
            messages: [...prev.messages, userMessage],
            inputText: '',
            sending: true,
            error: null
        }));

        try {
            const response = await api.post(`/api/v1/orgs/${org.orgId}/ai-analyst/ask`, {
                question,
                conversationId: this.state.conversationId,
                includeContext: true
            });

            if (response.success && response.data) {
                const assistantMessage = {
                    id: `msg_${Date.now()}_a`,
                    role: 'assistant',
                    content: response.data.answer || 'No response',
                    confidence: response.data.confidence,
                    citations: response.data.citations || [],
                    timestamp: new Date().toISOString()
                };
                this.setState(prev => {
                    const updatedMessages = [...prev.messages, assistantMessage];
                    this.saveChatSessionToServer(updatedMessages);
                    const quotaUpdate = (response.data.quotaUsed !== undefined)
                        ? { quota: { used: response.data.quotaUsed, limit: response.data.quotaLimit } }
                        : {};
                    return { messages: updatedMessages, sending: false, ...quotaUpdate };
                });
            } else {
                this.setState({
                    error: response.message || 'Failed to get response from MAGI',
                    sending: false
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Failed to send message',
                sending: false
            });
        }
    }

    handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage(this.state.inputText);
        }
    };

    handleSubmit = (e) => {
        e.preventDefault();
        this.sendMessage(this.state.inputText);
    };

    clearConversation = () => {
        this.setState({
            messages: [],
            conversationId: this.generateConversationId(),
            error: null
        });
    };

    renderQuotaBar() {
        const { quota } = this.state;
        if (!quota || quota.limit <= 0) return null;

        const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
        const remaining = Math.max(0, quota.limit - quota.used);

        const barColor = pct < 50 ? '#22c55e' : pct < 75 ? '#f59e0b' : pct < 90 ? '#f97316' : '#ef4444';

        const statusText = pct >= 100
            ? 'MAGI is resting — daily capacity exhausted, resets at midnight UTC'
            : pct >= 90
            ? `MAGI is almost fully occupied today · ${remaining} briefing${remaining !== 1 ? 's' : ''} left`
            : pct >= 60
            ? `MAGI has been very active today · ${remaining} briefing${remaining !== 1 ? 's' : ''} remaining`
            : `${remaining} of ${quota.limit} daily briefings available`;

        return html`
            <div title=${statusText} style="cursor: default; flex-shrink: 0;">
                <div class="progress progress-sm" style="height: 3px; border-radius: 0; margin: 0; background: var(--tblr-border-color, #e6e7e9);">
                    <div
                        class="progress-bar"
                        role="progressbar"
                        style="width: ${pct}%; background: ${barColor}; transition: width 0.6s ease;"
                        aria-valuenow=${pct}
                        aria-valuemin="0"
                        aria-valuemax="100"
                    ></div>
                </div>
            </div>
        `;
    }

    renderMessage(msg) {
        const isUser = msg.role === 'user';

        const magiAvatar = html`
            <div class="msg-avatar msg-avatar--magi" title="MAGI Security Intelligence">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
                    <path d="M9 12l2 2l4-4"/>
                </svg>
            </div>
        `;

        const userAvatar = html`
            <div class="msg-avatar msg-avatar--user" title="You">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" fill="none">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/>
                    <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>
                </svg>
            </div>
        `;

        return html`
            <div key=${msg.id} class="msg-row ${isUser ? 'msg-row--user' : 'msg-row--magi'}">
                ${!isUser ? magiAvatar : ''}
                <div class="msg-bubble ${isUser ? 'msg-bubble--user' : 'msg-bubble--magi'}">
                    ${!isUser ? html`
                        <div class="msg-sender-label">
                            <span class="msg-sender-dot"></span>MAGI
                        </div>
                    ` : ''}

                    ${isUser
                        ? html`<div class="msg-text">${msg.content}</div>`
                        : html`<div class="msg-text chat-markdown-content" dangerouslySetInnerHTML=${{ __html: renderMarkdown(msg.content) }}/>`
                    }

                    ${!isUser && (msg.confidence !== undefined || msg.citations?.length > 0) ? html`
                        <div class="msg-meta">
                            ${msg.confidence !== undefined ? html`
                                <span class="confidence-badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 3m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M9 12m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M15 7m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /></svg>
                                    ${Math.round((msg.confidence || 0) * 100)}%
                                </span>
                            ` : ''}
                            ${msg.citations?.length > 0 ? html`
                                <details class="message-citations">
                                    <summary>${msg.citations.length} source${msg.citations.length !== 1 ? 's' : ''}</summary>
                                    <ul class="citations-list">
                                        ${msg.citations.map((c, i) => html`<li key=${i}><small>${c}</small></li>`)}
                                    </ul>
                                </details>
                            ` : ''}
                        </div>
                    ` : ''}

                    <div class="msg-time">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                ${isUser ? userAvatar : ''}
            </div>
        `;
    }

    renderShimmer() {
        return html`
            <div class="msg-shimmer-row">
                <div class="msg-avatar msg-avatar--magi msg-avatar--thinking">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
                        <path d="M9 12l2 2l4-4"/>
                    </svg>
                </div>
                <div class="msg-bubble msg-bubble--magi msg-bubble--loading">
                    <div class="msg-sender-label">
                        <span class="msg-sender-dot"></span>MAGI
                    </div>
                    <div class="chat-shimmer" style="background:none;border:none;padding:0;width:200px;">
                        <div class="chat-shimmer-line"></div>
                        <div class="chat-shimmer-line"></div>
                        <div class="chat-shimmer-line"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderMagiStats() {
        const { proactiveInsights, insightsLoading } = this.state;
        const s = proactiveInsights?.contextStats;
        if (insightsLoading || !s || (!s.totalFindings && !s.deviceCount)) return null;

        const tiles = [
            { value: (s.totalFindings || 0).toLocaleString(), label: 'findings scanned' },
            { value: (s.deviceCount  || 0).toLocaleString(), label: 'endpoints watched' },
            { value: (s.trackedCves  || 0).toLocaleString(), label: 'CVEs on radar' },
            { value: (s.assessedApps || 0).toLocaleString(), label: 'apps assessed' },
        ].filter(t => t.value !== '0');

        if (!tiles.length) return null;

        return html`
            <div style="margin-bottom: 22px;">
                <div style="
                    display: flex; align-items: center; justify-content: center;
                    gap: 4px; margin-bottom: 8px;
                ">
                    <span style="
                        display: inline-block; width: 6px; height: 6px;
                        border-radius: 50%; background: #22c55e;
                        animation: magiPulse 2s ease-in-out infinite;
                    "></span>
                    <span style="font-size: 0.65rem; color: var(--tblr-secondary, #94a3b8); letter-spacing: 0.06em; text-transform: uppercase;">Live intel</span>
                </div>
                <div style="
                    display: flex; align-items: stretch; justify-content: center;
                    background: rgba(99,102,241,0.05);
                    border: 1px solid rgba(99,102,241,0.15);
                    border-radius: 12px; overflow: hidden;
                ">
                    ${tiles.map((tile, i) => html`
                        <div key=${i} style="
                            flex: 1; padding: 10px 8px; text-align: center;
                            border-right: ${i < tiles.length - 1 ? '1px solid rgba(99,102,241,0.1)' : 'none'};
                        ">
                            <div style="
                                font-size: 1.05rem; font-weight: 700; line-height: 1.2;
                                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                                background-clip: text;
                            ">${tile.value}</div>
                            <div style="font-size: 0.62rem; color: var(--tblr-secondary, #94a3b8); margin-top: 2px; white-space: nowrap;">${tile.label}</div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        const { sending, proactiveInsights, insightsLoading, insightsExpanded } = this.state;

        const dynamicSuggestions = proactiveInsights?.insights
            ?.map(i => i.suggestedQuestion)
            .filter(Boolean) || [];

        const combined = [
            ...dynamicSuggestions.slice(0, 2),
            ...SUGGESTIONS.filter(s => !dynamicSuggestions.includes(s))
        ].slice(0, 4);

        const typeIcons = {
            KEV_DEADLINE:  '🚨',
            SCORE_DROP:    '📉',
            OFFLINE_DEVICE:'📵',
            SLA_BREACH:    '⏱',
            NEW_CRITICAL:  '🔴',
            CLEAN_WEEK:    '✅',
            LOADING:       '⏳'
        };

        return html`
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 2rem 1rem; min-height: 0;">
                <div style="max-width: 560px; width: 100%; text-align: center;">

                    <!-- MAGI identity -->
                    <div style="margin-bottom: 20px;">
                        <div style="
                            width: 56px; height: 56px; margin: 0 auto 14px;
                            background: linear-gradient(135deg, #6366f1, #8b5cf6);
                            border-radius: 16px;
                            display: flex; align-items: center; justify-content: center;
                            box-shadow: 0 4px 16px rgba(99,102,241,0.25);
                        ">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" stroke-width="1.8" stroke="white" fill="none">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
                                <path d="M9 12l2 2l4-4"/>
                            </svg>
                        </div>
                        <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0 0 4px; color: var(--tblr-body-color, #1e293b);">MAGI</h2>
                        <div style="font-size: 0.85rem; color: var(--tblr-secondary, #667085);">Your security intelligence assistant</div>
                    </div>

                    <!-- Live intel matrix -->
                    ${this.renderMagiStats()}

                    <!-- Proactive insights -->
                    ${insightsLoading ? html`
                        <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 16px; margin-bottom: 20px; text-align: left;">
                            <div class="chat-shimmer" style="margin: 0;">
                                <div class="chat-shimmer-line" style="width: 60%;"></div>
                                <div class="chat-shimmer-line" style="width: 80%;"></div>
                                <div class="chat-shimmer-line" style="width: 50%;"></div>
                            </div>
                        </div>
                    ` : ''}

                    ${!insightsLoading && proactiveInsights?.insights?.length > 0 ? html`
                        <div style="background: #faf5ff; border: 1px solid #c4b5fd; border-radius: 10px; padding: 16px; margin-bottom: 20px; text-align: left;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="white" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 7a5 5 0 1 0 5 5" /></svg>
                                </div>
                                <div>
                                    <div style="font-weight: 600; font-size: 0.82rem; color: #4c1d95;">Today's security insights</div>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                ${proactiveInsights.insights.map((insight, i) => html`
                                    <div key=${i} style="background: white; border: 1px solid #ede9fe; border-radius: 8px; overflow: hidden;">
                                        <button
                                            style="width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px;"
                                            onClick=${() => this.setState({ insightsExpanded: insightsExpanded === i ? null : i })}
                                        >
                                            <span style="font-size: 14px;">${typeIcons[insight.type] || '🔒'}</span>
                                            <span style="flex: 1; font-size: 0.8rem; font-weight: 500; color: #1e1b4b;">${insight.headline}</span>
                                            <span style="font-size: 10px; color: #7c3aed;">${insightsExpanded === i ? '▲' : '▼'}</span>
                                        </button>
                                        ${insightsExpanded === i ? html`
                                            <div style="padding: 0 10px 10px 32px;">
                                                <div style="font-size: 0.8rem; color: #374151; margin-bottom: 8px;">${insight.detail}</div>
                                                ${insight.suggestedQuestion ? html`
                                                    <button
                                                        style="background: #f3f0ff; color: #6d28d9; border: 1px solid #c4b5fd; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; cursor: pointer;"
                                                        disabled=${sending}
                                                        onClick=${() => this.sendMessage(insight.suggestedQuestion)}
                                                    >Ask: "${insight.suggestedQuestion}" →</button>
                                                ` : ''}
                                            </div>
                                        ` : ''}
                                    </div>
                                `)}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Suggestion chips -->
                    ${combined.length > 0 ? html`
                        <div style="text-align: left;">
                            <div style="font-size: 0.75rem; color: var(--tblr-secondary, #999); margin-bottom: 8px; font-weight: 500;">
                                ${dynamicSuggestions.length > 0 ? 'Based on today\'s posture' : 'Try asking'}
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                ${combined.map(s => html`
                                    <button
                                        class="suggestion-chip"
                                        disabled=${sending}
                                        onClick=${() => this.sendMessage(s)}
                                        style="
                                            text-align: left; padding: 10px 12px;
                                            background: var(--tblr-bg-surface, #fff);
                                            border: 1px solid var(--tblr-border-color, #e6e7e9);
                                            border-radius: 10px; cursor: pointer;
                                            font-size: 0.82rem; color: var(--tblr-body-color, #333);
                                            transition: border-color 0.15s, box-shadow 0.15s;
                                            line-height: 1.4;
                                        "
                                    >${s}</button>
                                `)}
                            </div>
                        </div>
                    ` : ''}

                </div>
            </div>
        `;
    }

    render() {
        const { messages, inputText, sending, error } = this.state;
        const charCount = inputText.length;

        return html`
            <div class="ai-analyst-chat-page" style="
                display: flex; flex-direction: column;
                height: calc(100vh - 120px);
                max-width: 100%; margin: 0 auto;
                padding: 0;
            ">

                <!-- Header bar -->
                <div style="
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 16px;
                    border-bottom: 1px solid var(--tblr-border-color, #e6e7e9);
                    flex-shrink: 0;
                ">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="
                            width: 32px; height: 32px;
                            background: linear-gradient(135deg, #6366f1, #8b5cf6);
                            border-radius: 10px;
                            display: flex; align-items: center; justify-content: center;
                            flex-shrink: 0;
                        ">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="white" fill="none">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1-8.5 15a12 12 0 0 1-8.5-15a12 12 0 0 0 8.5-3"/>
                                <path d="M9 12l2 2l4-4"/>
                            </svg>
                        </div>
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--tblr-body-color, #1e293b); line-height: 1.2;">MAGI</div>
                            <div style="font-size: 0.7rem; color: var(--tblr-secondary, #667085);">Security Intelligence</div>
                        </div>
                    </div>
                    ${messages.length > 0 ? html`
                        <button
                            onClick=${this.clearConversation}
                            style="
                                display: flex; align-items: center; gap: 5px;
                                background: none; border: 1px solid var(--tblr-border-color, #e6e7e9);
                                border-radius: 8px; padding: 5px 12px;
                                font-size: 0.78rem; color: var(--tblr-secondary, #667085);
                                cursor: pointer; transition: border-color 0.15s;
                            "
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>
                            New chat
                        </button>
                    ` : ''}
                </div>

                <!-- Quota bar — slim usage indicator just below header -->
                ${this.renderQuotaBar()}

                <!-- Error banner -->
                ${error ? html`
                    <div style="
                        margin: 8px 16px 0; padding: 8px 12px;
                        background: rgba(220,38,38,0.08); border: 1px solid rgba(220,38,38,0.2);
                        border-radius: 8px; font-size: 0.85rem; color: #dc2626;
                        display: flex; justify-content: space-between; align-items: center;
                    ">
                        <span>${error}</span>
                        <button onClick=${() => this.setState({ error: null })} style="background: none; border: none; color: #dc2626; cursor: pointer; padding: 0 4px; font-size: 1rem;">✕</button>
                    </div>
                ` : ''}

                <!-- Messages area (scrollable) -->
                <div style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; min-height: 0;">
                    ${messages.length === 0 && !sending
                        ? this.renderEmptyState()
                        : html`
                            <div style="display: flex; flex-direction: column; gap: 1.25rem; flex: 1;">
                                ${messages.map(msg => this.renderMessage(msg))}
                                ${sending ? this.renderShimmer() : ''}
                                <div ref=${this.chatEndRef}></div>
                            </div>
                        `
                    }
                </div>

                <!-- Input bar -->
                <div style="
                    padding: 10px 16px 12px;
                    border-top: 1px solid var(--tblr-border-color, #e6e7e9);
                    background: var(--tblr-bg-surface, #fff);
                    flex-shrink: 0;
                ">
                    <form onSubmit=${this.handleSubmit}>
                        <div style="display: flex; align-items: flex-end; gap: 8px; max-width: 768px; margin: 0 auto;">
                            <textarea
                                ref=${this.inputRef}
                                placeholder="Ask MAGI about your security posture..."
                                value=${inputText}
                                onInput=${(e) => this.setState({ inputText: e.target.value })}
                                onKeyDown=${this.handleKeyDown}
                                disabled=${sending}
                                rows="1"
                                style="
                                    flex: 1; resize: none;
                                    border-radius: 24px;
                                    border: 1px solid var(--tblr-border-color, #e6e7e9);
                                    padding: 10px 16px;
                                    font-size: 0.9rem;
                                    min-height: 44px; max-height: 120px;
                                    outline: none;
                                    background: var(--tblr-bg-surface-secondary, #f8f9fa);
                                    color: var(--tblr-body-color, #1e293b);
                                    transition: border-color 0.2s, box-shadow 0.2s;
                                "
                            ></textarea>
                            <button
                                type="submit"
                                disabled=${!inputText.trim() || sending}
                                style="
                                    width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
                                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                                    border: none; color: #fff; cursor: pointer;
                                    display: flex; align-items: center; justify-content: center;
                                    opacity: ${!inputText.trim() || sending ? '0.4' : '1'};
                                    transition: opacity 0.15s;
                                "
                            >
                                ${sending
                                    ? html`<span class="spinner-border spinner-border-sm" style="width:14px;height:14px;border-width:2px;" role="status"></span>`
                                    : html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="10" y1="14" x2="21" y2="3" /><path d="M21 3l-6.5 18a0.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a0.55 .55 0 0 1 0 -1l18 -6.5" /></svg>`
                                }
                            </button>
                        </div>
                        ${charCount > 500 ? html`
                            <div class="char-count-hint ${charCount > 1000 ? 'over' : ''}" style="max-width: 768px; margin: 2px auto 0;">${charCount} / 1000</div>
                        ` : ''}
                        <div style="text-align: center; margin-top: 5px; font-size: 0.68rem; color: var(--tblr-secondary, #999);">Enter to send · Shift+Enter for new line</div>
                    </form>
                </div>

            </div>
        `;
    }
}
