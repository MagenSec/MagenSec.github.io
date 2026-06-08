/**
 * Timeline Tab - Event timeline with icons and metadata
 * 
 * Displays chronological device events with visual indicators for severity.
 * Shows changes, updates, and other significant device lifecycle events.
 */
import { formatDate } from '../utils/DateUtils.js';

export function renderTimelineTab(component) {
    const { html } = window;
    
    return html`
        <div class="timeline timeline-simple">
            ${component.state.timeline.length > 0 ? component.state.timeline.map(event => html`
                <div class="timeline-event">
                    <div class="timeline-event-icon ${event.severity === 'success' ? 'bg-success-lt' : event.severity === 'warning' ? 'bg-warning-lt' : event.severity === 'danger' ? 'bg-danger-lt' : 'bg-blue-lt'}">
                        ${event.type === 'change' ? html`
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3" /><line x1="12" y1="12" x2="20" y2="7.5" /><line x1="12" y1="12" x2="12" y2="21" /><line x1="12" y1="12" x2="4" y2="7.5" /></svg>
                        ` : html`
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                        `}
                    </div>
                    <div class="timeline-event-content">
                        <div class="text-muted small">${formatDate(event.timestamp)}</div>
                        <div class="text-sm font-weight-medium">${event.title}</div>
                        <div class="text-muted small mt-1">${event.description}</div>
                        ${event.fields ? html`
                            <div class="mt-2">
                                ${Object.entries(event.fields).map(([k, v]) => html`
                                    <div class="text-sm"><strong>${k}:</strong> ${v}</div>
                                `)}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `) : html`
                <div class="text-center text-muted py-5">
                    No timeline events yet
                </div>
            `}
        </div>
    `;
}
