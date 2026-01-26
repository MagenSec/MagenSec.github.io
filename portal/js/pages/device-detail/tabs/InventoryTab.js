/**
 * InventoryTab.js
 * 
 * Main inventory tab container for device detail page.
 * Orchestrates search, filters, summary cards, and switches between vendor-grouped
 * and flat list views. Provides detection confidence breakdown and quick navigation
 * to CVE list.
 * 
 * Features:
 * - Search bar for filtering apps by name
 * - View mode toggle (vendor-grouped vs flat list)
 * - Status filters (installed/updated/uninstalled/all)
 * - Summary cards (total apps, updated, uninstalled, with CVEs)
 * - Detection confidence card (database vs AI matches)
 * - View delegation to VendorGroupedView or FlatListView
 */

export function renderInventoryTab(component) {
    const enrichedApps = arguments[1];
    const filteredApps = arguments[2];
    const { html } = window;
    const { appViewMode } = component.state;
    const detectionBuckets = component.getDetectionBuckets(component.state.cveInventory);
    const goToCves = () => component.setState({ activeTab: 'risks' }, () => component.scrollToCveTable());
    const appSummary = component.state.appSummary || {
        total: enrichedApps.length,
        installed: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'installed').length,
        updated: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'updated').length,
        uninstalled: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'uninstalled').length
    };
    const statusFilter = component.state.appStatusFilter || 'installed';
    
    return html`
        <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="input-group" style="max-width: 400px;">
                <span class="input-group-text">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                </span>
                <input class="form-control" type="text" placeholder="Search applications..." value=${component.state.searchQuery} onInput=${(e) => component.setState({ searchQuery: e.target.value })} />
            </div>
            <div class="btn-group" role="group">
                <button type="button" class="btn btn-sm ${appViewMode === 'vendor' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appViewMode: 'vendor' })}>
                    Group by Vendor
                </button>
                <button type="button" class="btn btn-sm ${appViewMode === 'flat' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appViewMode: 'flat' })}>
                    Flat List
                </button>
            </div>
        </div>
        <div class="mb-3 d-flex flex-wrap gap-2">
            <button class="btn btn-sm ${statusFilter === 'installed' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appStatusFilter: 'installed' })}>
                Installed <span class="badge bg-white text-primary ms-1">${appSummary.installed ?? 0}</span>
            </button>
            <button class="btn btn-sm ${statusFilter === 'updated' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appStatusFilter: 'updated' })}>
                Updated <span class="badge bg-white text-primary ms-1">${appSummary.updated ?? 0}</span>
            </button>
            <button class="btn btn-sm ${statusFilter === 'uninstalled' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appStatusFilter: 'uninstalled' })}>
                Uninstalled <span class="badge bg-white text-primary ms-1">${appSummary.uninstalled ?? 0}</span>
            </button>
            <button class="btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appStatusFilter: 'all' })}>
                All <span class="badge bg-white text-primary ms-1">${appSummary.total ?? enrichedApps.length}</span>
            </button>
        </div>
        <div class="row row-cards mb-3">
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <div class="text-muted small">Total Applications</div>
                        <div class="h3">${appSummary.total ?? enrichedApps.length}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <div class="text-muted small">Updated</div>
                        <div class="h3"><span class="badge bg-warning-lt text-dark">${appSummary.updated ?? enrichedApps.filter(a => a.status === 'updated').length}</span></div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <div class="text-muted small">Uninstalled</div>
                        <div class="h3"><span class="badge bg-success-lt text-dark">${appSummary.uninstalled ?? enrichedApps.filter(a => a.status === 'uninstalled').length}</span></div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body text-center">
                        <div class="text-muted small">With CVEs</div>
                        <div class="h3 text-info">${enrichedApps.filter(a => component.getCvesByApp(a.appRowKey).length > 0).length}</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="card mb-3">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="text-muted small">Findings confidence</div>
                    <span class="text-muted small">Opens CVE list</span>
                </div>
                ${component.renderDetectionButtons(detectionBuckets, { onClick: goToCves })}
                <div class="text-muted small mt-2">Database matches = high confidence signatures; AI matches = heuristic assessments.</div>
            </div>
        </div>
        ${appViewMode === 'vendor' ? component.renderVendorGroupedView(filteredApps) : component.renderFlatListView(filteredApps)}
    `;
}
