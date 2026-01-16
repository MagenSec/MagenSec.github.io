/**
 * Cron Activity Page - View cron job executions and report email activity
 */

import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import toast from '../toast.js';
import { logger } from '../config.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function CronActivityPage({ cronStatus }) {
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [rangeDays, setRangeDays] = useState(7);
    const [hasMore, setHasMore] = useState(false);
    const [continuationToken, setContinuationToken] = useState(null);
    const [filterJob, setFilterJob] = useState('all'); // 'all', 'CronExecution', 'ReportSent', 'ReportFailed', 'BatchComplete'
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'success', 'failed'
    const [filterOrg, setFilterOrg] = useState('');
    const [expandedEvents, setExpandedEvents] = useState(new Set());

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

    async function loadCronEvents(reset = false) {
        setLoading(true);
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
            setLoading(false);
        }
    }

    function renderEventRow(e) {
        const ts = e.timestamp ? new Date(e.timestamp).toLocaleString() : '-';
        const isExpanded = expandedEvents.has(e.eventId);
        
        // Determine event type category and badge color
        let eventCategory = 'Cron Run';
        let badgeClass = 'bg-primary-lt';
        let icon = 'ti-clock';
        
        if (e.eventType === 'CRONRUN') {
            eventCategory = 'Cron Execution';
            badgeClass = 'bg-blue-lt';
            icon = 'ti-player-play';
        } else if (e.eventType === 'SecurityReportEmailSent' || e.eventType === 'SECURITY_REPORT_SENT') {
            eventCategory = 'Report Sent';
            badgeClass = 'bg-green-lt';
            icon = 'ti-mail-check';
        } else if (e.eventType === 'SecurityReportEmailFailed' || e.eventType === 'SECURITY_REPORT_FAILED') {
            eventCategory = 'Report Failed';
            badgeClass = 'bg-red-lt';
            icon = 'ti-mail-x';
        } else if (e.eventType === 'SECURITY_REPORT_BATCH') {
            eventCategory = 'Batch Complete';
            badgeClass = 'bg-cyan-lt';
            icon = 'ti-package';
        }
        
        // Extract metadata for detailed view
        const meta = e.metadata || {};
        const recipientCount = meta.recipientCount || 0;
        const tier = meta.tier || '';
        const duration = meta.duration || '';
        const itemsProcessed = meta.itemsProcessed || 0;
        const successful = meta.successful || 0;
        const failed = meta.failed || 0;
        
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
                    <span class="badge bg-secondary-lt">${e.orgId || 'SYSTEM'}</span>
                </td>
                <td class="text-muted small">${ts}</td>
                <td>
                    ${tier && html`<span class="badge bg-purple-lt me-1">${tier}</span>`}
                    ${recipientCount > 0 && html`<span class="badge bg-info-lt me-1">${recipientCount} recipient${recipientCount > 1 ? 's' : ''}</span>`}
                    ${itemsProcessed > 0 && html`<span class="badge bg-yellow-lt">${itemsProcessed} processed</span>`}
                </td>
                <td class="text-truncate" style="max-width: 300px;" title=${e.description}>
                    ${e.description || '-'}
                </td>
                <td>
                    <i class="ti ti-chevron-${isExpanded ? 'up' : 'down'}"></i>
                </td>
            </tr>
            ${isExpanded && html`
                <tr class="bg-light">
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
                                ${Object.keys(meta).length > 0 && html`
                                    <div class="col-12">
                                        <details>
                                            <summary class="cursor-pointer text-muted small">Raw Metadata</summary>
                                            <pre class="mt-2 mb-0 small">${JSON.stringify(meta, null, 2)}</pre>
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
                (filterJob === 'ReportSent' && (e.eventType === 'SecurityReportEmailSent' || e.eventType === 'SECURITY_REPORT_SENT')) ||
                (filterJob === 'ReportFailed' && (e.eventType === 'SecurityReportEmailFailed' || e.eventType === 'SECURITY_REPORT_FAILED')) ||
                (filterJob === 'BatchComplete' && e.eventType === 'SECURITY_REPORT_BATCH');
            if (!jobMatch) return false;
        }
        if (filterStatus !== 'all') {
            const statusMatch = 
                (filterStatus === 'success' && (e.eventType.includes('Sent') || e.eventType.includes('SENT') || e.eventType === 'CRONRUN')) ||
                (filterStatus === 'failed' && (e.eventType.includes('Failed') || e.eventType.includes('FAILED')));
            if (!statusMatch) return false;
        }
        if (filterOrg && filterOrg.trim() !== '') {
            if (!e.orgId || !e.orgId.toLowerCase().includes(filterOrg.toLowerCase())) return false;
        }
        return true;
    });

    return html`
        <div>
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
                        <div class="card-subtitle text-muted">Last 7 days of execution history</div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table">
                            <thead>
                                <tr>
                                    <th>Task ID</th>
                                    <th>Frequency</th>
                                    <th>Last Run</th>
                                    <th>Hours Since</th>
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
                                    
                                    return html`
                                        <tr>
                                            <td>
                                                <div class="fw-bold">${task.taskId}</div>
                                            </td>
                                            <td>
                                                <span class="badge bg-blue-lt">${task.frequencyHours}h</span>
                                            </td>
                                            <td>
                                                ${task.lastRunAt 
                                                    ? new Date(task.lastRunAt).toLocaleString() 
                                                    : html`<span class="text-muted">Never</span>`}
                                            </td>
                                            <td>
                                                ${task.hoursSinceLastRun != null 
                                                    ? html`<span class="${isOverdue ? 'text-danger fw-bold' : ''}">${task.hoursSinceLastRun.toFixed(1)}h</span>`
                                                    : html`<span class="text-muted">-</span>`}
                                            </td>
                                            <td>
                                                ${task.nextScheduledRun 
                                                    ? new Date(task.nextScheduledRun).toLocaleString() 
                                                    : html`<span class="text-muted">-</span>`}
                                            </td>
                                            <td>
                                                <div>
                                                    <span class="badge bg-info-lt">${task.totalExecutions} total</span>
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

            <!-- Recent Executions -->
            ${cronStatus && cronStatus.tasks && cronStatus.tasks.some(t => t.executionHistory && t.executionHistory.length > 0) && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">Recent Executions</h3>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-vcenter card-table">
                            <thead>
                                <tr>
                                    <th>Task</th>
                                    <th>Completed At</th>
                                    <th>Status</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cronStatus.tasks.flatMap(task => 
                                    (task.executionHistory || []).map(exec => html`
                                        <tr>
                                            <td>${task.taskId}</td>
                                            <td>${new Date(exec.completedAt).toLocaleString()}</td>
                                            <td>
                                                <span class="badge bg-${exec.status === 'Success' ? 'success' : exec.status === 'Failed' ? 'danger' : 'warning'}">
                                                    ${exec.status}
                                                </span>
                                            </td>
                                            <td>
                                                ${exec.durationMs != null 
                                                    ? html`${(exec.durationMs / 1000).toFixed(2)}s`
                                                    : html`<span class="text-muted">-</span>`}
                                            </td>
                                        </tr>
                                    `)
                                )}
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

                ${hasMore && html`
                    <div class="text-center mt-3">
                        <button class="btn btn-outline-primary" disabled=${loading} onClick=${() => loadCronEvents(false)}>
                            ${loading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                            Load More
                        </button>
                    </div>
                `}
            `}
        </div>
    `;
}
