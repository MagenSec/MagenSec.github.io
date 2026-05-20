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
    const appBreakdown = component.getAppVulnerabilityBreakdown();
    const vulnerableApps = appBreakdown.vulnerableApps;
    const maxEpss = activeCves.reduce((max, c) => Math.max(max, Number(c.epss || 0)), 0);
    const epssBadge = maxEpss >= 0.5 ? 'bg-danger-lt text-danger' : maxEpss >= 0.3 ? 'bg-warning-lt text-warning' : maxEpss > 0 ? 'bg-info-lt text-info' : 'bg-secondary-lt text-secondary';

    const latestFields = component.state.telemetryDetail?.latest?.fields || {};
    const ipRaw = latestFields.IPAddresses || latestFields.ipAddresses;
    const ipList = typeof component.parseIpAddresses === 'function'
        ? component.parseIpAddresses(ipRaw)
        : (Array.isArray(ipRaw) ? ipRaw : typeof ipRaw === 'string' ? ipRaw.split(/[;\s,]+/).filter(Boolean) : []);
    const networkRisk = component.networkService.analyzeNetworkRisk(ipList, component.state.telemetryDetail?.history, latestFields);
    const updateState = component.getClientUpdateState ? component.getClientUpdateState() : { updateAvailable: false, latest: null };

    const postureRisk = component.state.enrichedScore?.score ?? riskScoreValue;
    const postureScore = Math.max(0, Math.min(100, 100 - Math.round(postureRisk)));
    const postureLabel = postureScore >= 75 ? 'Good' : postureScore >= 50 ? 'Fair' : postureScore >= 25 ? 'Poor' : 'Critical';
    const postureBadge = postureScore >= 75 ? 'bg-success' : postureScore >= 50 ? 'bg-info' : postureScore >= 25 ? 'bg-warning' : 'bg-danger';

    const visibilityStatus = String(component.getDeviceHealthStatus?.(component.state.device)?.status || '').toLowerCase();
    const visibilityNeedsAction = ['stale', 'dormant', 'ghosted', 'error', 'partial'].includes(visibilityStatus);
    const criticalHigh = critical.length + high.length;
    const decision = visibilityNeedsAction
        ? {
            label: 'Restore visibility',
            detail: 'Heartbeat or signal evidence is stale; verify the agent before trusting this device posture.',
            badge: visibilityStatus === 'stale' ? 'bg-warning-lt text-warning' : 'bg-danger-lt text-danger',
            primary: 'Open signal history',
            action: () => component.openAdvancedDetails('detailSignals')
        }
        : knownExploitCount > 0 || critical.length > 0
            ? {
                label: 'Patch now',
                detail: 'Known exploit or Critical CVE evidence makes this a security queue item, not routine maintenance.',
                badge: 'bg-danger-lt text-danger',
                primary: 'Review CVEs',
                action: () => component.scrollToCveTable()
            }
            : high.length > 0 || vulnerableApps > 0
                ? {
                    label: 'Patch next',
                    detail: 'This device has active vulnerable software. Start with the highest severity application rows.',
                    badge: 'bg-warning-lt text-warning',
                    primary: appBreakdown.projectionPending ? 'Review CVE evidence' : 'Open patch queue',
                    action: () => appBreakdown.projectionPending ? component.scrollToCveTable() : component.openAdvancedDetails('detailApps')
                }
                : updateState.updateAvailable
                    ? {
                        label: 'Update agent',
                        detail: 'Security posture is clean, but the endpoint agent is behind the current baseline.',
                        badge: 'bg-info-lt text-info',
                        primary: updateState.latest ? `Update to v${updateState.latest}` : 'Check updates',
                        action: () => component.queueDeviceCommand('CheckUpdates'),
                        mutates: true
                    }
                    : {
                        label: 'Monitor',
                        detail: 'No urgent CVE, exploit, or visibility issue is driving this device right now.',
                        badge: 'bg-success-lt text-success',
                        primary: 'Open evidence',
                        action: () => component.openAdvancedDetails()
                    };

    const driverRows = [
        visibilityNeedsAction ? {
            tone: visibilityStatus === 'stale' ? 'warning' : 'danger',
            title: 'Visibility evidence',
            metric: visibilityStatus || 'issue',
            detail: networkRisk?.reason || 'Device evidence should be refreshed before acting on old posture data.',
            action: 'Verify heartbeat and signal history',
            onClick: () => component.openAdvancedDetails('detailSignals')
        } : null,
        knownExploitCount > 0 ? {
            tone: 'danger',
            title: 'Known exploit exposure',
            metric: `${knownExploitCount}`,
            detail: 'Public exploit evidence exists for one or more active CVEs.',
            action: 'Review exploited CVEs',
            onClick: () => component.scrollToCveTable()
        } : null,
        criticalHigh > 0 ? {
            tone: 'danger',
            title: 'Critical and High CVEs',
            metric: `${criticalHigh}`,
            detail: `${critical.length} Critical and ${high.length} High findings are still active.`,
            action: 'Triage high severity first',
            onClick: () => component.scrollToCveTable()
        } : null,
        vulnerableApps > 0 ? {
            tone: 'warning',
            title: 'Vulnerable software',
            metric: `${vulnerableApps}`,
            detail: appBreakdown.projectionPending ? 'CVE evidence is present while app projection catches up.' : 'Patch queue can group the affected apps by operational owner.',
            action: appBreakdown.projectionPending ? 'Review CVE evidence' : 'Open patch queue',
            onClick: () => appBreakdown.projectionPending ? component.scrollToCveTable() : component.openAdvancedDetails('detailApps')
        } : null,
        maxEpss >= 0.3 ? {
            tone: maxEpss >= 0.5 ? 'danger' : 'warning',
            title: 'Exploit probability',
            metric: `${(maxEpss * 100).toFixed(1)}%`,
            detail: 'Highest EPSS value among active CVEs.',
            action: 'Prioritize by exploit likelihood',
            onClick: () => component.scrollToCveTable()
        } : null,
        networkRisk?.publicIpPresent ? {
            tone: 'warning',
            title: 'Network exposure',
            metric: networkRisk?.label || 'Exposed',
            detail: networkRisk?.reason || 'Public routing evidence increases remediation urgency.',
            action: 'Review network signals',
            onClick: () => component.openAdvancedDetails('detailSignals')
        } : null,
        updateState.updateAvailable ? {
            tone: 'info',
            title: 'Agent baseline',
            metric: updateState.latest ? `v${updateState.latest}` : 'Update',
            detail: 'Update the endpoint agent so command handling and signal quality stay reliable.',
            action: 'Queue update check',
            onClick: () => component.queueDeviceCommand('CheckUpdates'),
            mutates: true
        } : null
    ].filter(Boolean);

    const cleanRows = driverRows.length === 0;

    return html`
        <div class="card device-posture-brief">
            <div class="card-body">
                <div class="device-posture-brief__hero">
                    <div>
                        <div class="text-muted small text-uppercase fw-semibold">Posture decision</div>
                        <div class="d-flex align-items-center gap-2 flex-wrap mt-1">
                            <h3 class="mb-0">${decision.label}</h3>
                            <span class=${`badge ${decision.badge}`}>${worstSeverity}</span>
                        </div>
                        <p class="text-muted mb-0 mt-2">${decision.detail}</p>
                    </div>
                    <div class="device-posture-score">
                        <div ref=${(el) => { component.detailRiskChartEl = el; }} class="device-posture-score__chart"></div>
                        <div>
                            <div class="h2 mb-0">${Math.round(postureScore)}</div>
                            <span class=${`badge ${postureBadge}`}>${postureLabel}</span>
                        </div>
                    </div>
                    <div class="device-posture-actions">
                        <button class="btn btn-primary" data-mutates-state=${decision.mutates ? 'true' : undefined} onclick=${(event) => { event.preventDefault(); decision.action(); }}>
                            ${decision.primary}
                        </button>
                        <button class="btn btn-outline-secondary" onclick=${(event) => { event.preventDefault(); component.openAdvancedDetails(); }}>
                            Evidence workspace
                        </button>
                    </div>
                </div>

                <div class="device-posture-pills mt-3">
                    <span class="badge ${component.getSeverityColor('CRITICAL')}">${critical.length} Critical</span>
                    <span class="badge ${component.getSeverityColor('HIGH')}">${high.length} High</span>
                    <span class="badge ${component.getSeverityColor('MEDIUM')}">${medium.length} Medium</span>
                    <span class="badge ${component.getSeverityColor('LOW')}">${low.length} Low</span>
                    <span class="badge ${epssBadge}">EPSS ${(maxEpss * 100).toFixed(1)}%</span>
                    <span class="badge ${networkRisk?.badgeClass || 'bg-secondary-lt text-secondary'}">${networkRisk?.label || 'Limited network signals'}</span>
                </div>

                <div class="device-posture-driver-list mt-3">
                    ${cleanRows ? html`
                        <div class="device-posture-driver device-posture-driver--success">
                            <span class="device-posture-driver__dot"></span>
                            <div>
                                <strong>No active driver</strong>
                                <div class="text-muted small">No vulnerable app, known exploit, update, or visibility problem needs attention.</div>
                            </div>
                            <button class="btn btn-sm btn-outline-secondary" onclick=${() => component.openAdvancedDetails()}>Review evidence</button>
                        </div>
                    ` : driverRows.map(row => html`
                        <div class=${`device-posture-driver device-posture-driver--${row.tone}`}>
                            <span class="device-posture-driver__dot"></span>
                            <div class="min-width-0">
                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                    <strong>${row.title}</strong>
                                    <span class="badge bg-secondary-lt text-secondary">${row.metric}</span>
                                </div>
                                <div class="text-muted small">${row.detail}</div>
                            </div>
                            <button class="btn btn-sm btn-outline-secondary" data-mutates-state=${row.mutates ? 'true' : undefined} onclick=${(event) => { event.preventDefault(); row.onClick(); }}>
                                ${row.action}
                            </button>
                        </div>
                    `)}
                </div>
            </div>
        </div>
    `;
}
