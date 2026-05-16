/**
 * PageModeShell — wraps a page with the right scaffolding for its Mode.
 *
 * Three modes (binding):
 *   A "Daily Evidence"  — Hub, Proof, Audit, Insurance.   Captured-report badge on top.
 *   B "Evidence + Δ"    — Compliance, Hygiene, Industry.  Captured-report badge + delta ribbon.
 *   C "Live Operations" — Remediation, Inventory, Action Center, Site-Admin
 *                          observability. Live indicator (pulse dot) on top.
 *
 * Time-warp overrides everything: when warpedTo is set, all modes show
 * the TimeWarpBanner instead of their normal captured/live indicator.
 *
 * Props:
 *   mode        'A' | 'B' | 'C'
 *   title       string
 *   subtitle    string
 *   sealedAt    ISO datetime          — required for mode A/B
 *   warpedTo    ISO datetime | null
 *   onExitWarp  function | null
 *   delta       node | null           — DeltaRibbon element for mode B
 *   actions     node | null           — right-side header actions
 *   children    node                  — page content
 */

const { html } = window;

function fmtUtcCompact(iso) {
    if (!iso) return '';
    const d = (iso instanceof Date) ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
    return `${month} ${day} · ${hh}:${mm} UTC`;
}

function ModeIndicator({ mode, sealedAt }) {
    if (mode === 'C') {
        return html`
            <span class="v7-mode-indicator v7-mode-indicator--live"
                  style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2fb344;">
                <span aria-hidden="true" style="width:8px;height:8px;border-radius:999px;background:#2fb344;box-shadow:0 0 0 0 rgba(34,197,94,0.5);animation:v7-pulse 2s infinite;"></span>
                Live operations
            </span>
        `;
    }
    // A or B: captured daily report indicator
    if (!sealedAt) {
        return html`
            <span class="v7-mode-indicator v7-mode-indicator--building"
                  style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">
                <i class="ti ti-mail" aria-hidden="true" style="font-size:0.9rem;"></i>
                Awaiting first report
            </span>
        `;
    }
    return html`
        <span class="v7-mode-indicator v7-mode-indicator--sealed"
              style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f59f00;">
            <i class="ti ti-mail-opened" aria-hidden="true" style="font-size:0.9rem;"></i>
            Captured · ${fmtUtcCompact(sealedAt)}
        </span>
    `;
}

export function PageModeShell({
    mode = 'A',
    title = '',
    subtitle = '',
    sealedAt = null,
    warpedTo = null,
    onExitWarp = null,
    delta = null,
    actions = null,
    children = null
} = {}) {
    return html`
        <div class="v7-page-shell v7-page-shell--mode-${mode.toLowerCase()}"
             style="display:flex;flex-direction:column;gap:14px;">
            ${warpedTo ? html`
                <div style="padding:0 4px;">
                    <div class="v7-timewarp-banner" role="status" aria-live="polite"
                         style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
                                padding:10px 18px;border-radius:10px;
                                background:linear-gradient(90deg,rgba(99,102,241,0.12),rgba(124,58,237,0.08));
                                border:1px solid rgba(99,102,241,0.35);
                                color:#3730a3;font-weight:600;font-size:0.86rem;">
                        <i class="ti ti-clock-bolt" aria-hidden="true"></i>
                        <span>Time-warped — read-only</span>
                        ${(typeof onExitWarp === 'function') ? html`
                            <button class="btn btn-sm btn-link" onClick=${onExitWarp}
                                    style="margin-left:auto;color:#3730a3;font-weight:700;text-decoration:none;">
                                Return to today →
                            </button>
                        ` : null}
                    </div>
                </div>
            ` : null}

            <header class="v7-page-header"
                    style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:4px;">
                <div style="min-width:0;">
                    <${ModeIndicator} mode=${mode} sealedAt=${sealedAt} />
                    ${title ? html`<h1 style="font-size:1.5rem;font-weight:800;margin:6px 0 2px;color:var(--tblr-body-color,#0f172a);">${title}</h1>` : null}
                    ${subtitle ? html`<div style="color:var(--tblr-secondary-color,#475569);font-size:0.92rem;line-height:1.4;">${subtitle}</div>` : null}
                </div>
                ${actions ? html`<div style="display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>` : null}
            </header>

            ${(mode === 'B' && delta) ? html`<div style="padding:0 4px;">${delta}</div>` : null}

            <div class="v7-page-body">${children}</div>
        </div>
    `;
}

export default PageModeShell;
