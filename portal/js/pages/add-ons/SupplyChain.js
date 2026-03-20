import { AddOnPage } from './AddOnPage.js';

const { html } = window;

function renderSupplyChain(data) {
    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">CISA Advisory Matches</div>
                        <div class="h1 mb-0 ${data.matchCount > 0 ? 'text-danger' : 'text-success'}">
                            ${data.matchCount ?? 0}
                        </div>
                        <div class="text-muted small">against installed software</div>
                    </div>
                </div>
            </div>
        </div>

        ${data.matches?.length > 0 ? html`
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Matched Advisories</div>
                    <div class="card-options">
                        <span class="badge bg-danger text-white">${data.matches.length} matched</span>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${data.matches.map(m => html`
                        <div class="list-group-item">
                            <div class="d-flex align-items-start">
                                <div class="flex-grow-1">
                                    <div class="fw-medium">
                                        <a href=${m.link} target="_blank" rel="noopener noreferrer" class="text-danger">
                                            ${m.title}
                                        </a>
                                    </div>
                                    <div class="text-muted small mt-1">
                                        <span class="badge bg-secondary-lt text-secondary me-2">${m.advisoryId}</span>
                                        Published ${m.publishedAt ? new Date(m.publishedAt).toLocaleDateString() : '—'}
                                    </div>
                                    ${m.affectedApps?.length > 0 ? html`
                                        <div class="mt-1">
                                            ${m.affectedApps.map(app => html`
                                                <span class="badge bg-warning-lt text-warning me-1">${app}</span>
                                            `)}
                                        </div>
                                    ` : null}
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        ` : html`
            <div class="card">
                <div class="card-body text-center text-success py-5">
                    <i class="ti ti-shield-check" style="font-size:3rem"></i>
                    <p class="mt-2 mb-0 fw-medium">No CISA advisory matches found</p>
                    <p class="text-muted small">Your installed software has no known active advisories.</p>
                </div>
            </div>
        `}
    `;
}

export function SupplyChainPage() {
    const isEnabled = window.orgContext?.hasSupplyChainIntel?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="SupplyChainIntel"
        title="Supply Chain Intel"
        endpoint="/api/v1/orgs/{orgId}/add-ons/supply-chain-intel"
        isEnabled=${isEnabled}
        upgradeDesc="Cross-reference your software inventory against CISA advisories for proactive supply chain risk detection. Available on BusinessUltimate."
        upgradeIcon="ti-building-factory"
        renderContent=${renderSupplyChain}
    />`;
}
