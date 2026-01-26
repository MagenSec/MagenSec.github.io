/**
 * Risks Tab - CVE list with severity badges, EPSS scores, exploit indicators
 * 
 * Displays active CVEs with filtering, sorting by severity and known exploits.
 * Includes mitigated vulnerabilities section and detailed CVE information.
 */
export function renderRisksTab(component) {
    const { html } = window;
    
    // Get only active apps (not old uninstalled) and unpatched CVEs
    const { activeApps, activeCves } = component.getActiveAppsAndCves();
    
    // Get mitigation stats for AI/posture engines
    const mitigationStats = component.getMitigationStats();
    
    // Filter by selected app if cross-linked from Inventory tab
    let filteredCves = component.state.cveFilterApp 
        ? activeCves.filter(c => c.appName && c.appName.toLowerCase() === component.state.cveFilterApp.toLowerCase())
        : activeCves;
    
    const weightSeverity = (sev) => component.severityWeight(sev || '');
    filteredCves = filteredCves.slice().sort((a, b) => {
        const knownA = component.state.knownExploits && component.state.knownExploits.has(a.cveId) ? 1 : 0;
        const knownB = component.state.knownExploits && component.state.knownExploits.has(b.cveId) ? 1 : 0;
        if (knownA !== knownB) return knownB - knownA; // known exploits first
        const sevDiff = weightSeverity(b.severity) - weightSeverity(a.severity);
        if (sevDiff !== 0) return sevDiff;
        return (b.epss || 0) - (a.epss || 0);
    });

    const criticalCves = filteredCves.filter(c => c.severity === 'CRITICAL' || c.severity === 'Critical');
    const highCves = filteredCves.filter(c => c.severity === 'HIGH' || c.severity === 'High');
    const mediumCves = filteredCves.filter(c => c.severity === 'MEDIUM' || c.severity === 'Medium');
    const lowCves = filteredCves.filter(c => c.severity === 'LOW' || c.severity === 'Low');
    const highestWeight = filteredCves.length > 0 ? Math.max(...filteredCves.map(c => component.severityWeight(c.severity || '')), 0) : 0;
    const highestSeverity = filteredCves.length > 0 ? component.severityLabelFromWeight(highestWeight) : 'CLEAN';
    const severityBtnClass = component.getSeverityOutlineClass(highestSeverity);
    const severityBadgeClass = component.getSeverityColor(highestSeverity);

    return html`
        ${component.state.cveFilterApp ? html`
            <div class="alert alert-info mb-3" style="position: relative;">
                <span>Filtering CVEs for <strong>${component.state.cveFilterApp}</strong></span>
                <button class="btn-close" onclick=${() => component.setState({ cveFilterApp: null })} style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%);"></button>
            </div>
        ` : ''}
        <div class="mb-3 d-flex flex-wrap gap-2 align-items-center">
            <button class=${`btn ${severityBtnClass} d-inline-flex align-items-center gap-2`} onclick=${(e) => { e.preventDefault(); component.scrollToCveTable(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l7 3v6c0 3.5 -2.5 6.5 -7 9c-4.5 -2.5 -7 -5.5 -7 -9v-6z" /><path d="M10 12l2 2l4 -4" /></svg>
                <span>${highestSeverity}</span>
                <span class=${`badge ${severityBadgeClass}`}>${filteredCves.length}</span>
            </button>
        </div>

        <!-- Mitigated Vulnerabilities Section -->
        ${mitigationStats.totalMitigated > 0 ? html`
            <div class="card bg-success-lt mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h3 class="card-title text-success mb-1">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 4l7 3v6c0 3.5 -2.5 6.5 -7 9c-4.5 -2.5 -7 -5.5 -7 -9v-6z" /><path d="M9 12l2 2l4 -4" /></svg>
                                ${mitigationStats.totalMitigated} Vulnerabilities Mitigated
                            </h3>
                            <div class="text-muted small">Through ${mitigationStats.mitigatedApps} app updates/removals</div>
                            <div class="mt-2 d-flex flex-wrap gap-1">
                                ${mitigationStats.bySeverity.critical > 0 ? html`<span class="badge bg-danger text-white">${mitigationStats.bySeverity.critical} Critical</span>` : ''}
                                ${mitigationStats.bySeverity.high > 0 ? html`<span class="badge bg-warning text-white">${mitigationStats.bySeverity.high} High</span>` : ''}
                                ${mitigationStats.bySeverity.medium > 0 ? html`<span class="badge bg-yellow text-dark">${mitigationStats.bySeverity.medium} Medium</span>` : ''}
                                ${mitigationStats.bySeverity.low > 0 ? html`<span class="badge bg-info text-white">${mitigationStats.bySeverity.low} Low</span>` : ''}
                            </div>
                        </div>
                        <button class="btn btn-sm btn-ghost-success" onclick=${() => component.setState({ showMitigatedCves: !component.state.showMitigatedCves })}>
                            ${component.state.showMitigatedCves ? 'Hide' : 'Show'} Details
                        </button>
                    </div>
                    ${component.state.showMitigatedCves ? html`
                        <div class="mt-3 table-responsive">
                            <table class="table table-sm table-hover bg-white">
                                <thead>
                                    <tr>
                                        <th>CVE ID</th>
                                        <th>Affected Application</th>
                                        <th>Severity</th>
                                        <th>Mitigated Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${mitigationStats.mitigatedCves.map(cve => html`
                                        <tr>
                                            <td>
                                                <a href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" class="text-decoration-none">
                                                    ${cve.cveId}
                                                </a>
                                            </td>
                                            <td>${cve.appName}</td>
                                            <td><span class="badge ${component.getSeverityColor(cve.severity)}">${(cve.severity || 'Unknown').toUpperCase()}</span></td>
                                            <td class="text-muted small">${cve.lastSeen ? new Date(cve.lastSeen).toLocaleDateString() : '—'}</td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : ''}

        <div class="table-responsive">
            <table class="table table-sm table-hover" id="cve-table">
                <thead>
                    <tr>
                        <th>CVE ID</th>
                        <th>Affected Application</th>
                        <th>Vendor</th>
                        <th>Severity</th>
                        <th>EPSS Score</th>
                        <th>Last Seen</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredCves.map(cve => {
                        const isKnownExploit = component.state.knownExploits && component.state.knownExploits.has(cve.cveId);
                        return html`
                            <tr>
                                <td>
                                    <a href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" rel="noopener" class="font-monospace text-primary d-inline-flex align-items-center gap-1">
                                        ${cve.cveId}
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    </a>
                                    ${isKnownExploit ? html`
                                        <span class="badge bg-danger-lt ms-2" title="Active exploitation detected in the wild">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                            Known Exploit
                                        </span>
                                    ` : ''}
                                </td>
                                <td class="font-weight-medium">
                                    <a href="#" class="text-reset text-decoration-none d-inline-flex align-items-center gap-1" title="View application in Inventory tab"
                                       onclick=${(e)=>{e.preventDefault(); component.setState({ activeTab: 'inventory', searchQuery: cve.appName });}}>
                                       <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                                       ${cve.appName}
                                    </a>
                                </td>
                                <td>${cve.vendor || '—'}</td>
                                <td>
                                    <div class="d-flex align-items-center gap-1 flex-wrap">
                                        <span class="badge ${component.getSeverityColor(cve.severity)}">
                                            ${(() => {
                                                const sev = (cve.severity || 'Unknown').toUpperCase();
                                                const icon = sev === 'CRITICAL' ? '⚠️' : sev === 'HIGH' ? '🔴' : sev === 'MEDIUM' ? '🟡' : '🔵';
                                                return icon + ' ' + sev;
                                            })()}
                                        </span>
                                        ${isKnownExploit ? html`
                                            <span class="badge bg-red-lt text-danger" title="Exploit available in public repositories">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs" width="12" height="12" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>
                                                Exploit
                                            </span>
                                        ` : ''}
                                    </div>
                                </td>
                                <td>
                                    ${cve.epss ? html`
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="badge ${Number(cve.epss) > 0.5 ? 'bg-danger-lt' : Number(cve.epss) > 0.2 ? 'bg-warning-lt' : 'bg-success-lt'}">
                                                ${(Number(cve.epss) * 100).toFixed(1)}%
                                            </span>
                                            ${cve.score ? html`<span class="text-muted small">CVSS ${Number(cve.score).toFixed(1)}</span>` : ''}
                                        </div>
                                    ` : html`<span class="text-muted">—</span>`}
                                </td>
                                <td>
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="text-muted small">${cve.lastSeen ? new Date(cve.lastSeen).toLocaleDateString() : '—'}</span>
                                        <div class="dropdown">
                                            <button class="btn btn-sm btn-ghost-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /><circle cx="12" cy="5" r="1" /></svg>
                                            </button>
                                            <div class="dropdown-menu dropdown-menu-end">
                                                <a class="dropdown-item" href="https://nvd.nist.gov/vuln/detail/${cve.cveId}" target="_blank" rel="noopener">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="2" /><path d="M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7" /></svg>
                                                    View in NVD
                                                </a>
                                                <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Mark false positive:', cve.cveId); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                    Mark False Positive
                                                </a>
                                                <a class="dropdown-item" href="#" onclick=${(e) => { e.preventDefault(); console.info('Assign for review:', cve.cveId); }}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 11l2 2l4 -4" /></svg>
                                                    Assign for Review
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    })}
                </tbody>
            </table>
            ${component.state.cveInventory.length === 0 ? html`
                <div class="text-center text-muted py-5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg mb-2 opacity-50" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                    <p>No known vulnerabilities detected</p>
                </div>
            ` : ''}
        </div>
    `;
}
