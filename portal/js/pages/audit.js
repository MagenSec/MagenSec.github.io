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

export function AuditPage() {
    const [loading, setLoading] = useState(true);
    const [events, setEvents] = useState([]);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [filters, setFilters] = useState({
        eventType: 'all',
        search: '',
        dateFrom: '',
        dateTo: ''
    });
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const eventsPerPage = 50;

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
    }, [orgContext.getCurrentOrg()?.orgId]);

    useEffect(() => {
        applyFilters();
    }, [events, filters]);

    const loadEvents = async () => {
        try {
            setLoading(true);
            const currentOrg = orgContext.getCurrentOrg();
            
            if (!currentOrg?.orgId) {
                toast.show('Please select an organization', 'warning');
                return;
            }

            // Fetch audit events from API
            const res = await api.get(`/api/v1/orgs/${currentOrg.orgId}/audit`);
            if (res.success && res.data) {
                setEvents(res.data.events || []);
                setHasMore(res.data.hasMore || false);
            } else {
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
        const types = new Set(events.map(e => e.eventType));
        return Array.from(types).sort();
    };

    const paginatedEvents = filteredEvents.slice((page - 1) * eventsPerPage, page * eventsPerPage);
    const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);

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
                        <div class="col-md-3">
                            <label class="form-label">From Date</label>
                            <input 
                                type="date"
                                class="form-control"
                                value=${filters.dateFrom}
                                onChange=${(e) => handleFilterChange('dateFrom', e.target.value)}
                            />
                        </div>
                        <div class="col-md-3">
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
}
