/**
 * Business Page - Business Metrics + Diagnostics
 * Route: #!/siteadmin/business
 */

import { BusinessMatrixPage } from './components/BusinessMatrix.js';
import { DiagnosticsPage } from './components/Diagnostics.js';
import { ProfitabilityPage } from './components/Profitability.js';

const { html, Component } = window;
const { useState } = window.preactHooks;

export class BusinessPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            activeTab: 'matrix' // 'matrix' | 'diagnostics' | 'profitability'
        };
    }

    render() {
        const { activeTab } = this.state;

        return html`
            <div class="container-xl business-intelligence-shell">
                <!-- Page header -->
                <div class="page-header d-print-none mb-3 business-intelligence-header">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Site Admin</div>
                            <h2 class="page-title">Business Intelligence</h2>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <ul class="nav nav-tabs mb-3 business-intelligence-tabs">
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'matrix' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'matrix' }); }}
                        >
                            <i class="ti ti-chart-dots-2 me-2"></i>
                            Business Metrics
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
                    <li class="nav-item">
                        <a 
                            class="nav-link ${activeTab === 'profitability' ? 'active' : ''}" 
                            href="#" 
                            onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'profitability' }); }}
                        >
                            <i class="ti ti-cash me-2"></i>
                            Profitability
                        </a>
                    </li>
                </ul>

                <!-- Tab content -->
                <div class="tab-content">
                    ${activeTab === 'matrix'        && html`<${BusinessMatrixPage} embedded=${true} />`}
                    ${activeTab === 'diagnostics'   && html`<${DiagnosticsPage} embedded=${true} />`}
                    ${activeTab === 'profitability' && html`<${ProfitabilityPage} />`}
                </div>
            </div>
        `;
    }
}
