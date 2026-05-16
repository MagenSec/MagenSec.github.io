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
 *   items   Array<{ title, hint, href, severity?: 'critical'|'high'|'medium'|'low'|'info', kind?: string }>
 *   max     number (default 5)
 *   total   number  — total count if provided; used for "+ N more" footer
 *   moreHref string — link to the full work queue (Remediation page)
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

export function WhatNeedsYou({
    items = [],
    max = 5,
    total = null,
    moreHref = '#!/remediation',
    emptyMessage = 'Nothing needs your attention right now. Trust is holding.',
    expanded = false,
    onToggleExpand = null
} = {}) {
    const list = Array.isArray(items) ? items.slice(0, max) : [];
    const count = total !== null ? total : list.length;
    const overflow = (total !== null && total > list.length) ? (total - list.length) : 0;
    const canExpand = typeof onToggleExpand === 'function' && count > list.length;

    if (!list.length) {
        return html`
            <div class="v7-what-needs-you v7-what-needs-you--empty">
                <div class="v7-needs-title">What Needs Your Attention Today</div>
                <div class="v7-needs-empty-body">${emptyMessage}</div>
            </div>
        `;
    }

    return html`
        <div class=${`v7-what-needs-you ${expanded ? 'v7-what-needs-you--expanded' : 'v7-what-needs-you--preview'}`}>
            <div class="v7-needs-header">
                <div class="v7-needs-title">What Needs Your Attention Today</div>
                <div class="v7-needs-actions">
                    <div class="v7-needs-count">${count} item${count !== 1 ? 's' : ''}</div>
                    ${canExpand ? html`
                        <button class="btn btn-sm btn-link p-0 v7-needs-toggle" onClick=${onToggleExpand} aria-label=${expanded ? 'Show fewer attention items' : 'Show more attention items'} title=${expanded ? 'Show fewer' : 'Show more'}>
                            <i class=${expanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down'} aria-hidden="true"></i>
                        </button>
                    ` : null}
                </div>
            </div>
            <div class="v7-needs-body">
                <ul class="v7-needs-list">
                    ${list.map((item, idx) => {
                        const tone = SEVERITY_TONE[item.severity] || SEVERITY_TONE.info;
                        return html`
                            <li class="v7-needs-item">
                                <a href=${item.href || '#!/remediation'}
                                   class="v7-needs-row">
                                    <span class="v7-needs-severity" aria-hidden="true" style=${`--v7-needs-tone:${tone};`}></span>
                                    <div class="v7-needs-copy">
                                        <div class="v7-needs-row-title">${item.title}</div>
                                        ${item.hint ? html`<div class="v7-needs-row-hint">${item.hint}</div>` : null}
                                    </div>
                                    <i class="ti ti-chevron-right v7-needs-chevron" aria-hidden="true"></i>
                                </a>
                            </li>
                        `;
                    })}
                </ul>
                ${overflow > 0 ? html`
                    <div class="v7-needs-footer">
                        ${canExpand && !expanded ? html`
                            <button type="button" class="v7-needs-expand-link" onClick=${onToggleExpand}>
                                Show ${overflow} more
                            </button>
                        ` : html`
                            <a href=${moreHref}>+ ${overflow} more in Remediation →</a>
                        `}
                    </div>
                ` : null}
            </div>
        </div>
    `;
}

export default WhatNeedsYou;
