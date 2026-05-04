/**
 * AppDevicesModal - Shows affected devices and CVEs for a specific application.
 */

import { api } from '@api';
import { metricTitle } from '../utils/metricUnits.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeAppName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\b\d+(?:\.\d+){1,}[\w.-]*\b/g, '')
        .replace(/[^a-z0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildGraphFallback(appName, graphContext) {
    const nodes = Array.isArray(graphContext?.nodes) ? graphContext.nodes : [];
    if (!nodes.length) return null;

    const requested = normalizeAppName(appName);
    const appNode = nodes.find((node) => node.type === 'app' && !/sensitive user data/i.test(String(node.label || '')) && [node.appName, node.routeId, node.label]
        .filter(Boolean)
        .some((value) => {
            const normalized = normalizeAppName(value);
            return normalized && requested && (normalized === requested || normalized.includes(requested) || requested.includes(normalized));
        }));

    if (!appNode) {
        return null;
    }

    const cves = nodes
        .filter((node) => node.type === 'cve')
        .slice(0, 10)
        .map((node) => ({
            cveId: node.cveId || node.label || '',
            severity: node.severity || 'Unknown',
            epss: 0,
            isKev: String(node.severity || '').toLowerCase() === 'critical'
        }));

    const devices = nodes
        .filter((node) => node.type === 'device')
        .map((node) => ({
            deviceId: node.deviceId || '',
            deviceName: node.label || node.deviceId || 'Unknown',
            os: '',
            lastSeen: null,
            cveCount: cves.length || 1
        }));

    return {
        appEntry: {
            appName: appNode.appName || appNode.label || appName,
            deviceCount: devices.length
        },
        devices,
        cves,
        note: 'MAGI is showing path-level evidence from the selected attack path.'
    };
}

export function AppDevicesModal({ appName, orgId, isOpen, onClose, graphContext }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [appEntry, setAppEntry] = useState(null);
    const [devices, setDevices] = useState([]);
    const [cves, setCves] = useState([]);

    useEffect(() => {
        if (isOpen && appName && orgId) {
            loadAppData();
        }
    }, [isOpen, appName, orgId, graphContext]);

    const loadAppData = async () => {
        const graphFallback = buildGraphFallback(appName, graphContext);

        setLoading(!graphFallback);
        setError(null);
        setNotice(graphFallback?.note || null);
        setAppEntry(graphFallback?.appEntry || null);
        setDevices(graphFallback?.devices || []);
        setCves(graphFallback?.cves || []);

        try {
            const withTimeout = (promise, ms = 3500) => Promise.race([
                promise,
                new Promise((resolve) => setTimeout(() => resolve(null), ms))
            ]);

            // Use the unified vulnerabilities page-bundle (same source as the parent page).
            // Bundle returns atoms: cve-list (vulns + review items), device-fleet (id→name),
            // security-snapshot, cve-device-facts. We only need cve-list + device-fleet here.
            const bundleResp = await withTimeout(api.getPageBundle(orgId, 'vulnerabilities').catch(() => null), 3500);

            const atoms = bundleResp?.data?.atoms || {};
            const vulnerabilities = atoms['cve-list']?.data?.filter(r => !r?.isReviewItem) || [];
            const fleetDevices = atoms['device-fleet']?.data || [];
            const requested = normalizeAppName(appName);
            const matches = (Array.isArray(vulnerabilities) ? vulnerabilities : []).filter((item) => {
                const candidate = normalizeAppName(item.appName || item.app || '');
                return candidate && requested && (candidate === requested || candidate.includes(requested) || requested.includes(candidate));
            });

            if (matches.length > 0) {
                const deviceMap = new Map();

                // Seed device map from the page-bundle device-fleet atom first
                // (more authoritative than graph fallback when bundle is fresh).
                for (const device of (Array.isArray(fleetDevices) ? fleetDevices : [])) {
                    if (!device?.deviceId) continue;
                    if (!deviceMap.has(device.deviceId)) {
                        deviceMap.set(device.deviceId, {
                            deviceId: device.deviceId,
                            deviceName: device.deviceName || device.DeviceName || device.deviceId,
                            os: device.os || device.OS || device.osName || '',
                            lastSeen: device.lastSeen || device.LastSeen || null
                        });
                    }
                }

                for (const device of (graphFallback?.devices || [])) {
                    if (!device?.deviceId) continue;
                    if (!deviceMap.has(device.deviceId)) {
                        deviceMap.set(device.deviceId, device);
                    }
                }

                const cveMap = new Map();
                const deviceCveCounts = new Map();

                for (const match of matches) {
                    const cveId = match.cveId || match.CveId || '';
                    if (cveId && !cveMap.has(cveId)) {
                        cveMap.set(cveId, {
                            cveId,
                            severity: match.severity || match.Severity || 'Unknown',
                            epss: match.epss || match.epssProbability || match.EpssProbability || 0,
                            isKev: !!(match.knownExploit || match.isKev || match.KnownExploit || match.IsKev)
                        });
                    }

                    const ids = Array.isArray(match.deviceIds) ? match.deviceIds.filter(Boolean) : [];
                    ids.forEach((id) => {
                        deviceCveCounts.set(id, (deviceCveCounts.get(id) || 0) + 1);
                    });
                }

                let deviceList = Array.from(deviceCveCounts.entries()).map(([id, count]) => {
                    const mapped = deviceMap.get(id) || {};
                    return {
                        deviceId: id,
                        deviceName: mapped.deviceName || id,
                        os: mapped.os || '',
                        lastSeen: mapped.lastSeen || null,
                        cveCount: count
                    };
                });

                if (!deviceList.length && graphFallback?.devices?.length) {
                    deviceList = graphFallback.devices;
                    setNotice(graphFallback.note);
                } else {
                    setNotice(null);
                }

                setAppEntry({
                    appName: matches[0].appName || matches[0].app || appName,
                    deviceCount: deviceList.length || Math.max(...matches.map((item) => Number(item.affectedDevices) || 0), 0)
                });
                setDevices(deviceList);
                setCves(Array.from(cveMap.values()).sort((a, b) => (b.isKev ? 1 : 0) - (a.isKev ? 1 : 0)).slice(0, 10));
            } else if (graphFallback) {
                setAppEntry(graphFallback.appEntry);
                setDevices(graphFallback.devices);
                setCves(graphFallback.cves);
                setNotice(graphFallback.note);
            } else {
                setAppEntry({ appName });
                setDevices([]);
                setCves([]);
                setNotice('No endpoint correlation is currently available for this application in the active signal set.');
            }
        } catch (err) {
            console.error('[AppDevicesModal] Error:', err);
            if (graphFallback) {
                setAppEntry(graphFallback.appEntry);
                setDevices(graphFallback.devices);
                setCves(graphFallback.cves);
                setNotice(graphFallback.note);
            } else {
                setError(err.message || 'Error loading app data');
            }
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
                <div class="modal-content attack-quick-modal">
                    <div class="modal-header attack-quick-modal__header border-bottom">
                        <div>
                            <div class="text-uppercase small fw-semibold opacity-75 mb-1">Officer MAGI application brief</div>
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

                    <div class="modal-body">
                        ${loading && html`
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary mb-3" role="status"></div>
                                <div class="text-muted">Loading app details…</div>
                            </div>
                        `}

                        ${!loading && notice ? html`
                            <div class="alert alert-info mb-3">${notice}</div>
                        ` : null}

                        ${!loading && error ? html`
                            <div class="alert alert-danger">
                                <strong>Error:</strong> ${error}
                            </div>
                        ` : null}

                        ${!loading && !error && html`
                            <div class="mb-4">
                                <h5 class="mb-2">${metricTitle('affectedDevices')} (${devices.length})</h5>
                                ${devices.length > 0 ? html`
                                    <div class="table-responsive">
                                        <table class="table table-sm table-vcenter">
                                            <thead>
                                                <tr>
                                                    <th>Device</th>
                                                    <th>OS</th>
                                                    <th>Last Seen</th>
                                                    <th class="text-end">${metricTitle('uniqueCves')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${devices.map(d => html`
                                                    <tr>
                                                        <td>
                                                            ${d.deviceId ? html`
                                                                <a
                                                                    href=${`#!/devices/${encodeURIComponent(d.deviceId)}`}
                                                                    class="fw-medium"
                                                                    onClick=${onClose}
                                                                >${d.deviceName}</a>
                                                            ` : html`<span class="fw-medium">${d.deviceName}</span>`}
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
                                    <div class="text-muted small">No device data available in the current signal set</div>
                                `}
                            </div>

                            ${cves.length > 0 ? html`
                                <div class="mb-2">
                                    <h5 class="mb-2">${metricTitle('uniqueCves')} (${cves.length})</h5>
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
                            ` : null}
                        `}
                    </div>

                    <div class="modal-footer border-top">
                        <a
                            href="#!/posture"
                            class="btn btn-primary btn-sm"
                            onClick=${onClose}
                        >
                            Open Exposure View →
                        </a>
                        <button type="button" class="btn btn-secondary btn-sm" onClick=${onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
