/**
 * AuditAnalyticsService - Analytics calculations and aggregations
 * Extracted from audit.js
 */

import { getBaseType, getTypeKey } from '../utils/AuditEventUtils.js';

/**
 * Calculate event count by type
 */
export function calculateEventsByType(events) {
    const counts = {};
    
    events.forEach(evt => {
        const type = getBaseType(evt);
        counts[type] = (counts[type] || 0) + 1;
    });
    
    return Object.entries(counts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Calculate events over time (daily)
 */
export function calculateEventsOverTime(events, days = 7) {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    
    const dailyCounts = {};
    
    // Initialize all days with 0
    for (let i = 0; i <= days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        dailyCounts[dateKey] = 0;
    }
    
    // Count events per day
    events.forEach(evt => {
        const date = new Date(evt.timestamp || evt.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        if (dailyCounts.hasOwnProperty(dateKey)) {
            dailyCounts[dateKey]++;
        }
    });
    
    return Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate top users by activity
 */
export function calculateTopUsers(events, limit = 10) {
    const userCounts = {};
    
    events.forEach(evt => {
        const userId = evt.userId || evt.metadata?.userId || 'Unknown';
        userCounts[userId] = (userCounts[userId] || 0) + 1;
    });
    
    return Object.entries(userCounts)
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Calculate top devices by activity
 */
export function calculateTopDevices(events, limit = 10) {
    const deviceCounts = {};
    
    events.forEach(evt => {
        const deviceId = evt.deviceId || evt.metadata?.deviceId;
        if (deviceId) {
            deviceCounts[deviceId] = (deviceCounts[deviceId] || 0) + 1;
        }
    });
    
    return Object.entries(deviceCounts)
        .map(([deviceId, count]) => ({ deviceId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Calculate event distribution by hour of day
 */
export function calculateHourlyDistribution(events) {
    const hourCounts = Array(24).fill(0);
    
    events.forEach(evt => {
        const date = new Date(evt.timestamp || evt.createdAt);
        const hour = date.getHours();
        hourCounts[hour]++;
    });
    
    return hourCounts.map((count, hour) => ({ hour, count }));
}

/**
 * Calculate detailed event type breakdown
 */
export function calculateDetailedTypeBreakdown(events) {
    const breakdown = {};
    
    events.forEach(evt => {
        const typeKey = getTypeKey(evt);
        if (!breakdown[typeKey]) {
            breakdown[typeKey] = {
                count: 0,
                firstSeen: evt.timestamp || evt.createdAt,
                lastSeen: evt.timestamp || evt.createdAt
            };
        }
        
        breakdown[typeKey].count++;
        
        const timestamp = new Date(evt.timestamp || evt.createdAt);
        const first = new Date(breakdown[typeKey].firstSeen);
        const last = new Date(breakdown[typeKey].lastSeen);
        
        if (timestamp < first) {
            breakdown[typeKey].firstSeen = evt.timestamp || evt.createdAt;
        }
        if (timestamp > last) {
            breakdown[typeKey].lastSeen = evt.timestamp || evt.createdAt;
        }
    });
    
    return breakdown;
}

/**
 * Calculate summary statistics
 */
export function calculateSummaryStats(events) {
    if (!events || events.length === 0) {
        return {
            totalEvents: 0,
            uniqueTypes: 0,
            uniqueUsers: 0,
            uniqueDevices: 0,
            dateRange: null
        };
    }
    
    const types = new Set();
    const users = new Set();
    const devices = new Set();
    let earliest = null;
    let latest = null;
    
    events.forEach(evt => {
        types.add(getTypeKey(evt));
        
        if (evt.userId) users.add(evt.userId);
        if (evt.deviceId) devices.add(evt.deviceId);
        
        const timestamp = new Date(evt.timestamp || evt.createdAt);
        if (!earliest || timestamp < earliest) earliest = timestamp;
        if (!latest || timestamp > latest) latest = timestamp;
    });
    
    return {
        totalEvents: events.length,
        uniqueTypes: types.size,
        uniqueUsers: users.size,
        uniqueDevices: devices.size,
        dateRange: earliest && latest ? {
            from: earliest.toISOString(),
            to: latest.toISOString()
        } : null
    };
}
