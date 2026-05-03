/**
 * AttackChainGraph — D3 force-directed attack chain visualisation.
 *
 * Props:
 *   graphs:      Array<{ chainId, summary, nodes, edges, narrative }>
 *   onNodeClick: (node) => void   — optional callback
 *
 * Nodes have { id, type:"device"|"app"|"cve", label, mitreTechniques, severity, segment }.
 * Edges have { source, target, technique, tactic, narrative }.
 *
 * Colours are sourced from mitre-ttp-catalog.js TACTICS palette.
 */

import { TACTICS } from '../data/mitre-ttp-catalog.js';

const { html, Component } = window;
const { useRef, useEffect } = window.preactHooks;

const NODE_SHAPES = {
    device: { r: 22, fill: '#0054a6', stroke: '#003d7a' },
    app:    { r: 16, fill: '#f76707', stroke: '#c05600' },
    cve:    { r: 14, fill: '#d63939', stroke: '#a82d2d' },
};

const ACCESS_PALETTE = [
    { fill: '#0054a6', stroke: '#003d7a', label: '#7cc4ff', soft: 'rgba(0,84,166,0.11)' },
    { fill: '#2fb344', stroke: '#1d7f32', label: '#8ce99a', soft: 'rgba(47,179,68,0.11)' },
    { fill: '#ae3ec9', stroke: '#862e9c', label: '#e599f7', soft: 'rgba(174,62,201,0.11)' },
    { fill: '#0ca678', stroke: '#087f5b', label: '#63e6be', soft: 'rgba(12,166,120,0.11)' },
    { fill: '#f59f00', stroke: '#b76d00', label: '#ffd43b', soft: 'rgba(245,159,0,0.13)' },
    { fill: '#e03131', stroke: '#a61e1e', label: '#ffa8a8', soft: 'rgba(224,49,49,0.10)' }
];

const SEVERITY_FILL = {
    critical: '#d63939',
    high:     '#f76707',
    medium:   '#f59f00',
    low:      '#2fb344',
};

function tacticColour(tactic) {
    return TACTICS[tactic]?.colour ?? '#6c757d';
}

function getTacticStrokeWidth(tactic) {
    if (tactic === 'exfiltration') return 4;
    if (tactic === 'privilege-escalation' || tactic === 'lateral-movement') return 3;
    return 2;
}

function getNodeGids(node) {
    if (node?._gids instanceof Set) return Array.from(node._gids);
    if (Array.isArray(node?._gids)) return node._gids;
    return [node?._gid ?? 0].filter(Number.isFinite);
}

function getPrimaryGid(node, selectedGid) {
    const gids = getNodeGids(node);
    if (selectedGid >= 0 && gids.includes(selectedGid)) return selectedGid;
    return gids[0] ?? 0;
}

function normalizeSegmentValues(value) {
    if (!value) return [];
    const values = Array.isArray(value) ? value : String(value).split(/[,;|]/);
    return values
        .map(item => String(item || '').trim())
        .filter(Boolean);
}

function getDeviceSegments(node) {
    const fields = [
        node?.segment,
        node?.Segment,
        node?.segments,
        node?.Segments,
        node?.networkSegment,
        node?.NetworkSegment,
        node?.networkSegments,
        node?.NetworkSegments,
        node?.network,
        node?.Network,
        node?.networks,
        node?.Networks,
        node?.subnet,
        node?.Subnet,
        node?.subnets,
        node?.Subnets
    ];

    return Array.from(new Set(fields.flatMap(normalizeSegmentValues)));
}

function getAccessStyle(gid) {
    return ACCESS_PALETTE[Math.abs(gid) % ACCESS_PALETTE.length];
}

function getDeviceStyle(node, selectedGid, accessMembership) {
    const memberships = accessMembership?.get(node._id) || [];
    const selectedMembership = selectedGid >= 0
        ? memberships.find(group => group.gids.has(selectedGid))
        : null;
    if (selectedMembership) return selectedMembership.style;
    if (memberships.length > 0) return memberships[0].style;

    const gid = getPrimaryGid(node, selectedGid);
    return getAccessStyle(gid);
}

function getEdgeNode(edge, endpoint, nodeById) {
    const id = edge?.[`_${endpoint}Id`];
    const value = id || edge?.[endpoint];
    if (value && typeof value === 'object') return value;
    return nodeById.get(value) || null;
}

function isDeviceToDeviceEdge(edge, nodeById) {
    return getEdgeNode(edge, 'source', nodeById)?.type === 'device'
        && getEdgeNode(edge, 'target', nodeById)?.type === 'device';
}

function getEdgeStroke(edge, nodeById, selectedGid) {
    if (isDeviceToDeviceEdge(edge, nodeById) && !edge.tactic) {
        return getAccessStyle(edge._gid === selectedGid ? selectedGid : edge._gid).stroke;
    }
    return tacticColour(edge.tactic);
}

function getEdgeDash(edge, nodeById) {
    if (isDeviceToDeviceEdge(edge, nodeById) && !edge.tactic) return '7 5';
    return edge.tactic ? null : '5 4';
}

function getEdgeWidth(edge, nodeById) {
    if (isDeviceToDeviceEdge(edge, nodeById) && !edge.tactic) return 2.6;
    return getTacticStrokeWidth(edge.tactic);
}

function buildAccessGroups(nodes, edges, nodeById, selectedGid) {
    const groups = new Map();
    const deviceGroups = new Map();

    const ensureGroup = (key, label, segment, gidOrHash) => {
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                label,
                segment,
                gids: new Set(),
                nodes: [],
                style: getAccessStyle(gidOrHash)
            });
        }
        return groups.get(key);
    };

    const addNodeToGroup = (group, node) => {
        if (!node) return;
        if (!group.nodes.includes(node)) group.nodes.push(node);
    };

    nodes.filter(node => node.type === 'device').forEach((node) => {
        const segments = getDeviceSegments(node);
        const nodeGroups = [];

        if (segments.length > 0) {
            segments.forEach((segment) => {
                const group = ensureGroup(`segment:${segment.toLowerCase()}`, segment, true, Math.abs(hashCode(segment)));
                getNodeGids(node).forEach(gid => group.gids.add(gid));
                addNodeToGroup(group, node);
                nodeGroups.push(group);
            });
        } else {
            getNodeGids(node).forEach((gid) => {
                const group = ensureGroup(`path:${gid}`, `Path ${gid + 1} access`, false, gid);
                group.gids.add(gid);
                addNodeToGroup(group, node);
                nodeGroups.push(group);
            });
        }

        deviceGroups.set(node._id, nodeGroups);
    });

    edges.forEach((edge) => {
        const source = getEdgeNode(edge, 'source', nodeById);
        const target = getEdgeNode(edge, 'target', nodeById);
        const appNode = source?.type === 'app' ? source : target?.type === 'app' ? target : null;
        const deviceNode = source?.type === 'device' ? source : target?.type === 'device' ? target : null;

        if (!appNode || !deviceNode) return;
        (deviceGroups.get(deviceNode._id) || []).forEach((group) => {
            group.gids.add(edge._gid);
            addNodeToGroup(group, appNode);
        });
    });

    return Array.from(groups.values())
        .filter(group => group.nodes.length > 0)
        .sort((a, b) => {
            const aActive = selectedGid >= 0 && a.gids.has(selectedGid) ? 0 : 1;
            const bActive = selectedGid >= 0 && b.gids.has(selectedGid) ? 0 : 1;
            return aActive - bActive || a.nodes.length - b.nodes.length;
        });
}

function buildAccessMembership(groups) {
    const membership = new Map();
    groups.forEach((group) => {
        group.nodes.forEach((node) => {
            if (!membership.has(node._id)) membership.set(node._id, []);
            membership.get(node._id).push(group);
        });
    });
    return membership;
}

function hashCode(value) {
    return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function accessBoundaryPath(nodes, width, height) {
    const points = nodes
        .map(node => ({ x: Number(node.x), y: Number(node.y) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

    if (points.length === 0) return '';

    const padding = points.length === 1 ? 48 : 58;
    const minX = Math.max(28, Math.min(...points.map(point => point.x)) - padding);
    const maxX = Math.min(width - 28, Math.max(...points.map(point => point.x)) + padding);
    const minY = Math.max(28, Math.min(...points.map(point => point.y)) - padding);
    const maxY = Math.min(height - 28, Math.max(...points.map(point => point.y)) + padding);
    const wobble = Math.max(14, Math.min(28, (maxX - minX) * 0.12));

    return [
        `M ${minX + wobble} ${minY}`,
        `C ${minX - wobble} ${minY + (maxY - minY) * 0.24}, ${minX - wobble} ${maxY - (maxY - minY) * 0.24}, ${minX + wobble} ${maxY}`,
        `C ${minX + (maxX - minX) * 0.36} ${maxY + wobble}, ${maxX - (maxX - minX) * 0.25} ${maxY + wobble}, ${maxX - wobble} ${maxY}`,
        `C ${maxX + wobble} ${maxY - (maxY - minY) * 0.26}, ${maxX + wobble} ${minY + (maxY - minY) * 0.28}, ${maxX - wobble} ${minY}`,
        `C ${maxX - (maxX - minX) * 0.34} ${minY - wobble}, ${minX + (maxX - minX) * 0.3} ${minY - wobble}, ${minX + wobble} ${minY}`,
        'Z'
    ].join(' ');
}

function accessLabelPosition(nodes) {
    const points = nodes
        .map(node => ({ x: Number(node.x), y: Number(node.y) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length === 0) return { x: 0, y: 0 };

    const minY = Math.min(...points.map(point => point.y));
    const avgX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    return { x: avgX, y: minY - 54 };
}

function getThemePalette() {
    const root = document.documentElement;
    const attrTheme = root?.getAttribute('data-bs-theme');
    const isDark = attrTheme === 'dark' || document.body?.classList?.contains('theme-dark');

    return {
        isDark,
        bg: isDark ? '#0b132b' : '#f8fbff',
        border: isDark ? '#334155' : '#d8e2f0',
        label: isDark ? '#f8fafc' : '#243447',
        subtle: isDark ? '#94a3b8' : '#5b6b7f',
        cluster: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(0,84,166,0.06)',
        edge: isDark ? '#cbd5e1' : '#666',
        glowDanger: 'rgba(214,57,57,0.65)',
        glowWarning: 'rgba(245,159,0,0.55)',
        glowInfo: 'rgba(0,84,166,0.45)'
    };
}

function appendNodeIcon(el, d) {
    const stroke = '#fff';

    if (d.type === 'device') {
        el.append('rect')
            .attr('x', -9).attr('y', -8)
            .attr('width', 18).attr('height', 12)
            .attr('rx', 2)
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', 1.6);
        el.append('line').attr('x1', -5).attr('y1', 8).attr('x2', 5).attr('y2', 8).attr('stroke', stroke).attr('stroke-width', 1.6).attr('stroke-linecap', 'round');
        el.append('line').attr('x1', 0).attr('y1', 4).attr('x2', 0).attr('y2', 8).attr('stroke', stroke).attr('stroke-width', 1.6).attr('stroke-linecap', 'round');
        return;
    }

    if (d.type === 'app') {
        [[-5,-4],[1,-4],[-5,2],[1,2]].forEach(([x,y]) => {
            el.append('rect')
                .attr('x', x).attr('y', y)
                .attr('width', 4).attr('height', 4)
                .attr('rx', 1)
                .attr('fill', stroke);
        });
        return;
    }

    el.append('line').attr('x1', 0).attr('y1', -6).attr('x2', 0).attr('y2', 2).attr('stroke', stroke).attr('stroke-width', 2.1).attr('stroke-linecap', 'round');
    el.append('circle').attr('cx', 0).attr('cy', 6).attr('r', 1.6).attr('fill', stroke);
}

function normalizeKeyPart(value) {
    return String(value || '').trim().toUpperCase();
}

function getNodeAliases(node) {
    const aliases = [];
    const push = (kind, value) => {
        const normalized = normalizeKeyPart(value);
        if (normalized) aliases.push(`${kind}:${normalized}`);
    };

    if (node.type === 'cve') {
        const cve = [node.cveId, node.routeId, node.label, node.id]
            .map(v => String(v || '').match(/CVE-\d{4}-\d{4,}/i)?.[0])
            .find(Boolean);
        push('cve', cve);
    } else if (node.type === 'device') {
        push('device', node.deviceId);
        push('device', node.routeId);
        push('device', node.label);
    } else if (node.type === 'app') {
        push('app', node.appName);
        push('app', node.routeId);
        push('app', node.label);
    }

    push(node.type || 'node', node.id);
    return Array.from(new Set(aliases));
}

function renderGraph(svgEl, graphs, onNodeClick, highlightChainId) {
    if (!svgEl || typeof d3 === 'undefined') return;

    const d3sel = d3.select(svgEl);
    d3sel.selectAll('*').remove();

    const width  = svgEl.clientWidth  || 900;
    const height = svgEl.clientHeight || 600;
    const palette = getThemePalette();
    d3sel.style('background', palette.bg).style('border', `1px solid ${palette.border}`).style('border-radius', '12px');

    const selectedGid = graphs.findIndex((g) => g?.chainId === highlightChainId);
    const clusterCenters = [{ x: width / 2, y: height / 2 }];

    const allNodes = [];
    const allEdges = [];
    const mergedNodes = new Map();
    const aliasMap = new Map();
    const seenEdges = new Set();

    graphs.forEach((g, gi) => {
        const nodeMap = new Map();

        g.nodes.forEach((n) => {
            const aliases = getNodeAliases(n);
            let existing = null;

            for (const alias of aliases) {
                if (aliasMap.has(alias)) {
                    existing = aliasMap.get(alias);
                    break;
                }
            }

            if (!existing) {
                const stableKey = aliases[0] || `${n.type}:${normalizeKeyPart(n.id)}`;
                existing = {
                    ...n,
                    _gid: gi,
                    _gids: new Set([gi]),
                    _id: stableKey
                };
                mergedNodes.set(stableKey, existing);
                allNodes.push(existing);
            } else {
                existing._gids.add(gi);
                existing.routeId ||= n.routeId;
                existing.cveId ||= n.cveId;
                existing.deviceId ||= n.deviceId;
                existing.appName ||= n.appName;
                existing.segment ||= n.segment;
                existing.severity ||= n.severity;
                if ((!existing.label || existing.label.length < String(n.label || '').length) && n.label) {
                    existing.label = n.label;
                }
            }

            aliases.forEach(alias => aliasMap.set(alias, existing));
            nodeMap.set(n.id, existing._id);
        });

        g.edges.forEach((e) => {
            const source = nodeMap.get(e.source) ?? `${gi}-${e.source}`;
            const target = nodeMap.get(e.target) ?? `${gi}-${e.target}`;
            const edgeKey = `${source}|${target}|${e.technique || ''}|${e.tactic || ''}`;
            if (seenEdges.has(edgeKey)) return;
            seenEdges.add(edgeKey);
            allEdges.push({ ...e, source, target, _sourceId: source, _targetId: target, _gid: gi });
        });
    });

    if (allNodes.length === 0) return;

    // Defs — arrowheads
    const defs = d3sel.append('defs');
    defs.append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', palette.edge);

    const g = d3sel.append('g');
    const nodeById = new Map(allNodes.map(node => [node._id, node]));
    const accessGroups = buildAccessGroups(allNodes, allEdges, nodeById, selectedGid);
    const accessMembership = buildAccessMembership(accessGroups);

    // Intentionally render a single shared canvas instead of per-route chart clusters.

    // Zoom + pan
    d3sel.call(
        d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => g.attr('transform', event.transform))
    );

    // Force simulation
    const simulation = d3.forceSimulation(allNodes)
        .force('link', d3.forceLink(allEdges).id(d => d._id).distance(118))
        .force('charge', d3.forceManyBody().strength(-420))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(46))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05));

    const accessLayer = g.append('g').attr('class', 'attack-access-layer');
    const accessBoundary = accessLayer
        .selectAll('path')
        .data(accessGroups)
        .join('path')
        .attr('fill', d => d.style.soft)
        .attr('stroke', d => d.style.stroke)
        .attr('stroke-width', d => selectedGid < 0 || d.gids.has(selectedGid) ? 2 : 1.2)
        .attr('stroke-dasharray', d => d.segment ? null : '8 6')
        .attr('opacity', d => selectedGid < 0 || d.gids.has(selectedGid) ? 0.95 : 0.2);

    const accessLabel = accessLayer
        .selectAll('text')
        .data(accessGroups)
        .join('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('fill', d => palette.isDark ? d.style.label : d.style.stroke)
        .attr('opacity', d => selectedGid < 0 || d.gids.has(selectedGid) ? 0.88 : 0.22)
        .text(d => d.label);

    // Links
    const link = g.append('g')
        .selectAll('line')
        .data(allEdges)
        .join('line')
        .attr('stroke', d => getEdgeStroke(d, nodeById, selectedGid))
        .attr('stroke-width', d => getEdgeWidth(d, nodeById))
        .attr('stroke-dasharray', d => getEdgeDash(d, nodeById))
        .attr('stroke-opacity', d => selectedGid >= 0 && d._gid !== selectedGid ? 0.08 : (d.tactic === 'exfiltration' ? 0.98 : 0.88))
        .attr('marker-end', 'url(#arrowhead)')
        .style('filter', d => d.tactic === 'exfiltration'
            ? `drop-shadow(0 0 6px ${palette.glowWarning})`
            : d.tactic === 'privilege-escalation'
            ? `drop-shadow(0 0 6px ${palette.glowDanger})`
            : 'none');

    // Edge labels
    const edgeLabel = g.append('g')
        .selectAll('text')
        .data(allEdges.filter(e => e.technique))
        .join('text')
        .attr('font-size', 9)
        .attr('fill', palette.edge)
        .attr('text-anchor', 'middle')
        .text(d => d.technique);

    // Node groups
    const node = g.append('g')
        .selectAll('g')
        .data(allNodes)
        .join('g')
        .style('cursor', 'pointer')
        .call(d3.drag()
            .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
        );

    // Draw shapes based on type
    node.each(function (d) {
        const el = d3.select(this);
        const shape = NODE_SHAPES[d.type] || NODE_SHAPES.cve;
        const deviceStyle = d.type === 'device' ? getDeviceStyle(d, selectedGid, accessMembership) : null;
        const fill = d.type === 'cve'
            ? (SEVERITY_FILL[d.severity?.toLowerCase()] || shape.fill)
            : d.type === 'device'
            ? deviceStyle.fill
            : shape.fill;
        const stroke = d.type === 'device' ? deviceStyle.stroke : shape.stroke;
        const isSelected = selectedGid < 0 || Array.from(d._gids || [d._gid]).includes(selectedGid);
        const appName = String(d.appName || d.label || '');
        const hasExfilHint = d.type === 'app' && /(edge|chrome|firefox|acrobat|office|outlook|excel|word|onedrive|teams)/i.test(appName);
        const glow = d.type === 'cve'
            ? palette.glowDanger
            : hasExfilHint
            ? palette.glowWarning
            : palette.glowInfo;

        el.style('opacity', isSelected ? 1 : 0.16)
          .style('filter', `drop-shadow(0 0 8px ${glow})`);

        if (d.type === 'device') {
            el.append('circle')
                .attr('r', shape.r)
                .attr('fill', fill)
                .attr('stroke', stroke)
                .attr('stroke-width', isSelected ? 2.8 : 2);

            (accessMembership.get(d._id) || []).slice(0, 3).forEach((group, index) => {
                el.append('circle')
                    .attr('r', shape.r + 5 + index * 4)
                    .attr('fill', 'none')
                    .attr('stroke', palette.isDark ? group.style.label : group.style.stroke)
                    .attr('stroke-width', 1.4)
                    .attr('stroke-dasharray', group.segment ? null : '3 3')
                    .attr('opacity', isSelected ? 0.88 : 0.25);
            });
        } else if (d.type === 'app') {
            el.append('rect')
                .attr('x', -20).attr('y', -14)
                .attr('width', 40).attr('height', 28)
                .attr('rx', 10).attr('ry', 10)
                .attr('fill', fill)
                .attr('stroke', shape.stroke)
                .attr('stroke-width', isSelected ? 2.8 : 2);
        } else {
            el.append('polygon')
                .attr('points', `0,-18 16,-2 10,18 -10,18 -16,-2`)
                .attr('fill', fill)
                .attr('stroke', shape.stroke)
                .attr('stroke-width', isSelected ? 2.8 : 2);
        }

        appendNodeIcon(el, d);

        // Label
        el.append('text')
            .attr('dy', shape.r + 14)
            .attr('text-anchor', 'middle')
            .attr('font-size', 10)
            .attr('font-weight', 600)
            .attr('fill', palette.label)
            .text(d.label.length > 24 ? d.label.slice(0, 22) + '…' : d.label);
    });

    // Click handler
    if (onNodeClick) {
        node.on('click', (event, d) => onNodeClick(d));
    }

    // Tooltip on hover
    node.append('title').text(d => {
        const parts = [d.label, `Type: ${d.type}`];
        if (d.severity) parts.push(`Severity: ${d.severity}`);
        if (d.mitreTechniques?.length) parts.push(`Techniques: ${d.mitreTechniques.join(', ')}`);
        return parts.join('\n');
    });

    // Tick
    simulation.on('tick', () => {
        const padX = 78;
        const padY = 56;

        allNodes.forEach((d) => {
            d.x = Math.max(padX, Math.min(width - padX, d.x || 0));
            d.y = Math.max(padY, Math.min(height - padY, d.y || 0));
        });

        link
            .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

        accessBoundary.attr('d', d => accessBoundaryPath(d.nodes, width, height));

        accessLabel
            .attr('x', d => accessLabelPosition(d.nodes).x)
            .attr('y', d => accessLabelPosition(d.nodes).y);

        edgeLabel
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2 - 8);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

export class AttackChainGraph extends Component {
    constructor(props) {
        super(props);
        this.svgRef = null;
        this.themeObserver = null;
    }

    componentDidMount() {
        this.draw();
        this.themeObserver = new MutationObserver(() => this.draw());
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });
        this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    componentDidUpdate(prevProps) {
        if (
            prevProps.graphs !== this.props.graphs ||
            prevProps.height !== this.props.height ||
            prevProps.highlightChainId !== this.props.highlightChainId
        ) {
            this.draw();
        }
    }

    componentWillUnmount() {
        this.themeObserver?.disconnect();
        this.themeObserver = null;
    }

    draw() {
        if (this.svgRef) {
            renderGraph(this.svgRef, this.props.graphs || [], this.props.onNodeClick, this.props.highlightChainId);
        }
    }

    render() {
        return html`
            <svg
                ref=${(el) => { this.svgRef = el; }}
                width="100%"
                height=${this.props.height || '600px'}
                style="display:block; width:100%; background: var(--tblr-bg-surface, #f8fbff); border-radius: 12px; border: 1px solid var(--tblr-border-color, #d8e2f0);"
            />
        `;
    }
}

export default AttackChainGraph;
