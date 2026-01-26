/**
 * FlatListView.js
 * 
 * Flat list view for device applications.
 * Renders a simple table showing all apps with risk indicators, CVE counts,
 * and status badges. Provides quick access to CVE filtering by app.
 * 
 * Features:
 * - Sortable columns (risk, CVE count)
 * - Status badges (installed/updated/uninstalled)
 * - Detection confidence indicators (database vs heuristic)
 * - Days installed counter
 * - Click-to-filter CVEs by application
 */
import { formatDate } from '../utils/DateUtils.js';

export function renderFlatListView(component) {
    const filteredApps = arguments[1];
    const { html } = window;
    
    return html`
        <div class="table-responsive">
            <table class="table table-sm table-hover" id="apps-table">
                <thead>
                    <tr>
                        <th>Application</th>
                        <th>Vendor</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>
                            <a href="#" onclick=${(e)=>{e.preventDefault(); component.setState({ appSortKey: component.state.appSortKey==='severity' ? 'cveCount' : 'severity', appSortDir: component.state.appSortDir==='desc' ? 'asc':'desc' });}} class="text-reset text-decoration-none">Risk & CVEs</a>
                        </th>
                        <th>Last Seen</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredApps.map(app => {
                        const cves = component.getCvesByApp(app.appRowKey);
                        const worstSeverity = cves.some(c => c.severity === 'CRITICAL' || c.severity === 'Critical') ? 'CRITICAL' : 
                                             cves.some(c => c.severity === 'HIGH' || c.severity === 'High') ? 'HIGH' : 
                                             cves.some(c => c.severity === 'MEDIUM' || c.severity === 'Medium') ? 'MEDIUM' : 
                                             cves.length > 0 ? 'LOW' : 'CLEAN';
                        const daysInstalled = app.firstSeen ? Math.round((Date.now() - new Date(app.firstSeen).getTime()) / (1000 * 60 * 60 * 24)) : null;
                        const isFiltered = component.state.cveFilterApp === app.appName;
                        return html`
                            <tr style="cursor: pointer; transition: background 0.15s;" onclick=${() => component.setState({ cveFilterApp: isFiltered ? null : app.appName, activeTab: 'risks' })} title="Click to filter CVEs by this app">
                                <td class="font-weight-medium d-flex align-items-center gap-2">
                                    ${app.isInstalled === false ? html`
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #ff7d00;" title="Running from disk (not installed)">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M5 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1"/>
                                            <path d="M9 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4"/>
                                            <path d="M5 8h8"/>
                                            <path d="M5 16h8"/>
                                        </svg>
                                    ` : html`
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #2fb344;" title="Installed application">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/>
                                            <line x1="12" y1="12" x2="20" y2="7.5"/>
                                            <line x1="12" y1="12" x2="12" y2="21"/>
                                            <line x1="12" y1="12" x2="4" y2="7.5"/>
                                        </svg>
                                    `}
                                    ${app.appName}${isFiltered ? ' ⚡' : ''}
                                </td>
                                <td>${app.vendor || '—'}</td>
                                <td><code class="text-sm">${app.version || '—'}</code></td>
                                <td>
                                                                            ${app.status === 'updated' ? html`<span class="badge bg-warning-lt text-dark">Updated${app.updatedFromVersion ? ` from v${app.updatedFromVersion}` : ''}</span>` : 
                                                                                app.status === 'uninstalled' ? html`<span class="badge bg-success-lt text-dark">Uninstalled</span>` : 
                                                                                html`<span class="badge bg-blue-lt text-dark">Installed</span>`}
                                </td>
                                <td>
                                    ${cves.length > 0 ? html`
                                        <button class=${`btn btn-sm ${component.getSeverityOutlineClass(worstSeverity)} d-inline-flex align-items-center gap-2`}
                                            onclick=${(e) => { e.preventDefault(); component.setState({ cveFilterApp: app.appName, activeTab: 'risks' }, () => component.scrollToCveTable()); }}
                                            title="View CVEs for this application">
                                            ${app.matchType === 'absolute' ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 L12 3 L21 12 Z"/></svg>` : ''}
                                            ${app.matchType === 'heuristic' ? html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l3 4.5l-3 4.5h-6l-3 -4.5z"/><path d="M9 4v9"/><path d="M15 4v9"/></svg>` : ''}
                                            <span class="fw-semibold">${worstSeverity}</span>
                                            <span class=${`badge ${component.getSeverityColor(worstSeverity)}`}>${cves.length} CVE${cves.length > 1 ? 's' : ''}</span>
                                        </button>
                                        <div class="text-muted small mt-1">
                                            ${cves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical').length > 0 ? html`<span class="badge badge-sm bg-danger me-1">${cves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical').length} Critical</span>` : ''}
                                            ${cves.filter(c => c.severity === 'HIGH' || c.severity === 'High').length > 0 ? html`<span class="badge badge-sm bg-warning me-1">${cves.filter(c => c.severity === 'HIGH' || c.severity === 'High').length} High</span>` : ''}
                                            ${cves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length > 0 ? html`<span class="badge badge-sm bg-info me-1">${cves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium').length} Med</span>` : ''}
                                            ${cves.filter(c => c.severity === 'LOW' || c.severity === 'Low').length > 0 ? html`<span class="badge badge-sm bg-success-lt">${cves.filter(c => c.severity === 'LOW' || c.severity === 'Low').length} Low</span>` : ''}
                                        </div>
                                    ` : html`
                                        <span class="badge bg-success-lt">No CVEs</span>
                                    `}
                                </td>
                                <td class="text-muted small">
                                    ${app.lastSeen ? html`<div>${formatDate(app.lastSeen)}</div>` : '—'}
                                    ${daysInstalled !== null ? html`<div style="font-size: 10px; color: #999;">${daysInstalled}d</div>` : ''}
                                </td>
                            </tr>
                        `;
                    })}
                </tbody>
            </table>
            ${filteredApps.length === 0 && component.state.searchQuery ? html`
                <div class="text-center text-muted py-5">
                    No applications match your search
                </div>
            ` : ''}
        </div>
    `;
}
