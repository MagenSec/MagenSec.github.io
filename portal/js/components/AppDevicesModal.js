/**
 * AppDevicesModal - Shows affected devices and CVEs for a specific application
 * Opened when clicking [AppName](#!/apps/{appName}) links in AI analyst output.
 * Helps user understand "why patch this app" — shows real device hostnames and CVE context.
 *
 * Props:
 *   appName {string} - application name from portal link
 *   orgId   {string} - current org ID
 *   isOpen  {bool}   - visibility flag
 *   onClose {func}   - called when user dismisses modal
 */

import { api } from '@api';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function AppDevicesModal({ appName, orgId, isOpen, onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [appEntry, setAppEntry] = useState(null);
    const [devices, setDevices] = useState([]);
    const [cves, setCves] = useState([]);

    useEffect(() => {
        if (isOpen && appName && orgId) {
            loadAppData();
        }
    }, [isOpen, appName, orgId]);

    const loadAppData = async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await api.getPostureSnapshot(orgId);
            if (resp.success && resp.data) {
                const snapshot = resp.data;

                // Search topVulnerableApps for this app name (case-insensitive partial match)
                const topApps = snapshot.topVulnerableApps || snapshot.TopVulnerableApps || [];
                const found = topApps.find(a =>
                    (a.appName || a.AppName || '').toLowerCase().includes(appName.toLowerCase())
                );

                if (found) {
                    setAppEntry(found);

                    const deviceList = (found.devices || found.Devices || []).map(d => ({
                        deviceId: d.deviceId || d.DeviceId || '',
                        deviceName: d.deviceName || d.DeviceName || d.hostName || d.HostName || d.deviceId || 'Unknown',
                        os: d.os || d.OS || d.osName || d.OSName || '',
                        lastSeen: d.lastSeen || d.LastSeen || null,
                        cveCount: d.cveCount || d.CveCount || 0
                    }));
                    setDevices(deviceList);

                    const cveList = (found.cves || found.Cves || found.topCves || []).map(c => ({
                        cveId: c.cveId || c.CveId || '',
                        severity: c.severity || c.Severity || 'Unknown',
                        epss: c.epssProbability || c.epss || c.EpssProbability || 0,
                        isKev: !!(c.isExploited || c.IsExploited || c.hasExploit || c.HasExploit)
                    })).sort((a, b) => (b.isKev ? 1 : 0) - (a.isKev ? 1 : 0));
                    setCves(cveList);
                } else {
                    // App not found in snapshot — show a helpful empty state
                    setAppEntry({ appName });
                    setDevices([]);
                    setCves([]);
                }
            } else {
                setError(resp.message || 'Failed to load posture data');
            }
        } catch (err) {
            setError(err.message || 'Error loading app data');
            console.error('[AppDevicesModal] Error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

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

    const resolvedName = appEntry ? (appEntry.appName || appEntry.AppName || appName) : appName;
    const deviceCount = devices.length || (appEntry ? (appEntry.deviceCount || appEntry.DeviceCount || 0) : 0);

    return html`
        <div
            class="modal show d-block"
            style="background-color: rgba(0,0,0,0.5);"
            onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <!-- Header -->
                    <div class="modal-header bg-light border-bottom">
                        <div>
                            <h4 class="modal-title mb-1">${resolvedName}</h4>
                            <div class="text-muted small">
                                ${deviceCount} device${deviceCount !== 1 ? 's' : ''} affected
                                ${cves.some(c => c.isKev) ? html`
                                    <span class="badge bg-danger text-white ms-2">KEV — actively exploited</span>
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
                                <div class="text-muted">Loading app details…</div>
                            </div>
                        `}

                        ${error && html`
                            <div class="alert alert-danger">
                                <strong>Error:</strong> ${error}
                            </div>
                        `}

                        ${!loading && !error && html`
                            <!-- Affected Devices -->
                            <div class="mb-4">
                                <h5 class="mb-2">Affected Devices</h5>
                                ${devices.length > 0 ? html`
                                    <div class="table-responsive">
                                        <table class="table table-sm table-vcenter">
                                            <thead>
                                                <tr>
                                                    <th>Device</th>
                                                    <th>OS</th>
                                                    <th>Last Seen</th>
                                                    <th class="text-end">CVEs</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${devices.map(d => html`
                                                    <tr>
                                                        <td>
                                                            <a
                                                                href=${`#!/devices/${d.deviceId}`}
                                                                class="fw-medium"
                                                                onClick=${onClose}
                                                            >${d.deviceName}</a>
                                                        </td>
                                                        <td class="text-muted small">${d.os || '—'}</td>
                                                        <td class="text-muted small">
                                                            ${d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : '—'}
                                                        </td>
                                                        <td class="text-end">
                                                            ${d.cveCount > 0
                                                                ? html`<span class="badge bg-danger-lt text-danger">${d.cveCount}</span>`
                                                                : html`<span class="text-muted">—</span>`}
                                                        </td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                ` : html`
                                    <div class="text-muted small">No device data available in current snapshot</div>
                                `}
                            </div>

                            <!-- Associated CVEs -->
                            ${cves.length > 0 ? html`
                                <div class="mb-2">
                                    <h5 class="mb-2">Associated CVEs</h5>
                                    <div class="table-responsive">
                                        <table class="table table-sm table-vcenter">
                                            <thead>
                                                <tr>
                                                    <th>CVE</th>
                                                    <th>Severity</th>
                                                    <th>EPSS</th>
                                                    <th>Exploit</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${cves.map(cve => html`
                                                    <tr>
                                                        <td class="fw-medium small">${cve.cveId}</td>
                                                        <td>
                                                            <span class="badge ${getSeverityClass(cve.severity)}">${cve.severity}</span>
                                                        </td>
                                                        <td class="text-muted small">${formatEpss(cve.epss)}</td>
                                                        <td>
                                                            ${cve.isKev
                                                                ? html`<span class="badge bg-danger text-white" title="Known Exploited Vulnerability — CISA KEV">KEV</span>`
                                                                : html`<span class="text-muted small">—</span>`}
                                                        </td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ` : ''}
                        `}
                    </div>

                    <!-- Footer -->
                    <div class="modal-footer border-top">
                        <a
                            href="#!/posture"
                            class="btn btn-primary btn-sm"
                            onClick=${onClose}
                        >
                            View Posture Report →
                        </a>
                        <button type="button" class="btn btn-secondary btn-sm" onClick=${onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
