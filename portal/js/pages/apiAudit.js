/**
 * API Audit Page - View all API calls with request/response details
 */

import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import toast from '../toast.js';
import { logger } from '../config.js';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

// ApexCharts instances
let apiChartInstance = null;
let responseChartInstance = null;

export function ApiAuditPage() {
    logger.debug('[API Audit] Component rendering...');
    
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [filters, setFilters] = useState({
        httpMethod: 'all',
        orgId: 'all',
        deviceId: 'all',
        endpoint: 'all',
        user: 'all',
        statusFilter: 'all', // all, success, error
        search: ''
    });
    const [sortConfig, setSortConfig] = useState({
        column: 'timestamp', // time, org, deviceId, endpoint, user, status, duration
        direction: 'desc' // asc, desc
    });
    const [rangeDays, setRangeDays] = useState(7);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [continuationToken, setContinuationToken] = useState(null);
    const [expandedEvent, setExpandedEvent] = useState(null);
    const chartRef = useRef(null);
    const eventsPerPage = 100;
    const currentOrgId = orgContext.getCurrentOrg()?.orgId;

    // Load API audit data
    useEffect(() => {
        loadApiEvents(true);

        const handler = () => {
            setPage(1);
            loadApiEvents(true);
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
    }, [events, filters, sortConfig]);

    // Render chart when filtered events change
    useEffect(() => {
        if (filteredEvents.length > 0 && chartRef.current && window.ApexCharts) {
            renderApiChart();
        }
    }, [filteredEvents]);

    // Render response codes/duration chart when filtered events change
    useEffect(() => {
        if (filteredEvents.length > 0 && window.ApexCharts) {
            renderResponseChart();
        }
    }, [filteredEvents]);

    async function loadApiEvents(reset = false) {
        logger.debug('[API Audit] loadApiEvents called, reset:', reset);
        setLoading(true);

        try {
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg) {
                logger.warn('[API Audit] No org selected');
                setLoading(false);
                return;
            }

            const query = new URLSearchParams({
                apiActivity: 'true', // CRITICAL: Fetch user API calls (exclude heartbeats)
                pageSize: eventsPerPage.toString(),
                days: rangeDays.toString()
            });

            // Add continuation token if loading more
            if (!reset && continuationToken) {
                query.set('continuationToken', continuationToken);
                logger.debug('[API Audit] Using continuation token:', continuationToken);
            }

            const res = await api.get(`/api/v1/admin/audit?${query.toString()}`);
            logger.debug('[API Audit] API response hasMore:', res.data?.hasMore, 'newToken:', res.data?.continuationToken);

            if (res.success && res.data) {
                const eventsData = res.data.events || [];
                logger.debug('[API Audit] Events loaded:', eventsData.length, 'reset:', reset);
                
                // Check for duplicates by eventId
                const newEvents = reset ? eventsData : (() => {
                    const existingIds = new Set(events.map(e => e.eventId));
                    const uniqueNew = eventsData.filter(e => !existingIds.has(e.eventId));
                    logger.debug('[API Audit] Filtered duplicates:', eventsData.length - uniqueNew.length);
                    return [...events, ...uniqueNew];
                })();
                
                setEvents(newEvents);
                setHasMore(res.data.hasMore || false);
                setContinuationToken(res.data.continuationToken || null);
            } else {
                logger.error('[API Audit] API returned error:', res.message);
                toast.show(res.message || 'Failed to load API audit events', 'error');
                if (reset) setEvents([]);
            }
        } catch (error) {
            logger.error('[API Audit] Error loading events:', error);
            toast.show('Failed to load API audit events', 'error');
            if (reset) setEvents([]);
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

        // Filter by orgId
        if (filters.orgId !== 'all') {
            filtered = filtered.filter(e => {
                const endpoint = parseEndpointPath(e.targetId);
                return endpoint.orgId === filters.orgId;
            });
        }

        // Filter by deviceId
        if (filters.deviceId !== 'all') {
            filtered = filtered.filter(e => {
                const endpoint = parseEndpointPath(e.targetId);
                return endpoint.deviceId === filters.deviceId;
            });
        }

        // Filter by endpoint
        if (filters.endpoint !== 'all') {
            filtered = filtered.filter(e => {
                const endpoint = parseEndpointPath(e.targetId);
                return endpoint.endpoint === filters.endpoint;
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

        // Apply sorting
        if (sortConfig.column && sortConfig.direction) {
            filtered.sort((a, b) => {
                let aVal, bVal;

                switch (sortConfig.column) {
                    case 'timestamp':
                        aVal = new Date(a.timestamp).getTime();
                        bVal = new Date(b.timestamp).getTime();
                        break;
                    case 'method':
                        aVal = a.subType || '';
                        bVal = b.subType || '';
                        break;
                    case 'status':
                        aVal = parseInt(parseMetadata(a.metadata).StatusCode || 0);
                        bVal = parseInt(parseMetadata(b.metadata).StatusCode || 0);
                        break;
                    case 'duration':
                        aVal = parseInt(parseMetadata(a.metadata).DurationMs || 0);
                        bVal = parseInt(parseMetadata(b.metadata).DurationMs || 0);
                        break;
                    case 'user':
                        aVal = a.performedBy || '';
                        bVal = b.performedBy || '';
                        break;
                    case 'org':
                        aVal = parseEndpointPath(a.targetId).orgId || '';
                        bVal = parseEndpointPath(b.targetId).orgId || '';
                        break;
                    case 'device':
                        aVal = parseEndpointPath(a.targetId).deviceId || '';
                        bVal = parseEndpointPath(b.targetId).deviceId || '';
                        break;
                    case 'endpoint':
                        aVal = parseEndpointPath(a.targetId).endpoint || '';
                        bVal = parseEndpointPath(b.targetId).endpoint || '';
                        break;
                    default:
                        aVal = a.timestamp;
                        bVal = b.timestamp;
                }

                // Handle string comparison
                if (typeof aVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                }

                // Handle numeric comparison
                if (sortConfig.direction === 'asc') {
                    return aVal - bVal;
                } else {
                    return bVal - aVal;
                }
            });
        }

        setFilteredEvents(filtered);
    }

    function parseEndpointPath(targetId) {
        // Parse paths like:
        // /api/v1/admin/audit
        // /api/v1/orgs/ORGB-DEMO-MAGE-NSEC/devices
        // /api/v1/orgs/ORGB-DEMO-MAGE-NSEC/devices/439a5b21-8bc8-46af-9c9f-3c3a5e784a9e/apps
        
        const path = targetId || '';
        const orgMatch = path.match(/\/orgs\/([^\s/]+)/);
        const deviceMatch = path.match(/\/devices\/([^\s/]+)/);
        
        // Extract endpoint name (last part after final /)
        const pathParts = path.split('/').filter(p => p && p !== 'api' && p !== 'v1' && !p.match(/^[a-f0-9-]{36}$/));
        let endpoint = pathParts[pathParts.length - 1] || 'ROOT';
        
        // Capitalize endpoint
        endpoint = endpoint.toUpperCase();
        
        return {
            orgId: orgMatch ? orgMatch[1] : 'N/A',
            deviceId: deviceMatch ? deviceMatch[1] : 'N/A',
            endpoint: endpoint,
            fullPath: targetId
        };
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

    function renderResponseChart() {
        const responseChartRef = document.getElementById('responseChartRef');
        if (!window.ApexCharts || !responseChartRef) {
            return;
        }

        // Destroy existing chart if any
        if (responseChartInstance) {
            responseChartInstance.destroy();
            responseChartInstance = null;
        }

        // Sort events by timestamp
        const sortedEvents = [...filteredEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Take last 100 events for chart
        const chartEvents = sortedEvents.slice(-100);

        const durations = [];
        const statusCodesByTime = [];

        chartEvents.forEach(event => {
            const metadata = parseMetadata(event.metadata);
            const statusCode = parseInt(metadata.StatusCode || '0');
            const durationMs = parseInt(metadata.DurationMs || 0);
            const timeLabel = new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            
            durations.push({
                x: timeLabel,
                y: durationMs
            });
            
            statusCodesByTime.push({
                x: timeLabel,
                y: statusCode
            });
        });

        // If no data, show message
        if (durations.length === 0) {
            responseChartRef.innerHTML = '<div class="text-muted text-center py-5">No response duration data available</div>';
            return;
        }

        const options = {
            chart: {
                type: 'line',
                height: 350,
                toolbar: { show: false },
                zoom: { enabled: false }
            },
            series: [
                {
                    name: 'Response Duration (ms)',
                    type: 'column',
                    data: durations,
                    color: '#0c63e4'
                },
                {
                    name: 'Status Code',
                    type: 'line',
                    data: statusCodesByTime,
                    color: '#2fb344'
                }
            ],
            plotOptions: {
                bar: {
                    columnWidth: '50%',
                    borderRadius: 4
                }
            },
            fill: {
                opacity: [0.85, 1]
            },
            xaxis: {
                type: 'category',
                labels: { 
                    rotate: -45, 
                    rotateAlways: true 
                },
                tooltip: { enabled: false }
            },
            yaxis: [
                {
                    title: { text: 'Duration (ms)' },
                    min: 0,
                    seriesName: 'Response Duration (ms)',
                    labels: {
                        formatter: (val) => Math.round(val)
                    }
                },
                {
                    opposite: true,
                    title: { text: 'Status Code' },
                    min: 0,
                    max: 600,
                    seriesName: 'Status Code',
                    labels: {
                        formatter: (val) => Math.round(val)
                    }
                }
            ],
            dataLabels: {
                enabled: false
            },
            tooltip: {
                shared: true,
                intersect: false,
                y: [
                    {
                        formatter: (val) => `${Math.round(val)}ms`
                    },
                    {
                        formatter: (val) => `Status: ${Math.round(val)}`
                    }
                ]
            },
            legend: {
                position: 'top',
                horizontalAlign: 'left'
            },
            stroke: {
                curve: 'smooth',
                width: [0, 3],
                dashArray: [0, 0]
            },
            markers: {
                size: 5,
                strokeWidth: 2,
                hover: {
                    size: 7
                }
            },
            grid: {
                padding: { bottom: 20 }
            }
        };

        responseChartInstance = new window.ApexCharts(responseChartRef, options);
        responseChartInstance.render();
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

    function toggleSort(column) {
        if (sortConfig.column === column) {
            // Toggle direction if same column
            setSortConfig({
                column: column,
                direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'
            });
        } else {
            // New column, default to ascending
            setSortConfig({
                column: column,
                direction: 'asc'
            });
        }
    }

    // Get unique values for filters
    const httpMethods = [...new Set(events.map(e => e.subType).filter(Boolean))].sort();
    const users = [...new Set(events.map(e => e.performedBy).filter(Boolean))].sort();
    const orgIds = [...new Set(events.map(e => parseEndpointPath(e.targetId).orgId).filter(o => o !== 'N/A'))].sort();
    const deviceIds = [...new Set(events.map(e => parseEndpointPath(e.targetId).deviceId).filter(d => d !== 'N/A'))].sort();
    const endpoints = [...new Set(events.map(e => parseEndpointPath(e.targetId).endpoint).filter(Boolean))].sort();
    
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
                        <div class="d-flex gap-2">
                            <select 
                                class="form-select" 
                                value=${rangeDays}
                                onChange=${(e) => setRangeDays(Number(e.target.value))}
                                style="min-width: 150px;"
                            >
                                <option value="1">Last 24 hours</option>
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                            <button 
                                class="btn btn-primary" 
                                onClick=${() => loadApiEvents(true)}
                                disabled=${loading}
                            >
                                <i class="ti ti-refresh me-1"></i>
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts (Side by Side) -->
            <div class="card mb-3">
                <div class="row g-0">
                    <div class="col-lg-6 border-end">
                        <div class="card-body">
                            <h3 class="card-title">API Calls Over Time</h3>
                            <div ref=${chartRef}></div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card-body">
                            <h3 class="card-title">Response Duration & Status Codes</h3>
                            <div id="responseChartRef"></div>
                        </div>
                    </div>
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
                        <div class="col-md-2">
                            <label class="form-label">Organization</label>
                            <select 
                                class="form-select" 
                                value=${filters.orgId}
                                onChange=${(e) => setFilters({ ...filters, orgId: e.target.value })}
                            >
                                <option value="all">All Organizations</option>
                                ${orgIds.map(orgId => html`
                                    <option value=${orgId}>${orgId}</option>
                                `)}
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Device</label>
                            <select 
                                class="form-select" 
                                value=${filters.deviceId}
                                onChange=${(e) => setFilters({ ...filters, deviceId: e.target.value })}
                            >
                                <option value="all">All Devices</option>
                                ${deviceIds.map(deviceId => html`
                                    <option value=${deviceId}>${deviceId.substring(0, 8)}...</option>
                                `)}
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Endpoint</label>
                            <select 
                                class="form-select" 
                                value=${filters.endpoint}
                                onChange=${(e) => setFilters({ ...filters, endpoint: e.target.value })}
                            >
                                <option value="all">All Endpoints</option>
                                ${endpoints.map(endpoint => html`
                                    <option value=${endpoint}>${endpoint}</option>
                                `)}
                            </select>
                        </div>
                        <div class="col-md-2">
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
                        <div class="col-md-2">
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
                    </div>
                    <div class="row g-2">
                        <div class="col-md-12">
                            <label class="form-label">Search</label>
                            <input 
                                type="text" 
                                class="form-control" 
                                placeholder="Search by path, description, or user..."
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
                                <th style="cursor: pointer;" onClick=${() => toggleSort('timestamp')}>
                                    Time 
                                    ${sortConfig.column === 'timestamp' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('method')}>
                                    Method
                                    ${sortConfig.column === 'method' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('org')}>
                                    Org
                                    ${sortConfig.column === 'org' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('device')}>
                                    Device
                                    ${sortConfig.column === 'device' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('endpoint')}>
                                    Endpoint
                                    ${sortConfig.column === 'endpoint' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('user')}>
                                    User
                                    ${sortConfig.column === 'user' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('status')}>
                                    Status
                                    ${sortConfig.column === 'status' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
                                <th style="cursor: pointer;" onClick=${() => toggleSort('duration')}>
                                    Duration
                                    ${sortConfig.column === 'duration' ? html`<i class="ti ti-${sortConfig.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                </th>
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
                                const endpoint = parseEndpointPath(event.targetId);

                                return html`
                                    <tr key=${event.eventId}>
                                        <td class="text-muted">${formatTimestamp(event.timestamp)}</td>
                                        <td>${getHttpMethodBadge(event.subType)}</td>
                                        <td class="small"><code>${endpoint.orgId}</code></td>
                                        <td class="small">${endpoint.deviceId === 'N/A' ? '-' : html`<code>${endpoint.deviceId.substring(0, 8)}...</code>`}</td>
                                        <td class="small"><strong>${endpoint.endpoint}</strong></td>
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
                                            <td colspan="9" class="bg-light">
                                                <div class="p-3">
                                                    <div class="row">
                                                        <div class="col-md-6">
                                                            <h4 class="text-muted mb-2">Endpoint Details</h4>
                                                            <table class="table table-sm">
                                                                <tr>
                                                                    <td><strong>Full Path:</strong></td>
                                                                    <td><code class="small">${endpoint.fullPath}</code></td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Organization:</strong></td>
                                                                    <td><code class="small">${endpoint.orgId}</code></td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Device ID:</strong></td>
                                                                    <td>${endpoint.deviceId === 'N/A' ? 'N/A' : html`<code class="small">${endpoint.deviceId}</code>`}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Endpoint:</strong></td>
                                                                    <td><code class="small">${endpoint.endpoint}</code></td>
                                                                </tr>
                                                            </table>
                                                        </div>
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
                                                    </div>
                                                    <div class="row mt-3">
                                                        <div class="col-md-6">
                                                            <h4 class="text-muted mb-2">Response Details</h4>
                                                            <table class="table table-sm">
                                                                <tr>
                                                                    <td><strong>Timestamp:</strong></td>
                                                                    <td class="small">${new Date(event.timestamp).toLocaleString()}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Status:</strong></td>
                                                                    <td>${getStatusBadge(statusCode)}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Duration:</strong></td>
                                                                    <td class="small">${formatDuration(durationMs)}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Request Size:</strong></td>
                                                                    <td class="small">${(() => {
                                                                        const bytes = parseInt(metadata.RequestSize || 0);
                                                                        if (bytes === 0) return '0 B';
                                                                        if (bytes < 1024) return bytes + ' B';
                                                                        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
                                                                        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                                                                    })()}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td><strong>Response Size:</strong></td>
                                                                    <td class="small">${(() => {
                                                                        const bytes = parseInt(metadata.ResponseSize || 0);
                                                                        if (bytes === 0) return '0 B';
                                                                        if (bytes < 1024) return bytes + ' B';
                                                                        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
                                                                        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                                                                    })()}</td>
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
                                                        <div class="col-md-6">
                                                            <h4 class="text-muted mb-2">Full Metadata</h4>
                                                            <pre class="json-metadata p-2 rounded" style="max-height: 300px; overflow-y: auto; font-size: 11px;">${JSON.stringify(metadata, null, 2)}</pre>
                                                        </div>
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
                            onClick=${(e) => { e.preventDefault(); e.stopPropagation(); if (!loading) loadApiEvents(false); }}
                            disabled=${loading}
                        >
                            ${loading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-arrow-down me-1"></i>`}
                            Load More
                        </button>
                    </div>
                ` : null}
            </div>

            <!-- Go to Top Button -->
            <button 
                class="btn btn-primary btn-icon position-fixed bottom-0 end-0 m-3" 
                style="z-index: 1000; box-shadow: 0 4px 8px rgba(0,0,0,0.2);"
                onClick=${() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                title="Go to Top"
            >
                <i class="ti ti-arrow-up"></i>
            </button>
        </div>
    `;
}
