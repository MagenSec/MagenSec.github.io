/**
 * Cron Jobs Page - Site Admin operations console for scheduled and manual cron work.
 */

import { CronActivityPage } from '../activity/components/CronActivity.js';
import { AdminActionsTab } from '../manage/components/AdminActionsTab.js';

const { html, Component } = window;

const VALID_CRON_VIEWS = new Set(['monitor', 'run']);

function getCronViewFromHash() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex < 0) return 'monitor';

    const view = String(new URLSearchParams(hash.substring(queryIndex + 1)).get('view') || '').toLowerCase();
    return VALID_CRON_VIEWS.has(view) ? view : 'monitor';
}

function firstArrayOf(obj, candidateKeys = []) {
    if (!obj || typeof obj !== 'object') return [];

    for (const key of candidateKeys) {
        const val = obj[key];
        if (Array.isArray(val)) return val;
    }

    const candidates = [obj.data, obj.items, obj.orgs, obj.organizations, obj.results];
    for (const val of candidates) {
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object') {
            const nested = firstArrayOf(val, candidateKeys);
            if (nested.length) return nested;
        }
    }

    for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) return obj[key];
    }

    return [];
}

export class CronJobsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeView: getCronViewFromHash(),
            orgs: []
        };
    }

    componentDidMount() {
        window.addEventListener('hashchange', this.syncViewFromHash);
        this.syncViewFromHash();
        this.loadOrgs();
    }

    componentWillUnmount() {
        window.removeEventListener('hashchange', this.syncViewFromHash);
    }

    syncViewFromHash = () => {
        const activeView = getCronViewFromHash();
        if (activeView !== this.state.activeView) {
            this.setState({ activeView });
        }
    };

    setView = (activeView) => {
        const query = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
        query.set('view', activeView);
        window.location.hash = `#!/siteadmin/cron?${query.toString()}`;
        this.setState({ activeView });
    };

    loadOrgs = async () => {
        try {
            const response = await window.api.get('/api/v1/admin/orgs?includeDisabled=true&pageSize=200');
            this.setState({ orgs: firstArrayOf(response, ['data', 'items', 'orgs', 'organizations']) });
        } catch (error) {
            console.error('[CronJobsPage] Failed to load organizations', error);
            this.setState({ orgs: [] });
        }
    };

    handleTriggerCron = async (taskOrRequest, params = {}) => {
        try {
            const request = typeof taskOrRequest === 'string'
                ? { taskId: taskOrRequest, ...params }
                : { ...(taskOrRequest || {}) };
            const label = request.jobId || request.taskId || 'Cron job';
            const response = await window.api.adminTriggerCron(request);

            if (!response?.success) {
                window.toast?.show?.(response?.message || `Failed to queue ${label}`, 'error');
                return { success: false, message: response?.message };
            }

            const queuedStatus = response?.data?.status || 'Queued';
            window.toast?.show?.(`${label} accepted with status ${queuedStatus}`, 'success');
            return { success: true, data: response?.data || null };
        } catch (error) {
            console.error('[CronJobsPage] Failed to queue cron job', error);
            window.toast?.show?.(error?.message || 'Failed to queue cron job', 'error');
            return { success: false, message: error?.message };
        }
    };

    render() {
        const { activeView, orgs } = this.state;

        return html`
            <div class="container-xl">
                <div class="page-header d-print-none mb-3">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Site Admin</div>
                            <h2 class="page-title">
                                <i class="ti ti-clock-hour-4 me-2"></i>
                                Cron Jobs
                            </h2>
                        </div>
                        <div class="col-auto">
                            <div class="btn-list">
                                <button class=${`btn ${activeView === 'monitor' ? 'btn-primary' : 'btn-outline-primary'}`} onClick=${() => this.setView('monitor')}>
                                    <i class="ti ti-chart-bar me-1"></i>
                                    Monitor
                                </button>
                                <button class=${`btn ${activeView === 'run' ? 'btn-primary' : 'btn-outline-primary'}`} onClick=${() => this.setView('run')}>
                                    <i class="ti ti-player-play me-1"></i>
                                    Run Jobs
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                ${activeView === 'monitor' && html`
                    <${CronActivityPage} showHeader=${false} embedded=${true} />
                `}

                ${activeView === 'run' && html`
                    <${AdminActionsTab}
                        orgs=${orgs}
                        onTriggerCron=${this.handleTriggerCron}
                        onResetRemediation=${async () => ({ success: false, message: 'Remediation reset is available from Manage.' })}
                        loadCronStatus=${() => {}}
                        includeResetRemediation=${false}
                        showCatalogHint=${false}
                        activityRoute="#!/siteadmin/cron?view=monitor"
                    />
                `}
            </div>
        `;
    }
}