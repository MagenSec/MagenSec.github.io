/**
 * Business Dashboard Chart Theme
 * Theme-aware Chart.js defaults and reusable chart factory helpers.
 */
import { TELEMETRY_COLORS } from './businessConstants.js';

// ── Theme Detection ─────────────────────────────────────────────────
export function isDarkMode() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark';
}

export function themeColors() {
    const dark = isDarkMode();
    return {
        text:       dark ? '#c8d3e0' : '#1e293b',
        muted:      dark ? '#6c7a89' : '#94a3b8',
        gridLine:   dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        cardBg:     dark ? '#1e293b' : '#ffffff',
        tooltipBg:  dark ? '#334155' : '#ffffff',
        tooltipText:dark ? '#e2e8f0' : '#1e293b',
    };
}

// ── Palette ─────────────────────────────────────────────────────────
export const CHART_PALETTE = [
    '#0054a6', '#2fb344', '#f59f00', '#d63939', '#ae3ec9',
    '#0ca678', '#f76707', '#74b816', '#e8590c', '#4263eb',
];

export function telemetryColorArray(keys) {
    return keys.map(k => TELEMETRY_COLORS[k] || CHART_PALETTE[keys.indexOf(k) % CHART_PALETTE.length]);
}

// ── Destroy helper ──────────────────────────────────────────────────
export function destroyChart(canvasRef) {
    const canvas = canvasRef?.current;
    if (!canvas || !window.Chart || typeof window.Chart.getChart !== 'function') return;
    const existing = window.Chart.getChart(canvas);
    if (existing) existing.destroy();
}

// ── Base defaults ───────────────────────────────────────────────────
function baseDefaults() {
    const t = themeColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false, labels: { color: t.text, font: { size: 11 } } },
            tooltip: {
                backgroundColor: t.tooltipBg,
                titleColor: t.tooltipText,
                bodyColor: t.tooltipText,
                borderColor: t.gridLine,
                borderWidth: 1,
                padding: 8,
                cornerRadius: 6,
            },
        },
        scales: {
            x: { ticks: { color: t.muted, font: { size: 10 } }, grid: { color: t.gridLine } },
            y: { ticks: { color: t.muted, font: { size: 10 } }, grid: { color: t.gridLine } },
        },
    };
}

// ── Factory: Sparkline ──────────────────────────────────────────────
export function sparklineConfig(data, color = '#0054a6') {
    return {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                data,
                borderColor: color,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.35,
                fill: { target: 'origin', above: color + '18' },
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            elements: { point: { radius: 0 } },
        },
    };
}

// ── Factory: Line chart ─────────────────────────────────────────────
export function lineChartConfig(labels, datasets, opts = {}) {
    const base = baseDefaults();
    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            ...base,
            ...opts,
            plugins: { ...base.plugins, ...(opts.plugins || {}) },
            scales: { ...base.scales, ...(opts.scales || {}) },
        },
    };
}

// ── Factory: Bar chart ──────────────────────────────────────────────
export function barChartConfig(labels, datasets, opts = {}) {
    const base = baseDefaults();
    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            ...base,
            ...opts,
            plugins: { ...base.plugins, ...(opts.plugins || {}) },
            scales: { ...base.scales, ...(opts.scales || {}) },
        },
    };
}

// ── Factory: Doughnut ───────────────────────────────────────────────
export function doughnutConfig(labels, data, colors, opts = {}) {
    const t = themeColors();
    return {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: true, position: 'bottom', labels: { color: t.text, font: { size: 11 }, padding: 12, usePointStyle: true } },
                tooltip: { backgroundColor: t.tooltipBg, titleColor: t.tooltipText, bodyColor: t.tooltipText, borderColor: t.gridLine, borderWidth: 1 },
                ...(opts.plugins || {}),
            },
        },
    };
}

// ── Factory: Stacked bar ────────────────────────────────────────────
export function stackedBarConfig(labels, datasets, opts = {}) {
    const base = baseDefaults();
    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            ...base,
            ...opts,
            plugins: {
                ...base.plugins,
                legend: { display: true, position: 'bottom', labels: { ...base.plugins.legend?.labels, usePointStyle: true } },
                ...(opts.plugins || {}),
            },
            scales: {
                x: { ...base.scales.x, stacked: true },
                y: { ...base.scales.y, stacked: true, beginAtZero: true },
                ...(opts.scales || {}),
            },
        },
    };
}
