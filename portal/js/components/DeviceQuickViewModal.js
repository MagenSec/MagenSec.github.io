/**
 * DeviceQuickViewModal - Lightweight device summary modal
 * Opened when clicking [![DEVICE-NAME](#!/devices/{deviceId})] links in AI analyst output.
 * Shows device status, top vulnerable apps, and top CVEs without leaving the page.
 */

import { api } from '@api';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function uniqueValues(values = []) {
    return Array.from(new Set(
        values
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    ));
}

function isLikelySyntheticDeviceId(value) {
    const text = String(value || '').trim();
    return !text
        || /^\d+-device-\d+$/i.test(text)
        || /^device-\d+$/i.test(text)
        || /^peer-\d+$/i.test(text)
        || /^route-\d+$/i.test(text)
        || /^chain-\d+$/i.test(text);
}

function buildRouteFallback(deviceId, deviceLabel, graphContext) {
    const nodes = Array.isArray(graphContext?.nodes) ? graphContext.nodes : [];
    if (!nodes.length) return null;

    const target = normalizeText(deviceLabel || deviceId);
    const deviceNode = nodes.find((node) => node.type === 'device' && [node.deviceId, node.routeId, node.label, node.id]
        .filter(Boolean)
        .some((value) => {
            const normalized = normalizeText(value);
            return normalized && target && (normalized === target || normalized.includes(target) || target.includes(normalized));
        }));

    const appNodes = nodes.filter((node) => node.type === 'app' && !/sensitive user data/i.test(String(node.label || '')));
    const cveNodes = nodes.filter((node) => node.type === 'cve');

    if (!deviceNode && appNodes.length === 0 && cveNodes.length === 0) {
        return null;
    }

    const cves = cveNodes.slice(0, 5).map((node) => ({
        cveId: node.cveId || node.label || '',
        severity: node.severity || 'Unknown',
        epss: 0,
        isKev: String(node.severity || '').toLowerCase() === 'critical',
        appName: appNodes[0]?.appName || appNodes[0]?.label || ''
    }));

    const apps = appNodes.slice(0, 5).map((node) => ({
        appName: node.appName || node.label || 'Unknown',
        version: '',
        cveCount: cves.length || 1
    }));

    return {
        device: {
            deviceId: deviceNode?.deviceId || deviceId || null,
            deviceName: deviceNode?.label || deviceLabel || deviceId || 'Endpoint',
            source: 'route'
        },
        apps,
        cves,
        note: 'MAGI is showing path-level evidence while the full endpoint record is still being resolved.'
    };
}

export function DeviceQuickViewModal({ deviceId, deviceLabel, graphContext, orgId, isOpen, onClose }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [resolvedDeviceId, setResolvedDeviceId] = useState(null);
    const [deviceData, setDeviceData] = useState(null);
    const [apps, setApps] = useState([]);
    const [cves, setCves] = useState([]);

    useEffect(() => {
        if (isOpen && (deviceId || deviceLabel) && orgId) {
            loadDevice();
        }
    }, [isOpen, deviceId, deviceLabel, graphContext, orgId]);

    const loadDevice = async () => {
        const routeFallback = buildRouteFallback(deviceId, deviceLabel, graphContext);

        setLoading(!routeFallback);
        setError(null);
        setNotice(routeFallback?.note || null);
        setResolvedDeviceId(null);
        setDeviceData(routeFallback?.device || null);
        setApps(routeFallback?.apps || []);
        setCves(routeFallback?.cves || []);

        try {
            const candidateIds = uniqueValues([
                deviceId,
                routeFallback?.device?.deviceId
            ]).filter((value) => !isLikelySyntheticDeviceId(value));

            let resp = null;
            let lastError = null;

            for (const candidateId of candidateIds) {
                try {
                    const attempt = await Promise.race([
                        api.getDeviceDetailUnified(orgId, candidateId, {
                            include: 'summary,apps,cves',
                            includeSummary: true,
                            appLimit: 10,
                            cveLimit: 10
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Device detail request timed out')), 3500))
                    ]);

                    if (attempt?.success && attempt?.data?.device) {
                        resp = attempt;
                        setResolvedDeviceId(candidateId);
                        break;
                    }
                } catch (err) {
                    lastError = err;
                }
            }

            if (resp?.success && resp?.data) {
                const device = resp.data.device || {};
                const appsRaw = resp.data.apps?.items || resp.data.apps || [];
                const cvesRaw = resp.data.cves?.items || resp.data.cves || [];

                setDeviceData(device);
                setNotice(null);

                const appList = (Array.isArray(appsRaw) ? appsRaw : [])
                    .map((app) => ({
                        appName: app.appName || app.AppName || 'Unknown',
                        version: app.applicationVersion || app.ApplicationVersion || '',
                        cveCount: Number(app.cveCount || app.CveCount || 0)
                    }))
                    .filter((app) => app.cveCount > 0)
                    .slice(0, 5);
                setApps(appList);

                const cveList = (Array.isArray(cvesRaw) ? cvesRaw : [])
                    .map((cve) => ({
                        cveId: cve.cveId || cve.CveId || '',
                        severity: cve.severity || cve.Severity || 'Unknown',
                        epss: cve.epssProbability || cve.epss || cve.EpssProbability || 0,
                        isKev: !!(cve.knownExploit || cve.KnownExploit || cve.isExploited || cve.IsExploited || cve.hasExploit || cve.HasExploit),
                        appName: cve.appName || cve.AppName || ''
                    }))
                    .sort((a, b) => (b.isKev ? 1 : 0) - (a.isKev ? 1 : 0))
                    .slice(0, 5);
                setCves(cveList);
            } else if (routeFallback) {
                setDeviceData(routeFallback.device);
                setApps(routeFallback.apps);
                setCves(routeFallback.cves);
                if (lastError) {
                    setNotice('Showing path-level evidence because the full device record is not available for this node yet.');
                }
            } else {
                setError(lastError?.message || 'Device details are unavailable for this route.');
            }
        } catch (err) {
            console.error('[DeviceQuickViewModal] Error:', err);
            const routeFallback = buildRouteFallback(deviceId, deviceLabel, graphContext);
            if (routeFallback) {
                setDeviceData(routeFallback.device);
                setApps(routeFallback.apps);
                setCves(routeFallback.cves);
                setNotice(routeFallback.note);
            } else {
                setError(err.message || 'Error loading device');
            }
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getStatusBadge = (device) => {
        if (device?.source === 'route' || device?.Source === 'route') {
            return html`<span class="badge bg-info-lt text-info">Route evidence</span>`;
        }
        const state = (device?.State || device?.state || '').toLowerCase();
        const blocked = device?.IsBlocked || device?.isBlocked;
        if (blocked) return html`<span class="badge bg-danger-lt text-danger">Blocked</span>`;
        if (state === 'online') return html`<span class="badge bg-success-lt text-success">Online</span>`;
        if (state === 'active' || state === 'enabled') return html`<span class="badge bg-primary-lt text-primary">Active</span>`;
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
        ? (deviceData.DeviceName || deviceData.deviceName || deviceData.HostName || deviceData.hostName || deviceLabel || deviceId)
        : (deviceLabel || deviceId);

    const os = deviceData ? (deviceData.OSName || deviceData.osName || deviceData.OS || deviceData.os || '') : '';
    const lastSeen = deviceData ? (deviceData.LastSeen || deviceData.lastSeen) : null;
    const detailHref = resolvedDeviceId || deviceData?.DeviceId || deviceData?.deviceId;

    return html`
        <div
            class="modal show d-block"
            style="background-color: rgba(0,0,0,0.5);"
            onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div class="modal-dialog modal-dialog-scrollable" style="max-width: 540px;">
                <div class="modal-content attack-quick-modal">
                    <div class="modal-header attack-quick-modal__header border-bottom">
                        <div>
                            <div class="text-uppercase small fw-semibold opacity-75 mb-1">Officer MAGI endpoint brief</div>
                            <h4 class="modal-title mb-1">${deviceName}</h4>
                            <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
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

                    <div class="modal-body">
                        ${loading && html`
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary mb-3" role="status"></div>
                                <div class="text-muted">Loading device details…</div>
                            </div>
                        `}

                        ${!loading && notice ? html`
                            <div class="alert alert-info mb-3">
                                ${notice}
                            </div>
                        ` : null}

                        ${!loading && error ? html`
                            <div class="alert alert-danger">
                                <strong>Error:</strong> ${error}
                            </div>
                        ` : null}

                        ${!loading && !error && html`
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
                                                        <td class="text-muted small">${cve.appName || '—'}</td>
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

                    <div class="modal-footer border-top">
                        ${detailHref ? html`
                            <a
                                href=${`#!/devices/${encodeURIComponent(detailHref)}`}
                                class="btn btn-primary btn-sm"
                                onClick=${onClose}
                            >
                                Open Device Record →
                            </a>
                        ` : null}
                        <button type="button" class="btn btn-secondary btn-sm" onClick=${onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
