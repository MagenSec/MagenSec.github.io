/**
 * Business Page - Business Matrix + Diagnostics
 * Route: #!/siteadmin/business
 */

import { BusinessMatrixPage } from './components/BusinessMatrix.js';
import { DiagnosticsPage } from './components/Diagnostics.js';

const { html, Component } = window;
const { useState } = window.preactHooks;

export class BusinessPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeTab: 'matrix' // 'matrix' or 'diagnostics'
        };
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
                            <h2 class="page-title">Business Intelligence</h2>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <ul class="nav nav-tabs mb-3">
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'matrix' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'matrix' }); }}
                        >
                            <i class="ti ti-chart-dots-2 me-2"></i>
                            Business Matrix
                        </a>
                    </li>
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'diagnostics' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'diagnostics' }); }}
                        >
                            <i class="ti ti-heart-rate-monitor me-2"></i>
                            Diagnostics
                        </a>
                    </li>
                </ul>

                <!-- Tab content -->
                <div class="tab-content">
                    ${activeTab === 'matrix' && html`<${BusinessMatrixPage} embedded=${true} />`}
                    ${activeTab === 'diagnostics' && html`<${DiagnosticsPage} embedded=${true} />`}
                </div>
            </div>
        `;
    }
}
