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
            .attr('x', -8).attr('y', -7)
            .attr('width', 16).attr('height', 11)
            .attr('rx', 2)
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', 1.4);
        el.append('line').attr('x1', -4).attr('y1', 6).attr('x2', 4).attr('y2', 6).attr('stroke', stroke).attr('stroke-width', 1.4);
        el.append('line').attr('x1', 0).attr('y1', 4).attr('x2', 0).attr('y2', 8).attr('stroke', stroke).attr('stroke-width', 1.4);
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
            allEdges.push({ ...e, source, target, _gid: gi });
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

    // Intentionally render a single shared canvas instead of per-route chart clusters.

    // Zoom + pan
    d3sel.call(
        d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => g.attr('transform', event.transform))
    );

    // Force simulation
    const simulation = d3.forceSimulation(allNodes)
        .force('link', d3.forceLink(allEdges).id(d => d._id).distance(100))
        .force('charge', d3.forceManyBody().strength(-350))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(38))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05));

    // Links
    const link = g.append('g')
        .selectAll('line')
        .data(allEdges)
        .join('line')
        .attr('stroke', d => tacticColour(d.tactic))
        .attr('stroke-width', d => getTacticStrokeWidth(d.tactic))
        .attr('stroke-dasharray', d => d.tactic ? null : '5 4')
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
        const fill = d.type === 'cve' ? (SEVERITY_FILL[d.severity?.toLowerCase()] || shape.fill) : shape.fill;
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
            const points = `${-20},-4 ${-10},-18 ${10},-18 ${20},-4 ${10},18 ${-10},18`;
            el.append('polygon')
                .attr('points', points)
                .attr('fill', fill)
                .attr('stroke', shape.stroke)
                .attr('stroke-width', isSelected ? 2.8 : 2);
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
