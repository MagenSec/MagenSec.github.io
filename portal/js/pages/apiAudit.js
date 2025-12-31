/**
 * API Audit Page - View all API calls with request/response details
 */

import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import toast from '../toast.js';
import { logger } from '../config.js';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

// ApexCharts instance for API calls over time
let apiChartInstance = null;

export function ApiAuditPage() {
    logger.debug('[API Audit] Component rendering...');
    
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [filters, setFilters] = useState({
        httpMethod: 'all',
        user: 'all',
        statusFilter: 'all', // all, success, error
        search: ''
    });
    const [rangeDays, setRangeDays] = useState(7);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [expandedEvent, setExpandedEvent] = useState(null);
    const chartRef = useRef(null);
    const eventsPerPage = 100;
    const currentOrgId = orgContext.getCurrentOrg()?.orgId;

    // Load API audit data
    useEffect(() => {
        loadApiEvents();

        const handler = () => {
            setPage(1);
            loadApiEvents();
        };
        const unsubscribe = orgContext.onChange(handler);
        window.addEventListener('orgChanged', handler);

        return () => {
            unsubscribe?.();
            window.removeEventListener('orgChanged', handler);
        };
    }, [currentOrgId, rangeDays]);

    // Filter events when filters change
    useEffect(() => {
        applyFilters();
    }, [events, filters]);

    // Render chart when filtered events change
    useEffect(() => {
        if (filteredEvents.length > 0 && chartRef.current && window.ApexCharts) {
            renderApiChart();
        }
    }, [filteredEvents]);

    async function loadApiEvents() {
        logger.debug('[API Audit] loadApiEvents called');
        setLoading(true);

        try {
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg) {
                logger.warn('[API Audit] No org selected');
                setLoading(false);
                return;
            }

            const query = new URLSearchParams({
                portalActivity: 'true', // CRITICAL: Fetch API audit data
                pageSize: eventsPerPage.toString(),
                days: rangeDays.toString()
            });

            const res = await api.get(`/api/v1/orgs/${currentOrg.orgId}/audit?${query.toString()}`);
            logger.debug('[API Audit] API response:', res);

            if (res.success && res.data) {
                const eventsData = res.data.events || [];
                logger.debug('[API Audit] Events loaded:', eventsData.length);
                logger.debug('[API Audit] First few events:', eventsData.slice(0, 3).map(e => ({ 
                    performedBy: e.performedBy, 
                    timestamp: e.timestamp, 
                    subType: e.subType 
                })));
                setEvents(eventsData);
                setHasMore(res.data.hasMore || false);
            } else {
                logger.error('[API Audit] API returned error:', res.message);
                toast.show(res.message || 'Failed to load API audit events', 'error');
                setEvents([]);
            }
        } catch (error) {
            logger.error('[API Audit] Error loading events:', error);
            toast.show('Failed to load API audit events', 'error');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }

    function applyFilters() {
        let filtered = [...events];

        // Filter by HTTP method
        if (filters.httpMethod !== 'all') {
            filtered = filtered.filter(e => e.subType === filters.httpMethod);
        }

        // Filter by user
        if (filters.user !== 'all') {
            filtered = filtered.filter(e => e.performedBy === filters.user);
        }

        // Filter by status (success/error)
        if (filters.statusFilter === 'success') {
            filtered = filtered.filter(e => {
                const statusCode = e.metadata?.StatusCode;
                return statusCode && parseInt(statusCode) >= 200 && parseInt(statusCode) < 300;
            });
        } else if (filters.statusFilter === 'error') {
            filtered = filtered.filter(e => {
                const statusCode = e.metadata?.StatusCode;
                return statusCode && (parseInt(statusCode) < 200 || parseInt(statusCode) >= 300);
            });
        }

        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(e =>
                (e.targetId || '').toLowerCase().includes(searchLower) ||
                (e.description || '').toLowerCase().includes(searchLower) ||
                (e.performedBy || '').toLowerCase().includes(searchLower)
            );
        }

        setFilteredEvents(filtered);
    }

    function renderApiChart() {
        if (!window.ApexCharts || !chartRef.current) {
            logger.warn('[API Audit] ApexCharts not loaded or chart ref not ready');
            return;
        }

        // Destroy existing chart
        if (apiChartInstance) {
            apiChartInstance.destroy();
            apiChartInstance = null;
        }

        // Group by hour (last 24 hours) or by day (last 7 days)
        const groupByHour = rangeDays <= 1;
        const timeGroups = {};

        filteredEvents.forEach(event => {
            const timestamp = new Date(event.timestamp);
            const key = groupByHour
                ? `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00`
                : `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`;

            if (!timeGroups[key]) {
                timeGroups[key] = { total: 0, success: 0, error: 0 };
            }

            timeGroups[key].total++;
            const statusCode = event.metadata?.StatusCode;
            if (statusCode && parseInt(statusCode) >= 200 && parseInt(statusCode) < 300) {
                timeGroups[key].success++;
            } else if (statusCode) {
                timeGroups[key].error++;
            }
        });

        const sortedKeys = Object.keys(timeGroups).sort();
        const chartData = sortedKeys.map(key => ({
            x: key,
            total: timeGroups[key].total,
            success: timeGroups[key].success,
            error: timeGroups[key].error
        }));

        const options = {
            chart: {
                type: 'bar',
                height: 300,
                stacked: true,
                toolbar: { show: false }
            },
            series: [
                {
                    name: 'Success',
                    data: chartData.map(d => ({ x: d.x, y: d.success })),
                    color: '#28a745'
                },
                {
                    name: 'Error',
                    data: chartData.map(d => ({ x: d.x, y: d.error })),
                    color: '#dc3545'
                }
            ],
            xaxis: {
                type: 'category',
                labels: { rotate: -45, rotateAlways: groupByHour }
            },
            yaxis: {
                title: { text: 'API Calls' }
            },
            tooltip: {
                y: {
                    formatter: (val) => `${val} calls`
                }
            },
            legend: {
                position: 'top'
            }
        };

        apiChartInstance = new window.ApexCharts(chartRef.current, options);
        apiChartInstance.render();
    }

    function getStatusBadge(statusCode) {
        const code = parseInt(statusCode);
        if (code >= 200 && code < 300) {
            return html`<span class="badge badge-outline text-success">${statusCode}</span>`;
        } else if (code >= 400 && code < 500) {
            return html`<span class="badge badge-outline text-warning">${statusCode}</span>`;
        } else if (code >= 500) {
            return html`<span class="badge badge-outline text-danger">${statusCode}</span>`;
        }
        return html`<span class="badge badge-outline text-secondary">${statusCode}</span>`;
    }

    function getHttpMethodBadge(method) {
        const colors = {
            'GET': 'primary',
            'POST': 'success',
            'PUT': 'warning',
            'PATCH': 'info',
            'DELETE': 'danger'
        };
        const color = colors[method] || 'secondary';
        return html`<span class="badge badge-outline text-${color}">${method}</span>`;
    }

    function formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        
        return date.toLocaleString();
    }

    function toggleEventDetails(eventId) {
        setExpandedEvent(expandedEvent === eventId ? null : eventId);
    }

    function parseMetadata(metadataJson) {
        if (!metadataJson) return {};
        try {
            return typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;
        } catch {
            return {};
        }
    }

    // Get unique values for filters
    const httpMethods = [...new Set(events.map(e => e.subType).filter(Boolean))].sort();
    const users = [...new Set(events.map(e => e.performedBy).filter(Boolean))].sort();
    
    // Debug logging
    if (events.length > 0) {
        logger.debug('[API Audit] Sample events:', events.slice(0, 3).map(e => ({ performedBy: e.performedBy, subType: e.subType, eventType: e.eventType })));
        logger.debug('[API Audit] Unique users:', users);
    }

    return html`
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            <i class="ti ti-api me-2"></i>
                            API Audit
                        </h2>
                        <div class="text-muted mt-1">View all API calls with request/response details</div>
                    </div>
                    <div class="col-auto ms-auto">
                        <div class="btn-list">
                            <select 
                                class="form-select" 
                                value=${rangeDays}
                                onChange=${(e) => setRangeDays(Number(e.target.value))}
                            >
                                <option value="1">Last 24 hours</option>
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                            <button 
                                class="btn btn-primary" 
                                onClick=${loadApiEvents}
                                disabled=${loading}
                            >
                                <i class="ti ti-refresh me-1"></i>
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Chart -->
            <div class="card mb-3">
                <div class="card-body">
                    <h3 class="card-title">API Calls Over Time</h3>
                    <div ref=${chartRef}></div>
                </div>
            </div>

            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row g-2 mb-2">
                        <div class="col-md-2">
                            <label class="form-label">HTTP Method</label>
                            <select 
                                class="form-select" 
                                value=${filters.httpMethod}
                                onChange=${(e) => setFilters({ ...filters, httpMethod: e.target.value })}
                            >
                                <option value="all">All Methods</option>
                                ${httpMethods.map(method => html`
                                    <option value=${method}>${method}</option>
                                `)}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">User</label>
                            <select 
                                class="form-select" 
                                value=${filters.user}
                                onChange=${(e) => setFilters({ ...filters, user: e.target.value })}
                            >
                                <option value="all">All Users</option>
                                ${users.map(user => html`
                                    <option value=${user}>${user}</option>
                                `)}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Status</label>
                            <select 
                                class="form-select" 
                                value=${filters.statusFilter}
                                onChange=${(e) => setFilters({ ...filters, statusFilter: e.target.value })}
                            >
                                <option value="all">All Statuses</option>
                                <option value="success">Success (2xx)</option>
                                <option value="error">Errors (4xx, 5xx)</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Search</label>
                            <input 
                                type="text" 
                                class="form-control" 
                                placeholder="Search..."
                                value=${filters.search}
                                onInput=${(e) => setFilters({ ...filters, search: e.target.value })}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Events Table -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">API Calls (${filteredEvents.length})</h3>
                </div>
                <div class="table-responsive">
                    <table class="table card-table table-vcenter">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Description</th>
                                <th>User</th>
                                <th>Status</th>
                                <th>Duration</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${loading ? html`
                                <tr><td colspan="8" class="text-center py-4">
                                    <div class="spinner-border spinner-border-sm me-2"></div>
                                    Loading API audit data...
                                </td></tr>
                            ` : filteredEvents.length === 0 ? html`
                                <tr><td colspan="8" class="text-center py-4 text-muted">
                                    No API calls found for the selected filters
                                </td></tr>
                            ` : filteredEvents.map(event => {
                                const metadata = parseMetadata(event.metadata);
                                const statusCode = metadata.StatusCode || 'N/A';
                                const durationMs = metadata.DurationMs || 0;
                                const isExpanded = expandedEvent === event.eventId;

                                return html`
                                    <tr key=${event.eventId}>
                                        <td class="text-muted">${formatTimestamp(event.timestamp)}</td>
                                        <td>${getHttpMethodBadge(event.subType)}</td>
                                        <td><code class="small">${event.targetId}</code></td>
                                        <td>${event.description}</td>
                                        <td class="text-muted small">${event.performedBy}</td>
                                        <td>${getStatusBadge(statusCode)}</td>
                                        <td class="text-muted small">${formatDuration(durationMs)}</td>
                                        <td class="text-end">
                                            <button 
                                                class="btn btn-sm btn-ghost-secondary"
                                                onClick=${() => toggleEventDetails(event.eventId)}
                                            >
                                                <i class="ti ti-${isExpanded ? 'chevron-up' : 'chevron-down'}"></i>
                                            </button>
                                        </td>
                                    </tr>
                                    ${isExpanded ? html`
                                        <tr key="${event.eventId}-details">
                                            <td colspan="8" class="bg-light">
                                                <div class="p-3">
                                                    <div class="row">
                                                        <div class="col-md-6">
                                                            <h4 class="text-muted mb-2">Request Details</h4>
                                                            <table class="table table-sm">
                                                                <tr>
                                                                    <td><strong>Request ID:</strong></td>
                                                                    <td><code class="small">${metadata.RequestId || 'N/A'}</code></td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>User Agent:</strong></td>
                                                                    <td class="small">${metadata.UserAgent || 'N/A'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>IP Address:</strong></td>
                                                                    <td><code class="small">${metadata.IpAddress || 'N/A'}</code></td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Source Page:</strong></td>
                                                                    <td class="small">${metadata.SourcePage || 'Direct'}</td>
                                                                </tr>
                                                            </table>
                                                        </div>
                                                        <div class="col-md-6">
                                                            <h4 class="text-muted mb-2">Response Details</h4>
                                                            <table class="table table-sm">
                                                                <tr>
                                                                    <td><strong>Timestamp:</strong></td>
                                                                    <td class="small">${new Date(event.timestamp).toLocaleString()}</td>
                                                                </tr>
                                                                ${metadata.ErrorCode ? html`
                                                                    <tr>
                                                                        <td><strong>Error Code:</strong></td>
                                                                        <td><code class="small text-danger">${metadata.ErrorCode}</code></td>
                                                                    </tr>
                                                                ` : null}
                                                                ${metadata.ErrorMessage ? html`
                                                                    <tr>
                                                                        <td><strong>Error Message:</strong></td>
                                                                        <td class="small text-danger">${metadata.ErrorMessage}</td>
                                                                    </tr>
                                                                ` : null}
                                                            </table>
                                                        </div>
                                                    </div>
                                                    <div class="mt-3">
                                                        <h4 class="text-muted mb-2">Full Metadata</h4>
                                                        <pre class="json-metadata p-2 rounded" style="max-height: 300px; overflow-y: auto;">${JSON.stringify(metadata, null, 2)}</pre>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ` : null}
                                `;
                            })}
                        </tbody>
                    </table>
                </div>
                ${hasMore ? html`
                    <div class="card-footer">
                        <button 
                            class="btn btn-primary w-100" 
                            onClick=${() => setPage(page + 1)}
                            disabled=${loading}
                        >
                            Load More
                        </button>
                    </div>
                ` : null}
            </div>
        </div>
    `;
}
