/**
 * DeviceQuickViewModal - Lightweight device summary modal
 * Opened when clicking [![DEVICE-NAME](#!/devices/{deviceId})] links in AI analyst output.
 * Shows device status, top vulnerable apps, and top CVEs without leaving the page.
 *
 * Props:
 *   deviceId {string} - device ID from portal link
 *   orgId    {string} - current org ID
 *   isOpen   {bool}   - visibility flag
 *   onClose  {func}   - called when user dismisses modal
 */

import { api } from '@api';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function DeviceQuickViewModal({ deviceId, orgId, isOpen, onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deviceData, setDeviceData] = useState(null);
    const [apps, setApps] = useState([]);
    const [cves, setCves] = useState([]);

    useEffect(() => {
        if (isOpen && deviceId && orgId) {
            loadDevice();
        }
    }, [isOpen, deviceId, orgId]);

    const loadDevice = async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await api.getDeviceDetailUnified(orgId, deviceId, {
                include: 'apps,cves',
                appLimit: 10,
                cveLimit: 10
            });
            if (resp.success && resp.data) {
                const { device, apps: appsRaw, cves: cvesRaw } = resp.data;
                setDeviceData(device || {});

                const appList = (Array.isArray(appsRaw) ? appsRaw : []).map(a => ({
                    appName: a.appName || a.AppName || 'Unknown',
                    version: a.applicationVersion || a.ApplicationVersion || '',
                    cveCount: a.cveCount || a.CveCount || 0
                })).filter(a => a.cveCount > 0).slice(0, 5);
                setApps(appList);

                const cveList = (Array.isArray(cvesRaw) ? cvesRaw : []).map(c => ({
                    cveId: c.cveId || c.CveId || '',
                    severity: c.severity || c.Severity || 'Unknown',
                    epss: c.epssProbability || c.epss || c.EpssProbability || 0,
                    isKev: !!(c.isExploited || c.IsExploited || c.hasExploit || c.HasExploit),
                    appName: c.appName || c.AppName || ''
                }))
                .sort((a, b) => (b.isKev ? 1 : 0) - (a.isKev ? 1 : 0))
                .slice(0, 5);
                setCves(cveList);
            } else {
                setError(resp.message || 'Failed to load device details');
            }
        } catch (err) {
            setError(err.message || 'Error loading device');
            console.error('[DeviceQuickViewModal] Error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getStatusBadge = (device) => {
        const state = (device.State || device.state || '').toLowerCase();
        const blocked = device.IsBlocked || device.isBlocked;
        if (blocked) return html`<span class="badge bg-danger-lt text-danger">Blocked</span>`;
        if (state === 'online') return html`<span class="badge bg-success-lt text-success">Online</span>`;
        return html`<span class="badge bg-secondary-lt text-secondary">Offline</span>`;
    };

    const getSeverityClass = (severity) => {
        const s = String(severity || '').toLowerCase();
        if (s === 'critical') return 'bg-danger-lt text-danger';
        if (s === 'high') return 'bg-warning-lt text-warning';
        if (s === 'medium' || s === 'moderate') return 'bg-info-lt text-info';
        return 'bg-success-lt text-success';
    };

    const formatEpss = (val) => {
        if (!val && val !== 0) return '';
        const pct = typeof val === 'number' && val <= 1 ? val * 100 : val;
        return `${pct.toFixed(0)}%`;
    };

    const deviceName = deviceData
        ? (deviceData.DeviceName || deviceData.deviceName || deviceData.HostName || deviceData.hostName || deviceId)
        : deviceId;

    const os = deviceData ? (deviceData.OSName || deviceData.osName || deviceData.OS || deviceData.os || '') : '';
    const lastSeen = deviceData ? (deviceData.LastSeen || deviceData.lastSeen) : null;

    return html`
        <div
            class="modal show d-block"
            style="background-color: rgba(0,0,0,0.5);"
            onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div class="modal-dialog modal-dialog-scrollable" style="max-width: 540px;">
                <div class="modal-content">
                    <!-- Header -->
                    <div class="modal-header bg-light border-bottom">
                        <div>
                            <h4 class="modal-title mb-1">${deviceName}</h4>
                            <div class="d-flex align-items-center gap-2 mt-1">
                                ${deviceData ? getStatusBadge(deviceData) : ''}
                                ${os ? html`<span class="text-muted small">${os}</span>` : ''}
                                ${lastSeen ? html`
                                    <span class="text-muted small">
                                        Last seen: ${new Date(lastSeen).toLocaleDateString()}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn-close" aria-label="Close" onClick=${onClose}></button>
                    </div>

                    <!-- Body -->
                    <div class="modal-body">
                        ${loading && html`
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary mb-3" role="status"></div>
                                <div class="text-muted">Loading device details…</div>
                            </div>
                        `}

                        ${error && html`
                            <div class="alert alert-danger">
                                <strong>Error:</strong> ${error}
                            </div>
                        `}

                        ${!loading && !error && html`
                            <!-- Top Vulnerable Apps -->
                            <div class="mb-4">
                                <h5 class="mb-2">Top Vulnerable Applications</h5>
                                ${apps.length > 0 ? html`
                                    <div class="list-group list-group-sm">
                                        ${apps.map(app => html`
                                            <div class="list-group-item">
                                                <div class="d-flex align-items-center justify-content-between">
                                                    <div>
                                                        <div class="fw-medium">${app.appName}</div>
                                                        ${app.version ? html`<div class="text-muted small">${app.version}</div>` : ''}
                                                    </div>
                                                    <span class="badge bg-danger-lt text-danger">${app.cveCount} CVE${app.cveCount !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                        `)}
                                    </div>
                                ` : html`
                                    <div class="text-muted small">No vulnerable applications detected</div>
                                `}
                            </div>

                            <!-- Top CVEs -->
                            <div class="mb-2">
                                <h5 class="mb-2">Top CVEs</h5>
                                ${cves.length > 0 ? html`
                                    <div class="table-responsive">
                                        <table class="table table-sm table-vcenter">
                                            <thead>
                                                <tr>
                                                    <th>CVE</th>
                                                    <th>Severity</th>
                                                    <th>EPSS</th>
                                                    <th>App</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${cves.map(cve => html`
                                                    <tr>
                                                        <td>
                                                            <div class="d-flex align-items-center gap-1">
                                                                <span class="small fw-medium">${cve.cveId}</span>
                                                                ${cve.isKev ? html`<span class="badge bg-danger text-white" title="Known Exploited Vulnerability">KEV</span>` : ''}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span class="badge ${getSeverityClass(cve.severity)}">${cve.severity}</span>
                                                        </td>
                                                        <td class="text-muted small">${formatEpss(cve.epss)}</td>
                                                        <td class="text-muted small">${cve.appName}</td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                ` : html`
                                    <div class="text-muted small">No CVEs detected</div>
                                `}
                            </div>
                        `}
                    </div>

                    <!-- Footer -->
                    <div class="modal-footer border-top">
                        <a
                            href=${`#!/devices/${deviceId}`}
                            class="btn btn-primary btn-sm"
                            onClick=${onClose}
                        >
                            View Full Details →
                        </a>
                        <button type="button" class="btn btn-secondary btn-sm" onClick=${onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
