import { AddOnPage } from './AddOnPage.js';

const { html } = window;

const GRADE_COLOR = { A: 'success', B: 'info', C: 'warning', D: 'danger', F: 'danger' };

function renderInsuranceReadiness(data) {
    const grade = data.grade || 'F';
    const color = GRADE_COLOR[grade] || 'secondary';
    const score = data.readinessScore ?? 0;

    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Readiness Score</div>
                        <div class="h1 mb-0">${score}</div>
                        <span class="badge bg-${color} text-white mt-1">Grade ${grade}</span>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Passed Controls</div>
                        <div class="h1 mb-0 text-success">${data.passedControls?.length ?? 0}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Failed Controls</div>
                        <div class="h1 mb-0 text-danger">${data.failedControls?.length ?? 0}</div>
                    </div>
                </div>
            </div>
        </div>

        ${data.controlAreas?.length > 0 ? html`
            <div class="card mb-3">
                <div class="card-header"><div class="card-title">Control Areas</div></div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table">
                        <thead>
                            <tr><th>Area</th><th class="text-end">Score</th><th class="text-center">Status</th></tr>
                        </thead>
                        <tbody>
                            ${data.controlAreas.map(area => html`
                                <tr>
                                    <td>${area.areaName}</td>
                                    <td class="text-end">${area.score}</td>
                                    <td class="text-center">
                                        ${area.isSatisfied
                                            ? html`<span class="badge bg-success text-white">Pass</span>`
                                            : html`<span class="badge bg-danger text-white">Fail</span>`}
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : null}

        ${data.failedControls?.length > 0 ? html`
            <div class="card">
                <div class="card-header"><div class="card-title">Failed Controls</div></div>
                <div class="list-group list-group-flush">
                    ${data.failedControls.map(c => html`
                        <div class="list-group-item">
                            <i class="ti ti-x text-danger me-2"></i>${c}
                        </div>
                    `)}
                </div>
            </div>
        ` : null}
    `;
}

export function InsuranceReadinessPage() {
    const isEnabled = window.orgContext?.hasInsuranceReadiness?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="InsuranceReadiness"
        title="Insurance Readiness"
        endpoint="/api/v1/orgs/{orgId}/add-ons/insurance-readiness"
        isEnabled=${isEnabled}
        upgradeDesc="Understand your cyber insurance readiness with scored control assessments. Available on BusinessUltimate."
        upgradeIcon="ti-shield-lock"
        renderContent=${renderInsuranceReadiness}
    />`;
}
