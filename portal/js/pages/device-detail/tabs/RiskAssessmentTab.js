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
    const vulnerableApps = (() => {
        const set = new Set();
        activeCves.forEach(c => { if (c.appName) set.add(c.appName); });
        return set.size;
    })();
    const maxEpss = activeCves.reduce((max, c) => Math.max(max, Number(c.epss || 0)), 0);
    const epssBadge = maxEpss >= 0.5 ? 'bg-danger-lt text-danger' : maxEpss >= 0.3 ? 'bg-warning-lt text-warning' : maxEpss > 0 ? 'bg-info-lt text-info' : 'bg-secondary-lt text-secondary';

    const latestFields = component.state.telemetryDetail?.latest?.fields || {};
    const ipRaw = latestFields.IPAddresses || latestFields.ipAddresses;
    const ipList = Array.isArray(ipRaw) ? ipRaw : typeof ipRaw === 'string' ? ipRaw.split(/[;\s,]+/).filter(Boolean) : [];
    const networkRisk = component.networkService.analyzeNetworkRisk(ipList, component.state.telemetryDetail?.history);

    const progressClass = riskScoreValue >= 80 ? 'bg-danger' : riskScoreValue >= 60 ? 'bg-warning' : riskScoreValue >= 40 ? 'bg-warning' : 'bg-success';

    const postureScore = component.state.enrichedScore?.score ?? riskScoreValue;
    const postureLabel = postureScore >= 80 ? 'Critical' : postureScore >= 60 ? 'Elevated' : postureScore >= 40 ? 'Watch' : postureScore >= 20 ? 'Stable' : 'Secure';
    const riskPercentBase = (() => {
        const enrichedRaw = component.state.enrichedScore?.score;
        const summaryRaw = component.state.deviceSummary?.score;
        const raw = enrichedRaw !== undefined ? enrichedRaw : summaryRaw || 0;
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    })();
    const riskPercent = Math.max(0, Math.min(100, Math.round(riskPercentBase)));
    const postureBadge = postureScore >= 80 ? 'bg-danger' : postureScore >= 60 ? 'bg-warning' : postureScore >= 40 ? 'bg-warning' : postureScore >= 20 ? 'bg-info' : 'bg-success';
    const riskPercentBadge = riskPercent >= 80 ? 'bg-danger' : riskPercent >= 60 ? 'bg-warning' : riskPercent >= 40 ? 'bg-warning' : riskPercent >= 20 ? 'bg-info' : 'bg-success';
    const postureCopy = postureScore >= 80
        ? 'Active exploitability and exposure signals present; isolate and patch immediately.'
        : postureScore >= 60
            ? 'High exploitability or internet exposure; prioritize remediation and segmentation.'
            : postureScore >= 40
                ? 'Exploitable issues exist with moderate exposure; schedule remediation soon.'
                : postureScore >= 20
                    ? 'Mostly resilient with some findings; keep patching cadence steady.'
                    : 'Strong resilience and minimal exposure; continue monitoring.';
    const riskPercentCopy = 'Same calculation as the Devices list gauge: enriched score when present, otherwise the summary score.';
    return html`
        <div class="row row-cards">
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="text-muted small">Security posture (0-100)</div>
                            <span class="badge ${postureBadge}">${postureLabel}</span>
                        </div>
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="display-4 fw-bold mb-0">${Math.round(postureScore)}</div>
                            <div class="small text-muted">Exposure-adjusted resilience: EPSS + known exploits + network exposure + severity + time decay.</div>
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
                            <div class="text-muted small">Risk % (Devices list)</div>
                            <span class="badge ${component.getSeverityColor(worstSeverity)}">${worstSeverity}</span>
                        </div>
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="display-4 fw-bold mb-0">${riskPercent}%</div>
                            <div class="small text-muted">Normalized severity/volume score used on the Devices page for cross-device comparison.</div>
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
            <div class="col-md-3 col-sm-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Known exploits</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${knownExploitCount}</div>
                            ${knownExploitCount > 0 ? html`<span class="badge bg-danger-lt text-danger">Active</span>` : html`<span class="badge bg-secondary-lt text-secondary">None</span>`}
                        </div>
                        <div class="text-muted small">CVEs with public exploits detected on this device.</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Exploit probability (max EPSS)</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${(maxEpss * 100).toFixed(1)}%</div>
                            <span class="badge ${epssBadge}">${maxEpss >= 0.5 ? 'Very High' : maxEpss >= 0.3 ? 'High' : maxEpss > 0 ? 'Elevated' : 'Low'}</span>
                        </div>
                        <div class="text-muted small">Highest EPSS among active CVEs.</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Vulnerable applications</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${vulnerableApps}</div>
                            ${vulnerableApps > 0 ? html`<span class="badge bg-warning-lt text-warning">Patch needed</span>` : html`<span class="badge bg-success-lt text-success">Clean</span>`}
                        </div>
                        <div class="text-muted small">Unique apps with unpatched CVEs.</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 col-sm-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="text-muted small mb-1">Network exposure</div>
                        <div class="d-flex align-items-baseline gap-2">
                            <div class="h3 mb-0">${networkRisk?.publicIpPresent ? 'Public' : networkRisk?.apipaPresent ? 'APIPA' : 'Limited'}</div>
                            <span class="badge ${networkRisk?.publicIpPresent ? 'bg-danger-lt text-danger' : networkRisk?.apipaPresent ? 'bg-warning-lt text-warning' : 'bg-secondary-lt text-secondary'}">${networkRisk?.publicIpPresent ? 'Internet-exposed' : networkRisk?.apipaPresent ? 'Internal only' : 'Low signal'}</span>
                        </div>
                        <div class="text-muted small">Exposure derived from latest IP signals.</div>
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
                                <div class="text-muted small">Public or APIPA signals from device IPs</div>
                            </div>
                            <span class="badge ${networkRisk?.publicIpPresent ? 'bg-danger-lt text-danger' : networkRisk?.apipaPresent ? 'bg-warning-lt text-warning' : 'bg-secondary-lt text-secondary'}">
                                ${networkRisk?.publicIpPresent ? 'Public IP seen' : networkRisk?.apipaPresent ? 'APIPA detected' : 'Limited signals'}
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
                            <li class="mb-2">Review network exposure (public/APIPA IPs) and ensure firewall/VPN coverage.</li>
                        </ol>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-primary" onclick=${(e) => { e.preventDefault(); component.setState({ activeTab: 'inventory' }); }}>
                                Go to Applications
                            </button>
                            <button class="btn btn-outline-primary" onclick=${(e) => { e.preventDefault(); component.setState({ activeTab: 'risks' }); }}>
                                Go to CVEs
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
