/**
 * Device Activity Page - View device heartbeats
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import toast from '@toast';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

export function DeviceActivityPage() {
    logger.debug('[Device Activity] Component rendering...');
    
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [filters, setFilters] = useState({
        deviceId: 'all',
        statusFilter: 'all', // all, success, error
        responseTimeMin: 'all', // all, 500, 1000, 2000, 2500, 5000
        search: ''
    });
    const scrollObserverRef = useRef(null);
    const chartRef = useRef(null);
    const [topSlowCollapsed, setTopSlowCollapsed] = useState(true);
    const [topSlowSort, setTopSlowSort] = useState({ column: 'p95', direction: 'desc' });

    // Extract deviceId from endpoint path
    function extractDeviceId(targetId) {
        // Path format: /api/v1/devices/{deviceId}/heartbeat
        const match = targetId?.match(/\/devices\/([a-f0-9-]+)\//);
        return match ? match[1] : 'N/A';
    }

    function scrollToTop(evt) {
        const source = evt?.currentTarget || null;
        const candidates = [
            source?.closest('.page-body'),
            source?.closest('.page-wrapper'),
            document.querySelector('.page-body'),
            document.querySelector('.page-wrapper'),
            document.scrollingElement,
            document.documentElement,
            document.body
        ].filter(Boolean);

        const seen = new Set();
        candidates.forEach((node) => {
            if (!node || seen.has(node)) return;
            seen.add(node);
            if (typeof node.scrollTo === 'function') {
                node.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                node.scrollTop = 0;
            }
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    }, [currentOrgId, rangeDays, filters.responseTimeMin]);

    // Filter events when filters change
    useEffect(() => {
        applyFilters();
    }, [events, filters]);

    // Render device timeline chart when filteredEvents or device filter changes (Chart.js)
    useEffect(() => {
        logger.debug('[Device Activity] Chart useEffect triggered, filteredEvents.length:', filteredEvents.length, 'timestamp:', Date.now());

        // Destroy existing chart tracked by this component
        if (chartRef.current) {
            try {
                chartRef.current.destroy();
                chartRef.current = null;
                logger.debug('[Device Activity] Previous chart (component ref) destroyed');
            } catch (err) {
                logger.error('[Device Activity] Error destroying previous chart ref:', err);
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

            // Defensive cleanup for any orphaned chart attached to this canvas
            try {
                const existingCanvasChart = window.Chart.getChart(canvas);
                if (existingCanvasChart) {
                    existingCanvasChart.destroy();
                    logger.debug('[Device Activity] Orphaned canvas chart destroyed before render');
                }
            } catch (err) {
                logger.error('[Device Activity] Error destroying orphaned canvas chart:', err);
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
                chartRef.current = new Chart(canvas, {
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
            if (chartRef.current) {
                try {
                    chartRef.current.destroy();
                    chartRef.current = null;
                } catch (err) {
                    logger.error('[Device Activity] Error in cleanup:', err);
                }
            }
        }
    }, [filteredEvents, filters.deviceId, filteredEvents.length]);

    const getEventMetadata = (evt) => {
        if (!evt?.metadata) return {};
        if (typeof evt.metadata === 'string') {
            try {
                return JSON.parse(evt.metadata);
            } catch {
                return {};
            }
        }
        return typeof evt.metadata === 'object' ? evt.metadata : {};
    };

    const getEventDuration = (evt) => {
        const metadata = getEventMetadata(evt);
        const duration = parseInt(metadata.DurationMs || metadata.durationMs || metadata.elapsedMs || '0', 10);
        return Number.isNaN(duration) ? 0 : duration;
    };

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

            if (filters.responseTimeMin !== 'all') {
                query.set('minDurationMs', filters.responseTimeMin);
            }

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

            if (filters.responseTimeMin !== 'all') {
                query.set('minDurationMs', filters.responseTimeMin);
            }

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
                const metadata = getEventMetadata(e);
                const statusCode = parseInt(metadata.StatusCode || '0');
                const isSuccess = statusCode >= 200 && statusCode < 300;
                return filters.statusFilter === 'success' ? isSuccess : !isSuccess;
            });
        }

        // Response time filter
        if (filters.responseTimeMin !== 'all') {
            const minDuration = parseInt(filters.responseTimeMin, 10);
            if (!Number.isNaN(minDuration)) {
                filtered = filtered.filter(e => {
                    const duration = getEventDuration(e);
                    return !Number.isNaN(duration) && duration >= minDuration;
                });
            }
        }

        // Search filter (searches description, deviceId, targetId)
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(e =>
                e.description?.toLowerCase().includes(searchLower) ||
                e.targetId?.toLowerCase().includes(searchLower) ||
                getEventMetadata(e)?.DeviceId?.toLowerCase().includes(searchLower)
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
        const duration = parseInt(metadata.DurationMs || metadata.elapsedMs || '0');
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
                <div class=${`card-body p-3 activity-row ${isExpanded ? 'activity-row-expanded' : ''}`}
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
                    <div class="card-footer activity-details-footer">
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
    const fleetResponseDurations = events.map(getEventDuration).filter(d => d > 0).sort((a, b) => a - b);
    const fleetP50Duration = fleetResponseDurations.length > 0
        ? fleetResponseDurations[Math.floor((fleetResponseDurations.length - 1) * 0.50)]
        : 0;
    const fleetP95Duration = fleetResponseDurations.length > 0
        ? fleetResponseDurations[Math.floor((fleetResponseDurations.length - 1) * 0.95)]
        : 0;

    // Compute per-device statistics for Top Slow Devices table
    const deviceStatsMap = {};
    filteredEvents.forEach(evt => {
        const deviceId = extractDeviceId(evt.targetId);
        if (!deviceId || deviceId === 'Unknown') return;
        const duration = getEventDuration(evt);
        const metadata = getEventMetadata(evt);
        const statusCode = parseInt(metadata.StatusCode || '200');
        const isError = statusCode >= 400;
        if (!deviceStatsMap[deviceId]) {
            deviceStatsMap[deviceId] = { deviceId, count: 0, totalDuration: 0, durations: [], errorCount: 0 };
        }
        const ds = deviceStatsMap[deviceId];
        ds.count++;
        ds.totalDuration += duration;
        if (duration > 0) ds.durations.push(duration);
        if (isError) ds.errorCount++;
    });
    const topSlowDevices = Object.values(deviceStatsMap).map(d => {
        const sorted = [...d.durations].sort((a, b) => a - b);
        const p50 = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) * 0.50)] : 0;
        const p95 = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) * 0.95)] : 0;
        const avg = d.count > 0 ? Math.round(d.totalDuration / d.count) : 0;
        return { ...d, avg, p50, p95 };
    }).sort((a, b) => b.p95 - a.p95).slice(0, 10);

    const sortedTopSlowDevices = [...topSlowDevices].sort((a, b) => {
        const av = a[topSlowSort.column] ?? 0;
        const bv = b[topSlowSort.column] ?? 0;
        return topSlowSort.direction === 'asc' ? av - bv : bv - av;
    });
    const profileMax = sortedTopSlowDevices.length > 0
        ? Math.max(...sortedTopSlowDevices.map(d => Math.max(d.p50, d.avg, d.p95)), 1)
        : 1;

    function sortTopSlowBy(column) {
        setTopSlowSort((prev) => {
            if (prev.column === column) {
                return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { column, direction: 'desc' };
        });
    }

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
                        <div class="col-md-2">
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
                        <div class="col-md-2">
                            <label class="form-label">Response Time</label>
                            <select class="form-select" value=${filters.responseTimeMin} onChange=${(e) => setFilters({...filters, responseTimeMin: e.target.value})}>
                                <option value="all">All</option>
                                <option value="500">≥ 500ms</option>
                                <option value="1000">≥ 1000ms</option>
                                <option value="2000">≥ 2000ms</option>
                                <option value="2500">≥ 2500ms</option>
                                <option value="5000">≥ 5000ms</option>
                            </select>
                        </div>
                        <div class="col-md-2">
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
                                    <div class="subheader">Response Time</div>
                                </div>
                                <div class="h1 mb-0">
                                    ${filteredEvents.length > 0 ? Math.round(filteredEvents.reduce((sum, e) => {
                                        return sum + getEventDuration(e);
                                    }, 0) / filteredEvents.length) : 0}ms
                                </div>
                                <div class="text-muted mt-2">
                                    <span class="badge bg-primary text-white me-1">Fleet p50 ${fleetP50Duration}ms</span>
                                    <i
                                        class="ti ti-info-circle text-muted"
                                        title="Average shown above is calculated from the currently filtered events."
                                        data-bs-toggle="tooltip"
                                        data-bs-placement="top"
                                        aria-label="Average is based on current filters"
                                    ></i>
                                </div>
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
                
                <!-- Top Slow Devices Table (only meaningful when viewing all devices) -->
                ${filters.deviceId === 'all' && topSlowDevices.length > 1 ? html`
                    <div class="card mb-3">
                        <div class="card-header" style="cursor:pointer;" onClick=${() => setTopSlowCollapsed(!topSlowCollapsed)}>
                            <h3 class="card-title">
                                <i class="ti ti-trending-up me-2 text-danger"></i>
                                Top Slow Devices
                            </h3>
                            <div class="card-options">
                                <span class="badge bg-orange text-white me-1">Fleet p95 ${fleetP95Duration}ms</span>
                                <span class="badge bg-danger text-white me-2">Worst p95 ${sortedTopSlowDevices[0].p95}ms</span>
                                <span class="text-muted small me-2">Top ${sortedTopSlowDevices.length} · Click to ${topSlowCollapsed ? 'expand' : 'collapse'}</span>
                                <i class="ti ti-chevron-${topSlowCollapsed ? 'down' : 'up'}"></i>
                            </div>
                        </div>
                        ${!topSlowCollapsed ? html`
                            <div class="table-responsive">
                                <table class="table table-vcenter card-table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Device ID</th>
                                            <th class="text-center" style="cursor:pointer;" onClick=${() => sortTopSlowBy('count')}>
                                                Events
                                                ${topSlowSort.column === 'count' ? html`<i class="ti ti-${topSlowSort.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                            </th>
                                            <th class="text-center" style="cursor:pointer;" onClick=${() => sortTopSlowBy('avg')}>
                                                Avg
                                                ${topSlowSort.column === 'avg' ? html`<i class="ti ti-${topSlowSort.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                            </th>
                                            <th class="text-center" style="cursor:pointer;" onClick=${() => sortTopSlowBy('p50')}>
                                                p50
                                                ${topSlowSort.column === 'p50' ? html`<i class="ti ti-${topSlowSort.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                            </th>
                                            <th class="text-center" style="cursor:pointer;" onClick=${() => sortTopSlowBy('p95')}>
                                                p95
                                                ${topSlowSort.column === 'p95' ? html`<i class="ti ti-${topSlowSort.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                            </th>
                                            <th style="min-width:140px;">Profile</th>
                                            <th class="text-center" style="cursor:pointer;" onClick=${() => sortTopSlowBy('errorCount')}>
                                                Errors
                                                ${topSlowSort.column === 'errorCount' ? html`<i class="ti ti-${topSlowSort.direction === 'asc' ? 'sort-ascending' : 'sort-descending'} ms-1"></i>` : ''}
                                            </th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sortedTopSlowDevices.map((d, idx) => {
                                            const p95Color = d.p95 >= 5000 ? 'danger' : d.p95 >= 2000 ? 'warning' : d.p95 >= 1000 ? 'info' : 'success';
                                            const avgColor = d.avg >= 5000 ? 'danger' : d.avg >= 2000 ? 'warning' : d.avg >= 1000 ? 'info' : 'success';
                                            const errorRate = d.count > 0 ? Math.round((d.errorCount / d.count) * 100) : 0;
                                            const p50Pos = Math.min(100, Math.round((d.p50 / profileMax) * 100));
                                            const avgPos = Math.min(100, Math.round((d.avg / profileMax) * 100));
                                            const p95Pos = Math.min(100, Math.round((d.p95 / profileMax) * 100));
                                            return html`
                                                <tr key=${d.deviceId}>
                                                    <td>
                                                        <div class="d-flex align-items-center">
                                                            <span class="avatar avatar-xs me-2 bg-secondary-lt text-muted">${idx + 1}</span>
                                                            <div><code class="small">${d.deviceId}</code></div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-secondary text-secondary-fg">${d.count}</span>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-${avgColor} text-white">${d.avg}ms</span>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="text-muted small">${d.p50}ms</span>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-${p95Color} text-white fw-bold">${d.p95}ms</span>
                                                    </td>
                                                    <td>
                                                        <div style="position:relative;height:8px;background:var(--tblr-border-color-translucent, #e9ecef);border-radius:999px;">
                                                            <span title="p50 ${d.p50}ms" style="position:absolute;left:calc(${p50Pos}% - 4px);top:0;width:8px;height:8px;border-radius:50%;background:#0d6efd;"></span>
                                                            <span title="avg ${d.avg}ms" style="position:absolute;left:calc(${avgPos}% - 4px);top:0;width:8px;height:8px;border-radius:50%;background:#6c757d;"></span>
                                                            <span title="p95 ${d.p95}ms" style="position:absolute;left:calc(${p95Pos}% - 4px);top:0;width:8px;height:8px;border-radius:50%;background:#f76707;"></span>
                                                        </div>
                                                        <div class="d-flex justify-content-between mt-1" style="font-size:9px;">
                                                            <span class="text-primary">p50</span>
                                                            <span class="text-muted">avg</span>
                                                            <span class="text-warning">p95</span>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        ${d.errorCount > 0 ? html`
                                                            <span class="badge bg-danger text-white">${d.errorCount} (${errorRate}%)</span>
                                                        ` : html`
                                                            <span class="text-muted small">—</span>
                                                        `}
                                                    </td>
                                                    <td class="text-end">
                                                        <button class="btn btn-sm btn-ghost-secondary"
                                                                title="Filter to this device"
                                                                onClick=${() => setFilters({...filters, deviceId: d.deviceId})}>
                                                            <i class="ti ti-filter"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            `;
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ` : null}
                    </div>
                ` : null}

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
                onClick=${scrollToTop}
                title="Go to Top"
            >
                <i class="ti ti-arrow-up"></i>
            </button>
        </div>
    `;
}
