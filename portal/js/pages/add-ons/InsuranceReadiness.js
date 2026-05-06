import { api } from '@api';
import { AddOnPage } from './AddOnPage.js';
import { logger } from '@config';

const { html } = window;
const { useState } = window.preactHooks;

const GRADE_COLOR = { A: 'success', B: 'info', C: 'warning', D: 'danger', F: 'danger' };

function renderInsuranceContent(data, { regenerating, regenMsg, onRegenerate }) {
    const grade = data.grade || 'F';
    const color = GRADE_COLOR[grade] || 'secondary';
    const score = Number(data.hygieneScore ?? 0).toFixed(1);
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
                    : html`<i class="ti ti-refresh me-1"></i> Update Readiness Dossier`}
            </button>
        </div>

        <!-- KPI cards -->
        <div class="row g-3 mb-4">
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Hygiene Score</div>
                        <div class="h1 mb-0">${score}</div>
                        <span class="badge bg-${color} text-white mt-1">Grade ${grade}</span>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Hygiene Score</div>
                        <div class="h1 mb-0 text-success">${data.securityScore ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Compliance Score</div>
                        <div class="h1 mb-0 text-info">${data.complianceScore ?? 0}</div>
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
                    const pct = Math.max(0, Math.min(100, Number(p.score ?? 0)));
                    const pColor = pct >= 70 ? 'success' : pct >= 50 ? 'warning' : 'danger';
                    return html`
                        <div class="col-md-3 col-6">
                            <div class="card">
                                <div class="card-body">
                                    <div class="subheader">${p.pillarName}</div>
                                    <div class="h2 mb-1 text-${pColor}">${pct}</div>
                                    <div class="progress progress-sm">
                                        <div class="progress-bar bg-${pColor}" style=${`width:${pct}%`}></div>
                                    </div>
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
                        <div class="text-muted">Active telemetry coverage supports insurance-grade evidence generation for the current org dossier.</div>
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
            setRegenMsg({ type: 'success', text: refreshed ? 'Readiness Dossier updated.' : 'No readiness evidence is available yet.' });
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
        renderContent=${renderContent}
    />`;
}
