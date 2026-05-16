/**
 * TimeWarpBanner (Slice 1 stub) — "Time-warped to {date} · Read-only".
 *
 * Slice 4 wires this universally across all pages. For Slice 1 it exposes
 * the API + visual so pages can opt in incrementally without API churn.
 *
 * Props:
 *   warpedTo   ISO datetime  — null when not warped
 *   onExit     function
 *   compact    bool (default false) — slim variant for sub-pages
 */

const { html } = window;

function fmtDate(iso) {
    if (!iso) return '';
    const d = (iso instanceof Date) ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
    return `${month} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function TimeWarpBanner({
    warpedTo = null,
    onExit = null,
    compact = false
} = {}) {
    if (!warpedTo) return null;
    const dateText = fmtDate(warpedTo);
    const padding = compact ? '6px 14px' : '10px 18px';
    return html`
        <div class="v7-timewarp-banner" role="status" aria-live="polite"
             style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
                    padding:${padding};border-radius:10px;
                    background:linear-gradient(90deg,rgba(99,102,241,0.12),rgba(124,58,237,0.08));
                    border:1px solid rgba(99,102,241,0.35);
                    color:#3730a3;font-weight:600;font-size:0.86rem;">
            <i class="ti ti-clock-bolt" style="font-size:1.05rem;"></i>
            <span>Time-warped to <strong>${dateText} (UTC)</strong> · Read-only</span>
            ${(typeof onExit === 'function') ? html`
                <button class="btn btn-sm btn-link" onClick=${onExit}
                        style="margin-left:auto;color:#3730a3;font-weight:700;text-decoration:none;">
                    Return to today →
                </button>
            ` : null}
        </div>
    `;
}

export default TimeWarpBanner;
