import { AddOnPage } from './AddOnPage.js';

const { html } = window;

function renderCompliancePlus(data) {
    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Total Gaps</div>
                        <div class="h1 mb-0">${data.totalGapCount ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Critical Gaps</div>
                        <div class="h1 mb-0 text-danger">${data.criticalGapCount ?? 0}</div>
                    </div>
                </div>
            </div>
        </div>

        ${data.frameworks?.length > 0 ? html`
            <div class="card">
                <div class="card-header"><div class="card-title">Framework Breakdown</div></div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table">
                        <thead>
                            <tr>
                                <th>Framework</th>
                                <th class="text-end">Gaps</th>
                                <th class="text-end">Passed</th>
                                <th class="text-end">Compliance %</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.frameworks.map(f => html`
                                <tr>
                                    <td>
                                        <span class="badge bg-secondary-lt text-secondary me-2">${f.frameworkId}</span>
                                        ${f.frameworkName}
                                    </td>
                                    <td class="text-end text-danger">${f.gapCount}</td>
                                    <td class="text-end text-success">${f.passCount}</td>
                                    <td class="text-end">${(f.compliancePct * 100).toFixed(1)}%</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : null}
    `;
}

export function CompliancePlusPage() {
    const isEnabled = window.orgContext?.hasCompliancePlus?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="CompliancePlus"
        title="Compliance Plus"
        endpoint="/api/v1/orgs/{orgId}/add-ons/compliance-plus"
        isEnabled=${isEnabled}
        upgradeDesc="Extended compliance checks for ISO 27001, SOC 2, and PCI-DSS. Available on BusinessUltimate."
        upgradeIcon="ti-certificate-2"
        renderContent=${renderCompliancePlus}
    />`;
}
