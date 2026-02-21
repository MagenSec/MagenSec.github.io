/**
 * AI Security Analyst Chat
 *
 * Full-page chat interface for the AI Security Analyst.
 * - html`` template literals (Preact/HTM pattern)
 * - marked.js + DOMPurify for markdown rendering
 * - Mermaid diagram support in AI responses
 * - Shimmer skeleton typing indicator
 * - Persona selector pill bar
 * - sessionStorage pre-load from Home page (no wasted request)
 *
 * API: POST /api/v1/orgs/{orgId}/ai-analyst/ask
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component, createRef } = window;

const PERSONAS = [
    {
        id: 'business_owner',
        label: 'Business Owner',
        suggestions: [
            'How secure is my business right now?',
            'What should I worry about most?',
            'Am I at risk of a ransomware attack?',
            "What's the cost if I ignore these issues?"
        ]
    },
    {
        id: 'it_admin',
        label: 'IT Admin',
        suggestions: [
            'Which CVEs need patching this week?',
            'Show me my most vulnerable applications',
            'Which devices are highest risk?',
            'What CIS controls am I failing?'
        ]
    },
    {
        id: 'ciso',
        label: 'CISO',
        suggestions: [
            'What is our risk posture trend this month?',
            'How do we compare against CIS benchmarks?',
            'What are our highest-priority strategic gaps?',
            'Summarize this for a board presentation'
        ]
    },
    {
        id: 'auditor',
        label: 'Auditor',
        suggestions: [
            'List all failed compliance controls with evidence',
            'What CIS Controls are fully implemented?',
            'Show me device compliance by control domain',
            'Which NIST CSF categories have gaps?'
        ]
    }
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
            persona: 'it_admin',
            conversationId: this.generateConversationId()
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
                error: null
            });
        });

        // Try to hydrate from sessionStorage (pre-load from Home — no extra API call)
        const prefill = this.loadPrefill();
        if (prefill) {
            this.setState({ messages: prefill.messages, conversationId: prefill.conversationId });
            return;
        }

        // Fallback: check for ?q= in hash (backward compat with old "Ask Analyst" links)
        const initialQuestion = this.getInitialQuestionFromHash();
        if (initialQuestion) {
            this.setState({ inputText: initialQuestion }, () => {
                this.sendMessage(initialQuestion);
            });
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.messages.length !== this.state.messages.length) {
            this.scrollToBottom();
            // Re-initialize mermaid diagrams in new messages
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
                persona: this.state.persona,
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
                this.setState(prev => ({
                    messages: [...prev.messages, assistantMessage],
                    sending: false
                }));
            } else {
                this.setState({
                    error: response.message || 'Failed to get response from AI analyst',
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

    switchPersona = (personaId) => {
        this.setState({
            persona: personaId,
            messages: [],
            conversationId: this.generateConversationId(),
            error: null
        });
    };

    renderPersonaBar() {
        const { persona } = this.state;
        return html`
            <div class="persona-bar">
                ${PERSONAS.map(p => html`
                    <button
                        class="persona-pill ${persona === p.id ? 'active' : ''}"
                        onClick=${() => this.switchPersona(p.id)}
                        title="Switch to ${p.label} persona (clears chat)"
                    >${p.label}</button>
                `)}
            </div>
        `;
    }

    renderMessage(msg) {
        const isUser = msg.role === 'user';
        return html`
            <div
                key=${msg.id}
                class="message ${msg.role}"
                style="display: flex; flex-direction: column; align-items: ${isUser ? 'flex-end' : 'flex-start'};"
            >
                <div
                    class="message-content"
                    style="${isUser ? 'background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-color: transparent;' : ''}"
                >
                    ${isUser
                        ? html`<div class="message-text">${msg.content}</div>`
                        : html`<div
                            class="message-text chat-markdown-content"
                            dangerouslySetInnerHTML=${{ __html: renderMarkdown(msg.content) }}
                          />`
                    }

                    ${!isUser && (msg.confidence !== undefined || msg.citations?.length > 0) ? html`
                        <div class="message-meta">
                            ${msg.confidence !== undefined ? html`
                                <span class="confidence-badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 3m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M9 12m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /><path d="M15 7m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" /></svg>
                                    Confidence: ${Math.round((msg.confidence || 0) * 100)}%
                                </span>
                            ` : ''}
                            ${msg.citations?.length > 0 ? html`
                                <details class="message-citations">
                                    <summary>${msg.citations.length} source(s)</summary>
                                    <ul class="citations-list">
                                        ${msg.citations.map((c, i) => html`<li key=${i}><small>${c}</small></li>`)}
                                    </ul>
                                </details>
                            ` : ''}
                        </div>
                    ` : ''}

                    <div class="message-timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `;
    }

    renderShimmer() {
        return html`
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                <div class="chat-shimmer">
                    <div class="chat-shimmer-line"></div>
                    <div class="chat-shimmer-line"></div>
                    <div class="chat-shimmer-line"></div>
                </div>
            </div>
        `;
    }

    renderSuggestions() {
        const { persona, messages, sending } = this.state;
        if (messages.length > 0) return null;
        const personaConfig = PERSONAS.find(p => p.id === persona);
        if (!personaConfig) return null;
        return html`
            <div class="chat-suggestions">
                <div class="suggestions-label text-muted small mb-2">Suggested questions</div>
                <div class="suggestions-list">
                    ${personaConfig.suggestions.map(s => html`
                        <button
                            class="suggestion-chip"
                            disabled=${sending}
                            onClick=${() => this.sendMessage(s)}
                        >${s}</button>
                    `)}
                </div>
            </div>
        `;
    }

    render() {
        const { messages, inputText, sending, error } = this.state;
        const charCount = inputText.length;

        return html`
            <div class="ai-analyst-chat-page" style="padding-bottom: 2rem;">
                <div class="page-header mb-3">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <h2 class="page-title">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
                                AI Security Analyst
                            </h2>
                            <div class="page-subtitle text-muted">Ask questions about your security posture, grounded in your telemetry data</div>
                        </div>
                        ${messages.length > 0 ? html`
                            <div class="col-auto">
                                <button class="btn btn-sm btn-outline-secondary" onClick=${this.clearConversation}>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                                    Clear chat
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>

                ${this.renderPersonaBar()}

                ${error ? html`
                    <div class="alert alert-danger alert-dismissible mb-3">
                        ${error}
                        <button type="button" class="btn-close" onClick=${() => this.setState({ error: null })}></button>
                    </div>
                ` : ''}

                <div class="chat-container">
                    <div class="chat-messages">
                        ${messages.length === 0 && !sending ? html`
                            <div class="chat-empty-state">
                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" stroke-width="1.5" stroke="#c4b5fd" fill="none" style="margin-bottom: 12px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></svg>
                                <div class="fw-medium mb-1">Your AI Security Analyst is ready</div>
                                <div class="text-muted small">Ask about vulnerabilities, patches, compliance gaps, or your overall risk posture</div>
                            </div>
                        ` : ''}

                        ${messages.map(msg => this.renderMessage(msg))}
                        ${sending ? this.renderShimmer() : ''}
                        <div ref=${this.chatEndRef}></div>
                    </div>

                    ${this.renderSuggestions()}

                    <div class="chat-input-area">
                        <form onSubmit=${this.handleSubmit} class="chat-input-form">
                            <div class="input-with-actions">
                                <textarea
                                    ref=${this.inputRef}
                                    class="form-control chat-input"
                                    placeholder="Ask a security question..."
                                    value=${inputText}
                                    onInput=${(e) => this.setState({ inputText: e.target.value })}
                                    onKeyDown=${this.handleKeyDown}
                                    disabled=${sending}
                                    rows="2"
                                ></textarea>
                                <div class="input-actions">
                                    <button
                                        type="submit"
                                        class="btn btn-primary"
                                        disabled=${!inputText.trim() || sending}
                                    >
                                        ${sending
                                            ? html`<span class="spinner-border spinner-border-sm" style="width:14px;height:14px;border-width:2px;" role="status"></span>`
                                            : html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="10" y1="14" x2="21" y2="3" /><path d="M21 3l-6.5 18a0.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a0.55 .55 0 0 1 0 -1l18 -6.5" /></svg>`
                                        }
                                    </button>
                                </div>
                            </div>
                            ${charCount > 500 ? html`
                                <div class="char-count-hint ${charCount > 1000 ? 'over' : ''}">${charCount} / 1000</div>
                            ` : ''}
                            <div class="input-hint text-muted small">Enter to send · Shift+Enter for new line</div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }
}
