const { html } = window;

const INVENTORY_AREAS = [
    {
        href: '#!/devices',
        icon: 'ti-devices',
        title: 'Fleet',
        subtitle: 'Device lifecycle, visibility, risk, tags, and actions.',
        badge: 'Device operations',
        badgeClass: 'bg-blue-lt text-blue'
    },
    {
        href: '#!/apps',
        icon: 'ti-apps',
        title: 'Software',
        subtitle: 'Application inventory, vulnerable versions, license state, and affected devices.',
        badge: 'Application catalog',
        badgeClass: 'bg-orange-lt text-orange'
    },
    {
        href: '#!/changelog',
        icon: 'ti-history',
        title: 'Changelog',
        subtitle: 'Install, update, and uninstall ledger across the fleet.',
        badge: 'Change evidence',
        badgeClass: 'bg-purple-lt text-purple'
    }
];

export function InventoryHubPage() {
    return html`
        <div class="page-header d-print-none">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <div class="page-pretitle">Inventory</div>
                        <h2 class="page-title">Inventory workspace</h2>
                        <div class="page-subtitle mt-1 text-muted">
                            Fleet, Software, and Changelog now run as independent workspaces with their own filters, pagination, and evidence context.
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="page-body">
            <div class="container-xl">
                <div class="row row-cards">
                    ${INVENTORY_AREAS.map(area => html`
                        <div class="col-md-4">
                            <a class="card card-link h-100 text-decoration-none" href=${area.href}>
                                <div class="card-body">
                                    <div class="d-flex align-items-start gap-3">
                                        <span class="avatar bg-primary-lt text-primary">
                                            <i class=${`ti ${area.icon}`}></i>
                                        </span>
                                        <div class="min-width-0">
                                            <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                                                <h3 class="card-title mb-0">${area.title}</h3>
                                                <span class=${`badge ${area.badgeClass}`}>${area.badge}</span>
                                            </div>
                                            <p class="text-muted mb-0">${area.subtitle}</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="card-footer d-flex align-items-center justify-content-between">
                                    <span class="text-muted small">Open ${area.title}</span>
                                    <i class="ti ti-arrow-right text-muted"></i>
                                </div>
                            </a>
                        </div>
                    `)}
                </div>
            </div>
        </div>
    `;
}

export default InventoryHubPage;
