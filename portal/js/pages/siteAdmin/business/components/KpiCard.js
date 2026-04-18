/**
 * KpiCard — Reusable business KPI card with optional sparkline and trend badge.
 *
 * Props:
 *   icon       — Tabler icon name (e.g. 'currency-dollar')
 *   label      — Short card title
 *   value      — Main formatted value (string)
 *   subtitle   — Optional secondary line
 *   trend      — { pct: number, label: string } — trend badge
 *   sparkData  — number[] for inline sparkline
 *   sparkColor — sparkline stroke color
 *   color      — card accent color name (primary, success, danger, …)
 *   onClick    — optional click handler
 */
import { sparklineConfig, destroyChart } from '../businessChartTheme.js';
import { trendArrow } from '../businessConstants.js';

const { html } = window;
const { useRef, useEffect } = window.preactHooks;

function getRibbonMeta(trend, color) {
    if (trend && trend.pct != null) {
        const delta = Number(trend.pct || 0);
        const positive = trend.higherIsBetter !== false ? delta >= 0 : delta <= 0;
        if (Math.abs(delta) < 0.25) {
            return { label: 'Stable', background: 'linear-gradient(135deg, #64748b, #94a3b8)' };
        }
        return positive
            ? { label: 'Good', background: 'linear-gradient(135deg, #16a34a, #22c55e)' }
            : { label: 'Watch', background: 'linear-gradient(135deg, #d97706, #f59e0b)' };
    }

    const byColor = {
        success: { label: 'Good', background: 'linear-gradient(135deg, #16a34a, #22c55e)' },
        warning: { label: 'Watch', background: 'linear-gradient(135deg, #d97706, #f59e0b)' },
        danger: { label: 'Risk', background: 'linear-gradient(135deg, #dc2626, #ef4444)' },
        primary: { label: 'Live', background: 'linear-gradient(135deg, #2563eb, #4f46e5)' },
    };

    return byColor[color] || { label: 'Live', background: 'linear-gradient(135deg, #2563eb, #4f46e5)' };
}

export function KpiCard({ icon, label, value, subtitle, trend, sparkData, sparkColor, color, onClick }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!sparkData || sparkData.length < 2 || !canvasRef.current || !window.Chart) return;
        destroyChart(canvasRef);
        const cfg = sparklineConfig(sparkData, sparkColor || '#0054a6');
        chartRef.current = new window.Chart(canvasRef.current.getContext('2d'), cfg);
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [sparkData, sparkColor]);

    const accentClass = color ? `border-start border-3 border-${color}` : '';
    const ribbon = getRibbonMeta(trend, color);
    const trendClass = trend && trend.pct != null
        ? ((trend.higherIsBetter !== false ? Number(trend.pct || 0) >= 0 : Number(trend.pct || 0) <= 0)
            ? 'text-success'
            : 'text-warning')
        : 'text-muted';

    return html`
        <div class="card card-sm kpi-card h-100 w-100 position-relative overflow-hidden shadow-sm ${accentClass}" style=${`${onClick ? 'cursor:pointer;' : ''} min-height:138px;`} onClick=${onClick}>
            <div style=${`position:absolute;top:10px;right:-6px;background:${ribbon.background};color:#fff;padding:4px 12px;border-radius:999px 0 0 999px;font-size:.68rem;font-weight:800;letter-spacing:.02em;box-shadow:0 6px 16px rgba(15,23,42,.18);z-index:1;`}>
                ${ribbon.label}
            </div>
            <div class="card-body d-flex flex-column justify-content-between h-100">
                <div class="d-flex align-items-start mb-1 pe-5">
                    ${icon && html`<span class="me-2 text-${color || 'primary'} mt-1"><i class="ti ti-${icon}" style="font-size:1.15rem"></i></span>`}
                    <div class="subheader" style="white-space:normal; line-height:1.2; word-break:break-word;">${label}</div>
                </div>
                <div class="mb-1" style="min-height:2.4rem; display:flex; align-items:flex-end; gap:.5rem; flex-wrap:wrap;">
                    <div class="h2 mb-0 me-2">${value}</div>
                    ${subtitle && html`<div class="text-muted small">${subtitle}</div>`}
                </div>
                <div class="d-flex align-items-center justify-content-between gap-2 mt-1">
                    ${trend && trend.pct != null
                        ? html`<span class=${`small fw-semibold ${trendClass}`} title="Directional change vs the previous comparison window">${trendArrow(trend.pct)} ${Math.abs(trend.pct).toFixed(1)}%</span>`
                        : html`<span class="small text-muted">No material change</span>`}
                    ${sparkData && sparkData.length >= 2 && html`
                        <div style="height:28px; width:92px; margin-left:auto;">
                            <canvas ref=${canvasRef} style="width:100%;height:100%"></canvas>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}
