/**
 * Attack Chain Page
 *
 * Displays AI-generated attack chain graphs via D3 force-directed layout.
 * Data is sourced from the OrgSnapshot's AttackChain property.
 * Manual refresh calls POST /api/v1/orgs/{orgId}/ai/attack-chain/refresh.
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { AttackChainGraph } from '../../components/AttackChainGraph.js';
import { CveDetailsModal } from '../../components/CveDetailsModal.js';
import { DeviceQuickViewModal } from '../../components/DeviceQuickViewModal.js';
import { AppDevicesModal } from '../../components/AppDevicesModal.js';
import { TACTICS, lookupTechnique } from '../../data/mitre-ttp-catalog.js';

const { html, Component } = window;

export class AttackChainPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            refreshing: false,
            error: null,
            dataHint: null,
            snapshot: null,
            attackChain: null,
            selectedGraph: null,
            showNarrative: true,
            showRouteIntel: false,
            modalCveId: null,
            modalDeviceId: null,
            modalDeviceLabel: null,
            modalAppName: null,
            modalGraphContext: null,
        };
        this._orgUnsub = null;
        this._rewindUnsub = null;
    }

    getCacheKey(orgId) {
        return `attack-chain:${orgId}`;
    }

    readCachedChain(orgId) {
        if (!orgId) return null;
        try {
            const raw = localStorage.getItem(this.getCacheKey(orgId));
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    writeCachedChain(orgId, chain) {
        if (!orgId || !chain) return;
        try {
            localStorage.setItem(this.getCacheKey(orgId), JSON.stringify(chain));
        } catch {
            // best effort only
        }
    }

    componentDidMount() {
        this._orgUnsub = orgContext.onChange(() => this.loadData());
        this._rewindUnsub = rewindContext.onChange(() => this.loadData());
        this.loadData();
    }

    componentWillUnmount() {
        if (this._orgUnsub) this._orgUnsub();
        if (this._rewindUnsub) this._rewindUnsub();
    }

    async loadData() {
        const org = orgContext.getCurrentOrg();
        if (!org) return;

        this.setState({ loading: true, error: null });

        try {
            // Phase 6: bundle-first read. attack-chain bundle composes
            // org-snapshot (carries .attackChain + .deviceFleet) and
            // security-snapshot (carries .top20Devices) atoms.
            const resp = await api.getPageBundle(org.orgId, 'attack-chain');
            const bundleData = resp?.data || resp?.Data || resp;
            const atoms = bundleData?.atoms || bundleData?.Atoms || {};
            const orgSnap = atoms['org-snapshot']?.data?.[0] || atoms.OrgSnapshot?.data?.[0] || null;
            const secSnap = atoms['security-snapshot']?.data?.[0] || atoms.SecuritySnapshot?.data?.[0] || null;
            const snapshot = {
                ...(orgSnap || {}),
                top20Devices: secSnap?.top20Devices || secSnap?.Top20Devices || [],
            };
            const liveChain = orgSnap?.attackChain || orgSnap?.AttackChain || null;
            const cachedChain = this.readCachedChain(org.orgId);
            const liveKey = liveChain?.chainKey || liveChain?.ChainKey || null;
            const cachedKey = cachedChain?.chainKey || cachedChain?.ChainKey || null;
            const chain = liveChain || (!liveKey || !cachedKey || liveKey === cachedKey ? cachedChain : null);

            if (chain) {
                this.writeCachedChain(org.orgId, chain);
            }

            this.setState({
                loading: false,
                error: null,
                dataHint: chain?.note || chain?.Note || null,
                snapshot,
                attackChain: chain,
                selectedGraph: chain?.graphs?.[0] ?? null,
            });

            // Auto-generate if no chain available (first visit or blob migration)
            if (!chain && !this.state.refreshing) {
                this.handleRefresh();
            }
        } catch (err) {
            this.setState({ loading: false, error: err.message });
        }
    }

    async handleRefresh() {
        const org = orgContext.getCurrentOrg();
        if (!org || this.state.refreshing) return;

        this.setState({ refreshing: true });

        try {
            const resp = await api.refreshAttackChain(org.orgId);
            const data = resp?.data || resp?.Data;
            if (data) {
                this.writeCachedChain(org.orgId, data);
                this.setState({
                    refreshing: false,
                    error: null,
                    dataHint: data?.note || data?.Note || null,
                    attackChain: data,
                    selectedGraph: data?.graphs?.[0] ?? null,
                });
            } else {
                this.setState({ refreshing: false });
                this.loadData();
            }
        } catch (err) {
            this.setState({
                refreshing: false,
                error: err.message,
                dataHint: err.message,
            });
        }
    }

    normalizeValue(value) {
        return String(value || '').trim().toLowerCase();
    }

    extractSnapshotDevices() {
        const snapshot = this.state.snapshot || {};
        const buckets = [
            snapshot.recentDevices,
            snapshot.RecentDevices,
            snapshot.topDevices,
            snapshot.TopDevices,
            snapshot.top20Devices,
            snapshot.Top20Devices,
            snapshot.deviceFleet,
            snapshot.DeviceFleet,
            snapshot.devices?.items,
            snapshot.Devices?.Items,
            snapshot.devices,
            snapshot.Devices
        ].filter(Array.isArray);

        return buckets.flat().map((device) => ({
            deviceId: device?.deviceId || device?.DeviceId || device?.id || null,
            deviceName: device?.deviceName || device?.DeviceName || device?.name || device?.Name || device?.hostName || device?.HostName || null
        })).filter((device) => device.deviceId || device.deviceName);
    }

    findGraphForNode(node) {
        const graphs = this.state.attackChain?.graphs || [];
        const keys = [node?.id, node?.routeId, node?.deviceId, node?.appName, node?.cveId, node?.label]
            .filter(Boolean)
            .map((value) => this.normalizeValue(value));

        return graphs.find((graph) => (graph?.nodes || []).some((candidate) => {
            const candidateKeys = [candidate?.id, candidate?.routeId, candidate?.deviceId, candidate?.appName, candidate?.cveId, candidate?.label]
                .filter(Boolean)
                .map((value) => this.normalizeValue(value));
            return candidateKeys.some((value) => keys.includes(value));
        })) || this.state.selectedGraph || null;
    }

    resolveDeviceModalTarget(node, graphContext) {
        const label = node?.label || node?.deviceId || node?.routeId || node?.id || 'Endpoint';
        const directCandidates = [node?.deviceId, node?.routeId, node?.id]
            .filter(Boolean)
            .map((value) => String(value).trim())
            .filter((value) => value && !/^\d+-device-\d+$/i.test(value) && !/^device-\d+$/i.test(value));

        const snapshotMatch = this.extractSnapshotDevices().find((device) => {
            const deviceName = this.normalizeValue(device.deviceName);
            const deviceId = this.normalizeValue(device.deviceId);
            const target = this.normalizeValue(label);
            return (target && deviceName && (deviceName === target || deviceName.includes(target) || target.includes(deviceName)))
                || directCandidates.some((candidate) => this.normalizeValue(candidate) === deviceId);
        });

        const verifiedCandidate = directCandidates.find((candidate) => this.normalizeValue(candidate) !== this.normalizeValue(label));

        return {
            deviceId: snapshotMatch?.deviceId || verifiedCandidate || null,
            deviceLabel: snapshotMatch?.deviceName || label,
            graphContext: graphContext || this.state.selectedGraph || null
        };
    }

    handleNodeClick(node) {
        if (!node) return;

        const graphContext = this.findGraphForNode(node);

        if (node.type === 'cve') {
            const candidates = [node.routeId, node.cveId, node.label, node.id].filter(Boolean);
            const cveId = candidates
                .map((value) => String(value).match(/CVE-\d{4}-\d{4,}/i)?.[0])
                .find(Boolean);
            if (cveId) {
                this.setState({ modalCveId: cveId.toUpperCase(), modalGraphContext: graphContext });
            }
            return;
        }

        if (node.type === 'app') {
            const appName = node.appName || node.routeId || node.label;
            if (appName) {
                this.setState({ modalAppName: appName, modalGraphContext: graphContext });
            }
            return;
        }

        if (node.type === 'device') {
            const target = this.resolveDeviceModalTarget(node, graphContext);
            this.setState({
                modalDeviceId: target.deviceId,
                modalDeviceLabel: target.deviceLabel,
                modalGraphContext: target.graphContext
            });
        }
    }

    formatScenarioText(text) {
        return String(text || '')
            .replace(/home-network/gi, 'network')
            .replace(/pivot deeper into the fleet/gi, 'highlight additional at-risk systems')
            .replace(/pivot laterally into another high-risk system/gi, 'highlight another high-risk system with related exposure')
            .replace(/confirmed lateral movement/gi, 'confirmed network reachability');
    }

    renderRouteHighlights(graph) {
        if (!graph) return null;

        const tactics = new Set((graph.edges || []).map((e) => e.tactic).filter(Boolean));
        const apps = (graph.nodes || []).filter((n) => n.type === 'app').map((n) => n.appName || n.label);
        const devices = (graph.nodes || []).filter((n) => n.type === 'device');
        const criticalCve = (graph.nodes || []).find((n) => n.type === 'cve' && String(n.severity || '').toLowerCase() === 'critical');
        const sensitiveAppPresent = apps.some((name) => /(edge|chrome|firefox|acrobat|office|outlook|excel|word|onedrive|teams)/i.test(name || ''));

        const items = [
            {
                title: 'Privilege escalation potential',
                tone: tactics.has('privilege-escalation') || !!criticalCve ? 'danger' : 'secondary',
                value: tactics.has('privilege-escalation') || !!criticalCve ? 'Elevated concern' : 'Limited evidence',
                note: tactics.has('privilege-escalation') || !!criticalCve
                    ? 'Exploit conditions or client-execution paths could allow the attacker to gain higher control on the endpoint.'
                    : 'Current telemetry does not show a strong privilege-escalation signal in this path.'
            },
            {
                title: 'Data exposure risk',
                tone: sensitiveAppPresent && devices.length > 0 ? 'warning' : 'secondary',
                value: sensitiveAppPresent && devices.length > 0 ? 'Elevated exposure' : 'Lower likelihood',
                note: sensitiveAppPresent
                    ? 'Browser, document, and user-session data may be exposed if this path is abused.'
                    : 'This path is less directly associated with document or session-data theft.'
            },
            {
                title: 'Operational spread',
                tone: devices.length > 1 ? 'info' : 'secondary',
                value: devices.length > 1 ? `${devices.length} endpoints in scope` : 'Single-endpoint path',
                note: devices.length > 1
                    ? 'Multiple endpoints appear in the same path. Analyst review should confirm actual reachability.'
                    : 'Current evidence suggests a localized endpoint path.'
            }
        ];

        return html`
            <div class="row g-2 mb-3">
                ${items.map((item) => html`
                    <div class="col-12">
                        <div class="card border-0 shadow-sm overflow-hidden">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-start gap-2">
                                    <div>
                                        <div class="text-uppercase small text-muted mb-1">${item.title}</div>
                                        <div class="fw-semibold">${item.value}</div>
                                    </div>
                                    <span class="badge bg-${item.tone} text-white">${item.tone === 'secondary' ? 'Info' : item.value}</span>
                                </div>
                                <div class="small text-muted mt-2">${item.note}</div>
                            </div>
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    renderNarrative(graph) {
        if (!graph?.narrative?.length) return null;

        return html`
            <div class="card border-0 shadow-sm overflow-hidden attack-narrative-card">
                <div class="card-header py-3 px-4 bg-transparent">
                    <div>
                        <div class="text-uppercase small text-muted mb-1">Analyst walkthrough</div>
                        <h3 class="card-title mb-0">Operational narrative</h3>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="list-group list-group-flush">
                        ${graph.narrative.map((step) => {
                            const tech = step.technique ? lookupTechnique(step.technique) : null;
                            const tactic = tech?.tactic ? TACTICS[tech.tactic] : null;
                            const deviceLookup = graph?.nodes?.find((n) => n.type === 'device' && n.label === step.device)?.routeId || null;
                            const appLookup = graph?.nodes?.find((n) => n.type === 'app' && (n.appName === step.app || n.label === step.app))?.appName || step.app;
                            return html`
                                <div class="list-group-item px-4 py-3">
                                    <div class="d-flex align-items-start gap-3">
                                        <span class="badge bg-dark rounded-circle" style="width:28px;height:28px;line-height:28px;padding:0;text-align:center;flex-shrink:0;">${step.step}</span>
                                        <div class="flex-fill">
                                            <div class="fw-semibold">${this.formatScenarioText(step.description)}</div>
                                            <div class="mt-1 d-flex flex-wrap gap-1">
                                                ${step.device ? html`<button type="button" class="badge bg-blue-lt text-blue border-0" onClick=${() => this.setState({ modalDeviceId: deviceLookup || step.device, modalDeviceLabel: step.device, modalGraphContext: graph })}>${step.device}</button>` : null}
                                                ${step.app ? html`<button type="button" class="badge bg-orange-lt text-orange border-0" onClick=${() => this.setState({ modalAppName: appLookup, modalGraphContext: graph })}>${step.app}</button>` : null}
                                                ${step.cveId ? html`<button type="button" class="badge bg-danger-lt text-danger border-0" onClick=${() => this.setState({ modalCveId: step.cveId, modalGraphContext: graph })}>${step.cveId}</button>` : null}
                                                ${step.technique && tactic ? html`
                                                    <span class="badge" style="background:${tactic.colour}20;color:${tactic.colour}">${step.technique} ${tech?.name || ''}</span>
                                                ` : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        })}
                    </div>
                </div>
            </div>
        `;
    }

    renderLegend() {
        return html`
            <div class="d-flex flex-wrap gap-3 mt-3 mb-2 px-1 align-items-center">
                <div class="d-flex align-items-center gap-1">
                    <svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="#0054a6" stroke="#003d7a" stroke-width="1.5"/><rect x="4" y="4" width="8" height="5" rx="1" fill="none" stroke="#fff" stroke-width="1"/><line x1="6" y1="12" x2="10" y2="12" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>
                    <span class="small text-muted">Endpoint colour = primary network/access group</span>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <svg width="16" height="14"><rect x="1" y="1" width="14" height="12" rx="3" fill="#f76707" stroke="#c05600" stroke-width="1.5"/></svg>
                    <span class="small text-muted">Application</span>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <svg width="16" height="16"><polygon points="8,1 15,8 8,15 1,8" fill="#d63939" stroke="#a82d2d" stroke-width="1.5"/></svg>
                    <span class="small text-muted">CVE</span>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <svg width="34" height="18"><path d="M7 3 C2 5 2 13 8 15 C15 18 28 16 31 10 C34 4 14 0 7 3Z" fill="rgba(0,84,166,0.11)" stroke="#003d7a" stroke-width="1.4" stroke-dasharray="4 3"/></svg>
                    <span class="small text-muted">Zone wraps devices and installed apps</span>
                </div>
                <div class="border-start ps-3 d-flex align-items-center gap-1">
                    <span class="small text-muted">Select a path, then open any node for the supporting MAGI brief.</span>
                </div>
            </div>
        `;
    }

    renderSummaryCards(graphs, generationSource) {
        const nodes = graphs.flatMap(g => g?.nodes || []);
        const deviceCount = new Set(nodes.filter(n => n.type === 'device').map(n => n.label)).size;
        const appCount = new Set(nodes.filter(n => n.type === 'app').map(n => n.appName || n.label)).size;
        const cveCount = new Set(nodes.filter(n => n.type === 'cve').map(n => n.cveId || n.label)).size;

        const cards = [
            {
                label: 'Active paths in focus',
                value: String(graphs.length || 0),
                note: `${cveCount} CVEs • ${deviceCount} endpoints • ${appCount} applications`
            },
            {
                label: 'Intelligence model',
                value: generationSource === 'heuristic' ? 'Signal-driven' : 'AI-assisted',
                note: generationSource === 'heuristic' ? 'refreshed when the underlying participants materially change' : 'narrative refined from live signal intelligence'
            },
            {
                label: 'Assessment confidence',
                value: 'Correlated',
                note: 'an analyst estimate, not proof of reachability'
            }
        ];

        return html`
            <div class="row g-3 mb-4">
                ${cards.map(card => html`
                    <div class="col-md-4">
                        <div class="card border-0 shadow-sm h-100 overflow-hidden">
                            <div class="card-body p-4">
                                <div class="text-muted text-uppercase small mb-1">${card.label}</div>
                                <div class="h3 mb-1">${card.value}</div>
                                <div class="small text-muted">${card.note}</div>
                            </div>
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    renderGraphSelector(graphs, selectedGraph) {
        if (!graphs?.length) return null;

        const activeIndex = Math.max(0, graphs.findIndex((g) => g.chainId === selectedGraph?.chainId));
        const activeGraph = graphs[activeIndex] || selectedGraph || graphs[0];

        return html`
            <div class="attack-route-ribbon mt-3 mb-1">
                <div class="attack-route-ribbon__header">
                    <span class="attack-route-ribbon__eyebrow">Operational path selector</span>
                    <span class="small text-muted">Choose the path MAGI should bring into focus</span>
                </div>
                <div class="attack-route-ribbon__chips">
                    ${graphs.map((g, i) => html`
                        <button
                            type="button"
                            class=${`attack-route-chip ${activeGraph?.chainId === g.chainId ? 'is-active' : ''}`}
                            onClick=${() => this.setState({ selectedGraph: g })}
                            title=${this.formatScenarioText(g.summary || `Path ${i + 1}`)}
                        >
                            <span class="attack-route-chip__index">${i + 1}</span>
                            <span class="attack-route-chip__label">Path ${i + 1}</span>
                        </button>
                    `)}
                </div>
                <div class="attack-route-summary">
                    <span class="badge bg-primary text-white">Path ${activeIndex + 1}</span>
                    <span class="small fw-medium">${this.formatScenarioText(activeGraph?.summary || `Path ${activeIndex + 1}`)}</span>
                </div>
            </div>
        `;
    }

    renderRouteIntelModal(graph) {
        if (!this.state.showRouteIntel || !graph) return null;

        return html`
            <div
                class="modal show d-block"
                style="background-color: rgba(0,0,0,0.5);"
                onClick=${(e) => { if (e.target === e.currentTarget) this.setState({ showRouteIntel: false }); }}
            >
                <div class="modal-dialog modal-dialog-scrollable modal-md">
                    <div class="modal-content attack-quick-modal">
                        <div class="modal-header attack-quick-modal__header border-bottom">
                            <div>
                                <div class="text-uppercase small fw-semibold opacity-75 mb-1">Officer MAGI methodology brief</div>
                                <h4 class="modal-title mb-0">How MAGI built this assessment</h4>
                            </div>
                            <button type="button" class="btn-close" aria-label="Close" onClick=${() => this.setState({ showRouteIntel: false })}></button>
                        </div>
                        <div class="modal-body">
                            <div class="card border-0 bg-light-subtle shadow-sm mb-3">
                                <div class="card-body p-3">
                                    <div class="text-uppercase small text-muted mb-1">How MAGI derived this view</div>
                                    <div class="small"><strong>Inputs used:</strong> ${this.state.attackChain?.note || this.state.attackChain?.Note || 'Current high-risk CVEs, exposed applications, at-risk endpoints, and unresolved control gaps.'}</div>
                                    <div class="small mt-2"><strong>Method:</strong> MAGI correlates those signals to estimate the most credible attack paths and bring likely operator sequences into view.</div>
                                    <div class="small mt-2"><strong>Confidence note:</strong> this is signal-based analysis. It highlights plausible exposure paths, but it is not by itself proof of shared reachability or confirmed attacker movement.</div>
                                </div>
                            </div>
                            <div class="fw-semibold mb-3">${this.formatScenarioText(graph.summary || 'Selected attack path')}</div>
                            ${this.renderRouteHighlights(graph)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        const { loading, refreshing, error, dataHint, attackChain, selectedGraph, showNarrative, modalCveId, modalDeviceId, modalDeviceLabel, modalAppName, modalGraphContext } = this.state;
        const graphs = attackChain?.graphs || [];
        const generatedAt = attackChain?.generatedAt;
        const generationSource = (attackChain?.source || attackChain?.Source || '').toLowerCase();
        const note = attackChain?.note || attackChain?.Note || dataHint;

        if (loading) {
            return html`
                <div class="container-xl py-4 attack-chain-shell">
                    <div class="page-header mb-4">
                        <div class="page-pretitle">Officer MAGI assessment</div>
                        <h2 class="page-title">Attack Chain</h2>
                    </div>
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <div class="spinner-border text-primary mb-3" role="status"></div>
                            <p class="text-muted">Loading attack chain analysis…</p>
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="container-xl py-4 attack-chain-shell">
                <!-- Header -->
                <div class="page-header mb-4">
                    <div class="row align-items-end">
                        <div class="col">
                            <div class="page-pretitle">Officer MAGI assessment</div>
                            <h2 class="page-title">Attack Chain</h2>
                            <p class="page-subtitle mt-1 mb-0">
                                MAGI correlates current vulnerabilities, exposed applications, affected endpoints, and control gaps to surface the most credible attack paths
                                ${generatedAt ? html`
                                    <span class="badge bg-secondary-lt text-muted ms-2">
                                        Generated ${new Date(generatedAt).toLocaleString()}
                                    </span>
                                ` : ''}
                                ${generationSource ? html`
                                    <span class="badge ${generationSource === 'heuristic' ? 'bg-azure-lt text-azure' : 'bg-success-lt text-success'} ms-2">
                                        ${generationSource === 'heuristic' ? 'MAGI signal graph' : 'AI-assisted MAGI graph'}
                                    </span>
                                ` : ''}
                            </p>
                        </div>
                        <div class="col-auto">
                            <div class="btn-list">
                                <button
                                    class="btn btn-outline-primary btn-sm"
                                    disabled=${refreshing || rewindContext.isActive()}
                                    onClick=${() => this.handleRefresh()}
                                >
                                    ${refreshing ? html`<span class="spinner-border spinner-border-sm me-1"></span> Regenerating…` : 'Regenerate'}
                                </button>
                                <button
                                    class="btn btn-sm ${showNarrative ? 'btn-primary' : 'btn-outline-secondary'}"
                                    onClick=${() => this.setState({ showNarrative: !showNarrative })}
                                >
                                    <i class="ti ti-list me-1"></i>Narrative
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                ${error ? html`
                    <div class="alert alert-danger">${error}</div>
                ` : null}

                ${graphs.length > 0 ? this.renderSummaryCards(graphs, generationSource) : null}

                ${note && graphs.length === 0 ? html`
                    <div class="alert alert-warning border-0 shadow-sm">
                        <div class="fw-semibold mb-1">How MAGI is assessing this view</div>
                        <div class="small">${note}</div>
                    </div>
                ` : null}

                ${graphs.length === 0 ? html`
                    <div class="card">
                        <div class="card-body">
                            <div class="empty">
                                <div class="empty-icon">
                                    <i class="ti ti-route" style="font-size:3rem;color:#667eea"></i>
                                </div>
                                <p class="empty-title">No active attack paths identified</p>
                                <p class="empty-subtitle text-muted">
                                    ${note || 'MAGI did not identify a path of concern from the latest available signals. Regenerate to run a fresh assessment against current cloud intelligence.'}
                                </p>
                                <div class="empty-action">
                                    <button class="btn btn-primary" disabled=${refreshing} onClick=${() => this.handleRefresh()}>
                                        ${refreshing ? 'Generating…' : 'Generate Now'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : html`
                    <div class="row g-4 align-items-start">
                        <div class="col-lg-8">
                            <div class="card border-0 shadow-sm overflow-hidden">
                                <div class="card-body p-4">
                                    <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
                                        <div>
                                            <div class="text-uppercase small text-muted">Unified exposure map</div>
                                            <h3 class="card-title mb-1">A single operational view of active attack paths</h3>
                                            <div class="small text-muted">MAGI consolidates related CVEs, vulnerable applications, and endpoints into one shared canvas. Network/access zones wrap devices and the apps installed on them; endpoints can carry multiple membership rings when segment evidence says they belong to more than one network.</div>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            <button
                                                type="button"
                                                class="btn btn-outline-secondary btn-sm"
                                                onClick=${() => this.setState({ showRouteIntel: true })}
                                                title="Open the MAGI methodology and path intelligence brief"
                                            >
                                                <i class="ti ti-info-circle me-1"></i>How MAGI built this
                                            </button>
                                            <span class="badge bg-primary text-white">${graphs.length} path${graphs.length === 1 ? '' : 's'}</span>
                                        </div>
                                    </div>
                                    <${AttackChainGraph}
                                        graphs=${graphs}
                                        highlightChainId=${selectedGraph?.chainId}
                                        height="560px"
                                        onNodeClick=${(n) => this.handleNodeClick(n)}
                                    />
                                </div>
                            </div>
                            ${this.renderLegend()}
                            ${this.renderGraphSelector(graphs, selectedGraph)}
                        </div>

                        <div class="col-lg-4">
                            <div class="card border-0 shadow-sm mb-3 overflow-hidden">
                                <div class="card-body p-4">
                                    <div class="text-uppercase small text-muted mb-2">Priority path summary</div>
                                    <div class="fw-semibold lh-sm" style="font-size:1.05rem;">${this.formatScenarioText(selectedGraph?.summary || 'Selected attack path')}</div>
                                    <div class="small text-muted mt-2">Open “How MAGI built this” for the evidence basis, methodology, and operational implications.</div>
                                </div>
                            </div>
                            ${showNarrative && selectedGraph?.narrative?.length ? this.renderNarrative(selectedGraph) : null}
                        </div>
                    </div>
                `}

                <${CveDetailsModal}
                    cveId=${modalCveId}
                    orgId=${orgContext.getCurrentOrg()?.orgId}
                    isOpen=${!!modalCveId}
                    onClose=${() => this.setState({ modalCveId: null, modalGraphContext: null })}
                />

                <${DeviceQuickViewModal}
                    deviceId=${modalDeviceId}
                    deviceLabel=${modalDeviceLabel}
                    graphContext=${modalGraphContext}
                    orgId=${orgContext.getCurrentOrg()?.orgId}
                    isOpen=${!!modalDeviceId}
                    onClose=${() => this.setState({ modalDeviceId: null, modalDeviceLabel: null, modalGraphContext: null })}
                />

                <${AppDevicesModal}
                    appName=${modalAppName}
                    graphContext=${modalGraphContext}
                    orgId=${orgContext.getCurrentOrg()?.orgId}
                    isOpen=${!!modalAppName}
                    onClose=${() => this.setState({ modalAppName: null, modalGraphContext: null })}
                />

                ${this.renderRouteIntelModal(selectedGraph)}
            </div>
        `;
    }
}

export default AttackChainPage;
