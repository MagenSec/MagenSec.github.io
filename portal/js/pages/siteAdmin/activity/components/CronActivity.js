/**
 * Cron Activity Page - View cron job executions and report email activity
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import toast from '@toast';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

const LANE_ORDER = ['hot-detect', 'intel', 'sealed-org-data', 'business-ops', 'low-priority', 'manual'];
const LANE_LABELS = {
    'hot-detect': 'Hot Detect',
    'intel': 'Intel',
    'sealed-org-data': 'Sealed Org Data',
    'business-ops': 'Business Ops',
    'low-priority': 'Low Priority',
    'manual': 'Manual'
};

const normalizeLaneId = (laneId) => String(laneId || '').trim().toLowerCase() || 'unassigned';

const formatLaneLabel = (laneId) => {
    const normalized = String(laneId || '').trim();
    if (!normalized) return 'Unassigned';
    return LANE_LABELS[normalized] || normalized
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const formatExecutionScope = (scopeId) => {
    const normalized = String(scopeId || 'global').trim().toLowerCase();
    if (!normalized || normalized === 'global') return 'Global';
    return normalized.toUpperCase();
};

const getCronEventStatus = (event) => String(
    event?.metadata?.status ||
    event?.metadata?.Status ||
    event?.status ||
    ''
).toLowerCase();

const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const getDurationMsFromEvent = (event) => {
    const meta = event?.metadata || {};
    if (meta.durationSeconds !== undefined) return Math.round(toNumber(meta.durationSeconds) * 1000);
    if (meta.DurationMs !== undefined) return toNumber(meta.DurationMs);
    if (meta.durationMs !== undefined) return toNumber(meta.durationMs);
    if (meta.operationBudget?.durationMs !== undefined) return toNumber(meta.operationBudget.durationMs);
    if (meta.OperationBudget?.DurationMs !== undefined) return toNumber(meta.OperationBudget.DurationMs);
    return 0;
};

const getBudgetField = (budget, camelName, pascalName) => toNumber(
    budget?.[camelName] ?? budget?.[pascalName]
);

const getEventOperationBudget = (event) => {
    const meta = event?.metadata || {};
    const budget = meta.operationBudget || meta.OperationBudget || {};
    return {
        rowsScanned: getBudgetField(budget, 'rowsScanned', 'RowsScanned') + toNumber(meta.totalRowsScanned),
        rowsRead: getBudgetField(budget, 'rowsRead', 'RowsRead') + toNumber(meta.totalRowsRead),
        rowsWritten: getBudgetField(budget, 'rowsWritten', 'RowsWritten') + toNumber(meta.totalRowsWritten),
        rowsDeleted: getBudgetField(budget, 'rowsDeleted', 'RowsDeleted') + toNumber(meta.totalRowsDeleted),
        orgsTouched: getBudgetField(budget, 'orgsTouched', 'OrgsTouched'),
        devicesTouched: getBudgetField(budget, 'devicesTouched', 'DevicesTouched'),
        alertsTouched: getBudgetField(budget, 'alertsTouched', 'AlertsTouched')
    };
};

const getMetricValue = (...values) => {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
            return toNumber(value);
        }
    }

    return 0;
};

const getEventDiagnostics = (event) => {
    const meta = event?.metadata || {};
    return meta.diagnostics || meta.Diagnostics || meta.metrics || meta.Metrics || {};
};

const getEventVolumeMetrics = (event) => {
    const meta = event?.metadata || {};
    const diagnostics = getEventDiagnostics(event);
    const volume = meta.volumeMetrics || meta.VolumeMetrics || diagnostics.volumeMetrics || diagnostics.VolumeMetrics || {};
    const budget = getEventOperationBudget(event);
    const rowsCreated = getMetricValue(
        volume.rowsCreated,
        volume.RowsCreated,
        diagnostics.rowsCreated,
        diagnostics.RowsCreated,
        diagnostics.cacheInserts,
        diagnostics.CacheInserts,
        diagnostics.alertsOpened,
        diagnostics.AlertsOpened,
        diagnostics.alertsOpen,
        diagnostics.AlertsOpen
    );
    const rowsUpdated = getMetricValue(
        volume.rowsUpdated,
        volume.RowsUpdated,
        diagnostics.rowsUpdated,
        diagnostics.RowsUpdated,
        diagnostics.cacheUpdates,
        diagnostics.CacheUpdates,
        diagnostics.alertsResolved,
        diagnostics.AlertsResolved,
        diagnostics.alertsClosed,
        diagnostics.AlertsClosed,
        diagnostics.staleVulnerableDemotions,
        diagnostics.StaleVulnerableDemotions,
        diagnostics.staleVulnerableTrimmed,
        diagnostics.StaleVulnerableTrimmed
    );
    const rowsWrittenTotal = getMetricValue(volume.rowsWritten, volume.RowsWritten, budget.rowsWritten);
    const rowsWritten = rowsWrittenTotal > 0 ? rowsWrittenTotal : rowsCreated + rowsUpdated;

    return {
        eventsProcessed: getMetricValue(volume.eventsProcessed, volume.EventsProcessed, diagnostics.eventsProcessed, diagnostics.EventsProcessed, meta.itemsProcessed, meta.entriesRefreshed),
        rowsProcessed: getMetricValue(volume.rowsProcessed, volume.RowsProcessed, diagnostics.rowsProcessed, diagnostics.RowsProcessed, diagnostics.totalRows, diagnostics.TotalRows, meta.itemsProcessed, meta.entriesRefreshed),
        rowsRead: getMetricValue(volume.rowsRead, volume.RowsRead, budget.rowsRead),
        rowsCreated,
        rowsUpdated,
        rowsWritten,
        rowsDeleted: getMetricValue(volume.rowsDeleted, volume.RowsDeleted, budget.rowsDeleted),
        alertsGenerated: getMetricValue(volume.alertsGenerated, volume.AlertsGenerated, diagnostics.alertsGenerated, diagnostics.AlertsGenerated, diagnostics.alertsOpened, diagnostics.AlertsOpened, diagnostics.alertsOpen, diagnostics.AlertsOpen),
        alertsClosed: getMetricValue(volume.alertsClosed, volume.AlertsClosed, diagnostics.alertsClosed, diagnostics.AlertsClosed, diagnostics.alertsResolved, diagnostics.AlertsResolved),
        alertsTouched: getMetricValue(volume.alertsTouched, volume.AlertsTouched, budget.alertsTouched)
    };
};

const formatDuration = (durationMs) => {
    const ms = toNumber(durationMs);
    if (ms <= 0) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const formatCompactNumber = (value) => {
    const n = toNumber(value);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${Math.round(n)}`;
};

const formatPlural = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

const getScaleSeverityBadgeClass = (severity) => {
    const normalized = String(severity || '').toLowerCase();
    if (normalized === 'critical') return 'bg-danger text-white';
    if (normalized === 'warning') return 'bg-warning text-white';
    if (normalized === 'healthy') return 'bg-success text-white';
    return 'bg-secondary text-white';
};

const formatSampleWindow = (rangeDays) => {
    const days = Math.max(1, Number(rangeDays || 7));
    return days === 1 ? 'Last 24h' : `Last ${days}d`;
};

const getTaskIdFromEvent = (event) => {
    const meta = event?.metadata || {};
    const explicitTaskId = meta.taskId || meta.TaskId || meta.taskName || meta.TaskName || meta.jobId || meta.JobId;
    if (explicitTaskId) return String(explicitTaskId);

    const targetType = String(event?.targetType || '').trim();
    const syntheticTargets = new Set(['All', 'CronLane', 'System', 'Scheduled', 'Manual']);
    if (targetType && !syntheticTargets.has(targetType)) return targetType;

    return null;
};

const floorToUtcHour = (date) => new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours()
));

const formatHourLabel = (date) => date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric'
});

const formatHourTickLabel = (date, index) => {
    if (index === 0 || date.getUTCHours() === 0) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    if (date.getUTCHours() % 6 === 0) {
        return date.toLocaleTimeString(undefined, { hour: 'numeric' });
    }

    return '';
};

export function CronActivityPage({ cronStatus: propCronStatus, showHeader = true, embedded = false }) {
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [events, setEvents] = useState([]);
    const [rangeDays, setRangeDays] = useState(7);
    const [hasMore, setHasMore] = useState(false);
    const [continuationToken, setContinuationToken] = useState(null);
    const scrollObserverRef = useRef(null);
    const [filterJob, setFilterJob] = useState('all'); // 'all', 'CronExecution', 'ReportSent', 'ReportFailed', 'BatchComplete'
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterOrg, setFilterOrg] = useState('');
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [cronStatus, setCronStatus] = useState(propCronStatus || null);
    const [loadingCronStatus, setLoadingCronStatus] = useState(false);
    const [highlightedEventId, setHighlightedEventId] = useState(null);
    const [highlightedPartitionKey, setHighlightedPartitionKey] = useState(null);
    const [highlightedRowKey, setHighlightedRowKey] = useState(null);
    const [selectedAuditEvent, setSelectedAuditEvent] = useState(null);
    const [loadingSelectedAuditEvent, setLoadingSelectedAuditEvent] = useState(false);

    // Trace Viewer modal state
    const [traceModalOpen, setTraceModalOpen] = useState(false);
    const [tracePartitionKey, setTracePartitionKey] = useState('');
    const [traceTracingId, setTraceTracingId] = useState('');
    const [traceLogs, setTraceLogs] = useState([]);
    const [traceLoading, setTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState('');
    const [traceSortCol, setTraceSortCol] = useState('rowKey');
    const [traceSortDir, setTraceSortDir] = useState('asc');
    const [traceExpandedRows, setTraceExpandedRows] = useState(new Set());
    const [traceExpandedField, setTraceExpandedField] = useState(null); // {rowKey, field}

    const parseHashQuery = () => {
        const hash = window.location.hash || '';
        const queryIndex = hash.indexOf('?');
        if (queryIndex < 0) {
            return new URLSearchParams();
        }

        return new URLSearchParams(hash.substring(queryIndex + 1));
    };

    // Infinite scroll observer
    useEffect(() => {
        const observerTarget = scrollObserverRef.current;
        if (!observerTarget) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        observer.observe(observerTarget);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore]);

    useEffect(() => {
        const query = parseHashQuery();
        const eventId = query.get('eventId');
        const date = query.get('date') || query.get('partitionKey');
        const eventKey = query.get('eventKey') || query.get('rowKey');

        if (eventId) {
            setHighlightedEventId(eventId);
            setHighlightedPartitionKey(date);
            setHighlightedRowKey(eventKey);
            setFilterJob('CronExecution');
        }

        loadCronStatus();
        const retryTimer = window.setTimeout(() => {
            loadCronStatus();
        }, 2500);

        return () => window.clearTimeout(retryTimer);
    }, []);

    useEffect(() => {
        if (!highlightedEventId) {
            setSelectedAuditEvent(null);
            return;
        }

        let disposed = false;
        const loadSelectedAuditEvent = async () => {
            try {
                setLoadingSelectedAuditEvent(true);
                const response = await api.adminGetAuditEvent(highlightedEventId, {
                    date: highlightedPartitionKey,
                    eventKey: highlightedRowKey
                });

                if (disposed) {
                    return;
                }

                if (response?.success && response?.data) {
                    setSelectedAuditEvent(response.data);
                } else {
                    setSelectedAuditEvent(null);
                }
            } catch (err) {
                logger.error('[Cron Activity] Error loading selected audit event:', err);
                if (!disposed) {
                    setSelectedAuditEvent(null);
                }
            } finally {
                if (!disposed) {
                    setLoadingSelectedAuditEvent(false);
                }
            }
        };

        loadSelectedAuditEvent();
        return () => {
            disposed = true;
        };
    }, [highlightedEventId, highlightedPartitionKey, highlightedRowKey]);

    useEffect(() => {
        if (!highlightedEventId || !Array.isArray(events) || events.length === 0) {
            return;
        }

        const matched = events.find(e => e.eventId === highlightedEventId);
        if (!matched) {
            return;
        }

        setExpandedEvents((prev) => {
            if (prev.has(highlightedEventId)) {
                return prev;
            }

            const next = new Set(prev);
            next.add(highlightedEventId);
            return next;
        });

        window.setTimeout(() => {
            const row = document.getElementById(`cron-event-${highlightedEventId}`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }, [events, highlightedEventId]);

    useEffect(() => {
        loadCronEvents(true);
        const handler = () => {
            loadCronEvents(true);
        };
        const unsubscribe = orgContext.onChange(handler);
        window.addEventListener('orgChanged', handler);
        return () => {
            unsubscribe?.();
            window.removeEventListener('orgChanged', handler);
        };
    }, [rangeDays, filterJob, filterStatus, filterOrg]);

    // Load cron status (registered tasks, schedules, execution history)
    async function loadCronStatus() {
        setLoadingCronStatus(true);
        try {
            const res = await api.adminGetCronStatus();
            if (res.success && res.data) {
                setCronStatus(res.data);
            } else {
                logger.warn('[Cron Activity] Failed to load cron status:', res.message);
                // Continue with events even if status fails
            }
        } catch (err) {
            logger.error('[Cron Activity] Error loading cron status:', err);
            // Continue with events even if status fails
        } finally {
            setLoadingCronStatus(false);
        }
    }

    // Load more events (for infinite scroll)
    async function loadMore() {
        if (!continuationToken || !hasMore || loadingMore) return;
        logger.debug('[Cron Activity] Loading more events...');
        await loadCronEvents(false);
    }

    // Load cron events (initial or more)
    async function loadCronEvents(reset = true) {
        if (reset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        try {
            const query = new URLSearchParams({
                cronActivity: 'true',
                pageSize: '100',
                days: rangeDays.toString()
            });

            if (!reset && continuationToken) {
                query.set('continuationToken', continuationToken);
            }

            const res = await api.get(`/api/v1/admin/audit?${query.toString()}`);
            if (res.success && res.data) {
                const list = res.data.events || [];
                const newEvents = reset ? list : (() => {
                    const existingIds = new Set(events.map(e => e.eventId));
                    return [...events, ...list.filter(e => !existingIds.has(e.eventId))];
                })();
                setEvents(newEvents);
                setHasMore(res.data.hasMore || false);
                setContinuationToken(res.data.continuationToken || null);
            } else {
                toast.show(res.message || 'Failed to load cron activity', 'error');
                if (reset) setEvents([]);
            }
        } catch (err) {
            logger.error('[Cron Activity] Error loading events:', err);
            toast.show('Failed to load cron activity', 'error');
            if (reset) setEvents([]);
        } finally {
            if (reset) {
                setLoading(false);
            } else {
                setLoadingMore(false);
            }
        }
    }

    function renderEventRow(e) {
        const ts = e.timestamp ? new Date(e.timestamp).toLocaleString() : '-';
        const isExpanded = expandedEvents.has(e.eventId);
        
        // Determine event type category and badge color
        let eventCategory = 'Cron Run';
        let badgeClass = 'bg-primary-lt text-primary';
        let icon = 'ti-clock';
        
        if (e.eventType === 'CRONRUN') {
            const isManual = e.subType === 'CronRunManual' || e.subType === 'Manual';
            eventCategory = isManual ? 'Manual Trigger' : 'Scheduled Run';
            badgeClass = isManual ? 'bg-purple-lt text-purple' : 'bg-blue-lt text-blue';
            icon = isManual ? 'ti-hand-click' : 'ti-player-play';
        } else if (e.eventType === 'SECURITY_REPORT') {
            const stRaw = e.subType || '';
            const st = stRaw.toLowerCase();
            if (st.includes('failed')) {
                eventCategory = 'Report Failed';
                badgeClass = 'bg-red-lt text-danger';
                icon = 'ti-mail-x';
            } else if (st.includes('batch')) {
                eventCategory = 'Report Batch';
                badgeClass = 'bg-green-lt text-success';
                icon = 'ti-mail-check';
            } else if (st.includes('emailsent') || st.includes('dispatchcomplete') || st.endsWith('sent')) {
                eventCategory = 'Report Sent';
                badgeClass = 'bg-green-lt text-success';
                icon = 'ti-mail-check';
            } else {
                eventCategory = 'Report Activity';
                badgeClass = 'bg-green-lt text-success';
                icon = 'ti-mail';
            }
        }
        
        // Extract metadata for detailed view
        const meta = e.metadata || {};
        const recipientCount = meta.recipientCount || 0;
        const tier = meta.tier || '';
        // Task 2: Fix duration display - handle new durationSeconds (float seconds) and legacy DurationMs (int milliseconds)
        const duration = meta.durationSeconds !== undefined
            ? (meta.durationSeconds < 1 
                ? `${Math.round(meta.durationSeconds * 1000)}ms` 
                : `${parseFloat(meta.durationSeconds).toFixed(2)}s`)
            : (meta.DurationMs !== undefined
                ? (meta.DurationMs < 1000
                    ? `${meta.DurationMs}ms`
                    : `${(meta.DurationMs / 1000).toFixed(2)}s`)
                : (meta.duration || ''));
        const itemsProcessed = meta.itemsProcessed || 0;
        const successful = meta.successful || 0;
        const failed = meta.failed || 0;
        const diagnostics = meta.diagnostics || meta.Diagnostics || null;
        const hasDiagnostics = diagnostics && typeof diagnostics === 'object';
        const diagnosticsEntries = hasDiagnostics ? Object.entries(diagnostics) : [];
        
        const isHighlighted = highlightedEventId && highlightedEventId === e.eventId;

        return html`
            <tr id=${`cron-event-${e.eventId}`} class="cursor-pointer ${isHighlighted ? 'table-warning' : ''}" onClick=${() => {
                const newSet = new Set(expandedEvents);
                if (isExpanded) newSet.delete(e.eventId);
                else newSet.add(e.eventId);
                setExpandedEvents(newSet);
            }}>
                <td>
                    <i class="ti ${icon} me-2 ${badgeClass.replace('-lt', '')}"></i>
                    <span class="badge ${badgeClass}">${eventCategory}</span>
                </td>
                <td>
                    <span class="badge bg-secondary-lt text-secondary">${e.orgId || 'SYSTEM'}</span>
                </td>
                <td class="text-muted small">${ts}</td>
                <td>
                    ${tier && html`<span class="badge bg-purple-lt text-purple me-1">${tier}</span>`}
                    ${recipientCount > 0 && html`<span class="badge bg-info-lt text-info me-1">${recipientCount} recipient${recipientCount > 1 ? 's' : ''}</span>`}
                    ${itemsProcessed > 0 && html`<span class="badge bg-yellow-lt text-yellow">${itemsProcessed} processed</span>`}
                </td>
                <td class="text-truncate" style="max-width: 300px;" title=${e.description}>
                    ${e.description || '-'}
                </td>
                <td>
                    <i class="ti ti-chevron-${isExpanded ? 'up' : 'down'}"></i>
                </td>
            </tr>
            ${isExpanded && html`
                <tr class="activity-details-row">
                    <td colspan="6">
                        <div class="p-3">
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <strong>Event Details</strong>
                                    <ul class="list-unstyled mt-2 mb-0">
                                        <li><strong>Event ID:</strong> ${e.eventId}</li>
                                        <li><strong>Event Type:</strong> ${e.eventType}</li>
                                        <li><strong>Performed By:</strong> ${e.performedBy || 'system'}</li>
                                        ${e.targetId && html`<li><strong>Target:</strong> ${e.targetType || 'N/A'} (${e.targetId})</li>`}
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <strong>Execution Metrics</strong>
                                    <ul class="list-unstyled mt-2 mb-0">
                                        ${duration && html`<li><strong>Duration:</strong> ${duration}</li>`}
                                        ${successful > 0 && html`<li><strong>Successful:</strong> <span class="text-success">${successful}</span></li>`}
                                        ${failed > 0 && html`<li><strong>Failed:</strong> <span class="text-danger">${failed}</span></li>`}
                                        ${meta.maxRetries && html`<li><strong>Retries:</strong> ${meta.attempt || 1} of ${meta.maxRetries}</li>`}
                                    </ul>
                                </div>
                                ${meta.error && html`
                                    <div class="col-12">
                                        <div class="alert alert-danger mb-0">
                                            <strong>Error:</strong> ${meta.error}
                                        </div>
                                    </div>
                                `}
                                ${hasDiagnostics && html`
                                    <div class="col-12">
                                        <div class="alert alert-info mb-0">
                                            <div class="fw-semibold mb-2">Execution Diagnostics</div>
                                            <div class="row g-2">
                                                ${diagnosticsEntries.map(([key, value]) => {
                                                    const formattedValue = Array.isArray(value)
                                                        ? value.join(', ')
                                                        : (typeof value === 'object' && value !== null)
                                                            ? JSON.stringify(value)
                                                            : String(value);
                                                    return html`
                                                        <div class="col-md-6 col-lg-4">
                                                            <div class="small text-muted">${key}</div>
                                                            <div class="fw-semibold">${formattedValue}</div>
                                                        </div>
                                                    `;
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                `}
                                ${meta.RequestId && html`
                                    <div class="col-12">
                                        <button class="btn btn-sm btn-outline-primary" onClick=${(ev) => {
                                            ev.stopPropagation();
                                            const eventDate = e.timestamp ? new Date(e.timestamp) : new Date();
                                            const pk = eventDate.getFullYear().toString()
                                                + String(eventDate.getMonth() + 1).padStart(2, '0')
                                                + String(eventDate.getDate()).padStart(2, '0');
                                            openTraceModal(pk, meta.RequestId);
                                        }}>
                                            <i class="ti ti-list-search me-1"></i>
                                            View Trace (${meta.RequestId})
                                        </button>
                                    </div>
                                `}
                                ${Object.keys(meta).length > 0 && html`
                                    <div class="col-12">
                                        <details>
                                            <summary class="cursor-pointer text-muted small">Raw Metadata</summary>
                                            <pre class="activity-details-pre mt-2 mb-0 small p-2 rounded">${JSON.stringify(meta, null, 2)}</pre>
                                        </details>
                                    </div>
                                `}
                            </div>
                        </div>
                    </td>
                </tr>
            `}
        `;
    }
    
    // Filter events based on selected criteria
    const filteredEvents = events.filter(e => {
        if (filterJob !== 'all') {
            const jobMatch = 
                (filterJob === 'CronExecution' && e.eventType === 'CRONRUN') ||
                (filterJob === 'ReportSent' && (e.eventType === 'SECURITY_REPORT' && (e.subType === 'SecurityReportEmailSent' || e.subType === 'SecurityReportDispatchComplete' || e.subType === 'SecurityReportSent' || e.subType === 'SENT'))) ||
                (filterJob === 'ReportFailed' && (e.eventType === 'SECURITY_REPORT' && (e.subType === 'SecurityReportFailed' || e.subType === 'FAILED'))) ||
                (filterJob === 'BatchComplete' && (e.eventType === 'SECURITY_REPORT' && (e.subType === 'SecurityReportBatchComplete' || e.subType === 'BATCH')));
            if (!jobMatch) return false;
        }
        if (filterStatus !== 'all') {
            const statusMatch = (() => {
                const status = getCronEventStatus(e);
                if (filterStatus === 'success') {
                    if (e.eventType === 'CRONRUN') {
                        return !status || status === 'completed' || status === 'success';
                    }
                    if (e.eventType === 'SECURITY_REPORT') {
                        return ((e.subType || '').toLowerCase().includes('failed')) === false;
                    }
                    return false;
                }
                if (filterStatus === 'failed') {
                    if (e.eventType === 'CRONRUN') {
                        return ['failed', 'exception', 'rejected', 'partialfailure', 'cancelled', 'canceled', 'timedout'].includes(status);
                    }
                    if (e.eventType === 'SECURITY_REPORT') {
                        return e.subType === 'SecurityReportFailed' || e.subType === 'FAILED';
                    }
                    return false;
                }
                if (filterStatus === 'running') {
                    return e.eventType === 'CRONRUN' && status === 'running';
                }
                if (filterStatus === 'queued') {
                    return e.eventType === 'CRONRUN' && status === 'queued';
                }
                return true;
            })();
            if (!statusMatch) return false;
        }
        if (filterOrg && filterOrg.trim() !== '') {
            if (!e.orgId || !e.orgId.toLowerCase().includes(filterOrg.toLowerCase())) return false;
        }
        return true;
    });

    const dailyTrend = (() => {
        const safeDays = Math.max(1, Number(rangeDays || 7));
        const now = new Date();
        const buckets = new Map();

        for (let i = safeDays - 1; i >= 0; i--) {
            const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const key = day.toISOString().slice(0, 10);
            buckets.set(key, {
                key,
                label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                success: 0,
                failed: 0,
                manual: 0,
                scheduled: 0
            });
        }

        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
            const ts = evt?.timestamp ? new Date(evt.timestamp) : null;
            if (!ts || Number.isNaN(ts.getTime())) continue;

            const key = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())).toISOString().slice(0, 10);
            const bucket = buckets.get(key);
            if (!bucket) continue;

            const status = String(evt?.metadata?.status || evt?.metadata?.Status || evt?.status || '').toLowerCase();
            const isSuccess = !status || status === 'completed' || status === 'success';
            if (isSuccess) bucket.success += 1;
            else bucket.failed += 1;

            const isManual = String(evt?.subType || '').toLowerCase().includes('manual');
            if (isManual) bucket.manual += 1;
            else bucket.scheduled += 1;
        }

        const points = Array.from(buckets.values());
        const max = Math.max(1, ...points.map((p) => p.success + p.failed));
        const totals = points.reduce((acc, p) => {
            acc.success += p.success;
            acc.failed += p.failed;
            acc.manual += p.manual;
            acc.scheduled += p.scheduled;
            return acc;
        }, { success: 0, failed: 0, manual: 0, scheduled: 0 });

        return { points, max, totals };
    })();

    const runtimeTrend = (() => {
        const safeDays = Math.max(1, Number(rangeDays || 7));
        const now = new Date();
        const buckets = new Map();

        for (let i = safeDays - 1; i >= 0; i--) {
            const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const key = day.toISOString().slice(0, 10);
            buckets.set(key, {
                key,
                label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                durationMs: 0,
                runs: 0,
                itemsProcessed: 0,
                rowsRead: 0,
                rowsWritten: 0,
                rowsDeleted: 0
            });
        }

        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
            const ts = evt?.timestamp ? new Date(evt.timestamp) : null;
            if (!ts || Number.isNaN(ts.getTime())) continue;

            const key = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())).toISOString().slice(0, 10);
            const bucket = buckets.get(key);
            if (!bucket) continue;

            const durationMs = getDurationMsFromEvent(evt);
            const budget = getEventOperationBudget(evt);
            bucket.durationMs += durationMs;
            bucket.runs += durationMs > 0 ? 1 : 0;
            bucket.itemsProcessed += toNumber(evt?.metadata?.itemsProcessed ?? evt?.metadata?.entriesRefreshed);
            bucket.rowsRead += budget.rowsRead;
            bucket.rowsWritten += budget.rowsWritten;
            bucket.rowsDeleted += budget.rowsDeleted;
        }

        const points = Array.from(buckets.values());
        const maxDurationMs = Math.max(1, ...points.map((p) => p.durationMs));
        const maxRows = Math.max(1, ...points.map((p) => p.rowsRead + p.rowsWritten + p.rowsDeleted));
        const totals = points.reduce((acc, p) => {
            acc.durationMs += p.durationMs;
            acc.runs += p.runs;
            acc.itemsProcessed += p.itemsProcessed;
            acc.rowsRead += p.rowsRead;
            acc.rowsWritten += p.rowsWritten;
            acc.rowsDeleted += p.rowsDeleted;
            return acc;
        }, { durationMs: 0, runs: 0, itemsProcessed: 0, rowsRead: 0, rowsWritten: 0, rowsDeleted: 0 });

        return { points, maxDurationMs, maxRows, totals };
    })();

    const hourlyCrudTrend = (() => {
        const eventTimes = filteredEvents
            .map((event) => event?.timestamp ? new Date(event.timestamp) : null)
            .filter((date) => date && !Number.isNaN(date.getTime()))
            .sort((a, b) => a - b);

        if (eventTimes.length === 0) {
            return {
                points: [],
                spikeHours: [],
                maxCrudOps: 1,
                maxAuditEvents: 1,
                spanLabel: 'No loaded audit rows',
                totals: { auditEvents: 0, eventsProcessed: 0, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsWritten: 0, rowsDeleted: 0, crudOps: 0 }
            };
        }

        const hourMs = 60 * 60 * 1000;
        const maxBuckets = 24 * 7;
        const firstLoadedHour = floorToUtcHour(eventTimes[0]);
        const lastLoadedHour = floorToUtcHour(eventTimes[eventTimes.length - 1]);
        const startHour = new Date(Math.max(firstLoadedHour.getTime(), lastLoadedHour.getTime() - ((maxBuckets - 1) * hourMs)));
        const buckets = new Map();

        for (let hour = new Date(startHour), index = 0; hour <= lastLoadedHour; hour = new Date(hour.getTime() + hourMs), index++) {
            const key = hour.toISOString();
            buckets.set(key, {
                key,
                hour: new Date(hour),
                label: formatHourLabel(hour),
                tickLabel: formatHourTickLabel(hour, index),
                auditEvents: 0,
                eventsProcessed: 0,
                rowsRead: 0,
                rowsCreated: 0,
                rowsUpdated: 0,
                rowsWritten: 0,
                rowsDeleted: 0,
                crudOps: 0
            });
        }

        for (const event of filteredEvents) {
            const timestamp = event?.timestamp ? new Date(event.timestamp) : null;
            if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
            const hour = floorToUtcHour(timestamp);
            if (hour < startHour || hour > lastLoadedHour) continue;

            const bucket = buckets.get(hour.toISOString());
            if (!bucket) continue;

            const volume = getEventVolumeMetrics(event);
            bucket.auditEvents += 1;
            bucket.eventsProcessed += volume.eventsProcessed;
            bucket.rowsRead += volume.rowsRead;
            bucket.rowsCreated += volume.rowsCreated;
            bucket.rowsUpdated += volume.rowsUpdated;
            bucket.rowsWritten += volume.rowsWritten;
            bucket.rowsDeleted += volume.rowsDeleted;
            bucket.crudOps += volume.rowsRead + volume.rowsWritten + volume.rowsDeleted;
        }

        const points = Array.from(buckets.values());
        const totals = points.reduce((acc, point) => {
            acc.auditEvents += point.auditEvents;
            acc.eventsProcessed += point.eventsProcessed;
            acc.rowsRead += point.rowsRead;
            acc.rowsCreated += point.rowsCreated;
            acc.rowsUpdated += point.rowsUpdated;
            acc.rowsWritten += point.rowsWritten;
            acc.rowsDeleted += point.rowsDeleted;
            acc.crudOps += point.crudOps;
            return acc;
        }, { auditEvents: 0, eventsProcessed: 0, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsWritten: 0, rowsDeleted: 0, crudOps: 0 });
        const maxCrudOps = Math.max(1, ...points.map((point) => point.crudOps));
        const maxAuditEvents = Math.max(1, ...points.map((point) => point.auditEvents));
        const spikeHours = [...points]
            .filter((point) => point.crudOps > 0 || point.auditEvents > 0)
            .sort((a, b) => (b.crudOps - a.crudOps) || (b.auditEvents - a.auditEvents))
            .slice(0, 5);
        const spanLabel = points.length === 1
            ? points[0].label
            : `${points[0].label} - ${points[points.length - 1].label}`;

        return { points, spikeHours, maxCrudOps, maxAuditEvents, spanLabel, totals };
    })();

    const efficiencyTrend = (() => {
        const points = runtimeTrend.points.map((point) => {
            const minutes = point.durationMs > 0 ? point.durationMs / 60000 : 0;
            const rowOps = point.rowsRead + point.rowsWritten + point.rowsDeleted;
            return {
                ...point,
                rowOps,
                workPerMinute: minutes > 0 ? point.itemsProcessed / minutes : 0,
                opsPerMinute: minutes > 0 ? rowOps / minutes : 0
            };
        });

        const maxWorkPerMinute = Math.max(1, ...points.map((point) => point.workPerMinute));
        const maxOpsPerMinute = Math.max(1, ...points.map((point) => point.opsPerMinute));
        const peakRuntimeDay = [...points].sort((a, b) => b.durationMs - a.durationMs)[0] || null;
        const peakOpsDay = [...points].sort((a, b) => b.rowOps - a.rowOps)[0] || null;
        const peakEfficiencyDay = [...points].sort((a, b) => b.workPerMinute - a.workPerMinute)[0] || null;

        return { points, maxWorkPerMinute, maxOpsPerMinute, peakRuntimeDay, peakOpsDay, peakEfficiencyDay };
    })();

    const cronTasks = Array.isArray(cronStatus?.tasks) ? cronStatus.tasks : [];
    const currentCronStatus = cronStatus?.currentStatus || {};
    const scalePressure = cronStatus?.scalePressure || cronStatus?.ScalePressure || null;
    const scaleSignals = Array.isArray(scalePressure?.signals) ? scalePressure.signals : [];
    const scaleHotTasks = Array.isArray(scalePressure?.hotTasks) ? scalePressure.hotTasks : [];
    const scaleLanePressure = Array.isArray(scalePressure?.lanePressure) ? scalePressure.lanePressure : [];
    const scaleTopSignal = scaleSignals[0] || null;
    const scaleTopTask = scaleHotTasks[0] || null;
    const scaleTopLane = scaleLanePressure[0] || null;
    const scaleSignalTooltip = scaleSignals.length > 0
        ? scaleSignals.slice(0, 5).map((signal) => {
            const metric = signal.metricValue ? ` (${signal.metricLabel || 'metric'}: ${signal.metricValue})` : '';
            const action = signal.recommendation ? ` Action: ${signal.recommendation}` : '';
            return `${signal.title || signal.code}${metric}. ${signal.message || ''}${action}`;
        }).join('\n')
        : 'No warning or critical cron scale-pressure signals crossed threshold in this sample window.';
    const scaleIndexTooltip = 'No native Azure Table index is being proposed. Detection reuses the existing per-org Current AppProduct projection for MODR observed-resolution fan-out, alongside InventoryActive and AppVersionIntel MOD/MODR.';
    const activeLaneId = currentCronStatus.lockedLaneId || null;
    const activeExecutionScope = currentCronStatus.lockedScope || 'global';
    const taskLaneLookup = new Map(cronTasks.map((task) => [String(task.taskId || task.displayName || ''), task.laneId]));

    const getLaneIdForEvent = (event, taskId) => {
        const meta = event?.metadata || {};
        const explicitLane = meta.laneId || meta.LaneId || meta.lane || meta.Lane;
        if (explicitLane) return normalizeLaneId(explicitLane);

        const mappedLane = taskId ? taskLaneLookup.get(String(taskId)) : null;
        if (mappedLane) return normalizeLaneId(mappedLane);

        return 'unassigned';
    };

    const taskRuntimeLeaders = (() => {
        const byTask = new Map();
        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
            const meta = evt?.metadata || {};
            const taskId = getTaskIdFromEvent(evt);
            if (!taskId) continue;

            const durationMs = getDurationMsFromEvent(evt);
            const budget = getEventOperationBudget(evt);
            const key = String(taskId);
            const existing = byTask.get(key) || {
                taskId: key,
                runs: 0,
                totalDurationMs: 0,
                maxDurationMs: 0,
                itemsProcessed: 0,
                rowsRead: 0,
                rowsWritten: 0,
                rowsDeleted: 0
            };
            existing.runs += 1;
            existing.totalDurationMs += durationMs;
            existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
            existing.itemsProcessed += toNumber(meta.itemsProcessed ?? meta.entriesRefreshed);
            existing.rowsRead += budget.rowsRead;
            existing.rowsWritten += budget.rowsWritten;
            existing.rowsDeleted += budget.rowsDeleted;
            byTask.set(key, existing);
        }

        return Array.from(byTask.values())
            .map((item) => ({
                ...item,
                averageDurationMs: item.runs > 0 ? item.totalDurationMs / item.runs : 0,
                totalRows: item.rowsRead + item.rowsWritten + item.rowsDeleted
            }))
            .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
            .slice(0, 6);
    })();

    const maxTaskDurationMs = Math.max(1, ...taskRuntimeLeaders.map((item) => item.totalDurationMs));

    const taskEfficiencyLeaders = taskRuntimeLeaders
        .map((item) => {
            const minutes = item.totalDurationMs > 0 ? item.totalDurationMs / 60000 : 0;
            return {
                ...item,
                workPerMinute: minutes > 0 ? item.itemsProcessed / minutes : 0,
                opsPerMinute: minutes > 0 ? item.totalRows / minutes : 0
            };
        })
        .filter((item) => item.workPerMinute > 0 || item.opsPerMinute > 0)
        .sort((a, b) => (b.workPerMinute + (b.opsPerMinute / 1000)) - (a.workPerMinute + (a.opsPerMinute / 1000)))
        .slice(0, 4);

    const laneLoadMix = (() => {
        const byLane = new Map();
        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;

            const taskId = getTaskIdFromEvent(evt);
            const laneId = getLaneIdForEvent(evt, taskId);
            const durationMs = getDurationMsFromEvent(evt);
            const budget = getEventOperationBudget(evt);
            const totalRows = budget.rowsRead + budget.rowsWritten + budget.rowsDeleted;
            const status = getCronEventStatus(evt);
            const existing = byLane.get(laneId) || {
                laneId,
                runs: 0,
                failed: 0,
                durationMs: 0,
                itemsProcessed: 0,
                totalRows: 0
            };

            existing.runs += durationMs > 0 ? 1 : 0;
            existing.failed += ['failed', 'exception', 'rejected', 'partialfailure', 'cancelled', 'canceled', 'timedout'].includes(status) ? 1 : 0;
            existing.durationMs += durationMs;
            existing.itemsProcessed += toNumber(evt?.metadata?.itemsProcessed ?? evt?.metadata?.entriesRefreshed);
            existing.totalRows += totalRows;
            byLane.set(laneId, existing);
        }

        return Array.from(byLane.values())
            .filter((item) => item.durationMs > 0 || item.totalRows > 0 || item.itemsProcessed > 0)
            .sort((a, b) => {
                const aOrder = LANE_ORDER.includes(a.laneId) ? LANE_ORDER.indexOf(a.laneId) : 99;
                const bOrder = LANE_ORDER.includes(b.laneId) ? LANE_ORDER.indexOf(b.laneId) : 99;
                return aOrder === bOrder ? b.durationMs - a.durationMs : aOrder - bOrder;
            });
    })();

    const maxLaneDurationMs = Math.max(1, ...laneLoadMix.map((item) => item.durationMs));
    const maxLaneRows = Math.max(1, ...laneLoadMix.map((item) => item.totalRows));
    const topLaneByRuntime = [...laneLoadMix].sort((a, b) => b.durationMs - a.durationMs)[0] || null;

    const laneIds = Array.from(new Set([
        ...LANE_ORDER,
        ...cronTasks.map((task) => task.laneId).filter(Boolean)
    ])).filter((laneId) => cronTasks.some((task) => task.laneId === laneId) || laneId === activeLaneId);
    const laneSummaries = laneIds.map((laneId) => {
        const laneTasks = cronTasks.filter((task) => task.laneId === laneId);
        return {
            laneId,
            label: formatLaneLabel(laneId),
            total: laneTasks.length,
            overdue: laneTasks.filter((task) => task.isOverdue).length,
            active: activeLaneId === laneId
        };
    });
    const lockExpiresAt = currentCronStatus.lockExpires ? new Date(currentCronStatus.lockExpires) : null;
    const activeLockExpired = lockExpiresAt && lockExpiresAt < new Date();

    function getTaskLiveState(task) {
        const taskRuns = events
            .filter(e => e.eventType === 'CRONRUN' && (e.metadata?.taskId || e.metadata?.TaskId) === task.taskId)
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        const latestRun = taskRuns[0] || null;
        const runStatus = latestRun?.metadata?.status || latestRun?.metadata?.Status || latestRun?.status || null;

        if (!latestRun) {
            return {
                key: task.isOverdue ? 'overdue' : 'scheduled',
                label: task.isOverdue ? 'Overdue' : 'On Schedule',
                badgeClass: task.isOverdue ? 'bg-danger text-white' : 'bg-success text-white',
                icon: task.isOverdue ? 'ti-alert-circle' : 'ti-check',
                progressPercent: null,
                ageMinutes: null
            };
        }

        if (runStatus === 'Queued') {
            return {
                key: 'queued',
                label: 'Queued',
                badgeClass: 'bg-info text-white',
                icon: 'ti-clock-hour-4',
                progressPercent: null,
                ageMinutes: null
            };
        }

        if (runStatus !== 'Running') {
            return {
                key: task.isOverdue ? 'overdue' : 'scheduled',
                label: task.isOverdue ? 'Overdue' : 'On Schedule',
                badgeClass: task.isOverdue ? 'bg-danger text-white' : 'bg-success text-white',
                icon: task.isOverdue ? 'ti-alert-circle' : 'ti-check',
                progressPercent: null,
                ageMinutes: null
            };
        }

        const progressAtRaw =
            latestRun.metadata?.progressAt ||
            latestRun.metadata?.lastProgressAt ||
            latestRun.metadata?.progress?.at ||
            latestRun.timestamp;
        const progressAt = progressAtRaw ? new Date(progressAtRaw) : null;
        const ageMinutes = progressAt ? (Date.now() - progressAt.getTime()) / 60000 : null;
        const progressPercent = latestRun.metadata?.progressPercent ?? latestRun.metadata?.progress?.percent ?? null;
        // Heartbeat ticks (CronCoordinator emits every 30s when the task itself is quiet)
        // carry isHeartbeat=true and a stage prefix of "Heartbeat (...)". Treat them as
        // proof-of-life but keep the display tied to the last *real* stage so users can
        // tell genuine multi-stage progress apart from "still running, no new milestone."
        const isHeartbeat = !!(latestRun.metadata?.progress?.isHeartbeat);
        const quietSeconds = latestRun.metadata?.progress?.quietSeconds ?? null;

        const lockExpiresRaw = cronStatus?.currentStatus?.lockExpires;
        const lockExpired = lockExpiresRaw ? new Date(lockExpiresRaw) < new Date() : false;

        if (ageMinutes != null && ageMinutes > 10 && lockExpired) {
            return {
                key: 'killed',
                label: 'Possibly Killed',
                badgeClass: 'bg-dark text-white',
                icon: 'ti-plug-x',
                progressPercent,
                ageMinutes,
                isHeartbeat,
                quietSeconds
            };
        }

        if (ageMinutes != null && ageMinutes > 10) {
            return {
                key: 'stuck',
                label: 'Stuck',
                badgeClass: 'bg-warning text-white',
                icon: 'ti-alert-triangle',
                progressPercent,
                ageMinutes,
                isHeartbeat,
                quietSeconds
            };
        }

        return {
            key: 'running',
            label: isHeartbeat ? 'Running (heartbeat)' : 'Running',
            badgeClass: 'bg-primary text-white',
            icon: 'ti-player-play',
            progressPercent,
            ageMinutes,
            isHeartbeat,
            quietSeconds
        };
    }

    // --- Trace Viewer helpers ---

    function openTraceModal(pk, tid) {
        setTracePartitionKey(pk || '');
        setTraceTracingId(tid || '');
        setTraceLogs([]);
        setTraceError('');
        setTraceExpandedRows(new Set());
        setTraceExpandedField(null);
        setTraceSortCol('rowKey');
        setTraceSortDir('asc');
        setTraceModalOpen(true);
        if (pk && tid) fetchTraceLogs(pk, tid);
    }

    async function fetchTraceLogs(pk, tid) {
        setTraceLoading(true);
        setTraceError('');
        setTraceLogs([]);
        try {
            const res = await api.adminGetTraceLogs(pk, tid);
            const data = res?.data || res;
            if (data?.success === false) {
                setTraceError(data.message || data.error || 'Query failed');
            } else {
                const rows = data?.data?.logs || data?.logs || [];
                setTraceLogs(rows);
                if (rows.length === 0) setTraceError('No log entries found for this trace.');
            }
        } catch (err) {
            setTraceError(err.message || 'Failed to fetch trace logs');
        } finally {
            setTraceLoading(false);
        }
    }

    function toggleTraceSort(col) {
        if (traceSortCol === col) {
            setTraceSortDir(traceSortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setTraceSortCol(col);
            setTraceSortDir('asc');
        }
    }

    function getSortedTraceLogs() {
        if (!traceLogs.length) return [];
        const sorted = [...traceLogs].sort((a, b) => {
            let va = a[traceSortCol], vb = b[traceSortCol];
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (typeof va === 'number' && typeof vb === 'number') return traceSortDir === 'asc' ? va - vb : vb - va;
            return traceSortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        return sorted;
    }

    function tryParseJson(str) {
        if (!str || typeof str !== 'string') return null;
        const trimmed = str.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try { return JSON.parse(trimmed); } catch { return null; }
        }
        return null;
    }

    function renderJsonCell(value, rowKey, fieldName) {
        if (!value) return html`<span class="text-muted">-</span>`;
        const parsed = tryParseJson(value);
        const isExpanded = traceExpandedField?.rowKey === rowKey && traceExpandedField?.field === fieldName;

        if (parsed) {
            return html`
                <div>
                    <button class="btn btn-sm btn-ghost-secondary py-0 px-1" onClick=${(ev) => {
                        ev.stopPropagation();
                        setTraceExpandedField(isExpanded ? null : { rowKey, field: fieldName });
                    }}>
                        <i class="ti ti-${isExpanded ? 'chevron-up' : 'code'}"></i>
                        <span class="ms-1 small">${isExpanded ? 'Collapse' : 'Expand'} JSON</span>
                    </button>
                    ${isExpanded && html`
                        <pre class="mt-1 mb-0 p-2 rounded small" style="max-height:400px;overflow:auto;background:var(--tblr-bg-surface-secondary,#f8f9fa);white-space:pre-wrap;word-break:break-word;">${JSON.stringify(parsed, null, 2)}</pre>
                    `}
                    ${!isExpanded && html`
                        <div class="text-muted small text-truncate" style="max-width:300px;" title=${value}>${value.slice(0, 80)}${value.length > 80 ? '…' : ''}</div>
                    `}
                </div>
            `;
        }

        // Plain text, possibly long
        if (value.length > 120) {
            return html`
                <div>
                    <span class="small" style="cursor:pointer;word-break:break-word;" onClick=${(ev) => {
                        ev.stopPropagation();
                        setTraceExpandedField(isExpanded ? null : { rowKey, field: fieldName });
                    }}>
                        ${isExpanded ? value : value.slice(0, 120) + '…'}
                    </span>
                </div>
            `;
        }

        return html`<span class="small" style="word-break:break-word;">${value}</span>`;
    }

    function renderTraceModal() {
        if (!traceModalOpen) return null;

        const sortedLogs = getSortedTraceLogs();
        const sortIcon = (col) => traceSortCol === col ? (traceSortDir === 'asc' ? ' ↑' : ' ↓') : '';

        const levelBadge = (level) => {
            const l = (level || '').toUpperCase();
            if (l === 'ERROR') return 'bg-danger text-white';
            if (l === 'WARNING') return 'bg-warning text-white';
            if (l === 'INFORMATION' || l === 'INFO') return 'bg-info-lt text-info';
            if (l === 'DEBUG') return 'bg-secondary-lt text-secondary';
            if (l === 'TRACE') return 'bg-dark-lt text-dark';
            return 'bg-secondary-lt text-secondary';
        };

        const statusBadge = (status) => {
            const s = (status || '').toLowerCase();
            if (s === 'success' || s === 'completed') return 'bg-success-lt text-success';
            if (s === 'failed' || s === 'error') return 'bg-danger-lt text-danger';
            if (s === 'running') return 'bg-primary-lt text-primary';
            return 'bg-secondary-lt text-secondary';
        };

        return html`
            <div class="modal modal-blur show d-block" tabindex="-1" style="background:rgba(0,0,0,.5)" onClick=${(ev) => { if (ev.target === ev.currentTarget) setTraceModalOpen(false); }}>
                <div class="modal-dialog modal-dialog-scrollable" style="max-width:95vw;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="ti ti-list-search me-2"></i>
                                Trace Log Viewer
                            </h5>
                            <button class="btn-close" onClick=${() => setTraceModalOpen(false)}></button>
                        </div>
                        <div class="modal-body">
                            <!-- Query Form -->
                            <div class="row g-2 mb-3">
                                <div class="col-md-4">
                                    <label class="form-label">Partition Key (yyyyMMdd)</label>
                                    <input type="text" class="form-control" placeholder="e.g. 20260321"
                                        maxlength="8"
                                        value=${tracePartitionKey}
                                        onInput=${(e) => setTracePartitionKey(e.target.value)} />
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Tracing ID</label>
                                    <input type="text" class="form-control" placeholder="e.g. a1b2c3d4"
                                        value=${traceTracingId}
                                        onInput=${(e) => setTraceTracingId(e.target.value)} />
                                </div>
                                <div class="col-md-4 d-flex align-items-end">
                                    <button class="btn btn-primary w-100"
                                        disabled=${traceLoading || !tracePartitionKey || !traceTracingId}
                                        onClick=${() => fetchTraceLogs(tracePartitionKey, traceTracingId)}>
                                        ${traceLoading 
                                            ? html`<span class="spinner-border spinner-border-sm me-2"></span>Querying...`
                                            : html`<i class="ti ti-search me-2"></i>Query Trace`}
                                    </button>
                                </div>
                            </div>

                            ${traceError && html`
                                <div class="alert alert-${traceLogs.length === 0 && !traceLoading ? 'warning' : 'danger'} mb-3">
                                    ${traceError}
                                </div>
                            `}

                            ${sortedLogs.length > 0 && html`
                                <div class="small text-muted mb-2">${sortedLogs.length} log entries • Click column headers to sort</div>
                                <div class="table-responsive" style="max-height:60vh;overflow:auto;">
                                    <table class="table table-sm table-hover table-bordered">
                                        <thead class="sticky-top" style="background:var(--tblr-bg-surface,#fff);z-index:1;">
                                            <tr>
                                                <th class="cursor-pointer" style="min-width:90px;" onClick=${() => toggleTraceSort('rowKey')}>Time${sortIcon('rowKey')}</th>
                                                <th class="cursor-pointer" style="min-width:70px;" onClick=${() => toggleTraceSort('logLevel')}>Level${sortIcon('logLevel')}</th>
                                                <th class="cursor-pointer" style="min-width:60px;" onClick=${() => toggleTraceSort('source')}>Source${sortIcon('source')}</th>
                                                <th class="cursor-pointer" style="min-width:140px;" onClick=${() => toggleTraceSort('called')}>Called${sortIcon('called')}</th>
                                                <th class="cursor-pointer" style="min-width:70px;" onClick=${() => toggleTraceSort('status')}>Status${sortIcon('status')}</th>
                                                <th class="cursor-pointer text-end" style="min-width:60px;" onClick=${() => toggleTraceSort('elapsedMs')}>Ms${sortIcon('elapsedMs')}</th>
                                                <th style="min-width:200px;">Params</th>
                                                <th style="min-width:200px;">Return</th>
                                                <th style="min-width:200px;">Context</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${sortedLogs.map((log) => {
                                                // Parse rowKey to display time: HHmmssfff-seq -> HH:mm:ss.fff
                                                const rk = log.rowKey || '';
                                                const timePart = rk.split('-')[0] || '';
                                                const displayTime = timePart.length >= 9
                                                    ? timePart.slice(0,2) + ':' + timePart.slice(2,4) + ':' + timePart.slice(4,6) + '.' + timePart.slice(6,9)
                                                    : rk;

                                                return html`
                                                    <tr>
                                                        <td class="font-monospace small">${displayTime}</td>
                                                        <td><span class="badge ${levelBadge(log.logLevel)}">${log.logLevel || '-'}</span></td>
                                                        <td class="small">${log.source || '-'}</td>
                                                        <td class="small font-monospace text-truncate" style="max-width:250px;" title=${log.called || ''}>${log.called || '-'}</td>
                                                        <td><span class="badge ${statusBadge(log.status)}">${log.status || '-'}</span></td>
                                                        <td class="text-end font-monospace small">${log.elapsedMs != null ? log.elapsedMs : '-'}</td>
                                                        <td>${renderJsonCell(log.params, log.rowKey, 'params')}</td>
                                                        <td>${renderJsonCell(log.return, log.rowKey, 'return')}</td>
                                                        <td>${renderJsonCell(log.context, log.rowKey, 'context')}</td>
                                                    </tr>
                                                `;
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            `}

                            ${!traceLoading && sortedLogs.length === 0 && !traceError && html`
                                <div class="empty py-4">
                                    <div class="empty-icon"><i class="ti ti-list-search"></i></div>
                                    <p class="empty-title">Enter a partition key and tracing ID to query logs</p>
                                    <p class="empty-subtitle text-muted">Partition key format: yyyyMMdd (e.g. 20260321). Tracing ID is the 8-char hex from cron job metadata.</p>
                                </div>
                            `}
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onClick=${() => setTraceModalOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return html`
        ${showHeader && html`<div class="page-header d-print-none mb-3">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>
                            Cron Activity
                        </h2>
                        <div class="page-subtitle">
                            <span class="text-muted">View scheduled lane leases, task progress, manual runs, and report email activity</span>
                        </div>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-outline-primary" onClick=${() => openTraceModal('', '')}>
                            <i class="ti ti-list-search me-2"></i>
                            Query Trace
                        </button>
                    </div>
                </div>
            </div>
        </div>`}

        <div class=${embedded ? '' : 'container-xl'}>
            <!-- Summary Statistics -->
            ${events.length > 0 && html`
                <div class="row g-3 mb-3">
                    ${(() => {
                        const sampleCount = filteredEvents.length;
                        const totalEvents = events.length;
                        const successCount = filteredEvents.filter((event) => {
                            if (event.eventType === 'CRONRUN') {
                                const status = (event.metadata?.status || event.metadata?.Status || event.status || '').toLowerCase();
                                return status === '' || status === 'completed';
                            }

                            return event.eventType === 'SECURITY_REPORT' && ((event.subType || '').toLowerCase().includes('failed')) === false;
                        }).length;
                        const failureCount = filteredEvents.filter((event) => {
                            if (event.eventType === 'CRONRUN') {
                                const status = (event.metadata?.status || event.metadata?.Status || event.status || '').toLowerCase();
                                return ['failed', 'exception', 'rejected'].includes(status);
                            }

                            return event.eventType === 'SECURITY_REPORT' && event.subType === 'SecurityReportFailed';
                        }).length;
                        const successRate = sampleCount > 0 ? ((successCount / sampleCount) * 100).toFixed(1) : 0;
                        const lastEvent = filteredEvents[0] || events[0];
                        const lastEventTime = lastEvent?.timestamp ? new Date(lastEvent.timestamp).toLocaleString() : 'N/A';
                        const sampleLabel = sampleCount === totalEvents
                            ? `${formatPlural(sampleCount, 'event')} loaded`
                            : `${formatCompactNumber(sampleCount)} visible of ${formatCompactNumber(totalEvents)} loaded`;
                        
                        return html`
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Activity Sample</div>
                                        <div class="h3 mb-0">${formatCompactNumber(sampleCount)}</div>
                                        <small class="text-muted">${sampleLabel} · ${formatSampleWindow(rangeDays)}</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Completion Rate</div>
                                        <div class="h3 mb-0 text-success">${successRate}%</div>
                                        <small class="text-muted">${successCount} success · ${failureCount} failed</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Timed Runtime</div>
                                        <div class="h3 mb-0 text-primary">${formatDuration(runtimeTrend.totals.durationMs)}</div>
                                        <small class="text-muted">${formatPlural(runtimeTrend.totals.runs, 'timed run')} · ${formatSampleWindow(rangeDays)}</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Last Activity</div>
                                        <div class="small mb-0">${lastEventTime}</div>
                                        ${lastEvent && html`<span class="badge bg-${(lastEvent.eventType === 'SECURITY_REPORT' && (lastEvent.subType === 'SecurityReportFailed' || lastEvent.subType === 'FAILED')) ? 'danger' : 'success'}-lt text-${(lastEvent.eventType === 'SECURITY_REPORT' && (lastEvent.subType === 'SecurityReportFailed' || lastEvent.subType === 'FAILED')) ? 'danger' : 'success'} mt-2 mt-sm-0">${(() => {
                                            if (lastEvent.eventType === 'CRONRUN') {
                                                return (lastEvent.subType === 'CronRunManual' || lastEvent.subType === 'Manual')
                                                    ? `Manual: ${lastEvent.metadata?.taskId || 'Unknown'}`
                                                    : 'Scheduled';
                                            }
                                            if (lastEvent.eventType === 'SECURITY_REPORT') {
                                                if (lastEvent.subType === 'SecurityReportFailed' || lastEvent.subType === 'FAILED') return 'Failed';
                                                if (lastEvent.subType === 'SecurityReportBatchComplete') return 'Batch Complete';
                                                if (lastEvent.subType === 'SecurityReportEmailSent') return 'Email Sent';
                                                if (((lastEvent.subType || '').toLowerCase().includes('batch'))) return 'Batch';
                                                if (((lastEvent.subType || '').toLowerCase().includes('sent'))) return 'Sent';
                                                return 'Report';
                                            }
                                            return 'Other';
                                        })()}</span>`}
                                    </div>
                                </div>
                            </div>
                        `;
                    })()}
                </div>
            `}

            ${filteredEvents.length > 0 && html`
                <div class="row g-3 mb-3">
                    <div class="col-xl-6 d-flex flex-column gap-3">
                        <div class="card cron-runtime-trend-card">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title mb-0">Runtime Trend</h3>
                                    <div class="card-subtitle text-muted cron-trend-readline">${formatSampleWindow(rangeDays)} filtered sample</div>
                                </div>
                                <div class="card-actions text-muted small">
                                    ${formatDuration(runtimeTrend.totals.durationMs)} sampled runtime · ${formatPlural(runtimeTrend.totals.runs, 'timed run')}
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="cron-trend-stack">
                                    <div class="cron-trend-section">
                                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                            <div class="subheader mb-0">Executions</div>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span class="badge bg-success text-white">success</span>
                                                <span class="badge bg-danger text-white">failed</span>
                                            </div>
                                        </div>
                                        <div class="cron-trend-section-note text-muted">A taller bar means more cron runs that day; failed segments show runs that ended unsuccessfully.</div>
                                        <div class="cron-trend-chart cron-trend-chart-compact" role="img" aria-label="Daily cron execution trend">
                                            ${dailyTrend.points.map((point) => {
                                                const successHeight = Math.max(2, Math.round((point.success / dailyTrend.max) * 30));
                                                const failedHeight = Math.max(point.failed > 0 ? 2 : 0, Math.round((point.failed / dailyTrend.max) * 30));
                                                const totalHeight = Math.min(36, successHeight + failedHeight);
                                                return html`
                                                    <div class="cron-trend-day" title=${`${point.label}: ${point.success} success, ${point.failed} failed, ${point.manual} manual, ${point.scheduled} scheduled`}>
                                                        <div class="cron-trend-bar" style=${`height:${Math.max(2, totalHeight)}px`}>
                                                            ${point.failed > 0 && html`<div class="cron-trend-segment cron-trend-failed" style=${`height:${failedHeight}px`}></div>`}
                                                            ${point.success > 0 && html`<div class="cron-trend-segment cron-trend-success" style=${`height:${successHeight}px`}></div>`}
                                                        </div>
                                                        <div class="cron-trend-label">${point.label}</div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                        <div class="small text-muted mt-2">${dailyTrend.totals.success} completed · ${dailyTrend.totals.failed} failed</div>
                                    </div>
                                    <div class="cron-trend-section">
                                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                            <div class="subheader mb-0">Runtime</div>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span class="badge bg-primary text-white">runtime</span>
                                                <span class="badge bg-warning text-white">table ops</span>
                                            </div>
                                        </div>
                                        <div class="cron-trend-section-note text-muted">Runtime shows elapsed cron time; table ops show rows read, written, or deleted during those runs.</div>
                                        <div class="cron-trend-chart cron-trend-chart-compact" role="img" aria-label="Daily cron runtime and table operation trend">
                                            ${runtimeTrend.points.map((point) => {
                                                const durationHeight = Math.max(point.durationMs > 0 ? 3 : 0, Math.round((point.durationMs / runtimeTrend.maxDurationMs) * 34));
                                                const rowHeight = Math.max((point.rowsRead + point.rowsWritten + point.rowsDeleted) > 0 ? 2 : 0, Math.round(((point.rowsRead + point.rowsWritten + point.rowsDeleted) / runtimeTrend.maxRows) * 10));
                                                return html`
                                                    <div class="cron-trend-day" title=${`${point.label}: ${formatDuration(point.durationMs)}, ${point.runs} timed runs, ${formatCompactNumber(point.rowsRead + point.rowsWritten + point.rowsDeleted)} row ops`}>
                                                        <div class="cron-trend-bar" style=${`height:${Math.max(2, durationHeight + rowHeight)}px`}>
                                                            ${rowHeight > 0 && html`<div class="cron-trend-segment cron-trend-rows" style=${`height:${rowHeight}px`}></div>`}
                                                            ${durationHeight > 0 && html`<div class="cron-trend-segment cron-trend-runtime" style=${`height:${durationHeight}px`}></div>`}
                                                        </div>
                                                        <div class="cron-trend-label">${point.label}</div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                        <div class="d-flex flex-wrap gap-2 mt-2">
                                            <span class="badge bg-primary text-white">runtime ${formatDuration(runtimeTrend.totals.durationMs)}</span>
                                            <span class="badge bg-info text-white">work ${formatCompactNumber(runtimeTrend.totals.itemsProcessed)} items</span>
                                            <span class="badge bg-secondary text-white">reads ${formatCompactNumber(runtimeTrend.totals.rowsRead)}</span>
                                            <span class="badge bg-success text-white">writes ${formatCompactNumber(runtimeTrend.totals.rowsWritten)}</span>
                                            ${runtimeTrend.totals.rowsDeleted > 0 && html`<span class="badge bg-warning text-white">deletes ${formatCompactNumber(runtimeTrend.totals.rowsDeleted)}</span>`}
                                        </div>
                                    </div>
                                    <div class="cron-trend-section cron-trend-section-tight">
                                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                            <div class="subheader mb-0">Efficiency</div>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span class="badge bg-success text-white">work/min</span>
                                                <span class="badge bg-warning text-white">ops/min</span>
                                            </div>
                                        </div>
                                        <div class="cron-trend-section-note text-muted">Higher efficiency means more items or table operations completed per runtime minute.</div>
                                        <div class="cron-trend-chart cron-trend-chart-compact cron-trend-chart-tiny" role="img" aria-label="Daily cron work and operation efficiency trend">
                                            ${efficiencyTrend.points.map((point) => {
                                                const workHeight = Math.max(point.workPerMinute > 0 ? 2 : 0, Math.round((point.workPerMinute / efficiencyTrend.maxWorkPerMinute) * 28));
                                                const opsHeight = Math.max(point.opsPerMinute > 0 ? 2 : 0, Math.round((point.opsPerMinute / efficiencyTrend.maxOpsPerMinute) * 9));
                                                return html`
                                                    <div class="cron-trend-day" title=${`${point.label}: ${formatCompactNumber(point.workPerMinute)} work/min, ${formatCompactNumber(point.opsPerMinute)} ops/min`}>
                                                        <div class="cron-trend-bar" style=${`height:${Math.max(2, workHeight + opsHeight)}px`}>
                                                            ${opsHeight > 0 && html`<div class="cron-trend-segment cron-trend-efficiency-ops" style=${`height:${opsHeight}px`}></div>`}
                                                            ${workHeight > 0 && html`<div class="cron-trend-segment cron-trend-work" style=${`height:${workHeight}px`}></div>`}
                                                        </div>
                                                        <div class="cron-trend-label">${point.label}</div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                        <div class="d-flex flex-wrap gap-2 mt-2 small text-muted">
                                            ${efficiencyTrend.peakRuntimeDay && html`<span>peak runtime ${efficiencyTrend.peakRuntimeDay.label} · ${formatDuration(efficiencyTrend.peakRuntimeDay.durationMs)}</span>`}
                                            ${efficiencyTrend.peakOpsDay && efficiencyTrend.peakOpsDay.rowOps > 0 && html`<span>peak ops ${efficiencyTrend.peakOpsDay.label} · ${formatCompactNumber(efficiencyTrend.peakOpsDay.rowOps)}</span>`}
                                            ${efficiencyTrend.peakEfficiencyDay && efficiencyTrend.peakEfficiencyDay.workPerMinute > 0 && html`<span>best work/min ${efficiencyTrend.peakEfficiencyDay.label} · ${formatCompactNumber(efficiencyTrend.peakEfficiencyDay.workPerMinute)}</span>`}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card cron-hourly-crud-card">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title mb-0">Hourly Audit CRUD</h3>
                                    <div class="card-subtitle text-muted cron-trend-readline">Loaded audit rows grouped by hour</div>
                                </div>
                                <div class="card-actions text-muted small">
                                    ${formatCompactNumber(hourlyCrudTrend.totals.crudOps)} CRUD ops · ${formatPlural(hourlyCrudTrend.totals.auditEvents, 'audit event')}
                                </div>
                            </div>
                            <div class="card-body">
                                ${hourlyCrudTrend.points.length === 0 ? html`
                                    <div class="empty py-3">
                                        <div class="empty-icon"><i class="ti ti-chart-bar-off"></i></div>
                                        <p class="empty-title">No loaded audit rows</p>
                                    </div>
                                ` : html`
                                    <div class="cron-trend-stack">
                                        <div class="cron-trend-section">
                                            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                                <div>
                                                    <div class="subheader mb-0">Hour By Hour</div>
                                                    <div class="text-muted small">${hourlyCrudTrend.spanLabel}</div>
                                                </div>
                                                <div class="d-flex flex-wrap gap-1">
                                                    <span class="badge bg-secondary text-white">reads</span>
                                                    <span class="badge bg-success text-white">create/update</span>
                                                    <span class="badge bg-warning text-white">delete</span>
                                                    <span class="badge bg-purple text-white">events</span>
                                                </div>
                                            </div>
                                            <div class="cron-hourly-crud-chart" role="img" aria-label="Hourly audit CRUD operation trend from loaded rows">
                                                ${hourlyCrudTrend.points.map((point) => {
                                                    const readHeight = Math.max(point.rowsRead > 0 ? 2 : 0, Math.round((point.rowsRead / hourlyCrudTrend.maxCrudOps) * 40));
                                                    const writeHeight = Math.max(point.rowsWritten > 0 ? 2 : 0, Math.round((point.rowsWritten / hourlyCrudTrend.maxCrudOps) * 32));
                                                    const deleteHeight = Math.max(point.rowsDeleted > 0 ? 2 : 0, Math.round((point.rowsDeleted / hourlyCrudTrend.maxCrudOps) * 18));
                                                    const eventHeight = Math.max(point.auditEvents > 0 ? 2 : 0, Math.round((point.auditEvents / hourlyCrudTrend.maxAuditEvents) * 12));
                                                    const totalHeight = Math.max(2, readHeight + writeHeight + deleteHeight + eventHeight);
                                                    return html`
                                                        <div class="cron-trend-day cron-hourly-crud-hour" title=${`${point.label}: ${formatCompactNumber(point.auditEvents)} audit events, ${formatCompactNumber(point.eventsProcessed)} events processed, ${formatCompactNumber(point.rowsRead)} reads, ${formatCompactNumber(point.rowsCreated)} creates, ${formatCompactNumber(point.rowsUpdated)} updates, ${formatCompactNumber(point.rowsWritten)} writes, ${formatCompactNumber(point.rowsDeleted)} deletes`}>
                                                            <div class="cron-trend-bar" style=${`height:${totalHeight}px`}>
                                                                ${eventHeight > 0 && html`<div class="cron-trend-segment cron-trend-events" style=${`height:${eventHeight}px`}></div>`}
                                                                ${deleteHeight > 0 && html`<div class="cron-trend-segment cron-trend-deletes" style=${`height:${deleteHeight}px`}></div>`}
                                                                ${writeHeight > 0 && html`<div class="cron-trend-segment cron-trend-writes" style=${`height:${writeHeight}px`}></div>`}
                                                                ${readHeight > 0 && html`<div class="cron-trend-segment cron-trend-reads" style=${`height:${readHeight}px`}></div>`}
                                                            </div>
                                                            <div class="cron-trend-label">${point.tickLabel}</div>
                                                        </div>
                                                    `;
                                                })}
                                            </div>
                                            <div class="d-flex flex-wrap gap-2 mt-2">
                                                <span class="badge bg-purple text-white">audit events ${formatCompactNumber(hourlyCrudTrend.totals.auditEvents)}</span>
                                                <span class="badge bg-info text-white">processed ${formatCompactNumber(hourlyCrudTrend.totals.eventsProcessed)}</span>
                                                <span class="badge bg-secondary text-white">reads ${formatCompactNumber(hourlyCrudTrend.totals.rowsRead)}</span>
                                                <span class="badge bg-success text-white">writes ${formatCompactNumber(hourlyCrudTrend.totals.rowsWritten)}</span>
                                                ${hourlyCrudTrend.totals.rowsCreated > 0 && html`<span class="badge bg-info text-white">creates ${formatCompactNumber(hourlyCrudTrend.totals.rowsCreated)}</span>`}
                                                ${hourlyCrudTrend.totals.rowsUpdated > 0 && html`<span class="badge bg-primary text-white">updates ${formatCompactNumber(hourlyCrudTrend.totals.rowsUpdated)}</span>`}
                                                ${hourlyCrudTrend.totals.rowsDeleted > 0 && html`<span class="badge bg-warning text-white">deletes ${formatCompactNumber(hourlyCrudTrend.totals.rowsDeleted)}</span>`}
                                            </div>
                                        </div>
                                        <div class="cron-hourly-spike-list">
                                            ${hourlyCrudTrend.spikeHours.map((point) => {
                                                const rowShare = Math.max(1, Math.round((point.crudOps / hourlyCrudTrend.maxCrudOps) * 100));
                                                return html`
                                                    <div class="cron-hourly-spike-row">
                                                        <div>
                                                            <div class="fw-semibold">${point.label}</div>
                                                            <div class="text-muted small">${formatCompactNumber(point.crudOps)} CRUD ops · ${formatPlural(point.auditEvents, 'audit event')}</div>
                                                        </div>
                                                        <div class="progress progress-sm my-2">
                                                            <div class="progress-bar bg-primary" style=${`width:${rowShare}%`}></div>
                                                        </div>
                                                        <div class="d-flex flex-wrap gap-1">
                                                            <span class="badge bg-secondary text-white">read ${formatCompactNumber(point.rowsRead)}</span>
                                                            <span class="badge bg-success text-white">write ${formatCompactNumber(point.rowsWritten)}</span>
                                                            ${point.rowsDeleted > 0 && html`<span class="badge bg-warning text-white">delete ${formatCompactNumber(point.rowsDeleted)}</span>`}
                                                        </div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title mb-0">Attribution Signals</h3>
                            </div>
                            <div class="card-body">
                                <div class="cron-attribution-tiles">
                                    <div class="cron-attribution-tile">
                                        <div class="text-muted small">Compute Proxy</div>
                                        <div class="h3 mb-0 text-primary">${formatDuration(runtimeTrend.totals.durationMs)}</div>
                                        <div class="text-muted small">timed runtime</div>
                                    </div>
                                    <div class="cron-attribution-tile">
                                        <div class="text-muted small">Storage Pressure</div>
                                        <div class="h3 mb-0 text-warning">${formatCompactNumber(runtimeTrend.totals.rowsRead + runtimeTrend.totals.rowsWritten + runtimeTrend.totals.rowsDeleted)}</div>
                                        <div class="text-muted small">table operations</div>
                                    </div>
                                    <div class="cron-attribution-tile">
                                        <div class="text-muted small">Workload Driver</div>
                                        <div class="h3 mb-0 text-success">${formatCompactNumber(runtimeTrend.totals.itemsProcessed)}</div>
                                        <div class="text-muted small">items processed</div>
                                    </div>
                                    <div class="cron-attribution-tile">
                                        <div class="text-muted small">Top Lane</div>
                                        <div class="h3 mb-0">${topLaneByRuntime ? formatLaneLabel(topLaneByRuntime.laneId) : '-'}</div>
                                        <div class="text-muted small">${topLaneByRuntime ? formatDuration(topLaneByRuntime.durationMs) : 'no timed runs'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-6">
                        <div class="card h-100">
                            <div class="card-header">
                                <h3 class="card-title mb-0">Runtime By Task</h3>
                                <div class="card-actions text-muted small">${formatSampleWindow(rangeDays)} sample</div>
                            </div>
                            <div class="card-body">
                                ${taskRuntimeLeaders.length === 0 ? html`
                                    <div class="empty py-3">
                                        <div class="empty-icon"><i class="ti ti-chart-bar-off"></i></div>
                                        <p class="empty-title">No timed task runs</p>
                                    </div>
                                ` : html`
                                    <div class="list-group list-group-flush cron-runtime-leader-list">
                                        ${taskRuntimeLeaders.map((item) => {
                                            const runtimeShare = Math.max(1, Math.round((item.totalDurationMs / maxTaskDurationMs) * 100));
                                            return html`
                                            <div class="list-group-item px-0">
                                                <div class="d-flex align-items-start gap-3">
                                                    <div class="flex-fill" style="min-width:0;">
                                                        <div class="fw-semibold text-truncate" title=${item.taskId}>${item.taskId}</div>
                                                        <div class="d-flex flex-wrap gap-1 mt-2">
                                                            <span class="badge bg-primary text-white">total ${formatDuration(item.totalDurationMs)}</span>
                                                            <span class="badge bg-secondary text-white">${formatPlural(item.runs, 'run')}</span>
                                                            <span class="badge bg-info text-white">avg/run ${formatDuration(item.averageDurationMs)}</span>
                                                            <span class="badge bg-dark text-white">max run ${formatDuration(item.maxDurationMs)}</span>
                                                            ${item.itemsProcessed > 0 && html`<span class="badge bg-yellow-lt text-yellow">work ${formatCompactNumber(item.itemsProcessed)} items</span>`}
                                                            ${item.totalRows > 0 && html`<span class="badge bg-warning text-white">table ops ${formatCompactNumber(item.totalRows)}</span>`}
                                                        </div>
                                                    </div>
                                                    <div class="text-end">
                                                        <div class="fw-semibold">${runtimeShare}%</div>
                                                        <div class="text-muted small">of leader</div>
                                                    </div>
                                                </div>
                                                <div class="progress progress-sm mt-2">
                                                    <div class="progress-bar bg-primary" style=${`width:${Math.max(4, runtimeShare)}%`}></div>
                                                </div>
                                            </div>
                                        `})}
                                    </div>
                                    ${taskEfficiencyLeaders.length > 0 && html`
                                        <div class="cron-card-section mt-3 pt-3">
                                            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                                                <div class="subheader mb-0">Efficiency</div>
                                                <span class="badge bg-info text-white">per minute</span>
                                            </div>
                                            <div class="cron-efficiency-grid">
                                                ${taskEfficiencyLeaders.map((item) => html`
                                                    <div class="cron-efficiency-item">
                                                        <div class="text-truncate fw-semibold" title=${item.taskId}>${item.taskId}</div>
                                                        <div class="d-flex flex-wrap gap-1 mt-1">
                                                            ${item.workPerMinute > 0 && html`<span class="badge bg-success text-white">work ${formatCompactNumber(item.workPerMinute)}/min</span>`}
                                                            ${item.opsPerMinute > 0 && html`<span class="badge bg-warning text-white">ops ${formatCompactNumber(item.opsPerMinute)}/min</span>`}
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                        </div>
                                    `}
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${laneLoadMix.length > 0 && html`
                <div class="row g-3 mb-3">
                    <div class="col-12 d-flex">
                        <div class="card h-100 w-100">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title mb-0">Lane Load Mix</h3>
                                    <div class="card-subtitle text-muted">Runtime and table operations by scheduled lane</div>
                                </div>
                                <div class="card-actions text-muted small">${formatSampleWindow(rangeDays)} sample</div>
                            </div>
                            <div class="card-body">
                                <div class="cron-lane-load-list">
                                    ${laneLoadMix.map((lane) => {
                                        const runtimePercent = Math.max(1, Math.round((lane.durationMs / maxLaneDurationMs) * 100));
                                        const rowPercent = Math.max(lane.totalRows > 0 ? 1 : 0, Math.round((lane.totalRows / maxLaneRows) * 100));
                                        return html`
                                            <div class="cron-lane-load-row">
                                                <div class="cron-lane-load-label">
                                                    <div class="fw-semibold">${formatLaneLabel(lane.laneId)}</div>
                                                    <div class="text-muted small">${formatPlural(lane.runs, 'timed run')}${lane.failed > 0 ? ` · ${lane.failed} failed` : ''}</div>
                                                </div>
                                                <div class="cron-lane-load-bars">
                                                    <div class="cron-lane-bar-track" title=${`${formatLaneLabel(lane.laneId)} runtime ${formatDuration(lane.durationMs)}`}>
                                                        <div class="cron-lane-bar-runtime" style=${`width:${Math.max(4, runtimePercent)}%`}></div>
                                                    </div>
                                                    <div class="cron-lane-bar-track" title=${`${formatLaneLabel(lane.laneId)} table operations ${formatCompactNumber(lane.totalRows)}`}>
                                                        <div class="cron-lane-bar-ops" style=${`width:${Math.max(lane.totalRows > 0 ? 4 : 0, rowPercent)}%`}></div>
                                                    </div>
                                                </div>
                                                <div class="cron-lane-load-metrics">
                                                    <span class="badge bg-primary text-white">${formatDuration(lane.durationMs)}</span>
                                                    <span class="badge bg-warning text-white">${formatCompactNumber(lane.totalRows)} ops</span>
                                                    ${lane.itemsProcessed > 0 && html`<span class="badge bg-success text-white">${formatCompactNumber(lane.itemsProcessed)} work</span>`}
                                                </div>
                                            </div>
                                        `;
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${!cronStatus && html`
                <div class="card mb-3 border-warning">
                    <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                        <div>
                            <div class="fw-semibold">Cron status is still loading</div>
                            <div class="text-muted small">Scale Readiness and Lane Status require the live cron status payload from the admin API.</div>
                        </div>
                        <button class="btn btn-sm btn-outline-primary" disabled=${loadingCronStatus} onClick=${loadCronStatus}>
                            ${loadingCronStatus ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            Refresh Status
                        </button>
                    </div>
                </div>
            `}

            ${scalePressure && html`
                <div class="row g-3 mb-3">
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${scaleSignalTooltip}>
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between gap-2">
                                    <div class="subheader">SLA pressure</div>
                                    <span class=${`badge ${getScaleSeverityBadgeClass(scalePressure.overallSeverity)}`}>${scalePressure.overallSeverity || 'unknown'}</span>
                                </div>
                                <div class="h2 mb-1 mt-2">${scalePressure.criticalSignals || 0}/${(scalePressure.criticalSignals || 0) + (scalePressure.warningSignals || 0)}</div>
                                <div class="text-muted small">critical / watched signals · ${formatSampleWindow(scalePressure.windowDays || rangeDays)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${scaleTopSignal ? `${scaleTopSignal.message || ''}\n${scaleTopSignal.recommendation || ''}` : scaleSignalTooltip}>
                            <div class="card-body">
                                <div class="subheader">Top signal</div>
                                <div class="h3 mb-1 mt-2 text-truncate">${scaleTopSignal?.title || 'Healthy'}</div>
                                <div class="text-muted small text-truncate">${scaleTopSignal?.metricValue ? `${scaleTopSignal.metricLabel || 'metric'}: ${scaleTopSignal.metricValue}` : (scalePressure.summary || 'No warning threshold crossed')}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${scaleTopTask ? `${scaleTopTask.taskId || 'Task'} latest ${formatDuration(scaleTopTask.latestDurationMs)}; max ${formatDuration(scaleTopTask.maxDurationMs)}; rows ${formatCompactNumber(scaleTopTask.totalRowOps || scaleTopTask.latestRowsScanned || 0)}` : 'No task hotspot rows available yet.'}>
                            <div class="card-body">
                                <div class="subheader">Runtime leader</div>
                                <div class="h3 mb-1 mt-2 text-truncate">${scaleTopTask?.taskId || '-'}</div>
                                <div class="text-muted small">${scaleTopTask ? `${formatDuration(scaleTopTask.latestDurationMs)} latest · ${formatLaneLabel(scaleTopTask.laneId)}` : 'No recent runtime pressure'}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${`${scaleIndexTooltip}\n${scaleTopLane ? `${formatLaneLabel(scaleTopLane.laneId)} runtime ${formatDuration(scaleTopLane.totalDurationMs)}` : ''}`}>
                            <div class="card-body">
                                <div class="subheader">Fan-out path</div>
                                <div class="h3 mb-1 mt-2">Current AppProduct</div>
                                <div class="text-muted small text-truncate">Existing projection for MODR device lookup</div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${cronStatus && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title mb-0">Lane Status</h3>
                            <div class="card-subtitle text-muted">Scheduled lanes run independently; manual jobs are queued separately.</div>
                        </div>
                        <button class="btn btn-sm btn-outline-primary ms-auto" disabled=${loadingCronStatus} onClick=${loadCronStatus}>
                            ${loadingCronStatus ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            Refresh Status
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="row g-3 align-items-stretch">
                            <div class="col-lg-4">
                                <div class="border rounded p-3 h-100">
                                    <div class="text-muted small mb-2">Active Lease</div>
                                    ${currentCronStatus.isLocked ? html`
                                        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                                            <span class=${`badge ${activeLockExpired ? 'bg-warning text-white' : 'bg-primary text-white'}`}>
                                                ${formatLaneLabel(activeLaneId)}
                                            </span>
                                            ${activeExecutionScope && String(activeExecutionScope).toLowerCase() !== 'global' && html`
                                                <span class="badge bg-dark text-white">${formatExecutionScope(activeExecutionScope)}</span>
                                            `}
                                            ${activeLockExpired && html`<span class="badge bg-danger text-white">Expired</span>`}
                                        </div>
                                        <div class="small text-muted text-break">${currentCronStatus.lockedBy || 'Unknown worker'}</div>
                                        ${lockExpiresAt && html`<div class="small mt-2">Renews by ${lockExpiresAt.toLocaleString()}</div>`}
                                    ` : html`
                                        <span class="badge bg-success text-white">No active scheduled lease</span>
                                    `}
                                </div>
                            </div>
                            <div class="col-lg-8">
                                <div class="row g-2">
                                    ${laneSummaries.map((lane) => html`
                                        <div class="col-sm-6 col-xl-4">
                                            <div class=${`border rounded p-3 h-100 ${lane.active ? 'border-primary' : ''}`}>
                                                <div class="d-flex justify-content-between align-items-start gap-2">
                                                    <div class="fw-semibold">${lane.label}</div>
                                                    ${lane.active && html`<span class="badge bg-primary text-white">Running</span>`}
                                                </div>
                                                <div class="small text-muted mt-1">${lane.total} task${lane.total === 1 ? '' : 's'}</div>
                                                <div class="mt-2">
                                                    ${lane.overdue > 0
                                                        ? html`<span class="badge bg-danger text-white">${lane.overdue} overdue</span>`
                                                        : html`<span class="badge bg-success-lt text-success">On schedule</span>`}
                                                </div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            <div class="mb-3">
                <h4>Activity Details & Filters</h4>
                <p class="text-muted small">
                    Cron jobs now run in independent scheduled lanes with per-task audit progress. This page shows lane health, execution history, email deliveries, and errors.
                </p>
            </div>

            ${highlightedEventId && html`
                <div class="card mb-3 border-primary">
                    <div class="card-header">
                        <h3 class="card-title mb-0">
                            <i class="ti ti-list-details me-2"></i>
                            Manual Job Detail
                        </h3>
                    </div>
                    <div class="card-body">
                        ${loadingSelectedAuditEvent ? html`
                            <div class="text-muted small">
                                <span class="spinner-border spinner-border-sm me-2"></span>
                                Loading selected audit event...
                            </div>
                        ` : selectedAuditEvent ? html`
                            ${(() => {
                                const meta = selectedAuditEvent.metadata || {};
                                const status = selectedAuditEvent.status || meta.status || 'Queued';
                                const taskId = selectedAuditEvent.targetType || meta.taskId || 'Unknown';
                                const scopeKey = selectedAuditEvent.targetId || meta.scopeKey || '-';
                                const durationSeconds = meta.durationSeconds;
                                const progressPercent = meta.progressPercent ?? meta.progress?.percent;
                                const statusClass = (() => {
                                    const n = String(status || '').toLowerCase();
                                    if (n === 'completed') return 'bg-success text-white';
                                    if (n === 'failed' || n === 'exception' || n === 'rejected') return 'bg-danger text-white';
                                    if (n === 'running') return 'bg-primary text-white';
                                    return 'bg-info text-white';
                                })();

                                return html`
                                    <div class="d-flex flex-wrap gap-2 mb-3">
                                        <span class="badge ${statusClass}">${status}</span>
                                        <span class="badge bg-secondary text-white">${taskId}</span>
                                        <span class="badge bg-dark text-white">${scopeKey}</span>
                                    </div>
                                    <div class="row g-3 small">
                                        <div class="col-md-6">
                                            <div class="text-muted">Audit Event ID</div>
                                            <div class="fw-semibold font-monospace">${selectedAuditEvent.eventId}</div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="text-muted">Requested By</div>
                                            <div class="fw-semibold">${selectedAuditEvent.performedBy || 'system'}</div>
                                        </div>
                                        ${selectedAuditEvent.timestamp && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Created At</div>
                                                <div class="fw-semibold">${new Date(selectedAuditEvent.timestamp).toLocaleString()}</div>
                                            </div>
                                        `}
                                        ${selectedAuditEvent.completedAt && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Completed At</div>
                                                <div class="fw-semibold">${new Date(selectedAuditEvent.completedAt).toLocaleString()}</div>
                                            </div>
                                        `}
                                        ${progressPercent != null && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Progress</div>
                                                <div class="fw-semibold">${progressPercent}%</div>
                                            </div>
                                        `}
                                        ${durationSeconds != null && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Duration</div>
                                                <div class="fw-semibold">${Number(durationSeconds).toFixed(2)}s</div>
                                            </div>
                                        `}
                                    </div>
                                    ${meta.error && html`
                                        <div class="alert alert-danger mt-3 mb-0">
                                            <strong>Error:</strong> ${meta.error}
                                        </div>
                                    `}
                                `;
                            })()}
                        ` : html`
                            <div class="text-muted small">Selected audit event was not found. It may be outside the loaded retention window.</div>
                        `}
                    </div>
                </div>
            `}

            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">Event Type</label>
                            <select class="form-select" value=${filterJob} onChange=${(e) => setFilterJob(e.target.value)}>
                                <option value="all">All Events</option>
                                <option value="CronExecution">Cron Execution</option>
                                <option value="ReportSent">Report Sent</option>
                                <option value="ReportFailed">Report Failed</option>
                                <option value="BatchComplete">Batch Complete</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Status</label>
                            <select class="form-select" value=${filterStatus} onChange=${(e) => setFilterStatus(e.target.value)}>
                                <option value="all">All Status</option>
                                <option value="success">Success</option>
                                <option value="running">Running</option>
                                <option value="queued">Queued</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Organization</label>
                            <input 
                                type="text" 
                                class="form-control" 
                                placeholder="Filter by Org ID"
                                value=${filterOrg}
                                onInput=${(e) => setFilterOrg(e.target.value)}
                            />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Time Range</label>
                            <select class="form-select" value=${rangeDays} onChange=${(e) => setRangeDays(parseInt(e.target.value, 10))}>
                                <option value="7">Last 7 days</option>
                                <option value="15">Last 15 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-3 d-flex justify-content-between align-items-center">
                        <div class="text-muted small">
                            Showing ${filteredEvents.length} of ${events.length} events
                        </div>
                        <button class="btn btn-sm btn-primary" disabled=${loading} onClick=${() => loadCronEvents(true)}>
                            ${loading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            ${loading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            ${cronStatus?.currentStatus?.warnings?.length > 0 && html`
                <div class="alert alert-warning mb-3" role="alert">
                    <div class="fw-semibold mb-2">Operational Warnings</div>
                    ${cronStatus.currentStatus.warnings.map(warning => html`
                        <div class="small mb-1">${warning.message}</div>
                    `)}
                </div>
            `}

            <!-- Scheduled Tasks -->
            ${cronStatus && cronStatus.tasks && cronStatus.tasks.length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">Scheduled Tasks</h3>
                        <div class="card-subtitle text-muted">Includes latest execution per task</div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table">
                            <thead>
                                <tr>
                                    <th>Task ID</th>
                                    <th>Lane</th>
                                    <th>Frequency</th>
                                    <th>Last Execution</th>
                                    <th>Next Scheduled</th>
                                    <th>Executions</th>
                                    <th>Avg Duration</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cronStatus.tasks.map(task => {
                                    const failureRate = task.totalExecutions > 0 ? (task.failedExecutions / task.totalExecutions * 100).toFixed(1) : 0;
                                    const liveState = getTaskLiveState(task);

                                    const execHistory = Array.isArray(task.executionHistory) ? task.executionHistory : [];
                                    const lastExec = execHistory
                                        .slice()
                                        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

                                    const lastExecStatus = lastExec?.status || null;
                                    const lastExecAt = lastExec?.completedAt ? new Date(lastExec.completedAt).toLocaleString() : null;
                                    const lastExecBadgeClass =
                                        lastExecStatus === 'Success'
                                            ? 'bg-success-lt text-success'
                                            : lastExecStatus === 'Failed'
                                                ? 'bg-danger-lt text-danger'
                                                : lastExecStatus
                                                    ? 'bg-warning-lt text-warning'
                                                    : 'bg-secondary-lt text-secondary';
                                    
                                    return html`
                                        <tr>
                                            <td>
                                                <div class="fw-bold">${task.displayName || task.taskId}</div>
                                                ${(task.displayName && task.displayName !== task.taskId)
                                                    ? html`<div class="text-muted small">${task.taskId}</div>`
                                                    : ''}
                                                ${task.description ? html`<div class="text-muted small mt-1">${task.description}</div>` : ''}
                                            </td>
                                            <td>
                                                <span class="badge bg-secondary text-white">${formatLaneLabel(task.laneId)}</span>
                                                ${task.executionScope && String(task.executionScope).toLowerCase() !== 'global' && html`
                                                    <div class="mt-1"><span class="badge bg-dark text-white">${formatExecutionScope(task.executionScope)}</span></div>
                                                `}
                                            </td>
                                            <td>
                                                <span class="badge bg-blue-lt text-blue">${task.frequencyHours}h</span>
                                            </td>
                                            <td>
                                                <span class="badge ${lastExecBadgeClass}">
                                                    ${lastExecAt ? lastExecAt : 'Never'}
                                                    ${lastExecStatus ? ` · ${lastExecStatus}` : ''}
                                                </span>
                                                ${lastExec?.durationMs != null
                                                    ? html`<div class="text-muted small mt-1">${(lastExec.durationMs / 1000).toFixed(2)}s</div>`
                                                    : ''}
                                            </td>
                                            <td>
                                                ${task.nextScheduledRun 
                                                    ? new Date(task.nextScheduledRun).toLocaleString() 
                                                    : html`<span class="text-muted">-</span>`}
                                            </td>
                                            <td>
                                                <div>
                                                    <span class="badge bg-info-lt text-info">${task.totalExecutions} total</span>
                                                    ${task.failedExecutions > 0 ? html`<span class="badge bg-danger ms-1">${task.failedExecutions} failed</span>` : ''}
                                                </div>
                                                ${task.totalExecutions > 0 && html`<small class="text-muted">${failureRate}% failure rate</small>`}
                                            </td>
                                            <td>
                                                ${task.averageDurationMs > 0 
                                                    ? html`<span class="text-muted">${(task.averageDurationMs / 1000).toFixed(2)}s</span>`
                                                    : html`<span class="text-muted">-</span>`}
                                            </td>
                                            <td>
                                                <span class="badge ${liveState.badgeClass}">
                                                    <i class="ti ${liveState.icon} me-1"></i>
                                                    ${liveState.label}
                                                </span>
                                                ${liveState.progressPercent != null && html`
                                                    <div class="text-muted small mt-1">${liveState.progressPercent}% complete</div>
                                                `}
                                                ${liveState.ageMinutes != null && html`
                                                    <div class="text-muted small">last update ${Math.floor(liveState.ageMinutes)}m ago</div>
                                                `}
                                            </td>
                                        </tr>
                                    `;
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            `}

            ${filteredEvents.length === 0 && !loading ? html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-filter-off"></i></div>
                    <p class="empty-title">No matching cron activity</p>
                    <p class="empty-subtitle text-muted">
                        ${events.length === 0 ? 'Try expanding the date range or refresh.' : 'Try adjusting your filters.'}
                    </p>
                </div>
            ` : html`
                <div class="table-responsive">
                    <table class="table table-sm table-hover">
                        <thead>
                            <tr>
                                <th>Event</th>
                                <th>Org</th>
                                <th>Time</th>
                                <th>Metrics</th>
                                <th>Description</th>
                                <th style="width: 40px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredEvents.map(renderEventRow)}
                        </tbody>
                    </table>
                </div>

                <!-- Infinite Scroll Sentinel -->
                <div ref=${scrollObserverRef} style="height: 20px; margin: 20px 0;"></div>
                
                ${loadingMore ? html`
                    <div class="text-center py-3">
                        <div class="spinner-border spinner-border-sm text-primary" role="status">
                            <span class="visually-hidden">Loading more...</span>
                        </div>
                        <div class="text-muted mt-2 small">Loading more events...</div>
                    </div>
                ` : ''}
                
                ${!hasMore && events.length > 0 ? html`
                    <div class="text-center text-muted py-2">
                        <small>No more events to load</small>
                    </div>
                ` : ''}
            `}
        </div>

        ${renderTraceModal()}
    `;
}
