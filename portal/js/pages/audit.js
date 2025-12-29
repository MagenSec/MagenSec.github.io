/**
 * Audit Events Page - Timeline view of all audit events
 */

import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { auth } from '../auth.js';
import toast from '../toast.js';
import { logger } from '../config.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

// Chart instance at module level to persist across component renders
let auditChartInstance = null;

export function AuditPage() {
    logger.debug('[Audit] Component rendering...');
    
    const [loading, setLoading] = useState(true);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [creditJobEvents, setCreditJobEvents] = useState([]);
    const [filters, setFilters] = useState({
        eventType: 'all',
        search: '',
        dateFrom: '',
        dateTo: ''
    });
    const [rangeDays, setRangeDays] = useState(90);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const eventsPerPage = 50;
    const currentOrgId = orgContext.getCurrentOrg()?.orgId;

    useEffect(() => {
        loadEvents();

        const handler = () => {
            setPage(1);
            loadEvents();
        };
        const unsubscribe = orgContext.onChange(handler);
        window.addEventListener('orgChanged', handler);

        return () => {
            unsubscribe?.();
            window.removeEventListener('orgChanged', handler);
        };
    }, [currentOrgId, rangeDays]);

    useEffect(() => {
        applyFilters();
        extractCreditJobEvents();
    }, [events, filters.eventType, filters.search, filters.dateFrom, filters.dateTo]);

    const extractCreditJobEvents = () => {
        // Filter to SYSTEM org credit consumption events
        const jobEvents = events.filter(e => 
            e.orgId === 'SYSTEM' && 
            e.eventType && 
            e.eventType.startsWith('CreditConsumption')
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        setCreditJobEvents(jobEvents);
        
        // Render chart if we have events
        if (jobEvents.length > 0) {
            setTimeout(() => renderCreditJobChart(jobEvents), 100);
        }
    };

    const renderCreditJobChart = (jobEvents) => {
        // Check if Chart.js is loaded
        if (typeof window.Chart === 'undefined') {
            logger.warn('[Audit] Chart.js not loaded, skipping credit job chart');
            return;
        }
        
        const canvas = document.getElementById('creditJobChart');
        if (!canvas) {
            logger.warn('[Audit] creditJobChart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart
        if (auditChartInstance) {
            auditChartInstance.destroy();
            auditChartInstance = null;
        }

        // Prepare data
        const labels = jobEvents.map(e => {
            const date = new Date(e.timestamp);
            return date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        });

        const data = jobEvents.map(e => {
            // Map event types to Y values for visualization
            if (e.eventType === 'CreditConsumptionJobStarted') return 1;
            if (e.eventType === 'CreditConsumptionJobCompleted') return 2;
            if (e.eventType === 'CreditConsumptionJobFailed') return 0;
            return 1;
        });

        const colors = jobEvents.map(e => {
            if (e.eventType === 'CreditConsumptionJobCompleted') return 'rgba(40, 167, 69, 0.8)';
            if (e.eventType === 'CreditConsumptionJobFailed') return 'rgba(220, 53, 69, 0.8)';
            return 'rgba(23, 162, 184, 0.8)';
        });

        // Create chart
        auditChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Job Status',
                    data: data,
                    borderColor: 'rgba(32, 107, 196, 1)',
                    backgroundColor: colors,
                    borderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: colors,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const event = jobEvents[context.dataIndex];
                                const lines = [event.eventType];
                                if (event.metadata) {
                                    if (event.metadata.processedCount !== undefined) {
                                        lines.push(`Processed: ${event.metadata.processedCount} licenses`);
                                    }
                                    if (event.metadata.failedCount !== undefined && event.metadata.failedCount > 0) {
                                        lines.push(`Failed: ${event.metadata.failedCount}`);
                                    }
                                    if (event.metadata.totalCreditsDeducted !== undefined) {
                                        lines.push(`Credits deducted: ${event.metadata.totalCreditsDeducted}`);
                                    }
                                    if (event.metadata.durationSeconds !== undefined) {
                                        lines.push(`Duration: ${event.metadata.durationSeconds.toFixed(2)}s`);
                                    }
                                    if (event.metadata.error) {
                                        lines.push(`Error: ${event.metadata.error}`);
                                    }
                                }
                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 2.5,
                        ticks: {
                            stepSize: 1,
                            callback: function(value) {
                                if (value === 0) return 'Failed';
                                if (value === 1) return 'Started';
                                if (value === 2) return 'Completed';
                                return '';
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    };

    const loadEvents = async () => {
        try {
            logger.debug('[Audit] loadEvents called');
            setLoading(true);
            const currentOrg = orgContext.getCurrentOrg();
            
            logger.debug('[Audit] Current org:', currentOrg);
            
            if (!currentOrg?.orgId) {
                logger.warn('[Audit] No org selected');
                toast.show('Please select an organization', 'warning');
                setLoading(false);
                return;
            }

            // Fetch audit events from API
            logger.debug('[Audit] Fetching events for org:', currentOrg.orgId);

            const query = new URLSearchParams({
                maxResults: '500',
                days: String(rangeDays)
            });

            const res = await api.get(`/api/v1/orgs/${currentOrg.orgId}/audit?${query.toString()}`);
            logger.debug('[Audit] API response:', res);
            
            if (res.success && res.data) {
                const eventsData = res.data.events || [];
                logger.debug('[Audit] Events loaded:', eventsData.length);
                logger.debug('[Audit] Sample event with metadata:', eventsData.find(e => e.metadata));
                setEvents(eventsData);
                setHasMore(res.data.hasMore || false);
                logger.debug('[Audit] Events loaded:', res.data.events?.length || 0);
            } else {
                logger.error('[Audit] API returned error:', res.message);
                toast.show(res.message || 'Failed to load audit events', 'error');
            }
        } catch (error) {
            logger.error('[Audit] Error loading events:', error);
            toast.show('Failed to load audit events', 'error');
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...events];

        // Event type filter
        if (filters.eventType !== 'all') {
            filtered = filtered.filter(e => e.eventType === filters.eventType);
        }

        // Search filter (searches description, performedBy, targetId)
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(e =>
                e.description?.toLowerCase().includes(searchLower) ||
                e.performedBy?.toLowerCase().includes(searchLower) ||
                e.targetId?.toLowerCase().includes(searchLower) ||
                e.eventType?.toLowerCase().includes(searchLower)
            );
        }

        // Date filters
        if (filters.dateFrom) {
            const fromDate = new Date(filters.dateFrom);
            filtered = filtered.filter(e => new Date(e.timestamp) >= fromDate);
        }
        if (filters.dateTo) {
            const toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999); // End of day
            filtered = filtered.filter(e => new Date(e.timestamp) <= toDate);
        }

        setFilteredEvents(filtered);
    };

    const handleFilterChange = (key, value) => {
        setFilters({ ...filters, [key]: value });
        setPage(1);
    };

    const getEventIcon = (eventType) => {
        const iconMap = {
            'CreditConsumption': 'ti-coins',
            'CreditConsumptionJobStarted': 'ti-player-play',
            'CreditConsumptionJobCompleted': 'ti-check',
            'CreditConsumptionJobFailed': 'ti-x',
            'EmailSent': 'ti-mail',
            'EmailFailed': 'ti-mail-x',
            'DeviceRegistered': 'ti-device-desktop-plus',
            'DeviceBlocked': 'ti-ban',
            'DeviceDeleted': 'ti-trash',
            'DeviceDisabled': 'ti-device-desktop-off',
            'LicenseCreated': 'ti-key-plus',
            'LicenseRotated': 'ti-refresh',
            'LicenseDisabled': 'ti-key-off',
            'OrgCreated': 'ti-building-plus',
            'OrgUpdated': 'ti-building-pencil',
            'OrgDisabled': 'ti-building-off',
            'MemberAdded': 'ti-user-plus',
            'MemberRemoved': 'ti-user-minus',
            'RoleChanged': 'ti-user-cog'
        };
        return iconMap[eventType] || 'ti-circle';
    };

    const getEventColor = (eventType) => {
        const colorMap = {
            'CreditConsumptionJobStarted': 'info',
            'CreditConsumptionJobCompleted': 'success',
            'CreditConsumptionJobFailed': 'danger',
            'EmailSent': 'success',
            'EmailFailed': 'danger',
            'DeviceBlocked': 'warning',
            'DeviceDeleted': 'danger',
            'DeviceDisabled': 'warning',
            'LicenseDisabled': 'warning',
            'OrgDisabled': 'danger',
            'MemberRemoved': 'warning',
            'CreditConsumption': 'info'
        };
        return colorMap[eventType] || 'secondary';
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    const getUniqueEventTypes = () => {
        const types = new Set(
            events
                .map(e => e.eventType)
                .filter(type => type != null && type !== '')
        );
        return Array.from(types).sort();
    };

    const paginatedEvents = filteredEvents.slice((page - 1) * eventsPerPage, page * eventsPerPage);
    const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);

    try {
        if (loading) {
            return html`
                <div class="container-xl">
                    <div class="page-header d-print-none">
                        <h2 class="page-title">Audit Events</h2>
                    </div>
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                        <p class="text-muted mt-2">Loading audit events...</p>
                    </div>
                </div>
            `;
        }

    return html`
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">Audit Events</h2>
                        <div class="text-muted mt-1">
                            ${filteredEvents.length} ${filteredEvents.length === 1 ? 'event' : 'events'}
                            ${filters.eventType !== 'all' || filters.search || filters.dateFrom || filters.dateTo ? '(filtered)' : ''}
                        </div>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-icon" onClick=${loadEvents} title="Refresh">
                            <i class="ti ti-refresh"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Credit Consumption Job Heartbeat -->
            ${creditJobEvents.length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="ti ti-heartbeat me-2"></i>
                            Credit Consumption Job Heartbeat
                        </h3>
                        <div class="card-actions">
                            <span class="badge bg-info-lt">
                                ${creditJobEvents.length} job events
                            </span>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row mb-3">
                            <div class="col-md-3">
                                <div class="d-flex align-items-center">
                                    <span class="avatar avatar-sm bg-info-lt me-2">
                                        <i class="ti ti-player-play"></i>
                                    </span>
                                    <div>
                                        <div class="text-muted small">Started</div>
                                        <strong>${creditJobEvents.filter(e => e.eventType === 'CreditConsumptionJobStarted').length}</strong>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="d-flex align-items-center">
                                    <span class="avatar avatar-sm bg-success-lt me-2">
                                        <i class="ti ti-check"></i>
                                    </span>
                                    <div>
                                        <div class="text-muted small">Completed</div>
                                        <strong>${creditJobEvents.filter(e => e.eventType === 'CreditConsumptionJobCompleted').length}</strong>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="d-flex align-items-center">
                                    <span class="avatar avatar-sm bg-danger-lt me-2">
                                        <i class="ti ti-x"></i>
                                    </span>
                                    <div>
                                        <div class="text-muted small">Failed</div>
                                        <strong>${creditJobEvents.filter(e => e.eventType === 'CreditConsumptionJobFailed').length}</strong>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="d-flex align-items-center">
                                    <span class="avatar avatar-sm bg-azure-lt me-2">
                                        <i class="ti ti-clock"></i>
                                    </span>
                                    <div>
                                        <div class="text-muted small">Last Run</div>
                                        <strong class="small">${creditJobEvents.length > 0 ? formatTimestamp(creditJobEvents[creditJobEvents.length - 1].timestamp) : 'N/A'}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="height: 250px; position: relative;">
                            <canvas id="creditJobChart"></canvas>
                        </div>
                        <div class="mt-3 text-muted small">
                            <i class="ti ti-info-circle me-1"></i>
                            This chart shows the credit consumption job execution timeline. Expected interval: once per 24 hours.
                            Alert if gap exceeds 25 hours.
                        </div>
                    </div>
                </div>
            `}

            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row g-2">
                        <div class="col-md-3">
                            <label class="form-label">Event Type</label>
                            <select 
                                class="form-select"
                                value=${filters.eventType}
                                onChange=${(e) => handleFilterChange('eventType', e.target.value)}
                            >
                                <option value="all">All Events</option>
                                ${getUniqueEventTypes().map(type => html`
                                    <option value=${type}>${type}</option>
                                `)}
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">Time Range</label>
                            <select
                                class="form-select"
                                value=${rangeDays}
                                onChange=${(e) => setRangeDays(Number(e.target.value) || 90)}
                            >
                                <option value="7">Last 7 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                                <option value="180">Last 180 days</option>
                                <option value="365">Last 365 days</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Search</label>
                            <input 
                                type="text"
                                class="form-control"
                                placeholder="Search description, user, target..."
                                value=${filters.search}
                                onInput=${(e) => handleFilterChange('search', e.target.value)}
                            />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">From Date</label>
                            <input 
                                type="date"
                                class="form-control"
                                value=${filters.dateFrom}
                                onChange=${(e) => handleFilterChange('dateFrom', e.target.value)}
                            />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">To Date</label>
                            <input 
                                type="date"
                                class="form-control"
                                value=${filters.dateTo}
                                onChange=${(e) => handleFilterChange('dateTo', e.target.value)}
                            />
                        </div>
                    </div>
                    ${(filters.eventType !== 'all' || filters.search || filters.dateFrom || filters.dateTo) && html`
                        <div class="mt-2">
                            <button 
                                class="btn btn-sm btn-link"
                                onClick=${() => setFilters({ eventType: 'all', search: '', dateFrom: '', dateTo: '' })}
                            >
                                <i class="ti ti-x me-1"></i>
                                Clear Filters
                            </button>
                        </div>
                    `}
                </div>
            </div>

            <!-- Timeline -->
            ${paginatedEvents.length === 0 ? html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-history"></i></div>
                    <p class="empty-title">No audit events found</p>
                    <p class="empty-subtitle text-muted">
                        ${filters.eventType !== 'all' || filters.search || filters.dateFrom || filters.dateTo
                            ? 'Try adjusting your filters'
                            : 'Events will appear here as actions are performed'}
                    </p>
                </div>
            ` : html`
                <div class="card">
                    <div class="list-group list-group-flush">
                        ${paginatedEvents.map((event, idx) => {
                            const color = getEventColor(event.eventType);
                            const icon = getEventIcon(event.eventType);
                            
                            return html`
                                <div class="list-group-item">
                                    <div class="row align-items-center">
                                        <div class="col-auto">
                                            <span class=${"avatar avatar-sm bg-" + color + "-lt"}>
                                                <i class=${icon}></i>
                                            </span>
                                        </div>
                                        <div class="col">
                                            <div class="d-flex justify-content-between align-items-start">
                                                <div>
                                                    <strong>${event.eventType}</strong>
                                                    <div class="text-muted small">${event.description || 'No description'}</div>
                                                    ${event.performedBy && html`
                                                        <div class="text-muted small mt-1">
                                                            <i class="ti ti-user me-1"></i>
                                                            ${event.performedBy}
                                                        </div>
                                                    `}
                                                    ${event.targetId && html`
                                                        <div class="text-muted small">
                                                            <i class="ti ti-target me-1"></i>
                                                            ${event.targetType || 'Target'}: <code class="small">${event.targetId}</code>
                                                        </div>
                                                    `}
                                                    ${event.metadata && Object.keys(event.metadata).length > 0 && html`
                                                        <details class="mt-2">
                                                            <summary class="text-muted small" style="cursor: pointer;">
                                                                <i class="ti ti-info-circle me-1"></i>
                                                                View metadata
                                                            </summary>
                                                            <pre class="mt-2 p-2 bg-light rounded small">${JSON.stringify(event.metadata, null, 2)}</pre>
                                                        </details>
                                                    `}
                                                </div>
                                                <div class="text-end text-nowrap">
                                                    <div class="text-muted small">${formatTimestamp(event.timestamp)}</div>
                                                    <div class="text-muted" style="font-size: 0.7rem;">${new Date(event.timestamp).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        })}
                    </div>
                </div>

                <!-- Pagination -->
                ${totalPages > 1 && html`
                    <div class="d-flex justify-content-center mt-4">
                        <ul class="pagination">
                            <li class=${"page-item" + (page === 1 ? ' disabled' : '')}>
                                <button 
                                    class="page-link"
                                    onClick=${() => setPage(Math.max(1, page - 1))}
                                    disabled=${page === 1}
                                >
                                    <i class="ti ti-chevron-left"></i>
                                    Previous
                                </button>
                            </li>
                            ${[...Array(Math.min(10, totalPages))].map((_, i) => {
                                const pageNum = i + 1;
                                return html`
                                    <li class=${"page-item" + (page === pageNum ? ' active' : '')}>
                                        <button 
                                            class="page-link"
                                            onClick=${() => setPage(pageNum)}
                                        >
                                            ${pageNum}
                                        </button>
                                    </li>
                                `;
                            })}
                            ${totalPages > 10 && page > 5 && html`
                                <li class="page-item disabled">
                                    <span class="page-link">...</span>
                                </li>
                            `}
                            <li class=${"page-item" + (page === totalPages ? ' disabled' : '')}>
                                <button 
                                    class="page-link"
                                    onClick=${() => setPage(Math.min(totalPages, page + 1))}
                                    disabled=${page === totalPages}
                                >
                                    Next
                                    <i class="ti ti-chevron-right"></i>
                                </button>
                            </li>
                        </ul>
                    </div>
                `}
            `}
        </div>
    `;
    } catch (error) {
        logger.error('[Audit] Rendering error:', error);
        return html`
            <div class="container-xl">
                <div class="alert alert-danger">
                    <h4>Error rendering audit page</h4>
                    <p>${error.message}</p>
                    <button class="btn btn-primary mt-2" onClick=${() => window.location.reload()}>
                        Reload Page
                    </button>
                </div>
            </div>
        `;
    }
}
