/**
 * DeviceDetail Chart Rendering Module
 * Contains all ApexCharts rendering logic for device detail page
 * Separated from main component for maintainability
 */

/**
 * Render detail charts (risk overview, apps donut, CVEs donut)
 * @param {Object} component - Parent component instance
 */
export function renderDetailCharts(component) {
    if (!window.ApexCharts) {
        console.warn('[DeviceDetail] ApexCharts not available');
        return;
    }

    if (!component.state.device) return;

    const device = component.state.device;
    const summary = component.state.deviceSummary;
    const enriched = component.state.enrichedScore;
    
    requestAnimationFrame(() => {
        renderRiskOverviewChart(component, device, summary, enriched);
        renderAppsDonutChart(component);
        renderCvesDonutChart(component);
    });
}

/**
 * Render risk overview chart (radial gauge)
 */
function renderRiskOverviewChart(component, device, summary, enriched) {
    if (!component.detailRiskChartEl) {
        console.warn('[DeviceDetail] detailRiskChartEl not available');
        return;
    }

    const score = enriched?.score ?? component.getRiskScoreValue(summary, component.calculateRiskScore(device));
    const normalized = component.normalizeSummary(summary);

    const options = {
        series: [score],
        chart: {
            type: 'radialBar',
            height: 280,
            animations: { enabled: true, speed: 800 }
        },
        plotOptions: {
            radialBar: {
                hollow: { size: '60%' },
                dataLabels: {
                    name: { offsetY: -10, color: '#888', fontSize: '13px' },
                    value: {
                        color: '#111',
                        fontSize: '30px',
                        show: true,
                        formatter: (val) => Math.round(val)
                    }
                }
            }
        },
        colors: [score >= 75 ? '#d63939' : score >= 50 ? '#f76707' : score >= 25 ? '#f59f00' : '#2fb344'],
        labels: ['Risk Score'],
        subtitle: {
            text: `${normalized?.cves || 0} CVEs · ${normalized?.vulnerableApps || 0} Vulnerable Apps`,
            align: 'center',
            offsetY: 180
        }
    };

    if (component.detailRiskChart) {
        component.detailRiskChart.updateOptions(options);
    } else {
        component.detailRiskChart = new ApexCharts(component.detailRiskChartEl, options);
        component.detailRiskChart.render();
    }
}

/**
 * Render apps donut chart (installed vs vulnerable)
 */
function renderAppsDonutChart(component) {
    if (!component.detailAppsChartEl) {
        console.warn('[DeviceDetail] detailAppsChartEl not available');
        return;
    }

    const total = component.state.appInventory.length;
    const vulnerable = component.state.appInventory.filter(app => {
        const cves = component.getCvesByApp(app.rowKey || app.RowKey);
        return cves.length > 0;
    }).length;
    const clean = total - vulnerable;

    const options = {
        series: [vulnerable, clean],
        chart: {
            type: 'donut',
            height: 260,
            animations: { enabled: true, speed: 800 }
        },
        labels: ['Vulnerable', 'Clean'],
        colors: ['#f76707', '#2fb344'],
        legend: { position: 'bottom' },
        dataLabels: { enabled: true },
        plotOptions: {
            pie: {
                donut: {
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Apps',
                            formatter: () => total
                        }
                    }
                }
            }
        }
    };

    if (component.detailAppsChart) {
        component.detailAppsChart.updateOptions(options);
    } else {
        component.detailAppsChart = new ApexCharts(component.detailAppsChartEl, options);
        component.detailAppsChart.render();
    }
}

/**
 * Render CVEs donut chart (by severity)
 */
function renderCvesDonutChart(component) {
    if (!component.detailCvesChartEl) {
        console.warn('[DeviceDetail] detailCvesChartEl not available');
        return;
    }

    const cves = component.state.cveInventory;
    const critical = cves.filter(c => (c.severity || '').toUpperCase() === 'CRITICAL').length;
    const high = cves.filter(c => (c.severity || '').toUpperCase() === 'HIGH').length;
    const medium = cves.filter(c => (c.severity || '').toUpperCase() === 'MEDIUM').length;
    const low = cves.filter(c => (c.severity || '').toUpperCase() === 'LOW').length;

    const options = {
        series: [critical, high, medium, low],
        chart: {
            type: 'donut',
            height: 260,
            animations: { enabled: true, speed: 800 }
        },
        labels: ['Critical', 'High', 'Medium', 'Low'],
        colors: ['#d63939', '#f76707', '#f59f00', '#2fb344'],
        legend: { position: 'bottom' },
        dataLabels: { enabled: true },
        plotOptions: {
            pie: {
                donut: {
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total CVEs',
                            formatter: () => cves.length
                        }
                    }
                }
            }
        }
    };

    if (component.detailCvesChart) {
        component.detailCvesChart.updateOptions(options);
    } else {
        component.detailCvesChart = new ApexCharts(component.detailCvesChartEl, options);
        component.detailCvesChart.render();
    }
}

/**
 * Render session chart (client version timeline)
 */
export function renderSessionChart(component) {
    if (!component.state.sessionExpanded || component.state.sessionTab !== 'version') {
        destroySessionChart(component, '', false);
        return;
    }

    const sessions = component.state.deviceSessions;
    const monitoringSessions = component.getMonitoringSessions(sessions);
    const combinedSessions = Array.isArray(monitoringSessions) && monitoringSessions.length > 0
        ? monitoringSessions
        : component.getVersionSessions(sessions);

    if (!window.ApexCharts) {
        destroySessionChart(component, 'Monitoring sessions unavailable (charts not loaded).');
        return;
    }

    if (!Array.isArray(combinedSessions) || combinedSessions.length === 0) {
        destroySessionChart(component, 'No monitoring sessions in this window.');
        return;
    }

    if (!component.sessionChartEl) {
        console.warn('[DeviceDetail] sessionChartEl not available');
        return;
    }

    const toTimestamp = (value) => {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : NaN;
    };

    const now = Date.now();
    const normalizeSeg = (seg) => {
        const startTs = toTimestamp(seg.StartUtc ?? seg.startUtc ?? seg.start);
        const endCandidate = toTimestamp(seg.EndUtc ?? seg.endUtc ?? seg.end);
        const sysStartTs = toTimestamp(seg.SystemStartUtc ?? seg.systemStartUtc);
        if (!Number.isFinite(startTs)) return null;

        const closedEnd = Number.isFinite(endCandidate) ? endCandidate : startTs;
        const endTs = (seg.IsOpen || seg.isOpen) ? now : closedEnd;
        const finalEnd = Number.isFinite(endTs) ? Math.max(startTs, endTs) : startTs;
        const safeEnd = Number.isFinite(finalEnd) ? Math.max(startTs + 1, finalEnd) : startTs + 1;
        if (!Number.isFinite(safeEnd)) return null;

        const glitches = Array.isArray(seg.Glitches) ? seg.Glitches : Array.isArray(seg.glitches) ? seg.glitches : [];
        const samples = seg.Samples ?? seg.samples ?? 0;
        return {
            label: component.formatMonitoringLabel(seg),
            startTs,
            endTs: safeEnd,
            systemStartTs: Number.isFinite(sysStartTs) ? sysStartTs : null,
            glitches,
            samples
        };
    };

    const normalized = combinedSessions
        .map(normalizeSeg)
        .filter(Boolean)
        .sort((a, b) => a.startTs - b.startTs);

    const monitoringData = normalized.map(seg => ({ 
        x: 'Monitoring', 
        y: [seg.startTs, seg.endTs], 
        glitches: seg.glitches, 
        samples: seg.samples, 
        versionLabel: seg.label 
    }));

    const hasInvalid = monitoringData.some(d => !Number.isFinite(d.y?.[0]) || !Number.isFinite(d.y?.[1]));
    if (hasInvalid) {
        console.warn('[DeviceDetail] Skipping monitoring session chart due to invalid timestamps', { monitoringData });
        destroySessionChart(component, 'Monitoring session history unavailable (invalid timestamps).');
        return;
    }

    if (monitoringData.length === 0) {
        destroySessionChart(component, 'No monitoring sessions in this window.');
        return;
    }

    const systemSeries = [];
    const offlineSeries = [];
    const noCoverageSeries = [];
    normalized.forEach((seg, idx) => {
        const sysStart = seg.systemStartTs ?? seg.startTs;
        systemSeries.push({ x: 'System', y: [sysStart, seg.endTs] });

        if (Number.isFinite(sysStart) && sysStart < seg.startTs) {
            noCoverageSeries.push({ x: 'System', y: [sysStart, seg.startTs] });
        }

        const next = normalized[idx + 1];
        const nextStart = next ? (next.systemStartTs ?? next.startTs) : null;
        if (Number.isFinite(nextStart) && seg.endTs < nextStart) {
            offlineSeries.push({ x: 'System', y: [seg.endTs, nextStart] });
        }
    });

    if (component.sessionChart) {
        component.sessionChart.destroy();
        component.sessionChart = null;
    }

    if (component.sessionChartEl) {
        component.sessionChartEl.innerHTML = '';
    }

    const options = {
        chart: {
            type: 'rangeBar',
            height: 260,
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                horizontal: true,
                barHeight: '70%',
                rangeBarGroupRows: true
            }
        },
        series: [
            ...(offlineSeries.length ? [{ name: 'Offline', data: offlineSeries, color: '#868e96' }] : []),
            ...(systemSeries.length ? [{ name: 'System Up', data: systemSeries, color: '#1c7ed6' }] : []),
            ...(noCoverageSeries.length ? [{ name: 'No Coverage', data: noCoverageSeries, color: '#f03e3e' }] : []),
            { name: 'Monitoring', data: monitoringData, color: '#2f9e44' }
        ],
        colors: ['#868e96', '#1c7ed6', '#f03e3e', '#2f9e44'],
        fill: { opacity: [0.65, 0.75, 0.85, 1] },
        legend: { show: true, position: 'top' },
        dataLabels: {
            enabled: true,
            formatter: (_val, opts) => {
                const series = opts.w?.config?.series?.[opts.seriesIndex];
                const point = series?.data?.[opts.dataPointIndex];
                if (series?.name === 'Monitoring') {
                    return point?.versionLabel || 'Monitoring';
                }
                return series?.name || '';
            },
            style: { colors: ['#fff'], fontSize: '11px' }
        },
        xaxis: {
            type: 'datetime',
            labels: { datetimeFormatter: { hour: 'MMM dd HH:mm', day: 'MMM dd' } }
        },
        yaxis: {
            categories: ['Monitoring', 'System'],
            reversed: true,
            labels: { style: { fontSize: '11px' } }
        },
        grid: { strokeDashArray: 4 },
        tooltip: {
            custom: ({ seriesIndex, dataPointIndex, w }) => {
                const series = w?.config?.series?.[seriesIndex];
                const seg = series?.data?.[dataPointIndex];
                if (!seg) return '';
                const fmt = (v) => new Date(v).toLocaleString();
                const glitches = Array.isArray(seg.glitches) ? seg.glitches : [];
                const glitchCount = glitches.length;
                const samples = Number(seg.samples) || 0;
                const glitchDetails = series?.name === 'Monitoring' && glitchCount > 0 ? `<div class="text-muted small">Glitches: ${glitchCount}</div>` : '';
                const sampleDetails = series?.name === 'Monitoring' ? `<div class="text-muted small">Samples: ${samples}</div>` : '';
                const offlineNote = series?.name === 'Offline' ? '<div class="text-muted small">System state unknown or powering off; monitoring not running.</div>' : '';
                const noCoverageNote = series?.name === 'No Coverage' ? '<div class="text-muted small">System up but monitoring inactive.</div>' : '';
                return `
                    <div class="apex-tooltip p-2">
                        <div><strong>${series?.name || ''}</strong>${seg.versionLabel && series?.name === 'Monitoring' ? ` · ${seg.versionLabel}` : ''}</div>
                        <div class="text-muted small">${fmt(seg.y[0])} – ${fmt(seg.y[1])}</div>
                        ${sampleDetails}
                        ${glitchDetails}
                        ${offlineNote}
                        ${noCoverageNote}
                    </div>`;
            }
        }
    };

    component.sessionChart = new window.ApexCharts(component.sessionChartEl, options);
    component.sessionChart.render();
}

/**
 * Render PID session chart
 */
export function renderPidSessionChart(component) {
    if (!component.state.sessionExpanded || component.state.sessionTab !== 'pid') {
        destroyPidSessionChart(component);
        return;
    }

    const sessions = component.state.deviceSessions;
    const pidSessionsRaw = component.getPidSessions(sessions);
    const pidSessions = Array.isArray(pidSessionsRaw)
        ? pidSessionsRaw.filter(seg => seg && (seg.Pid || seg.pid || seg.Label || seg.label))
        : [];

    if (!window.ApexCharts) {
        destroyPidSessionChart(component, 'PID session history unavailable (charts not loaded).');
        return;
    }

    if (!Array.isArray(pidSessions) || pidSessions.length === 0) {
        destroyPidSessionChart(component, 'No PID session history in this window.');
        return;
    }

    const pidSessionChartEl = document.getElementById('pid-session-chart');
    if (!pidSessionChartEl) return;

    component.pidSessionChartEl = pidSessionChartEl;

    const toTimestamp = (value) => {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : NaN;
    };

    const now = Date.now();
    const mapSegments = (segments, labelResolver) => segments
        .map(seg => {
            const label = labelResolver(seg) || 'PID';
            const startTs = toTimestamp(seg.StartUtc ?? seg.startUtc ?? seg.start);
            const endCandidate = toTimestamp(seg.EndUtc ?? seg.endUtc ?? seg.end);
            if (!Number.isFinite(startTs)) return null;

            const closedEnd = Number.isFinite(endCandidate) ? endCandidate : startTs;
            const endTs = (seg.IsOpen || seg.isOpen) ? now : closedEnd;
            const finalEnd = Number.isFinite(endTs) ? Math.max(startTs, endTs) : startTs;
            const safeEnd = Number.isFinite(finalEnd) ? Math.max(startTs + 1, finalEnd) : startTs + 1;

            if (!Number.isFinite(safeEnd)) return null;

            return { x: label, y: [startTs, safeEnd] };
        })
        .filter(seg => seg && Number.isFinite(seg.y?.[0]) && Number.isFinite(seg.y?.[1]))
        .sort((a, b) => a.y[0] - b.y[0]);

    const pidData = mapSegments(pidSessions, (seg) => seg.Pid || seg.pid || seg.Label || seg.label)
        .map((seg, idx) => ({ ...seg, x: `Session ${idx + 1}` }));

    const hasInvalid = pidData.some(d => !Number.isFinite(d.y?.[0]) || !Number.isFinite(d.y?.[1]));
    if (hasInvalid) {
        console.warn('[DeviceDetail] Skipping PID session chart due to invalid timestamps', { pidData });
        destroyPidSessionChart(component, 'PID session history unavailable (invalid timestamps).');
        return;
    }

    if (pidData.length === 0) {
        destroyPidSessionChart(component, 'No PID session history in this window.');
        return;
    }

    if (component.pidSessionChart) {
        component.pidSessionChart.destroy();
        component.pidSessionChart = null;
    }

    if (component.pidSessionChartEl) {
        component.pidSessionChartEl.innerHTML = '';
    }

    const options = {
        chart: {
            type: 'rangeBar',
            height: 220,
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                horizontal: true,
                barHeight: '70%'
            }
        },
        series: [{ name: 'PID', data: pidData }],
        colors: ['#0ca678'],
        legend: { show: false },
        dataLabels: { enabled: false },
        xaxis: {
            type: 'datetime',
            labels: { datetimeFormatter: { hour: 'MMM dd HH:mm', day: 'MMM dd' } }
        },
        yaxis: { labels: { style: { fontSize: '11px' } } },
        grid: { strokeDashArray: 4 },
        tooltip: {
            custom: ({ seriesIndex, dataPointIndex, w }) => {
                const series = w?.config?.series?.[seriesIndex];
                const seg = series?.data?.[dataPointIndex];
                if (!seg) return '';
                const fmt = (v) => new Date(v).toLocaleString();
                return `
                    <div class="apex-tooltip p-2">
                        <div><strong>${seg.x || ''}</strong></div>
                        <div class="text-muted small">${fmt(seg.y[0])} – ${fmt(seg.y[1])}</div>
                    </div>`;
            }
        }
    };

    component.pidSessionChart = new window.ApexCharts(component.pidSessionChartEl, options);
    component.pidSessionChart.render();
}

/**
 * Render performance charts (CPU, memory, disk)
 */
export function renderPerfCharts(component) {
    if (!window.ApexCharts) {
        console.warn('[DeviceDetail] ApexCharts not available for perf charts');
        return;
    }

    if (!component.state.sessionExpanded || component.state.sessionTab !== 'perf') {
        destroyPerfCharts(component);
        return;
    }

    const perf = component.state.perfData;
    const rawPoints = Array.isArray(perf?.points) ? perf.points : [];

    const coerceTs = (p) => {
        const candidate = p.timestamp ?? p.bucketStartUtc ?? p.BucketStartUtc ?? p.bucketUtc ?? p.BucketUtc ?? p.startUtc ?? p.StartUtc;
        if (Number.isFinite(candidate)) return candidate;
        const ts = new Date(candidate).getTime();
        return Number.isFinite(ts) ? ts : NaN;
    };

    const validPoints = rawPoints
        .map((p) => ({ ...p, __ts: coerceTs(p) }))
        .filter((p) => Number.isFinite(p.__ts));

    if (!perf || validPoints.length === 0) {
        destroyPerfCharts(component);
        return;
    }

    const clampPct = (val) => {
        const n = Number(val);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    };

    const numeric = (val) => {
        const n = Number(val);
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    };

    const points = validPoints
        .map(p => ({
            ts: p.__ts,
            cpu: clampPct(p.cpuAvg ?? p.CpuAvg ?? p.avgCpu ?? p.AvgCpu),
            memPct: clampPct(p.memoryAvg ?? p.MemoryAvg ?? p.avgMemory ?? p.AvgMemory),
            memMb: numeric(p.memoryAvgMb ?? p.MemoryAvgMb ?? p.avgMemoryMb ?? p.AvgMemoryMb),
            diskTotal: numeric(p.diskTotalMbAvg ?? p.DiskTotalMbAvg ?? p.diskAvg ?? p.DiskAvg ?? p.avgDisk ?? p.AvgDisk),
            diskApp: numeric(p.diskAppMbAvg ?? p.DiskAppMbAvg ?? p.avgDiskApp ?? p.AvgDiskApp),
            diskIntel: numeric(p.diskIntelMbAvg ?? p.DiskIntelMbAvg ?? p.avgDiskIntel ?? p.AvgDiskIntel),
            netMbps: numeric(p.networkMbpsAvg ?? p.NetworkMbpsAvg ?? p.networkAvg ?? p.NetworkAvg ?? p.avgNetwork ?? p.AvgNetwork),
            netSentBytes: numeric(p.networkBytesSent ?? p.NetworkBytesSent ?? 0),
            netRecvBytes: numeric(p.networkBytesReceived ?? p.NetworkBytesReceived ?? 0),
            netRequests: numeric(p.networkRequests ?? p.NetworkRequests ?? 0),
            netFailures: numeric(p.networkFailures ?? p.NetworkFailures ?? 0)
        }))
        .filter(p => Number.isFinite(p.ts))
        .sort((a, b) => a.ts - b.ts);

    if (points.length === 0) {
        destroyPerfCharts(component);
        return;
    }

    const buildAnnotations = (percentiles, formatter) => {
        if (!percentiles) return [];
        const lines = [];
        const addLine = (value, label, color) => {
            if (!Number.isFinite(value)) return;
            lines.push({
                y: value,
                borderColor: color,
                strokeDashArray: 4,
                label: {
                    borderColor: color,
                    style: { color: '#000', background: '#fff' },
                    text: `${label} ${formatter(value)}`
                }
            });
        };
        addLine(percentiles.p50, 'P50', '#868e96');
        addLine(percentiles.p90, 'P90', '#fab005');
        addLine(percentiles.p95, 'P95', '#d63939');
        return lines;
    };

    const chartConfigs = [
        {
            key: 'cpu',
            el: 'perfCpuEl',
            series: [
                { name: 'CPU %', data: points.map(p => [p.ts, p.cpu]) }
            ],
            colors: ['#206bc4'],
            yaxis: [{ min: 0, max: 100, labels: { formatter: (val) => `${Math.round(val)}%` }, title: { text: 'CPU (%)' } }],
            tooltipFormatter: (val) => `${Math.round(val)}%`,
            annotations: buildAnnotations(component.calculatePercentiles(points.map(p => p.cpu)), (v) => `${Math.round(v)}%`)
        },
        {
            key: 'mem',
            el: 'perfMemEl',
            series: [
                { name: 'Memory %', data: points.map(p => [p.ts, p.memPct]) },
                { name: 'Memory MB', data: points.map(p => [p.ts, p.memMb]) }
            ],
            colors: ['#0ca678', '#15aabf'],
            yaxis: [
                { min: 0, max: 100, labels: { formatter: (val) => `${Math.round(val)}%` }, title: { text: 'Memory (%)' } },
                { opposite: true, labels: { formatter: (val) => `${Math.round(val)} MB` }, title: { text: 'Working Set (MB)' } }
            ],
            tooltipFormatter: (val, opts) => opts.seriesIndex === 0 ? `${Math.round(val)}%` : `${Math.round(val)} MB`,
            annotations: buildAnnotations(component.calculatePercentiles(points.map(p => p.memPct)), (v) => `${Math.round(v)}%`)
        },
        {
            key: 'disk',
            el: 'perfDiskEl',
            series: [
                { name: 'Total MB', data: points.map(p => [p.ts, p.diskTotal]) },
                { name: 'App DB MB', data: points.map(p => [p.ts, p.diskApp]) },
                { name: 'Intel DB MB', data: points.map(p => [p.ts, p.diskIntel]) }
            ],
            colors: ['#fab005', '#ffa94d', '#ffd43b'],
            yaxis: [{ min: 0, labels: { formatter: (val) => `${Math.round(val)} MB` }, title: { text: 'DB Size (MB)' } }],
            tooltipFormatter: (val) => `${Math.round(val)} MB`,
            annotations: buildAnnotations(component.calculatePercentiles(points.map(p => p.diskTotal)), (v) => `${Math.round(v)} MB`)
        },
        {
            key: 'net',
            el: 'perfNetEl',
            series: [
                { name: 'Throughput Mbps', type: 'area', data: points.map(p => [p.ts, p.netMbps]) },
                { name: 'Requests', type: 'column', data: points.map(p => [p.ts, p.netRequests]) },
                { name: 'Failures', type: 'column', data: points.map(p => [p.ts, p.netFailures]) }
            ],
            colors: ['#a34ee3', '#2fb344', '#d63939'],
            yaxis: [
                { labels: { formatter: (val) => `${Math.round(val)} Mbps` }, title: { text: 'Network (Mbps)' } },
                { opposite: true, labels: { formatter: (val) => `${Math.round(val)}` }, title: { text: 'Requests / Failures' } }
            ],
            tooltipFormatter: (val, opts) => {
                if (opts.seriesIndex === 0) return `${Math.round(val)} Mbps`;
                const point = points[opts.dataPointIndex] || {};
                const sent = component.formatBytesHuman(point.netSentBytes);
                const recv = component.formatBytesHuman(point.netRecvBytes);
                if (opts.seriesIndex === 1) return `${Math.round(val)} requests (sent ${sent}, recv ${recv})`;
                return `${Math.round(val)} failures (sent ${sent}, recv ${recv})`;
            },
            annotations: buildAnnotations(component.calculatePercentiles(points.map(p => p.netMbps)), (v) => `${Math.round(v)} Mbps`)
        }
    ];

    chartConfigs.forEach(cfg => {
        const el = component[cfg.el];
        if (!el) return;

        const seriesData = (cfg.series || []).map((s) => ({
            name: s.name,
            type: s.type || 'area',
            data: s.data.filter(([ts, val]) => Number.isFinite(ts) && Number.isFinite(val))
        })).filter(s => s.data.length > 0);

        const hasInvalid = seriesData.some(s => s.data.some(([ts, val]) => !Number.isFinite(ts) || !Number.isFinite(val)));
        if (hasInvalid || seriesData.length === 0) {
            console.warn('[DeviceDetail] Skipping perf chart due to invalid series', cfg.key);
            if (component.perfCharts[cfg.key]) {
                component.perfCharts[cfg.key].destroy();
                component.perfCharts[cfg.key] = null;
            }
            return;
        }

        if (seriesData.length === 0) {
            if (component.perfCharts[cfg.key]) {
                component.perfCharts[cfg.key].destroy();
                component.perfCharts[cfg.key] = null;
            }
            return;
        }

        if (component.perfCharts[cfg.key]) {
            component.perfCharts[cfg.key].destroy();
            component.perfCharts[cfg.key] = null;
        }

        const options = {
            chart: {
                height: 220,
                toolbar: { show: false },
                animations: { enabled: true },
                stacked: cfg.key === 'disk'
            },
            colors: cfg.colors,
            stroke: { curve: 'straight', width: 2 },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 0.6,
                    opacityFrom: 0.35,
                    opacityTo: 0.05
                }
            },
            dataLabels: { enabled: false },
            legend: { show: true },
            xaxis: {
                type: 'datetime',
                labels: { datetimeUTC: false }
            },
            yaxis: cfg.yaxis,
            tooltip: {
                shared: false,
                x: { format: 'MMM dd, HH:mm' },
                y: { formatter: cfg.tooltipFormatter }
            },
            annotations: { yaxis: cfg.annotations },
            series: seriesData
        };

        component.perfCharts[cfg.key] = new window.ApexCharts(el, options);
        component.perfCharts[cfg.key].render();
    });
}

/**
 * Destroy all detail charts
 */
export function destroyDetailCharts(component) {
    if (component.detailRiskChart) {
        component.detailRiskChart.destroy();
        component.detailRiskChart = null;
    }
    if (component.detailAppsChart) {
        component.detailAppsChart.destroy();
        component.detailAppsChart = null;
    }
    if (component.detailCvesChart) {
        component.detailCvesChart.destroy();
        component.detailCvesChart = null;
    }
    if (component.detailRiskChartEl) component.detailRiskChartEl.innerHTML = '';
    if (component.detailAppsChartEl) component.detailAppsChartEl.innerHTML = '';
    if (component.detailCvesChartEl) component.detailCvesChartEl.innerHTML = '';
}

/**
 * Destroy session chart
 */
export function destroySessionChart(component, message = '', destroyPidToo = true) {
    if (component.sessionChart) {
        component.sessionChart.destroy();
        component.sessionChart = null;
    }
    if (component.sessionChartEl) {
        component.sessionChartEl.innerHTML = message ? `<p class="text-muted text-center">${message}</p>` : '';
    }

    // Also clear PID chart to keep both timelines in sync when requested
    if (destroyPidToo) {
        destroyPidSessionChart(component);
    }
}

/**
 * Destroy PID session chart
 */
export function destroyPidSessionChart(component, message = '') {
    if (component.pidSessionChart && typeof component.pidSessionChart.destroy === 'function') {
        component.pidSessionChart.destroy();
        component.pidSessionChart = null;
    }

    if (component.pidSessionChartEl) {
        component.pidSessionChartEl.innerHTML = message ? `<div class="text-muted small">${message}</div>` : '';
    }
}

/**
 * Destroy performance charts
 */
export function destroyPerfCharts(component) {
    Object.keys(component.perfCharts || {}).forEach(key => {
        if (component.perfCharts[key]) {
            component.perfCharts[key].destroy();
            component.perfCharts[key] = null;
        }
    });

    ['perfCpuEl', 'perfMemEl', 'perfDiskEl', 'perfNetEl'].forEach(ref => {
        if (component[ref]) {
            component[ref].innerHTML = '';
        }
    });
}
