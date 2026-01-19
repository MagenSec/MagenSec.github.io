/**
 * Device Activity Page - View device heartbeats
 */

import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import toast from '../toast.js';
import { logger } from '../config.js';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

// ApexCharts instance for device timeline
let deviceTimelineChart = null;

export function DeviceActivityPage() {
    logger.debug('[Device Activity] Component rendering...');
    
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [filters, setFilters] = useState({
        deviceId: 'all',
        statusFilter: 'all', // all, success, error
        search: ''
    });

    // Extract deviceId from endpoint path
    function extractDeviceId(targetId) {
        // Path format: /api/v1/devices/{deviceId}/heartbeat
        const match = targetId?.match(/\/devices\/([a-f0-9-]+)\//);
        return match ? match[1] : 'N/A';
    }
    const [rangeDays, setRangeDays] = useState(7);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [expandedEvent, setExpandedEvent] = useState(null);
    const eventsPerPage = 100;
    const currentOrgId = orgContext.getCurrentOrg()?.orgId;

    // Load device activity (heartbeat) data
    useEffect(() => {
        loadHeartbeatEvents();

        const handler = () => {
            setPage(1);
            loadHeartbeatEvents();
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

    // Render device timeline chart when device is selected
    useEffect(() => {
        if (filters.deviceId !== 'all' && filteredEvents.length > 0 && window.ApexCharts) {
            renderDeviceTimelineChart();
        } else if (deviceTimelineChart) {
            // Destroy chart when no device selected
            deviceTimelineChart.destroy();
            deviceTimelineChart = null;
            const chartContainer = document.getElementById('deviceTimelineChart');
            if (chartContainer) {
                chartContainer.innerHTML = '<div class="text-muted text-center py-4">Select a device to view timeline</div>';
            }
        }
    }, [filteredEvents, filters.deviceId]);

    async function loadHeartbeatEvents() {
        logger.debug('[Device Activity] loadHeartbeatEvents called');
        setLoading(true);

        try {
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg) {
                logger.warn('[Device Activity] No org selected');
                setLoading(false);
                return;
            }

            const query = new URLSearchParams({
                deviceActivity: 'true', // CRITICAL: Fetch heartbeat data only
                pageSize: eventsPerPage.toString(),
                days: rangeDays.toString()
            });

            const res = await api.get(`/api/v1/admin/audit?${query.toString()}`);
            logger.debug('[Device Activity] API response:', res);

            if (res.success && res.data) {
                const eventsData = res.data.events || [];
                logger.debug('[Device Activity] Heartbeat events loaded:', eventsData.length);
                setEvents(eventsData);
                setHasMore(res.data.hasMore || false);
            } else {
                logger.error('[Device Activity] API returned error:', res.message);
                toast.show(res.message || 'Failed to load device activity', 'error');
                setEvents([]);
            }
        } catch (error) {
            logger.error('[Device Activity] Error loading heartbeat events:', error);
            toast.show(error.message || 'Error loading device activity', 'error');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }

    function applyFilters() {
        let filtered = [...events];

        // Device ID filter
        if (filters.deviceId !== 'all') {
            filtered = filtered.filter(e => {
                const deviceId = extractDeviceId(e.targetId);
                return deviceId.toLowerCase().includes(filters.deviceId.toLowerCase());
            });
        }

        // Status filter (based on metadata success or statusCode)
        if (filters.statusFilter !== 'all') {
            filtered = filtered.filter(e => {
                const metadata = e.metadata || {};
                const statusCode = parseInt(metadata.StatusCode || '0');
                const isSuccess = statusCode >= 200 && statusCode < 300;
                return filters.statusFilter === 'success' ? isSuccess : !isSuccess;
            });
        }

        // Search filter (searches description, deviceId, targetId)
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(e =>
                e.description?.toLowerCase().includes(searchLower) ||
                e.targetId?.toLowerCase().includes(searchLower) ||
                e.metadata?.DeviceId?.toLowerCase().includes(searchLower)
            );
        }

        setFilteredEvents(filtered);
        setPage(1);
    }

    function renderDeviceTimelineChart() {
        const chartContainer = document.getElementById('deviceTimelineChart');
        if (!chartContainer || !window.ApexCharts) return;

        // Destroy existing chart
        if (deviceTimelineChart) {
            deviceTimelineChart.destroy();
            deviceTimelineChart = null;
        }

        // Sort events by timestamp
        const sortedEvents = [...filteredEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Extract data points
        const dataPoints = sortedEvents.map(evt => {
            let metadata = {};
            if (evt.metadata) {
                if (typeof evt.metadata === 'string') {
                    try {
                        metadata = JSON.parse(evt.metadata);
                    } catch { }
                } else if (typeof evt.metadata === 'object') {
                    metadata = evt.metadata;
                }
            }

            const duration = parseInt(metadata.DurationMs || '0');
            const timestamp = new Date(evt.timestamp);
            const timeLabel = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return { x: timeLabel, y: duration };
        });

        if (dataPoints.length === 0) {
            chartContainer.innerHTML = '<div class="text-muted text-center py-4">No timeline data available</div>';
            return;
        }

        const options = {
            chart: {
                type: 'bar',
                height: 300,
                toolbar: { show: true },
                zoom: { enabled: true },
                events: {
                    dataPointSelection: function(event, chartContext, config) {
                        const dataPointIndex = config.dataPointIndex;
                        const selectedEvent = sortedEvents[dataPointIndex];
                        if (selectedEvent && selectedEvent.eventId) {
                            // Find and scroll to the event card
                            const eventCard = document.querySelector(`[data-event-id="${selectedEvent.eventId}"]`);
                            if (eventCard) {
                                eventCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // Highlight the card briefly
                                eventCard.style.backgroundColor = '#fff3cd';
                                setTimeout(() => {
                                    eventCard.style.backgroundColor = '';
                                }, 2000);
                            }
                        }
                    }
                }
            },
            series: [{
                name: 'Response Time',
                data: dataPoints
            }],
            plotOptions: {
                bar: {
                    columnWidth: '60%',
                    borderRadius: 4,
                    colors: {
                        ranges: [{
                            from: 0,
                            to: 99999,
                            color: '#0c63e4'
                        }]
                    }
                }
            },
            title: {
                text: 'Heartbeat Timeline',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            xaxis: {
                type: 'category',
                labels: {
                    rotate: -45,
                    rotateAlways: true
                },
                title: {
                    text: 'Time'
                }
            },
            yaxis: {
                title: {
                    text: 'Duration (ms)'
                },
                min: 0,
                labels: {
                    formatter: (val) => Math.round(val) + 'ms'
                }
            },
            dataLabels: {
                enabled: false
            },
            tooltip: {
                y: {
                    formatter: (val) => Math.round(val) + 'ms'
                }
            },
            colors: ['#0c63e4'],
            grid: {
                padding: {
                    bottom: 20
                }
            }
        };

        deviceTimelineChart = new window.ApexCharts(chartContainer, options);
        deviceTimelineChart.render();
    }

    function renderEventRow(evt) {
        // Parse metadata - handle string, object, or null
        let metadata = {};
        if (evt.metadata) {
            if (typeof evt.metadata === 'string') {
                try {
                    metadata = JSON.parse(evt.metadata);
                } catch (e) {
                    console.warn('Failed to parse metadata:', e);
                    metadata = {};
                }
            } else if (typeof evt.metadata === 'object') {
                metadata = evt.metadata;
            }
        }
        
        const statusCode = parseInt(metadata.StatusCode || '0');
        const isSuccess = statusCode >= 200 && statusCode < 300;
        const duration = parseInt(metadata.DurationMs || '0');
        const deviceId = extractDeviceId(evt.targetId);
        
        const timestamp = new Date(evt.timestamp);
        const timeStr = timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const isExpanded = expandedEvent === evt.eventId;
        
        // Debug: Log first event metadata
        if (evt === filteredEvents[0]) {
            console.log('[Device Activity] Sample metadata:', metadata);
            console.log('[Device Activity] Event data:', evt);
        }

        return html`
            <div class="card border-0 mb-2" data-event-id=${evt.eventId}>
                <div class="card-body p-3" style="cursor: pointer; background: ${isExpanded ? '#f5f5f5' : 'white'};" 
                     onClick=${() => setExpandedEvent(isExpanded ? null : evt.eventId)}>
                    <div class="row align-items-center g-3">
                        <div class="col-auto">
                            <div class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">
                                ${statusCode}
                            </div>
                        </div>
                        <div class="col">
                            <div class="font-weight-bold">Device: <code>${deviceId}</code></div>
                            <div class="text-muted small">${evt.description}</div>
                        </div>
                        <div class="col-auto text-end">
                            <div class="text-muted small">${dateStr} ${timeStr}</div>
                            <div class="text-muted small">${duration}ms</div>
                        </div>
                    </div>
                </div>
                ${isExpanded ? html`
                    <div class="card-footer bg-light">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <h6 class="mb-2">Request Details</h6>
                                <div class="small">
                                    <div><strong>Device:</strong> <code>${deviceId}</code></div>
                                    <div><strong>IP:</strong> ${metadata.IpAddress || 'N/A'}</div>
                                    <div><strong>User Agent:</strong> ${metadata.UserAgent || 'N/A'}</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h6 class="mb-2">Response Details</h6>
                                <div class="small">
                                    <div><strong>Status:</strong> ${isSuccess ? 'Success' : 'Error'}</div>
                                    <div><strong>Duration:</strong> ${duration}ms</div>
                                    <div><strong>Request ID:</strong> ${metadata.RequestId || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                        ${metadata.ErrorCode ? html`
                            <div class="mt-3">
                                <h6 class="mb-2">Error</h6>
                                <div class="alert alert-sm alert-danger mb-0">
                                    <strong>${metadata.ErrorCode}:</strong> ${metadata.ErrorMessage || 'Unknown error'}
                                </div>
                            </div>
                        ` : null}
                    </div>
                ` : null}
            </div>
        `;
    }

    if (loading) {
        return html`
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <div class="mt-2">Loading device activity...</div>
            </div>
        `;
    }

    if (events.length === 0) {
        return html`
            <div class="empty">
                <div class="empty-icon"><i class="ti ti-inbox"></i></div>
                <p class="empty-title">No device activity</p>
                <p class="empty-description">No heartbeat events found for the selected period.</p>
            </div>
        `;
    }

    const pageSize = 50;
    const totalPages = Math.ceil(filteredEvents.length / pageSize);
    const startIdx = (page - 1) * pageSize;
    const paginatedEvents = filteredEvents.slice(startIdx, startIdx + pageSize);
    
    // Get unique device IDs
    const uniqueDeviceIds = [...new Set(events.map(e => extractDeviceId(e.targetId)).filter(id => id !== 'N/A'))].sort();

    return html`
        <div class="page-header d-print-none mb-3">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                            Device Activity
                        </h2>
                        <div class="page-subtitle">
                            <span class="text-muted">Monitor device heartbeats and connection status</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="container-xl">
            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">Time Range</label>
                            <select class="form-select" value=${rangeDays} onChange=${(e) => setRangeDays(Number(e.target.value))}>
                                <option value="1">Last 24 hours</option>
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Device ID</label>
                            <select class="form-select" value=${filters.deviceId} onChange=${(e) => setFilters({...filters, deviceId: e.target.value})}>
                                <option value="all">All Devices</option>
                                ${uniqueDeviceIds.map(id => html`<option value=${id}>${id.substring(0, 8)}...</option>`)}
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Status</label>
                            <select class="form-select" value=${filters.statusFilter} onChange=${(e) => setFilters({...filters, statusFilter: e.target.value})}>
                                <option value="all">All</option>
                                <option value="success">Success (2xx)</option>
                                <option value="error">Error (4xx, 5xx)</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Search</label>
                            <input type="text" class="form-control" placeholder="Search..." value=${filters.search} 
                                   onChange=${(e) => setFilters({...filters, search: e.target.value})} />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label" style="visibility: hidden;">.</label>
                            <button class="btn btn-primary w-100" onClick=${loadHeartbeatEvents}>
                                <i class="ti ti-refresh me-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Device Timeline Chart (shown when device selected) -->
            ${filters.deviceId !== 'all' ? html`
                <div class="card mb-3">
                    <div class="card-body">
                        <h3 class="card-title">Device Response Time Timeline</h3>
                        <div id="deviceTimelineChart"></div>
                    </div>
                </div>
            ` : null}

            <!-- Events -->
            <div>
                ${paginatedEvents.map(evt => renderEventRow(evt))}
            </div>

            <!-- Pagination -->
            ${totalPages > 1 ? html`
                <div class="card-footer text-center">
                    <nav>
                        <ul class="pagination justify-content-center">
                            <li class="page-item ${page === 1 ? 'disabled' : ''}">
                                <a class="page-link" href="#" onClick=${() => setPage(Math.max(1, page - 1))}>Previous</a>
                            </li>
                            ${[...Array(Math.min(5, totalPages))].map((_, i) => {
                                const pageNum = i + 1;
                                return html`
                                    <li class="page-item ${pageNum === page ? 'active' : ''}">
                                        <a class="page-link" href="#" onClick=${() => setPage(pageNum)}>${pageNum}</a>
                                    </li>
                                `;
                            })}
                            ${totalPages > 5 ? html`<li class="page-item disabled"><span class="page-link">...</span></li>` : null}
                            <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                                <a class="page-link" href="#" onClick=${() => setPage(Math.min(totalPages, page + 1))}>Next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            ` : null}
            
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
