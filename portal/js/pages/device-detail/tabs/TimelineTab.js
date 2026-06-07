/**
 * Timeline Tab - grouped device evidence events.
 */
import { formatDate } from '../utils/DateUtils.js';

export function renderTimelineTab(component) {
    const { html } = window;
    const events = Array.isArray(component.state.timeline) ? component.state.timeline : [];
    const validEvents = events.filter(event => {
        const date = new Date(event?.timestamp);
        return Number.isFinite(date.getTime());
    });

    const severityClass = (severity) => {
        switch (String(severity || '').toLowerCase()) {
            case 'success': return 'bg-success-lt text-success';
            case 'warning': return 'bg-warning-lt text-warning';
            case 'danger': return 'bg-danger-lt text-danger';
            default: return 'bg-blue-lt text-blue';
        }
    };

    const iconClass = (type) => {
        switch (String(type || '').toLowerCase()) {
            case 'threat': return 'ti-shield-exclamation';
            case 'change': return 'ti-adjustments';
            case 'signal': return 'ti-activity-heartbeat';
            default: return 'ti-timeline-event';
        }
    };

    const formatTimestamp = (value) => {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return 'N/A';
        return `${formatDate(date)} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    };

    const renderValue = (value) => {
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'object') {
            const from = value.from ?? value.From ?? value.oldValue ?? value.OldValue;
            const to = value.to ?? value.To ?? value.newValue ?? value.NewValue;
            if (from !== undefined || to !== undefined) return `${from ?? '—'} → ${to ?? '—'}`;
            return 'changed';
        }
        return String(value);
    };
    
    return html`
        <div class="timeline timeline-simple device-evidence-timeline">
            ${validEvents.length > 0 ? validEvents.map(event => html`
                <div class="timeline-event">
                    <div class="timeline-event-icon ${severityClass(event.severity)}">
                        <i class="ti ${iconClass(event.type)}"></i>
                    </div>
                    <div class="timeline-event-content w-100">
                        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                            <div>
                                <div class="text-muted small">${formatTimestamp(event.timestamp)}</div>
                                <div class="fw-semibold">${event.title || 'Device event'}</div>
                            </div>
                            <span class="badge ${severityClass(event.severity)}">${event.category || event.type || 'Event'}</span>
                        </div>
                        ${event.description ? html`<div class="text-muted small mt-1">${event.description}</div>` : ''}
                        ${event.fields && Object.keys(event.fields).length > 0 ? html`
                            <div class="row g-2 mt-2 small">
                                ${Object.entries(event.fields).slice(0, 6).map(([key, value]) => html`
                                    <div class="col-sm-6 col-lg-4">
                                        <div class="border rounded p-2 h-100">
                                            <div class="text-muted text-truncate" title=${key}>${key}</div>
                                            <div class="fw-semibold text-break">${renderValue(value)}</div>
                                        </div>
                                    </div>
                                `)}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `) : html`
                <div class="text-center text-muted py-5">
                    No meaningful timeline events yet
                </div>
            `}
        </div>
    `;
}
