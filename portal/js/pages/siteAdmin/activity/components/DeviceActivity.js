/**
 * Device Activity Page - View device heartbeats
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import toast from '@toast';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

// Chart.js instance for device timeline
let deviceTimelineChart = null;

export function DeviceActivityPage() {
    logger.debug('[Device Activity] Component rendering...');
    
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [filters, setFilters] = useState({
        deviceId: 'all',
        statusFilter: 'all', // all, success, error
        search: ''
    });
    const scrollObserverRef = useRef(null);

    // Extract deviceId from endpoint path
    function extractDeviceId(targetId) {
        // Path format: /api/v1/devices/{deviceId}/heartbeat
        const match = targetId?.match(/\/devices\/([a-f0-9-]+)\//);
        return match ? match[1] : 'N/A';
    }
    const [rangeDays, setRangeDays] = useState(7);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [continuationToken, setContinuationToken] = useState(null);
    const [expandedEvent, setExpandedEvent] = useState(null);
    const eventsPerPage = 100;
    const currentOrgId = orgContext.getCurrentOrg()?.orgId;

    // Infinite scroll observer (auto-load more data from API)
    useEffect(() => {
        const observerTarget = scrollObserverRef.current;
        if (!observerTarget) return;
        
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        observer.observe(observerTarget);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore]);

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

    // Render device timeline chart when filteredEvents or device filter changes (Chart.js)
    useEffect(() => {
        logger.debug('[Device Activity] Chart useEffect triggered, filteredEvents.length:', filteredEvents.length, 'timestamp:', Date.now());
        
        // Destroy existing chart first
        if (deviceTimelineChart) {
            try {
                deviceTimelineChart.destroy();
                deviceTimelineChart = null;
                logger.debug('[Device Activity] Previous chart destroyed');
            } catch (err) {
                logger.error('[Device Activity] Error destroying chart:', err);
            }
        }
        
        if (filteredEvents.length === 0 || !window.Chart) {
            logger.debug('[Device Activity] Skipping chart - no data or Chart.js not loaded');
            return;
        }

        // Wait for DOM to be ready
        const renderChart = () => {
            const canvas = document.getElementById('deviceTimelineChart');
            if (!canvas) {
                logger.error('[Device Activity] Canvas element not found!');
                return;
            }

            // Sort events by timestamp
            const sortedEvents = [...filteredEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            logger.debug('[Device Activity] Rendering chart with', sortedEvents.length, 'sorted events');

            // Extract data points
            const dataPoints = sortedEvents.map(evt => {
                let metadata = {};
                if (evt.metadata) {
                    if (typeof evt.metadata === 'string') {
                        try { metadata = JSON.parse(evt.metadata); } catch { }
                    } else if (typeof evt.metadata === 'object') {
                        metadata = evt.metadata;
                    }
                }

                const duration = parseInt(metadata.DurationMs || '0');
                const timestamp = new Date(evt.timestamp);
                const statusCode = parseInt(metadata.StatusCode || '200');
                const isSuccess = statusCode >= 200 && statusCode < 300;

                return {
                    x: timestamp,
                    y: duration,
                    deviceId: evt.deviceId || 'Unknown',
                    status: statusCode,
                    isSuccess
                };
            });

            logger.debug('[Device Activity] Data points prepared:', dataPoints.length);

            try {
                deviceTimelineChart = new Chart(canvas, {
                    type: 'scatter',
                    data: {
                        datasets: [{
                            label: 'Response Time (ms)',
                            data: dataPoints,
                            backgroundColor: dataPoints.map(d => d.isSuccess ? 'rgba(75, 192, 192, 0.5)' : 'rgba(255, 99, 132, 0.5)'),
                            borderColor: dataPoints.map(d => d.isSuccess ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)'),
                            borderWidth: 1,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                type: 'time',
                                time: { unit: 'hour', tooltipFormat: 'MMM dd, HH:mm' },
                                title: { display: true, text: 'Time' }
                            },
                            y: {
                                type: 'linear',
                                title: { display: true, text: 'Response Time (ms)' },
                                beginAtZero: true
                            }
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: ctx => {
                                        const point = ctx.raw;
                                        return [
                                            `Device: ${point.deviceId}`,
                                            `Response: ${point.y}ms`,
                                            `Status: ${point.status}`
                                        ];
                                    }
                                }
                            },
                            legend: { display: true }
                        }
                    }
                });
                logger.debug('[Device Activity] Chart created successfully!');
            } catch (err) {
                logger.error('[Device Activity] Error creating chart:', err);
            }
        };

        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            requestAnimationFrame(renderChart);
        });

        return () => {
            if (deviceTimelineChart) {
                try {
                    deviceTimelineChart.destroy();
                    deviceTimelineChart = null;
                } catch (err) {
                    logger.error('[Device Activity] Error in cleanup:', err);
                }
            }
        }
    }, [filteredEvents, filters.deviceId, filteredEvents.length]);

    async function loadMore() {
        if (!hasMore || loadingMore || !continuationToken) return;
        logger.debug('[Device Activity] Loading more events...');
        setLoadingMore(true);

        try {
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg) return;

            const query = new URLSearchParams({
                deviceActivity: 'true',
                pageSize: eventsPerPage.toString(),
                days: rangeDays.toString(),
                continuationToken: continuationToken
            });

            const res = await api.get(`/api/v1/admin/audit?${query.toString()}`);

            if (res.success && res.data) {
                const newEvents = res.data.events || [];
                logger.debug('[Device Activity] Loaded more events:', newEvents.length);
                setEvents(prev => [...prev, ...newEvents]);
                setContinuationToken(res.data.continuationToken || null);
                setHasMore(!!res.data.continuationToken);
            }
        } catch (error) {
            logger.error('[Device Activity] Error loading more:', error);
        } finally {
            setLoadingMore(false);
        }
    }

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
                setContinuationToken(res.data.continuationToken || null);
                setHasMore(!!res.data.continuationToken);
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

    function extractDeviceId(targetId) {
        if (!targetId) return 'Unknown';
        // Format: /orgs/{orgId}/devices/{deviceId}
        const parts = targetId.split('/');
        const deviceIndex = parts.indexOf('devices');
        return deviceIndex >= 0 && parts.length > deviceIndex + 1 
            ? parts[deviceIndex + 1] 
            : targetId;
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

            <!-- Summary Statistics -->
            ${filteredEvents.length > 0 ? html`
                <div class="row row-cards mb-3">
                    <div class="col-sm-6 col-lg-3">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-center">
                                    <div class="subheader">Total Events</div>
                                </div>
                                <div class="h1 mb-0">${filteredEvents.length}</div>
                                <div class="text-muted mt-2">In selected range</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-lg-3">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-center">
                                    <div class="subheader">Success Rate</div>
                                </div>
                                <div class="h1 mb-0 text-success">
                                    ${filteredEvents.length > 0 ? Math.round((filteredEvents.filter(e => {
                                        const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata || '{}') : e.metadata || {};
                                        const status = parseInt(meta.StatusCode || '200');
                                        return status >= 200 && status < 300;
                                    }).length / filteredEvents.length) * 100) : 0}%
                                </div>
                                <div class="text-muted mt-2">2xx responses</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-lg-3">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-center">
                                    <div class="subheader">Avg Response</div>
                                </div>
                                <div class="h1 mb-0">
                                    ${filteredEvents.length > 0 ? Math.round(filteredEvents.reduce((sum, e) => {
                                        const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata || '{}') : e.metadata || {};
                                        return sum + parseInt(meta.DurationMs || '0');
                                    }, 0) / filteredEvents.length) : 0}ms
                                </div>
                                <div class="text-muted mt-2">Response time</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-lg-3">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-center">
                                    <div class="subheader">Error Count</div>
                                </div>
                                <div class="h1 mb-0 text-danger">
                                    ${filteredEvents.filter(e => {
                                        const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata || '{}') : e.metadata || {};
                                        const status = parseInt(meta.StatusCode || '200');
                                        return status >= 400;
                                    }).length}
                                </div>
                                <div class="text-muted mt-2">4xx/5xx errors</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Timeline Chart -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h3 class="card-title">
                            Device Response Time Timeline
                            ${filters.deviceId !== 'all' ? html` - ${filters.deviceId}` : ''}
                        </h3>
                        <div style="height: 300px; position: relative;">
                            <canvas id="deviceTimelineChart"></canvas>
                        </div>
                    </div>
                </div>
            ` : null}

            <!-- Events -->
            <div>
                ${filteredEvents.map(evt => renderEventRow(evt))}
            </div>

            <!-- Infinite Scroll Sentinel -->
            ${hasMore && !loading && !loadingMore ? html`
                <div ref=${scrollObserverRef} style="height: 1px; margin: 20px 0;"></div>
            ` : null}
            ${loadingMore ? html`
                <div class="text-center py-3">
                    <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                    <span class="text-muted">Loading more events...</span>
                </div>
            ` : null}
            ${!hasMore && filteredEvents.length > 0 ? html`
                <div class="text-center py-3 text-muted">
                    <i class="ti ti-check"></i> No more events
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
