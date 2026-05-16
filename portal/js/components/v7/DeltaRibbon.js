/**
 * DeltaRibbon (Slice 1 stub) — "Since the capture: +X · -Y · …"
 *
 * Slice 2 will wire this to the Atom-since-seal feed. For Slice 1 it renders
 * a calm one-liner so the API surface stabilizes; pages can drop it in without
 * waiting for the backend.
 *
 * Props:
 *   sinceSealedAt ISO datetime
 *   changes Array<{ label, count, kind: 'added'|'resolved'|'changed'|'sealed' }>
 *   onClick function
 */

const { html } = window;

const KIND_TONE = {
    added:    { sign: '+', tone: 'rgba(239,68,68,0.85)' },
    resolved: { sign: '−', tone: 'rgba(34,197,94,0.85)' },
    changed:  { sign: '~', tone: 'rgba(124,58,237,0.85)' },
    sealed:   { sign: '✦', tone: 'rgba(180,83,9,0.85)' }
};

export function DeltaRibbon({
    sinceSealedAt = null,
    changes = [],
    onClick = null
} = {}) {
    const items = (Array.isArray(changes) ? changes : []).filter(c => c && Number(c.count) > 0).slice(0, 5);
    if (!items.length) return null;

    const interactive = typeof onClick === 'function';
    const wrapperStyle = `display:flex;align-items:center;gap:10px;flex-wrap:wrap;
        padding:8px 14px;border-radius:10px;
        background:linear-gradient(90deg,rgba(124,58,237,0.06),rgba(180,83,9,0.04));
        border:1px solid rgba(180,83,9,0.16);
        font-size:0.78rem;color:#475569;
        ${interactive ? 'cursor:pointer;' : ''}`;

    return html`
        <div class="v7-delta-ribbon"
             role=${interactive ? 'button' : null}
             tabindex=${interactive ? '0' : null}
             onClick=${interactive ? onClick : null}
             style=${wrapperStyle}>
            <span style="font-weight:700;letter-spacing:0.04em;color:#475569;">Since the capture:</span>
            ${items.map((c, idx) => {
                const k = KIND_TONE[c.kind] || KIND_TONE.changed;
                return html`
                    <span style="display:inline-flex;align-items:center;gap:4px;">
                        <span style="color:${k.tone};font-weight:800;">${k.sign}${c.count}</span>
                        <span>${c.label}</span>
                        ${idx < items.length - 1 ? html`<span style="color:#94a3b8;">·</span>` : null}
                    </span>
                `;
            })}
            ${interactive ? html`<i class="ti ti-chevron-right" aria-hidden="true" style="margin-left:auto;color:#94a3b8;"></i>` : null}
        </div>
    `;
}

export default DeltaRibbon;
