/**
 * Error Boundary Component
 * Catches React component errors and displays fallback UI
 */

import { logger } from '../config.js';

const { html, Component } = window;

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    componentDidCatch(error, errorInfo) {
        logger.error('[ErrorBoundary] Caught error:', error, errorInfo);
        this.setState({
            hasError: true,
            error,
            errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            return html`
                <div class="container-xl mt-4">
                    <div class="empty">
                        <div class="empty-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <circle cx="12" cy="12" r="9" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <p class="empty-title">Something went wrong</p>
                        <p class="empty-subtitle text-muted">
                            An error occurred while rendering this component.
                            ${this.state.error?.message ? html`<br/>Error: ${this.state.error.message}` : ''}
                        </p>
                        <div class="empty-action">
                            <button class="btn btn-primary" onClick=${() => window.location.reload()}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                                    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                                </svg>
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        return this.props.children;
    }
}
