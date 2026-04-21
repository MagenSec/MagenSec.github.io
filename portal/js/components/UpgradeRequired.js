/**
 * UpgradeRequired - Shown when a user navigates to a page gated by an add-on they don't have.
 */
const { html } = window;

const ADD_ON_INFO = {
    MAGI:               { label: 'Officer MAGI',            icon: 'ti-message-chatbot',     plan: 'Business Premium' },
    Compliance:         { label: 'Compliance',              icon: 'ti-certificate',         plan: 'Business Premium' },
    Audit:              { label: 'Audit',                   icon: 'ti-file-search',         plan: 'Business Premium' },
    ThreatIntel:        { label: 'Threat Intelligence',     icon: 'ti-shield-bolt',         plan: 'Business Premium' },
    PeerBenchmark:      { label: 'Peer Benchmarking',       icon: 'ti-chart-dots-3',        plan: 'Business Ultimate' },
    HygieneCoach:       { label: 'Hygiene Coach',           icon: 'ti-heart-rate-monitor',  plan: 'Business Ultimate' },
    InsuranceReadiness: { label: 'Insurance Readiness',     icon: 'ti-shield-lock',         plan: 'Business Ultimate' },
    CompliancePlus:     { label: 'Compliance Plus',         icon: 'ti-certificate-2',       plan: 'Business Ultimate' },
    SupplyChainIntel:   { label: 'Supply Chain Intel',      icon: 'ti-building-factory',    plan: 'Business Ultimate' },
    Rewind:             { label: 'Time Warp',               icon: 'ti-clock-rewind',        plan: 'Business Ultimate' },
    LicenseManagement:  { label: 'License Management',      icon: 'ti-license',             plan: 'Business Premium' },
    AttackChain:        { label: 'Attack Chain',            icon: 'ti-route',               plan: 'Business Ultimate' },
    AuditorDashboard:   { label: 'Auditor Dashboard',       icon: 'ti-file-search',         plan: 'Business Premium' },
};

function UpgradeRequired({ feature }) {
    const info = ADD_ON_INFO[feature] || { label: feature || 'This feature', icon: 'ti-lock', plan: 'a higher plan' };

    const goHome = (e) => {
        e.preventDefault();
        const page = window.page || window.Page;
        if (page) page.redirect('/dashboard');
    };

    return html`
        <div class="page-body">
            <div class="container-xl">
                <div class="empty" style="min-height: 60vh;">
                    <div class="empty-icon">
                        <i class="ti ${info.icon}" style="font-size: 4rem; color: var(--tblr-blue);"></i>
                    </div>
                    <p class="empty-title h2 mt-3">${info.label}</p>
                    <p class="empty-subtitle text-muted" style="max-width: 420px;">
                        This capability is available on the <strong>${info.plan}</strong> plan.
                        Contact your administrator to upgrade, or reach out to us for a demo.
                    </p>
                    <div class="empty-action d-flex gap-2">
                        <a href="#" class="btn btn-outline-secondary" onclick=${goHome}>
                            <i class="ti ti-arrow-left me-1"></i>Back to Dashboard
                        </a>
                        <a href="mailto:hello@magensec.com?subject=Upgrade inquiry — ${encodeURIComponent(info.label)}" class="btn btn-primary">
                            <i class="ti ti-mail me-1"></i>Contact Us
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export { UpgradeRequired };
