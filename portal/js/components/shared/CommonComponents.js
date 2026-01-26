/**
 * Loading spinner component
 * @param {Object} props
 * @param {string} props.size - sm, md, lg
 * @param {string} props.message - Optional loading message
 */
export function LoadingSpinner({ size = 'md', message }) {
    const { html } = window;
    const sizeClass = size === 'sm' ? 'spinner-border-sm' : '';
    
    return html`
        <div class="text-center py-5">
            <div class="spinner-border text-primary ${sizeClass}" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            ${message ? html`<div class="mt-2 text-muted">${message}</div>` : ''}
        </div>
    `;
}

/**
 * Error alert component
 * @param {Object} props
 * @param {string} props.message - Error message
 * @param {Function} props.onRetry - Optional retry callback
 */
export function ErrorAlert({ message, onRetry }) {
    return html`
        <div class="alert alert-danger d-flex align-items-center" role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                <path d="M12 9v2m0 4v.01M5 19h14a2 2 0 0 0 1.84-2.75l-7.1-12.25a2 2 0 0 0-3.5 0l-7.1 12.25A2 2 0 0 0 5 19z"/>
            </svg>
            <div class="flex-fill">
                <strong>Error:</strong> ${message}
            </div>
            ${onRetry ? html`
                <button class="btn btn-sm btn-outline-danger ms-2" onclick=${onRetry}>
                    Retry
                </button>
            ` : ''}
        </div>
    `;
}

/**
 * Empty state component
 * @param {Object} props
 * @param {string} props.title - Empty state title
 * @param {string} props.message - Empty state message
 * @param {Object} props.action - Optional action button {label, href, onclick}
 */
export function EmptyState({ title, message, action }) {
    return html`
        <div class="empty">
            <div class="empty-icon">
                <svg class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
            </div>
            <p class="empty-title">${title}</p>
            <p class="empty-subtitle text-muted">${message}</p>
            ${action ? html`
                <div class="empty-action">
                    <a href="${action.href || '#'}" class="btn btn-primary" onclick=${action.onclick}>
                        ${action.label}
                    </a>
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * Card component wrapper
 * @param {Object} props
 * @param {string} props.title - Card title
 * @param {*} props.children - Card content
 * @param {Array} props.actions - Optional header actions
 */
export function Card({ title, children, actions }) {
    return html`
        <div class="card">
            ${title || actions ? html`
                <div class="card-header${actions ? ' d-flex justify-content-between align-items-center' : ''}">
                    ${title ? html`<h3 class="card-title">${title}</h3>` : ''}
                    ${actions ? html`
                        <div class="card-actions">
                            ${actions}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            <div class="card-body">
                ${children}
            </div>
        </div>
    `;
}
