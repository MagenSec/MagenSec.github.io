/**
 * WhatNeedsYou — top-N actionable items, calm voice.
 *
 * Display rules (binding):
 * - Default dashboard usage shows a short top-3 preview. Expanding the card
 *   reveals more items without turning the whole dashboard into a queue page.
 * - Each item is a single line: title + hint + chevron. Click navigates to
 *   the route that shows the item in context.
 * - Empty state is celebratory but quiet — no exclamation marks.
 * - Severity is conveyed by a left-edge color band (not a loud badge).
 *
 * Props:
 *   title   string
 *   subtitle string
 *   items   Array<{ title, hint, href, severity?: 'critical'|'high'|'medium'|'low'|'info', kind?: string, impactLabel?: string }>
 *   max     number (default 5)
 *   total   number  — total count if provided; used for "+ N more" footer
 *   moreHref string — link to the full work queue (Alerts page)
 *   emptyMessage string
 */

const { html } = window;

const SEVERITY_TONE = {
    critical: 'rgba(239,68,68,0.85)',
    high:     'rgba(249,115,22,0.85)',
    medium:   'rgba(234,179,8,0.85)',
    low:      'rgba(34,197,94,0.85)',
    info:     'rgba(100,116,139,0.7)'
};

const SEVERITY_LABEL = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    info: 'Review'
};

export function WhatNeedsYou({
    title = 'What Needs Your Attention Today',
    subtitle = '',
    items = [],
    max = 5,
    total = null,
    moreHref = '#!/alerts',
    emptyMessage = 'Nothing needs your attention right now. Trust is holding.',
    expanded = false,
    onToggleExpand = null,
    onAskMagi = null,
    magiLabel = 'Prioritize'
} = {}) {
    const list = Array.isArray(items) ? items.slice(0, max) : [];
    const count = total !== null ? total : list.length;
    const overflow = (total !== null && total > list.length) ? (total - list.length) : 0;
    const canExpand = typeof onToggleExpand === 'function' && count > list.length;

    if (!list.length) {
        return html`
            <div class="v7-what-needs-you v7-what-needs-you--empty">
                <div class="v7-needs-title">${title}</div>
                ${subtitle ? html`<div class="v7-needs-subtitle">${subtitle}</div>` : null}
                <div class="v7-needs-empty-body">${emptyMessage}</div>
            </div>
        `;
    }

    return html`
        <div class=${`v7-what-needs-you ${expanded ? 'v7-what-needs-you--expanded' : 'v7-what-needs-you--preview'}`}>
            <div class="v7-needs-header">
                <div class="v7-needs-heading">
                    <div class="v7-needs-title">${title}</div>
                    ${subtitle ? html`<div class="v7-needs-subtitle">${subtitle}</div>` : null}
                </div>
                <div class="v7-needs-actions">
                    <div class="v7-needs-count">${count} item${count !== 1 ? 's' : ''}</div>
                    ${typeof onAskMagi === 'function' ? html`
                        <button type="button" class="btn btn-sm btn-outline-indigo v7-needs-magi-btn" onClick=${onAskMagi} title="Ask Officer MAGI to prioritize these actions">
                            <i class="ti ti-sparkles" aria-hidden="true"></i>
                            <span>${magiLabel}</span>
                        </button>
                    ` : null}
                    ${canExpand ? html`
                        <button class="btn btn-sm btn-link p-0 v7-needs-toggle" onClick=${onToggleExpand} aria-label=${expanded ? 'Show fewer attention items' : 'Show more attention items'} title=${expanded ? 'Show fewer' : 'Show more'}>
                            <i class=${expanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} aria-hidden="true"></i>
                        </button>
                    ` : null}
                </div>
            </div>
            <div class="v7-needs-body">
                <ul class="v7-needs-list">
                    ${list.map((item) => {
                        const severity = SEVERITY_LABEL[item.severity] ? item.severity : 'info';
                        const tone = SEVERITY_TONE[severity] || SEVERITY_TONE.info;
                        const severityLabel = SEVERITY_LABEL[severity] || SEVERITY_LABEL.info;
                        const impact = item.impactLabel || '';
                        const rowLabel = [severityLabel, item.title, item.hint, impact].filter(Boolean).join(' · ');
                        return html`
                            <li class="v7-needs-item">
                                <a href=${item.href || '#!/alerts'}
                                   class="v7-needs-row"
                                   aria-label=${rowLabel}
                                   title=${rowLabel}>
                                    <span class="v7-needs-severity" aria-hidden="true" style=${`--v7-needs-tone:${tone};`}></span>
                                    <div class="v7-needs-copy">
                                        <div class="v7-needs-row-title">${item.title}</div>
                                        ${(item.hint || impact) ? html`
                                            <div class="v7-needs-row-meta">
                                                ${item.hint ? html`<span class="v7-needs-row-hint">${item.hint}</span>` : null}
                                                ${impact ? html`<span class="v7-needs-impact">${impact}</span>` : null}
                                            </div>
                                        ` : null}
                                    </div>
                                    <span class=${`v7-needs-risk-pill v7-needs-risk-pill--${severity}`}>${severityLabel}</span>
                                    <i class="ti ti-chevron-right v7-needs-chevron" aria-hidden="true"></i>
                                </a>
                            </li>
                        `;
                    })}
                </ul>
                ${(overflow > 0 || expanded) ? html`
                    <div class="v7-needs-footer">
                        ${canExpand && !expanded ? html`
                            <button type="button" class="v7-needs-expand-link" onClick=${onToggleExpand}>
                                Show ${overflow} more
                            </button>
                        ` : overflow > 0 ? html`
                            <a href=${moreHref}>See ${overflow} more in Alerts →</a>
                        ` : html`
                            <a href=${moreHref}>View all in Alerts →</a>
                        `}
                    </div>
                ` : null}
            </div>
        </div>
    `;
}

export default WhatNeedsYou;
