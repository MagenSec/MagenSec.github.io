// MagenSec Hub - Site Admin Review Dashboard
const { html, Component } = window;

import { config } from '../../config.js';

const CD_CACHE_KEY = 'msec_cd_profile';
const CD_CACHE_TTL_MS = 15 * 60 * 1000;

// Default endpoint using config.js if window.config bridge is not ready
const getApiUrl = () => {
    const base = window.config?.API_BASE || config.API_BASE || window.appConfig?.apiBaseUrl || '';
    return String(base).replace(/\/$/, '');
};

const CD_STYLES = `
    .cd-container {
        --cd-panel-bg: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        --cd-panel-border: rgba(15, 23, 42, 0.08);
        --cd-panel-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
        --cd-sidebar-bg: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    }

    [data-bs-theme="dark"] .cd-container {
        --cd-panel-bg: linear-gradient(180deg, #111827 0%, #0f172a 100%);
        --cd-panel-border: rgba(148, 163, 184, 0.25);
        --cd-panel-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
        --cd-sidebar-bg: linear-gradient(180deg, #111827 0%, #0b1220 100%);
    }

    .cd-shell {
        width: min(1400px, 100%);
        max-width: 100%;
        height: calc(100vh - 16px);
        margin: 8px auto;
        border: 1px solid var(--apple-border);
        border-radius: 16px;
        overflow: hidden;
        background: var(--apple-surface);
        display: grid;
        grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
        box-shadow: 0 18px 40px rgba(0,0,0,0.12);
    }
    .cd-sidebar {
        border-right: 1px solid var(--apple-border);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--cd-sidebar-bg);
    }
    .cd-nav-btn {
        width: 100%;
        text-align: left;
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 600;
        color: var(--apple-text);
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .cd-nav-btn:hover { background: rgba(118, 118, 128, 0.12); }
    .cd-nav-btn.active {
        background: #0054a6;
        color: #fff;
        border-color: #0054a6;
    }
    .cd-main {
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .cd-body {
        flex: 1;
        overflow: auto;
        padding: 12px;
        min-width: 0;
    }

    .cd-container {
        max-width: 100%;
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        animation: cd-fade-in 0.4s ease-out;
    }
    @keyframes cd-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Header Area */
    .cd-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 10px;
    }
    .cd-header > div:first-child {
        min-width: 0;
        flex: 1 1 420px;
    }
    .cd-title {
        font-size: clamp(26px, 2.4vw, 34px);
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0;
        line-height: 1.1;
    }
    .cd-subtitle {
        font-size: 15px;
        color: var(--apple-text-secondary);
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }
    .cd-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
    }
    .cd-status-active { background: #34c759; box-shadow: 0 0 8px rgba(52,199,89,0.5); }
    .cd-status-offline { background: #ff3b30; }
    .cd-status-disabled { background: #ffcc00; }
    .cd-status-stale { background: #f59f00; }

    /* Segmented Control (legacy tabs) */
    .cd-tabs {
        display: flex;
        background: rgba(118, 118, 128, 0.12);
        border-radius: 9px;
        padding: 2px;
        width: fit-content;
        margin-bottom: 24px;
        position: relative;
    }
    .cd-tab {
        padding: 6px 16px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 7px;
        cursor: pointer;
        color: var(--apple-text);
        transition: all 0.2s ease;
        z-index: 1;
    }
    .cd-tab.active {
        background: var(--apple-surface);
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .cd-tab-badge {
        background: #ff3b30;
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 10px;
        margin-left: 6px;
        font-weight: 700;
    }

    /* Cards */
    .cd-card {
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 18px;
        padding: 14px 16px;
        box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
        margin-bottom: 12px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        min-width: 0;
    }
    .cd-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
    }

    .cd-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 8px;
        margin-bottom: 10px;
    }
    .cd-kpi-card {
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-left: 3px solid #0054a6;
        border-radius: 12px;
        padding: 10px 12px;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
        min-width: 0;
    }
    .cd-kpi-card.cd-kpi-danger { border-left-color: #d63939; }
    .cd-kpi-card.cd-kpi-warning { border-left-color: #f76707; }
    .cd-kpi-card.cd-kpi-success { border-left-color: #2fb344; }
    .cd-kpi-card.cd-kpi-info { border-left-color: #0054a6; }
    .cd-kpi-label {
        font-size: 12px;
        color: var(--apple-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 4px;
    }
    .cd-kpi-value {
        font-size: clamp(17px, 1.8vw, 20px);
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--apple-text);
        line-height: 1.2;
        overflow-wrap: anywhere;
    }
    .cd-kpi-meta {
        margin-top: 2px;
        font-size: 12px;
        color: var(--apple-text-secondary);
    }

    /* Action Plan Hero Card */
    .cd-hero-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    @media (min-width: 768px) {
        .cd-hero-card {
            flex-direction: row;
            align-items: center;
        }
    }
    .cd-hero-score-ring {
        position: relative;
        width: 116px;
        height: 116px;
        flex-shrink: 0;
    }
    .cd-hero-score-svg {
        transform: rotate(-90deg);
        width: 100%;
        height: 100%;
    }
    .cd-hero-score-circle-bg {
        fill: none;
        stroke: rgba(118, 118, 128, 0.1);
        stroke-width: 8;
    }
    .cd-hero-score-circle {
        fill: none;
        stroke-width: 8;
        stroke-linecap: round;
        transition: stroke-dasharray 1s ease-out;
    }
    .cd-hero-score-text {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .cd-hero-score-val {
        font-size: 36px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1;
    }
    .cd-hero-score-lbl {
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--apple-text-secondary);
        margin-top: 4px;
    }

    .cd-hero-content {
        flex: 1;
    }
    .cd-hero-title {
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -0.01em;
    }
    .cd-hero-desc {
        color: var(--apple-text-secondary);
        font-size: 14px;
        margin-bottom: 20px;
    }

    /* Action List */
    .cd-action-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .cd-action-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: rgba(118, 118, 128, 0.04);
        padding: 12px 16px;
        border-radius: 12px;
    }
    .cd-action-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
    }
    .cd-action-critical { background: rgba(255, 59, 48, 0.1); color: #ff3b30; }
    .cd-action-warning { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
    .cd-action-info { background: rgba(0, 113, 227, 0.1); color: #0071e3; }
    .cd-action-success { background: rgba(52, 199, 89, 0.1); color: #34c759; }
    
    .cd-action-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 2px;
    }
    .cd-action-desc {
        font-size: 13px;
        color: var(--apple-text-secondary);
        line-height: 1.4;
    }

    /* Spec Grids */
    .cd-spec-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 10px;
    }

    /* Lists */
    .cd-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .cd-list-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--apple-border);
    }
    .cd-list-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }
    .cd-list-item:first-child {
        padding-top: 0;
    }
    .cd-list-label {
        color: var(--apple-text-secondary);
        font-size: 14px;
        flex-shrink: 0;
    }
    .cd-list-value {
        font-size: 14px;
        font-weight: 500;
        text-align: right;
        word-break: break-word;
        max-width: 60%;
    }

    /* Table Replacement for Apps/CVEs */
    .cd-grid-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--apple-border);
        align-items: center;
        transition: background 0.1s ease;
    }
    .cd-grid-row:hover {
        background: rgba(118, 118, 128, 0.04);
    }
    .cd-grid-header {
        font-size: 12px;
        font-weight: 600;
        color: var(--apple-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--apple-border);
        padding: 8px 16px;
    }
    .cd-row-title {
        font-weight: 600;
        font-size: 14px;
        color: var(--apple-text);
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .cd-row-subtitle {
        font-size: 12px;
        color: var(--apple-text-secondary);
        margin-top: 2px;
        overflow-wrap: anywhere;
    }

    /* Status Tags */
    .cd-tag {
        display: inline-flex;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
    }
    .cd-tag-critical { background: rgba(255, 59, 48, 0.1); color: #ff3b30; }
    .cd-tag-high { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
    .cd-tag-medium { background: rgba(0, 113, 227, 0.1); color: #0071e3; }
    .cd-tag-low { background: rgba(52, 199, 89, 0.1); color: #34c759; }
    .cd-tag-kev { background: #ff3b30; color: #fff; }

    /* Empty States */
    .cd-empty {
        text-align: center;
        padding: 48px 24px;
        color: var(--apple-text-secondary);
    }
    .cd-empty i {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }
    .cd-empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--apple-text);
        margin-bottom: 8px;
    }

    .cd-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 14px;
    }
    .cd-input,
    .cd-select {
        border: 1px solid var(--apple-border);
        background: var(--apple-surface);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        color: var(--apple-text);
        min-width: 180px;
    }
    .cd-chip {
        border: 1px solid var(--apple-border);
        background: rgba(118, 118, 128, 0.08);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
    }
    .cd-chip.active {
        background: #0071e3;
        color: #fff;
        border-color: #0071e3;
    }
    .cd-app-risk {
        border-left: 3px solid transparent;
    }
    .cd-app-risk-high { border-left-color: #ff3b30; }
    .cd-app-risk-medium { border-left-color: #ff9500; }
    .cd-app-risk-low { border-left-color: #34c759; }

    .cd-chart-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 10px;
        margin-bottom: 10px;
    }
    .cd-chart-card {
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 16px;
        padding: 10px 12px;
        box-shadow: 0 3px 12px rgba(15, 23, 42, 0.06);
        min-width: 0;
    }
    .cd-chart-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--apple-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 6px;
    }
    .cd-chart-host { min-height: 190px; }

    .cd-compact-scroll {
        max-height: none;
        overflow: auto;
        border-radius: 12px;
    }

    .cd-highlights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 8px;
        margin-bottom: 10px;
    }
    .cd-high-card {
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-top: 3px solid #0054a6;
        border-radius: 12px;
        padding: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
        min-width: 0;
    }
    .cd-high-card.cd-high-danger { border-top-color: #d63939; }
    .cd-high-card.cd-high-warning { border-top-color: #f76707; }
    .cd-high-card.cd-high-success { border-top-color: #2fb344; }
    .cd-high-card.cd-high-info { border-top-color: #0054a6; }

    .cd-highlight-layout {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(270px, 1fr);
        gap: 10px;
        margin-bottom: 10px;
    }
    .cd-highlights-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
    }
    .cd-clickable-card {
        cursor: pointer;
    }
    .cd-clickable-card:hover {
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        transform: translateY(-1px);
    }
    .cd-chart-host-sm { min-height: 150px; }

    .cd-ribbon {
        position: absolute;
        top: 8px;
        right: -6px;
        padding: 2px 9px;
        border-radius: 6px 0 0 6px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #fff;
        box-shadow: 0 2px 10px rgba(0,0,0,.14);
    }
    .cd-ribbon-danger { background: #d63939; }
    .cd-ribbon-warning { background: #f76707; }
    .cd-ribbon-success { background: #2fb344; }
    .cd-ribbon-info { background: #0054a6; }

    .cd-stepper {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
    }
    @media (max-width: 992px) {
        .cd-stepper { grid-template-columns: 1fr; }
    }
    .cd-step {
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 12px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        padding: 8px 10px;
    }

    @media (max-width: 1200px) {
        .cd-shell {
            grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
            border-radius: 12px;
        }
        .cd-highlights-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 992px) {
        .cd-shell {
            grid-template-columns: 1fr;
            height: auto;
            min-height: calc(100vh - 16px);
        }
        .cd-sidebar {
            flex-direction: row;
            flex-wrap: wrap;
            border-right: 0;
            border-bottom: 1px solid var(--apple-border);
            gap: 6px;
            padding: 10px;
        }
        .cd-nav-btn {
            width: auto;
            padding: 7px 10px;
        }
        .cd-main,
        .cd-body {
            overflow: visible;
        }
        .cd-header {
            align-items: flex-start;
            flex-wrap: wrap;
        }
        .cd-highlight-layout {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 640px) {
        .cd-kpi-grid,
        .cd-highlights-grid,
        .cd-highlights-kpi-grid,
        .cd-chart-grid,
        .cd-spec-grid {
            grid-template-columns: 1fr;
        }
        .cd-list-value {
            max-width: 68%;
            font-size: 13px;
        }
    }
    .cd-step-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
    }
    .cd-step-dot {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: #fff;
    }
    .cd-step-dot-1 { background: #d63939; }
    .cd-step-dot-2 { background: #f76707; }
    .cd-step-dot-3 { background: #0054a6; }
    .cd-high-title { font-size: 12px; color: var(--apple-text-secondary); text-transform: uppercase; letter-spacing: .04em; }
    .cd-high-value { font-size: clamp(28px, 2.8vw, 32px); font-weight: 800; line-height: 1; letter-spacing: -0.02em; }

    .cd-high-card .badge,
    .cd-chart-card .badge,
    .cd-step .badge {
        font-size: 10px;
        padding: 2px 8px;
        line-height: 1.35;
        border-radius: 999px;
        font-weight: 700;
        letter-spacing: 0.02em;
        max-width: 100%;
        white-space: normal;
        text-align: center;
    }

    .cd-kpi-label {
        font-size: 11px;
        letter-spacing: 0.05em;
    }

    .cd-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.62);
        z-index: 1040;
    }
    .cd-modal {
        position: fixed;
        inset: 0;
        z-index: 1050;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }
    .cd-modal-card {
        background: #ffffff;
        color: #111827;
        border: 1px solid #d1d5db;
        border-radius: 16px;
        width: min(960px, 100%);
        max-height: calc(100vh - 32px);
        overflow: auto;
        padding: 20px;
        box-shadow: 0 30px 60px rgba(0,0,0,0.25);
    }
    .cd-modal-card .cd-card {
        background: #f8fafc;
        border-color: #dbe2ea;
    }
    [data-bs-theme="dark"] .cd-modal-card {
        background: #0f172a;
        color: #e5e7eb;
        border-color: #374151;
    }
    [data-bs-theme="dark"] .cd-modal-card .cd-card {
        background: #111827;
        border-color: #374151;
    }
    [data-bs-theme="dark"] .cd-modal-card a.btn {
        color: #e5e7eb;
        border-color: #4b5563;
    }

    [data-bs-theme="dark"] .cd-shell {
        box-shadow: 0 18px 40px rgba(0,0,0,0.45);
    }
    [data-bs-theme="dark"] .cd-card,
    [data-bs-theme="dark"] .cd-kpi-card,
    [data-bs-theme="dark"] .cd-chart-card,
    [data-bs-theme="dark"] .cd-high-card,
    [data-bs-theme="dark"] .cd-step {
        background: var(--cd-panel-bg);
        border-color: var(--cd-panel-border);
        box-shadow: var(--cd-panel-shadow);
    }
    [data-bs-theme="dark"] .cd-nav-btn:hover {
        background: rgba(148, 163, 184, 0.18);
    }
    [data-bs-theme="dark"] .cd-grid-row:hover {
        background: rgba(148, 163, 184, 0.12);
    }
    [data-bs-theme="dark"] .cd-action-item {
        background: rgba(148, 163, 184, 0.12);
    }

    /* Utils */
    .selectable { user-select: text; -webkit-app-region: no-drag; }

    .cd-toast-wrap {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(360px, calc(100vw - 24px));
    }
    .cd-toast {
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-left: 4px solid #0054a6;
        border-radius: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.15);
        padding: 10px 12px;
    }
    .cd-toast-warning { border-left-color: #f59f00; }
    .cd-toast-danger { border-left-color: #d63939; }
    .cd-toast-success { border-left-color: #2fb344; }
    .cd-toast-title {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 4px;
    }
    .cd-toast-body {
        font-size: 12px;
        color: var(--apple-text-secondary);
    }
`;

export class ClientDevicePage extends window.Component {
    constructor() {
        super();
        this.state = {
            phase: 'waiting', // waiting, loading, ready, error, manual-auth
            error: null,
            manualOrgId: '',
            manualDeviceId: '',
            manualToken: '',
            profile: null,
            authCtx: null,
            activeTab: 'landing',
            selectedAppFilter: '',
            softwareSearch: '',
            softwareSort: 'risk',
            softwareRiskFilter: 'all',
            softwareRuntimeFilter: 'all',
            cveSearch: '',
            cveSeverityFilter: 'ALL',
            cveKnownExploitOnly: false,
            cveMatchFilter: 'all',
            cveRemediationFilter: 'all',
            cveSort: 'risk',
            trendDays: 30,
            selectedCve: null,
            cveIntelLoading: false,
            cveIntel: null,
            cveIntelError: '',
            showIpModal: false,
            hostLicenseHint: '',
            hostBridgeAvailable: false,
            notifications: []
        };
        this.charts = {};
        this.bridgeSocket = null;
        this.handleMessage = this.handleMessage.bind(this);
        this.handleWebViewMessage = this.handleWebViewMessage.bind(this);
        this.submitManualContext = this.submitManualContext.bind(this);
        this.sendClientCommand = this.sendClientCommand.bind(this);
    }

    componentDidMount() {
        this.injectStyles();
        window.addEventListener('message', this.handleMessage);

        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const searchParams = new URLSearchParams(window.location.search || '');

        const orgIdFromRoute = hashParams.get('orgId') || searchParams.get('orgId');
        const deviceIdFromRoute = hashParams.get('deviceId') || searchParams.get('deviceId');
        const token = hashParams.get('token') || searchParams.get('token');
        const bridgeWsUrl = hashParams.get('bridgeWs') || searchParams.get('bridgeWs');
        const isUnlicensedRoute =
            hashParams.get('unlicensed') === '1' ||
            searchParams.get('unlicensed') === '1';
        const cachedToken = localStorage.getItem('msec-device-token');

        window.msecClient = {
            sendCommand: (command, parameter = '') => this.sendClientCommand(command, parameter)
        };

        if (window.chrome?.webview) {
            window.chrome.webview.addEventListener('message', this.handleWebViewMessage);
            this.setState({ hostBridgeAvailable: true });
            window.chrome.webview.postMessage({ type: 'msec-client-ready' });
        } else if (bridgeWsUrl) {
            this.connectWebSocketBridge(bridgeWsUrl);
        }

        if (orgIdFromRoute && deviceIdFromRoute) {
            if (window.auth?.isAuthenticated?.()) {
                this.setState({
                    authCtx: { orgId: orgIdFromRoute, deviceId: deviceIdFromRoute, isPortal: true, token: window.auth.getToken() }
                }, () => this.fetchProfile());
                return;
            }

            const preferredToken = token || cachedToken;
            if (preferredToken) {
                localStorage.setItem('msec-device-token', preferredToken);
                this.setState({
                    authCtx: { orgId: orgIdFromRoute, deviceId: deviceIdFromRoute, isPortal: false, token: preferredToken }
                }, () => this.fetchProfile());
                return;
            }
        }

        this.setState({
            phase: 'manual-auth',
            error: isUnlicensedRoute ? 'Device is not licensed yet.' : null,
            manualOrgId: orgIdFromRoute || '',
            manualDeviceId: deviceIdFromRoute || '',
            manualToken: token || cachedToken || '',
            hostLicenseHint: isUnlicensedRoute ? 'Complete the licensing flow in MagenSec, then re-open this page.' : ''
        });
    }

    componentWillUnmount() {
        window.removeEventListener('message', this.handleMessage);
        if (window.chrome?.webview) {
            window.chrome.webview.removeEventListener('message', this.handleWebViewMessage);
        }
        if (this.bridgeSocket) {
            try { this.bridgeSocket.close(); } catch (_) { }
            this.bridgeSocket = null;
        }
        delete window.msecClient;
        this.destroyCharts();
    }

    connectWebSocketBridge(url) {
        try {
            const socket = new WebSocket(url);
            this.bridgeSocket = socket;

            socket.addEventListener('open', () => {
                this.setState({ hostBridgeAvailable: true });
                this.addHostNotification('Bridge connected', 'Engine UI bridge connected.', 'success');
            });

            socket.addEventListener('message', (event) => {
                try {
                    const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    this.processHostMessage(msg);
                } catch (err) {
                    console.error('Failed to parse bridge message', err);
                }
            });

            socket.addEventListener('close', () => {
                this.setState({ hostBridgeAvailable: false });
            });

            socket.addEventListener('error', () => {
                this.setState({ hostBridgeAvailable: false });
            });
        } catch (err) {
            console.error('Failed to connect bridge websocket', err);
        }
    }

    componentDidUpdate(_prevProps, prevState) {
        if (this.state.phase !== 'ready' || !this.state.profile) return;

        const chartTabs = ['overview', 'landing'];
        const currentUsesCharts = chartTabs.includes(this.state.activeTab);
        const prevUsedCharts = chartTabs.includes(prevState.activeTab);

        if (!currentUsesCharts) {
            if (prevUsedCharts) {
                this.destroyCharts();
            }
            return;
        }

        const tabChanged = prevState.activeTab !== this.state.activeTab;
        if (tabChanged) {
            this.destroyCharts();
        }

        const becameReady = prevState.phase !== 'ready';
        const profileChanged = prevState.profile !== this.state.profile;
        const trendChanged = prevState.trendDays !== this.state.trendDays;
        if (becameReady || tabChanged || profileChanged || trendChanged) {
            this.renderInsightCharts();
        }
    }

    destroyCharts() {
        const entries = Object.values(this.charts || {});
        for (const chart of entries) {
            try { chart?.destroy?.(); } catch (_) { }
        }
        this.charts = {};
    }

    getSeverityRank(severity) {
        const sev = String(severity || '').toUpperCase();
        if (sev === 'CRITICAL') return 4;
        if (sev === 'HIGH') return 3;
        if (sev === 'MEDIUM') return 2;
        return 1;
    }

    getRiskLevelForApp(app) {
        const cveCount = this.toNumber(app?.cveCount, 0);
        if (cveCount >= 5 || app?.outdated) return 'high';
        if (cveCount >= 1) return 'medium';
        return 'low';
    }

    getRiskRank(level) {
        if (level === 'high') return 3;
        if (level === 'medium') return 2;
        return 1;
    }

    getFilteredSoftware(profile) {
        const { softwareSearch, softwareSort, softwareRiskFilter, softwareRuntimeFilter } = this.state;
        const query = String(softwareSearch || '').trim().toLowerCase();
        let items = [...(profile?.apps?.items || [])];

        if (query) {
            items = items.filter((app) => {
                const hay = [app.name, app.vendor, app.version, app.latestVersion, app.status]
                    .map(v => String(v || '').toLowerCase())
                    .join(' ');
                return hay.includes(query);
            });
        }

        if (softwareRiskFilter !== 'all') {
            items = items.filter(app => this.getRiskLevelForApp(app) === softwareRiskFilter);
        }

        if (softwareRuntimeFilter === 'running') {
            items = items.filter(app => app.isRunning === true);
        } else if (softwareRuntimeFilter === 'installPath') {
            items = items.filter(app => !!app.installPath);
        }

        items.sort((a, b) => {
            if (softwareSort === 'name') {
                return String(a.name || '').localeCompare(String(b.name || ''));
            }
            if (softwareSort === 'vendor') {
                return String(a.vendor || '').localeCompare(String(b.vendor || ''));
            }
            if (softwareSort === 'version') {
                return String(a.version || '').localeCompare(String(b.version || ''));
            }
            if (softwareSort === 'risk') {
                const riskDelta = this.getRiskRank(this.getRiskLevelForApp(b)) - this.getRiskRank(this.getRiskLevelForApp(a));
                if (riskDelta !== 0) return riskDelta;
                return this.toNumber(b.cveCount, 0) - this.toNumber(a.cveCount, 0);
            }
            return this.toNumber(b.cveCount, 0) - this.toNumber(a.cveCount, 0);
        });

        return items;
    }

    getFilteredCves(profile) {
        const { cveSearch, cveSeverityFilter, cveSort, selectedAppFilter, cveKnownExploitOnly, cveMatchFilter, cveRemediationFilter } = this.state;
        const query = String(cveSearch || '').trim().toLowerCase();
        let items = [...(profile?.cves?.items || [])];

        if (selectedAppFilter) {
            const appFilter = String(selectedAppFilter).toLowerCase();
            items = items.filter(cve => String(cve.appName || '').toLowerCase() === appFilter);
        }

        if (cveSeverityFilter && cveSeverityFilter !== 'ALL') {
            items = items.filter(cve => String(cve.severity || '').toUpperCase() === cveSeverityFilter);
        }

        if (cveKnownExploitOnly) {
            items = items.filter(cve => cve.hasKnownExploit === true);
        }

        if (cveMatchFilter !== 'all') {
            items = items.filter(cve => this.getCveMatchType(cve) === cveMatchFilter);
        }

        if (cveRemediationFilter !== 'all') {
            items = items.filter(cve => this.getCveRemediationBucket(cve) === cveRemediationFilter);
        }

        if (query) {
            items = items.filter((cve) => {
                const hay = [cve.cveId, cve.severity, cve.description, cve.appName, cve.appVendor]
                    .map(v => String(v || '').toLowerCase())
                    .join(' ');
                return hay.includes(query);
            });
        }

        items.sort((a, b) => {
            if (cveSort === 'recent') {
                return new Date(b.lastDetected || 0).getTime() - new Date(a.lastDetected || 0).getTime();
            }
            if (cveSort === 'exploitability') {
                const exA = a.hasKnownExploit ? 1 : 0;
                const exB = b.hasKnownExploit ? 1 : 0;
                if (exB !== exA) return exB - exA;
                return this.toNumber(b.cvssScore, 0) - this.toNumber(a.cvssScore, 0);
            }
            if (cveSort === 'severity') {
                const sev = this.getSeverityRank(b.severity) - this.getSeverityRank(a.severity);
                if (sev !== 0) return sev;
                return this.toNumber(b.cvssScore, 0) - this.toNumber(a.cvssScore, 0);
            }
            return this.toNumber(b.cvssScore, 0) - this.toNumber(a.cvssScore, 0);
        });

        return items;
    }

    getTrend(profile, days = 30) {
        const today = new Date();
        const buckets = [];
        const safeDays = Math.max(1, Math.min(30, this.toNumber(days, 30)));
        for (let i = safeDays - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            buckets.push({ key: d.toISOString().slice(0, 10), label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0 });
        }
        const map = new Map(buckets.map(b => [b.key, b]));
        for (const cve of (profile?.cves?.items || [])) {
            const ts = cve.firstDetected || cve.lastDetected;
            if (!ts) continue;
            const date = new Date(ts);
            if (Number.isNaN(date.getTime())) continue;
            const k = date.toISOString().slice(0, 10);
            if (map.has(k)) map.get(k).count += 1;
        }
        return buckets;
    }

    getTrendMetrics(profile, days = 30) {
        const buckets = this.getTrend(profile, days).map(b => ({ ...b, pressure: 0, exploited: 0 }));
        const map = new Map(buckets.map(b => [b.key, b]));

        for (const cve of (profile?.cves?.items || [])) {
            const ts = cve.firstDetected || cve.lastDetected;
            if (!ts) continue;

            const date = new Date(ts);
            if (Number.isNaN(date.getTime())) continue;

            const key = date.toISOString().slice(0, 10);
            const bucket = map.get(key);
            if (!bucket) continue;

            const sev = String(cve.severity || '').toUpperCase();
            const sevWeight = sev === 'CRITICAL' ? 4 : sev === 'HIGH' ? 3 : sev === 'MEDIUM' ? 2 : 1;
            const kevBonus = cve.hasKnownExploit ? 2 : 0;
            bucket.pressure += sevWeight + kevBonus;
            if (cve.hasKnownExploit) bucket.exploited += 1;
        }

        return buckets;
    }

    renderInsightCharts() {
        if (!window.ApexCharts || !this.state.profile) return;
        const profile = this.state.profile;
        const severity = profile?.cves?.summary || {};
        const trend = this.getTrendMetrics(profile, this.state.trendDays);
        const apps = profile?.apps?.items || [];

        const finite = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const severitySeries = [
            finite(severity.critical),
            finite(severity.high),
            finite(severity.medium),
            finite(severity.low)
        ];
        const severityTotal = severitySeries.reduce((a, b) => a + b, 0);
        const safeSeveritySeries = severityTotal > 0 ? severitySeries : [1, 0, 0, 0];
        const trendData = trend.map(t => finite(t.count));
        const pressureData = trend.map(t => finite(t.pressure));

        const rootStyles = getComputedStyle(document.documentElement);
        const textSecondary = rootStyles.getPropertyValue('--apple-text-secondary')?.trim() || '#6b7280';
        const gridLine = rootStyles.getPropertyValue('--apple-border')?.trim() || '#e9ecef';
        const surfaceText = rootStyles.getPropertyValue('--apple-text')?.trim() || '#1f2937';

        const baseAnimation = {
            enabled: true,
            easing: 'easeinout',
            speed: 650,
            dynamicAnimation: { enabled: true, speed: 450 }
        };

        const tooltipTheme = {
            theme: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light',
            style: { fontSize: '12px', fontFamily: 'inherit' }
        };

        if (this.chartSeverityEl) {
            const severityOptions = {
                chart: { type: 'donut', height: 220, toolbar: { show: false }, animations: baseAnimation },
                labels: ['Critical', 'High', 'Medium', 'Low'],
                series: safeSeveritySeries,
                colors: ['#d63939', '#f76707', '#f59f00', '#2fb344'],
                dataLabels: {
                    enabled: true,
                    style: { colors: ['#1f2937'] },
                    formatter: (_, opts) => String(safeSeveritySeries[opts.seriesIndex] || 0)
                },
                legend: { position: 'bottom', labels: { colors: textSecondary }, markers: { width: 10, height: 10, radius: 6 } },
                tooltip: {
                    ...tooltipTheme,
                    y: { formatter: (val) => `${finite(val)} CVEs` }
                },
                stroke: { width: 1, colors: ['#ffffff'] },
                plotOptions: {
                    pie: {
                        donut: {
                            size: '66%',
                            labels: {
                                show: true,
                                value: {
                                    formatter: (val) => String(finite(val))
                                },
                                total: {
                                    show: true,
                                    label: 'Total',
                                    formatter: () => String(severityTotal)
                                }
                            }
                        }
                    }
                }
            };

            if (!this.charts.severity) {
                this.charts.severity = new window.ApexCharts(this.chartSeverityEl, severityOptions);
                this.charts.severity.render();
            } else {
                this.charts.severity.updateOptions(severityOptions, true, true);
                this.charts.severity.updateSeries(safeSeveritySeries, true);
            }
        }

        if (this.chartTrendEl) {
            const peakIndex = trendData.reduce((maxIdx, curr, idx, arr) => curr > (arr[maxIdx] ?? -1) ? idx : maxIdx, 0);
            const trendOptions = {
                chart: {
                    type: 'line',
                    height: 220,
                    toolbar: { show: false },
                    animations: baseAnimation,
                    zoom: { enabled: false },
                    dropShadow: {
                        enabled: true,
                        top: 3,
                        left: 0,
                        blur: 5,
                        color: '#0054a6',
                        opacity: 0.12
                    }
                },
                series: [
                    { name: 'Total CVEs', type: 'area', data: trendData },
                    { name: 'Critical+High Pressure', type: 'line', data: pressureData }
                ],
                xaxis: {
                    categories: trend.map(t => t.label),
                    tickAmount: this.state.trendDays <= 7 ? this.state.trendDays : 10,
                    labels: { style: { colors: textSecondary, fontSize: '11px' } },
                    axisBorder: { show: false },
                    axisTicks: { show: false }
                },
                yaxis: {
                    min: 0,
                    forceNiceScale: true,
                    labels: { style: { colors: textSecondary, fontSize: '11px' } }
                },
                stroke: { curve: 'smooth', width: [2.5, 3], dashArray: [0, 6], lineCap: 'round' },
                markers: { size: [0, 3], strokeWidth: 0, hover: { size: 5 } },
                grid: { borderColor: gridLine, strokeDashArray: 4 },
                colors: ['#0054a6', '#d63939'],
                legend: {
                    position: 'top',
                    horizontalAlign: 'left',
                    labels: { colors: textSecondary }
                },
                fill: {
                    type: 'gradient',
                    gradient: { shadeIntensity: 1, opacityFrom: 0.26, opacityTo: 0.04, stops: [0, 90, 100] }
                },
                annotations: {
                    points: trendData.length > 0 ? [{
                        x: trend[peakIndex]?.label,
                        y: trendData[peakIndex],
                        marker: { size: 4, fillColor: '#0054a6', strokeColor: '#fff', radius: 2 },
                        label: {
                            text: `Peak ${trendData[peakIndex]}`,
                            borderColor: '#0054a6',
                            style: { color: '#fff', background: '#0054a6', fontSize: '10px' }
                        }
                    }] : []
                },
                tooltip: {
                    ...tooltipTheme,
                    shared: true,
                    intersect: false,
                    x: { formatter: (_, { dataPointIndex }) => `Day: ${trend[dataPointIndex]?.label || ''}` },
                    y: {
                        formatter: (val, opts) => {
                            if (opts?.seriesIndex === 1) return `${finite(val)} pressure pts`;
                            return `${finite(val)} CVEs detected`;
                        }
                    }
                }
            };

            if (!this.charts.trend) {
                this.charts.trend = new window.ApexCharts(this.chartTrendEl, trendOptions);
                this.charts.trend.render();
            } else {
                this.charts.trend.updateOptions(trendOptions, true, true);
                this.charts.trend.updateSeries([
                    { name: 'Total CVEs', type: 'area', data: trendData },
                    { name: 'Critical+High Pressure', type: 'line', data: pressureData }
                ], true);
            }
        }

        if (this.chartRemediationEl) {
            const risky = apps.filter(a => this.toNumber(a.cveCount, 0) > 0).length;
            const outdated = apps.filter(a => a.outdated).length;
            const clean = Math.max(0, apps.length - risky);
            const remediationOptions = {
                chart: { type: 'bar', height: 220, toolbar: { show: false }, animations: baseAnimation },
                series: [{ name: 'Applications', data: [clean, risky, outdated] }],
                xaxis: {
                    categories: ['Clean', 'Risky', 'Outdated'],
                    labels: { style: { colors: textSecondary, fontSize: '11px' } }
                },
                yaxis: {
                    labels: { style: { colors: textSecondary, fontSize: '11px' } }
                },
                colors: ['#2fb344', '#f76707', '#d63939'],
                plotOptions: {
                    bar: {
                        horizontal: false,
                        borderRadius: 8,
                        columnWidth: '52%',
                        distributed: true,
                        dataLabels: { position: 'top' }
                    }
                },
                grid: { borderColor: gridLine, strokeDashArray: 4 },
                tooltip: {
                    ...tooltipTheme,
                    y: { formatter: (val) => `${finite(val)} apps` }
                }
            };

            if (!this.charts.remediation) {
                this.charts.remediation = new window.ApexCharts(this.chartRemediationEl, remediationOptions);
                this.charts.remediation.render();
            } else {
                this.charts.remediation.updateOptions(remediationOptions, true, true);
                this.charts.remediation.updateSeries([{ name: 'Applications', data: [clean, risky, outdated] }], true);
            }
        }

        if (this.chartHighlightsDetectionEl) {
            const quickTrend = this.getTrend(profile, 14);
            const quickTrendData = quickTrend.map(t => finite(t.count));
            const peak = quickTrendData.reduce((mx, val, idx, arr) => val > (arr[mx] ?? -1) ? idx : mx, 0);
            const detectionOptions = {
                chart: { type: 'bar', height: 170, toolbar: { show: false }, animations: baseAnimation },
                series: [{ name: 'Detected', data: quickTrendData }],
                xaxis: {
                    categories: quickTrend.map(t => t.label),
                    labels: { style: { colors: textSecondary, fontSize: '10px' } }
                },
                yaxis: { labels: { style: { colors: textSecondary, fontSize: '10px' } } },
                grid: { borderColor: gridLine, strokeDashArray: 4 },
                colors: ['#0054a6'],
                dataLabels: { enabled: false },
                plotOptions: { bar: { borderRadius: 6, columnWidth: '58%' } },
                annotations: {
                    points: quickTrendData.length ? [{
                        x: quickTrend[peak]?.label,
                        y: quickTrendData[peak],
                        marker: { size: 3, fillColor: '#d63939', strokeColor: '#fff' },
                        label: {
                            text: `Peak ${quickTrendData[peak]}`,
                            borderColor: '#d63939',
                            style: { color: '#fff', background: '#d63939', fontSize: '10px' }
                        }
                    }] : []
                },
                tooltip: {
                    ...tooltipTheme,
                    y: { formatter: (v) => `${finite(v)} CVEs` }
                }
            };

            if (!this.charts.highlightsDetection) {
                this.charts.highlightsDetection = new window.ApexCharts(this.chartHighlightsDetectionEl, detectionOptions);
                this.charts.highlightsDetection.render();
            } else {
                this.charts.highlightsDetection.updateOptions(detectionOptions, true, true);
                this.charts.highlightsDetection.updateSeries([{ name: 'Detected', data: quickTrendData }], true);
            }
        }

        if (this.chartHighlightsRemediationEl) {
            const insights = this.getHighlightInsights(profile);
            const remediationData = [
                insights.remediation.patch,
                insights.remediation.config,
                insights.remediation.mitigate,
                insights.remediation.nofix,
                insights.remediation.unknown
            ].map(finite);
            const remediationOptions = {
                chart: { type: 'donut', height: 170, toolbar: { show: false }, animations: baseAnimation },
                labels: ['Patch', 'Config', 'Mitigate', 'No Fix', 'Unknown'],
                series: remediationData.reduce((a, b) => a + b, 0) > 0 ? remediationData : [1, 0, 0, 0, 0],
                colors: ['#2fb344', '#0054a6', '#f59f00', '#d63939', '#6b7280'],
                legend: { show: false },
                dataLabels: { enabled: false },
                stroke: { width: 1, colors: ['#ffffff'] },
                plotOptions: {
                    pie: {
                        donut: {
                            size: '70%',
                            labels: {
                                show: true,
                                total: {
                                    show: true,
                                    label: 'Remediation',
                                    formatter: () => String(remediationData.reduce((a, b) => a + b, 0))
                                }
                            }
                        }
                    }
                },
                tooltip: {
                    ...tooltipTheme,
                    y: { formatter: (v) => `${finite(v)} CVEs` }
                }
            };

            if (!this.charts.highlightsRemediation) {
                this.charts.highlightsRemediation = new window.ApexCharts(this.chartHighlightsRemediationEl, remediationOptions);
                this.charts.highlightsRemediation.render();
            } else {
                this.charts.highlightsRemediation.updateOptions(remediationOptions, true, true);
                this.charts.highlightsRemediation.updateSeries(remediationOptions.series, true);
            }
        }
    }

    getElapsedSince(value) {
        if (!value) return 'Unknown';
        const ts = new Date(value).getTime();
        if (!Number.isFinite(ts)) return 'Unknown';
        const deltaMs = Math.max(0, Date.now() - ts);
        const mins = Math.floor(deltaMs / 60000);
        if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    getIpDisplay(ipList) {
        const list = Array.isArray(ipList) ? ipList : [];
        if (list.length === 0) return { primary: 'Unknown', extra: 0, full: 'Unknown' };
        return { primary: list[0], extra: Math.max(0, list.length - 1), full: list.join(', ') };
    }

    buildScoreModel(profile) {
        const d = profile?.device || {};
        const summary = profile?.cves?.summary || {};
        const apps = profile?.apps?.items || [];

        const backendRisk = this.toNumber(
            d.summary?.riskScore ?? d.summary?.RiskScore ?? d.riskScore ?? d.RiskScore,
            0
        );

        const critical = this.toNumber(summary.critical, 0);
        const high = this.toNumber(summary.high, 0);
        const medium = this.toNumber(summary.medium, 0);
        const low = this.toNumber(summary.low, 0);
        const knownExploit = this.toNumber(summary.withKnownExploit, 0);
        const totalCves = this.toNumber(profile?.cves?.count, profile?.cves?.items?.length || 0);
        const installed = Math.max(1, this.toNumber(profile?.apps?.summary?.installed, apps.length || 1));

        const severityLoad = ((critical * 12) + (high * 7) + (medium * 3) + (low * 1)) / installed;
        const weightedCveRisk = Math.min(70, Math.round(severityLoad * 8));
        const exploitPenalty = Math.min(20, knownExploit * 10);
        const densityPenalty = Math.min(15, Math.round((totalCves / installed) * 12));
        const riskyApps = apps.filter((a) => this.getRiskLevelForApp(a) !== 'low').length;
        const appPenalty = Math.min(10, Math.round((riskyApps / installed) * 10));

        const telemetryTs = this.firstDefined(
            profile?.telemetryStatus?.lastHeartbeat,
            profile?.telemetryStatus?.lastTelemetry,
            profile?.telemetryDetail?.latest?.timestamp,
            d.lastHeartbeat,
            d.LastHeartbeat,
            null
        );

        let stalePenalty = 0;
        if (telemetryTs) {
            const ageHours = Math.max(0, (Date.now() - new Date(telemetryTs).getTime()) / 3600000);
            if (Number.isFinite(ageHours) && ageHours > 6) stalePenalty = Math.min(10, Math.round(ageHours / 12));
        }

        const derivedRisk = Math.min(100, weightedCveRisk + exploitPenalty + densityPenalty + appPenalty + stalePenalty);

        const riskScore = Math.max(0, Math.min(100, Math.round(Math.max(backendRisk, derivedRisk))));
        const securityScore = 100 - riskScore;

        return {
            riskScore,
            securityScore,
            backendRisk,
            derivedRisk,
            totalCves,
            installed,
            riskyApps,
            knownExploit,
            critical,
            high,
            medium,
            low
        };
    }

    buildKrMetrics(profile, scoreModel) {
        const apps = profile?.apps?.items || [];
        const cves = profile?.cves?.items || [];
        const installed = Math.max(1, scoreModel.installed);
        const totalCves = Math.max(0, scoreModel.totalCves);

        const vulnerabilityDensity = Number((totalCves / installed).toFixed(2));
        const criticalExposure = totalCves > 0 ? Math.round((scoreModel.critical / totalCves) * 100) : 0;
        const exploitabilityIndex = Math.min(100, Math.round((scoreModel.knownExploit * 20) + (scoreModel.high * 2) + scoreModel.critical * 4));
        const updatedCount = this.toNumber(profile?.apps?.summary?.updated, apps.filter(a => a.status === 'updated').length);
        const remediationReadiness = Math.max(0, Math.min(100, Math.round((updatedCount / installed) * 100)));

        const mttrDays = (() => {
            const durations = cves
                .map((c) => {
                    const start = c.firstDetected ? new Date(c.firstDetected).getTime() : NaN;
                    const end = c.lastDetected ? new Date(c.lastDetected).getTime() : NaN;
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
                    return (end - start) / 86400000;
                })
                .filter((n) => Number.isFinite(n));
            if (!durations.length) return 'N/A';
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            if (avg < 0.1) return 'N/A';
            return `${avg.toFixed(1)}d`;
        })();

        return {
            vulnerabilityDensity,
            criticalExposure,
            exploitabilityIndex,
            remediationReadiness,
            mttrDays
        };
    }

    async openCveModal(cve) {
        this.setState({ selectedCve: cve, cveIntelLoading: true, cveIntelError: '', cveIntel: null });
        const cveId = cve?.cveId;
        if (!cveId || cveId === 'N/A') {
            this.setState({ cveIntelLoading: false, cveIntelError: 'No CVE identifier available for enrichment.' });
            return;
        }

        try {
            const [circlResult, kevResult] = await Promise.allSettled([
                this.fetchJsonWithTimeout(`https://cve.circl.lu/api/cve/${encodeURIComponent(cveId)}`, 8000),
                this.fetchJsonWithTimeout('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 8000)
            ]);

            const circl = circlResult.status === 'fulfilled' ? circlResult.value : null;

            let kev = null;
            if (kevResult.status === 'fulfilled') {
                const kevPayload = kevResult.value;
                kev = (kevPayload?.vulnerabilities || []).find(v => String(v.cveID || '').toUpperCase() === String(cveId).toUpperCase()) || null;
            }

            const nothingFound = !circl && !kev;
            this.setState({
                cveIntelLoading: false,
                cveIntel: { circl, kev },
                cveIntelError: nothingFound ? 'Public intelligence sources did not return additional data for this CVE right now.' : ''
            });
        } catch (err) {
            this.setState({ cveIntelLoading: false, cveIntelError: err?.message || 'Threat intel fetch failed.' });
        }
    }

    async fetchJsonWithTimeout(url, timeoutMs = 8000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`Request failed: ${res.status}`);
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }

    closeCveModal() {
        this.setState({ selectedCve: null, cveIntel: null, cveIntelError: '', cveIntelLoading: false });
    }

    renderCveModal() {
        const { selectedCve, cveIntelLoading, cveIntel, cveIntelError } = this.state;
        if (!selectedCve) return '';

        const kev = cveIntel?.kev;
        const circl = cveIntel?.circl;

        return html`
            <div>
                <div class="cd-modal-backdrop" onClick=${() => this.closeCveModal()}></div>
                <div class="cd-modal" role="dialog" aria-modal="true">
                    <div class="cd-modal-card selectable">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
                            <div>
                                <div class="cd-row-title" style="font-size:20px;">${selectedCve.cveId}</div>
                                <div class="cd-row-subtitle">Threat intelligence from public OSINT sources</div>
                            </div>
                            <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.closeCveModal()}>
                                <i class="ti ti-x"></i>
                            </button>
                        </div>

                        <div class="cd-kpi-grid" style="margin-bottom:12px;">
                            <div class="cd-kpi-card"><div class="cd-kpi-label">Severity</div><div class="cd-kpi-value">${selectedCve.severity || 'N/A'}</div></div>
                            <div class="cd-kpi-card"><div class="cd-kpi-label">CVSS</div><div class="cd-kpi-value">${selectedCve.cvssScore ? this.toNumber(selectedCve.cvssScore, 0).toFixed(1) : 'N/A'}</div></div>
                            <div class="cd-kpi-card"><div class="cd-kpi-label">Known Exploit</div><div class="cd-kpi-value" style="color:${selectedCve.hasKnownExploit ? '#d63939' : 'var(--apple-text)'};">${selectedCve.hasKnownExploit ? 'Yes' : 'No'}</div></div>
                            <div class="cd-kpi-card"><div class="cd-kpi-label">Impacted App</div><div class="cd-kpi-value" style="font-size:16px;">${selectedCve.appName || 'Unknown'}</div></div>
                        </div>

                        <div class="cd-card" style="margin-bottom:12px;">
                            <h4 style="margin:0 0 8px 0;">Description</h4>
                            <div style="font-size:13px; line-height:1.5; color:var(--apple-text-secondary);">${selectedCve.description || 'No description available.'}</div>
                        </div>

                        ${cveIntelLoading ? html`<div class="cd-card"><i class="ti ti-loader ti-spin"></i> Loading threat intelligence...</div>` : ''}
                        ${cveIntelError ? html`<div class="cd-card" style="color:#d63939;">${cveIntelError}</div>` : ''}

                        ${kev ? html`
                            <div class="cd-card" style="margin-bottom:12px; border-color: rgba(214,57,57,0.3);">
                                <h4 style="margin:0 0 8px 0; color:#d63939;">CISA KEV Intelligence</h4>
                                <div style="font-size:13px; color:var(--apple-text-secondary);">Vendor: ${kev.vendorProject || 'N/A'} · Product: ${kev.product || 'N/A'}</div>
                                <div style="font-size:13px; color:var(--apple-text-secondary); margin-top:6px;">Ransomware Use: ${kev.knownRansomwareCampaignUse || 'N/A'}</div>
                                <div style="margin-top:8px; font-size:13px;">${kev.shortDescription || 'No KEV short description.'}</div>
                            </div>
                        ` : ''}

                        ${circl ? html`
                            <div class="cd-card">
                                <h4 style="margin:0 0 8px 0;">OSINT Context</h4>
                                <div style="font-size:13px; color:var(--apple-text-secondary);">Published: ${circl.Published || circl.published || 'N/A'}</div>
                                <div style="font-size:13px; color:var(--apple-text-secondary);">Modified: ${circl.Modified || circl.modified || 'N/A'}</div>
                                <div style="margin-top:8px; font-size:13px; line-height:1.5;">${circl.summary || circl.description || 'No additional OSINT summary available.'}</div>
                            </div>
                        ` : ''}

                        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                            <a class="btn btn-sm btn-outline-secondary" target="_blank" href=${`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(selectedCve.cveId || '')}`}>Open NVD</a>
                            <a class="btn btn-sm btn-outline-secondary" target="_blank" href=${`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${encodeURIComponent(selectedCve.cveId || '')}`}>Open MITRE</a>
                            <a class="btn btn-sm btn-outline-secondary" target="_blank" href=${`https://www.first.org/epss?cve=${encodeURIComponent(selectedCve.cveId || '')}`}>Open EPSS</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    handleMessage(e) {
        try {
            const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            this.processHostMessage(msg);
        } catch (err) {
            console.error('Failed to parse postMessage', err);
        }
    }

    handleWebViewMessage(e) {
        try {
            this.processHostMessage(e?.data);
        } catch (err) {
            console.error('Failed to parse WebView host message', err);
        }
    }

    processHostMessage(msg) {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'msec-auth-token' && msg.token) {
            this.handleDirectToken(msg.token);
            return;
        }

        if (msg.type === 'msec-device-context') {
            const orgId = msg.orgId || '';
            const deviceId = msg.deviceId || '';
            const token = msg.token || '';
            const isLicensed = !!msg.isLicensed;

            if (isLicensed && orgId && deviceId && token) {
                this.handleDirectToken(token, orgId, deviceId);
                return;
            }

            this.setState({
                phase: 'manual-auth',
                error: 'Device is not licensed yet.',
                manualOrgId: orgId,
                manualDeviceId: deviceId,
                manualToken: '',
                hostLicenseHint: 'Complete licensing in MagenSec, then launch the app again to open your device page.'
            });
            return;
        }

        if (msg.type === 'msec-engine-notification') {
            this.addHostNotification(msg.command || 'Engine', msg.parameter || '', this.getNotificationLevel(msg.command));
            return;
        }

        if (msg.type === 'msec-bridge-ready') {
            this.setState({ hostBridgeAvailable: true });
            return;
        }

        if (msg.type === 'msec-client-command-ack') {
            const title = msg.success ? 'Command sent' : 'Command failed';
            const body = msg.message || (msg.success ? 'Request forwarded.' : 'Request could not be forwarded.');
            this.addHostNotification(title, body, msg.success ? 'success' : 'danger');
        }
    }

    getNotificationLevel(command) {
        const cmd = String(command || '').toLowerCase();
        if (cmd.includes('failed') || cmd.includes('error')) return 'danger';
        if (cmd.includes('complete') || cmd.includes('success')) return 'success';
        if (cmd.includes('warning') || cmd.includes('updateavailable')) return 'warning';
        return 'info';
    }

    addHostNotification(title, message, level = 'info') {
        const toast = {
            id: `${Date.now()}-${Math.random()}`,
            title: String(title || 'Notification'),
            message: String(message || ''),
            level
        };

        this.setState(prev => {
            const next = [...(prev.notifications || []), toast].slice(-6);
            return { notifications: next };
        });

        setTimeout(() => {
            this.setState(prev => ({
                notifications: (prev.notifications || []).filter(n => n.id !== toast.id)
            }));
        }, 8000);
    }

    renderHostToasts() {
        const notifications = this.state.notifications || [];
        if (!notifications.length) return '';

        return html`
            <div class="cd-toast-wrap">
                ${notifications.map(n => html`
                    <div class=${`cd-toast ${n.level === 'danger' ? 'cd-toast-danger' : n.level === 'warning' ? 'cd-toast-warning' : n.level === 'success' ? 'cd-toast-success' : ''}`}>
                        <div class="cd-toast-title">${n.title}</div>
                        <div class="cd-toast-body">${n.message || '-'}</div>
                    </div>
                `)}
            </div>
        `;
    }

    sendClientCommand(command, parameter = '') {
        if (window.chrome?.webview) {
            try {
                window.chrome.webview.postMessage({ type: 'msec-client-command', command, parameter });
                this.addHostNotification('Command requested', `${command} was sent to MagenSec Client.`, 'info');
            } catch (err) {
                this.addHostNotification('Command failed', err?.message || 'Unable to send command to MagenSec Client.', 'danger');
            }
            return;
        }

        if (this.bridgeSocket && this.bridgeSocket.readyState === WebSocket.OPEN) {
            try {
                this.bridgeSocket.send(JSON.stringify({ type: 'msec-client-command', command, parameter }));
                this.addHostNotification('Command requested', `${command} was sent to MagenSec Client.`, 'info');
            } catch (err) {
                this.addHostNotification('Command failed', err?.message || 'Unable to send command to MagenSec Client.', 'danger');
            }
            return;
        }

        this.addHostNotification('Bridge unavailable', 'Desktop bridge is not connected for command forwarding.', 'warning');
    }

    renderClientCommandToolbar() {
        const canSend = this.state.hostBridgeAvailable && typeof window.msecClient?.sendCommand === 'function';

        return html`
            <div class="cd-card" style="padding:10px 12px; margin-bottom:10px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <div class="cd-chart-title" style="margin:0;">Client Actions</div>
                    <span class=${`badge ${canSend ? 'bg-success text-white' : 'bg-warning text-white'}`}>
                        ${canSend ? 'Bridge connected' : 'Bridge unavailable'}
                    </span>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-sm btn-outline-secondary" disabled=${!canSend} onClick=${() => this.sendClientCommand('CheckForUpdates')}>
                        <i class="ti ti-refresh"></i> Check Updates
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" disabled=${!canSend} onClick=${() => this.sendClientCommand('SignatureUpdate')}>
                        <i class="ti ti-shield-check"></i> Update Signatures
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" disabled=${!canSend} onClick=${() => this.sendClientCommand('InstalledAppsScanStart')}>
                        <i class="ti ti-apps"></i> Scan Apps
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" disabled=${!canSend} onClick=${() => this.sendClientCommand('ProtectionScanStart')}>
                        <i class="ti ti-shield-search"></i> Protection Scan
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" disabled=${!canSend} onClick=${() => this.sendClientCommand('SystemComponentsScanStart')}>
                        <i class="ti ti-cpu"></i> System Components
                    </button>
                </div>
            </div>
        `;
    }

    handleDirectToken(token, routeOrgId = null, routeDeviceId = null) {
        try {
            const tokenParts = String(token || '').split('.');
            if (tokenParts.length < 2) {
                throw new Error('Invalid JWT format');
            }

            const normalizedPayload = tokenParts[1]
                .replace(/-/g, '+')
                .replace(/_/g, '/');
            const paddedPayload = normalizedPayload + '='.repeat((4 - (normalizedPayload.length % 4)) % 4);
            const payload = JSON.parse(atob(paddedPayload));
            const orgId = payload.orgId;
            const deviceId = payload.deviceId;

            if (!orgId || !deviceId) throw new Error("Invalid token claims");

            localStorage.setItem('msec-device-token', token);
            this.setState({
                authCtx: { orgId, deviceId, isPortal: false, token }
            }, () => this.fetchProfile());

        } catch (e) {
            if (routeOrgId && routeDeviceId) {
                localStorage.setItem('msec-device-token', token);
                this.setState({
                    authCtx: { orgId: routeOrgId, deviceId: routeDeviceId, isPortal: false, token }
                }, () => this.fetchProfile());
                return;
            }

            console.error("Token parse failed", e);
            this.setState({ phase: 'auth-error', error: 'Invalid token provided or missing route context.' });
        }
    }

    submitManualContext(e) {
        if (e?.preventDefault) e.preventDefault();

        const orgId = String(this.state.manualOrgId || '').trim();
        const deviceId = String(this.state.manualDeviceId || '').trim();
        const manualToken = String(this.state.manualToken || '').trim();

        if (!orgId || !deviceId) {
            this.setState({ error: 'Organization ID and Device ID are required.' });
            return;
        }

        const portalToken = window.auth?.isAuthenticated?.() ? String(window.auth.getToken() || '').trim() : '';
        const token = portalToken || manualToken || localStorage.getItem('msec-device-token') || '';
        if (!token) {
            this.setState({ error: 'Authentication token is required. Sign in as Site Admin or paste a valid token.' });
            return;
        }

        localStorage.setItem('msec-device-token', token);
        const isPortal = !!portalToken;
        this.setState({
            error: null,
            authCtx: { orgId, deviceId, isPortal, token }
        }, () => this.fetchProfile());
    }

    injectStyles() {
        if (document.getElementById('cd-styles')) return;
        const style = document.createElement('style');
        style.id = 'cd-styles';
        style.textContent = CD_STYLES;
        document.head.appendChild(style);
    }

    firstDefined(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null && value !== '') return value;
        }
        return null;
    }

    toNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    toBoolean(value, fallback = false) {
        if (value === true || value === false) return value;
        if (value === 1 || value === '1') return true;
        if (value === 0 || value === '0') return false;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', 'yes', 'enabled', 'online', 'running'].includes(normalized)) return true;
            if (['false', 'no', 'disabled', 'offline', 'stopped'].includes(normalized)) return false;
        }
        return fallback;
    }

    formatCountValue(value, zeroText = 'None') {
        const number = this.toNumber(value, 0);
        return number === 0 ? zeroText : String(number);
    }

    formatPercentValue(value, zeroText = 'Not started') {
        const number = this.toNumber(value, 0);
        return number === 0 ? zeroText : `${number}%`;
    }

    asArray(value) {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return [];
            if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) return parsed;
                } catch (_) { }
            }
            return trimmed.split(/[;,\n]+/).map(s => s.trim()).filter(Boolean);
        }
        return [];
    }

    normalizeTimestamp(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    formatWhen(value) {
        if (!value) return 'N/A';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString();
    }

    decodeMaybeBase64(value) {
        const input = String(value || '').trim();
        if (!input || input.length < 8) return input;
        if (!/^[A-Za-z0-9+/=]+$/.test(input)) return input;
        if (input.length % 4 !== 0) return input;
        try {
            const decoded = atob(input);
            if (!decoded) return input;
            if (/[^\x09\x0A\x0D\x20-\x7E]/.test(decoded)) return input;
            return decoded;
        } catch {
            return input;
        }
    }

    normalizeTelemetry(rawTelemetry) {
        const latest = rawTelemetry?.latest || rawTelemetry?.Latest || null;
        const latestFieldsRaw = latest?.fields || latest?.Fields || {};
        const ipField = this.firstDefined(latestFieldsRaw.IPAddresses, latestFieldsRaw.ipAddresses);
        const ipList = this.asArray(ipField).filter(Boolean);

        const normalizedFields = {
            ...latestFieldsRaw,
            IPAddresses: ipList,
            ipAddresses: ipList,
            Username: this.decodeMaybeBase64(this.firstDefined(latestFieldsRaw.Username, latestFieldsRaw.UserName, latestFieldsRaw.LoggedOnUser, latestFieldsRaw.CurrentUser)),
            OSVersion: this.firstDefined(latestFieldsRaw.OSVersion, latestFieldsRaw.osVersion, latestFieldsRaw.OS, latestFieldsRaw.OSEdition),
            OSEdition: this.firstDefined(latestFieldsRaw.OSEdition, latestFieldsRaw.OS, latestFieldsRaw.OSVersion),
            CPUName: this.firstDefined(latestFieldsRaw.CPUName, latestFieldsRaw.CPU, latestFieldsRaw.ProcessorName),
            CPUCores: this.firstDefined(latestFieldsRaw.CPUCores, latestFieldsRaw.Cores),
            TotalRAMMB: this.firstDefined(latestFieldsRaw.TotalRAMMB, latestFieldsRaw.TotalRamMb, latestFieldsRaw.RAMMB),
            SystemDriveSizeGB: this.firstDefined(latestFieldsRaw.SystemDriveSizeGB, latestFieldsRaw.TotalDiskGb, latestFieldsRaw.DiskGB),
            AVProduct: this.firstDefined(latestFieldsRaw.AVProduct, latestFieldsRaw.DefenderStatus, latestFieldsRaw.DefenderEnabled)
        };

        return {
            latest: latest
                ? {
                    ...latest,
                    timestamp: this.firstDefined(latest.timestamp, latest.Timestamp, this.normalizeTimestamp(latest.timestamp), this.normalizeTimestamp(latest.Timestamp)),
                    fields: normalizedFields
                }
                : null,
            history: this.asArray(rawTelemetry?.history || rawTelemetry?.History),
            changes: this.asArray(rawTelemetry?.changes || rawTelemetry?.Changes)
        };
    }

    normalizeCves(rawCves) {
        const rawItems = this.asArray(rawCves?.items || rawCves?.Items);
        const items = rawItems.map((item) => {
            const severity = String(this.firstDefined(item.severity, item.Severity, 'LOW')).toUpperCase();
            const exploitRaw = this.firstDefined(item.hasKnownExploit, item.knownExploit, item.KnownExploit, false);
            const epssRaw = this.toNumber(this.firstDefined(item.epssProbability, item.EpssProbability, item.epss, item.EPSS, item.Epss), 0);
            const epssProbability = epssRaw > 1 ? Number((epssRaw / 100).toFixed(4)) : epssRaw;
            const matchConfidenceRaw = this.toNumber(this.firstDefined(item.matchConfidence, item.MatchConfidence, item.matchScore, item.MatchScore, item.matchLevel, item.MatchLevel), 0);
            const absoluteHint = this.toBoolean(this.firstDefined(item.absoluteMatch, item.AbsoluteMatch, false), false);
            return {
                cveId: this.firstDefined(item.cveId, item.CveId, item.id, item.Id, 'N/A'),
                severity,
                cvssScore: this.toNumber(this.firstDefined(item.cvssScore, item.Score, item.cvss, item.Cvss), 0),
                description: this.firstDefined(item.description, item.cveDescription, item.CveDescription, 'No description available.'),
                appName: this.firstDefined(item.appName, item.AppName, item.productName, item.ProductName, 'Unknown Product'),
                appVendor: this.firstDefined(item.appVendor, item.AppVendor, ''),
                applicationVersion: this.firstDefined(item.applicationVersion, item.ApplicationVersion, ''),
                hasKnownExploit: this.toBoolean(exploitRaw, false),
                firstDetected: this.firstDefined(item.firstDetected, item.FirstDetected, null),
                lastDetected: this.firstDefined(item.lastDetected, item.LastDetected, item.lastUpdated, item.LastUpdated, null),
                epssProbability,
                epssPercentile: this.toNumber(this.firstDefined(item.epssPercentile, item.EpssPercentile, item.epssRank, item.EpssRank), 0),
                remediationType: this.firstDefined(item.remediationType, item.RemediationType, item.fixType, item.FixType, item.patchType, item.PatchType, ''),
                matchType: this.firstDefined(item.matchType, item.MatchType, item.matchMethod, item.MatchMethod, ''),
                matchConfidence: absoluteHint && matchConfidenceRaw < 2 ? 2 : matchConfidenceRaw
            };
        });

        const summary = {
            critical: items.filter(i => i.severity === 'CRITICAL').length,
            high: items.filter(i => i.severity === 'HIGH').length,
            medium: items.filter(i => i.severity === 'MEDIUM').length,
            low: items.filter(i => i.severity === 'LOW').length,
            withKnownExploit: items.filter(i => i.hasKnownExploit).length
        };

        return {
            items,
            count: items.length,
            hasMore: !!rawCves?.hasMore,
            summary
        };
    }

    normalizeApps(rawApps, normalizedCves) {
        const rawItems = this.asArray(rawApps?.items || rawApps?.Items);
        const cveCountByApp = new Map();
        for (const cve of normalizedCves.items) {
            const key = String(cve.appName || '').trim().toLowerCase();
            if (!key) continue;
            cveCountByApp.set(key, (cveCountByApp.get(key) || 0) + 1);
        }

        const items = rawItems.map((item) => {
            const name = this.firstDefined(item.name, item.appName, item.AppName, 'Unknown Application');
            const status = String(this.firstDefined(item.appStatus, item.status, item.AppStatus, 'installed')).toLowerCase();
            const latestVersion = this.firstDefined(item.latestVersion, item.nextVersion, item.NextVersion, null);
            const outdated = !!latestVersion && status === 'installed';
            const appKey = String(name || '').trim().toLowerCase();
            const runningFlag = this.toBoolean(this.firstDefined(item.isRunning, item.IsRunning, item.running, item.Running), status === 'running');
            return {
                name,
                vendor: this.firstDefined(item.vendor, item.appVendor, item.AppVendor, 'Unknown Publisher'),
                version: this.firstDefined(item.version, item.applicationVersion, item.ApplicationVersion, 'Unknown'),
                latestVersion,
                outdated,
                status,
                isRunning: runningFlag,
                installPath: this.firstDefined(item.installPath, item.InstallPath, item.path, item.Path, item.exePath, item.ExecutablePath, ''),
                runningPath: this.firstDefined(item.runningPath, item.RunningPath, item.processPath, item.ProcessPath, item.currentPath, item.CurrentPath, ''),
                firstSeen: this.firstDefined(item.firstSeen, item.FirstSeen, null),
                lastSeen: this.firstDefined(item.lastSeen, item.LastSeen, null),
                cveCount: cveCountByApp.get(appKey) || 0,
                description: this.firstDefined(item.description, item.appDescription, null)
            };
        });

        const summaryFromApi = rawApps?.summary || rawApps?.Summary || {};
        const summary = {
            installed: this.toNumber(this.firstDefined(summaryFromApi.installed, summaryFromApi.Installed), items.filter(i => i.status === 'installed').length),
            updated: this.toNumber(this.firstDefined(summaryFromApi.updated, summaryFromApi.Updated), items.filter(i => i.status === 'updated').length),
            uninstalled: this.toNumber(this.firstDefined(summaryFromApi.uninstalled, summaryFromApi.Uninstalled), items.filter(i => i.status === 'uninstalled').length)
        };

        return {
            items,
            count: this.toNumber(this.firstDefined(rawApps?.count, rawApps?.Count), items.length),
            hasMore: !!rawApps?.hasMore,
            summary
        };
    }

    normalizeDevice(deviceRaw) {
        if (!deviceRaw) return {};
        return {
            ...deviceRaw,
            deviceName: this.firstDefined(deviceRaw.deviceName, deviceRaw.DeviceName, deviceRaw.machineName, deviceRaw.MachineName, deviceRaw.deviceId, deviceRaw.DeviceId),
            deviceState: String(this.firstDefined(deviceRaw.deviceState, deviceRaw.state, deviceRaw.State, 'ACTIVE')).toUpperCase(),
            lastHeartbeat: this.firstDefined(deviceRaw.lastHeartbeat, deviceRaw.LastHeartbeat, null),
            clientVersion: this.firstDefined(deviceRaw.clientVersion, deviceRaw.ClientVersion, null),
            os: this.firstDefined(deviceRaw.os, deviceRaw.OS, deviceRaw.Os, null),
            summary: deviceRaw.summary || deviceRaw.Summary || {}
        };
    }

    normalizeProfile(rawProfile) {
        const normalizedCves = this.normalizeCves(rawProfile?.cves || rawProfile?.CVEs || rawProfile?.Cves || {});
        const normalizedApps = this.normalizeApps(rawProfile?.apps || rawProfile?.Apps || {}, normalizedCves);
        const telemetryStatusRaw = rawProfile?.telemetryStatus || rawProfile?.TelemetryStatus || {};
        const telemetryDetail = this.normalizeTelemetry(rawProfile?.telemetry || rawProfile?.Telemetry || rawProfile?.telemetryDetail || rawProfile?.TelemetryDetail || {});

        return {
            ...rawProfile,
            device: this.normalizeDevice(rawProfile?.device || rawProfile?.Device || {}),
            telemetryDetail,
            telemetryStatus: {
                lastTelemetry: this.firstDefined(telemetryStatusRaw.lastTelemetry, telemetryStatusRaw.LastTelemetry, null),
                lastHeartbeat: this.firstDefined(telemetryStatusRaw.lastHeartbeat, telemetryStatusRaw.LastHeartbeat, null),
                consecutiveFailures: this.toNumber(this.firstDefined(telemetryStatusRaw.consecutiveFailures, telemetryStatusRaw.ConsecutiveFailures), 0),
                errors: this.firstDefined(telemetryStatusRaw.errors, telemetryStatusRaw.Errors, null)
            },
            apps: normalizedApps,
            cves: normalizedCves
        };
    }

    async fetchProfile(force = false) {
        const { authCtx } = this.state;
        if (!authCtx) return;

        this.setState({ phase: 'loading' });

        if (!force) {
            try {
                const cached = localStorage.getItem(CD_CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Match org and device
                    if (parsed.orgId === authCtx.orgId && parsed.deviceId === authCtx.deviceId) {
                        if (Date.now() - parsed.ts < CD_CACHE_TTL_MS) {
                            this.setState({ phase: 'ready', profile: this.normalizeProfile(parsed.data || {}) });
                            return;
                        }
                    }
                }
            } catch (e) { }
        }

        try {
            const url = `${getApiUrl()}/api/v1/orgs/${authCtx.orgId}/devices/${authCtx.deviceId}/detail?include=telemetry,apps,cves`;
            
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authCtx.token}`,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('msec-device-token');
                    throw new Error("Authentication expired or access denied.");
                }
                throw new Error(`Failed to fetch device context: ${res.status}`);
            }

            const json = await res.json();
            if (!json.success) throw new Error(json.message || "API returned error");
            
            const profile = this.normalizeProfile(json.data || {});
            localStorage.setItem(CD_CACHE_KEY, JSON.stringify({ 
                ts: Date.now(), 
                orgId: authCtx.orgId,
                deviceId: authCtx.deviceId,
                data: profile 
            }));
            this.setState({ phase: 'ready', profile });

        } catch (e) {
            console.error("Fetch profile error", e);
            this.setState({ phase: 'error', error: e.message });
        }
    }

    buildActionPlan(profile) {
        if (!profile) return [];
        const actions = [];
        const { device, cves, telemetryStatus, telemetryDetail } = profile;
        const fields = telemetryDetail?.latest?.fields || {};

        // 1. Device Offline Rule
        const lastHeartbeatStr = device?.lastHeartbeat || device?.LastHeartbeat || telemetryDetail?.latest?.timestamp;
        if (lastHeartbeatStr) {
            const diffHours = (new Date() - new Date(lastHeartbeatStr)) / 3600000;
            if (diffHours > 24) {
                actions.push({
                    level: 'warning',
                    icon: 'ti-wifi-off',
                    title: 'Device is Offline',
                    desc: `Last seen ${Math.floor(diffHours)} hours ago. Security status may be outdated.`
                });
            }
        }

        // 2. KEV Exploits
        const kevCount = cves?.summary?.withKnownExploit || 0;
        if (kevCount > 0) {
            actions.push({
                level: 'critical',
                icon: 'ti-alert-octagon',
                title: 'Active Exploits Detected',
                desc: `${kevCount} vulnerabilities on this device are currently being exploited in the wild (CISA KEV). Patch immediately.`
            });
        }

        // 3. Security Agent / Windows Defender
        const avStatus = fields.AVProduct || fields.DefenderEnabled;
        if (avStatus === "False" || String(avStatus).toLowerCase().includes('disabled')) {
             actions.push({
                level: 'critical',
                icon: 'ti-shield-off',
                title: 'Endpoint Protection Disabled',
                desc: 'Anti-virus / Endpoint security appears to be disabled or missing.'
            });
        }

        // 4. Critical Vulnerabilities
        const criticalCount = cves?.summary?.critical || 0;
        if (criticalCount > 0 && kevCount === 0) {
            actions.push({
                level: 'warning',
                icon: 'ti-bug',
                title: 'Critical Vulnerabilities',
                desc: `${criticalCount} critical vulnerabilities found in installed software.`
            });
        }

        // 5. Windows Updates / OS EOL
        const osVersion = String(this.firstDefined(fields.OSVersion, fields.OSEdition, fields.OS, device?.os, '') || '');
        if (osVersion.includes('Windows 7') || osVersion.includes('Windows 8')) {
            actions.push({
                level: 'critical',
                icon: 'ti-device-desktop-analytics',
                title: 'Unsupported OS',
                desc: 'This operating system no longer receives security updates. Upgrade immediately.'
            });
        }

        // Fallback Success
        if (actions.length === 0) {
            actions.push({
                level: 'success',
                icon: 'ti-shield-check',
                title: 'Device Secure',
                desc: 'No immediate security actions required. Device conforms to baseline.'
            });
        }

        return actions.slice(0, 3);
    }

    getScoreColor(riskScore) {
        // High Risk (High Score) = Red. Low Risk (Low Score) = Green
        // Converting to "Health" color
        if (riskScore >= 70) return '#ff3b30'; // Red
        if (riskScore >= 40) return '#ff9500'; // Orange
        return '#34c759'; // Green
    }

    getSeverityBadgeClass(severity) {
        const sev = String(severity || '').toUpperCase();
        if (sev === 'CRITICAL') return 'cd-tag-critical';
        if (sev === 'HIGH') return 'cd-tag-high';
        if (sev === 'MEDIUM') return 'cd-tag-medium';
        return 'cd-tag-low';
    }

    getCveMatchType(cve) {
        const confidence = this.toNumber(cve?.matchConfidence, 0);
        if (confidence >= 2) return 'absolute';
        if (confidence === 1) return 'heuristic';

        const text = String(cve?.matchType || '').toLowerCase();
        if (text.includes('absolute') || text.includes('exact') || text.includes('direct')) return 'absolute';
        if (text.includes('heuristic') || text.includes('fuzzy') || text.includes('approx')) return 'heuristic';
        return 'unknown';
    }

    getCveRemediationBucket(cve) {
        const text = String(cve?.remediationType || '').toLowerCase();
        if (!text) return 'unknown';
        if (text.includes('patch') || text.includes('update') || text.includes('upgrade') || text.includes('hotfix')) return 'patch';
        if (text.includes('config') || text.includes('setting') || text.includes('policy') || text.includes('hardening')) return 'config';
        if (text.includes('mitig') || text.includes('workaround') || text.includes('compensat')) return 'mitigate';
        if (text.includes('no fix') || text.includes('unavailable') || text.includes('none')) return 'nofix';
        return 'unknown';
    }

    getHighlightInsights(profile) {
        const cves = profile?.cves?.items || [];
        const apps = profile?.apps?.items || [];

        const timestamps = cves
            .flatMap((cve) => [cve.firstDetected, cve.lastDetected])
            .map((ts) => new Date(ts).getTime())
            .filter((ts) => Number.isFinite(ts));

        const firstDetectedAt = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
        const lastDetectedAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;

        const match = { absolute: 0, heuristic: 0, unknown: 0 };
        const remediation = { patch: 0, config: 0, mitigate: 0, nofix: 0, unknown: 0 };
        const epssValues = [];

        for (const cve of cves) {
            const matchType = this.getCveMatchType(cve);
            match[matchType] = (match[matchType] || 0) + 1;

            const remediationType = this.getCveRemediationBucket(cve);
            remediation[remediationType] = (remediation[remediationType] || 0) + 1;

            const epss = this.toNumber(cve.epssProbability, 0);
            if (epss > 0) epssValues.push(epss);
        }

        const epssHigh = epssValues.filter((v) => v >= 0.7).length;
        const epssAvg = epssValues.length
            ? Number(((epssValues.reduce((a, b) => a + b, 0) / epssValues.length) * 100).toFixed(1))
            : 0;

        const withInstallPath = apps.filter((app) => !!app.installPath).length;
        const runningWithPath = apps.filter((app) => app.isRunning && !!app.runningPath).length;

        return {
            firstDetectedAt,
            lastDetectedAt,
            match,
            remediation,
            epssHigh,
            epssAvg,
            apps: {
                withInstallPath,
                runningWithPath
            }
        };
    }

    getDevicePresence(profile) {
        const d = profile?.device || {};
        const state = String(this.firstDefined(d.deviceState, d.DeviceState, d.state, d.State, 'ACTIVE')).toUpperCase();
        const blocked = state === 'BLOCKED';
        const disabled = state === 'DISABLED';

        const latestSeen = this.firstDefined(
            profile?.telemetryStatus?.lastHeartbeat,
            profile?.telemetryStatus?.lastTelemetry,
            profile?.telemetryDetail?.latest?.timestamp,
            d.lastHeartbeat,
            d.LastHeartbeat,
            null
        );

        const failures = this.toNumber(profile?.telemetryStatus?.consecutiveFailures, 0);
        const ts = latestSeen ? new Date(latestSeen).getTime() : NaN;
        const ageMinutes = Number.isFinite(ts) ? Math.max(0, (Date.now() - ts) / 60000) : Number.POSITIVE_INFINITY;

        if (blocked) return { statusClass: 'cd-status-offline', statusText: 'Blocked', isOnline: false, ageMinutes, latestSeen };
        if (disabled) return { statusClass: 'cd-status-disabled', statusText: 'Disabled', isOnline: false, ageMinutes, latestSeen };
        if (ageMinutes <= 20) return { statusClass: 'cd-status-active', statusText: 'Online', isOnline: true, ageMinutes, latestSeen };
        if (ageMinutes <= 1440 && failures <= 12) return { statusClass: 'cd-status-stale', statusText: 'Stale', isOnline: true, ageMinutes, latestSeen };
        return { statusClass: 'cd-status-offline', statusText: 'Offline', isOnline: false, ageMinutes, latestSeen };
    }

    renderSideNav(profile) {
        const { activeTab } = this.state;
        const nav = [
            { key: 'landing', label: 'Highlights' },
            { key: 'overview', label: 'Overview' },
            { key: 'specs', label: 'Specifications' },
            { key: 'software', label: 'Software', count: profile?.apps?.summary?.installed || 0 },
            { key: 'cves', label: 'Vulnerabilities', count: profile?.cves?.summary?.critical || 0 }
        ];

        return html`
            <aside class="cd-sidebar">
                ${nav.map((item) => html`
                    <button
                        class=${`cd-nav-btn ${activeTab === item.key ? 'active' : ''}`}
                        onClick=${() => this.setState({ activeTab: item.key })}
                    >
                        <span>${item.label}</span>
                        ${item.count ? html`<span>${item.count}</span>` : ''}
                    </button>
                `)}
            </aside>
        `;
    }

    renderLandingTab(profile, scoreModel) {
        const severity = profile?.cves?.summary || {};
        const apps = profile?.apps?.items || [];
        const riskyApps = scoreModel.riskyApps;
        const complianceScore = Math.max(0, Math.min(100, Math.round(scoreModel.securityScore - (severity.critical || 0) * 2)));
        const postureScore = Math.max(0, Math.min(100, Math.round((scoreModel.securityScore * 0.5) + (complianceScore * 0.5))));
        const networkExposure = this.asArray(profile?.telemetryDetail?.latest?.fields?.IPAddresses || []).length > 1 ? 'Medium' : 'Low';
        const actions = this.buildActionPlan(profile);
        const kr = this.buildKrMetrics(profile, scoreModel);
        const insights = this.getHighlightInsights(profile);
        const riskTone = scoreModel.riskScore >= 70 ? 'danger' : scoreModel.riskScore >= 40 ? 'warning' : 'success';
        const exposureTone = networkExposure === 'High' ? 'danger' : networkExposure === 'Medium' ? 'warning' : 'success';

        return html`
            <div style="animation: cd-fade-in 0.25s ease-out;">
                <div class="cd-highlights-grid">
                    <div class=${`cd-high-card cd-high-${riskTone}`} style="position:relative;" title="Composite endpoint risk posture score based on vulnerabilities and telemetry hygiene.">
                        <span class=${`cd-ribbon cd-ribbon-${riskTone}`}>Live</span>
                        <div class="cd-high-title">Security Score</div>
                        <div class="cd-high-value">${scoreModel.securityScore}</div>
                        <div style="margin-top:6px;"><span class=${`badge bg-${riskTone} text-white`}>${scoreModel.securityScore >= 85 ? 'Strong' : scoreModel.securityScore >= 60 ? 'Watch' : 'Critical'}</span></div>
                    </div>
                    <div class=${`cd-high-card cd-high-${riskTone}`} style="position:relative;" title="Unified endpoint risk score driven by CVE severity, exploitability and telemetry health.">
                        <span class=${`cd-ribbon cd-ribbon-${riskTone}`}>Unified</span>
                        <div class="cd-high-title">Risk Score</div>
                        <div class="cd-high-value">${scoreModel.riskScore}</div>
                        <div style="margin-top:6px;"><span class=${`badge bg-${riskTone} text-white`}>Derived + Backend</span></div>
                    </div>
                    <div class="cd-high-card cd-high-info" style="position:relative;" title="Estimated compliance readiness based on vulnerability profile and endpoint hardening signals.">
                        <span class="cd-ribbon cd-ribbon-info">KR</span>
                        <div class="cd-high-title">Compliance Score</div>
                        <div class="cd-high-value">${complianceScore}</div>
                        <div style="margin-top:6px;"><span class="badge bg-primary text-white">Control Readiness</span></div>
                    </div>
                    <div class="cd-high-card cd-high-info" style="position:relative;" title="Blended score for risk + compliance, used for executive posture at-a-glance.">
                        <span class="cd-ribbon cd-ribbon-info">Board</span>
                        <div class="cd-high-title">Posture Score</div>
                        <div class="cd-high-value">${postureScore}</div>
                        <div style="margin-top:6px;"><span class="badge bg-blue text-white">Executive KPI</span></div>
                    </div>
                    <div class=${`cd-high-card cd-high-${exposureTone}`} style="position:relative;" title="Network exposure estimation based on address spread and endpoint network telemetry.">
                        <span class=${`cd-ribbon cd-ribbon-${exposureTone}`}>Surface</span>
                        <div class="cd-high-title">Network Exposure</div>
                        <div class="cd-high-value">${networkExposure}</div>
                        <div style="margin-top:6px;"><span class=${`badge bg-${exposureTone} text-white`}>${networkExposure} Exposure</span></div>
                    </div>
                </div>

                <div class="cd-card" style="padding: 10px 12px; margin-bottom: 10px;">
                    <h4 style="margin:0 0 10px 0;">Top Actions Right Now</h4>
                    <div class="cd-action-list">
                        ${actions.map(action => html`
                            <div class="cd-action-item" title=${action.desc}>
                                <div class=${`cd-action-icon cd-action-${action.level}`}><i class=${`ti ${action.icon}`}></i></div>
                                <div>
                                    <div class="cd-action-title">${action.title}</div>
                                    <div class="cd-action-desc">${action.desc}</div>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>

                <div class="cd-highlight-layout">
                    <div class="cd-highlights-kpi-grid">
                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Apps with active risk indicators including CVEs or outdated versions."
                        onClick=${() => this.setState({ activeTab: 'software', softwareRiskFilter: 'high', softwareRuntimeFilter: 'all' })}
                    >
                        <div class="cd-kpi-label">Risky Applications</div>
                        <div class="cd-kpi-value">${riskyApps}</div>
                    </div>
                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Known exploited vulnerabilities currently matched on this endpoint."
                        onClick=${() => this.setState({ activeTab: 'cves', cveKnownExploitOnly: true, cveSeverityFilter: 'ALL', cveMatchFilter: 'all', cveRemediationFilter: 'all', selectedAppFilter: '' })}
                    >
                        <div class="cd-kpi-label">Known Exploits</div>
                        <div class="cd-kpi-value">${this.formatCountValue(this.toNumber(severity.withKnownExploit, 0), 'None')}</div>
                    </div>
                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Earliest observed CVE detection timestamp from telemetry."
                        onClick=${() => this.setState({ activeTab: 'cves', cveSort: 'recent', selectedAppFilter: '', cveKnownExploitOnly: false, cveMatchFilter: 'all', cveRemediationFilter: 'all' })}
                    >
                        <div class="cd-kpi-label">CVE First Detected</div>
                        <div class="cd-kpi-value" style="font-size:13px;">${this.formatWhen(insights.firstDetectedAt)}</div>
                    </div>
                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Latest observed CVE detection timestamp from telemetry."
                        onClick=${() => this.setState({ activeTab: 'cves', cveSort: 'recent', selectedAppFilter: '', cveKnownExploitOnly: false, cveMatchFilter: 'all', cveRemediationFilter: 'all' })}
                    >
                        <div class="cd-kpi-label">CVE Last Detected</div>
                        <div class="cd-kpi-value" style="font-size:13px;">${this.formatWhen(insights.lastDetectedAt)}</div>
                    </div>

                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Applications currently running with resolved executable paths."
                        onClick=${() => this.setState({ activeTab: 'software', softwareRuntimeFilter: 'running', softwareRiskFilter: 'all' })}
                    >
                        <div class="cd-kpi-label">Running from Path</div>
                        <div class="cd-kpi-value">${insights.apps.runningWithPath}</div>
                        <div class="cd-kpi-meta">Running executable path available</div>
                    </div>
                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Installed applications with install path telemetry."
                        onClick=${() => this.setState({ activeTab: 'software', softwareRuntimeFilter: 'installPath', softwareRiskFilter: 'all' })}
                    >
                        <div class="cd-kpi-label">Installed from Path</div>
                        <div class="cd-kpi-value">${insights.apps.withInstallPath}</div>
                        <div class="cd-kpi-meta">Install path confidence</div>
                    </div>

                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Exact/absolute software match confidence for vulnerability mapping (score 2)."
                        onClick=${() => this.setState({ activeTab: 'cves', cveMatchFilter: 'absolute', cveKnownExploitOnly: false, cveRemediationFilter: 'all', selectedAppFilter: '' })}
                    >
                        <div class="cd-kpi-label">Absolute Matches (2)</div>
                        <div class="cd-kpi-value">${insights.match.absolute}</div>
                        <div class="cd-kpi-meta">High confidence mapping</div>
                    </div>

                    <div
                        class="cd-kpi-card cd-clickable-card"
                        title="Heuristic/fuzzy software match confidence (score 1)."
                        onClick=${() => this.setState({ activeTab: 'cves', cveMatchFilter: 'heuristic', cveKnownExploitOnly: false, cveRemediationFilter: 'all', selectedAppFilter: '' })}
                    >
                        <div class="cd-kpi-label">Heuristic Matches (1)</div>
                        <div class="cd-kpi-value">${insights.match.heuristic}</div>
                        <div class="cd-kpi-meta">Low confidence mapping</div>
                    </div>

                    </div>

                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div class="cd-chart-card">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; gap:8px;">
                                <div class="cd-chart-title" style="margin:0;">14-Day Detection Cadence</div>
                                <span class="badge bg-primary text-white">first/last telemetry</span>
                            </div>
                            <div class="cd-chart-host-sm" ref=${(el) => { this.chartHighlightsDetectionEl = el; }}></div>
                        </div>
                        <div class="cd-chart-card">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; gap:8px;">
                                <div class="cd-chart-title" style="margin:0;">Remediation Type Mix</div>
                                <span class="badge bg-success text-white">EPSS avg ${insights.epssAvg}%</span>
                            </div>
                            <div class="cd-kpi-meta" style="margin-bottom:6px;">EPSS high risk (≥0.70): ${insights.epssHigh}</div>
                            <div class="cd-chart-host-sm" ref=${(el) => { this.chartHighlightsRemediationEl = el; }}></div>
                        </div>
                    </div>
                </div>

                <div class="cd-card" style="padding: 10px 12px; margin-bottom: 10px;">
                    <h4 style="margin:0 0 10px 0;">Key Risk Results</h4>
                    <div class="cd-kpi-grid" style="margin-bottom:0;">
                        <div class="cd-kpi-card" title="Mean time to vulnerability persistence window based on telemetry evidence.">
                            <div class="cd-kpi-label">Exposure MTTR</div>
                            <div class="cd-kpi-value">${kr.mttrDays}</div>
                        </div>
                        <div class="cd-kpi-card" title="Detected vulnerabilities with active exploit intelligence.">
                            <div class="cd-kpi-label">KEV Hits</div>
                            <div class="cd-kpi-value">${this.formatCountValue(scoreModel.knownExploit, 'None')}</div>
                        </div>
                        <div class="cd-kpi-card" title="Critical and high vulnerability backlog requiring priority patching.">
                            <div class="cd-kpi-label">Priority Backlog</div>
                            <div class="cd-kpi-value">${scoreModel.critical + scoreModel.high}</div>
                        </div>
                        <div class="cd-kpi-card" title="Current assessed security score from unified scoring model.">
                            <div class="cd-kpi-label">Security Baseline</div>
                            <div class="cd-kpi-value">${scoreModel.securityScore}</div>
                        </div>
                    </div>

                    <div class="cd-stepper">
                        <div class="cd-step">
                            <div class="cd-step-head">
                                <span class="cd-step-dot cd-step-dot-1">1</span>
                                <strong>Now</strong>
                                <span class="badge bg-danger text-white">Urgent</span>
                            </div>
                            <div class="cd-action-desc">Remediate KEV + critical backlog (${scoreModel.knownExploit + scoreModel.critical}).</div>
                        </div>
                        <div class="cd-step">
                            <div class="cd-step-head">
                                <span class="cd-step-dot cd-step-dot-2">2</span>
                                <strong>Next</strong>
                                <span class="badge bg-warning text-white">Important</span>
                            </div>
                            <div class="cd-action-desc">Reduce exploitability index from ${kr.exploitabilityIndex} to below 40.</div>
                        </div>
                        <div class="cd-step">
                            <div class="cd-step-head">
                                <span class="cd-step-dot cd-step-dot-3">3</span>
                                <strong>Then</strong>
                                <span class="badge bg-primary text-white">Sustain</span>
                            </div>
                            <div class="cd-action-desc">Increase remediation readiness from ${this.formatPercentValue(kr.remediationReadiness, 'not started')} to 90%+.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderIpModal(profile) {
        if (!this.state.showIpModal) return '';
        const fields = profile?.telemetryDetail?.latest?.fields || {};
        const ipList = this.asArray(this.firstDefined(fields.IPAddresses, fields.ipAddresses));

        return html`
            <div>
                <div class="cd-modal-backdrop" onClick=${() => this.setState({ showIpModal: false })}></div>
                <div class="cd-modal">
                    <div class="cd-modal-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <h4 style="margin:0;">IP Addresses</h4>
                            <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.setState({ showIpModal: false })}><i class="ti ti-x"></i></button>
                        </div>
                        <ul class="cd-list">
                            ${ipList.map((ip) => html`<li class="cd-list-item"><span class="cd-list-value" style="max-width:100%; text-align:left;">${ip}</span></li>`)}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        const { phase, error, profile, activeTab, hostLicenseHint } = this.state;

        if (phase === 'waiting') {
            return html`
                <div>
                    <div style="height: 100vh; display: flex; align-items: center; justify-content: center; color: var(--apple-text-secondary);">
                        <i class="ti ti-loader ti-spin" style="font-size: 32px;"></i>
                    </div>
                    ${this.renderHostToasts()}
                </div>
            `;
        }

        if (phase === 'error' || phase === 'auth-error') {
            return html`
                <div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <i class="ti ti-alert-triangle" style="font-size: 48px; color: #ff3b30; margin-bottom: 16px;"></i>
                    <h2 style="margin: 0 0 8px 0;">Access Denied</h2>
                    <p style="color: var(--apple-text-secondary); max-width: 400px; text-align: center;">${error}</p>
                    ${hostLicenseHint ? html`<p style="color: var(--apple-text-secondary); max-width: 460px; text-align: center; font-size: 13px; margin-top: 8px;">${hostLicenseHint}</p>` : ''}
                </div>
            `;
        }

        if (phase === 'manual-auth') {
            return html`
                <div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <div class="cd-card" style="width:min(520px, 94vw); margin-bottom:0;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <i class="ti ti-shield-search" style="font-size: 26px; color: #0071e3;"></i>
                            <h3 style="margin:0;">MagenSec Hub</h3>
                        </div>
                        <p style="color: var(--apple-text-secondary); font-size:13px; margin-bottom:12px;">
                            Enter organization and device context for Site-Admin review.
                        </p>
                        ${hostLicenseHint ? html`<div style="margin-bottom:10px; padding:10px 12px; border-radius:10px; border:1px solid rgba(214,57,57,0.25); background: rgba(214,57,57,0.08); color:#d63939; font-size:12px;">${hostLicenseHint}</div>` : ''}
                        <form onSubmit=${this.submitManualContext}>
                            <div class="cd-kpi-grid" style="grid-template-columns: 1fr 1fr; margin-bottom:10px;">
                                <div>
                                    <label class="cd-kpi-label" style="display:block; margin-bottom:4px;">Organization ID</label>
                                    <input class="cd-input" style="width:100%; min-width:0;" value=${this.state.manualOrgId || ''} onInput=${(ev) => this.setState({ manualOrgId: ev.target.value })} placeholder="ORGB-..." />
                                </div>
                                <div>
                                    <label class="cd-kpi-label" style="display:block; margin-bottom:4px;">Device ID</label>
                                    <input class="cd-input" style="width:100%; min-width:0;" value=${this.state.manualDeviceId || ''} onInput=${(ev) => this.setState({ manualDeviceId: ev.target.value })} placeholder="device-guid" />
                                </div>
                            </div>
                            <div style="margin-bottom:10px;">
                                <label class="cd-kpi-label" style="display:block; margin-bottom:4px;">Token (optional if signed in)</label>
                                <input class="cd-input" style="width:100%; min-width:0;" value=${this.state.manualToken || ''} onInput=${(ev) => this.setState({ manualToken: ev.target.value })} placeholder="Bearer token" />
                            </div>
                            ${error ? html`<div style="color:#d63939; font-size:12px; margin-bottom:8px;">${error}</div>` : ''}
                            <div style="display:flex; justify-content:flex-end;">
                                <button type="submit" class="btn btn-primary btn-sm">Open MagenSec Hub</button>
                            </div>
                        </form>
                    </div>
                </div>
                ${this.renderHostToasts()}
            `;
        }

        if (phase === 'loading') {
            return html`
                <div style="height: 100vh; display: flex; align-items: center; justify-content: center; color: var(--apple-text-secondary);">
                    <div>
                        <i class="ti ti-loader ti-spin" style="font-size: 32px; display: block; margin: 0 auto 16px auto; text-align: center;"></i>
                        <p>Analyzing Telemetry...</p>
                    </div>
                </div>
                ${this.renderHostToasts()}
            `;
        }

        if (!profile) return null;

        const d = profile.device || {};
        const deviceName = this.firstDefined(d.deviceName, d.machineName, d.DeviceName, d.DeviceId, profile?.deviceId, 'Unknown Device');

        const presence = this.getDevicePresence(profile);
        const statusClass = presence.statusClass;
        const statusText = presence.statusText;

        const scoreModel = this.buildScoreModel(profile);
        const riskScoreRaw = scoreModel.riskScore;
        const healthScore = scoreModel.securityScore;

        const radius = 60;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - ((healthScore) / 100) * circumference;
        const ringColor = this.getScoreColor(riskScoreRaw);

        return html`
            <div class="cd-container selectable">
                <div class="cd-shell">
                    ${this.renderSideNav(profile)}
                    <div class="cd-main">
                        <header class="cd-header" style="margin-bottom:8px;">
                            <div>
                                <h1 class="cd-title">MagenSec Hub</h1>
                                <div class="cd-subtitle">
                                    <span>${deviceName}</span>
                                    <span style="opacity: 0.5; margin: 0 6px;">|</span>
                                    <span class="cd-status-dot ${statusClass}"></span>
                                    ${statusText}
                                    <span style="opacity: 0.5; margin: 0 6px;">|</span>
                                    My Risk Score: ${Math.round(riskScoreRaw)}%
                                    <span style="opacity: 0.5; margin: 0 6px;">|</span>
                                    Security Score: ${healthScore}
                                </div>
                            </div>
                            <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; flex-wrap:wrap;">
                                <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.fetchProfile(true)}>
                                    <i class="ti ti-refresh"></i> Refresh
                                </button>
                            </div>
                        </header>

                        ${this.renderClientCommandToolbar()}

                        <div class="cd-body cd-compact-scroll">
                            ${activeTab === 'landing' ? this.renderLandingTab(profile, scoreModel) : ''}
                            ${activeTab === 'overview' ? this.renderOverviewTab(profile, healthScore, ringColor, circumference, strokeDashoffset) : ''}
                            ${activeTab === 'specs' ? this.renderSpecsTab(profile) : ''}
                            ${activeTab === 'software' ? this.renderSoftwareTab(profile) : ''}
                            ${activeTab === 'cves' ? this.renderCveTab(profile) : ''}
                        </div>
                    </div>
                </div>
                ${this.renderIpModal(profile)}
                ${this.renderCveModal()}
                ${this.renderHostToasts()}
            </div>
        `;
    }

    renderOverviewTab(profile, healthScore, ringColor, circumference, strokeDashoffset) {
        const actionPlan = this.buildActionPlan(profile);
        const { device, telemetryDetail } = profile;
        const fields = telemetryDetail?.latest?.fields || {};
        const ipList = this.asArray(this.firstDefined(fields.IPAddresses, fields.ipAddresses));
        const ipDisplay = this.getIpDisplay(ipList);
        const latestSeen = this.firstDefined(telemetryDetail?.latest?.timestamp, profile?.telemetryStatus?.lastHeartbeat, device?.lastHeartbeat, device?.LastHeartbeat);
        const installedApps = this.toNumber(profile?.apps?.summary?.installed, profile?.apps?.items?.length || 0);
        const totalCves = this.toNumber(profile?.cves?.count, profile?.cves?.items?.length || 0);
        const kevCount = this.toNumber(profile?.cves?.summary?.withKnownExploit, 0);

        return html`
            <div style="animation: cd-fade-in 0.3s ease-out;">
                <div class="cd-kpi-grid">
                    <div class="cd-kpi-card" title=${latestSeen ? `Current time minus last seen: ${this.getElapsedSince(latestSeen)}` : 'No heartbeat observed yet'}>
                        <div class="cd-kpi-label">Last Successful Heartbeat</div>
                        <div class="cd-kpi-value" style="font-size:16px;">${this.formatWhen(latestSeen)}</div>
                        <div class="cd-kpi-meta">${latestSeen ? this.getElapsedSince(latestSeen) : 'No heartbeat telemetry yet'}</div>
                    </div>
                    <div class="cd-kpi-card">
                        <div class="cd-kpi-label">Installed Apps</div>
                        <div class="cd-kpi-value">${installedApps}</div>
                        <div class="cd-kpi-meta">Inventory coverage</div>
                    </div>
                    <div class="cd-kpi-card">
                        <div class="cd-kpi-label">Vulnerabilities</div>
                        <div class="cd-kpi-value">${totalCves}</div>
                        <div class="cd-kpi-meta">Known CVEs detected</div>
                    </div>
                    <div class="cd-kpi-card">
                        <div class="cd-kpi-label">Known Exploits</div>
                        <div class="cd-kpi-value" style="color:${kevCount > 0 ? '#ff3b30' : 'var(--apple-text)'};">${kevCount}</div>
                        <div class="cd-kpi-meta">CISA KEV matched</div>
                    </div>
                </div>

                <div class="cd-chart-grid">
                    <div class="cd-chart-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                            <div class="cd-chart-title" style="margin-bottom:0;">Severity Breakdown</div>
                            <span class="badge bg-danger text-white">Live CVE Mix</span>
                        </div>
                        <div class="cd-chart-host" ref=${(el) => { this.chartSeverityEl = el; }}></div>
                    </div>
                    <div class="cd-chart-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                            <div class="cd-chart-title">${this.state.trendDays}-Day Exploitability Trend</div>
                            <div style="display:flex; gap:6px;">
                                <button
                                    class=${`cd-chip ${this.state.trendDays === 7 ? 'active' : ''}`}
                                    onClick=${() => this.setState({ trendDays: 7 })}
                                    title="Show 7-day vulnerability trend"
                                >7D</button>
                                <button
                                    class=${`cd-chip ${this.state.trendDays === 30 ? 'active' : ''}`}
                                    onClick=${() => this.setState({ trendDays: 30 })}
                                    title="Show 30-day vulnerability trend"
                                >30D</button>
                            </div>
                        </div>
                        <div style="margin: 0 0 6px 0;"><span class="badge bg-primary text-white">Smooth Trend</span></div>
                        <div class="cd-chart-host" ref=${(el) => { this.chartTrendEl = el; }}></div>
                    </div>
                    <div class="cd-chart-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                            <div class="cd-chart-title" style="margin-bottom:0;">Remediation Progress</div>
                            <span class="badge bg-success text-white">Actionable</span>
                        </div>
                        <div class="cd-chart-host" ref=${(el) => { this.chartRemediationEl = el; }}></div>
                    </div>
                </div>

                <!-- Action Plan Hero -->
                <div class="cd-card cd-hero-card">
                    <div class="cd-hero-score-ring">
                        <svg class="cd-hero-score-svg" viewBox="0 0 140 140">
                            <circle class="cd-hero-score-circle-bg" cx="70" cy="70" r="60"></circle>
                            <circle class="cd-hero-score-circle" cx="70" cy="70" r="60"
                                style=${{
                                    stroke: ringColor,
                                    strokeDasharray: `${circumference}`,
                                    strokeDashoffset: strokeDashoffset
                                }}>
                            </circle>
                        </svg>
                        <div class="cd-hero-score-text">
                            <div class="cd-hero-score-val">${Math.round(healthScore)}</div>
                            <div class="cd-hero-score-lbl">Health Score</div>
                        </div>
                    </div>

                    <div class="cd-hero-content">
                        <h3 class="cd-hero-title">Security Action Plan</h3>
                        <div class="cd-hero-desc">Based on hardware telemetry and vulnerability footprint.</div>
                        <div class="cd-action-list">
                            ${actionPlan.map(action => html`
                                <div class="cd-action-item">
                                    <div class="cd-action-icon cd-action-${action.level}">
                                        <i class="ti ${action.icon}"></i>
                                    </div>
                                    <div class="cd-action-text">
                                        <div class="cd-action-title">${action.title}</div>
                                        <div class="cd-action-desc">${action.desc}</div>
                                    </div>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>

                <div class="cd-spec-grid">
                    <!-- Key Specifications -->
                    <div class="cd-card" style="margin-bottom:0;">
                        <h4 style="margin:0 0 16px 0; font-size: 16px; font-weight: 600;">System Digest</h4>
                        <ul class="cd-list selectable">
                            <li class="cd-list-item">
                                <span class="cd-list-label">Operating System</span>
                                <span class="cd-list-value">${this.firstDefined(fields.OSVersion, fields.osVersion, fields.OSEdition, fields.OS, device?.os, 'Unknown')}</span>
                            </li>
                            <li class="cd-list-item">
                                <span class="cd-list-label">Manufacturer</span>
                                <span class="cd-list-value">${this.firstDefined(fields.Manufacturer, fields.SystemManufacturer, device?.manufacturer, 'Unknown')}</span>
                            </li>
                            <li class="cd-list-item">
                                <span class="cd-list-label">Logged On User</span>
                                <span class="cd-list-value">${this.firstDefined(fields.Username, fields.UserName, fields.LoggedOnUser, fields.CurrentUser, 'Unknown')}</span>
                            </li>
                            <li class="cd-list-item">
                                <span class="cd-list-label">IP Address</span>
                                <span class="cd-list-value" style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
                                    <span title=${ipDisplay.full || 'Unknown'}>${ipDisplay.primary}${ipDisplay.extra > 0 ? ` (+${ipDisplay.extra})` : ''}</span>
                                    ${ipList.length > 1 ? html`
                                        <button
                                            class="btn btn-xs btn-outline-secondary"
                                            title="View all IP addresses"
                                            onClick=${() => this.setState({ showIpModal: true })}
                                        >
                                            <i class="ti ti-list"></i>
                                        </button>
                                    ` : ''}
                                </span>
                            </li>
                        </ul>
                    </div>

                    <!-- Vulnerability Surface -->
                    <div class="cd-card" style="margin-bottom:0;">
                        <h4 style="margin:0 0 16px 0; font-size: 16px; font-weight: 600;">Attack Surface</h4>
                        <ul class="cd-list selectable">
                            <li class="cd-list-item">
                                <span class="cd-list-label">Active Exploits (KEV)</span>
                                <span class="cd-list-value" style=${profile?.cves?.summary?.withKnownExploit > 0 ? "color: #ff3b30" : ""}>
                                    ${profile?.cves?.summary?.withKnownExploit || 0}
                                </span>
                            </li>
                            <li class="cd-list-item">
                                <span class="cd-list-label">Critical Vulnerabilities</span>
                                <span class="cd-list-value">${profile?.cves?.summary?.critical || 0}</span>
                            </li>
                            <li class="cd-list-item">
                                <span class="cd-list-label">High Vulnerabilities</span>
                                <span class="cd-list-value">${profile?.cves?.summary?.high || 0}</span>
                            </li>
                            <li class="cd-list-item">
                                <span class="cd-list-label">Monitored Software</span>
                                <span class="cd-list-value">${profile?.apps?.summary?.installed || 0}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    renderSpecsTab(profile) {
        const { device, telemetryDetail } = profile;
        const fields = telemetryDetail?.latest?.fields || {};
        
        const cpuName = this.firstDefined(device?.cpu, fields.CPUName, fields.ProcessorName, 'N/A');
        const cpuCores = this.firstDefined(device?.cpuCores, fields.CPUCores, fields.Cores, 'N/A');
        const ramMb = this.toNumber(this.firstDefined(device?.ram, fields.TotalRAMMB, fields.TotalRamMb, fields.RAMMB), 0);
        const diskGb = this.toNumber(this.firstDefined(device?.disk, fields.SystemDriveSizeGB, fields.TotalDiskGb, fields.DiskGB), 0);
        const ramGB = ramMb > 0 ? Math.round(ramMb / 1024) : 'N/A';
        const diskGB = diskGb > 0 ? Math.round(diskGb) : 'N/A';
        const gpuName = this.firstDefined(fields.GPUName, fields.GraphicsName, 'N/A');
        const osEdition = this.firstDefined(device?.os, fields.OSEdition, fields.OSVersion, fields.OS, 'N/A');
        const osBuild = this.firstDefined(device?.build, fields.FeaturePackVersion, fields.OSBuild, 'N/A');
        const ipAddresses = this.asArray(this.firstDefined(fields.IPAddresses, fields.ipAddresses));
        
        return html`
            <div style="animation: cd-fade-in 0.3s ease-out;">
                <div class="cd-spec-grid">
                    <div class="cd-card">
                        <h4 style="margin:0 0 16px 0; font-size: 16px; font-weight: 600;"><i class="ti ti-cpu me-2"></i> Hardware</h4>
                        <ul class="cd-list selectable">
                            <li class="cd-list-item"><span class="cd-list-label">CPU</span><span class="cd-list-value">${cpuName} (${cpuCores} Cores)</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Memory (RAM)</span><span class="cd-list-value">${ramGB} GB</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">System Disk</span><span class="cd-list-value">${diskGB} GB</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Graphics (GPU)</span><span class="cd-list-value">${gpuName}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Architecture</span><span class="cd-list-value">${fields.CPUArch || 'N/A'}</span></li>
                        </ul>
                    </div>
                    
                    <div class="cd-card">
                        <h4 style="margin:0 0 16px 0; font-size: 16px; font-weight: 600;"><i class="ti ti-brand-windows me-2"></i> Operating System</h4>
                        <ul class="cd-list selectable">
                            <li class="cd-list-item"><span class="cd-list-label">Edition</span><span class="cd-list-value">${osEdition}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Build Number</span><span class="cd-list-value">${osBuild}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">MagenSec Client</span><span class="cd-list-value">${this.firstDefined(device?.clientVersion, device?.ClientVersion, fields.ClientVersion, 'N/A')}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Last Boot</span><span class="cd-list-value">${fields.LastBootTime || 'N/A'}</span></li>
                        </ul>
                    </div>

                    <div class="cd-card">
                        <h4 style="margin:0 0 16px 0; font-size: 16px; font-weight: 600;"><i class="ti ti-shield-lock me-2"></i> Platform Security</h4>
                        <ul class="cd-list selectable">
                            <li class="cd-list-item"><span class="cd-list-label">Endpoint Protection</span><span class="cd-list-value">${this.firstDefined(fields.AVProduct, fields.DefenderStatus, fields.DefenderEnabled, 'Unknown')}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Windows Firewall</span><span class="cd-list-value">${this.firstDefined(fields.FirewallEnabled, fields.WindowsFirewallEnabled) ? 'Enabled' : 'Unknown'}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">UAC Status</span><span class="cd-list-value">${fields.UACEnabled !== undefined ? (String(fields.UACEnabled).toLowerCase() === 'true' ? 'Enabled' : 'Disabled') : 'Unknown'}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">BitLocker Encryption</span><span class="cd-list-value">${fields.BitLockerStatus || 'Unknown'}</span></li>
                        </ul>
                    </div>
                    
                    <div class="cd-card">
                        <h4 style="margin:0 0 16px 0; font-size: 16px; font-weight: 600;"><i class="ti ti-network me-2"></i> Network</h4>
                        <ul class="cd-list selectable">
                            <li class="cd-list-item"><span class="cd-list-label">Connection</span><span class="cd-list-value">${fields.ConnectionType || 'N/A'}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">IPv4 Addresses</span><span class="cd-list-value" style="max-width:70%;">${ipAddresses.length > 0 ? ipAddresses.join(', ') : 'N/A'}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">MAC Address</span><span class="cd-list-value">${this.firstDefined(fields.MACAddresses, fields.MacAddresses, 'N/A')}</span></li>
                            <li class="cd-list-item"><span class="cd-list-label">Network Speed</span><span class="cd-list-value">${fields.NetworkSpeedMbps ? (fields.NetworkSpeedMbps + ' Mbps') : 'N/A'}</span></li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    renderSoftwareTab(profile) {
        const items = this.getFilteredSoftware(profile);

        if (items.length === 0) {
            return html`
                <div class="cd-empty">
                    <i class="ti ti-apps"></i>
                    <div class="cd-empty-title">No Software Detected</div>
                    <p>There is no software telemetry available for this device.</p>
                </div>
            `;
        }

        return html`
            <div style="animation: cd-fade-in 0.3s ease-out;">
                <div class="cd-toolbar">
                    <input
                        class="cd-input"
                        placeholder="Search software, vendor, version"
                        value=${this.state.softwareSearch}
                        onInput=${(e) => this.setState({ softwareSearch: e.target.value })}
                    />
                    <select class="cd-select" value=${this.state.softwareSort} onChange=${(e) => this.setState({ softwareSort: e.target.value })}>
                        <option value="risk">Sort: Risk</option>
                        <option value="name">Sort: Name</option>
                        <option value="vendor">Sort: Vendor</option>
                        <option value="version">Sort: Version</option>
                    </select>
                    <div style="display:flex; gap:6px;">
                        <button class=${`cd-chip ${this.state.softwareRiskFilter === 'all' ? 'active' : ''}`} onClick=${() => this.setState({ softwareRiskFilter: 'all' })}>All</button>
                        <button class=${`cd-chip ${this.state.softwareRiskFilter === 'high' ? 'active' : ''}`} onClick=${() => this.setState({ softwareRiskFilter: 'high' })}>High Risk</button>
                        <button class=${`cd-chip ${this.state.softwareRiskFilter === 'medium' ? 'active' : ''}`} onClick=${() => this.setState({ softwareRiskFilter: 'medium' })}>Medium</button>
                        <button class=${`cd-chip ${this.state.softwareRiskFilter === 'low' ? 'active' : ''}`} onClick=${() => this.setState({ softwareRiskFilter: 'low' })}>Clean</button>
                    </div>
                    <select class="cd-select" value=${this.state.softwareRuntimeFilter} onChange=${(e) => this.setState({ softwareRuntimeFilter: e.target.value })}>
                        <option value="all">Runtime: All</option>
                        <option value="running">Runtime: Running with path</option>
                        <option value="installPath">Runtime: Installed with path</option>
                    </select>
                </div>

                <div class="cd-card" style="padding:0; overflow:auto; animation: cd-fade-in 0.3s ease-out;">
                <div class="cd-grid-header" style="grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1fr); display: grid; min-width: 760px;">
                    <div>Application Name</div>
                    <div>Publisher</div>
                    <div>Version</div>
                </div>
                ${items.map(app => html`
                    <div class=${`cd-grid-row cd-app-risk cd-app-risk-${this.getRiskLevelForApp(app)}`} style="grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1fr); min-width: 760px;">
                        <div>
                            <div class="cd-row-title">
                                <button
                                    class="btn btn-link p-0 text-start"
                                    style="font-size:14px; font-weight:600; color:var(--apple-text); text-decoration:none;"
                                    title="View vulnerabilities for this app"
                                    onClick=${() => this.setState({ selectedAppFilter: app.name, activeTab: 'cves' })}
                                >
                                    ${app.name}
                                </button>
                                ${app.outdated ? html`<span class="cd-tag cd-tag-high" style="margin-left: 8px;">Outdated</span>` : ''}
                                ${app.cveCount > 0 ? html`<span class="cd-tag cd-tag-critical" style="margin-left: 8px;">${app.cveCount} CVEs</span>` : ''}
                                ${app.status === 'updated' ? html`<span class="cd-tag cd-tag-medium" style="margin-left: 8px;">Updated</span>` : ''}
                                ${app.isRunning ? html`<span class="cd-tag cd-tag-low" style="margin-left: 8px;">Running</span>` : ''}
                            </div>
                            <div class="cd-row-subtitle">
                                ${app.description || ''}
                                ${app.installPath ? ` · Install: ${app.installPath}` : ''}
                                ${app.runningPath ? ` · Running: ${app.runningPath}` : ''}
                            </div>
                        </div>
                        <div style="font-size: 13px; color: var(--apple-text-secondary);">${app.vendor || 'Unknown Publisher'}</div>
                        <div style="font-size: 13px; font-weight: 500;">
                            ${app.version || 'Unknown'} 
                            ${app.latestVersion ? html`<span style="color: #ff9500; font-size:11px; display:block;">Update to: ${app.latestVersion}</span>` : ''}
                        </div>
                    </div>
                `)}
            </div>
            </div>
        `;
    }

    renderCveTab(profile) {
        const items = this.getFilteredCves(profile);

        if (items.length === 0) {
            return html`
                <div class="cd-empty">
                    <i class="ti ti-shield-check" style="color: #34c759; opacity: 1;"></i>
                    <div class="cd-empty-title">All Clear</div>
                    <p>No known vulnerabilities detected for the software on this device.</p>
                </div>
            `;
        }

        return html`
            <div style="animation: cd-fade-in 0.3s ease-out;">
                <div class="cd-toolbar">
                    <input
                        class="cd-input"
                        placeholder="Search CVE, app, description"
                        value=${this.state.cveSearch}
                        onInput=${(e) => this.setState({ cveSearch: e.target.value })}
                    />
                    <select class="cd-select" value=${this.state.cveSeverityFilter} onChange=${(e) => this.setState({ cveSeverityFilter: e.target.value })}>
                        <option value="ALL">Severity: All</option>
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                    </select>
                    <select class="cd-select" value=${this.state.cveSort} onChange=${(e) => this.setState({ cveSort: e.target.value })}>
                        <option value="risk">Sort: CVSS Risk</option>
                        <option value="exploitability">Sort: Exploitability</option>
                        <option value="severity">Sort: Severity</option>
                        <option value="recent">Sort: Recently Seen</option>
                    </select>
                    <select class="cd-select" value=${this.state.cveMatchFilter} onChange=${(e) => this.setState({ cveMatchFilter: e.target.value })}>
                        <option value="all">Match: All</option>
                        <option value="absolute">Match: Absolute (2)</option>
                        <option value="heuristic">Match: Heuristic (1)</option>
                        <option value="unknown">Match: Unknown</option>
                    </select>
                    <select class="cd-select" value=${this.state.cveRemediationFilter} onChange=${(e) => this.setState({ cveRemediationFilter: e.target.value })}>
                        <option value="all">Remediation: All</option>
                        <option value="patch">Remediation: Patch</option>
                        <option value="config">Remediation: Config</option>
                        <option value="mitigate">Remediation: Mitigate</option>
                        <option value="nofix">Remediation: No Fix</option>
                        <option value="unknown">Remediation: Unknown</option>
                    </select>
                    <button class=${`cd-chip ${this.state.cveKnownExploitOnly ? 'active' : ''}`} onClick=${() => this.setState({ cveKnownExploitOnly: !this.state.cveKnownExploitOnly })}>
                        KEV Only
                    </button>
                    ${this.state.selectedAppFilter ? html`
                        <button class="cd-chip active" onClick=${() => this.setState({ selectedAppFilter: '' })}>
                            App Filter: ${this.state.selectedAppFilter} ✕
                        </button>
                    ` : ''}
                </div>

            <div class="cd-card" style="padding:0; overflow:auto; animation: cd-fade-in 0.3s ease-out;">
                <div class="cd-grid-header" style="grid-template-columns: minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr); display: grid; min-width: 760px;">
                    <div>Vulnerability ID</div>
                    <div>Impacted Software</div>
                    <div style="text-align:right;">CVSS Score</div>
                </div>
                ${items.map(cve => html`
                    <div class="cd-grid-row" style="grid-template-columns: minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr); min-width: 760px; cursor:pointer;" onClick=${() => this.openCveModal(cve)}>
                        <div>
                            <div class="cd-row-title">
                                ${cve.cveId || cve.id}
                            </div>
                            <div style="margin-top:4px;">
                                <span class="cd-tag ${this.getSeverityBadgeClass(cve.severity)}">${cve.severity}</span>
                                ${cve.hasKnownExploit ? html`<span class="cd-tag cd-tag-kev" style="margin-left:4px;">KEV</span>` : ''}
                                <span class="cd-tag cd-tag-medium" style="margin-left:4px;">${this.getCveMatchType(cve) === 'absolute' ? 'Match 2' : this.getCveMatchType(cve) === 'heuristic' ? 'Match 1' : 'Match ?'}</span>
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 13px; font-weight: 500; color: var(--apple-text);">${cve.appName || cve.productName || 'Unknown Product'}</div>
                            <div class="cd-row-subtitle" style="font-size: 12px; margin-top:4px; max-width: 90%; text-overflow: ellipsis; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                                ${cve.description || 'No description available.'}
                                ${cve.firstDetected ? ` · First: ${this.formatWhen(cve.firstDetected)}` : ''}
                                ${cve.lastDetected ? ` · Last: ${this.formatWhen(cve.lastDetected)}` : ''}
                                ${cve.epssProbability ? ` · EPSS: ${(this.toNumber(cve.epssProbability, 0) * 100).toFixed(1)}%` : ''}
                                ${cve.remediationType ? ` · Remediation: ${cve.remediationType}` : ''}
                            </div>
                        </div>
                        <div style="text-align:right; font-size: 16px; font-weight: 700; color: var(--apple-text);">
                            ${cve.cvssScore ? this.toNumber(cve.cvssScore, 0).toFixed(1) : 'N/A'}
                        </div>
                    </div>
                `)}
            </div>
            </div>
        `;
    }
}
