/**
 * Risk Assessment Tab - Security posture overview, risk drivers, next steps
 * 
 * Displays security posture score, risk percentage, known exploits, EPSS probability,
 * vulnerable applications, network exposure, and actionable remediation steps.
 */
export function renderRiskAssessment(component) {
    const { html } = window;

    const { activeApps, activeCves } = component.getActiveAppsAndCves();
    const critical = activeCves.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL');
    const high = activeCves.filter(c => (c.severity || '').toUpperCase() === 'HIGH');
    const medium = activeCves.filter(c => (c.severity || '').toUpperCase() === 'MEDIUM');
    const low = activeCves.filter(c => (c.severity || '').toUpperCase() === 'LOW');
    const worstSeverity = component.getWorstSeverity?.(activeCves) || (critical.length ? 'CRITICAL' : high.length ? 'HIGH' : medium.length ? 'MEDIUM' : low.length ? 'LOW' : 'CLEAN');
    const riskScoreValue = (() => {
        const raw = component.getRiskScoreValue(component.state.deviceSummary, component.calculateRiskScore(component.state.device));
        const n = Number(raw);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    })();
    const knownExploitCount = component.state.knownExploits ? activeCves.filter(c => component.state.knownExploits.has(c.cveId)).length : 0;
    const vulnerableApps = component.getAppVulnerabilityBreakdown().vulnerableApps;
    const maxEpss = activeCves.reduce((max, c) => Math.max(max, Number(c.epss || 0)), 0);
    const epssBadge = maxEpss >= 0.5 ? 'bg-danger-lt text-danger' : maxEpss >= 0.3 ? 'bg-warning-lt text-warning' : maxEpss > 0 ? 'bg-info-lt text-info' : 'bg-secondary-lt text-secondary';

    const latestFields = component.state.telemetryDetail?.latest?.fields || {};
    const ipRaw = latestFields.IPAddresses || latestFields.ipAddresses;
    const ipList = typeof component.parseIpAddresses === 'function'
        ? component.parseIpAddresses(ipRaw)
        : (Array.isArray(ipRaw) ? ipRaw : typeof ipRaw === 'string' ? ipRaw.split(/[;\s,]+/).filter(Boolean) : []);
    const networkRisk = component.networkService.analyzeNetworkRisk(ipList, component.state.telemetryDetail?.history, latestFields);
    const updateState = component.getClientUpdateState ? component.getClientUpdateState() : { updateAvailable: false, latest: null };

    const progressClass = riskScoreValue >= 80 ? 'bg-danger' : riskScoreValue >= 60 ? 'bg-warning' : riskScoreValue >= 40 ? 'bg-warning' : 'bg-success';

    const postureRisk = component.state.enrichedScore?.score ?? riskScoreValue;
    const postureScore = Math.max(0, Math.min(100, 100 - Math.round(postureRisk)));
    const postureLabel = postureScore >= 75 ? 'Good' : postureScore >= 50 ? 'Fair' : postureScore >= 25 ? 'Poor' : 'Critical';
    const riskPercentBase = (() => {
        const enrichedRaw = component.state.enrichedScore?.score;
        const canonicalRaw = component.getRiskScoreValue(
            component.state.deviceSummary,
            component.calculateRiskScore(component.state.device)
        );
        const raw = enrichedRaw !== undefined ? enrichedRaw : canonicalRaw;
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    })();
    const riskPercent = Math.max(0, Math.min(100, Math.round(riskPercentBase)));
    const postureBadge = postureScore >= 75 ? 'bg-success' : postureScore >= 50 ? 'bg-info' : postureScore >= 25 ? 'bg-warning' : 'bg-danger';
    const riskPercentBadge = riskPercent >= 80 ? 'bg-danger' : riskPercent >= 60 ? 'bg-warning' : riskPercent >= 40 ? 'bg-warning' : riskPercent >= 20 ? 'bg-info' : 'bg-success';
    const postureCopy = postureScore >= 75
        ? 'Strong resilience and minimal exposure; continue monitoring.'
        : postureScore >= 50
            ? 'Mostly resilient with some findings; keep patching cadence steady.'
            : postureScore >= 25
                ? 'Significant vulnerabilities detected; prioritize remediation and segmentation.'
                : 'Critical exposure; isolate and patch immediately.';
    const riskPercentCopy = 'Based on CVE severity counts, EPSS probability, and vulnerable app density.';
    return html`
        <div class="row row-cards">
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="text-muted small">Security Score</div>
                            <span class="badge ${postureBadge}">${postureLabel}</span>
                        </div>
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="display-4 fw-bold mb-0">${Math.round(postureScore)}</div>
                            <div class="small text-muted">Higher is better. Combines vulnerability severity, exploit probability, and patch status.</div>
                        </div>
                        <div ref=${(el) => { component.detailRiskChartEl = el; }} style="min-height: 120px;"></div>
                        <div class="text-muted small">${postureCopy}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="text-muted small">Risk Level</div>
                            <span class="badge ${component.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                        </div>
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="display-4 fw-bold mb-0">${riskPercent}%</div>
                            <div class="small text-muted">Raw risk score used on the Devices page. Higher = more risk factors present.</div>
                        </div>
                        <div class="progress mb-2" style="height: 8px;">
                            <div class="progress-bar ${riskPercentBadge}" style="width: ${Math.min(100, Math.max(0, riskPercent))}%"></div>
                        </div>
                        <div class="text-muted small">${riskPercentCopy}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row row-cards mt-3">
            <div class="col-md-4 col-sm-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Known exploits</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${knownExploitCount}</div>
                            ${knownExploitCount > 0 ? html`<span class="badge bg-danger-lt text-danger">Active</span>` : html`<span class="badge bg-secondary-lt text-secondary">None</span>`}
                        </div>
                        <div class="text-muted small">Publicly exploited issues detected on this device.</div>
                    </div>
                </div>
            </div>
            <div class="col-md-4 col-sm-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Exploit probability (max EPSS)</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${(maxEpss * 100).toFixed(1)}%</div>
                            <span class="badge ${epssBadge}">${maxEpss >= 0.5 ? 'Very High' : maxEpss >= 0.3 ? 'High' : maxEpss > 0 ? 'Elevated' : 'Low'}</span>
                        </div>
                        <div class="text-muted small">Highest likelihood of exploit activity among the active CVEs.</div>
                    </div>
                </div>
            </div>
            <div class="col-md-4 col-sm-12">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Vulnerable applications</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${vulnerableApps}</div>
                            ${vulnerableApps > 0 ? html`<span class="badge bg-warning-lt text-warning">Patch needed</span>` : html`<span class="badge bg-success-lt text-success">Clean</span>`}
                        </div>
                        <div class="text-muted small">Unique apps with unpatched CVEs. Network exposure is summarized above in the device overview.</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row row-cards mt-3">
            <div class="col-md-6">
                <div class="card h-100">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div class="card-title mb-0">What Drives This Posture</div>
                        </div>
                    <div class="list-group list-group-flush">
                        <div class="list-group-item d-flex justify-content-between align-items-start">
                            <div>
                                <div class="text-sm fw-bold">Vulnerability Severity</div>
                                <div class="text-muted small">Highest CVE severity detected</div>
                            </div>
                            <span class="badge ${component.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                        </div>
                        <div class="list-group-item d-flex justify-content-between align-items-start">
                            <div>
                                <div class="text-sm fw-bold">Total CVEs</div>
                                <div class="text-muted small">Active, unpatched CVEs across installed apps</div>
                                <div class="d-flex flex-wrap gap-1 mt-2">
                                    <span class="badge ${component.getSeverityColor('CRITICAL')}">${critical.length} Critical</span>
                                    <span class="badge ${component.getSeverityColor('HIGH')}">${high.length} High</span>
                                    <span class="badge ${component.getSeverityColor('MEDIUM')}">${medium.length} Medium</span>
                                    <span class="badge ${component.getSeverityColor('LOW')}">${low.length} Low</span>
                                </div>
                            </div>
                            <span class="badge bg-secondary-lt text-secondary">${activeCves.length}</span>
                        </div>
                        <div class="list-group-item d-flex justify-content-between align-items-start">
                            <div>
                                <div class="text-sm fw-bold">Known Exploits</div>
                                <div class="text-muted small">CVEs with public exploits detected</div>
                            </div>
                            ${knownExploitCount > 0 ? html`<span class="badge bg-danger-lt text-danger">${knownExploitCount} exploit${knownExploitCount > 1 ? 's' : ''}</span>` : html`<span class="text-muted">None known</span>`}
                        </div>
                        <div class="list-group-item d-flex justify-content-between align-items-start">
                            <div>
                                <div class="text-sm fw-bold">Network Exposure</div>
                                <div class="text-muted small">Public routing, VPN, gateway, and metered telemetry</div>
                                <div class="text-muted small mt-1">${networkRisk?.reason || 'No network exposure details available.'}</div>
                            </div>
                            <span class="badge ${networkRisk?.badgeClass || 'bg-secondary-lt text-secondary'}">
                                ${networkRisk?.label || 'Limited signals'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <div class="card-title mb-0">Next Steps</div>
                        <span class="badge bg-primary-lt text-primary">Guided actions</span>
                    </div>
                    <div class="card-body">
                        <ol class="small mb-3">
                            ${vulnerableApps > 0 ? html`<li class="mb-2">Patch ${vulnerableApps} vulnerable application${vulnerableApps > 1 ? 's' : ''} to reduce exposure fastest.</li>` : html`<li class="mb-2">Keep applications updated; no vulnerable apps detected.</li>`}
                            ${(critical.length + high.length) > 0 ? html`<li class="mb-2">Prioritize the ${critical.length + high.length} Critical/High CVEs first.</li>` : html`<li class="mb-2">No Critical/High CVEs detected right now.</li>`}
                            <li class="mb-2">Review network exposure (${networkRisk?.label || 'latest telemetry'}) and ensure firewall/VPN/gateway coverage.</li>
                        </ol>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-primary" onclick=${(e) => {
                                e.preventDefault();
                                if (updateState.updateAvailable) {
                                    component.queueDeviceCommand('CheckUpdates');
                                } else {
                                    component.openAdvancedDetails('detailApps');
                                }
                            }}>
                                ${updateState.updateAvailable && updateState.latest ? `Update client to v${updateState.latest}` : 'Review vulnerable software'}
                            </button>
                            <button class="btn btn-outline-secondary" onclick=${(e) => { e.preventDefault(); component.openAdvancedDetails(); }}>
                                Open technical evidence
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
