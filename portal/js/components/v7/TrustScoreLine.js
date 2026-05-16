/**
 * TrustScoreLine — the single buyer-facing score on Hub.
 *
 * Display rules (binding):
 * - Score is clamped to [5, 100] for display. We never show 0; a real failing
 *   posture floors at 5 and reads "Critical — needs immediate action" so the
 *   buyer sees a present-but-failing system, not a broken one.
 * - When `baseline === 'building'` (no telemetry yet), we show "—" with
 *   "Building baseline" — never a fake score.
 * - Trajectory glyph names a pattern (calm, not alarmist):
 *     climbing  ▲  · plateau ━ · slipping ▼ · recovering ✦
 *   When fewer than 3 samples are available we omit the glyph and say
 *   "Building trajectory" instead.
 *
 * Props:
 *   score            number | null   — composite 0..100
 *   grade            'A'|'B'|'C'|'D'|'F' | null
 *   trajectory       'climbing'|'plateau'|'slipping'|'recovering' | null
 *   delta            number | null   — change vs window (e.g. 14d)
 *   deltaWindowLabel string         — "since last week" / "vs 14 days ago"
 *   baseline         'building'|'ready'
 *   onDrillDown      function       — click handler to open component breakdown
 *   components       { hygiene?: number, risk?: number, compliance?: number }
 */

const { html } = window;

const TRAJECTORY_GLYPHS = {
    climbing:   { glyph: '▲', label: 'Climbing',   tone: 'success' },
    plateau:    { glyph: '━', label: 'Plateau',    tone: 'secondary' },
    slipping:   { glyph: '▼', label: 'Slipping',   tone: 'danger' },
    recovering: { glyph: '✦', label: 'Recovering', tone: 'info' }
};

const GRADE_TONE = {
    A: 'success',
    B: 'success',
    C: 'warning',
    D: 'warning',
    F: 'danger'
};

function clampScoreForDisplay(score) {
    if (score === null || score === undefined || !Number.isFinite(score)) return null;
    const n = Math.round(Number(score));
    if (n < 5) return 5;
    if (n > 100) return 100;
    return n;
}

// Component-score tone — used by the breakdown sub-cards so the buyer
// reads "is 85 good or bad?" at a glance. Aligned with Grade B floor (80).
function componentScoreTone(score) {
    if (score === null || score === undefined || !Number.isFinite(score)) return 'secondary';
    const n = Number(score);
    if (n >= 80) return 'success';
    if (n >= 60) return 'warning';
    return 'danger';
}

function gradeMeaning(grade, score) {
    if (score === null) return '';
    if (score <= 5) return 'Critical — needs immediate action';
    switch (grade) {
        case 'A': return 'Trust is strong';
        case 'B': return 'Trust is solid';
        case 'C': return 'Trust is uneven';
        case 'D': return 'Trust is fragile';
        case 'F': return 'Trust at risk';
        default:  return '';
    }
}

export function TrustScoreLine({
    score = null,
    grade = null,
    trajectory = null,
    delta = null,
    deltaWindowLabel = 'since last week',
    baseline = 'ready',
    onDrillDown = null,
    components = null,
    expanded = false
} = {}) {
    const displayScore = clampScoreForDisplay(score);
    const isBuilding = baseline === 'building' || displayScore === null;
    const traj = trajectory && TRAJECTORY_GLYPHS[trajectory];
    const meaning = gradeMeaning(grade, displayScore);
    const tone = grade ? (GRADE_TONE[grade] || 'secondary') : 'secondary';

    const interactive = typeof onDrillDown === 'function';
    const wrapperStyle = interactive
        ? 'cursor:pointer;border-radius:14px;padding:14px 18px;transition:background 120ms ease;'
        : 'border-radius:14px;padding:14px 18px;';

    const handleClick = () => { if (interactive) onDrillDown(); };
    const handleKey = (e) => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onDrillDown(); } };

    return html`
           <div class=${`v7-trust-score-line ${interactive ? 'v7-trust-score-line--interactive' : ''} ${expanded ? 'v7-trust-score-line--expanded' : ''}`}
             role=${interactive ? 'button' : null}
             tabindex=${interactive ? '0' : null}
             aria-label=${interactive ? 'Open Trust Score breakdown' : null}
               aria-expanded=${interactive ? String(!!expanded) : null}
             onClick=${handleClick}
             onKeyDown=${handleKey}
             style=${wrapperStyle}>
            <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
                <div style="display:flex;align-items:baseline;gap:14px;min-width:0;">
                    <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:#475569;">Trust Score</div>
                    ${isBuilding ? html`
                        <div style="font-size:3rem;font-weight:800;line-height:1;color:#94a3b8;">—</div>
                        <div style="font-size:0.85rem;color:#475569;font-weight:600;">Building baseline</div>
                    ` : html`
                        <div style="font-size:3rem;font-weight:800;line-height:1;color:#0f172a;">${displayScore}<span style="font-size:1.1rem;font-weight:600;color:#94a3b8;margin-left:2px;">/100</span></div>
                        ${grade ? html`<span class="badge bg-${tone}-lt text-${tone}" style="font-size:0.85rem;font-weight:700;padding:4px 10px;">Grade ${grade}</span>` : null}
                        ${traj ? html`
                            <span class="text-${traj.tone}" title=${traj.label} style="font-size:0.95rem;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
                                <span aria-hidden="true">${traj.glyph}</span>
                                <span>${traj.label}</span>
                            </span>
                        ` : html`
                            <span class="text-muted" style="font-size:0.78rem;font-weight:600;">Building trajectory</span>
                        `}
                        ${(delta !== null && Number.isFinite(delta) && trajectory) ? html`
                            <span class="text-muted" style="font-size:0.78rem;">${delta > 0 ? '+' : ''}${Math.round(delta)} ${deltaWindowLabel}</span>
                        ` : null}
                    `}
                </div>
            </div>
            ${meaning ? html`
                <div style="margin-top:6px;color:#475569;font-size:0.88rem;font-weight:500;">${meaning}</div>
            ` : null}
            ${(interactive && components) ? html`
                <div style="margin-top:6px;color:#94a3b8;font-size:0.72rem;font-weight:600;letter-spacing:0.04em;">
                    View score breakdown
                </div>
                <span class="v7-trust-expand-indicator" aria-hidden="true">
                    <i class=${expanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down'}></i>
                </span>
            ` : null}
        </div>
    `;
}

/**
 * Drill-down panel showing the 3 component scores. Render below TrustScoreLine
 * when expanded.
 */
export function TrustScoreBreakdown({ components = null, onClose = null } = {}) {
    if (!components) return null;
    const items = [
        { key: 'hygiene',    label: 'Hygiene',    desc: 'Volume + severity of unpatched issues across your fleet.' },
        { key: 'risk',       label: 'Risk',       desc: 'Business impact weighted by exploitability and asset importance.' },
        { key: 'compliance', label: 'Compliance', desc: 'Alignment with the framework controls you have committed to.' }
    ];
    return html`
        <div class="v7-trust-score-breakdown" style="border-top:1px solid rgba(148,163,184,0.2);padding:14px 18px;background:rgba(248,250,252,0.65);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:#475569;">Trust Score breakdown</div>
                    ${onClose ? html`<button class="btn btn-sm btn-link p-0" onClick=${onClose} aria-label="Close breakdown"><i class="ti ti-x" aria-hidden="true"></i></button>` : null}
                </div>
                <div class="row g-3">
                    ${items.map((it) => {
                        const raw = components[it.key];
                        const v = clampScoreForDisplay(raw);
                        const display = v === null ? '—' : v;
                        const tone = componentScoreTone(v);
                        return html`
                            <div class="col-md-4">
                                <div class="v7-tsb-card" style="padding:10px 12px;border:1px solid rgba(148,163,184,0.18);border-radius:10px;background:rgba(248,250,252,0.6);">
                                    <div style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:#475569;">${it.label}</div>
                                    <div class="text-${tone}" style="font-size:1.6rem;font-weight:800;line-height:1.1;margin-top:4px;">${display}</div>
                                    <div style="font-size:0.78rem;color:#475569;margin-top:6px;line-height:1.45;">${it.desc}</div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
                <div style="margin-top:10px;font-size:0.72rem;color:#94a3b8;">
                    Trust Score blends these three. <a href="#!/help/score-guidance">How scoring works →</a>
                </div>
        </div>
    `;
}

export default TrustScoreLine;
