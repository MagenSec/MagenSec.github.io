/**
 * JourneyLane — horizontal pill row showing Anxiety→Trust journey progress.
 *
 * Display rules (binding):
 * - Tier-aware. Personal sees 3 stops, Education 5, Business 7, Site Admin 7.
 *   `hidden` steps drop out entirely (no "ghost" pills).
 * - Status conveys state, never severity:
 *     healthy   → solid filled pill
 *     attention → solid pill with amber dot
 *     gap       → hollow pill with amber stripe
 *     locked    → hollow pill, dim text, padlock icon (Education / add-ons)
 * - Click navigates to that step's page.
 *
 * Props:
 *   tier   'personal' | 'education' | 'business' | 'site-admin'
 *   steps  Array<{
 *            key, label, href,
 *            status: 'healthy'|'attention'|'gap'|'locked'|'hidden',
 *            hint?: string  — small caption below pill
 *          }>
 *   activeKey  string — highlight current page
 */

const { html } = window;

const STATUS_STYLE = {
    healthy:   { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.45)',   text: '#15803d',   dot: '#22c55e' },
    attention: { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.45)',   text: '#a16207',   dot: '#eab308' },
    gap:       { bg: 'transparent',           border: 'rgba(249,115,22,0.55)',  text: '#9a3412',   dot: '#f97316' },
    locked:    { bg: 'transparent',           border: 'rgba(148,163,184,0.35)', text: '#64748b',   dot: '#94a3b8' }
};

export function JourneyLane({
    tier = 'business',
    steps = [],
    activeKey = null
} = {}) {
    const visible = (Array.isArray(steps) ? steps : []).filter(s => s && s.status !== 'hidden');
    if (!visible.length) return null;

    return html`
        <div class="v7-journey-lane" role="navigation" aria-label="Anxiety to Trust journey"
             style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;padding:10px 4px;">
            ${visible.map((step, idx) => {
                const style = STATUS_STYLE[step.status] || STATUS_STYLE.locked;
                const isActive = activeKey && step.key === activeKey;
                const isLocked = step.status === 'locked';
                const pillStyle = `display:inline-flex;align-items:center;gap:6px;
                    padding:7px 13px;border-radius:999px;
                    background:${style.bg};border:1.5px solid ${isActive ? style.dot : style.border};
                    color:${style.text};font-weight:600;font-size:0.84rem;
                    text-decoration:none;cursor:${isLocked ? 'not-allowed' : 'pointer'};
                    transition:all 120ms ease;
                    ${isActive ? 'box-shadow:0 2px 8px rgba(15,23,42,0.08);' : ''}`;
                return html`
                    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                        ${isLocked ? html`
                            <span style=${pillStyle} title="Add-on required">
                                <i class="ti ti-lock" style="font-size:0.78rem;"></i>
                                <span>${step.label}</span>
                            </span>
                        ` : html`
                            <a href=${step.href || '#'} style=${pillStyle}>
                                <span aria-hidden="true" style="display:inline-block;width:7px;height:7px;border-radius:999px;background:${style.dot};"></span>
                                <span>${step.label}</span>
                            </a>
                        `}
                        ${step.hint ? html`<span style="font-size:0.66rem;color:#94a3b8;font-weight:500;">${step.hint}</span>` : null}
                    </div>
                    ${idx < visible.length - 1 ? html`
                        <span aria-hidden="true" style="color:#94a3b8;font-weight:400;align-self:center;padding-top:6px;">→</span>
                    ` : null}
                `;
            })}
        </div>
    `;
}

export default JourneyLane;
