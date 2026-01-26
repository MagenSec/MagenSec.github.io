/**
 * AuditFilterService - Event filtering and search utilities
 * Extracted from audit.js
 */

import { getEventName, getBaseType, getTypeKey } from './AuditEventUtils.js';

/**
 * Filter events by type
 */
export function filterByType(events, eventType) {
    if (!eventType || eventType === 'all') {
        return events;
    }
    
    return events.filter(evt => {
        const base = getBaseType(evt);
        const full = getTypeKey(evt);
        return base === eventType || full === eventType;
    });
}

/**
 * Filter events by search query
 */
export function filterBySearch(events, searchQuery) {
    if (!searchQuery || searchQuery.trim() === '') {
        return events;
    }
    
    const query = searchQuery.toLowerCase();
    
    return events.filter(evt => {
        const name = getEventName(evt).toLowerCase();
        const user = (evt.userId || evt.metadata?.userId || '').toLowerCase();
        const device = (evt.deviceId || evt.metadata?.deviceId || '').toLowerCase();
        const orgId = (evt.orgId || '').toLowerCase();
        const metadata = JSON.stringify(evt.metadata || {}).toLowerCase();
        
        return name.includes(query) || 
               user.includes(query) || 
               device.includes(query) || 
               orgId.includes(query) ||
               metadata.includes(query);
    });
}

/**
 * Filter events by date range
 */
export function filterByDateRange(events, dateFrom, dateTo) {
    if (!dateFrom && !dateTo) {
        return events;
    }
    
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();
    
    return events.filter(evt => {
        const timestamp = new Date(evt.timestamp || evt.createdAt).getTime();
        return timestamp >= fromTime && timestamp <= toTime;
    });
}

/**
 * Apply all filters to events
 */
export function applyFilters(events, filters) {
    let filtered = events;
    
    filtered = filterByType(filtered, filters.eventType);
    filtered = filterBySearch(filtered, filters.search);
    filtered = filterByDateRange(filtered, filters.dateFrom, filters.dateTo);
    
    return filtered;
}

/**
 * Get unique event types from events list
 */
export function getUniqueEventTypes(events) {
    const types = new Set();
    
    events.forEach(evt => {
        const base = getBaseType(evt);
        types.add(base);
    });
    
    return Array.from(types).sort();
}

/**
 * Group events by type
 */
export function groupEventsByType(events) {
    const grouped = {};
    
    events.forEach(evt => {
        const typeKey = getTypeKey(evt);
        if (!grouped[typeKey]) {
            grouped[typeKey] = [];
        }
        grouped[typeKey].push(evt);
    });
    
    return grouped;
}

/**
 * Group events by date
 */
export function groupEventsByDate(events) {
    const grouped = {};
    
    events.forEach(evt => {
        const date = new Date(evt.timestamp || evt.createdAt);
        const dateKey = date.toLocaleDateString();
        
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        grouped[dateKey].push(evt);
    });
    
    return grouped;
}
