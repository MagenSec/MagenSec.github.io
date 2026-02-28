/**
 * Cron Activity Page - View cron job executions and report email activity
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import toast from '@toast';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

export function CronActivityPage({ cronStatus: propCronStatus }) {
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [events, setEvents] = useState([]);
    const [rangeDays, setRangeDays] = useState(7);
    const [hasMore, setHasMore] = useState(false);
    const [continuationToken, setContinuationToken] = useState(null);
    const scrollObserverRef = useRef(null);
    const [filterJob, setFilterJob] = useState('all'); // 'all', 'CronExecution', 'ReportSent', 'ReportFailed', 'BatchComplete'
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'success', 'failed'
    const [filterOrg, setFilterOrg] = useState('');
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [cronStatus, setCronStatus] = useState(propCronStatus || null);
    const [loadingCronStatus, setLoadingCronStatus] = useState(false);

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
        loadCronStatus();
    }, []);

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
            const res = await api.get('/api/v1/admin/cron/status');
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
        
        return html`
            <tr class="cursor-pointer" onClick=${() => {
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
                if (filterStatus === 'success') {
                    if (e.eventType === 'CRONRUN') {
                        const status = e.metadata?.status || e.metadata?.Status;
                        return !status || status === 'Completed';
                    }
                    if (e.eventType === 'SECURITY_REPORT') {
                        return ((e.subType || '').toLowerCase().includes('failed')) === false;
                    }
                    return false;
                }
                if (filterStatus === 'failed') {
                    if (e.eventType === 'CRONRUN') {
                        const status = e.metadata?.status || e.metadata?.Status;
                        return !!status && status !== 'Completed';
                    }
                    if (e.eventType === 'SECURITY_REPORT') {
                        return e.subType === 'SecurityReportFailed' || e.subType === 'FAILED';
                    }
                    return false;
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

    return html`
        <div class="page-header d-print-none mb-3">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>
                            Cron Activity
                        </h2>
                        <div class="page-subtitle">
                            <span class="text-muted">View cron job executions and report email activity</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="container-xl">
            <!-- Summary Statistics -->
            ${events.length > 0 && html`
                <div class="row g-3 mb-3">
                    ${(() => {
                        const totalEvents = events.length;
                        const successCount = events.filter(e => 
                            (e.eventType === 'CRONRUN' && (!e.metadata?.status || e.metadata?.status === 'Completed' || e.metadata?.Status === 'Completed')) ||
                            (e.eventType === 'SECURITY_REPORT' && ((e.subType || '').toLowerCase().includes('failed')) === false)
                        ).length;
                        const failureCount = events.filter(e => 
                            (e.eventType === 'CRONRUN' && (e.metadata?.status || e.metadata?.Status) && (e.metadata?.status || e.metadata?.Status) !== 'Completed') ||
                            (e.eventType === 'SECURITY_REPORT' && e.subType === 'SecurityReportFailed')
                        ).length;
                        const successRate = totalEvents > 0 ? ((successCount / totalEvents) * 100).toFixed(1) : 0;
                        const lastEvent = events[0];
                        const lastEventTime = lastEvent?.timestamp ? new Date(lastEvent.timestamp).toLocaleString() : 'N/A';
                        
                        return html`
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Total Events</div>
                                        <div class="h3 mb-0">${totalEvents}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Success Rate</div>
                                        <div class="h3 mb-0 text-success">${successRate}%</div>
                                        <small class="text-muted">${successCount} successful</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Failures</div>
                                        <div class="h3 mb-0 ${failureCount > 0 ? 'text-danger' : 'text-success'}">${failureCount}</div>
                                        ${failureCount > 0 ? html`<small class="text-danger">Requires attention</small>` : html`<small class="text-muted">All clear</small>`}
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-muted small mb-2">Last Activity</div>
                                        <div class="small mb-0">${lastEventTime}</div>
                                        ${lastEvent && html`<span class="badge bg-${(lastEvent.eventType === 'SECURITY_REPORT' && (lastEvent.subType === 'SecurityReportFailed' || lastEvent.subType === 'FAILED')) ? 'danger' : 'success'}-lt mt-2 mt-sm-0">${(() => {
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

            <div class="mb-3">
                <h4>Activity Details & Filters</h4>
                <p class="text-muted small">
                    Cron Jobs run automated tasks every hour (Credit Consumption, Daily Reports). 
                    This page shows execution history, email deliveries, and errors.
                </p>
            </div>

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
                                    const hoursOverdue = task.hoursSinceLastRun ? task.hoursSinceLastRun - task.frequencyHours : 0;
                                    const isOverdue = task.isOverdue;
                                    const failureRate = task.totalExecutions > 0 ? (task.failedExecutions / task.totalExecutions * 100).toFixed(1) : 0;

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
                                                ${isOverdue 
                                                    ? html`
                                                        <span class="badge bg-danger">
                                                            <i class="ti ti-alert-circle me-1"></i>
                                                            Overdue
                                                        </span>
                                                    `
                                                    : html`
                                                        <span class="badge bg-success">
                                                            <i class="ti ti-check me-1"></i>
                                                            On Schedule
                                                        </span>
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
    `;
}
