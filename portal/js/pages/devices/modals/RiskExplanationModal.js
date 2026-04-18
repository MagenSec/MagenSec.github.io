/**
 * RiskExplanationModal - Detailed risk breakdown modal
 */
import { RiskAnalysisService } from '../services/RiskAnalysisService.js';

export function renderRiskExplanationModal(component) {
    const { html } = window;
    if (!component.state.showRiskExplanationModal || !component.state.riskExplanationDevice) return null;

    const device = component.state.riskExplanationDevice;
    const summary = component.state.deviceSummaries[device.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
    const enriched = component.state.enrichedScores[device.id] || { score: summary.score, constituents: summary.constituents || {} };
    const constituents = enriched.constituents || summary.constituents || {};
    const exploitInfo = RiskAnalysisService.deriveKnownExploitInfo(constituents, component.state.knownExploits);
    const knownExploitCount = exploitInfo.count;
    const hasKnownExploit = exploitInfo.has;
    const derivedCvss = RiskAnalysisService.deriveCvss(constituents, summary);
    const networkExposure = RiskAnalysisService.deriveNetworkExposure(component.state.telemetryDetail);
    const cvssBadgeClass = derivedCvss !== null
        ? (derivedCvss >= 9 ? 'bg-danger-lt text-danger' : derivedCvss >= 7 ? 'bg-warning-lt text-warning' : derivedCvss >= 4 ? 'bg-info-lt text-info' : 'bg-success-lt text-success')
        : '';

    return html`
        <div class="modal modal-blur fade show" style="display: block; z-index: 2055;" tabindex="-1" role="dialog" aria-modal="true">
            <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                <div class="modal-content" style="z-index: 2056;">
                    <div class="modal-header bg-light">
                        <h5 class="modal-title">Risk Score Analysis</h5>
                        <button type="button" class="btn-close" onclick=${() => component.closeRiskExplanationModal()}></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-4">
                            <h5 class="text-muted">Overall Risk: <strong>${Math.round(enriched.score || 0)}/100</strong></h5>
                            <div class="progress mb-3" style="height: 8px;">
                                <div class="progress-bar ${enriched.score >= 80 ? 'bg-success' : enriched.score >= 60 ? 'bg-info' : enriched.score >= 40 ? 'bg-warning' : 'bg-danger'}" style="width: ${Math.min(enriched.score || 0, 100)}%"></div>
                            </div>
                            <p class="text-muted small">
                                This risk score combines vulnerability data from installed applications with network and deployment factors.
                                A higher score indicates greater security risk and need for remediation.
                            </p>
                        </div>

                        <div class="mb-4">
                            <h5>What Contributes to This Risk?</h5>
                            <div class="list-group list-group-flush">
                                <div class="list-group-item">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div>
                                            <div class="text-sm fw-bold">Vulnerability Severity</div>
                                            <div class="text-muted small">Highest CVSS score from identified CVEs</div>
                                        </div>
                                        <div class="text-end">
                                            ${derivedCvss !== null ? html`
                                                <span class="badge ${cvssBadgeClass}">
                                                    ${(derivedCvss).toFixed(1)}/10.0
                                                </span>
                                            ` : html`<span class="text-muted">None detected</span>`}
                                        </div>
                                    </div>
                                </div>

                                <div class="list-group-item">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div>
                                            <div class="text-sm fw-bold">Vulnerable Applications</div>
                                            <div class="text-muted small">Number of apps with known vulnerabilities</div>
                                        </div>
                                        <div class="text-end">
                                            ${summary.vulnerableApps ? html`<span class="badge bg-warning-lt text-warning">${summary.vulnerableApps} apps</span>` : html`<span class="text-muted">None found</span>`}
                                        </div>
                                    </div>
                                </div>

                                <div class="list-group-item">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div>
                                            <div class="text-sm fw-bold">Total CVEs</div>
                                            <div class="text-muted small">All identified CVEs across apps</div>
                                        </div>
                                        <div class="text-end">
                                            ${summary.criticalCves + summary.highCves + summary.mediumCves + summary.lowCves > 0 ? html`
                                                <div>
                                                    ${summary.criticalCves > 0 ? html`<span class="badge bg-danger-lt text-danger me-1">${summary.criticalCves} Critical</span>` : ''}
                                                    ${summary.highCves > 0 ? html`<span class="badge bg-orange-lt text-orange me-1">${summary.highCves} High</span>` : ''}
                                                    ${summary.mediumCves > 0 ? html`<span class="badge bg-yellow-lt text-yellow me-1">${summary.mediumCves} Medium</span>` : ''}
                                                    ${summary.lowCves > 0 ? html`<span class="badge bg-azure-lt text-azure me-1">${summary.lowCves} Low</span>` : ''}
                                                </div>
                                            ` : html`<span class="text-muted">No CVEs</span>`}
                                        </div>
                                    </div>
                                </div>

                                <div class="list-group-item">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div>
                                            <div class="text-sm fw-bold">Exploit Probability (EPSS)</div>
                                            <div class="text-muted small">Likelihood CVEs are actively exploited</div>
                                        </div>
                                        <div class="text-end">
                                            ${constituents.maxEpssStored ? html`
                                                <span class="badge ${constituents.maxEpssStored > 0.5 ? 'bg-danger-lt text-danger' : constituents.maxEpssStored > 0.3 ? 'bg-warning-lt text-warning' : 'bg-info-lt text-info'}">
                                                    ${(constituents.maxEpssStored * 100).toFixed(0)}%
                                                </span>
                                            ` : html`<span class="text-muted">Unknown</span>`}
                                        </div>
                                    </div>
                                </div>

                                <div class="list-group-item">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div>
                                            <div class="text-sm fw-bold">Known Exploits</div>
                                            <div class="text-muted small">CVEs with publicly available exploits</div>
                                        </div>
                                        <div class="text-end">
                                            ${hasKnownExploit ? html`<span class="badge bg-danger-lt text-danger">${knownExploitCount > 0 ? `${knownExploitCount} exploit${knownExploitCount > 1 ? 's' : ''}` : '1+ Exploits'}</span>` : html`<span class="text-muted">None known</span>`}
                                        </div>
                                    </div>
                                </div>

                                <div class="list-group-item">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div>
                                            <div class="text-sm fw-bold">Network Exposure</div>
                                            <div class="text-muted small">Device network configuration and IP type</div>
                                        </div>
                                        <div class="text-end">
                                            <span class="badge ${networkExposure.badgeClass}">${networkExposure.label}</span>
                                        </div>
                                    </div>
                                    ${networkExposure.reasons && networkExposure.reasons.length ? html`
                                        <div class="text-muted small mt-1">
                                            ${networkExposure.reasons.join(' • ')}
                                        </div>
                                    ` : ''}
                                    <div class="text-muted small mt-1" title="Firewall status, inbound ports, endpoint protection require admin privileges to collect">
                                        Missing signals (admin required): ${networkExposure.missingAdmin.join(', ')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mb-4">
                            <h5>How to Reduce This Risk</h5>
                            <ol class="small">
                                ${summary.vulnerableApps > 0 ? html`
                                    <li class="mb-2">
                                        <strong>Patch Vulnerable Applications</strong><br />
                                        <span class="text-muted">Update ${summary.vulnerableApps} application(s) to the latest versions. This is the most effective way to reduce risk.</span>
                                    </li>
                                ` : ''}
                                ${summary.criticalCves > 0 || summary.highCves > 0 ? html`
                                    <li class="mb-2">
                                        <strong>Prioritize Critical/High CVEs</strong><br />
                                        <span class="text-muted">Address the ${summary.criticalCves + summary.highCves} most severe vulnerabilities first.</span>
                                    </li>
                                ` : ''}
                                <li class="mb-2">
                                    <strong>Restrict Network Access</strong><br />
                                    <span class="text-muted">Limit exposure by using VPN, firewalls, or network segmentation to reduce attack surface.</span>
                                </li>
                                <li class="mb-2">
                                    <strong>Keep System Updated</strong><br />
                                    <span class="text-muted">Enable automatic Windows and application updates to receive patches quickly.</span>
                                </li>
                                <li class="mb-2">
                                    <strong>Monitor Device Activity</strong><br />
                                    <span class="text-muted">Review telemetry regularly and watch for unusual network or system behavior.</span>
                                </li>
                            </ol>
                        </div>

                        <div class="alert alert-info small">
                            <strong>Note:</strong> This score is calculated using a proprietary risk model that considers vulnerability severity, exploit probability, attack surface, and other factors. The exact formula is not disclosed to prevent gaming the system.
                        </div>
                    </div>
                    <div class="modal-footer d-flex justify-content-between align-items-center">
                        <button type="button" class="btn btn-secondary" onclick=${() => component.closeRiskExplanationModal()}>Close</button>
                        <a href="#!/devices/${device.id}" class="btn btn-primary" onclick=${(e) => { e.preventDefault(); component.closeRiskExplanationModal(); window.location.hash = `#!/devices/${device.id}`; }}>
                            View Details
                        </a>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" style="z-index: 2054;"></div>
    `;
}
