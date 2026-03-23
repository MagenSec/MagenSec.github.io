/**
 * Shared add-on page shell.
 * Fetches from the given API endpoint, handles loading / error / upgrade-wall states.
 */

import { api } from '@api';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

/**
 * Rich upgrade wall shown when the org doesn't have the add-on.
 * Presents the feature as a sales opportunity.
 */
function UpgradeWall({ name, description, icon = 'ti-stars', features = [] }) {
    const defaultFeatures = [
        'AI-powered security intelligence tailored to your organization',
        'Automated analysis and actionable recommendations',
        'Continuous monitoring with weekly reporting',
        'Benchmarks and comparisons across your industry'
    ];
    const displayFeatures = features.length > 0 ? features : defaultFeatures;

    return html`
        <div style="max-width:640px;margin:48px auto 0;">
            <div class="card" style="border-top:3px solid var(--tblr-primary);">
                <div class="card-body text-center pt-5 pb-5 px-4">
                    <div class="mb-4">
                        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#2563eb);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(99,102,241,0.25);">
                            <i class="ti ${icon}" style="font-size:2.2rem;color:white;"></i>
                        </div>
                    </div>
                    <h2 class="mb-2">${name}</h2>
                    <p class="text-muted mb-4" style="max-width:460px;margin-left:auto;margin-right:auto;">${description}</p>

                    <div class="text-start mb-5" style="max-width:420px;margin-left:auto;margin-right:auto;">
                        ${displayFeatures.map(f => html`
                            <div class="d-flex align-items-start gap-2 mb-3">
                                <div style="width:20px;height:20px;border-radius:50%;background:rgba(99,102,241,0.12);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                                    <i class="ti ti-check" style="font-size:0.75rem;color:#6366f1;"></i>
                                </div>
                                <span class="text-secondary">${f}</span>
                            </div>
                        `)}
                    </div>

                    <div class="d-flex gap-2 justify-content-center flex-wrap mb-3">
                        <a href="mailto:MagenSec@Gigabits.co.in?subject=Upgrade%20Inquiry%20%E2%80%94%20${encodeURIComponent(name)}" class="btn btn-primary">
                            <i class="ti ti-mail me-1"></i> Contact Us to Upgrade
                        </a>
                        <a href="mailto:MagenSec@Gigabits.co.in?subject=Demo%20Request%20%E2%80%94%20${encodeURIComponent(name)}" class="btn btn-outline-secondary">
                            <i class="ti ti-calendar me-1"></i> Book a Demo
                        </a>
                    </div>
                    <p class="text-muted small mt-2 mb-0">
                        Available on <strong>Business Ultimate</strong> plan.
                    </p>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generic add-on page wrapper.
 *
 * @param {object} props
 * @param {string}   props.addOnKey          - e.g. "PeerBenchmark"
 * @param {string}   props.title             - Page heading
 * @param {string}   props.pretitle          - Sub-heading / breadcrumb
 * @param {string}   props.endpoint          - API path, e.g. "/api/v1/orgs/{orgId}/add-ons/peer-benchmark"
 * @param {boolean}  props.isEnabled         - orgContext.has*() result
 * @param {string}   props.upgradeDesc       - Shown in upgrade wall subtitle
 * @param {string}   [props.upgradeIcon]     - Tabler icon class
 * @param {function} props.renderContent     - (data) => html`` for the main content
 */
export function AddOnPage({
    addOnKey, title, pretitle = 'Add-ons', endpoint,
    isEnabled, upgradeDesc, upgradeIcon, upgradeFeatures, renderContent, responseDataKey = null
}) {
    const isLicensedForOrg = window.orgContext?.hasAddOnForOrg?.(addOnKey) ?? false;
    const isSiteAdmin      = window.orgContext?.isSiteAdmin?.() ?? false;
    const [loading, setLoading] = useState(true);
    const [data, setData]       = useState(null);
    const [meta, setMeta]       = useState(null);
    const [error, setError]     = useState(null);

    const orgId = window.orgContext?.getCurrentOrg?.()?.orgId;

    useEffect(() => {
        if (!isEnabled || !orgId) { setLoading(false); return; }
        load();
    }, [isEnabled, isLicensedForOrg, orgId]);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const path = endpoint.replace('{orgId}', encodeURIComponent(orgId));
            const resp = await api.get(path);
            if (!resp?.success) throw new Error(resp?.message || 'API error');
            const envelope = resp?.data || {};
            const payload = responseDataKey ? (envelope?.[responseDataKey] ?? null) : envelope;
            setData(payload);
            setMeta({
                cachedFromStore: envelope?.cachedFromStore ?? false,
                computedAt: envelope?.computedAt || payload?.computedAt || payload?.snapshotDate || payload?.weekStartDate || null,
                schemaVersion: envelope?.schemaVersion || null
            });
        } catch (ex) {
            logger.error(`[AddOn:${addOnKey}] load failed`, ex);
            setError(ex.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    if (!isEnabled && !isSiteAdmin) {
        return html`
            <div class="container-xl">
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">${pretitle}</div>
                            <h2 class="page-title">${title}</h2>
                        </div>
                    </div>
                </div>
                <${UpgradeWall} name=${title} description=${upgradeDesc} icon=${upgradeIcon} features=${upgradeFeatures || []} />
            </div>
        `;
    }

    return html`
        <div class="container-xl">
            <!-- Page header -->
            <div class="page-header d-print-none mb-3">
                <div class="row align-items-center">
                    <div class="col">
                        <div class="page-pretitle">${pretitle}</div>
                        <h2 class="page-title">${title}</h2>
                    </div>
                    <div class="col-auto ms-auto">
                        ${meta?.computedAt ? html`
                            <span class="text-muted small">
                                <i class="ti ti-clock me-1"></i>
                                Updated ${new Date(meta.computedAt).toLocaleString()}
                            </span>
                        ` : null}
                        <button class="btn btn-sm btn-outline-secondary ms-2" onClick=${load} disabled=${loading}>
                            <i class="ti ti-refresh me-1"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>

            ${error ? html`
                <div class="alert alert-danger d-flex align-items-center">
                    <i class="ti ti-alert-triangle me-2"></i> ${error}
                    <button class="btn btn-sm btn-outline-danger ms-auto" onClick=${load}>Retry</button>
                </div>
            ` : loading ? html`
                <div class="d-flex justify-content-center align-items-center" style="min-height:200px">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            ` : data ? renderContent(data) : html`
                <div class="empty mt-4">
                    <p class="empty-title">No data yet</p>
                    <p class="empty-subtitle text-muted">Data will appear after the next cron run.</p>
                    <div class="empty-action">
                        <button class="btn btn-primary" onClick=${load}>
                            <i class="ti ti-refresh me-1"></i> Try again
                        </button>
                    </div>
                </div>
                `}
        </div>
    `;
}
