/**
 * TrackingTimeline — Tabler "tracking" component as a calm 30-day status row.
 *
 * Charter binding:
 * - Used to show DAY-BY-DAY status of posture / hygiene / compliance / evidence.
 * - Status is categorical (good / drift / breach / unknown), NOT magnitude.
 *   For magnitude trends use `PostureSparkline` instead.
 * - Honest about missing days: empty days render as the Tabler "no-data"
 *   block (a grey hollow tile) — never as success or failure.
 *
 * Status taxonomy:
 *   ok      → bg-success  (calm green — meeting target)
 *   drift   → bg-warning  (amber — drifting, not yet breached)
 *   risk    → bg-danger   (red — breached / out of policy)
 *   info    → bg-info     (indigo — informational, e.g. attestation event)
 *   none    → (no class)  (grey hollow — no data for that day)
 *
 * Props:
 *   days     Array<{ date: ISO|Date, status: 'ok'|'drift'|'risk'|'info'|'none', label?: string }>
 *   length   number (default 30)  — total slots; older days get padded with `none`
 *   ariaLabel string
 */

const { html } = window;

const STATUS_TO_CLASS = {
    ok: 'bg-success',
    drift: 'bg-warning',
    risk: 'bg-danger',
    info: 'bg-info',
    none: ''
};

function formatDay(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function defaultLabel(day) {
    const datePart = formatDay(day.date);
    const statusLabel = {
        ok: 'On policy',
        drift: 'Drifting',
        risk: 'Out of policy',
        info: 'Event',
        none: 'No data'
    }[day.status] || 'No data';
    return datePart ? `${datePart} · ${statusLabel}` : statusLabel;
}

export function TrackingTimeline({
    days = [],
    length = 30,
    ariaLabel = 'Daily status, last 30 days'
} = {}) {
    const safeDays = Array.isArray(days) ? days.slice(-length) : [];
    const padCount = Math.max(0, length - safeDays.length);
    const slots = [
        ...Array.from({ length: padCount }, () => ({ status: 'none' })),
        ...safeDays
    ];

    return html`
        <div class="tracking" role="img" aria-label=${ariaLabel}>
            ${slots.map((d, i) => {
                const status = d?.status || 'none';
                const cls = STATUS_TO_CLASS[status] || '';
                const title = d?.label || defaultLabel(d || { status: 'none' });
                return html`
                    <div class="tracking-block ${cls}"
                         title=${title}
                         aria-label=${title}
                         key=${`tt-${i}`}></div>
                `;
            })}
        </div>
    `;
}

/**
 * TrackingCard — wraps TrackingTimeline in a Tabler card with a metric, delta,
 * and label. Suitable for posture/hygiene/compliance daily status.
 *
 * Props:
 *   title         string         — short subheader (e.g. "Posture stability")
 *   metric        string|number  — current metric (e.g. "98%")
 *   delta         string         — week-over-week delta (e.g. "+2%" or null)
 *   deltaTone     'up'|'down'|'flat' — colors the delta
 *   menuLabel     string         — small dropdown-like label (e.g. "Last 30 days")
 *   days          Array          — passed to TrackingTimeline
 *   length        number         — passed to TrackingTimeline
 *   ariaLabel     string
 */
export function TrackingCard({
    title = 'Status',
    metric = '—',
    delta = null,
    deltaTone = 'flat',
    menuLabel = 'Last 30 days',
    days = [],
    length = 30,
    ariaLabel = ''
} = {}) {
    const deltaColor = deltaTone === 'up'   ? 'var(--tblr-green, #2fb344)'
                     : deltaTone === 'down' ? 'var(--tblr-red, #d63939)'
                     : 'var(--tblr-secondary, #6c757d)';

    return html`
        <div class="card v7-tracking-card">
            <div class="card-body">
                <div class="d-flex align-items-center">
                    <div class="subheader">${title}</div>
                    <div class="ms-auto lh-1">
                        <span class="text-secondary" style="font-size:0.78rem;">${menuLabel}</span>
                    </div>
                </div>
                <div class="d-flex align-items-baseline mt-1">
                    <div class="h1 mb-2 me-2" style="line-height:1;">${metric}</div>
                    ${delta != null ? html`
                        <div class="me-auto">
                            <span style="color:${deltaColor};font-weight:700;font-size:0.86rem;display:inline-flex;align-items:center;gap:4px;">
                                ${delta}
                            </span>
                        </div>
                    ` : null}
                </div>
                <div class="mt-2">
                    <${TrackingTimeline} days=${days} length=${length} ariaLabel=${ariaLabel || `${title} timeline`} />
                </div>
            </div>
        </div>
    `;
}

export default TrackingTimeline;
