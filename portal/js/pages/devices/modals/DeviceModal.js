/**
 * DeviceModal - Quick device overview modal
 */
import { formatDate } from '../../device-detail/utils/DateUtils.js';
import { PiiDecryption } from '@utils/piiDecryption.js';
import { renderHealthStatus, renderRiskIndicator, renderPatchStatus, getStatusDotClass, getTrendIcon, getTrendClass } from '../DeviceHealthRenderer.js';

export function renderDeviceModal(component) {
    const { html } = window;
    if (!component.state.showDeviceModal || !component.state.selectedDevice) return null;
    
    return html`
        <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                <div class="modal-content" style="z-index: 1056;">
                    <div class="modal-header">
                        <h5 class="modal-title d-flex align-items-center gap-2 flex-wrap">
                            <a href="#!/devices/${component.state.selectedDevice.id}" class="text-primary fw-600 text-decoration-none" onclick=${(e) => { e.preventDefault(); component.closeDeviceModal(); window.location.hash = `#!/devices/${component.state.selectedDevice.id}`; }}>
                                ${component.state.selectedDevice.name}
                            </a>
                            ${component.state.selectedDevice.state ? html`
                                <span class="badge ${component.getStateBadgeClass(component.state.selectedDevice.state)} text-white">
                                    ${component.state.selectedDevice.state}
                                </span>
                            ` : ''}
                        </h5>
                        <button type="button" class="btn-close" onclick=${(e) => { e.preventDefault(); component.closeDeviceModal(); }}></button>
                    </div>
                    <div class="modal-body">
                        ${component.state.telemetryLoading ? html`
                            <div class="text-center py-4">
                                <div class="spinner-border text-primary" role="status"></div>
                                <div class="mt-3 text-muted">Loading telemetry...</div>
                            </div>
                        ` : component.state.telemetryError ? html`
                            <div class="alert alert-danger">${component.state.telemetryError}</div>
                        ` : component.state.telemetryDetail ? html`
                            <!-- Registered | Last Seen | User row -->
                            <div class="card mb-3">
                                <div class="card-body py-2">
                                    <div class="row g-3 align-items-center text-center">
                                        <div class="col-md-4">
                                            <div class="text-muted small">Registered</div>
                                            <div class="fw-bold">${component.state.selectedDevice.firstHeartbeat ? formatDate(component.state.selectedDevice.firstHeartbeat) : component.state.selectedDevice.firstSeen ? formatDate(component.state.selectedDevice.firstSeen) : component.state.selectedDevice.createdAt ? formatDate(component.state.selectedDevice.createdAt) : '—'}</div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="text-muted small">Last Seen</div>
                                            <div class="fw-bold">${component.state.selectedDevice.lastHeartbeat ? formatDate(component.state.selectedDevice.lastHeartbeat) : component.state.telemetryDetail?.history?.[0]?.timestamp ? formatDate(component.state.telemetryDetail.history[0].timestamp) : 'Never'}</div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="text-muted small">User</div>
                                            ${(() => {
                                                const f = component.state.telemetryDetail?.history?.[0]?.fields || {};
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
                                        <li><strong>OS:</strong> ${component.state.selectedDevice.telemetry?.osEdition || ''} ${component.state.selectedDevice.telemetry?.osVersion || ''} (${component.state.selectedDevice.telemetry?.osBuild || ''})</li>
                                        <li><strong>CPU:</strong> ${component.state.selectedDevice.telemetry?.cpuName || ''} ${component.state.selectedDevice.telemetry?.cpuCores ? '('+component.state.selectedDevice.telemetry.cpuCores+' cores)' : ''}</li>
                                        <li><strong>RAM:</strong> ${component.state.selectedDevice.telemetry?.totalRamMb ? Math.round(component.state.selectedDevice.telemetry.totalRamMb/1024)+' GB' : ''}</li>
                                        <li><strong>Disk:</strong> ${component.state.selectedDevice.telemetry?.totalDiskGb ? component.state.selectedDevice.telemetry.totalDiskGb+' GB' : ''} ${component.state.selectedDevice.telemetry?.systemDiskMediaType || ''} ${component.state.selectedDevice.telemetry?.systemDiskBusType || ''}</li>
                                        <li><strong>Network:</strong> ${component.state.selectedDevice.telemetry?.connectionType || ''} ${component.state.selectedDevice.telemetry?.networkSpeedMbps ? component.state.selectedDevice.telemetry.networkSpeedMbps+' Mbps' : ''}</li>
                                        <li><strong>IP:</strong> ${(() => {
                                            const raw = component.state.selectedDevice.telemetry?.ipAddresses || component.state.selectedDevice.telemetry?.IPAddresses;
                                            const ips = Array.isArray(raw)
                                                ? raw
                                                : (typeof raw === 'string'
                                                    ? (() => {
                                                        try {
                                                            const parsed = JSON.parse(raw);
                                                            if (Array.isArray(parsed)) return parsed;
                                                        } catch (e) { /* fallback to delimiter split */ }
                                                        return raw.split(/[;,\s]+/).filter(Boolean);
                                                    })()
                                                    : []);
                                            if (!ips || ips.length === 0) return 'No IP';
                                            const primary = ips[0];
                                            const count = ips.length;
                                            if (count > 1) {
                                                return html`${primary} <span class="badge badge-sm bg-azure-lt text-azure ms-1">(+${count - 1})</span>`;
                                            }
                                            return primary;
                                        })()}</li>
                                    </ul>
                                </div>
                                <div class="col-md-5">
                                    <h5>Security Status</h5>
                                    ${(() => {
                                        const health = renderHealthStatus(component.state.selectedDevice);
                                        const risk = renderRiskIndicator(component.state.selectedDevice);
                                        const patch = renderPatchStatus(component.state.selectedDevice);
                                        const patchBadgeClass = patch.badge === 'bg-success-lt' ? 'bg-success-lt text-success'
                                            : patch.badge === 'bg-info-lt' ? 'bg-info-lt text-info'
                                            : patch.badge === 'bg-warning-lt' ? 'bg-warning-lt text-warning'
                                            : patch.badge === 'bg-danger-lt' ? 'bg-danger-lt text-danger'
                                            : patch.badge;
                                        const riskTrend = Number.isFinite(risk.trend7d) ? risk.trend7d : 0;
                                        const summary = component.state.deviceSummaries[component.state.selectedDevice.id] || { apps: 0, cves: 0, vulnerableApps: 0, criticalCves: 0, highCves: 0, mediumCves: 0, lowCves: 0, worstSeverity: 'LOW', score: 0 };
                                        const displayScore = (component.state.enrichedScores[component.state.selectedDevice.id]?.score ?? summary.score ?? 0);
                                        return html`
                                            <div class="d-flex flex-column gap-3">
                                                <div class="d-flex flex-wrap gap-2 align-items-center">
                                                    <span class="badge ${health.status === 'online' ? 'bg-success-lt text-success' : health.status === 'stale' ? 'bg-warning-lt text-warning' : health.status === 'offline' ? 'bg-danger-lt text-danger' : health.status === 'blocked' ? 'bg-dark-lt text-dark' : 'bg-secondary-lt text-secondary'}">
                                                        <span class="${getStatusDotClass(component.state.selectedDevice.health)} me-1"></span>
                                                        ${health.text}
                                                    </span>
                                                    <span class="badge ${risk.badge || 'bg-secondary'} text-white">
                                                        ${risk.severity || 'LOW'} · ${Math.round(Number.isFinite(risk.score) ? risk.score : displayScore)}%
                                                    </span>
                                                    ${patch.percent !== null ? html`
                                                        <span class="badge ${patchBadgeClass}">${Math.round(patch.percent)}% patched</span>
                                                    ` : html`
                                                        <span class="badge bg-secondary-lt text-secondary">No patch data</span>
                                                    `}
                                                    <span class="text-muted small ${getTrendClass(riskTrend)}">${getTrendIcon(riskTrend)} ${Math.abs(Math.round(riskTrend))} (7d)</span>
                                                </div>
                                                <div class="d-flex align-items-start gap-3 flex-wrap" style="cursor: pointer;" onclick=${(e) => { e.preventDefault(); component.openRiskExplanationModal(component.state.selectedDevice); }} title="Click to see what drives this risk score">
                                                    <div style="width: 88px; height: 88px;" ref=${(el) => { component.riskChartEl = el; }}></div>
                                                    <div class="d-flex flex-column gap-1 align-items-start" style="min-width: 140px;">
                                                        <div class="d-flex align-items-center gap-2">
                                                            <span class="text-muted small">Risk Score:</span>
                                                            <span class="badge ${summary.worstSeverity === 'CRITICAL' ? 'bg-danger-lt text-danger' : summary.worstSeverity === 'HIGH' ? 'bg-warning-lt text-warning' : summary.worstSeverity === 'MEDIUM' ? 'bg-secondary-lt text-secondary' : 'bg-success-lt text-success'}">${summary.worstSeverity}</span>
                                                        </div>
                                                        <div class="text-muted small">Click for details</div>
                                                    </div>
                                                </div>
                                                <div class="d-flex gap-4 justify-content-center">
                                                    <div class="text-center">
                                                        <div style="width: 68px; height: 68px;" ref=${(el) => { component.appsChartEl = el; }}></div>
                                                        <div class="text-muted small">Apps</div>
                                                    </div>
                                                    <div class="text-center">
                                                        <div style="width: 68px; height: 68px;" ref=${(el) => { component.cvesChartEl = el; }}></div>
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
                                ${component.state.telemetryDetail?.changes && component.state.telemetryDetail.changes.length > 0 ? html`
                                    <div class="timeline timeline-simple">
                                        ${component.state.telemetryDetail.changes.slice(0,5).map(change => html`
                                            <div class="timeline-event">
                                                <div class="timeline-event-icon bg-yellow-lt"></div>
                                                <div class="timeline-event-content">
                                                    <div class="text-muted small">${formatDate(change.at)}</div>
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
                        <a class="btn btn-primary" href="#!/devices/${component.state.selectedDevice.id}" onclick=${(e) => { e.preventDefault(); component.closeDeviceModal(); window.location.hash = `#!/devices/${component.state.selectedDevice.id}`; }}>
                            Open Device Details
                        </a>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
    `;
}
