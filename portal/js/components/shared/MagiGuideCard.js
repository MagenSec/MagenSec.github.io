const { html } = window;

function normalizeList(value) {
    return Array.isArray(value) ? value.filter(Boolean).map(item => String(item)) : [];
}

function friendlySourceName(source) {
    const key = String(source || '').toLowerCase();
    const map = {
        'org-snapshot': 'MAGI dossier',
        'security-snapshot': 'Risk evidence',
        'compliance-snapshot': 'Compliance evidence',
        'audit-snapshot': 'Audit evidence',
        'alert-summary': 'Action evidence',
        'alerts': 'Action log',
        'sla-rules': 'SLA rules',
        'cve-list': 'Vulnerability evidence',
        'cve-device-facts': 'Device evidence',
        'device-fleet': 'Fleet evidence',
        'attack-chain-graph': 'Attack chain evidence'
    };
    return map[key] || source;
}

export function MagiGuideCard({
    title = 'MAGI guidance',
    verified = 'Evidence-linked',
    summary = '',
    nextAction = '',
    provenance = [],
    confidence = 'Deterministic',
    ctaHref = '#!/analyst',
    ctaLabel = 'Ask MAGI'
}) {
    const sources = [...new Set(normalizeList(provenance).map(friendlySourceName))];
    if (!summary && !nextAction && !sources.length) return null;

    return html`
        <div class="alert alert-info border-0 shadow-sm mb-3" role="note">
            <div class="d-flex flex-column gap-2">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-purple text-white"><i class="ti ti-message-chatbot me-1"></i>MAGI</span>
                        <div class="fw-semibold">${title}</div>
                    </div>
                    <div class="d-flex flex-wrap gap-1">
                        <span class="badge bg-success-lt text-success">${verified}</span>
                        <span class="badge bg-secondary-lt text-secondary">${confidence}</span>
                    </div>
                </div>
                <div class="row g-2 align-items-stretch">
                    ${summary ? html`
                        <div class="col-lg-6">
                            <div class="small text-muted text-uppercase fw-semibold mb-1">MAGI explains</div>
                            <div>${summary}</div>
                        </div>
                    ` : null}
                    ${nextAction ? html`
                        <div class="col-lg-6">
                            <div class="small text-muted text-uppercase fw-semibold mb-1">Next action</div>
                            <div>${nextAction}</div>
                        </div>
                    ` : null}
                </div>
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <div class="d-flex flex-wrap gap-1">
                        ${sources.map(source => html`<span class="badge bg-azure-lt text-azure">${source}</span>`)}
                    </div>
                    ${ctaHref ? html`<a class="btn btn-sm btn-outline-primary" href=${ctaHref}>${ctaLabel}</a>` : null}
                </div>
            </div>
        </div>
    `;
}

