/**
 * AI Security Analyst Chat Client
 * 
 * Features:
 * - Natural language security questions
 * - Interactive chat interface
 * - Contextual follow-up suggestions
 * - Confidence scoring for AI responses
 * - Citation of data sources (grounded answers)
 * 
 * API Endpoints:
 * - POST /api/v1/orgs/{orgId}/ai-analyst/ask - Ask question
 * - GET /api/v1/orgs/{orgId}/ai-analyst/chat-history - Get conversation history
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component, createRef } = window;

export default class AIAnalystChatPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            messages: [],
            inputText: '',
            sending: false,
            error: null,
            suggestions: [
                'What are my CIS compliance gaps?',
                'Show me critical compliance gaps only',
                'Tell me about control 7.1',
                'How do I fix gap 7.1?',
                "What's the effort for gap 7.1?"
            ],
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
        // Subscribe to org changes - clear conversation on org switch
        // onChange() returns an unsubscribe function
        this.orgChangeListener = orgContext.onChange(() => {
            this.setState({
                messages: [],
                conversationId: this.generateConversationId(),
                error: null
            });
        });

        // Load chat history if available
        this.loadChatHistory();

        const initialQuestion = this.getInitialQuestionFromHash();
        if (initialQuestion) {
            this.setState({ inputText: initialQuestion }, () => {
                this.sendMessage(initialQuestion);
            });
        }
    }

    getInitialQuestionFromHash() {
        const hash = window.location.hash || '';
        const queryIndex = hash.indexOf('?');
        if (queryIndex < 0) return '';
        const query = hash.substring(queryIndex + 1);
        const params = new URLSearchParams(query);
        return (params.get('q') || '').trim();
    }

    componentWillUnmount() {
        // orgChangeListener is the unsubscribe function returned by onChange()
        if (this.orgChangeListener) {
            this.orgChangeListener();
        }
    }

    componentDidUpdate(prevProps, prevState) {
        // Auto-scroll to bottom when new messages arrive
        if (prevState.messages.length !== this.state.messages.length) {
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        if (this.chatEndRef.current) {
            this.chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }

    async loadChatHistory() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) return;

        try {
            // TODO: Implement chat history loading from backend
            // Endpoint: GET /api/v1/orgs/{orgId}/ai-analyst/chat-history
            // For now, start fresh conversation each time
            // When implemented:
            // 1. Load last N conversations from backend
            // 2. Allow user to select conversation to continue
            // 3. Restore messages array from selected conversation
        } catch (err) {
            // Silent fail - chat history is optional
        }
    }

    async sendMessage(messageText) {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) {
            this.setState({ error: 'No organization selected' });
            return;
        }

        if (!messageText || !messageText.trim()) {
            return;
        }

        const question = messageText.trim();

        // Add user message to chat
        const userMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: question,
            timestamp: new Date().toISOString()
        };

        this.setState(prevState => ({
            messages: [...prevState.messages, userMessage],
            inputText: '',
            sending: true,
            error: null
        }));

        try {
            const response = await api.post(`/api/v1/orgs/${org.orgId}/ai-analyst/ask`, {
                question: question,
                conversationId: this.state.conversationId,
                includeContext: true
            });

            if (response.success && response.data) {
                const assistantMessage = {
                    id: `msg_${Date.now()}_assistant`,
                    role: 'assistant',
                    content: response.data.answer || 'No response',
                    confidence: response.data.confidence || 0,
                    citations: response.data.citations || [],
                    followUpSuggestions: response.data.followUpSuggestions || [],
                    timestamp: new Date().toISOString()
                };

                this.setState(prevState => ({
                    messages: [...prevState.messages, assistantMessage],
                    sending: false,
                    suggestions: assistantMessage.followUpSuggestions.length > 0 
                        ? assistantMessage.followUpSuggestions 
                        : prevState.suggestions
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

    handleInputChange(e) {
        this.setState({ inputText: e.target.value });
    }

    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage(this.state.inputText);
        }
    }

    handleSubmit(e) {
        e.preventDefault();
        this.sendMessage(this.state.inputText);
    }

    handleSuggestionClick(suggestion) {
        this.setState({ inputText: suggestion }, () => {
            if (this.inputRef.current) {
                this.inputRef.current.focus();
            }
        });
    }

    clearConversation() {
        this.setState({
            messages: [],
            conversationId: this.generateConversationId(),
            error: null
        });
    }

    render() {
        const { messages, inputText, sending, error, suggestions } = this.state;

        return h('div', { class: 'ai-analyst-chat-page' },
            h('div', { class: 'page-header' },
                h('h1', null, 
                    h('i', { class: 'fas fa-robot mr-2' }),
                    'AI Security Analyst'
                ),
                h('p', { class: 'page-description' }, 
                    'Ask questions about your security posture in natural language. The AI analyst will provide insights grounded in your actual infrastructure data.'
                )
            ),

            error && html`
                <div class="alert alert-danger alert-dismissible">
                    <h4 class="alert-title">Error</h4>
                    <div class="text-secondary">${error}</div>
                    <button type="button" class="btn-close" onClick=${() => this.setState({ error: null })}></button>
                </div>
            `,

            h('div', { class: 'chat-container' },
                // Chat Messages Area
                h('div', { class: 'chat-messages' },
                    messages.length === 0 && !sending && h('div', { class: 'chat-empty-state' },
                        h('i', { class: 'fas fa-comments fa-3x mb-3 text-muted' }),
                        h('p', { class: 'text-muted' }, 'Start a conversation with your AI security analyst'),
                        h('p', { class: 'text-muted small' }, 'Try one of the suggestions below or ask your own question')
                    ),

                    messages.map(msg => this.renderMessage(msg)),

                    sending && h('div', { class: 'message assistant typing' },
                        h('div', { class: 'message-avatar' },
                            h('i', { class: 'fas fa-robot' })
                        ),
                        h('div', { class: 'message-content' },
                            h('div', { class: 'typing-indicator' },
                                h('span'),
                                h('span'),
                                h('span')
                            )
                        )
                    ),

                    h('div', { ref: this.chatEndRef })
                ),

                // Suggestions Panel (show when no messages or after assistant response)
                (messages.length === 0 || (messages.length > 0 && messages[messages.length - 1].role === 'assistant')) &&
                suggestions.length > 0 && h('div', { class: 'chat-suggestions' },
                    h('div', { class: 'suggestions-label' },
                        h('i', { class: 'fas fa-lightbulb mr-2' }),
                        messages.length === 0 ? 'Suggested questions:' : 'Follow-up suggestions:'
                    ),
                    h('div', { class: 'suggestions-list' },
                        suggestions.map((suggestion, idx) =>
                            h('button', {
                                key: idx,
                                class: 'suggestion-chip',
                                onClick: () => this.handleSuggestionClick(suggestion),
                                disabled: sending
                            }, suggestion)
                        )
                    )
                ),

                // Input Area
                h('div', { class: 'chat-input-area' },
                    h('form', { onSubmit: (e) => this.handleSubmit(e), class: 'chat-input-form' },
                        h('div', { class: 'input-with-actions' },
                            h('textarea', {
                                ref: this.inputRef,
                                class: 'form-control chat-input',
                                placeholder: 'Ask a security question...',
                                value: inputText,
                                onInput: (e) => this.handleInputChange(e),
                                onKeyPress: (e) => this.handleKeyPress(e),
                                disabled: sending,
                                rows: 2
                            }),
                            h('div', { class: 'input-actions' },
                                messages.length > 0 && h('button', {
                                    type: 'button',
                                    class: 'btn btn-sm btn-outline-secondary',
                                    onClick: () => this.clearConversation(),
                                    disabled: sending,
                                    title: 'Clear conversation'
                                },
                                    h('i', { class: 'fas fa-trash' })
                                ),
                                h('button', {
                                    type: 'submit',
                                    class: 'btn btn-primary',
                                    disabled: !inputText.trim() || sending
                                },
                                    sending 
                                        ? h('i', { class: 'fas fa-spinner fa-spin' })
                                        : h('i', { class: 'fas fa-paper-plane' })
                                )
                            )
                        )
                    ),
                    h('div', { class: 'input-hint text-muted small' },
                        'Press Enter to send, Shift+Enter for new line'
                    )
                )
            )
        );
    }

    renderMessage(msg) {
        const isUser = msg.role === 'user';
        
        return h('div', { 
            key: msg.id, 
            class: `message ${msg.role}` 
        },
            h('div', { class: 'message-avatar' },
                h('i', { class: isUser ? 'fas fa-user' : 'fas fa-robot' })
            ),
            h('div', { class: 'message-content' },
                h('div', { class: 'message-text' },
                    this.renderMessageContent(msg.content)
                ),
                
                // Confidence score (for assistant messages)
                !isUser && msg.confidence !== undefined && h('div', { class: 'message-meta' },
                    h('span', { class: 'confidence-badge' },
                        h('i', { class: 'fas fa-chart-bar mr-1' }),
                        `Confidence: ${Math.round(msg.confidence * 100)}%`
                    )
                ),

                // Citations (for assistant messages)
                !isUser && msg.citations && msg.citations.length > 0 && h('div', { class: 'message-citations' },
                    h('details', null,
                        h('summary', null, 
                            h('i', { class: 'fas fa-link mr-1' }),
                            `${msg.citations.length} source(s)`
                        ),
                        h('ul', { class: 'citations-list' },
                            msg.citations.map((citation, idx) =>
                                h('li', { key: idx },
                                    h('small', null, citation)
                                )
                            )
                        )
                    )
                ),

                h('div', { class: 'message-timestamp' },
                    new Date(msg.timestamp).toLocaleTimeString()
                )
            )
        );
    }

    renderMessageContent(content) {
        // Simple markdown-like rendering
        // Replace **text** with bold
        let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Replace `code` with code tags
        formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
        
        // Replace newlines with <br>
        formatted = formatted.replace(/\n/g, '<br>');
        
        return h('span', { dangerouslySetInnerHTML: { __html: formatted } });
    }
}
