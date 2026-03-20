import { AddOnPage } from './AddOnPage.js';

const { html } = window;

function renderHygieneCoach(data) {
    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-8">
                <div class="card h-100">
                    <div class="card-header">
                        <div class="card-title">${data.headline || 'This Week\'s Focus'}</div>
                        ${data.weekStartDate ? html`
                            <div class="card-options text-muted small">
                                Week of ${new Date(data.weekStartDate).toLocaleDateString()}
                            </div>
                        ` : null}
                    </div>
                    <div class="card-body">
                        <p class="text-muted">${data.summary || '—'}</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center h-100">
                    <div class="card-body d-flex flex-column justify-content-center">
                        <div class="subheader">Projected Score Gain</div>
                        <div class="h1 mb-0 text-success">+${data.projectedScoreGain ?? 0}</div>
                        <div class="text-muted small">if all actions completed</div>
                    </div>
                </div>
            </div>
        </div>

        ${data.actions?.length > 0 ? html`
            <div class="card">
                <div class="card-header"><div class="card-title">Recommended Actions</div></div>
                <div class="list-group list-group-flush">
                    ${data.actions.map((action, i) => html`
                        <div class="list-group-item d-flex align-items-start">
                            <span class="badge bg-primary text-white me-3 mt-1">${i + 1}</span>
                            <div>
                                <div class="fw-medium">${action.title || action}</div>
                                ${action.description ? html`<div class="text-muted small">${action.description}</div>` : null}
                            </div>
                            ${action.isCompleted ? html`<i class="ti ti-check text-success ms-auto mt-1"></i>` : null}
                        </div>
                    `)}
                </div>
            </div>
        ` : null}
    `;
}

export function HygieneCoachPage() {
    const isEnabled = window.orgContext?.hasHygieneCoach?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="HygieneCoach"
        title="Hygiene Coach"
        endpoint="/api/v1/orgs/{orgId}/add-ons/hygiene-coach"
        isEnabled=${isEnabled}
        upgradeDesc="Get weekly AI-generated security hygiene plans personalized to your org's risk profile. Available on BusinessUltimate."
        upgradeIcon="ti-heart-rate-monitor"
        renderContent=${renderHygieneCoach}
    />`;
}
