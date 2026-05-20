/**
 * InventoryTab.js
 * 
 * Main inventory tab container for device detail page.
 * Orchestrates search, filters, summary cards, and switches between vendor-grouped
 * and flat list views. Provides operator-oriented software evidence and quick
 * navigation to CVE list.
 * 
 * Features:
 * - Search bar for filtering apps by name
 * - View mode toggle (vendor-grouped vs flat list)
 * - Status filters (installed/updated/uninstalled/all)
 * - Summary cards (total apps, updated, uninstalled, with CVEs)
 * - Software evidence summary for inventory scope and active exposure
 * - View delegation to VendorGroupedView or FlatListView
 */

export function renderInventoryTab(component) {
    const enrichedApps = arguments[1];
    const filteredApps = arguments[2];
    const { html } = window;
    const appViewMode = component.state.appViewMode || 'risk';
    const goToCves = () => component.setState({ activeTab: 'risks' }, () => component.scrollToCveTable());
    const appSummary = {
        total: enrichedApps.length,
        installed: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'installed').length,
        updated: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'updated').length,
        uninstalled: enrichedApps.filter(a => (a.status || '').toLowerCase() === 'uninstalled').length,
        msi: enrichedApps.filter(a => component.getInstallKindMeta(a).bucket === 'installed').length,
        store: enrichedApps.filter(a => component.getInstallKindMeta(a).bucket === 'store').length,
        portable: enrichedApps.filter(a => component.getInstallKindMeta(a).bucket === 'portable').length
    };
    const vulnerableApps = component.getAppVulnerabilityBreakdown().vulnerableApps;
    const statusFilter = component.state.appStatusFilter || 'installed';
    const severityRank = severity => component.severityWeight ? component.severityWeight(severity) : ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[String(severity || '').toUpperCase()] || 0);
    const severityLabel = cves => {
        if (!cves.length) return 'CLEAN';
        return cves.reduce((worst, cve) => severityRank(cve.severity) > severityRank(worst) ? String(cve.severity || '').toUpperCase() : worst, 'LOW');
    };
    const patchQueue = filteredApps
        .map(app => {
            const cves = component.getCvesByApp(app.appRowKey, app.appName);
            const worstSeverity = severityLabel(cves);
            const knownExploitCount = component.state.knownExploits
                ? cves.filter(cve => component.state.knownExploits.has(cve.cveId)).length
                : 0;
            const maxEpss = cves.reduce((max, cve) => Math.max(max, Number(cve.epss || 0)), 0);
            return {
                app,
                cves,
                worstSeverity,
                knownExploitCount,
                maxEpss,
                priority: severityRank(worstSeverity) * 100 + knownExploitCount * 25 + cves.length + Math.round(maxEpss * 10)
            };
        })
        .filter(item => item.cves.length > 0)
        .sort((a, b) => b.priority - a.priority || String(a.app.appName || '').localeCompare(String(b.app.appName || '')));
    const topPatchQueue = patchQueue.slice(0, 5);
    const openAppCves = (app) => component.setState({ cveFilterApp: app.appName, activeTab: 'risks' }, () => component.scrollToCveTable());
    
    return html`
        <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="input-group" style="max-width: 400px;">
                <span class="input-group-text">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                </span>
                <input class="form-control" type="text" placeholder="Search applications..." value=${component.state.searchQuery} onInput=${(e) => component.setState({ searchQuery: e.target.value })} />
            </div>
            <div class="btn-group" role="group">
                <button type="button" class="btn btn-sm ${appViewMode === 'risk' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appViewMode: 'risk' })}>
                    Patch Queue
                </button>
                <button type="button" class="btn btn-sm ${appViewMode === 'vendor' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appViewMode: 'vendor' })}>
                    By Vendor
                </button>
                <button type="button" class="btn btn-sm ${appViewMode === 'flat' ? 'btn-primary' : 'btn-outline-primary'}" onclick=${() => component.setState({ appViewMode: 'flat' })}>
                    Table
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
        <div class="card mb-3">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                    <div>
                        <div class="text-muted small">Software evidence</div>
                        <div class="fw-semibold">${patchQueue.length > 0 ? `${patchQueue.length} app${patchQueue.length === 1 ? '' : 's'} in the patch queue` : 'No active vulnerable apps'}</div>
                        <div class="text-muted small">Risk queue first; vendor and table views remain available for inventory audit.</div>
                    </div>
                    <div class="d-flex gap-2 flex-wrap justify-content-end">
                        <span class="badge bg-primary-lt text-primary" title="Installed software observed by inventory signals">${appSummary.msi ?? 0} installed</span>
                        <span class="badge bg-info-lt text-info" title="Store applications observed on this device">${appSummary.store ?? 0} store</span>
                        <span class="badge bg-warning-lt text-warning" title="Portable or path-based application observations">${appSummary.portable ?? 0} portable</span>
                        <span class="badge bg-danger-lt text-danger" title="Applications with active CVE evidence">${vulnerableApps} exposed</span>
                        <button class="btn btn-sm btn-outline-primary" onclick=${goToCves} title="Open current vulnerability evidence for this device">
                            Review CVEs
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="card mb-3 software-patch-queue">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <div class="card-title mb-0">Patch Queue</div>
                    <div class="text-muted small">Apps sorted by severity, known exploit evidence, and exploit probability.</div>
                </div>
                <span class="badge ${patchQueue.length ? 'bg-warning-lt text-warning' : 'bg-success-lt text-success'}">${patchQueue.length ? `${patchQueue.length} affected` : 'Clean'}</span>
            </div>
            <div class="list-group list-group-flush">
                ${topPatchQueue.length ? topPatchQueue.map(item => {
                    const installKindMeta = component.getInstallKindMeta(item.app);
                    return html`
                        <button type="button" class="list-group-item list-group-item-action software-patch-row" onclick=${() => openAppCves(item.app)}>
                            <div class="software-patch-row__main">
                                <div class="fw-semibold text-truncate" title=${item.app.appName || 'Unknown app'}>${item.app.appName || 'Unknown app'}</div>
                                <div class="text-muted small text-truncate" title=${item.app.vendor || 'Unknown vendor'}>${item.app.vendor || 'Unknown vendor'} · ${item.app.version || 'version unknown'}</div>
                            </div>
                            <div class="software-patch-row__meta">
                                <span class=${`badge ${component.getSeverityColor(item.worstSeverity)}`}>${item.worstSeverity}</span>
                                <span class="badge bg-secondary-lt text-secondary">${item.cves.length} CVE${item.cves.length === 1 ? '' : 's'}</span>
                                ${item.knownExploitCount ? html`<span class="badge bg-danger-lt text-danger">${item.knownExploitCount} exploit${item.knownExploitCount === 1 ? '' : 's'}</span>` : ''}
                                ${item.maxEpss > 0 ? html`<span class="badge bg-info-lt text-info">EPSS ${(item.maxEpss * 100).toFixed(1)}%</span>` : ''}
                                <span class=${`badge ${installKindMeta.className}`}>${installKindMeta.label}</span>
                            </div>
                            <span class="software-patch-row__action">Review</span>
                        </button>
                    `;
                }) : html`
                    <div class="list-group-item d-flex align-items-center gap-2 text-success">
                        <i class="ti ti-circle-check"></i>
                        <span>No active vulnerable software in the current filter.</span>
                    </div>
                `}
            </div>
            ${patchQueue.length > topPatchQueue.length ? html`
                <div class="card-footer small text-muted">
                    ${patchQueue.length - topPatchQueue.length} more affected app${patchQueue.length - topPatchQueue.length === 1 ? '' : 's'} available in the table view.
                </div>
            ` : ''}
        </div>
        ${appViewMode === 'risk' ? html`
            <div class="d-flex justify-content-end gap-2 flex-wrap">
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick=${() => component.setState({ appViewMode: 'vendor' })}>Open vendor inventory</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick=${() => component.setState({ appViewMode: 'flat' })}>Open software table</button>
            </div>
        ` : appViewMode === 'vendor' ? component.renderVendorGroupedView(filteredApps) : component.renderFlatListView(filteredApps)}
    `;
}
