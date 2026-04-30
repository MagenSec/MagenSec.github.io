import { AddOnPage } from './AddOnPage.js';

const { html } = window;
const { useState } = window.preactHooks;

const FRAMEWORK_TABS = [
    { key: 'soc2',     label: 'SOC 2',     dataKey: 'soc2Readiness'     },
    { key: 'iso27001', label: 'ISO 27001',  dataKey: 'iso27001Readiness' },
    { key: 'hipaa',    label: 'HIPAA',      dataKey: 'hipaaReadiness'    },
];

function FrameworkTabs({ data }) {
    const [activeTab, setActiveTab] = useState('soc2');

    const current = FRAMEWORK_TABS.find(t => t.key === activeTab);
    const fw = current ? data[current.dataKey] : null;
    const readinessPct = Math.max(0, Math.min(100, Number(fw?.readinessPercent ?? 0)));
    const pColor = readinessPct >= 70 ? 'success' : readinessPct >= 50 ? 'warning' : 'danger';

    return html`
        <!-- Framework nav tabs -->
        <div class="card">
            <div class="card-header">
                <ul class="nav nav-tabs card-header-tabs">
                    ${FRAMEWORK_TABS.map(tab => html`
                        <li class="nav-item">
                            <button
                                class="nav-link ${activeTab === tab.key ? 'active' : ''}"
                                onClick=${() => setActiveTab(tab.key)}
                            >
                                ${tab.label}
                            </button>
                        </li>
                    `)}
                </ul>
            </div>
            <div class="card-body">
                ${fw ? html`
                    <!-- Readiness gauge row -->
                    <div class="row g-3 mb-4">
                        <div class="col-md-4">
                            <div class="text-center">
                                <div class="subheader mb-1">Readiness</div>
                                <div class="h1 text-${pColor} mb-1">${readinessPct}%</div>
                                <div class="progress progress-sm" style="height:8px">
                                    <div class="progress-bar bg-${pColor}" style=${`width:${readinessPct}%`}></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card text-center h-100">
                                <div class="card-body py-3">
                                    <div class="subheader">Critical Gaps</div>
                                    <div class="h2 mb-0 text-danger">${fw.criticalGaps ?? 0}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card text-center h-100">
                                <div class="card-body py-3">
                                    <div class="subheader">High Gaps</div>
                                    <div class="h2 mb-0 text-warning">${fw.highGaps ?? 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Recommended actions -->
                    ${fw.recommendedActions?.length > 0 ? html`
                        <div>
                            <div class="fw-medium mb-2">Recommended Actions</div>
                            <div class="d-flex flex-wrap gap-2">
                                ${fw.recommendedActions.map((action, i) => html`
                                    <div class="d-flex align-items-center gap-1">
                                        <span class="badge bg-primary text-white">${i + 1}</span>
                                        <span class="badge bg-primary-lt text-primary">${action}</span>
                                    </div>
                                `)}
                            </div>
                        </div>
                    ` : html`
                        <p class="text-muted text-center py-3 mb-0">No recommended actions for this framework.</p>
                    `}
                ` : html`
                    <div class="text-center py-4 text-muted">
                        <i class="ti ti-info-circle" style="font-size:2rem"></i>
                        <p class="mt-2 mb-0">No data available for ${current?.label}.</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

function renderCompliancePlus(data) {
    return html`
        <!-- Summary KPIs -->
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">CIS Gaps</div>
                        <div class="h1 mb-0">${data.cisGapCount ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">NIST Gaps</div>
                        <div class="h1 mb-0 text-danger">${data.nistGapCount ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Trend</div>
                        <div class="h1 mb-0 text-info">${data.overallComplianceTrend > 0 ? '+' : ''}${data.overallComplianceTrend ?? 0}</div>
                        <div class="text-muted small">week over week</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Framework tabs -->
        <${FrameworkTabs} data=${data} />
    `;
}

export function CompliancePlusPage() {
    const isEnabled = window.orgContext?.hasCompliancePlus?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="CompliancePlus"
        title="Compliance Plus"
        bundleName="add-on/compliance-plus"
        atomName="addon-compliance-plus"
        isEnabled=${isEnabled}
        upgradeDesc="Extended compliance checks for ISO 27001, SOC 2, and PCI-DSS. Available on BusinessUltimate."
        upgradeIcon="ti-certificate-2"
        renderContent=${renderCompliancePlus}
    />`;
}
