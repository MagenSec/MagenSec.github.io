import { AddOnPage } from './AddOnPage.js';

const { html } = window;

function renderPeerBenchmark(data) {
    const pct = data.scorePercentile ?? 0;
    const grade = pct >= 80 ? 'A' : pct >= 60 ? 'B' : pct >= 40 ? 'C' : pct >= 20 ? 'D' : 'F';
    const gradeColor = pct >= 80 ? 'success' : pct >= 60 ? 'info' : pct >= 40 ? 'warning' : 'danger';

    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Your Percentile</div>
                        <div class="h1 mb-0">${pct}th</div>
                        <span class="badge bg-${gradeColor} text-white mt-1">Grade ${grade}</span>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Your Score</div>
                        <div class="h1 mb-0">${data.orgScore ?? '—'}</div>
                        <div class="text-muted small">vs sector median ${data.sectorMedianScore ?? '—'}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Sector</div>
                        <div class="h3 mb-0">${data.sector || '—'}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center">
                    <div class="card-body">
                        <div class="subheader">Cohort Size</div>
                        <div class="h1 mb-0">${data.cohortSize ?? '—'}</div>
                        <div class="text-muted small">orgs benchmarked</div>
                    </div>
                </div>
            </div>
        </div>

        ${data.topGapDomains?.length > 0 ? html`
            <div class="card">
                <div class="card-header"><div class="card-title">Top Gap Domains vs Sector Peers</div></div>
                <div class="list-group list-group-flush">
                    ${data.topGapDomains.map(d => html`
                        <div class="list-group-item">
                            <i class="ti ti-alert-circle text-warning me-2"></i>${d}
                        </div>
                    `)}
                </div>
            </div>
        ` : null}
    `;
}

export function PeerBenchmarkPage() {
    const isEnabled = window.orgContext?.hasPeerBenchmark?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="PeerBenchmark"
        title="Peer Benchmark"
        endpoint="/api/v1/orgs/{orgId}/add-ons/peer-benchmark"
        responseDataKey="peerBenchmark"
        isEnabled=${isEnabled}
        upgradeDesc="See how your security posture compares to sector peers. Available on BusinessUltimate."
        upgradeIcon="ti-chart-dots-3"
        renderContent=${renderPeerBenchmark}
    />`;
}
