import { AddOnPage } from './AddOnPage.js';

const { html } = window;

function renderSupplyChain(data) {
    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Active Alerts</div>
                        <div class="h1 mb-0 ${data.alertCount > 0 ? 'text-danger' : 'text-success'}">
                            ${data.alertCount ?? 0}
                        </div>
                        <div class="text-muted small">supply chain signals detected</div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Critical Alerts</div>
                        <div class="h1 mb-0 ${(data.criticalAlertCount ?? 0) > 0 ? 'text-danger' : 'text-success'}">${data.criticalAlertCount ?? 0}</div>
                        <div class="text-muted small">require immediate review</div>
                    </div>
                </div>
            </div>
        </div>

        ${data.alerts?.length > 0 ? html`
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Current Alerts</div>
                    <div class="card-options">
                        <span class="badge bg-danger text-white">${data.alerts.length} active</span>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${data.alerts.map(m => html`
                        <div class="list-group-item">
                            <div class="d-flex align-items-start">
                                <div class="flex-grow-1">
                                    <div class="fw-medium">${m.alertType || 'Supply chain alert'}</div>
                                    <div class="text-muted small mt-1">
                                        <span class="badge ${String(m.severity || '').toLowerCase() === 'critical' ? 'bg-danger text-white' : 'bg-warning text-white'} me-2">${m.severity || 'Medium'}</span>
                                        ${m.cveId ? html`<span class="badge bg-secondary-lt text-secondary me-2">${m.cveId}</span>` : null}
                                        ${m.affectedDevices ?? 0} device${m.affectedDevices === 1 ? '' : 's'} impacted
                                    </div>
                                    <div class="text-muted small mt-2">${m.advisory || 'Advisory details unavailable.'}</div>
                                    <div class="mt-2"><span class="badge bg-primary-lt text-primary">${m.recommendedAction || 'Investigate immediately'}</span></div>
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
                    <p class="mt-2 mb-0 fw-medium">No active supply chain alerts</p>
                    <p class="text-muted small">Current posture and KEV-linked software signals show no supply chain exposure.</p>
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
        bundleName="add-on/supply-chain-intel"
        atomName="addon-supply-chain"
        isEnabled=${isEnabled}
        upgradeDesc="Cross-reference your software inventory against CISA advisories for proactive supply chain risk detection. Available on BusinessUltimate."
        upgradeIcon="ti-building-factory"
        renderContent=${renderSupplyChain}
    />`;
}
