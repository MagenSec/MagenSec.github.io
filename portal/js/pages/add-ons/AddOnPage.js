/**
 * Shared add-on page shell.
 * Fetches from the given API endpoint, handles loading / error / upgrade-wall states.
 */

import { api } from '@api';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

/**
 * Upgrade wall shown when the org doesn't have the add-on.
 */
function UpgradeWall({ name, description, icon = 'ti-stars' }) {
    return html`
        <div class="empty mt-5">
            <div class="empty-icon">
                <i class="ti ${icon}" style="font-size:3rem;color:var(--tblr-primary)"></i>
            </div>
            <p class="empty-title">${name}</p>
            <p class="empty-subtitle text-muted">${description}</p>
            <div class="empty-action">
                <a href="#!/settings" class="btn btn-primary">
                    <i class="ti ti-arrow-up-circle me-1"></i> Upgrade License
                </a>
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
    isEnabled, upgradeDesc, upgradeIcon, renderContent
}) {
    const [loading, setLoading] = useState(true);
    const [data, setData]       = useState(null);
    const [meta, setMeta]       = useState(null);
    const [error, setError]     = useState(null);

    const orgId = window.orgContext?.getCurrentOrg?.()?.orgId;

    useEffect(() => {
        if (!isEnabled || !orgId) { setLoading(false); return; }
        load();
    }, [isEnabled, orgId]);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const path = endpoint.replace('{orgId}', encodeURIComponent(orgId));
            const resp = await api.get(path);
            if (!resp?.success) throw new Error(resp?.message || 'API error');
            setData(resp.data);
            setMeta({ cachedFromStore: resp.cachedFromStore, computedAt: resp.computedAt, schemaVersion: resp.schemaVersion });
        } catch (ex) {
            logger.error(`[AddOn:${addOnKey}] load failed`, ex);
            setError(ex.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    if (!isEnabled) {
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
                <${UpgradeWall} name=${title} description=${upgradeDesc} icon=${upgradeIcon} />
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
