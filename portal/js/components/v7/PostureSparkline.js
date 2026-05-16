/**
 * PostureSparkline — calm 14-day trajectory.
 *
 * Display rules (binding):
 * - When data is missing or has fewer than 3 samples, render a HOLLOW grey
 *   placeholder ("Building 14-day trajectory") — never full-height bars on
 *   a new org. Customers should see the system is honest about what it knows.
 * - The ready state is a compact line/area chart so trajectory reads as
 *   movement instead of a tiny histogram.
 * - Pure SVG; no chart library; prints well; works offline.
 *
 * Props:
 *   series  Array<{date: ISO|Date, value: number}>  — chronological asc
 *   days    number (default 14)                    — window
 *   height  number (default 64)                    — px
 *   ariaLabel string
 */

const { html } = window;

function normalizeSeries(series, days) {
    if (!Array.isArray(series)) return [];
    const arr = [];
    for (const point of series) {
        if (!point) continue;
        const value = Number(point.value ?? point.score ?? point.trustScore ?? point.y ?? null);
        if (!Number.isFinite(value)) continue;
        const date = point.date ?? point.day ?? point.timestamp ?? point.asOfDate ?? null;
        arr.push({ date, value });
    }
    return arr.slice(-days);
}

function isoDayKey(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
}

function formatScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : '--';
}

export function PostureSparkline({
    series = null,
    days = 14,
    height = 64,
    ariaLabel = '14-day Trust Score trend'
} = {}) {
    const data = normalizeSeries(series, days);
    const hasEnough = data.length >= 3;

    // Layout
    const slotCount = days;
    const width = 360;
    const padLeft = 10;
    const padRight = 10;
    const padTop = 10;
    const padBottom = 24;
    const usableW = width - padLeft - padRight;
    const usableH = height - padTop - padBottom;

    if (!hasEnough) {
        // Hollow placeholder — calm grey rounded rects + label
        const points = Array.from({ length: slotCount }, (_, i) => {
            const x = padLeft + (i / Math.max(1, slotCount - 1)) * usableW;
            const wave = Math.sin(i / Math.max(1, slotCount - 1) * Math.PI * 1.5);
            const y = padTop + usableH * (0.52 + wave * 0.08);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return html`
            <div class="v7-posture-chart v7-posture-chart--building"
                 role="img" aria-label="${ariaLabel}: building baseline">
                <svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`}
                     class="v7-posture-chart-svg">
                    <path d=${`M ${points.join(' L ')}`} class="v7-posture-chart-placeholder" />
                    ${points.map((point) => {
                        const [x, y] = point.split(',');
                        return html`<circle cx=${x} cy=${y} r="2.2" class="v7-posture-chart-ghost-dot" />`;
                    })}
                    <text x=${padLeft} y=${height - 5} class="v7-posture-chart-axis-label">Building ${days}-day trajectory</text>
                </svg>
            </div>
        `;
    }

    // Map data into the most recent N slots, fill earlier slots with empty
    const slots = Array.from({ length: slotCount }, () => null);
    const offset = slotCount - data.length;
    for (let i = 0; i < data.length; i++) {
        slots[offset + i] = data[i];
    }

    const max = 100; // Trust Score is always 0..100
    const min = 0;
    const range = max - min;

    const last = data[data.length - 1];
    const first = data[0];
    const delta = (Number(last.value) || 0) - (Number(first.value) || 0);
    const trendTone = Math.abs(delta) < 2 ? 'rgba(100,116,139,0.85)'
        : (delta > 0 ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)');
    const plotPoints = [];
    slots.forEach((s, i) => {
        if (!s) return;
        const value = Math.max(min, Math.min(max, Number(s.value) || 0));
        const x = padLeft + (i / Math.max(1, slotCount - 1)) * usableW;
        const y = padTop + usableH - ((value - min) / range * usableH);
        plotPoints.push({ x, y, value, date: s.date, isLast: i === slots.length - 1 });
    });

    const linePath = plotPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = plotPoints.length
        ? `${linePath} L ${plotPoints[plotPoints.length - 1].x.toFixed(1)} ${height - padBottom} L ${plotPoints[0].x.toFixed(1)} ${height - padBottom} Z`
        : '';
    const startLabel = formatScore(first.value);
    const endLabel = formatScore(last.value);

    return html`
        <div class="v7-posture-chart" role="img" aria-label=${ariaLabel}
             style=${`--v7-chart-tone:${trendTone};`}>
            <svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`}
                 class="v7-posture-chart-svg">
                <line x1=${padLeft} x2=${width - padRight} y1=${padTop + usableH * 0.25} y2=${padTop + usableH * 0.25} class="v7-posture-chart-grid" />
                <line x1=${padLeft} x2=${width - padRight} y1=${padTop + usableH * 0.5} y2=${padTop + usableH * 0.5} class="v7-posture-chart-grid" />
                <line x1=${padLeft} x2=${width - padRight} y1=${padTop + usableH * 0.75} y2=${padTop + usableH * 0.75} class="v7-posture-chart-grid" />
                ${areaPath ? html`<path d=${areaPath} class="v7-posture-chart-area" />` : null}
                ${linePath ? html`<path d=${linePath} class="v7-posture-chart-line" />` : null}
                ${plotPoints.map((p, idx) => html`
                    <circle cx=${p.x.toFixed(1)} cy=${p.y.toFixed(1)} r=${p.isLast ? '4.4' : '2.6'}
                            class=${p.isLast ? 'v7-posture-chart-dot v7-posture-chart-dot--last' : 'v7-posture-chart-dot'}>
                        <title>${isoDayKey(p.date)}: ${Math.round(p.value)}</title>
                    </circle>
                `)}
                <text x=${padLeft} y=${height - 5} class="v7-posture-chart-axis-label">
                    ${startLabel} · Start
                </text>
                <text x=${width - padRight} y=${height - 5} text-anchor="end" class="v7-posture-chart-axis-label v7-posture-chart-axis-label--today">
                    ${endLabel} · Today
                </text>
            </svg>
        </div>
    `;
}

export default PostureSparkline;
