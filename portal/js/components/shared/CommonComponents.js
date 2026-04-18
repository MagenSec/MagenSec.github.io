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

/**
 * Compact segmented control used for page pivots and filters.
 */
export function SegmentedControl({ options = [], value, onChange, size = 'sm', activeClass = 'btn-primary', inactiveClass = 'btn-outline-primary', className = '' }) {
    const { html } = window;
    return html`
        <div class=${`triage-segmented-control triage-segmented-control-${size} ${className}`.trim()} role="group">
            ${options.map(option => {
                const id = typeof option === 'string' ? option : option.id;
                const label = typeof option === 'string' ? option : option.label;
                const badge = typeof option === 'object' ? option.badge : null;
                const selected = value === id;
                return html`
                    <button
                        type="button"
                        class=${`btn ${selected ? activeClass : inactiveClass}`}
                        onClick=${() => onChange?.(id)}>
                        ${label}
                        ${badge !== null && badge !== undefined ? html`<span class="badge ms-1 ${selected ? 'bg-white text-primary' : 'bg-primary text-white'}">${badge}</span>` : ''}
                    </button>
                `;
            })}
        </div>
    `;
}

/**
 * Standard device label resolution for triage pages.
 */
export function resolveDeviceLabel(deviceId, deviceMap = {}, fallback = 'Unattributed device') {
    if (!deviceId) return fallback;
    const entry = deviceMap?.[deviceId];
    if (!entry) return deviceId;
    if (typeof entry === 'string') return entry || deviceId;
    return entry.deviceName || entry.name || entry.label || deviceId;
}

/**
 * Shared collapsible group card used by grouped risk, inventory, and timeline views.
 */
export function CollapsibleSectionCard({ title, subtitle, meta, badges = [], isOpen = false, onToggle, accent = 'primary', children, className = '' }) {
    const { html } = window;
    return html`
        <div class=${`card mb-3 triage-group-card triage-group-${accent} ${className}`.trim()}>
            <div class="card-header">
                <button
                    type="button"
                    class="btn w-100 text-start border-0 bg-transparent shadow-none p-0 triage-group-toggle"
                    aria-expanded=${isOpen ? 'true' : 'false'}
                    onClick=${onToggle}>
                    <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap w-100">
                        <div class="flex-fill min-w-0">
                            <div class="d-flex align-items-center gap-2 flex-wrap">
                                <span class=${`badge bg-${accent}-lt text-${accent} triage-group-glyph`}>${isOpen ? '−' : '+'}</span>
                                <h3 class="card-title mb-0">${title}</h3>
                                ${subtitle ? html`<span class="text-muted small">${subtitle}</span>` : ''}
                            </div>
                            ${meta ? html`<div class="text-muted small mt-1">${meta}</div>` : ''}
                        </div>
                        ${badges?.length ? html`
                            <div class="d-flex gap-2 flex-wrap align-items-center justify-content-end triage-group-badges">
                                ${badges.map(b => html`<span class=${`badge ${b.className || 'bg-secondary-lt text-secondary'}`}>${b.text}</span>`)}
                            </div>
                        ` : ''}
                    </div>
                </button>
            </div>
            ${isOpen ? html`
                <div class="card-body pt-3">
                    ${children}
                </div>
            ` : ''}
        </div>
    `;
}
