/**
 * AuditEventUtils - Event type and classification utilities
 * Extracted from audit.js
 */

/**
 * Get base event type (before colon)
 */
export function getBaseType(evtOrType) {
    if (!evtOrType) return 'Unknown';
    const raw = typeof evtOrType === 'string' ? evtOrType : evtOrType.eventType;
    if (!raw) return 'Unknown';
    return raw.split(':')[0];
}

/**
 * Get full event name from various fields
 */
export function getEventName(evt) {
    return evt?.eventType || evt?.metadata?.eventType || evt?.metadata?.EventType || '';
}

/**
 * Check if event is notification-related
 */
export function isNotificationEvent(evt) {
    const nameLower = getEventName(evt).toLowerCase();
    const metaLower = (evt?.metadata?.emailType || evt?.metadata?.EmailType || 
                       evt?.metadata?.type || evt?.metadata?.Type || '').toLowerCase();
    const haystack = `${nameLower} ${metaLower}`;
    
    return [
        'email',
        'notification',
        'welcome',
        'creditslow',
        'creditlow',
        'credits low',
        'licenseexpired',
        'license expired',
        'licenseexpiringsoon',
        'expiry',
        'expiring'
    ].some(k => haystack.includes(k));
}

/**
 * Get type key for grouping (includes subtype)
 */
export function getTypeKey(evt) {
    const base = evt?.eventType || 'Unknown';
    const sub = evt?.subType || evt?.metadata?.subType || evt?.metadata?.SubType;
    return sub ? `${base}:${sub}` : base;
}

/**
 * Get formatted type label for display
 */
export function getTypeLabel(evt) {
    const base = evt?.eventType || 'Unknown';
    const sub = evt?.subType || evt?.metadata?.subType || evt?.metadata?.SubType;
    return sub ? `${base} • ${sub}` : base;
}

/**
 * Get event icon based on type
 */
export function getEventIcon(eventType) {
    const base = getBaseType(eventType);
    
    switch (base) {
        case 'User': return '👤';
        case 'Device': return '💻';
        case 'License': return '🔑';
        case 'Organization': return '🏢';
        case 'Audit': return '📋';
        case 'Email': return '📧';
        case 'Notification': return '🔔';
        case 'Credit': return '💳';
        default: return '📌';
    }
}

/**
 * Get event color class based on type
 */
export function getEventColorClass(eventType) {
    const base = getBaseType(eventType);
    
    switch (base) {
        case 'User': return 'bg-primary';
        case 'Device': return 'bg-info';
        case 'License': return 'bg-warning';
        case 'Organization': return 'bg-success';
        case 'Audit': return 'bg-secondary';
        case 'Email': return 'bg-purple';
        case 'Notification': return 'bg-pink';
        case 'Credit': return 'bg-orange';
        default: return 'bg-secondary';
    }
}
