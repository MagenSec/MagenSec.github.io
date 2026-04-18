/**
 * Activity Page - Reports and Logs
 * Route: #!/siteadmin/activity
 */

import { ApiAuditPage } from './components/ApiAudit.js';
import { DeviceActivityPage } from './components/DeviceActivity.js';
import { CronActivityPage } from './components/CronActivity.js';
import { AiReportsAnalysisPage } from '../../ai/aiReportsAnalysis.js';

const { html, Component } = window;
const { useState } = window.preactHooks;

export class ActivityPage extends Component {
    constructor(props) {
        super(props);
        const initialTab = this.resolveTabFromHash();
        this.state = {
            activeTab: initialTab // 'user-activity', 'device-activity', 'ai-reports', 'cron'
        };
    }

    componentDidMount() {
        this._hashListener = () => {
            const nextTab = this.resolveTabFromHash();
            if (nextTab !== this.state.activeTab) {
                this.setState({ activeTab: nextTab });
            }
        };
        window.addEventListener('hashchange', this._hashListener);
    }

    componentWillUnmount() {
        if (this._hashListener) {
            window.removeEventListener('hashchange', this._hashListener);
        }
    }

    resolveTabFromHash() {
        try {
            const hash = window.location.hash || '';
            const queryIndex = hash.indexOf('?');
            if (queryIndex < 0) return 'user-activity';

            const query = new URLSearchParams(hash.substring(queryIndex + 1));
            const tab = String(query.get('tab') || '').toLowerCase();

            if (tab === 'cron' || tab === 'cron-jobs') return 'cron';
            if (tab === 'device-activity') return 'device-activity';
            if (tab === 'ai-reports') return 'ai-reports';
            if (tab === 'user-activity') return 'user-activity';
            return 'user-activity';
        } catch {
            return 'user-activity';
        }
    }

    render() {
        const { activeTab } = this.state;

        return html`
            <div class="container-xl">
                <!-- Page header -->
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Site Admin</div>
                            <h2 class="page-title">Activity Reports</h2>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <ul class="nav nav-tabs mb-3">
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'user-activity' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'user-activity' }); }}
                        >
                            <i class="ti ti-user-check me-2"></i>
                            User Activity
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'device-activity' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'device-activity' }); }}
                        >
                            <i class="ti ti-device-desktop me-2"></i>
                            Device Activity
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'ai-reports' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'ai-reports' }); }}
                        >
                            <i class="ti ti-robot me-2"></i>
                            AI Reports
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'cron' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'cron' }); }}
                        >
                            <i class="ti ti-clock me-2"></i>
                            Cron Jobs
                        </a>
                    </li>
                </ul>

                <!-- Tab content -->
                <div class="tab-content">
                    ${activeTab === 'user-activity' && html`<${ApiAuditPage} />`}
                    ${activeTab === 'device-activity' && html`<${DeviceActivityPage} />`}
                    ${activeTab === 'ai-reports' && html`<${AiReportsAnalysisPage} />`}
                    ${activeTab === 'cron' && html`<${CronActivityPage} />`}
                </div>
            </div>
        `;
    }
}
