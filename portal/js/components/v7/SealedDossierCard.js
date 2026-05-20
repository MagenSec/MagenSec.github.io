/**
 * SealedDossierCard — the trust signal.
 *
 * Display rules (binding):
 * - Wax-seal SVG (decorative, calm) + monospace UTC timestamp + Open / Refresh.
 * - When `state === 'building'`, show "First report is prepared after the first daily run"
 *   instead of fake date. No exclamation marks.
 * - When `state === 'stale'` (past 26h), say "Refresh pending" — never alarm.
 * - The Daily Report IS the trust signal. Treat it like an immutable evidence record.
 *
 * Props:
 *   sealedAt   ISO datetime  — when last sealed
 *   summary    string        — one-line summary of what's inside
 *   href       string        — Open Daily Report link (default #!/proof)
 *   onRefresh  function | null — Refresh action; null hides the button
 *   onSummarize function | null — Ask MAGI for stakeholder summary
 *   state      'sealed'|'building'|'stale' — visual variant
 */

const { html } = window;

function fmtUtc(iso) {
    if (!iso) return '';
    const d = (iso instanceof Date) ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()];
    const month   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
    const day     = String(d.getUTCDate()).padStart(2, '0');
    const year    = d.getUTCFullYear();
    const hh      = String(d.getUTCHours()).padStart(2, '0');
    const mm      = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm} UTC · ${dayName} ${month} ${day}, ${year}`;
}

function WaxSeal({ size = 36, tone = 'sealed' }) {
    // Wax-seal SVG. Color tokens are CSS custom properties so dark mode can override.
    // sealed → amber/wax. building/stale → slate.
    const className = tone === 'sealed'
        ? 'v7-dossier-seal v7-dossier-seal--sealed'
        : `v7-dossier-seal v7-dossier-seal--${tone}`;
    return html`
        <svg class=${className} width=${size} height=${size} viewBox="0 0 36 36" aria-hidden="true">
            <circle class="v7-dossier-seal-fill" cx="18" cy="18" r="14" stroke-width="1.2" />
            <circle class="v7-dossier-seal-ring" cx="18" cy="18" r="9" fill="none" stroke-width="1.4" stroke-dasharray="2 2" />
            <text class="v7-dossier-seal-glyph" x="18" y="22" text-anchor="middle" font-family="serif" font-weight="700" font-size="11">M</text>
        </svg>
    `;
}

export function SealedDossierCard({
    sealedAt = null,
    summary = '',
    href = '#!/proof',
    onRefresh = null,
    onSummarize = null,
    state = 'sealed'
} = {}) {
    const tone = state || (sealedAt ? 'sealed' : 'building');
    const sealedText = sealedAt ? fmtUtc(sealedAt) : '';

    return html`
        <div class=${`v7-sealed-dossier v7-sealed-dossier--${tone}`}>
            <div class="v7-sealed-dossier-seal">
                <${WaxSeal} size=${44} tone=${tone} />
            </div>
            <div class="v7-sealed-dossier-body">
                <div class="v7-sealed-dossier-eyebrow">Daily Report</div>
                ${tone === 'building' ? html`
                    <div class="v7-sealed-dossier-title">First report is prepared after the first daily run</div>
                    <div class="v7-sealed-dossier-sub">Once enough telemetry arrives, MagenSec captures an immutable daily evidence record.</div>
                ` : tone === 'stale' ? html`
                    <div class="v7-sealed-dossier-time">Last captured: ${sealedText}</div>
                    <div class="v7-sealed-dossier-sub">Refresh pending — telemetry refresh in progress.</div>
                ` : html`
                    <div class="v7-sealed-dossier-time">Captured at ${sealedText}</div>
                    ${summary ? html`<div class="v7-sealed-dossier-summary">${summary}</div>` : null}
                `}
            </div>
            <div class="v7-sealed-dossier-actions">
                ${(typeof onSummarize === 'function') ? html`
                    <button class="btn btn-sm v7-sealed-dossier-summary-btn" onClick=${onSummarize} title="Ask Officer MAGI to draft a stakeholder summary">
                        <i class="ti ti-sparkles me-1" aria-hidden="true"></i>Draft summary
                    </button>
                ` : null}
                <a href=${href} class="btn btn-sm v7-sealed-dossier-open">
                    <i class="ti ti-mail-opened me-1"></i>Open Daily Report
                </a>
                ${(typeof onRefresh === 'function') ? html`
                    <button class="btn btn-sm v7-sealed-dossier-refresh" data-mutates-state="true" onClick=${onRefresh} title="Prepare latest report from current telemetry" aria-label="Prepare latest report">
                        <i class="ti ti-refresh"></i>
                    </button>
                ` : null}
            </div>
        </div>
    `;
}

export default SealedDossierCard;
