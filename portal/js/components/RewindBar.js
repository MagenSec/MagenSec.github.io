/**
 * RewindBar — Dramatic "Time Warp Active" sticky banner shown when rewind mode is on.
 *
 * Design: Full-width amber-orange bar with:
 *   - "⏪ TIME WARP ACTIVE" label
 *   - Snapshot date chip (click to open inline date picker)
 *   - ← Earlier / Later → day-step buttons
 *   - ↩ Return to Live button
 *   - body.rewind-active class management for CSS page tinting
 *
 * No slider — the date chip and prev/next buttons are the primary controls.
 * The navbar dropdown panel (see index.html + app.js) handles initial date selection.
 */

import { rewindContext } from '@rewindContext';
import { logger } from '../config.js';

const { h, Component } = window.preact;
const { useState, useEffect, useCallback, useRef } = window.preactHooks;
const html = window.htm.bind(h);

// Build the last 365 days as yyyyMMdd strings, OLDEST FIRST
function buildDateRange() {
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 364; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(rewindContext.toDateKey(d));
    }
    return dates;
}

function toIsoDate(dateKey) {
    if (!dateKey || dateKey.length !== 8) return '';
    return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

function fromIsoDate(iso) {
    return iso ? iso.replace(/-/g, '') : '';
}

const DATE_RANGE = buildDateRange();
const MIN_ISO = toIsoDate(DATE_RANGE[0]);
const MAX_ISO = toIsoDate(DATE_RANGE[DATE_RANGE.length - 1]);

export function RewindBar() {
    const [active, setActive]       = useState(rewindContext.isActive());
    const [date, setDate]           = useState(rewindContext.getDate() || DATE_RANGE[DATE_RANGE.length - 1]);
    const [visible, setVisible]     = useState(rewindContext.isActive());
    const debounceTimer = useRef(null);

    // Subscribe to rewindContext state changes
    useEffect(() => {
        const unsub = rewindContext.onChange(newDate => {
            const nowActive = newDate !== null;
            setActive(nowActive);
            if (nowActive) {
                setDate(newDate);
                setVisible(true);
            } else {
                setVisible(false);
            }
        });
        return unsub;
    }, []);

    // Add/remove body class so CSS can apply page-wide visual treatment
    useEffect(() => {
        document.body.classList.toggle('rewind-active', visible);
        return () => {
            if (!rewindContext.isActive()) document.body.classList.remove('rewind-active');
        };
    }, [visible]);

    // Keyboard shortcuts: ← / → to step days, Esc to exit
    useEffect(() => {
        if (!visible) return;
        const onKey = (e) => {
            if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                stepDay(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                stepDay(1);
            } else if (e.key === 'Escape') {
                rewindContext.deactivate();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [visible]);

    // Step the display date immediately for snappy UI feel,
    // but debounce the API-triggering rewindContext.activate() call
    // so rapid clicks (20x Earlier) only fire one activation.
    // Triggers a brief warp-flash animation on the page body.
    const stepDay = useCallback((delta) => {
        setDate(prev => {
            const idx = DATE_RANGE.indexOf(prev);
            const newIdx = Math.max(0, Math.min(DATE_RANGE.length - 1, idx + delta));
            const next = DATE_RANGE[newIdx];
            if (next !== prev) {
                // Warp-flash visual
                document.body.classList.remove('rewind-travelling');
                void document.body.offsetWidth; // force reflow to restart animation
                document.body.classList.add('rewind-travelling');
                setTimeout(() => document.body.classList.remove('rewind-travelling'), 520);

                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                debounceTimer.current = setTimeout(() => {
                    rewindContext.activate(next);
                }, 600);
            }
            return next;
        });
    }, []);

    const handleExit = useCallback(() => rewindContext.deactivate(), []);

    if (!visible) return null;

    const isoDate   = toIsoDate(date);
    const label     = rewindContext.getDateLabel() || isoDate;
    const isOldest  = date === DATE_RANGE[0];
    const isNewest  = date === DATE_RANGE[DATE_RANGE.length - 1];

    // Relative time label — futuristic/military framing
    const timelineLabel = (() => {
        if (!isoDate) return '';
        const d = new Date(isoDate);
        const today = new Date(); today.setHours(0,0,0,0);
        const diff = Math.round((today - d) / 86400000);
        if (diff === 0) return 'T\u20130 \u00B7 Present';
        if (diff === 1) return 'T\u22121D \u00B7 Yesterday';
        if (diff < 7)   return `T\u2212${diff}D`;
        if (diff < 30)  return `T\u2212${diff}D \u00B7 ${Math.round(diff/7)}W`;
        if (diff < 365) {
            const mo = Math.floor(diff / 30);
            const rem = diff % 30;
            return rem > 0 ? `T\u2212${diff}D \u00B7 ${mo}M ${rem}D` : `T\u2212${diff}D \u00B7 ${mo}M`;
        }
        return `T\u2212${diff}D \u00B7 ${Math.floor(diff/365)}Y`;
    })();

    const btnBase = `
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(255,255,255,0.45);
        border-radius: 6px;
        color: #fff;
        font-size: 0.82rem;
        font-weight: 700;
        padding: 3px 13px;
        cursor: pointer;
        white-space: nowrap;
        line-height: 1.4;
    `;

    return html`
        <div
            id="rewind-bar"
            role="status"
            aria-live="polite"
            aria-label="Time Warp mode active"
            style="
                position: relative;
                z-index: 1;
                background: linear-gradient(90deg, #b45309 0%, #d97706 30%, #f59f00 65%, #f76707 100%);
                color: #fff;
                padding: 0 16px;
                display: flex;
                align-items: center;
                gap: 0;
                height: 40px;
                box-shadow: 0 3px 12px rgba(245, 159, 0, 0.4), 0 1px 0 rgba(255,255,255,0.12) inset;
                animation: rewindBarSlideDown 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
                overflow: hidden;
            "
        >
            <!-- ⏪ TIME WARP label -->
            <div style="
                display:flex; align-items:center; gap:8px;
                padding-right:16px;
                border-right:1px solid rgba(255,255,255,0.28);
                flex-shrink:0;
            ">
                <span style="font-size:1.15rem; animation:rewindIconSpin 3s ease-in-out infinite; display:inline-block;">⏪</span>
                <div>
                    <div style="font-weight:900; font-size:0.72rem; letter-spacing:0.1em; line-height:1.1;">TIME WARP</div>
                    <div style="font-size:0.6rem; opacity:0.7; letter-spacing:0.06em; line-height:1;">ACTIVE</div>
                </div>
            </div>

            <!-- ← Earlier  [timeline chip]  Later → (no calendar — use top Time Warp button to change date) -->
            <div style="
                display:flex; align-items:center; gap:6px;
                padding:0 14px;
                border-right:1px solid rgba(255,255,255,0.28);
                flex-shrink:0;
            ">
                <button
                    onClick=${() => stepDay(-1)}
                    disabled=${isOldest}
                    title="Step to previous day (\u2190 key)"
                    aria-label="Previous day"
                    style="${btnBase} opacity:${isOldest ? 0.38 : 1}; cursor:${isOldest ? 'not-allowed' : 'pointer'};"
                >\u2190 Earlier</button>

                <!-- Timeline chip: date + T-minus offset, non-interactive -->
                <div style="
                    display:flex; flex-direction:column; align-items:center;
                    background: rgba(0,0,0,0.25);
                    border: 1.5px solid rgba(255,255,255,0.45);
                    border-radius: 20px;
                    padding: 2px 14px;
                    min-width: 120px; text-align: center;
                    cursor: default; user-select: none;
                ">
                    <span style="font-size:0.83rem; font-weight:800; letter-spacing:0.02em; line-height:1.3; white-space:nowrap;">${label}</span>
                    <span style="font-size:0.6rem; opacity:0.75; letter-spacing:0.07em; font-family:monospace; line-height:1; white-space:nowrap;">${timelineLabel}</span>
                </div>

                <button
                    onClick=${() => stepDay(1)}
                    disabled=${isNewest}
                    title="Step to next day (\u2192 key)"
                    aria-label="Next day"
                    style="${btnBase} opacity:${isNewest ? 0.38 : 1}; cursor:${isNewest ? 'not-allowed' : 'pointer'};"
                >Later \u2192</button>
            </div>

            <!-- Spacer hint -->
            <span style="
                flex: 1 1 0;
                font-size: 0.7rem;
                opacity: 0.65;
                padding: 0 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                min-width: 0;
            ">
                Viewing your security posture as of ${label}
                <span style="opacity:0.55; margin-left:8px;">← → step · Esc exit</span>
            </span>

            <!-- Return to Present Day -->
            <button
                onClick=${handleExit}
                aria-label="Return to present day"
                title="Exit Time Warp — return to present day (Esc)"
                style="
                    background: rgba(0,0,0,0.35);
                    border: 1.5px solid rgba(255,255,255,0.5);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.82rem;
                    font-weight: 800;
                    padding: 4px 16px;
                    cursor: pointer;
                    white-space: nowrap;
                    letter-spacing: 0.03em;
                    transition: background 0.15s;
                    flex-shrink: 0;
                "
            >\u2192 Present Day</button>
        </div>

        <style>
            @keyframes rewindBarSlideDown {
                from { opacity: 0; transform: translateY(-110%); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes rewindIconSpin {
                0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
                40%       { transform: scale(1.15) rotate(-8deg); opacity: 0.85; }
                60%       { transform: scale(1.1) rotate(5deg); opacity: 0.9; }
            }
            #rewind-bar input[type="date"]::-webkit-calendar-picker-indicator {
                filter: invert(1);
                cursor: pointer;
            }
            #rewind-bar button:not([disabled]):hover {
                background: rgba(0,0,0,0.3) !important;
            }
        </style>
    `;
}

