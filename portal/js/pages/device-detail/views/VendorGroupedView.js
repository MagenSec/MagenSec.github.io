/**
 * VendorGroupedView.js
 * 
 * Vendor-grouped application list view for device detail page.
 * Renders applications grouped by vendor with accordion UI, version history timelines,
 * and CVE badges showing vulnerability status per application.
 * 
 * Features:
 * - Vendor accordion with app counts and CVE summary
 * - Version history timeline for multi-version apps
 * - Detection confidence badges (database vs AI matches)
 * - Status indicators (installed vs running from disk)
 * - CVE filtering by application name
 */
import { formatDate } from '../utils/DateUtils.js';

export function renderVendorGroupedView(component) {
    const apps = arguments[1];
    const { html } = window;
    const vendorGroups = component.groupAppsByVendor(apps);
    const vendorNames = Object.keys(vendorGroups).sort();

    return html`
        <div class="accordion" id="vendorAccordion">
            ${vendorNames.map(vendorName => {
                const vendorApps = vendorGroups[vendorName];
                const isExpanded = component.state.expandedVendors.has(vendorName);
                const appGroups = component.groupAppVersions(vendorApps);
                const vendorCves = vendorApps.reduce((sum, app) => sum.concat(component.getCvesByApp(app.appRowKey, app.appName)), []);
                const totalCves = vendorCves.length;
                const vendorDetection = component.getDetectionBuckets(vendorCves);

                return html`
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" onclick=${() => component.toggleVendor(vendorName)}>
                                <div class="d-flex justify-content-between align-items-center w-100 pe-3">
                                    <span class="fw-bold">${vendorName}</span>
                                    <div class="d-flex gap-2 align-items-center flex-wrap justify-content-end">
                                        <span class="badge bg-secondary-lt text-secondary">${vendorApps.length} apps</span>
                                        ${totalCves > 0 ? html`<span class="badge ${component.getSeverityColor(component.severityLabelFromWeight(Math.max(...vendorCves.map(c => component.severityWeight(c.severity || '')), 0)))}">${totalCves} CVEs</span>` : ''}
                                        ${component.renderDetectionButtons(vendorDetection, {
                                            size: 'sm',
                                            showLabels: false,
                                            onClick: () => component.setState({ activeTab: 'risks', cveFilterApp: null }, () => component.scrollToCveTable())
                                        })}
                                    </div>
                                </div>
                            </button>
                        </h2>
                        <div class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" data-bs-parent="#vendorAccordion">
                            <div class="accordion-body p-0">
                                ${appGroups.map(appGroup => {
                                    const latestVersion = appGroup.versions[0];
                                    const hasMultipleVersions = appGroup.versions.length > 1;
                                    const appKey = appGroup.appName.toLowerCase();
                                    const isVersionsExpanded = component.state.expandedApps.has(appKey);
                                    const cves = component.getCvesByApp(latestVersion.appRowKey, appGroup.appName);
                                    const worstSeverity = cves.some(c => c.severity === 'CRITICAL') ? 'CRITICAL' : 
                                                         cves.some(c => c.severity === 'HIGH') ? 'HIGH' : 
                                                         cves.some(c => c.severity === 'MEDIUM') ? 'MEDIUM' : 
                                                         cves.length > 0 ? 'LOW' : 'CLEAN';

                                    return html`
                                        <div class="border-bottom">
                                            <div class="d-flex align-items-center p-3 gap-3" style="cursor: pointer;" onclick=${() => hasMultipleVersions && component.toggleAppVersions(appKey)}>
                                                ${latestVersion.isInstalled === false ? html`
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #ff7d00;" title="Running from disk">
                                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                        <path d="M5 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1"/>
                                                        <path d="M9 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4"/>
                                                        <path d="M5 8h8"/>
                                                        <path d="M5 16h8"/>
                                                    </svg>
                                                ` : html`
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #2fb344;" title="Installed">
                                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                        <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/>
                                                        <line x1="12" y1="12" x2="20" y2="7.5"/>
                                                        <line x1="12" y1="12" x2="12" y2="21"/>
                                                        <line x1="12" y1="12" x2="4" y2="7.5"/>
                                                    </svg>
                                                `}
                                                <div class="flex-fill">
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${hasMultipleVersions ? html`
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${isVersionsExpanded ? '90deg' : '0deg'}); transition: transform 0.2s;">
                                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                <polyline points="9 6 15 12 9 18" />
                                                            </svg>
                                                        ` : ''}
                                                        <span class="fw-medium">${appGroup.appName}</span>
                                                        ${hasMultipleVersions ? html`<span class="badge bg-blue-lt text-blue">${appGroup.versions.length} versions</span>` : ''}
                                                    </div>
                                                    <div class="text-muted small">v${latestVersion.version || '—'} • ${formatDate(latestVersion.lastSeen)}</div>
                                                </div>
                                                <div class="d-flex gap-2 align-items-center">
                                                    ${worstSeverity !== 'CLEAN' ? html`
                                                        <span class="badge ${component.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                                                    ` : ''}
                                                    ${cves.length > 0 ? html`
                                                        <a href="#" class="badge ${component.getSeverityColor(worstSeverity)}" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); component.setState({ cveFilterApp: appGroup.appName, activeTab: 'risks' }, () => component.scrollToCveTable()); }}>
                                                            ${cves.length} CVEs
                                                        </a>
                                                    ` : ''}
                                                </div>
                                            </div>
                                            ${hasMultipleVersions && isVersionsExpanded ? html`
                                                <div class="ps-5 pe-3 pb-3">
                                                    <div class="timeline timeline-simple">
                                                        ${appGroup.versions.map((version, idx) => html`
                                                            <div class="timeline-event ${idx === 0 ? 'timeline-event-latest' : ''}">
                                                                <div class="timeline-event-icon ${idx === 0 ? 'bg-primary' : 'bg-secondary'}"></div>
                                                                <div class="card card-sm">
                                                                    <div class="card-body">
                                                                        <div class="row align-items-center">
                                                                            <div class="col">
                                                                                <div class="fw-medium">v${version.version || 'Unknown'}</div>
                                                                                <div class="text-muted small">
                                                                                    ${formatDate(version.firstSeen)} 
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-narrow-right mx-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="5" y1="12" x2="19" y2="12" /><line x1="15" y1="16" x2="19" y2="12" /><line x1="15" y1="8" x2="19" y2="12" /></svg>
                                                                                    ${formatDate(version.lastSeen)}
                                                                                </div>
                                                                            </div>
                                                                            <div class="col-auto">
                                                                                ${version.isInstalled ? html`<span class="badge bg-success-lt text-success">Installed</span>` : html`<span class="badge bg-warning-lt text-warning">Disk</span>`}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        `)}
                                                    </div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                })}
                            </div>
                        </div>
                    </div>
                `;
            })}
        </div>
        ${vendorNames.length === 0 && component.state.searchQuery ? html`
            <div class="text-center text-muted py-5">
                No applications match your search
            </div>
        ` : ''}
    `;
}
