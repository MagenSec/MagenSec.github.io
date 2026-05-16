import { api } from '@api';
import { AddOnPage } from './AddOnPage.js';
import { logger } from '@config';

const { html } = window;
const { useState } = window.preactHooks;

const GRADE_COLOR = { A: 'success', B: 'success', C: 'warning', D: 'danger', F: 'danger' };

// Local grade derivation to keep visual parity across portal even if backend grade drifts.
function deriveGrade(score) {
    const n = Number(score) || 0;
    if (n >= 90) return 'A';
    if (n >= 80) return 'B';
    if (n >= 70) return 'C';
    if (n >= 60) return 'D';
    return 'F';
}

// Score → semantic tone for KPI numerals (matches Posture/Compliance pattern).
// Green floor pinned to Grade B (>= 80) so the numeric tone never disagrees
// with the displayed Grade badge.
function scoreTone(score) {
    const n = Number(score) || 0;
    if (n >= 80) return 'success';
    if (n >= 60) return 'warning';
    return 'danger';
}

// D-8: Three-band severity gauge for duration-based pillars (MTTR today; reusable for any
// "lower is better" duration metric). Bands are inclusive-upper: <= bands[0] is green,
// <= bands[1] is amber, > bands[1] is red. The marker is positioned proportionally across
// the gauge: the green band occupies (bands[0] / domainMax) of the width, etc.
// `domainMax` clamps the marker so a 200-day outlier still plots inside the visible gauge
// (it lands at the right edge in the red band, instead of overflowing).
function renderDurationGauge(days, { bands, domainMax }) {
    const value = Math.max(0, Number(days) || 0);
    const greenEnd = bands[0];
    const amberEnd = bands[1];
    const greenPct = Math.max(2, Math.min(100, (greenEnd / domainMax) * 100));
    const amberPct = Math.max(2, Math.min(100 - greenPct, ((amberEnd - greenEnd) / domainMax) * 100));
    const redPct   = Math.max(0, 100 - greenPct - amberPct);
    const markerPct = Math.max(0, Math.min(100, (Math.min(value, domainMax) / domainMax) * 100));
    const tone = value <= greenEnd ? 'success' : value <= amberEnd ? 'warning' : 'danger';
    // Tiny inline gauge: 3 colored segments + a triangle marker.
    return html`
        <div class="position-relative" style="height:14px;" title=${`${value} day${value === 1 ? '' : 's'} — ${tone === 'success' ? `≤${greenEnd}d (good)` : tone === 'warning' ? `${greenEnd + 1}–${amberEnd}d (watch)` : `>${amberEnd}d (slow)`}`}>
            <div class="d-flex" style="height:6px; border-radius:3px; overflow:hidden;">
                <div class="bg-success" style=${`width:${greenPct}%`}></div>
                <div class="bg-warning" style=${`width:${amberPct}%`}></div>
                ${redPct > 0 ? html`<div class="bg-danger" style=${`width:${redPct}%`}></div>` : null}
            </div>
            <div class="position-absolute" style=${`left:calc(${markerPct}% - 5px); top:6px; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:6px solid var(--tblr-body-color, #232e3c);`}></div>
        </div>
        <div class="position-relative text-muted" style="height:14px; margin-top:4px; font-size:0.65rem;">
            <span class="position-absolute" style="left:0;">0d</span>
            <span class="position-absolute" style=${`left:${greenPct}%; transform:translateX(-50%);`}>${greenEnd}d</span>
            <span class="position-absolute" style=${`left:${greenPct + amberPct}%; transform:translateX(-50%);`}>${amberEnd}d</span>
            <span class="position-absolute" style="right:0;">${domainMax}d+</span>
        </div>
    `;
}

function renderInsuranceContent(data, { regenerating, regenMsg, onRegenerate }) {
    const rawScore = Number(data.hygieneScore ?? 0);
    const score = Math.round(rawScore);
    const grade = deriveGrade(rawScore);
    const color = GRADE_COLOR[grade] || 'secondary';
    const hygieneTone = scoreTone(rawScore);
    const securityTone = scoreTone(data.securityScore ?? 0);
    const complianceTone = scoreTone(data.complianceScore ?? 0);
    const pillars = Array.isArray(data.fourPillars) ? data.fourPillars : [];

    return html`
        <!-- Action bar: regenerate -->
        <div class="d-flex justify-content-end align-items-center gap-2 mb-3">
            ${regenMsg ? html`
                <div class="alert alert-${regenMsg.type} py-1 px-3 mb-0 small">
                    <i class="ti ${regenMsg.type === 'success' ? 'ti-check' : 'ti-alert-circle'} me-1"></i>${regenMsg.text}
                </div>
            ` : null}
                <button class="btn btn-outline-primary btn-sm" data-mutates-state="true" onClick=${onRegenerate} disabled=${regenerating}>
                ${regenerating
                    ? html`<span class="spinner-border spinner-border-sm me-1"></span> Generating...`
                    : html`<i class="ti ti-refresh me-1"></i> Update Readiness Evidence`}
            </button>
        </div>

        <!-- KPI cards -->
        <div class="row g-3 mb-4">
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Hygiene Score</div>
                        <div class="h1 mb-0 text-${hygieneTone}">${score}</div>
                        <span class="badge bg-${color}-lt text-${color} mt-1">Grade ${grade}</span>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Security Score</div>
                        <div class="h1 mb-0 text-${securityTone}">${data.securityScore ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Compliance Score</div>
                        <div class="h1 mb-0 text-${complianceTone}">${data.complianceScore ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Fleet Coverage</div>
                        <div class="h1 mb-0 text-primary">${Math.round(data.fleetCoveragePercent ?? 0)}%</div>
                        <div class="text-muted small">${data.activeDevices ?? 0} of ${data.deviceCount ?? 0} devices active</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Four Pillars as metric cards with progress bars -->
        ${pillars.length > 0 ? html`
            <h4 class="mb-3">Insurance Readiness Pillars</h4>
            <div class="row g-3 mb-4">
                ${pillars.map(p => {
                    const pillarName = String(p.pillarName || '');
                    // MTTR is reported in days (lower = better), every other pillar is a 0-100 score.
                    const isMttr = /mean\s*time/i.test(pillarName) || /\bmttr\b/i.test(pillarName);
                    const rawValue = Number(p.score ?? 0);
                    const pct = Math.max(0, Math.min(100, rawValue));
                    let pColor;
                    let displayValue;
                    let unitSuffix = null;
                    let progressBarPct;
                    if (isMttr) {
                        // D-8: tone matches the gauge bands (≤30 green, ≤60 amber, >60 red).
                        pColor = rawValue <= 30 ? 'success' : rawValue <= 60 ? 'warning' : 'danger';
                        displayValue = Math.round(rawValue);
                        unitSuffix = ' days';
                        progressBarPct = null; // gauge replaces the fill-bar
                    } else {
                        pColor = scoreTone(pct);
                        displayValue = Math.round(pct);
                        progressBarPct = pct;
                    }
                    // D-8: per-pillar 7d-vs-prior-7d trend arrow. Today the backend populates
                    // PillarData.trendDirection7d only for the MTTR pillar (computed in
                    // InsuranceAttestationService.ComputeMttrTrendDirection7d from the rolling
                    // OrgTrendPoint.MttrDays series). All other pillars carry null and render
                    // the neutral "trend pending" em-dash. Direction encoding is RAW value direction
                    // ('up' = MTTR rose, 'down' = MTTR fell); the MTTR-specific semantic mapping
                    // (lower = better, so 'down' = green improving, 'up' = red degrading) is applied
                    // here. When score pillars (Security/Hygiene/Compliance) start carrying their own
                    // trendDirection7d, this block will need a per-pillar polarity flip.
                    const trendDir = p.trendDirection7d || null;
                    const trendArrow = trendDir === 'down'
                        ? html`<span class="text-success fw-bold ms-2" title="Improving (last 7d vs prior 7d)" style="font-size:0.85em;">↓</span>`
                        : trendDir === 'up'
                            ? html`<span class="text-danger fw-bold ms-2" title="Degrading (last 7d vs prior 7d)" style="font-size:0.85em;">↑</span>`
                            : trendDir === 'stable'
                                ? html`<span class="text-muted ms-2" title="Stable (last 7d vs prior 7d)" style="font-size:0.85em;">→</span>`
                                : html`<span class="text-muted ms-2" title="Trend data pending" style="font-size:0.85em; opacity:0.45;">—</span>`;
                    return html`
                        <div class="col-md-3 col-6">
                            <div class="card">
                                <div class="card-body">
                                    <div class="subheader">${pillarName}</div>
                                    <div class="h2 mb-1 text-${pColor}">
                                        ${displayValue}${unitSuffix ? html`<span class="h5 text-muted ms-1">${unitSuffix}</span>` : ''}${trendArrow}
                                    </div>
                                    ${isMttr
                                        ? renderDurationGauge(rawValue, { bands: [30, 60], domainMax: 90 })
                                        : html`
                                            <div class="progress progress-sm">
                                                <div class="progress-bar bg-${pColor}" style=${`width:${progressBarPct}%`}></div>
                                            </div>`}
                                    ${isMttr ? html`<div class="text-muted small mt-1" style="font-size:0.7rem;">Lower is better</div>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                })}
            </div>
        ` : null}

        <!-- Attestation summary + coverage -->
        <div class="row g-3">
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-header"><div class="card-title">Attestation Summary</div></div>
                    <div class="card-body">
                        <div class="text-muted mb-2">Trend direction: <span class="fw-medium text-body">${data.trendDirection || 'Stable'}</span></div>
                        <div class="text-muted mb-2">Compliance gaps: <span class="fw-medium text-body">${data.complianceGapCount ?? 0}</span></div>
                        <div class="text-muted">Evidence window: <span class="fw-medium text-body">${data.dataWindowDays ?? 0} days</span></div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-header"><div class="card-title">Coverage</div></div>
                    <div class="card-body">
                        <div class="progress progress-sm mb-3">
                            <div class="progress-bar bg-primary" style=${`width:${Math.max(0, Math.min(100, Number(data.fleetCoveragePercent || 0)))}%`}></div>
                        </div>
                        <div class="text-muted">Active telemetry coverage supports insurance-grade evidence generation for the current organization.</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function InsuranceReadinessPage() {
    const isEnabled = window.orgContext?.hasInsuranceReadiness?.() ?? false;
    const orgId = window.orgContext?.getCurrentOrg?.()?.orgId;

    const [reloadKey, setReloadKey] = useState(0);
    const [regenerating, setRegenerating] = useState(false);
    const [regenMsg, setRegenMsg] = useState(null);

    const handleRegenerate = async () => {
        if (!orgId || regenerating) return;
        setRegenerating(true);
        setRegenMsg(null);
        try {
            // Phase 4.3.3: implicit-generate via the bundle's ?refresh=true (runs the
            // AddonInsuranceRefreshProvider on the cloud which writes Cache row + cooks the parquet atom).
            const resp = await api.getPageBundle(orgId, 'add-on/insurance-readiness', { refresh: true });
            if (!resp?.success) throw new Error(resp?.message || 'Generation failed');
            const refreshed = (resp?.data?.refreshedAtoms || []).includes('addon-insurance');
            setRegenMsg({ type: 'success', text: refreshed ? 'Readiness evidence updated.' : 'No readiness evidence is available yet.' });
            setReloadKey(k => k + 1);
        } catch (ex) {
            logger.error('[InsuranceReadiness] regenerate failed', ex);
            setRegenMsg({ type: 'danger', text: ex.message || 'Regeneration failed. Please try again.' });
        } finally {
            setRegenerating(false);
        }
    };

    const renderContent = (data) => renderInsuranceContent(data, { regenerating, regenMsg, onRegenerate: handleRegenerate });

    return html`<${AddOnPage}
        key=${reloadKey}
        addOnKey="InsuranceReadiness"
        title="Insurance Readiness"
        bundleName="add-on/insurance-readiness"
        atomName="addon-insurance"
        isEnabled=${isEnabled}
        upgradeDesc="Understand your cyber insurance readiness with scored control assessments. Available on BusinessUltimate."
        upgradeIcon="ti-shield-lock"
        emptyTitle="No insurance-readiness evidence yet"
        emptySubtitle="The next evidence update will score controls, fleet coverage, and remediation velocity."
        renderContent=${renderContent}
    />`;
}
