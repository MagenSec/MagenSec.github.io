/**
 * Devices Page - Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { config } from '../config.js';
import { PiiDecryption } from '../utils/piiDecryption.js';
import { getInstallerConfig, clearManifestCache, getCacheStatus } from '../utils/manifestCache.js';

export class DevicesPage extends window.Component {
    constructor(props) {
        super(props);
        this.state = {
            devices: [],
            filteredDevices: [],
            loading: true,
            error: null,
            searchQuery: '',
            cveFilterSeverity: '',
            sortField: 'risk',
            sortAsc: false,
            showDeviceModal: false,
            selectedDevice: null,
            telemetryLoading: false,
            telemetryError: null,
            telemetryDetail: null,
            enrichedScores: {},
            deviceSummaries: {},
            knownExploits: new Set(),
            deviceFilters: { license: 'all', connection: 'all', spec: 'all' },
            installers: { X64: {}, ARM64: {}, ENGINE: {} },
            manifestError: null,
            refreshingManifest: false,
            showDownloadModal: false,
            downloadTarget: null,
            appSort: { key: 'appName', direction: 'asc' },
            cveSort: { key: 'cveId', direction: 'asc' },
            activeInventoryTab: 'apps',
            inventoryLoading: false,
            inventoryError: null,
            appInventory: [],
            cveInventory: [],
            highlightedApp: null,
            highlightedCve: null,
            showRiskExplanationModal: false,
            riskExplanationDevice: null
        };
        this.KNOWN_EXPLOITS_CACHE = { data: null, loadedAt: null, TTL_HOURS: 24 };
        this.DEVICES_CACHE = {};
    }

    componentDidMount() {
        this.loadInstallerConfig();
        this.loadDevices();
        this.loadKnownExploitsAsync();
    }

    // Modal rendering moved to render() method
    renderModal() {
        const { html } = window;
        if (!this.state.showDeviceModal || !this.state.selectedDevice) return null;
        return html`
                    <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
                        <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                            <div class="modal-content" style="z-index: 1056;">
                                <div class="modal-header">
                                    <h5 class="modal-title d-flex align-items-center gap-2 flex-wrap">
                                        <a href="#!/devices/${this.state.selectedDevice.id}" class="text-primary fw-600 text-decoration-none" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); window.location.hash = `#!/devices/${this.state.selectedDevice.id}`; }}>${this.state.selectedDevice.name}</a>
                                        ${this.state.selectedDevice.state ? window.html`<span class="badge ${this.getStateBadgeClass(this.state.selectedDevice.state)} text-white">${this.state.selectedDevice.state}</span>` : ''}
                                    </h5>
                                    <button type="button" class="btn-close" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); }}></button>
                                </div>
                                <div class="modal-body">
                                    ${this.state.telemetryLoading ? html`
                                        <div class="text-center py-4">
                                            <div class="spinner-border text-primary" role="status"></div>
                                            <div class="mt-3 text-muted">Loading telemetry...</div>
                                        </div>
                                    ` : this.state.telemetryError ? html`
                                        <div class="alert alert-danger">${this.state.telemetryError}</div>
                                    ` : this.state.telemetryDetail ? html`
                                        <!-- Registered | Last Seen | User row -->
                                        <div class="card mb-3">
                                            <div class="card-body py-2">
                                                <div class="row g-3 align-items-center text-center">
                                                    <div class="col-md-4">
                                                        <div class="text-muted small">Registered</div>
                                                        <div class="fw-bold">${this.state.selectedDevice.firstHeartbeat ? this.formatAbsolute(this.state.selectedDevice.firstHeartbeat) : this.state.selectedDevice.firstSeen ? this.formatAbsolute(this.state.selectedDevice.firstSeen) : this.state.selectedDevice.createdAt ? this.formatAbsolute(this.state.selectedDevice.createdAt) : '—'}</div>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <div class="text-muted small">Last Seen</div>
                                                        <div class="fw-bold">${this.state.selectedDevice.lastHeartbeat ? this.formatAbsolute(this.state.selectedDevice.lastHeartbeat) : this.state.telemetryDetail?.history?.[0]?.timestamp ? this.formatAbsolute(this.state.telemetryDetail.history[0].timestamp) : 'Never'}</div>
                                                    </div>
                                                    <div class="col-md-4">
                                                        <div class="text-muted small">User</div>
                                                        ${(() => {
                                                            const f = this.state.telemetryDetail?.history?.[0]?.fields || {};
                                                            const encoded = f.UserName || f.Username || f.userName || f.LoggedOnUser || f.CurrentUser || null;
                                                            if (!encoded) return html`<div class="fw-bold font-monospace small">N/A</div>`;
                                                            const username = PiiDecryption.decryptIfEncrypted(String(encoded));
                                                            return html`<div class="fw-bold">${username || 'N/A'}</div>`;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="row g-3 align-items-start">
                                            <div class="col-md-5">
                                                <h5>Current Specs</h5>
                                                <ul class="list-unstyled text-muted small mb-0">
                                                    <li><strong>OS:</strong> ${this.state.selectedDevice.telemetry?.osEdition || ''} ${this.state.selectedDevice.telemetry?.osVersion || ''} (${this.state.selectedDevice.telemetry?.osBuild || ''})</li>
                                                    <li><strong>CPU:</strong> ${this.state.selectedDevice.telemetry?.cpuName || ''} ${this.state.selectedDevice.telemetry?.cpuCores ? '('+this.state.selectedDevice.telemetry.cpuCores+' cores)' : ''}</li>
                                                    <li><strong>RAM:</strong> ${this.state.selectedDevice.telemetry?.totalRamMb ? Math.round(this.state.selectedDevice.telemetry.totalRamMb/1024)+' GB' : ''}</li>
                                                    <li><strong>Disk:</strong> ${this.state.selectedDevice.telemetry?.totalDiskGb ? this.state.selectedDevice.telemetry.totalDiskGb+' GB' : ''} ${this.state.selectedDevice.telemetry?.systemDiskMediaType || ''} ${this.state.selectedDevice.telemetry?.systemDiskBusType || ''}</li>
                                                    <li><strong>Network:</strong> ${this.state.selectedDevice.telemetry?.connectionType || ''} ${this.state.selectedDevice.telemetry?.networkSpeedMbps ? this.state.selectedDevice.telemetry.networkSpeedMbps+' Mbps' : ''}</li>
                                                    <li><strong>IP:</strong> ${(() => {
                                                        const ips = this.state.selectedDevice.telemetry?.ipAddresses || this.state.selectedDevice.telemetry?.IPAddresses;
                                                        if (!ips || !Array.isArray(ips) || ips.length === 0) return 'No IP';
                                                        const primary = ips[0];
                                                        const count = ips.length;
                                                        if (count > 1) {
                                                            return html`${primary} <span class="badge badge-sm bg-azure-lt ms-1">(+${count - 1})</span>`;
                                                        }
                                                        return primary;
                                                    })()}</li>
                                                </ul>
                                            </div>
                                            <div class="col-md-5">
                                                <h5>Security Status</h5>
                                                ${(() => {
                                                    const summary = this.state.deviceSummaries[this.state.selectedDevice.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
                                                    const displayScore = (this.state.enrichedScores[this.state.selectedDevice.id]?.score ?? summary.score ?? 0);
                                                    const scoreColor = displayScore >= 80 ? '#d63939' : displayScore >= 60 ? '#f59f00' : displayScore >= 40 ? '#fab005' : '#2fb344';
                                                    const totalCves = (summary.criticalCves || 0) + (summary.highCves || 0) + (summary.mediumCves || 0) + (summary.lowCves || 0);
                                                    return html`
                                                        <div class="d-flex flex-column gap-3">
                                                            <div class="d-flex align-items-center gap-3" style="cursor: pointer;" onclick=${(e) => { e.preventDefault(); this.openRiskExplanationModal(this.state.selectedDevice); }} title="Click to see what drives this risk score">
                                                                <svg width="96" height="96" viewBox="0 0 100 100">
                                                                    <circle cx="50" cy="50" r="40" fill="none" stroke="#e9ecef" stroke-width="8"/>
                                                                    <circle cx="50" cy="50" r="40" fill="none" stroke="${scoreColor}" stroke-width="8" stroke-dasharray="${(displayScore / 100 * 251.3).toFixed(2)} 251.3" stroke-linecap="round" transform="rotate(-90 50 50)" />
                                                                    <text x="50" y="58" text-anchor="middle" font-size="24" font-weight="bold" fill="${scoreColor}">${Math.round(displayScore)}</text>
                                                                </svg>
                                                                <div>
                                                                    <div class="text-muted small">Risk Score <span class="badge badge-sm bg-info-lt">Click for details</span></div>
                                                                    <div><span class="badge ${summary.worstSeverity === 'CRITICAL' ? 'bg-danger-lt' : summary.worstSeverity === 'HIGH' ? 'bg-warning-lt' : summary.worstSeverity === 'MEDIUM' ? 'bg-secondary-lt' : 'bg-success-lt'}">${summary.worstSeverity}</span></div>
                                                                </div>
                                                            </div>
                                                            <div class="d-flex gap-4 justify-content-center">
                                                                <div class="text-center">
                                                                    <svg width="72" height="72" viewBox="0 0 72 72">
                                                                        ${(() => {
                                                                            const totalApps = summary.apps || 0;
                                                                            const vulnApps = summary.vulnerableApps || 0;
                                                                            const angle = totalApps > 0 ? (vulnApps / totalApps) * 360 : 0;
                                                                            const largeArc = angle > 180 ? 1 : 0;
                                                                            const x = 36 + 28 * Math.cos((angle - 90) * Math.PI / 180);
                                                                            const y = 36 + 28 * Math.sin((angle - 90) * Math.PI / 180);
                                                                            return html`
                                                                                <circle cx="36" cy="36" r="28" fill="#2fb344"/>
                                                                                ${vulnApps > 0 ? html`<path d="M 36 36 L 36 8 A 28 28 0 ${largeArc} 1 ${x} ${y} Z" fill="#d63939"/>` : ''}
                                                                                <text x="36" y="42" text-anchor="middle" font-size="14" font-weight="bold" fill="white">${vulnApps}/${totalApps}</text>
                                                                            `;
                                                                        })()}
                                                                    </svg>
                                                                    <div class="text-muted small">Apps</div>
                                                                </div>
                                                                <div class="text-center">
                                                                    <svg width="72" height="72" viewBox="0 0 72 72">
                                                                        ${(() => {
                                                                            if (totalCves === 0) {
                                                                                return html`<circle cx="36" cy="36" r="28" fill="#2fb344"/><text x="36" y="42" text-anchor="middle" font-size="14" font-weight="bold" fill="white">0</text>`;
                                                                            }
                                                                            let currentAngle = 0;
                                                                            const slices = [];
                                                                            const addSlice = (count, color) => {
                                                                                if (count === 0) return;
                                                                                const angle = (count / totalCves) * 360;
                                                                                const largeArc = angle > 180 ? 1 : 0;
                                                                                const startX = 36 + 28 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                                const startY = 36 + 28 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                                currentAngle += angle;
                                                                                const endX = 36 + 28 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                                const endY = 36 + 28 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                                slices.push(html`<path d="M 36 36 L ${startX} ${startY} A 28 28 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}"/>`);
                                                                            };
                                                                            addSlice(summary.criticalCves, '#d63939');
                                                                            addSlice(summary.highCves, '#f59f00');
                                                                            addSlice(summary.mediumCves, '#fab005');
                                                                            addSlice(summary.lowCves, '#74b816');
                                                                            return html`${slices}<text x="36" y="42" text-anchor="middle" font-size="14" font-weight="bold" fill="white">${totalCves}</text>`;
                                                                        })()}
                                                                    </svg>
                                                                    <div class="text-muted small">CVEs</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `;
                                                })()}
                                            </div>
                                        </div>
                                        <div class="mt-3">
                                            <h5>Recent Changes</h5>
                                            ${this.state.telemetryDetail?.changes && this.state.telemetryDetail.changes.length > 0 ? html`
                                                <div class="timeline timeline-simple">
                                                    ${this.state.telemetryDetail.changes.slice(0,5).map(change => html`
                                                        <div class="timeline-event">
                                                            <div class="timeline-event-icon bg-yellow-lt"></div>
                                                            <div class="timeline-event-content">
                                                                <div class="text-muted small">${this.formatAbsolute(change.at)}</div>
                                                                <div class="text-sm">${Object.keys(change.delta).join(', ')}</div>
                                                            </div>
                                                        </div>
                                                    `)}
                                                </div>
                                            ` : html`<div class="text-muted small">No recent hardware changes</div>`}
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="modal-footer d-flex justify-content-between">
                                    <div class="text-muted small">Open full view for apps, risks, and timeline details.</div>
                                    <a class="btn btn-primary" href="#!/devices/${this.state.selectedDevice.id}" onclick=${(e) => { e.preventDefault(); this.closeDeviceModal(); window.location.hash = `#!/devices/${this.state.selectedDevice.id}`; }}>
                                        Open Device Details
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
                `;
    }

    renderRiskExplanationModal() {
        const { html } = window;
        if (!this.state.showRiskExplanationModal || !this.state.riskExplanationDevice) return '';

        const device = this.state.riskExplanationDevice;
        const summary = this.state.deviceSummaries[device.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
        const enriched = this.state.enrichedScores[device.id] || { score: summary.score, constituents: {} };
        const constituents = enriched.constituents || {};

        return html`
            <div class="modal modal-blur fade show" style="display: block; z-index: 2055;" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                    <div class="modal-content">
                        <div class="modal-header bg-light">
                            <h5 class="modal-title">Risk Score Explanation</h5>
                            <button type="button" class="btn-close" onclick=${() => this.closeRiskExplanationModal()}></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-4">
                                <h6 class="text-muted">Overall Risk: <strong>${Math.round(enriched.score || 0)}/100</strong></h6>
                                <div class="progress mb-3" style="height: 8px;">
                                    <div class="progress-bar ${enriched.score >= 80 ? 'bg-danger' : enriched.score >= 60 ? 'bg-warning' : enriched.score >= 40 ? 'bg-warning' : 'bg-success'}" style="width: ${Math.min(enriched.score || 0, 100)}%"></div>
                                </div>
                                <p class="text-muted small">
                                    This risk score combines vulnerability data from installed applications with network and deployment factors.
                                    A higher score indicates greater security risk and need for remediation.
                                </p>
                            </div>

                            <div class="mb-4">
                                <h6>What Contributes to This Risk?</h6>
                                <div class="list-group list-group-flush">
                                    <!-- CVE Severity -->
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Vulnerability Severity</div>
                                                <div class="text-muted small">Highest CVSS score from identified CVEs</div>
                                            </div>
                                            <div class="text-end">
                                                ${constituents.maxCvssNormalized ? html`
                                                    <span class="badge ${constituents.maxCvssNormalized >= 9 ? 'bg-danger' : constituents.maxCvssNormalized >= 7 ? 'bg-warning' : constituents.maxCvssNormalized >= 4 ? 'bg-info' : 'bg-success'}">
                                                        ${(constituents.maxCvssNormalized * 10).toFixed(1)}/100
                                                    </span>
                                                ` : html`<span class="text-muted">None detected</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- CVE Count -->
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Vulnerable Applications</div>
                                                <div class="text-muted small">Number of apps with known vulnerabilities</div>
                                            </div>
                                            <div class="text-end">
                                                ${summary.vulnerableApps ? html`
                                                    <span class="badge bg-warning-lt">${summary.vulnerableApps} apps</span>
                                                ` : html`<span class="text-muted">None found</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Total CVEs -->
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Total CVEs</div>
                                                <div class="text-muted small">All identified CVEs across apps</div>
                                            </div>
                                            <div class="text-end">
                                                ${summary.criticalCves + summary.highCves + summary.mediumCves + summary.lowCves > 0 ? html`
                                                    <div>
                                                        ${summary.criticalCves > 0 ? html`<span class="badge bg-danger me-1">${summary.criticalCves} Critical</span>` : ''}
                                                        ${summary.highCves > 0 ? html`<span class="badge bg-warning me-1">${summary.highCves} High</span>` : ''}
                                                        ${summary.mediumCves > 0 ? html`<span class="badge bg-info me-1">${summary.mediumCves} Medium</span>` : ''}
                                                    </div>
                                                ` : html`<span class="text-muted">No CVEs</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- EPSS Exploitability -->
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Exploit Probability (EPSS)</div>
                                                <div class="text-muted small">Likelihood CVEs are actively exploited</div>
                                            </div>
                                            <div class="text-end">
                                                ${constituents.maxEpssStored ? html`
                                                    <span class="badge ${constituents.maxEpssStored > 0.5 ? 'bg-danger' : constituents.maxEpssStored > 0.3 ? 'bg-warning' : 'bg-info'}">
                                                        ${(constituents.maxEpssStored * 100).toFixed(0)}%
                                                    </span>
                                                ` : html`<span class="text-muted">Unknown</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Known Exploits -->
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Known Exploits</div>
                                                <div class="text-muted small">CVEs with publicly available exploits</div>
                                            </div>
                                            <div class="text-end">
                                                ${constituents.hasKnownExploit ? html`
                                                    <span class="badge bg-danger">1+ Exploits</span>
                                                ` : html`<span class="text-muted">None known</span>`}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Network Exposure -->
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <div class="text-sm fw-bold">Network Exposure</div>
                                                <div class="text-muted small">Device network configuration and IP type</div>
                                            </div>
                                            <div class="text-end">
                                                <span class="badge bg-info-lt">Analyzed</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="mb-4">
                                <h6>How to Reduce This Risk</h6>
                                <ol class="small">
                                    ${summary.vulnerableApps > 0 ? html`
                                        <li class="mb-2">
                                            <strong>Patch Vulnerable Applications</strong><br>
                                            <span class="text-muted">Update ${summary.vulnerableApps} application(s) to the latest versions. This is the most effective way to reduce risk.</span>
                                        </li>
                                    ` : ''}
                                    ${summary.criticalCves > 0 || summary.highCves > 0 ? html`
                                        <li class="mb-2">
                                            <strong>Prioritize Critical/High CVEs</strong><br>
                                            <span class="text-muted">Address the ${summary.criticalCves + summary.highCves} most severe vulnerabilities first.</span>
                                        </li>
                                    ` : ''}
                                    <li class="mb-2">
                                        <strong>Restrict Network Access</strong><br>
                                        <span class="text-muted">Limit exposure by using VPN, firewalls, or network segmentation to reduce attack surface.</span>
                                    </li>
                                    <li class="mb-2">
                                        <strong>Keep System Updated</strong><br>
                                        <span class="text-muted">Enable automatic Windows and application updates to receive patches quickly.</span>
                                    </li>
                                    <li class="mb-2">
                                        <strong>Monitor Device Activity</strong><br>
                                        <span class="text-muted">Review telemetry regularly and watch for unusual network or system behavior.</span>
                                    </li>
                                </ol>
                            </div>

                            <div class="alert alert-info small">
                                <strong>Note:</strong> This score is calculated using a proprietary risk model that considers vulnerability severity,
                                exploit probability, attack surface, and other factors. The exact formula is not disclosed to prevent gaming the system.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick=${() => this.closeRiskExplanationModal()}>Close</button>
                            <a href="#!/devices/${device.id}" class="btn btn-primary" onclick=${(e) => { e.preventDefault(); this.closeRiskExplanationModal(); window.location.hash = `#!/devices/${device.id}`; }}>
                                View Details
                            </a>
                        </div>
                    </div>
                </div>
                <div class="modal-backdrop fade show" style="z-index: 2054;"></div>
            </div>
        `;
    }

    enrichDeviceScore(summary) {
        const constituents = summary.constituents;
        if (!constituents || constituents.cveCount === 0) {
            return { score: summary.score, constituents, enrichmentFactors: {} };
        }
        
        // Base calculation: CVSS × EPSS
        let riskFactor = constituents.maxCvssNormalized * constituents.maxEpssStored;
        
        // Check if any CVE is a known exploit (would need CVE details in summary for this)
        const hasKnownExploit = false; // Updated when we have CVE details
        const exploitFactor = hasKnownExploit ? 1.5 : 1.0;
        
        // Time decay: EPSS degrades over time
        const epssDate = new Date(constituents.epssDate);
        const daysSinceEpss = (Date.now() - epssDate) / (1000 * 60 * 60 * 24);
        const timeDecayFactor = Math.max(0.1, 1.0 - (daysSinceEpss / 365));
        
        // Final score with all factors
        const finalRisk = (
            riskFactor *
            constituents.exposureFactor *
            constituents.privilegeFactor *
            exploitFactor *
            timeDecayFactor
        ) * 100;
        
        const enrichedScore = Math.round(finalRisk * 100) / 100;
        
        return {
            score: enrichedScore,
            constituents,
            enrichmentFactors: {
                hasKnownExploit,
                timeDecayFactor: Math.round(timeDecayFactor * 10000) / 10000,
                daysSinceEpss: Math.round(daysSinceEpss)
            }
        };
    }

    async loadKnownExploitsAsync() {
        // Check cache freshness
        if (this.KNOWN_EXPLOITS_CACHE.data && this.KNOWN_EXPLOITS_CACHE.loadedAt) {
            const ageHours = (Date.now() - this.KNOWN_EXPLOITS_CACHE.loadedAt) / (1000 * 60 * 60);
            if (ageHours < this.KNOWN_EXPLOITS_CACHE.TTL_HOURS) {
                this.setState({ knownExploits: this.KNOWN_EXPLOITS_CACHE.data });
                return;
            }
        }
        
        // Try to load from MagenSec's hourly-updated repository
        const url = 'https://raw.githubusercontent.com/MagenSec/MagenSec.github.io/main/diag/known_exploited_vulnerabilities.json';
        
        try {
            const response = await fetch(url, { cache: 'reload', timeout: 5000 });
            
            if (!response.ok) {
                console.debug(`[DevicesPage] Known exploits source returned ${response.status}`);
                throw new Error('Failed to load');
            }
            
            const data = await response.json();
            let cveIds = new Set();
            
            // Expected format: { vulnerabilities: [{ cveID, ... }, ...] }
            if (data.vulnerabilities && Array.isArray(data.vulnerabilities)) {
                cveIds = new Set(data.vulnerabilities
                    .map(v => v.cveID || v.cveId)
                    .filter(id => id && typeof id === 'string'));
            } else if (Array.isArray(data)) {
                cveIds = new Set(data
                    .map(v => typeof v === 'string' ? v : (v.cveID || v.cveId))
                    .filter(id => id && typeof id === 'string'));
            }
            
            if (cveIds.size > 0) {
                console.log(`[DevicesPage] Loaded ${cveIds.size} known exploits`);
                this.KNOWN_EXPLOITS_CACHE.data = cveIds;
                this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
                this.setState({ knownExploits: cveIds });
            } else {
                throw new Error('No CVEs parsed');
            }
        } catch (error) {
            console.warn('[DevicesPage] Could not load known exploits:', error.message);
            // Graceful fallback: use empty set
            this.KNOWN_EXPLOITS_CACHE.data = new Set();
            this.KNOWN_EXPLOITS_CACHE.loadedAt = Date.now();
            this.setState({ knownExploits: new Set() });
        }
    }

    async loadInstallerConfig() {
        try {
            const manifestConfig = await getInstallerConfig();
            if (manifestConfig) {
                this.setState({ installers: manifestConfig, manifestError: null });
                console.log('[Devices] Loaded installer config from manifest cache:', manifestConfig);
            } else {
                this.setState({ manifestError: 'Failed to load installer manifest. Please try again later or contact support.' });
            }
        } catch (error) {
            console.error('[Devices] Failed to load manifest config, using fallback:', error);
            this.setState({ manifestError: 'Failed to load installer manifest due to network or server error.' });
        }
    }

    async reloadPageData() {
        try {
            this.setState({ refreshingManifest: true });
            
            // Clear manifest cache and reload from remote
            const manifestConfig = await getInstallerConfig(true);
            if (manifestConfig) {
                this.setState({ installers: manifestConfig });
            }
            
            // Reload device list
            await this.loadDevices(true);
            
            // Show success toast
            this.showToast('Page reloaded successfully', 'success');
        } catch (error) {
            console.error('[Devices] Failed to reload page data:', error);
            this.showToast('Failed to reload page data', 'danger');
        } finally {
            this.setState({ refreshingManifest: false });
        }
    }

    showToast(message, type = 'info') {
        if (!window.toast) {
            console.warn('[Devices] Toast not available:', message);
            return;
        }
        const toastType = type === 'danger' ? 'error' : type;
        window.toast[toastType](message);
    }

    openDownloadModal(arch) {
        const installer = arch === 'x64' ? this.state.installers.X64 : this.state.installers.ARM64;
        this.setState({
            showDownloadModal: true,
            downloadTarget: {
                name: installer.DISPLAY_NAME,
                url: installer.DOWNLOAD_URL,
                size: installer.FILE_SIZE_MB,
                arch: installer.ARCHITECTURE,
                warning: installer.WARNING
            }
        });
    }

    closeDownloadModal() {
        this.setState({
            showDownloadModal: false,
            downloadTarget: null
        });
    }

    confirmDownload() {
        if (this.state.downloadTarget) {
            // Create a hidden anchor element to trigger download
            const a = document.createElement('a');
            a.href = this.state.downloadTarget.url;
            a.download = '';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.closeDownloadModal();
        }
    }

    getCurrentOrgId() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.showToast('No organization selected', 'danger');
            return null;
        }
        return currentOrg.orgId;
    }

    async enableDevice(deviceId) {
        if (!confirm('Enable this device? The device must re-register (license validation + heartbeat) before it becomes ACTIVE again.')) return;

        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        try {
            const response = await api.put(`/api/v1/orgs/${orgId}/devices/${deviceId}/enable`);

            if (response.success) {
                this.optimisticSetDeviceState(deviceId, 'Enabled');
                await this.loadDevices(true);
                this.showToast('Device enabled. Re-registration required.', 'success');
            } else {
                throw new Error(response.message || 'Failed to enable device');
            }
        } catch (error) {
            console.error('[Devices] Enable failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async blockDevice(deviceId, deleteTelemetry = false) {
        const confirmMessage = deleteTelemetry
            ? 'Block this device and delete its telemetry? Device will remove license and terminate. Seat will be released. Telemetry deletion cannot be undone.'
            : 'Block this device? Device will remove license and terminate. Seat will be released.';

        if (!confirm(confirmMessage)) return;

        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        try {
            const url = `/api/v1/orgs/${orgId}/devices/${deviceId}/block?deleteTelemetry=${deleteTelemetry ? 'true' : 'false'}`;
            const response = await api.put(url);

            if (response.success) {
                this.optimisticSetDeviceState(deviceId, 'Blocked');
                await this.loadDevices(true);
                this.showToast(deleteTelemetry ? 'Device blocked. Seat released. Telemetry deleted.' : 'Device blocked successfully. Seat released.', 'success');
            } else {
                throw new Error(response.message || 'Failed to block device');
            }
        } catch (error) {
            console.error('[Devices] Block failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    async deleteDevice(deviceId) {
        if (!confirm('Delete this device? All telemetry data will be removed. This cannot be undone.')) return;

        const orgId = this.getCurrentOrgId();
        if (!orgId) return;

        try {
            const response = await api.delete(`/api/v1/orgs/${orgId}/devices/${deviceId}`);

            if (response.success) {
                this.optimisticSetDeviceState(deviceId, 'Deleted');
                await this.loadDevices(true);
                this.showToast('Device deleted successfully. All data removed.', 'success');
            } else {
                throw new Error(response.message || 'Failed to delete device');
            }
        } catch (error) {
            console.error('[Devices] Delete failed:', error);
            this.showToast(error.message, 'danger');
        }
    }

    componentWillUnmount() {
        // Unsubscribe from org changes
        if (this.orgUnsubscribe) {
            this.orgUnsubscribe();
        }
    }

    tryGetCachedDevices(orgId) {
        if (this.DEVICES_CACHE[orgId]) {
            const cached = this.DEVICES_CACHE[orgId];
            const ageMs = Date.now() - cached.timestamp;
            const TTL_MS = 5 * 60 * 1000; // 5 minutes
            if (ageMs < TTL_MS) {
                return cached.devices;
            }
        }
        return null;
    }

    setCachedDevices(orgId, devices) {
        this.DEVICES_CACHE[orgId] = {
            devices,
            timestamp: Date.now()
        };
    }

    async enrichDeviceScoresAsync(devices, summaries) {
        // Enrich risk scores in background
        try {
            const enriched = {};
            for (const device of devices) {
                const summary = summaries[device.id];
                if (summary && summary.constituents) {
                    enriched[device.id] = this.enrichDeviceScore(summary);
                }
            }
            if (Object.keys(enriched).length > 0) {
                this.setState(prev => ({
                    enrichedScores: { ...prev.enrichedScores, ...enriched }
                }));
            }
        } catch (error) {
            console.warn('[DevicesPage] Error enriching scores:', error);
        }
    }

    async loadDevices(forceRefresh = false) {
        try {
            // Get current org from context
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                this.setState({ 
                    devices: [], 
                    loading: false,
                    error: 'No organization selected'
                });
                return;
            }

            if (!forceRefresh) {
                const cached = this.tryGetCachedDevices(currentOrg.orgId);
                if (cached) {
                    this.setState({ devices: cached, loading: false, error: null });
                    return;
                }
            }

            this.setState({ loading: true, error: null });

            // Call real API
            const response = await api.getDevices(currentOrg.orgId, { include: 'summary' }, { skipCache: forceRefresh });
            if (!response.success) {
                throw new Error(response.message || response.error || 'Failed to load devices');
            }
            
            // Transform API response to expected format
            const summariesFromApi = {};
            const devices = (response.data?.devices || []).map(device => {
                const summary = this.normalizeSummary(device.summary || device.Summary);

                // Mask license key - only show last 8 characters
                let maskedKey = null;
                if (device.licenseKey) {
                    const key = device.licenseKey;
                    maskedKey = key.length > 8 ? `****-****-${key.slice(-8)}` : key;
                }
                
                const t = device.telemetry || {};
                // Robust device name extraction with multiple fallbacks
                const encryptedName = (device.deviceName && device.deviceName.trim()) 
                    ? device.deviceName 
                    : (device.DeviceName && device.DeviceName.trim()) 
                    ? device.DeviceName 
                    : (t.hostname && String(t.hostname).trim())
                    ? t.hostname
                    : (t.Hostname && String(t.Hostname).trim())
                    ? t.Hostname
                    : device.deviceId;
                // Decrypt PII field
                const deviceName = PiiDecryption.decrypt(encryptedName);
                const mapped = {
                    id: device.DeviceId || device.deviceId,
                    name: deviceName,
                    state: (device.state || device.State || 'Unknown'),
                    lastHeartbeat: device.lastHeartbeat,
                    firstHeartbeat: device.firstHeartbeat || device.firstSeen || device.createdAt,
                    clientVersion: device.clientVersion,
                    licenseKey: maskedKey,
                    telemetry: {
                        osEdition: t.oseEdition || t.OSEdition,
                        osVersion: t.osVersion || t.OSVersion,
                        osBuild: t.osBuild || t.OSBuild,
                        cpuArch: t.cpuArch || t.CPUArch,
                        cpuName: t.cpuName || t.CPUName,
                        cpuCores: t.cpuCores || t.CPUCores,
                        cpuGHz: t.cpuGHz || t.CPUGHz,
                        totalRamMb: t.totalRamMb || t.TotalRamMb,
                        totalDiskGb: t.totalDiskGb || t.TotalDiskGb,
                        connectionType: t.connectionType || t.ConnectionType,
                        networkSpeedMbps: t.networkSpeedMbps || t.NetworkSpeedMbps,
                        systemDiskMediaType: t.systemDiskMediaType || t.SystemDiskMediaType,
                        systemDiskBusType: t.systemDiskBusType || t.SystemDiskBusType,
                        timestamp: t.timestamp || t.Timestamp,
                        rowKey: t.rowKey || t.RowKey
                    },
                    // Calculate inactiveMinutes client-side
                    inactiveMinutes: device.lastHeartbeat ? Math.floor((Date.now() - new Date(device.lastHeartbeat).getTime()) / 60000) : null
                };

                if (summary) {
                    summariesFromApi[mapped.id] = summary;
                }
                return mapped;
            });

            this.setCachedDevices(currentOrg.orgId, devices);
            this.setState(prev => ({ devices, loading: false, deviceSummaries: { ...prev.deviceSummaries, ...summariesFromApi } }));
            
            // Background: Load known exploits and enrich risk scores
            this.loadKnownExploitsAsync();
            this.enrichDeviceScoresAsync(devices, summariesFromApi);
        } catch (error) {
            console.error('[DevicesPage] Error loading devices:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    optimisticSetDeviceState(deviceId, newState) {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        this.setState(prev => {
            const updated = (prev.devices || []).map(d => (d.id === deviceId ? { ...d, state: newState } : d));
            this.setCachedDevices(currentOrg.orgId, updated);
            return { devices: updated };
        });
    }

    canEnableDevice(state) {
        const s = (state || '').toLowerCase();
        return s === 'blocked' || s === 'deleted';
    }

    canBlockDevice(state) {
        const s = (state || '').toLowerCase();
        return s === 'active' || s === 'enabled' || s === 'inactive';
    }

    computeSecuritySummary(cves) {
        const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 };
        for (const c of (cves || [])) {
            counts.total++;
            const sev = String(c.severity || '').toUpperCase();
            if (sev === 'CRITICAL') counts.critical++;
            else if (sev === 'HIGH') counts.high++;
            else if (sev === 'MEDIUM') counts.medium++;
            else if (sev === 'LOW') counts.low++;
            else counts.unknown++;
        }

        let badgeClass = 'bg-success-lt';
        let label = 'Secure';
        if (counts.critical > 0) { badgeClass = 'bg-danger-lt'; label = 'Critical'; }
        else if (counts.high > 0) { badgeClass = 'bg-warning-lt'; label = 'High Risk'; }
        else if (counts.medium > 0) { badgeClass = 'bg-secondary-lt'; label = 'Medium Risk'; }
        else if (counts.total > 0) { badgeClass = 'bg-primary-lt'; label = 'Low Risk'; }

        return { counts, badgeClass, label };
    }

    async openDeviceModal(device) {
        this.setState({
            showDeviceModal: true,
            selectedDevice: device,
            telemetryLoading: true,
            telemetryError: null,
            telemetryDetail: null,
            activeInventoryTab: 'apps',
            highlightedApp: null,
            highlightedCve: null
        });
        try {
            const currentOrg = orgContext.getCurrentOrg();
            // Load telemetry for recent changes timeline
            const resp = await api.get(`/api/v1/orgs/${currentOrg.orgId}/devices/${device.id}/telemetry?historyLimit=50&lastDays=180`);
            if (!resp.success) throw new Error(resp.message || resp.error || 'Failed to load telemetry');
            this.setState({ telemetryDetail: resp.data, telemetryLoading: false });
            
            // OPTIMIZATION: Device summary is already available from GetDevices(include=summary)
            // No need to fetch device-specific apps/CVEs - use the summary for modal stats
            // The detailed inventory is available only in the full device details page
            // This saves 2 expensive API calls per modal open
        } catch (e) {
            console.error('[Devices] Telemetry load failed', e);
            this.setState({ telemetryError: e.message, telemetryLoading: false });
        }
    }

    closeDeviceModal() {
        this.setState({ showDeviceModal: false, selectedDevice: null, telemetryDetail: null, telemetryError: null });
    }

    openRiskExplanationModal(device) {
        this.setState({ showRiskExplanationModal: true, riskExplanationDevice: device });
    }

    closeRiskExplanationModal() {
        this.setState({ showRiskExplanationModal: false, riskExplanationDevice: null });
    }

    setSearchQuery(q) {
        this.setState({ searchQuery: q });
    }

    setSortField(field) {
        this.setState(prev => ({
            sortField: field,
            sortAsc: prev.sortField === field ? !prev.sortAsc : field === 'name'
        }));
    }

    // Compute enriched application inventory status and join CVE counts
    computeAppStatus(apps, cves = []) {
        // Group by appName+vendor
        const groups = {};
        for (const a of apps) {
            const key = `${(a.appName||'').toLowerCase()}|${(a.vendor||'').toLowerCase()}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        }
        const enriched = [];
        for (const key of Object.keys(groups)) {
            const list = groups[key].sort((x,y) => new Date(y.lastSeen||0) - new Date(x.lastSeen||0));
            const current = list[0];
            const previous = list.slice(1);
            let status = 'current'; // current | updated | uninstalled
            // Updated: previous exists with older version and lastSeen < current firstSeen or lastSeen < current lastSeen
            if (previous.length > 0) {
                const prevDifferentVersion = previous.find(p => (p.version||'') !== (current.version||''));
                if (prevDifferentVersion) {
                    const prevLast = new Date(prevDifferentVersion.lastSeen||0).getTime();
                    const currStart = new Date(current.firstSeen||current.lastSeen||0).getTime();
                    if (prevLast && currStart && prevLast < currStart) {
                        status = 'updated';
                    }
                }
            }
            // Uninstalled: app was installed but lastSeen older than current scan timestamp and not seen in current scan
            // Heuristic: if latest item flag isInstalled=false and an older item had isInstalled=true with lastSeen < latest scan
            const latestSeen = new Date(current.lastSeen||0).getTime();
            const prevInstalled = previous.find(p => p.isInstalled && new Date(p.lastSeen||0).getTime() < latestSeen);
            if (!current.isInstalled && prevInstalled) {
                status = 'uninstalled';
            }
            const relatedCves = cves.filter(c => (c.appName||'').toLowerCase() === (current.appName||'').toLowerCase());
            const cveCount = relatedCves.length;
            const worstSeverity = relatedCves.reduce((acc, c) => Math.max(acc, this.severityWeight(c.severity)), 0);

            enriched.push({
                appName: current.appName,
                vendor: current.vendor,
                version: current.version,
                matchType: current.matchType,
                isInstalled: current.isInstalled,
                status,
                lastSeen: current.lastSeen,
                previousVersions: previous.map(p => ({ version: p.version, lastSeen: p.lastSeen })),
                cveCount,
                worstSeverity
            });
        }
        return enriched;
    }

    filterInventory(apps, q) {
        if (!q) return apps;
        const s = q.toLowerCase();
        return apps.filter(a => (a.appName||'').toLowerCase().includes(s) || (a.vendor||'').toLowerCase().includes(s));
    }

    formatLastSeen(lastHeartbeat) {
        if (!lastHeartbeat) {
            return 'Never';
        }

        const now = new Date();
        const then = new Date(lastHeartbeat);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    isVersionOutdated(deviceVersion) {
        if (!deviceVersion) return false;
        
        // Use cached installer version (or fallback to config)
        const latestVersion = this.state.installers.ENGINE.VERSION || config.INSTALLERS.ENGINE.VERSION;
        
        // Parse versions (format: major.minor.build)
        const parseVersion = (v) => {
            const parts = v.split('.').map(Number);
            return {
                major: parts[0] || 0,
                minor: parts[1] || 0,
                build: parts[2] || 0
            };
        };
        
        const device = parseVersion(deviceVersion);
        const latest = parseVersion(latestVersion);
        
        // Compare major.minor.build
        if (device.major < latest.major) return true;
        if (device.major === latest.major && device.minor < latest.minor) return true;
        if (device.major === latest.major && device.minor === latest.minor && device.build < latest.build) return true;
        
        return false;
    }

    isDeviceInactive(device) {
        const state = device.state?.toLowerCase();

        // Non-active states are considered offline in the portal.
        if (state && state !== 'active') {
            return true;
        }

        // No heartbeat = offline
        if (!device.lastHeartbeat) {
            return true;
        }
        // Use calculated inactiveMinutes
        if (device.inactiveMinutes !== null && device.inactiveMinutes !== undefined) {
            // Active devices: Expected heartbeat every 5 minutes, flag as offline if >30 minutes
            if (state === 'active' && device.inactiveMinutes > 30) {
                return true;
            }
        }
        return false;
    }

    computeDeviceStats(devices) {
        const stats = {
            total: devices.length,
            active: 0,
            enabled: 0,
            blocked: 0,
            deleted: 0,
            online: 0,
            offline: 0
        };

        for (const d of devices) {
            const s = (d.state || '').toLowerCase();
            if (s === 'active') stats.active++;
            if (s === 'enabled') stats.enabled++;
            if (s === 'blocked') stats.blocked++;
            if (s === 'deleted') stats.deleted++;
            if (this.isDeviceInactive(d)) stats.offline++; else stats.online++;
        }

        return stats;
    }

    setDeviceFilter(key, value) {
        this.setState(prev => ({
            deviceFilters: {
                ...prev.deviceFilters,
                [key]: value
            }
        }));
    }

    getFilteredDevices() {
        const { devices, searchQuery, deviceFilters } = this.state;
        const q = (searchQuery || '').trim().toLowerCase();

        const matchesSpec = (device) => {
            if (deviceFilters.spec === 'all') return true;
            const arch = (device.telemetry?.cpuArch || '').toLowerCase();
            if (deviceFilters.spec === 'arm64') return arch.includes('arm');
            if (deviceFilters.spec === 'x64') return arch.includes('x64') || arch.includes('amd64');
            return true;
        };

        const matchesLicense = (device) => {
            if (deviceFilters.license === 'all') return true;
            return (device.state || '').toLowerCase() === deviceFilters.license;
        };

        const matchesConnection = (device) => {
            if (deviceFilters.connection === 'all') return true;
            const offline = this.isDeviceInactive(device);
            return deviceFilters.connection === 'online' ? !offline : offline;
        };

        let list = devices
            .filter(d => matchesLicense(d) && matchesConnection(d) && matchesSpec(d))
            .filter(d => {
                if (!q) return true;
                const haystack = [
                    d.name,
                    d.id,
                    d.telemetry?.cpuName,
                    d.telemetry?.osEdition,
                    d.telemetry?.osVersion
                ].map(x => (x || '').toLowerCase());
                return haystack.some(h => h.includes(q));
            });

        // Apply sorting
        list.sort((a, b) => {
            let aVal, bVal;
            if (this.state.sortField === 'risk') {
                const aSummary = this.state.deviceSummaries[a.id] || { score: 0 };
                const bSummary = this.state.deviceSummaries[b.id] || { score: 0 };
                const aEnriched = this.state.enrichedScores[a.id];
                const bEnriched = this.state.enrichedScores[b.id];
                aVal = aEnriched?.score !== undefined ? aEnriched.score : aSummary.score || 0;
                bVal = bEnriched?.score !== undefined ? bEnriched.score : bSummary.score || 0;
            } else if (this.state.sortField === 'name') {
                aVal = (a.name || a.id || '').toLowerCase();
                bVal = (b.name || b.id || '').toLowerCase();
            }
            if (aVal < bVal) return this.state.sortAsc ? -1 : 1;
            if (aVal > bVal) return this.state.sortAsc ? 1 : -1;
            return 0;
        });

        return list;
    }

    formatNetworkSpeed(mbps) {
        const val = Number(mbps || 0);
        if (!val || isNaN(val)) return '';
        if (val >= 1000) {
            const gbps = Math.round((val / 1000) * 10) / 10; // 1 decimal
            return `@ ${gbps.toFixed(1)} Gbps`;
        }
        return `@ ${Math.round(val)} Mbps`;
    }

    formatAbsolute(dateValue) {
        if (!dateValue) return '—';
        const d = new Date(dateValue);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]}-${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
    }

    severityLabelFromWeight(weight) {
        if (weight >= 3) return 'CRITICAL';
        if (weight >= 2) return 'HIGH';
        if (weight >= 1) return 'MEDIUM';
        if (weight > 0) return 'LOW';
        return 'LOW';
    }

    normalizeSummary(summary) {
        if (!summary) return null;
        const critical = summary.criticalCveCount ?? summary.critical ?? summary.criticalCves ?? 0;
        const high = summary.highCveCount ?? summary.high ?? summary.highCves ?? 0;
        const medium = summary.mediumCveCount ?? summary.medium ?? summary.mediumCves ?? 0;
        const low = summary.lowCveCount ?? summary.low ?? summary.lowCves ?? 0;
        const cveCount = summary.cveCount ?? (critical + high + medium + low);
        const vulnerableApps = summary.vulnerableAppCount ?? summary.appsWithCves ?? summary.appWithVulnCount ?? 0;
        const worstSeverity = (summary.highestRiskBucket || '').toUpperCase() ||
            (critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : medium > 0 ? 'MEDIUM' : low > 0 ? 'LOW' : 'LOW');
        const derivedWeight = this.severityWeight(worstSeverity);
        const baseScore = summary.riskScore ?? (cveCount * 2 + derivedWeight * 10);
        return {
            apps: summary.appCount ?? summary.apps ?? null,
            cves: cveCount ?? null,
            vulnerableApps,
            criticalCves: critical,
            highCves: high,
            mediumCves: medium,
            lowCves: low,
            worstSeverity,
            score: Math.min(100, Math.max(0, Math.round(baseScore ?? 0))),
            constituents: summary.riskScoreConstituents || null
        };
    }

    updateDeviceSummaryCache(deviceId, apps, cves) {
        // Filter out old uninstalled apps (older than 30 days)
        const activeApps = (apps || []).filter(app => {
            if (app.isInstalled === true) return true;
            if (app.lastSeen) {
                const daysSinceSeen = (Date.now() - new Date(app.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceSeen <= 30) return true;
            }
            return false;
        });

        // Filter out patched CVEs
        const activeCves = (cves || []).filter(c => c.isPatched !== true);

        let worstWeight = 0;
        let critical = 0, high = 0, medium = 0, low = 0;
        const appNamesWithCves = new Set();
        for (const c of activeCves) {
            const weight = this.severityWeight(c.severity);
            if (weight > worstWeight) worstWeight = weight;
            const sev = (c.severity || '').toUpperCase();
            if (sev === 'CRITICAL') critical++;
            else if (sev === 'HIGH') high++;
            else if (sev === 'MEDIUM') medium++;
            else if (sev === 'LOW') low++;
            if (c.appName) appNamesWithCves.add(c.appName.toLowerCase());
        }

        const totalCves = activeCves.length;
        const appCount = activeApps.length;
        const vulnerableApps = activeApps.filter(a => a.appName && appNamesWithCves.has(a.appName.toLowerCase())).length;
        const worstSev = this.severityLabelFromWeight(worstWeight);
        const score = Math.min(100, Math.max(0, totalCves * 2 + worstWeight * 10));

        this.setState(prev => ({
            deviceSummaries: {
                ...prev.deviceSummaries,
                [deviceId]: {
                    apps: appCount,
                    cves: totalCves,
                    vulnerableApps,
                    criticalCves: critical,
                    highCves: high,
                    mediumCves: medium,
                    lowCves: low,
                    worstSeverity: worstSev,
                    score
                }
            }
        }));
    }

    setInventoryTab(tab) {
        this.setState({ activeInventoryTab: tab });
    }

    toggleAppSort(key) {
        this.setState(prev => {
            const direction = prev.appSort.key === key && prev.appSort.direction === 'desc' ? 'asc' : 'desc';
            return { appSort: { key, direction } };
        });
    }

    toggleCveSort(key) {
        this.setState(prev => {
            const direction = prev.cveSort.key === key && prev.cveSort.direction === 'desc' ? 'asc' : 'desc';
            return { cveSort: { key, direction } };
        });
    }

    queueDeviceAction(device, action) {
        // Placeholder for IPC/heartbeat queued commands
        this.showToast(`${action} queued for ${device.name || device.id}`, 'info');
    }

    severityWeight(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 3;
        if (s === 'HIGH') return 2;
        if (s === 'MEDIUM') return 1;
        if (s === 'LOW') return 0.5;
        return 0;
    }

    renderMatchBadge(matchType) {
        const normalize = (mt) => {
            if (typeof mt === 'number') return mt;
            const parsed = Number(mt);
            if (!Number.isNaN(parsed)) return parsed;
            const s = (mt || '').toString().toLowerCase();
            if (s === 'absolute' || s === 'exact') return 2;
            if (s === 'heuristic') return 1;
            return 0;
        };

        const value = normalize(matchType);
        if (value === 2) {
            return window.html`<span class="badge bg-danger-lt"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>Vulnerable</span>`;
        }
        if (value === 1) {
            return window.html`<span class="badge bg-warning-lt"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14l-2 10h-10z" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9.5 14h5" /></svg>AI Bot (med)</span>`;
        }
        return window.html`<span class="badge bg-success-lt"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>Clean</span>`;
    }

    getStateBadgeClass(state) {
        switch (state?.toLowerCase()) {
            case 'active':
                return 'bg-success';
            case 'enabled':
                return 'bg-warning';
            case 'blocked':
                return 'bg-danger';
            case 'deleted':
                return 'bg-secondary';
            default:
                return 'bg-secondary';
        }
    }

    render() {
        const { html } = window;
        const { loading, devices, error, manifestError } = this.state;

        const filteredDevices = this.getFilteredDevices();
        const stats = this.computeDeviceStats(filteredDevices);

        return html`
            ${manifestError ? html`<div class="alert alert-danger mt-2">${manifestError}</div>` : null}
            <!-- Installer Download Tiles -->
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 class="mb-0">Client Installers</h3>
                                <button 
                                    class="btn btn-sm btn-outline-primary ${this.state.refreshingManifest ? 'disabled' : ''}" 
                                    onclick=${() => this.reloadPageData()}
                                    disabled=${this.state.refreshingManifest}>
                                    ${this.state.refreshingManifest ? 
                                        window.html`<span class="spinner-border spinner-border-sm me-2"></span>Reloading...` : 
                                        window.html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                                            <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                                        </svg>
                                        Reload`
                                    }
                                </button>
                            </div>
                            <div class="row row-cards mb-3">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-lg bg-primary-lt">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <rect x="4" y="4" width="6" height="6" rx="1" />
                                                            <rect x="14" y="4" width="6" height="6" rx="1" />
                                                            <rect x="4" y="14" width="6" height="6" rx="1" />
                                                            <rect x="14" y="14" width="6" height="6" rx="1" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${this.state.installers.X64.DISPLAY_NAME}</h3>
                                                    <div class="text-muted small">${this.state.installers.X64.DESCRIPTION}</div>
                                                    <div class="mt-2">
                                                        <span class="badge bg-blue-lt me-2">v${this.state.installers.X64.VERSION}</span>
                                                        <span class="badge bg-secondary-lt">${this.state.installers.X64.FILE_SIZE_MB} MB</span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <button class="btn btn-primary" onclick=${() => this.openDownloadModal('x64')}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                                            <polyline points="7 11 12 16 17 11" />
                                                            <line x1="12" y1="4" x2="12" y2="16" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-lg bg-cyan-lt">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <rect x="4" y="4" width="6" height="6" rx="1" />
                                                            <rect x="14" y="4" width="6" height="6" rx="1" />
                                                            <rect x="4" y="14" width="6" height="6" rx="1" />
                                                            <rect x="14" y="14" width="6" height="6" rx="1" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${this.state.installers.ARM64.DISPLAY_NAME}</h3>
                                                    <div class="text-muted small">${this.state.installers.ARM64.DESCRIPTION}</div>
                                                    <div class="mt-2">
                                                        <span class="badge bg-blue-lt me-2">v${this.state.installers.ARM64.VERSION}</span>
                                                        <span class="badge bg-secondary-lt">${this.state.installers.ARM64.FILE_SIZE_MB} MB</span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <button class="btn btn-primary" onclick=${() => this.openDownloadModal('arm64')}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                                            <polyline points="7 11 12 16 17 11" />
                                                            <line x1="12" y1="4" x2="12" y2="16" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Devices List -->
                            <div class="card mb-3">
                                <div class="card-body">
                                    <div class="row g-3 align-items-start">
                                        <div class="col-md-5">
                                            <label class="form-label fw-bold">Search Box</label>
                                            <div class="input-icon">
                                                <span class="input-icon-addon">
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                                </span>
                                                <input class="form-control" type="text" placeholder="Search by device, CPU, OS" value=${this.state.searchQuery} onInput=${(e) => this.setSearchQuery(e.target.value)} />
                                            </div>
                                            <div class="row g-2 mt-2">
                                                <div class="col-6">
                                                    <select class="form-select form-select-sm" value=${this.state.deviceFilters.connection} onChange=${(e) => this.setDeviceFilter('connection', e.target.value)}>
                                                        <option value="all">All Connections</option>
                                                        <option value="online">Online</option>
                                                        <option value="offline">Offline</option>
                                                    </select>
                                                </div>
                                                <div class="col-6">
                                                    <select class="form-select form-select-sm" value=${this.state.deviceFilters.spec} onChange=${(e) => this.setDeviceFilter('spec', e.target.value)}>
                                                        <option value="all">Any Architecture</option>
                                                        <option value="x64">x64</option>
                                                        <option value="arm64">ARM64</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-7">
                                            <div class="row g-2">
                                                <div class="col-md-4">
                                                    <div class="card bg-light mb-0">
                                                        <div class="card-body py-3">
                                                            <div class="text-muted small mb-2">Filter by Device State</div>
                                                            <div class="d-flex flex-column gap-2">
                                                                <span class="badge badge-lg w-100 ${this.state.deviceFilters.connection === 'online' ? 'bg-green' : 'bg-green-lt'}" style="cursor: pointer;" onclick=${() => this.setDeviceFilter('connection', this.state.deviceFilters.connection === 'online' ? 'all' : 'online')}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                                    Online (${stats.online ?? stats.active})
                                                                </span>
                                                                <span class="badge badge-lg w-100 ${this.state.deviceFilters.connection === 'offline' ? 'bg-yellow' : 'bg-yellow-lt'}" style="cursor: pointer;" onclick=${() => this.setDeviceFilter('connection', this.state.deviceFilters.connection === 'offline' ? 'all' : 'offline')}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /></svg>
                                                                    Offline (${stats.offline})
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-md-8">
                                                    <div class="card bg-light mb-0">
                                                        <div class="card-body py-3">
                                                            <div class="text-muted small mb-2">Filter by License State</div>
                                                            <div class="row g-2">
                                                                <div class="col-6">
                                                                    <span class="badge badge-lg w-100 ${this.state.deviceFilters.license === 'active' ? 'bg-green' : 'bg-green-lt'}" style="cursor: pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'active' ? 'all' : 'active')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                                        Active (${stats.active})
                                                                    </span>
                                                                </div>
                                                                <div class="col-6">
                                                                    <span class="badge badge-lg w-100 ${this.state.deviceFilters.license === 'enabled' ? 'bg-blue' : 'bg-blue-lt'}" style="cursor: pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'enabled' ? 'all' : 'enabled')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /></svg>
                                                                        Enabled (${stats.enabled})
                                                                    </span>
                                                                </div>
                                                                <div class="col-6">
                                                                    <span class="badge badge-lg w-100 ${this.state.deviceFilters.license === 'blocked' ? 'bg-red' : 'bg-red-lt'}" style="cursor: pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'blocked' ? 'all' : 'blocked')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                                                        Blocked (${stats.blocked})
                                                                    </span>
                                                                </div>
                                                                <div class="col-6">
                                                                    <span class="badge badge-lg w-100 ${this.state.deviceFilters.license === 'deleted' ? 'bg-secondary' : 'bg-secondary-lt'}" style="cursor: pointer;" onclick=${() => this.setDeviceFilter('license', this.state.deviceFilters.license === 'deleted' ? 'all' : 'deleted')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /></svg>
                                                                        Deleted (${stats.deleted})
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            ${loading ? html`
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-center py-5">
                                            <div class="spinner-border text-primary" role="status"></div>
                                            <div class="mt-3 text-muted">Loading devices...</div>
                                        </div>
                                    </div>
                                </div>
                            ` : error ? html`
                                <div class="card">
                                    <div class="empty">
                                        <div class="empty-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                        </div>
                                        <p class="empty-title">Error loading devices</p>
                                        <p class="empty-subtitle text-muted">${error}</p>
                                        <div class="empty-action">
                                            <button onclick=${() => this.loadDevices()} class="btn btn-primary">
                                                Try Again
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : filteredDevices.length === 0 ? html`
                                <div class="card">
                                    <div class="empty">
                                        <div class="empty-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                        </div>
                                        <p class="empty-title">No devices found</p>
                                        <p class="empty-subtitle text-muted">
                                            Get started by adding your first device to begin monitoring
                                        </p>
                                        <div class="empty-action">
                                            <button class="btn btn-primary">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                                Add Device
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : html`
                                <div class="card">
                                    <div class="table-responsive">
                                        <table class="table table-vcenter card-table">
                                            <thead>
                                                <tr>
                                                    <th style="width: 80px; cursor: pointer;" onclick=${() => this.setSortField('risk')} title="Click to sort by risk score (higher = more vulnerable)">
                                                        <div class="d-flex align-items-center justify-content-center gap-1">
                                                            Risk %
                                                            ${this.state.sortField === 'risk' ? html`
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                    ${this.state.sortAsc ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 15 12 9 18 15" />` : html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 9 12 15 18 9" />`}
                                                                </svg>
                                                            ` : ''}
                                                        </div>
                                                    </th>
                                                    <th style="cursor: pointer;" onclick=${() => this.setSortField('name')}>
                                                        <div class="d-flex align-items-center gap-1">
                                                            Device
                                                            ${this.state.sortField === 'name' ? html`
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                    ${this.state.sortAsc ? html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 15 12 9 18 15" />` : html`<path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="6 9 12 15 18 9" />`}
                                                                </svg>
                                                            ` : ''}
                                                        </div>
                                                    </th>
                                                    <th style="width: 80px;">Apps</th>
                                                    <th style="width: 80px;">CVEs</th>
                                                    <th>License</th>
                                                    <th>Connection</th>
                                                    <th>Specs</th>
                                                    <th class="w-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${filteredDevices.map(device => html`
                                                    <tr key=${device.id}>
                                                        ${(() => {
                                                            const summary = this.state.deviceSummaries[device.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
                                                            const enriched = this.state.enrichedScores[device.id];
                                                            const displayScore = enriched?.score !== undefined ? enriched.score : summary.score || 0;
                                                            const isEnriched = enriched && enriched.score !== (summary.score || 0);
                                                            const scoreColor = displayScore >= 80 ? '#d63939' : displayScore >= 60 ? '#f59f00' : displayScore >= 40 ? '#fab005' : '#2fb344';
                                                            const scoreSeverity = displayScore >= 80 ? 'CRITICAL' : displayScore >= 60 ? 'HIGH' : displayScore >= 40 ? 'MEDIUM' : 'LOW';
                                                            const severityBadge = displayScore >= 80 ? 'bg-danger' : displayScore >= 60 ? 'bg-warning' : displayScore >= 40 ? 'bg-secondary' : 'bg-success';
                                                            return html`
                                                            <!-- Risk Score Column -->
                                                            <td class="text-center">
                                                                <a href="#" onclick=${(e) => { e.preventDefault(); this.openRiskExplanationModal(device); }} style="text-decoration: none; color: inherit;" title="Click to see what drives this risk score">
                                                                    <div style="position: relative; display: inline-block; cursor: pointer;">
                                                                        <svg width="96" height="96" viewBox="0 0 60 60">
                                                                            <circle cx="30" cy="30" r="24" fill="none" stroke="#e9ecef" stroke-width="6"/>
                                                                            <circle cx="30" cy="30" r="24" fill="none"
                                                                                stroke="${scoreColor}"
                                                                                stroke-width="6"
                                                                                stroke-dasharray="${(displayScore / 100 * 150.8).toFixed(2)} 150.8"
                                                                                stroke-linecap="round"
                                                                                transform="rotate(-90 30 30)" />
                                                                            <text x="30" y="34" text-anchor="middle" font-size="14" font-weight="bold" fill="${scoreColor}">${displayScore}</text>
                                                                        </svg>
                                                                        ${isEnriched ? html`<span class="badge bg-success-lt" style="position:absolute;top:-6px;right:-6px;font-size:9px;" title="Enriched with known exploits">✓</span>` : ''}
                                                                        <div class="text-muted small mt-1">Click for details</div>
                                                                    </div>
                                                                </a>
                                                            </td>
                                                            
                                                            <!-- Device Name Column -->
                                                            <td>
                                                                <div class="d-flex flex-column">
                                                                    <a href="#!/devices/${device.id}" class="fw-600 text-primary text-decoration-none">${device.name || device.id}</a>
                                                                    <span class="badge ${severityBadge} text-white mt-1" style="width: fit-content;">${scoreSeverity}</span>
                                                                </div>
                                                            </td>
                                                            
                                                            <!-- Apps Column -->
                                                            <td class="text-center">
                                                                <a href="#" onclick=${(e) => { e.preventDefault(); this.openDeviceModal(device); this.setInventoryTab('apps'); }} style="text-decoration: none; color: inherit;" title="View apps">
                                                                    ${(() => {
                                                                        const totalApps = summary.apps || 0;
                                                                        const vulnApps = summary.vulnerableApps || 0;
                                                                        const angle = totalApps > 0 ? (vulnApps / totalApps) * 360 : 0;
                                                                        const largeArc = angle > 180 ? 1 : 0;
                                                                        const x = 20 + 16 * Math.cos((angle - 90) * Math.PI / 180);
                                                                        const y = 20 + 16 * Math.sin((angle - 90) * Math.PI / 180);
                                                                        return html`
                                                                            <svg width="72" height="72" viewBox="0 0 40 40" style="cursor: pointer;">
                                                                                <circle cx="20" cy="20" r="16" fill="#2fb344"/>
                                                                                ${vulnApps > 0 ? html`<path d="M 20 20 L 20 4 A 16 16 0 ${largeArc} 1 ${x} ${y} Z" fill="#d63939"/>` : ''}
                                                                                <text x="20" y="24" text-anchor="middle" font-size="10" font-weight="bold" fill="white">${vulnApps}/${totalApps}</text>
                                                                            </svg>
                                                                            <div class="text-muted small mt-1">Apps</div>
                                                                        `;
                                                                    })()}
                                                                </a>
                                                            </td>
                                                            
                                                            <!-- CVEs Column -->
                                                            <td class="text-center">
                                                                <a href="#" onclick=${(e) => { e.preventDefault(); this.openDeviceModal(device); this.setInventoryTab('cves'); }} style="text-decoration: none; color: inherit;" title="View CVEs">
                                                                    ${(() => {
                                                                        const crit = summary.criticalCves || 0;
                                                                        const high = summary.highCves || 0;
                                                                        const med = summary.mediumCves || 0;
                                                                        const low = summary.lowCves || 0;
                                                                        const totalCves = crit + high + med + low;
                                                                        if (totalCves === 0) {
                                                                            return html`
                                                                                <svg width="72" height="72" viewBox="0 0 40 40" style="cursor: pointer;">
                                                                                    <circle cx="20" cy="20" r="16" fill="#2fb344"/>
                                                                                    <text x="20" y="24" text-anchor="middle" font-size="10" font-weight="bold" fill="white">0</text>
                                                                                </svg>
                                                                                <div class="text-muted small mt-1">CVEs</div>`;
                                                                        }
                                                                        let currentAngle = 0;
                                                                        const slices = [];
                                                                        const addSlice = (count, color) => {
                                                                            if (count === 0) return;
                                                                            const angle = (count / totalCves) * 360;
                                                                            const largeArc = angle > 180 ? 1 : 0;
                                                                            const startX = 20 + 16 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                            const startY = 20 + 16 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                            currentAngle += angle;
                                                                            const endX = 20 + 16 * Math.cos((currentAngle - 90) * Math.PI / 180);
                                                                            const endY = 20 + 16 * Math.sin((currentAngle - 90) * Math.PI / 180);
                                                                            slices.push(html`<path d="M 20 20 L ${startX} ${startY} A 16 16 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}"/>`);
                                                                        };
                                                                        addSlice(crit, '#d63939');
                                                                        addSlice(high, '#f59f00');
                                                                        addSlice(med, '#fab005');
                                                                        addSlice(low, '#74b816');
                                                                        return html`
                                                                            <svg width="72" height="72" viewBox="0 0 40 40" style="cursor: pointer;">
                                                                                ${slices}
                                                                                <text x="20" y="24" text-anchor="middle" font-size="10" font-weight="bold" fill="white">${totalCves}</text>
                                                                            </svg>
                                                                            <div class="text-muted small mt-1">CVEs</div>`;
                                                                    })()}
                                                                </a>
                                                            </td>
                                                            `;
                                                        })()}
                                                        
                                                        <!-- License Column -->
                                                        <td>
                                                            <div class="d-flex flex-column align-items-start gap-1">
                                                                <span class="badge ${this.getStateBadgeClass(device.state)} text-white">${device.state}</span>
                                                                ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? html`
                                                                    <span class="badge bg-warning-lt" title="Update available: v${config.INSTALLERS.ENGINE.VERSION}">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <circle cx="12" cy="12" r="9" />
                                                                            <line x1="12" y1="8" x2="12" y2="12" />
                                                                            <line x1="12" y1="16" x2="12.01" y2="16" />
                                                                        </svg>
                                                                        Update Available
                                                                    </span>
                                                                ` : ''}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div class="text-muted">${this.formatLastSeen(device.lastHeartbeat)}</div>
                                                            ${this.isDeviceInactive(device) ? html`
                                                                <span class="badge bg-danger-lt mt-1">Offline</span>
                                                            ` : html`
                                                                <span class="badge bg-success-lt mt-1">Online</span>
                                                            `}
                                                            ${device.firstHeartbeat ? html`
                                                                <div class="text-muted small">Registered ${this.formatAbsolute(device.firstHeartbeat)}</div>
                                                            ` : ''}
                                                        </td>
                                                        <td>
                                                            ${device.telemetry ? html`
                                                                <div class="text-muted small">
                                                                    <div class="mb-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <rect x="7" y="7" width="10" height="10" rx="2" />
                                                                            <rect x="10" y="10" width="4" height="4" rx="1" />
                                                                            <path d="M3 10h2" />
                                                                            <path d="M3 14h2" />
                                                                            <path d="M19 10h2" />
                                                                            <path d="M19 14h2" />
                                                                            <path d="M10 3v2" />
                                                                            <path d="M14 3v2" />
                                                                            <path d="M10 19v2" />
                                                                            <path d="M14 19v2" />
                                                                        </svg>
                                                                        ${device.telemetry.cpuName || device.telemetry.cpuArch || ''}
                                                                    </div>
                                                                    <div class="mb-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <rect x="3" y="7" width="18" height="10" rx="2" />
                                                                            <path d="M6 7v10" />
                                                                            <path d="M10 7v10" />
                                                                            <path d="M14 7v10" />
                                                                            <path d="M18 7v10" />
                                                                        </svg>
                                                                        ${device.telemetry.totalRamMb ? Math.round(device.telemetry.totalRamMb/1024) + ' GB' : ''}
                                                                    </div>
                                                                    <div class="mb-1">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <ellipse cx="12" cy="6" rx="8" ry="3"/>
                                                                            <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
                                                                            <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
                                                                        </svg>
                                                                        ${device.telemetry.totalDiskGb ? device.telemetry.totalDiskGb + ' GB' : ''}
                                                                    </div>
                                                                    <div>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <path d="M2 9.5a15 15 0 0 1 20 0" />
                                                                            <path d="M5 13a10 10 0 0 1 14 0" />
                                                                            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
                                                                            <circle cx="12" cy="20" r="1" />
                                                                        </svg>
                                                                        ${device.telemetry.connectionType || ''}
                                                                    </div>
                                                                </div>
                                                            ` : html`<span class="text-muted small">No telemetry yet</span>`}
                                                        </td>
                                                        <td>
                                                            <div class="dropdown">
                                                                <button class="btn btn-sm btn-secondary dropdown-toggle position-relative" type="button" data-bs-toggle="dropdown">
                                                                    Actions
                                                                    ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? html`
                                                                        <span class="badge bg-danger badge-notification badge-blink" style="position: absolute; top: -4px; right: -4px;"></span>
                                                                    ` : ''}
                                                                </button>
                                                                <div class="dropdown-menu dropdown-menu-end" style="min-width: 240px;">
                                                                    <!-- View Device (outside lifecycle) -->
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.openDeviceModal(device)}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="2" /><path d="M22 12a10 10 0 1 0 -20 0a10 10 0 0 0 20 0" /></svg>
                                                                        View Device
                                                                    </button>
                                                                    <div class="dropdown-divider"></div>
                                                                    <!-- Response Actions -->
                                                                    <div class="dropdown-header">Response Actions</div>
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.queueDeviceAction(device, 'On-demand scan')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></svg>
                                                                        Trigger Scan
                                                                    </button>
                                                                    <button type="button" class="dropdown-item ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? 'bg-warning-lt' : ''}" onclick=${() => this.queueDeviceAction(device, 'Force update')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                                                        Trigger Update
                                                                        ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? html`<span class="badge bg-danger ms-2">Update</span>` : ''}
                                                                    </button>
                                                                    <button type="button" class="dropdown-item" onclick=${() => this.queueDeviceAction(device, 'Send message')}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 8l9 4l9 -4l-9 -4z" /><path d="M3 8l0 8l9 4l9 -4l0 -8" /><path d="M3 16l9 4l9 -4" /><path d="M12 12l9 -4" /></svg>
                                                                        Send Message
                                                                    </button>

                                                                    <div class="dropdown-divider"></div>

                                                                    <!-- Device Lifecycle -->
                                                                    <div class="dropdown-header">Device Lifecycle</div>
                                                                    ${this.canEnableDevice(device.state) ? html`
                                                                        <button type="button" class="dropdown-item text-success" onclick=${() => this.enableDevice(device.id)}>
                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                                                            Enable Device
                                                                        </button>
                                                                    ` : ''}
                                                                    ${this.canBlockDevice(device.state) ? html`
                                                                        <button type="button" class="dropdown-item text-warning" onclick=${() => this.blockDevice(device.id, false)} title="Block device, keep telemetry data for analysis">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                                                            Block (Retain Data)
                                                                        </button>
                                                                        <button type="button" class="dropdown-item text-orange" onclick=${() => this.blockDevice(device.id, true)} title="Block device and permanently delete all telemetry data">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="9" y1="12" x2="15" y2="12" /></svg>
                                                                            Block (Purge Data)
                                                                        </button>
                                                                    ` : ''}
                                                                    <button type="button" class="dropdown-item text-danger" title="Delete device and purge all associated data" onclick=${() => this.deleteDevice(device.id)}>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                                                                        Delete Device
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `}

                <!-- Download Warning Modal -->
                ${this.state.showDownloadModal && this.state.downloadTarget ? window.html`
                    <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content" style="z-index: 1056;">
                                <div class="modal-header">
                                    <h5 class="modal-title">Download ${this.state.downloadTarget.name}</h5>
                                    <button type="button" class="btn-close" onclick=${(e) => { e.preventDefault(); this.closeDownloadModal(); }}></button>
                                </div>
                                <div class="modal-body">
                                    <div class="alert alert-warning mb-3">
                                        <div class="d-flex">
                                            <div>
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                    <path d="M12 9v2m0 4v.01" />
                                                    <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 class="alert-title">Security Notice</h4>
                                                <div class="text-muted">${this.state.downloadTarget.warning}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <strong>File:</strong> ${this.state.downloadTarget.name}<br/>
                                        <strong>Size:</strong> ${this.state.downloadTarget.size} MB<br/>
                                        <strong>Architecture:</strong> ${this.state.downloadTarget.arch}
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-link link-secondary" onclick=${(e) => { e.preventDefault(); this.closeDownloadModal(); }}>
                                        Cancel
                                    </button>
                                    <button type="button" class="btn btn-primary" onclick=${(e) => { e.preventDefault(); this.confirmDownload(); }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                            <polyline points="7 11 12 16 17 11" />
                                            <line x1="12" y1="4" x2="12" y2="16" />
                                        </svg>
                                        Continue Download
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
                ` : ''}

                ${this.renderModal()}
                ${this.renderRiskExplanationModal()}
        `;
    }
}
